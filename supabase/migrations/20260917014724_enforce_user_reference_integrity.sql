-- Enforce logical user references without physical foreign keys.
-- Existing legacy invalid profiles are retained, but cannot be updated.
create function autofit_integrity.check_user_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Profile user_id is immutable' using errcode = '23514';
  end if;
  perform 1 from auth.users where id = new.user_id and deleted_at is null for share;
  if not found then
    raise exception '% requires an existing active auth user', tg_table_name using errcode = '23503';
  end if;
  if tg_table_name <> 'profiles' then
    perform 1 from public.profiles where user_id = new.user_id for key share;
    if not found then
      raise exception '% requires an existing profile', tg_table_name using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create function autofit_integrity.protect_user_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid; dep record; has_data boolean;
begin
  if tg_table_schema = 'auth' then
    uid := old.id;
    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id then
        raise exception 'Auth user id is immutable' using errcode = '23514';
      end if;
      if new.deleted_at is null or new.deleted_at is not distinct from old.deleted_at then
        return new;
      end if;
    end if;
  else
    uid := old.user_id;
  end if;
  if current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
    raise exception 'User removal requires READ COMMITTED isolation' using errcode = '0A000';
  end if;
  -- Discover dependencies so newly introduced user-owned tables are included
  -- in deletion protection too. Identifiers are quoted; values are parameters.
  for dep in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'user_id'
      and c.table_name not in ('profiles', 'notification_settings')
  loop
    execute format('select exists(select 1 from public.%I where user_id=$1)', dep.table_name)
      into has_data using uid;
    if has_data then
      raise exception 'Remove user data from % before removing its owner', dep.table_name
        using errcode = '23503';
    end if;
  end loop;
  if exists(select 1 from storage.objects where owner_id=uid::text or split_part(name,'/',1)=uid::text) then
    raise exception 'Remove user storage objects before removing their owner' using errcode = '23503';
  end if;
  -- Only untouched empty signup profiles may be automatically removed.
  if tg_table_schema = 'auth' and exists(
    select 1 from public.profiles p where p.user_id=uid and (
      p.name <> '' or p.nickname is not null or p.birth_date is not null or
      p.gender is not null or p.profile_image_url is not null or
      p.target_weight is not null or p.activity_level is not null or
      p.onboarding_completed_at is not null or p.updated_at <> p.created_at
    )
  ) then
    raise exception 'Explicitly clean the populated profile before removing the auth user'
      using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

create function autofit_integrity.remove_empty_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
    -- BEFORE trigger has already rejected business data and populated profiles.
    delete from public.profiles where user_id=old.id;
  end if;
  return null;
end;
$$;

revoke all on function autofit_integrity.check_user_reference(),
  autofit_integrity.protect_user_removal(), autofit_integrity.remove_empty_user_profile()
  from public, anon, authenticated, service_role;

-- Notification settings already have equivalent checks from the prior migration.
do $$ declare dep record; begin
  for dep in
    select c.table_name from information_schema.columns c
    join information_schema.tables t using(table_schema,table_name)
    where c.table_schema='public' and c.column_name='user_id'
      and c.table_name <> 'notification_settings' and t.table_type='BASE TABLE'
  loop
    execute format('create trigger check_user_reference before insert or update on public.%I for each row execute function autofit_integrity.check_user_reference()', dep.table_name);
  end loop;
end $$;

create trigger auth_user_protect_removal
before delete or update of id, deleted_at on auth.users
for each row execute function autofit_integrity.protect_user_removal();

create trigger profile_protect_removal
before delete on public.profiles
for each row execute function autofit_integrity.protect_user_removal();

create trigger auth_user_remove_empty_profile
after delete or update of deleted_at on auth.users
for each row execute function autofit_integrity.remove_empty_user_profile();
