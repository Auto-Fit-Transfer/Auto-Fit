-- Run against the migrated DB. All synthetic rows and changes are rolled back.
begin;
do $$
declare
  uid uuid := gen_random_uuid();
  missing uuid := gen_random_uuid();
begin
  begin
    insert into public.notification_settings(user_id) values(missing);
    raise exception 'TEST FAILED: missing auth user accepted';
  exception when foreign_key_violation then null;
  end;

  insert into auth.users(id, raw_app_meta_data, raw_user_meta_data)
    values(uid, '{"autofit_integration_test":true}', '{}');
  if not exists(select 1 from public.notification_settings where user_id=uid) then
    raise exception 'TEST FAILED: signup defaults absent';
  end if;
  update public.notification_settings set push_enabled=false where user_id=uid;
  begin
    update public.notification_settings set user_id=missing where user_id=uid;
    raise exception 'TEST FAILED: missing auth user update accepted';
  exception when foreign_key_violation then null;
  end;

  delete from public.profiles where user_id=uid;
  if exists(select 1 from public.notification_settings where user_id=uid) then
    raise exception 'TEST FAILED: profile deletion left settings';
  end if;
  begin
    insert into public.notification_settings(user_id) values(uid);
    raise exception 'TEST FAILED: missing profile accepted';
  exception when foreign_key_violation then null;
  end;
  insert into public.profiles(user_id, name) values(uid, '');
  insert into public.notification_settings(user_id) values(uid);
  update auth.users set deleted_at=now() where id=uid;
  if exists(select 1 from public.notification_settings where user_id=uid) then
    raise exception 'TEST FAILED: soft deletion left settings';
  end if;
  begin
    insert into public.notification_settings(user_id) values(uid);
    raise exception 'TEST FAILED: soft-deleted user accepted';
  exception when foreign_key_violation then null;
  end;
  update auth.users set deleted_at=null where id=uid;
  insert into public.profiles(user_id,name) values(uid,'');
  insert into public.notification_settings(user_id) values(uid);
  begin
    update public.profiles set user_id=missing where user_id=uid;
    raise exception 'TEST FAILED: profile key change accepted';
  exception when check_violation then null;
  end;
  begin
    update auth.users set id=missing where id=uid;
    raise exception 'TEST FAILED: auth key change accepted';
  exception when check_violation then null;
  end;
  delete from auth.users where id=uid;
  if exists(select 1 from public.notification_settings where user_id=uid) then
    raise exception 'TEST FAILED: auth deletion left settings';
  end if;
  if exists(select 1 from pg_constraint where conrelid='public.notification_settings'::regclass and contype='f') then
    raise exception 'TEST FAILED: physical FK present';
  end if;
  if has_function_privilege('authenticated', 'autofit_integrity.check_notification_user()', 'execute')
     or has_function_privilege('service_role', 'autofit_integrity.remove_notification_settings()', 'execute') then
    raise exception 'TEST FAILED: trigger function callable';
  end if;
end;
$$;
-- Test the exact TRUNCATE guard on an isolated temporary table, never real parents.
create temporary table notification_truncate_fixture(id integer);
create trigger block_truncate before truncate on notification_truncate_fixture
for each statement execute function autofit_integrity.block_parent_truncate();
do $$ begin
  begin
    truncate notification_truncate_fixture;
    raise exception 'TEST FAILED: truncate accepted';
  exception when feature_not_supported then null;
  end;
end $$;
rollback;

begin isolation level repeatable read;
do $$ declare uid uuid := gen_random_uuid(); begin
  insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
    values(uid,'{"autofit_integration_test":true}','{}');
  begin
    delete from public.profiles where user_id=uid;
    raise exception 'TEST FAILED: fixed-snapshot parent deletion accepted';
  exception when feature_not_supported then null;
  end;
end $$;
rollback;
