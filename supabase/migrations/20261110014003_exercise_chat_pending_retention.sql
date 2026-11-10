-- Keep the existing cron entry and chat-message purge behavior. Pending
-- confirmation cards can contain copies of chat text, so expire them too.
alter function autofit_maintenance.purge_expired_chat_messages()
  rename to purge_expired_chat_messages_core;

create function autofit_maintenance.purge_expired_chat_messages()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_chat_result jsonb;
  v_deleted_pending bigint;
begin
  v_chat_result := autofit_maintenance.purge_expired_chat_messages_core();
  if coalesce((v_chat_result ->> 'skipped')::boolean, false) then
    return v_chat_result || jsonb_build_object('deleted_pending_actions', 0);
  end if;

  delete from public.exercise_chat_pending_actions
  where created_at <= transaction_timestamp() - interval '720 hours';
  get diagnostics v_deleted_pending = row_count;

  return v_chat_result || jsonb_build_object(
    'deleted_pending_actions', v_deleted_pending
  );
end;
$$;

revoke all on function autofit_maintenance.purge_expired_chat_messages()
  from public, anon, authenticated, service_role;
