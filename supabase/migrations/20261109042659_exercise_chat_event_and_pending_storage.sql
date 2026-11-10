-- A stop report is durable even when there is no active session to change.
alter table public.exercise_discomfort_logs
  alter column exercise_session_id drop not null,
  add column chat_event_key uuid,
  add constraint exercise_discomfort_session_or_chat_event_check
    check (exercise_session_id is not null or chat_event_key is not null),
  add constraint exercise_discomfort_chat_event_stop_check
    check (chat_event_key is null or action_taken is not distinct from 'stop');

create unique index exercise_discomfort_chat_event_key_uidx
  on public.exercise_discomfort_logs(user_id, chat_event_key)
  where chat_event_key is not null;

create function public.reject_exercise_chat_event_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.chat_event_key is not null
       and current_user not in ('postgres', 'service_role') then
      raise exception 'Only the API service may create exercise chat safety events';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and (
       old.chat_event_key is not null or new.chat_event_key is not null
     ) then
    raise exception 'Exercise chat safety events are append-only';
  end if;
  if tg_op = 'DELETE' then
    -- Account deletion purges rows as this SECURITY DEFINER function's owner.
    if old.chat_event_key is not null and current_user is distinct from (
      select pg_get_userbyid(p.proowner) from pg_proc p
      where p.oid = 'autofit_integrity.purge_account_rows(text,text,uuid,uuid,integer)'::regprocedure
    ) then
      raise exception 'Exercise chat safety events are append-only';
    end if;
    return old;
  end if;
  return new;
end;
$$;

create trigger reject_exercise_chat_event_mutation
  before insert or update or delete on public.exercise_discomfort_logs
  for each row execute function public.reject_exercise_chat_event_mutation();

-- TRUNCATE bypasses row triggers and RLS; old schema grants it to authenticated.
revoke truncate, trigger on public.exercise_discomfort_logs from anon, authenticated;
revoke update, delete on public.exercise_discomfort_logs from service_role;

revoke all on function public.reject_exercise_chat_event_mutation()
  from public, anon, authenticated;

-- Only the API service role can create an event. The key is the chat request ID,
-- so replaying a request cannot produce a second safety report.
create function public.record_exercise_chat_event(
  p_user_id uuid,
  p_chat_id uuid,
  p_event_key uuid,
  p_session_id uuid,
  p_item_id uuid,
  p_symptom_type text,
  p_severity smallint,
  p_body_areas jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_event public.exercise_discomfort_logs%rowtype;
begin
  if p_user_id is null or p_chat_id is null or p_event_key is null
     or p_symptom_type not in ('pain', 'fatigue', 'dizziness', 'breathing', 'other')
     or (p_severity is not null and p_severity not between 0 and 10)
     or jsonb_typeof(coalesce(p_body_areas, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid exercise chat event';
  end if;

  select * into v_event from public.exercise_discomfort_logs
  where user_id = p_user_id and chat_event_key = p_event_key;
  if found then
    if v_event.exercise_session_id is distinct from p_session_id
       or v_event.exercise_item_id is distinct from p_item_id
       or v_event.symptom_type is distinct from p_symptom_type
       or v_event.severity is distinct from p_severity
       or v_event.body_areas is distinct from coalesce(p_body_areas, '[]'::jsonb)
       or v_event.action_taken is distinct from 'stop' then
      raise exception 'Exercise chat event key conflict';
    end if;
    return to_jsonb(v_event);
  end if;

  if not exists (select 1 from public.chats
                 where chat_id = p_chat_id and user_id = p_user_id and status = 'active') then
    raise exception 'Active chat not found';
  end if;
  if p_session_id is null then
    if p_item_id is not null then raise exception 'Item requires a session'; end if;
  else
    select * into v_session from public.exercise_sessions
    where exercise_session_id = p_session_id and user_id = p_user_id;
    if not found then raise exception 'Exercise session not owned by user'; end if;
    if p_item_id is not null and not exists (
      select 1 from public.exercise_items
      where exercise_item_id = p_item_id
        and exercise_recommendation_id = v_session.exercise_recommendation_id
        and plan_session_id = v_session.plan_session_id
    ) then
      raise exception 'Exercise item does not belong to the current plan session';
    end if;
  end if;

  insert into public.exercise_discomfort_logs (
    exercise_session_id, exercise_item_id, user_id, symptom_type,
    severity, body_areas, action_taken, chat_event_key
  ) values (
    p_session_id, p_item_id, p_user_id, p_symptom_type,
    p_severity, coalesce(p_body_areas, '[]'::jsonb), 'stop', p_event_key
  ) on conflict (user_id, chat_event_key) where chat_event_key is not null
      do nothing;

  select * into v_event from public.exercise_discomfort_logs
  where user_id = p_user_id and chat_event_key = p_event_key;
  if v_event.exercise_session_id is distinct from p_session_id
     or v_event.exercise_item_id is distinct from p_item_id
     or v_event.symptom_type is distinct from p_symptom_type
     or v_event.severity is distinct from p_severity
     or v_event.body_areas is distinct from coalesce(p_body_areas, '[]'::jsonb) then
    raise exception 'Exercise chat event key conflict';
  end if;
  return to_jsonb(v_event);
end;
$$;

revoke all on function public.record_exercise_chat_event(uuid,uuid,uuid,uuid,uuid,text,smallint,jsonb)
  from public, anon, authenticated;
grant execute on function public.record_exercise_chat_event(uuid,uuid,uuid,uuid,uuid,text,smallint,jsonb)
  to service_role;

create table public.exercise_chat_pending_actions (
  pending_action_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  chat_id uuid not null,
  source_client_message_id uuid not null,
  session_id uuid not null,
  plan_session_id uuid not null,
  exercise_item_id uuid,
  session_version text not null check (length(session_version) between 1 and 100),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  decision text check (decision in ('confirmed', 'cancelled')),
  idempotency_key uuid,
  result jsonb,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((consumed_at is null and decision is null and idempotency_key is null)
         or (consumed_at is not null and decision is not null and idempotency_key is not null))
);

create unique index exercise_chat_pending_source_uidx
  on public.exercise_chat_pending_actions(user_id, chat_id, source_client_message_id);
create unique index exercise_chat_pending_idempotency_uidx
  on public.exercise_chat_pending_actions(user_id, idempotency_key)
  where idempotency_key is not null;
create index exercise_chat_pending_active_idx
  on public.exercise_chat_pending_actions(user_id, chat_id, expires_at)
  where consumed_at is null;

alter table public.exercise_chat_pending_actions enable row level security;
create trigger zzz_check_account_writable
  before insert or update on public.exercise_chat_pending_actions
  for each row execute function autofit_integrity.check_account_writable();
revoke all on public.exercise_chat_pending_actions from public, anon, authenticated;
grant select, insert, update on public.exercise_chat_pending_actions to service_role;
