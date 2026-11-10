alter table public.exercise_sessions add column chat_stop_event_key uuid;
create unique index exercise_sessions_chat_stop_event_uidx
  on public.exercise_sessions(user_id, chat_stop_event_key)
  where chat_stop_event_key is not null;

-- The event is inserted separately. A failed event insert must not make the
-- current workout continue, and a failed stop must not roll back the event.
create function public.stop_exercise_chat_session(
  p_user_id uuid,
  p_session_id uuid,
  p_plan_session_id uuid,
  p_session_version text,
  p_event_key uuid
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_completed_count integer;
  v_skipped_count integer;
begin
  if p_user_id is null or p_session_id is null or p_plan_session_id is null
     or nullif(p_session_version, '') is null or p_event_key is null then
    raise exception 'INVALID_EXERCISE_CHAT_STOP';
  end if;
  select * into v_session from public.exercise_sessions
  where exercise_session_id = p_session_id and user_id = p_user_id
  for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status = 'stopped' and v_session.chat_stop_event_key = p_event_key then
    return jsonb_build_object('session', to_jsonb(v_session));
  end if;
  if v_session.status <> 'in_progress' or v_session.plan_session_id is distinct from p_plan_session_id then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;
  if v_session.updated_at is distinct from p_session_version::timestamptz then
    raise exception 'SESSION_VERSION_CONFLICT';
  end if;

  insert into public.exercise_logs (
    user_id, exercise_item_id, exercise_name, performed_at,
    duration_minutes, calories_burned, intensity, completed, note,
    exercise_session_id, skipped, skip_reason
  )
  select p_user_id, i.exercise_item_id, i.exercise_name, now(),
         0, 0, i.intensity, false, null,
         p_session_id, true, '운동 중 상태 변화로 종료'
  from public.exercise_items i
  where i.plan_session_id = p_plan_session_id
    and i.exercise_recommendation_id = v_session.exercise_recommendation_id
    and not exists (
      select 1 from public.exercise_logs l
      where l.exercise_session_id = p_session_id and l.exercise_item_id = i.exercise_item_id
    )
  on conflict (exercise_session_id, exercise_item_id)
    where exercise_session_id is not null and exercise_item_id is not null
    do nothing;

  select count(*) filter (where completed and not skipped)::integer,
         count(*) filter (where skipped)::integer
    into v_completed_count, v_skipped_count
  from public.exercise_logs
  where exercise_session_id = p_session_id and user_id = p_user_id;

  update public.exercise_sessions
  set status = 'stopped', completed_at = now(),
      completed_item_count = v_completed_count,
      skipped_item_count = v_skipped_count,
      completion_rate = round((v_completed_count::numeric / greatest(planned_item_count, 1)) * 100, 2),
      chat_stop_event_key = p_event_key,
      updated_at = greatest(clock_timestamp(), v_session.updated_at + interval '1 microsecond')
  where exercise_session_id = p_session_id
  returning * into v_session;

  update public.exercise_recommendations
  set status = 'completed'
  where exercise_recommendation_id = v_session.exercise_recommendation_id
    and user_id = p_user_id
    and v_session.plan_session_id is not null
    and not exists (
      select 1 from public.exercise_plan_sessions as planned
      where planned.exercise_recommendation_id = v_session.exercise_recommendation_id
        and not exists (
          select 1 from public.exercise_sessions as finished
          where finished.plan_session_id = planned.exercise_plan_session_id
            and finished.user_id = p_user_id
            and finished.status in ('completed', 'stopped', 'skipped')
        )
    );
  return jsonb_build_object('session', to_jsonb(v_session));
end;
$$;

revoke all on function public.stop_exercise_chat_session(uuid,uuid,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.stop_exercise_chat_session(uuid,uuid,uuid,text,uuid)
  to service_role;

-- Confirm/cancel and the resulting chat exchange share one transaction. The
-- pending row and session row are locked so a stale or duplicate approval
-- cannot modify a later workout.
create function public.resolve_exercise_chat_pending_action(
  p_user_id uuid,
  p_chat_id uuid,
  p_pending_action_id uuid,
  p_idempotency_key uuid,
  p_decision text,
  p_ai_response jsonb,
  p_answer jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_pending public.exercise_chat_pending_actions%rowtype;
  v_session public.exercise_sessions%rowtype;
  v_item public.exercise_items%rowtype;
  v_discomfort public.exercise_discomfort_logs%rowtype;
  v_adjusted_items jsonb := '[]'::jsonb;
  v_plan_items jsonb := '[]'::jsonb;
  v_exchange jsonb;
  v_result jsonb;
  v_severity smallint;
  v_body_areas jsonb;
  v_completed_count integer;
  v_skipped_count integer;
begin
  if p_user_id is null or p_chat_id is null or p_pending_action_id is null
     or p_idempotency_key is null or p_decision not in ('confirm', 'cancel')
     or jsonb_typeof(p_ai_response) is distinct from 'object'
     or jsonb_typeof(p_answer) is distinct from 'object' then
    raise exception 'INVALID_PENDING_ACTION_REQUEST';
  end if;

  select * into v_pending from public.exercise_chat_pending_actions
  where pending_action_id = p_pending_action_id
    and user_id = p_user_id and chat_id = p_chat_id
  for update;
  if not found then raise exception 'PENDING_ACTION_NOT_FOUND'; end if;
  if v_pending.consumed_at is not null then
    if v_pending.idempotency_key = p_idempotency_key
       and ((p_decision = 'confirm' and v_pending.decision = 'confirmed')
            or (p_decision = 'cancel' and v_pending.decision = 'cancelled')) then
      return v_pending.result;
    end if;
    raise exception 'PENDING_ACTION_CONSUMED';
  end if;
  if v_pending.expires_at <= now() then raise exception 'PENDING_ACTION_EXPIRED'; end if;
  if not exists (select 1 from public.chats
                 where chat_id = p_chat_id and user_id = p_user_id and status = 'active') then
    raise exception 'CHAT_NOT_FOUND';
  end if;

  select * into v_session from public.exercise_sessions
  where exercise_session_id = v_pending.session_id and user_id = p_user_id
  for update;
  if not found or v_session.status <> 'in_progress'
     or v_session.plan_session_id is distinct from v_pending.plan_session_id then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;
  if v_session.updated_at is distinct from v_pending.session_version::timestamptz then
    raise exception 'SESSION_VERSION_CONFLICT';
  end if;
  if v_pending.exercise_item_id is not null and not exists (
    select 1 from public.exercise_items
    where exercise_item_id = v_pending.exercise_item_id
      and plan_session_id = v_pending.plan_session_id
      and exercise_recommendation_id = v_session.exercise_recommendation_id
  ) then
    raise exception 'PENDING_ACTION_ITEM_MISMATCH';
  end if;
  if v_pending.payload->>'action' is distinct from 'exercise_session_adjust'
     or v_pending.payload->>'session_id' is distinct from v_pending.session_id::text
     or v_pending.payload->>'plan_session_id' is distinct from v_pending.plan_session_id::text
     or v_pending.payload->>'session_version' is distinct from v_pending.session_version
     or v_pending.payload->>'exercise_item_id' is distinct from v_pending.exercise_item_id::text then
    raise exception 'PENDING_ACTION_PAYLOAD_MISMATCH';
  end if;

  if p_ai_response->>'intent' is distinct from 'exercise_session_discomfort'
     or p_answer->>'content' is distinct from p_ai_response->>'message'
     or p_answer->>'action' is distinct from p_ai_response->>'action'
     or p_answer->>'action_status' is distinct from p_ai_response->>'action_status'
     or p_answer->>'requires_backend_apply' is distinct from p_ai_response->>'requires_backend_apply'
     or p_answer->>'pending_action_id' is distinct from p_pending_action_id::text then
    raise exception 'AI_ACTION_MISMATCH';
  end if;

  if p_decision = 'confirm' then
    if p_ai_response->>'action' is distinct from 'exercise_session_adjust'
       or p_ai_response->>'action_status' is distinct from 'ready_for_backend_apply'
       or p_ai_response->>'requires_backend_apply' is distinct from 'true'
       or p_ai_response->'data'->>'session_id' is distinct from v_pending.session_id::text
       or p_ai_response->'data'->>'plan_session_id' is distinct from v_pending.plan_session_id::text
       or p_ai_response->'data'->>'exercise_item_id' is distinct from v_pending.exercise_item_id::text
       or p_ai_response->'data'->>'session_version' is distinct from v_pending.session_version
       or p_ai_response->'data'->>'adjustment_strategy'
            is distinct from v_pending.payload->>'adjustment_strategy'
       or p_ai_response->'data'->'discomfort_event'->>'symptom_type'
            is distinct from v_pending.payload->>'symptom_type'
       or p_ai_response->'data'->'discomfort_event'->'body_areas'
            is distinct from v_pending.payload->'body_areas'
       or p_ai_response->'data'->'discomfort_event'->>'action_taken' is distinct from 'adjust' then
      raise exception 'AI_ACTION_MISMATCH';
    end if;
    if v_pending.payload->>'adjustment_strategy'
         not in ('reduce_remaining_volume', 'skip_current_and_reduce_remaining')
       or v_pending.payload->>'symptom_type'
         not in ('pain', 'fatigue', 'dizziness', 'breathing', 'other')
       or jsonb_typeof(v_pending.payload->'body_areas') is distinct from 'array' then
      raise exception 'PENDING_ACTION_PAYLOAD_MISMATCH';
    end if;
    v_severity := (v_pending.payload->>'severity')::smallint;
    v_body_areas := v_pending.payload->'body_areas';
    if v_severity is not null and v_severity not between 0 and 10 then
      raise exception 'PENDING_ACTION_PAYLOAD_MISMATCH';
    end if;
    if p_ai_response->'data'->'discomfort_event'->>'severity'
         is distinct from v_pending.payload->>'severity' then
      raise exception 'AI_ACTION_MISMATCH';
    end if;

    if v_pending.payload->>'adjustment_strategy' = 'skip_current_and_reduce_remaining' then
      if v_pending.exercise_item_id is null then
        raise exception 'PENDING_ACTION_ITEM_MISMATCH';
      end if;
      select * into v_item from public.exercise_items
      where exercise_item_id = v_pending.exercise_item_id
        and plan_session_id = v_pending.plan_session_id
        and exercise_recommendation_id = v_session.exercise_recommendation_id;
      if not found or exists (
        select 1 from public.exercise_logs
        where exercise_session_id = v_session.exercise_session_id
          and exercise_item_id = v_item.exercise_item_id
      ) then
        raise exception 'PENDING_ACTION_ITEM_MISMATCH';
      end if;
      insert into public.exercise_logs (
        user_id, exercise_item_id, exercise_name, performed_at,
        duration_minutes, calories_burned, intensity, completed, note,
        exercise_session_id, skipped, skip_reason
      ) values (
        p_user_id, v_item.exercise_item_id, v_item.exercise_name, now(),
        0, 0, v_item.intensity, false, null,
        v_session.exercise_session_id, true, '운동 중 불편감으로 건너뜀'
      );
    end if;

    with adjusted as (
      update public.exercise_items i
      set intensity = case i.intensity
            when 'high' then 'moderate'
            when 'moderate' then 'low'
            else i.intensity
          end,
          duration_minutes = case when i.duration_minutes is null then null
            else greatest(1, ceil(i.duration_minutes * 0.8)::integer) end,
          target_duration_seconds = case when i.target_duration_seconds is null then null
            else greatest(1, ceil(i.target_duration_seconds * 0.8)::integer) end,
          sets = case when i.sets is null then null
            else greatest(1, ceil(i.sets * 0.8)::integer) end,
          repetitions = case when i.repetitions is null then null
            else greatest(1, ceil(i.repetitions * 0.8)::integer) end,
          target_weight_kg = case when i.target_weight_kg is null then null
            else round(i.target_weight_kg * 0.8, 2) end,
          calories_burned = case when i.calories_burned is null then null
            else round(i.calories_burned * 0.8, 2) end
      where i.plan_session_id = v_pending.plan_session_id
        and i.exercise_recommendation_id = v_session.exercise_recommendation_id
        and not exists (
          select 1 from public.exercise_logs l
          where l.exercise_session_id = v_session.exercise_session_id
            and l.exercise_item_id = i.exercise_item_id
        )
      returning i.*
    )
    select coalesce(jsonb_agg(to_jsonb(a) order by a.sequence_order), '[]'::jsonb)
      into v_adjusted_items from adjusted a;

    insert into public.exercise_discomfort_logs (
      exercise_session_id, exercise_item_id, user_id, symptom_type,
      severity, body_areas, action_taken
    ) values (
      v_session.exercise_session_id, v_pending.exercise_item_id, p_user_id,
      v_pending.payload->>'symptom_type', v_severity, v_body_areas, 'adjust'
    ) returning * into v_discomfort;

    select count(*) filter (where completed and not skipped)::integer,
           count(*) filter (where skipped)::integer
      into v_completed_count, v_skipped_count
    from public.exercise_logs
    where exercise_session_id = v_session.exercise_session_id and user_id = p_user_id;
    update public.exercise_sessions
    set completed_item_count = v_completed_count,
        skipped_item_count = v_skipped_count,
        completion_rate = round((v_completed_count::numeric / greatest(planned_item_count, 1)) * 100, 2),
        updated_at = greatest(clock_timestamp(), v_session.updated_at + interval '1 microsecond')
    where exercise_session_id = v_session.exercise_session_id
    returning * into v_session;
  else
    if p_ai_response->>'action' is distinct from 'exercise_adjustment_cancelled'
       or p_ai_response->>'action_status' is distinct from 'completed'
       or p_ai_response->>'requires_backend_apply' is distinct from 'false' then
      raise exception 'AI_ACTION_MISMATCH';
    end if;
  end if;

  v_exchange := public.save_chat_exchange(
    p_user_id, p_chat_id, p_idempotency_key,
    case when p_decision = 'confirm' then '네' else '취소' end,
    p_answer
  );
  select coalesce(jsonb_agg(to_jsonb(i) order by i.sequence_order), '[]'::jsonb)
    into v_plan_items
  from public.exercise_items i
  where i.plan_session_id = v_pending.plan_session_id
    and i.exercise_recommendation_id = v_session.exercise_recommendation_id;
  v_result := jsonb_build_object(
    'is_replay', false,
    'chat', v_exchange->'chat',
    'user_message', v_exchange->'user_message',
    'assistant_message', v_exchange->'assistant_message',
    'session', to_jsonb(v_session),
    'items', v_plan_items,
    'adjusted_items', v_adjusted_items,
    'discomfort_event', case when p_decision = 'confirm' then to_jsonb(v_discomfort) else null end
  );
  update public.exercise_chat_pending_actions
  set consumed_at = now(),
      decision = case when p_decision = 'confirm' then 'confirmed' else 'cancelled' end,
      idempotency_key = p_idempotency_key,
      result = v_result
  where pending_action_id = p_pending_action_id;
  return v_result;
end;
$$;

revoke all on function public.resolve_exercise_chat_pending_action(uuid,uuid,uuid,uuid,text,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.resolve_exercise_chat_pending_action(uuid,uuid,uuid,uuid,text,jsonb,jsonb)
  to service_role;
