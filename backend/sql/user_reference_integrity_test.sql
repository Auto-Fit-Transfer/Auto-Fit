-- Synthetic fixtures only. Every change is rolled back.
begin;
do $$
declare uid uuid := gen_random_uuid(); missing uuid := gen_random_uuid(); dep record;
begin
  for dep in select table_name from information_schema.columns
    where table_schema='public' and column_name='user_id'
  loop
    begin
      execute format('insert into public.%I(user_id) values($1)',dep.table_name) using missing;
      raise exception 'TEST FAILED: % accepted a missing auth user',dep.table_name;
    exception when foreign_key_violation then null;
    end;
  end loop;
  insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
    values(uid,'{"autofit_integration_test":true}','{}');
  insert into public.chats(user_id) values(uid);
  begin
    delete from auth.users where id=uid;
    if exists(select 1 from public.chats where user_id=uid)
      or exists(select 1 from public.profiles where user_id=uid) then
      raise exception 'TEST FAILED: auth delete left business data';
    end if;
    raise exception 'Rollback successful cascade probe' using errcode='ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  begin
    update auth.users set deleted_at=now() where id=uid;
    raise exception 'TEST FAILED: soft delete accepted with business data';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.profiles where user_id=uid;
    raise exception 'TEST FAILED: profile delete accepted with business data';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.chats set user_id=missing where user_id=uid;
    raise exception 'TEST FAILED: business data reassignment to missing user accepted';
  exception when foreign_key_violation then null;
  end;
  delete from public.chats where user_id=uid;
  update public.profiles set name='Test profile with user content' where user_id=uid;
  begin
    delete from auth.users where id=uid;
    if exists(select 1 from public.profiles where user_id=uid) then
      raise exception 'TEST FAILED: account delete left populated profile';
    end if;
    raise exception 'Rollback successful populated profile cascade probe' using errcode='ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  delete from public.profiles where user_id=uid;
  for dep in select table_name from information_schema.columns
    where table_schema='public' and column_name='user_id' and table_name<>'profiles'
  loop
    begin
      execute format('insert into public.%I(user_id) values($1)',dep.table_name) using uid;
      raise exception 'TEST FAILED: % accepted a missing profile',dep.table_name;
    exception when foreign_key_violation then null;
    end;
  end loop;
  delete from auth.users where id=uid;

  uid := gen_random_uuid();
  insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
    values(uid,'{"autofit_integration_test":true}','{}');
  delete from auth.users where id=uid;
  if exists(select 1 from public.profiles where user_id=uid)
    or exists(select 1 from public.notification_settings where user_id=uid) then
    raise exception 'TEST FAILED: empty signup defaults left behind';
  end if;
  if exists(select 1 from pg_constraint where connamespace='public'::regnamespace and contype='f') then
    raise exception 'TEST FAILED: physical FK present';
  end if;
  if has_function_privilege('authenticated','autofit_integrity.protect_user_removal()','execute')
    or has_function_privilege('service_role','autofit_integrity.remove_empty_user_profile()','execute') then
    raise exception 'TEST FAILED: privileged function directly callable';
  end if;
end $$;
rollback;
