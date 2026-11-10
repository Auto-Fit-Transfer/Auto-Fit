-- A confirmation card and its server-owned action must commit together.
-- The API never exposes the pending payload to the app.
create function public.validate_exercise_chat_pending_action()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.chats c
    where c.chat_id = new.chat_id and c.user_id = new.user_id
  ) or not exists (
    select 1 from public.chat_messages m
    where m.chat_id = new.chat_id and m.user_id = new.user_id
      and m.client_message_id = new.source_client_message_id
      and m.sender_type = 'assistant'
      and m.pending_action_id = new.pending_action_id
  ) then
    raise exception 'PENDING_ACTION_SOURCE_MISMATCH';
  end if;
  if not exists (
    select 1 from public.exercise_sessions s
    where s.exercise_session_id = new.session_id and s.user_id = new.user_id
      and s.plan_session_id = new.plan_session_id
  ) or (
    new.exercise_item_id is not null and not exists (
      select 1 from public.exercise_items i
      join public.exercise_sessions s
        on s.exercise_session_id = new.session_id
      where i.exercise_item_id = new.exercise_item_id
        and i.plan_session_id = new.plan_session_id
        and i.exercise_recommendation_id = s.exercise_recommendation_id
    )
  ) then
    raise exception 'PENDING_ACTION_SESSION_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger validate_exercise_chat_pending_action
  before insert or update on public.exercise_chat_pending_actions
  for each row execute function public.validate_exercise_chat_pending_action();

revoke all on function public.validate_exercise_chat_pending_action()
  from public, anon, authenticated;

create function public.save_exercise_chat_proposal(
  p_user_id uuid,
  p_chat_id uuid,
  p_client_message_id uuid,
  p_content text,
  p_answer jsonb,
  p_pending_id uuid,
  p_payload jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_exchange jsonb;
  v_session public.exercise_sessions%rowtype;
begin
  if p_user_id is null or p_chat_id is null or p_client_message_id is null
     or p_pending_id is null or jsonb_typeof(p_answer) is distinct from 'object'
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_answer->>'action' is distinct from 'confirm_exercise_adjustment'
     or p_answer->>'action_status' is distinct from 'awaiting_confirmation'
     or p_answer->>'requires_backend_apply' is distinct from 'false'
     or p_answer->>'pending_action_id' is distinct from p_pending_id::text
     or p_payload->>'action' is distinct from 'exercise_session_adjust'
     or coalesce(p_payload->>'adjustment_strategy', '') not in
        ('reduce_remaining_volume', 'skip_current_and_reduce_remaining')
     or coalesce(p_payload->>'symptom_type', '') not in
        ('pain', 'fatigue', 'dizziness', 'breathing', 'other')
     or jsonb_typeof(p_payload->'body_areas') is distinct from 'array'
     or jsonb_array_length(p_payload->'body_areas') > 10 then
    raise exception 'PENDING_ACTION_PAYLOAD_MISMATCH';
  end if;

  -- save_chat_exchange locks the chat and request ID. A concurrent replay
  -- returns the original card and does not create another pending action.
  v_exchange := public.save_chat_exchange(
    p_user_id, p_chat_id, p_client_message_id, p_content, p_answer
  );
  if (v_exchange->>'is_replay')::boolean then
    return v_exchange;
  end if;

  select * into v_session from public.exercise_sessions s
  where s.exercise_session_id = (p_payload->>'session_id')::uuid
    and s.user_id = p_user_id
    and s.plan_session_id = (p_payload->>'plan_session_id')::uuid
    and s.status = 'in_progress'
  for share;
  if not found or v_session.updated_at is distinct from
      (p_payload->>'session_version')::timestamptz then
    raise exception 'SESSION_VERSION_CONFLICT';
  end if;
  if p_payload->>'adjustment_strategy' = 'skip_current_and_reduce_remaining'
     and p_payload->>'exercise_item_id' is null then
    raise exception 'PENDING_ACTION_ITEM_MISMATCH';
  end if;

  insert into public.exercise_chat_pending_actions (
    pending_action_id, user_id, chat_id, source_client_message_id,
    session_id, plan_session_id, exercise_item_id, session_version, payload
  ) values (
    p_pending_id, p_user_id, p_chat_id, p_client_message_id,
    v_session.exercise_session_id, v_session.plan_session_id,
    (p_payload->>'exercise_item_id')::uuid,
    p_payload->>'session_version', p_payload
  );
  return v_exchange;
end;
$$;

revoke all on function public.save_exercise_chat_proposal(uuid,uuid,uuid,text,jsonb,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_exercise_chat_proposal(uuid,uuid,uuid,text,jsonb,uuid,jsonb)
  to service_role;
