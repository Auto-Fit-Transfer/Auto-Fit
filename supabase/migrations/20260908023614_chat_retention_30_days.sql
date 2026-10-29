-- 30-day chat retention maintenance function.
-- No foreign keys. No immediate purge or cron activation in this file.
create schema if not exists autofit_maintenance;
revoke all on schema autofit_maintenance from public, anon, authenticated, service_role;

create or replace function autofit_maintenance.purge_expired_chat_messages()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  cutoff timestamptz := transaction_timestamp() - interval '720 hours';
  room record;
  removed_count bigint := 0;
  batch_count bigint;
  cleared_count bigint := 0;
  changed_count bigint;
begin
  -- A concurrent/manual invocation must not double-process rooms.
  if not pg_try_advisory_xact_lock(827104, 30) then
    return jsonb_build_object('skipped', true, 'deleted_messages', 0, 'cleared_titles', 0);
  end if;
  -- Same row lock as save_chat_exchange. Busy rooms wait for the next run.
  for room in
    select c.chat_id, c.user_id from public.chats c
    where exists (
      select 1 from public.chat_messages m
      where m.chat_id = c.chat_id and m.user_id = c.user_id and m.created_at <= cutoff
    )
    order by c.chat_id limit 100 for update of c skip locked
  loop
    with removed as (
      delete from public.chat_messages m
      where m.chat_id = room.chat_id and m.user_id = room.user_id
        and m.created_at <= cutoff
        -- Preserve the request/answer pair at the 1-microsecond boundary.
        and (m.client_message_id is null or not exists (
          select 1 from public.chat_messages peer
          where peer.user_id = m.user_id and peer.client_message_id = m.client_message_id
            and peer.created_at > cutoff
        ))
      returning m.sender_type, m.content
    ), cleared as (
      update public.chats c set title = null
      where c.chat_id = room.chat_id and c.user_id = room.user_id
        and exists (select 1 from removed r
          where r.sender_type = 'user' and c.title = left(r.content, 100))
      returning c.chat_id
    )
    select (select count(*) from removed), (select count(*) from cleared)
      into batch_count, changed_count;
    removed_count := removed_count + batch_count;
    cleared_count := cleared_count + changed_count;
  end loop;

  -- Legacy orphan messages also expire; no foreign keys are introduced.
  with removed as (
    delete from public.chat_messages m
    where m.created_at <= cutoff
      and not exists (select 1 from public.chats c
        where c.chat_id = m.chat_id and c.user_id = m.user_id)
      and (m.client_message_id is null or not exists (
        select 1 from public.chat_messages peer
        where peer.user_id = m.user_id and peer.client_message_id = m.client_message_id
          and peer.created_at > cutoff
      ))
    returning m.message_id
  ) select count(*) into batch_count from removed;
  return jsonb_build_object('skipped', false,
    'deleted_messages', removed_count + batch_count, 'cleared_titles', cleared_count);
end;
$$;
revoke all on function autofit_maintenance.purge_expired_chat_messages()
  from public, anon, authenticated, service_role;

-- Only the migration owner (postgres) runs this maintenance function.
-- Existing chat_messages_created_at_idx supports age-based discovery.

create extension if not exists pg_cron;
