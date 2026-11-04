-- Only the currently implemented notification target, report, is supported.
create function autofit_integrity.check_notification_target()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
  if new.related_id is null and new.related_type is null then return new; end if;
  if new.related_id is null or new.related_type is distinct from 'report' then
    raise exception 'Notification target requires related_id and supported related_type report'
      using errcode='23514';
  end if;
  select user_id into owner_id from public.reports where report_id=new.related_id for share;
  if not found or owner_id is distinct from new.user_id then
    raise exception 'Notification report must exist and belong to the notification user'
      using errcode='23503';
  end if;
  return new;
end $$;

create function autofit_integrity.protect_notification_report()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.report_id=old.report_id and new.user_id=old.user_id then return new; end if;
  end if;
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'Notification report removal or reassignment requires READ COMMITTED'
      using errcode='0A000';
  end if;
  if exists(select 1 from public.notifications where related_type='report' and related_id=old.report_id) then
    raise exception 'Remove notification references before removing or reassigning report'
      using errcode='23503';
  end if;
  if tg_op='UPDATE' then return new; end if;
  return old;
end $$;

create function autofit_integrity.check_exercise_session_membership()
returns trigger language plpgsql security definer set search_path='' as $$
declare item_recommendation uuid; session_recommendation uuid;
begin
  -- Standalone exercise records and session-wide discomfort remain supported.
  if new.exercise_item_id is null or new.exercise_session_id is null then return new; end if;
  select exercise_recommendation_id into item_recommendation from public.exercise_items
    where exercise_item_id=new.exercise_item_id for share;
  if not found then raise exception 'Missing exercise item' using errcode='23503'; end if;
  select exercise_recommendation_id into session_recommendation from public.exercise_sessions
    where exercise_session_id=new.exercise_session_id for share;
  if not found then raise exception 'Missing exercise session' using errcode='23503'; end if;
  if item_recommendation is distinct from session_recommendation then
    raise exception 'Exercise item and session must belong to the same recommendation'
      using errcode='23514';
  end if;
  return new;
end $$;

revoke all on function autofit_integrity.check_notification_target(),
  autofit_integrity.protect_notification_report(),autofit_integrity.check_exercise_session_membership()
  from public,anon,authenticated,service_role;
create trigger z_check_notification_target before insert or update on public.notifications
  for each row execute function autofit_integrity.check_notification_target();
create trigger protect_notification_report before delete or update on public.reports
  for each row execute function autofit_integrity.protect_notification_report();
create trigger zz_check_exercise_session_membership before insert or update on public.exercise_logs
  for each row execute function autofit_integrity.check_exercise_session_membership();
create trigger zz_check_exercise_session_membership before insert or update on public.exercise_discomfort_logs
  for each row execute function autofit_integrity.check_exercise_session_membership();

-- Revalidate existing rows atomically; abort the migration on any inconsistency.
update public.notifications set notification_id=notification_id;
update public.exercise_logs set exercise_log_id=exercise_log_id;
update public.exercise_discomfort_logs set exercise_discomfort_log_id=exercise_discomfort_log_id;
