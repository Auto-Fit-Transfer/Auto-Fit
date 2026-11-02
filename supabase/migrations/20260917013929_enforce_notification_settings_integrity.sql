-- Logical references enforced by triggers; no physical foreign keys.
-- Legacy invalid rows are preserved, but cannot be updated without repair.
create schema if not exists autofit_integrity;
revoke all on schema autofit_integrity from public, anon, authenticated;

create function autofit_integrity.check_notification_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Lock both parent keys until commit so a concurrent deletion cannot race
  -- with creation of the dependent setting. Always lock auth before profiles.
  perform 1 from auth.users where id = new.user_id and deleted_at is null for share;
  if not found then
    raise exception 'notification_settings requires an existing active auth user'
      using errcode = '23503';
  end if;
  perform 1 from public.profiles where user_id = new.user_id for key share;
  if not found then
    raise exception 'notification_settings requires an existing profile'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create function autofit_integrity.remove_notification_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A fixed transaction snapshot could miss a setting committed while a
  -- parent DELETE waited for our row lock. Fail closed in those isolation modes.
  if current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
    raise exception 'Notification parent removal requires READ COMMITTED isolation'
      using errcode = '0A000';
  end if;
  if tg_table_schema = 'auth' then
    if tg_op = 'UPDATE' and new.id = old.id and new.deleted_at is null then
      return null;
    end if;
    delete from public.notification_settings where user_id = old.id;
  else
    if tg_op = 'UPDATE' and new.user_id = old.user_id then
      return null;
    end if;
    delete from public.notification_settings where user_id = old.user_id;
  end if;
  return null;
end;
$$;

create function autofit_integrity.block_parent_truncate()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Use DELETE instead of TRUNCATE to preserve notification integrity'
    using errcode = '0A000';
end;
$$;

revoke all on all functions in schema autofit_integrity from public, anon, authenticated, service_role;

create trigger notification_settings_check_user
before insert or update on public.notification_settings
for each row execute function autofit_integrity.check_notification_user();

create trigger auth_user_remove_notification_settings
after delete or update of id, deleted_at on auth.users
for each row execute function autofit_integrity.remove_notification_settings();

create trigger profile_remove_notification_settings
after delete or update of user_id on public.profiles
for each row execute function autofit_integrity.remove_notification_settings();

create trigger auth_users_block_truncate
before truncate on auth.users
for each statement execute function autofit_integrity.block_parent_truncate();

create trigger profiles_block_truncate
before truncate on public.profiles
for each statement execute function autofit_integrity.block_parent_truncate();
