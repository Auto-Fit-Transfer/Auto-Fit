-- Real PostgreSQL checks. All data changes (including existing-row probes) roll back.
begin;
do $$
declare
  uid uuid := gen_random_uuid(); other_uid uuid := gen_random_uuid();
  missing uuid := gen_random_uuid(); chat uuid := gen_random_uuid();
  recommendation uuid := gen_random_uuid(); meal uuid := gen_random_uuid();
  dep record; has_user boolean; ref uuid; sample jsonb;
begin
  insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
    values(uid,'{"autofit_integration_test":true}','{}'),
          (other_uid,'{"autofit_integration_test":true}','{}');
  if (select count(*) from autofit_integrity.business_references)<>35 then
    raise exception 'TEST FAILED: relation map incomplete';
  end if;
  for dep in select * from autofit_integrity.business_references loop
    select exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=dep.child_table and column_name='user_id') into has_user;
    begin
      if has_user then
        execute format('insert into public.%I(user_id,%I) values($1,$2)',dep.child_table,dep.child_column)
          using uid,missing;
      else
        execute format('insert into public.%I(%I) values($1)',dep.child_table,dep.child_column) using missing;
      end if;
      raise exception 'TEST FAILED: %.% accepted missing parent',dep.child_table,dep.child_column;
    exception when foreign_key_violation then null;
    end;

    -- Probe UPDATE with existing valid rows inside a rollback subtransaction.
    execute format('select to_jsonb(c) from public.%I c limit 1',dep.child_table) into sample;
    if sample is not null then
      begin
        execute format('update public.%I set %I=$1 where ctid=(select ctid from public.%I limit 1)',
          dep.child_table,dep.child_column,dep.child_table) using missing;
        raise exception 'TEST FAILED: %.% UPDATE accepted missing parent',dep.child_table,dep.child_column;
      exception when foreign_key_violation then null;
      end;
    end if;

    execute format('select %I from public.%I where %I is not null limit 1',
      dep.child_column,dep.child_table,dep.child_column) into ref;
    if ref is not null then
      begin
        execute format('delete from public.%I where %I=$1',dep.parent_table,dep.parent_column) using ref;
        raise exception 'TEST FAILED: referenced parent % deletion accepted',dep.parent_table;
      exception when foreign_key_violation then null;
      end;
      begin
        execute format('update public.%I set %I=$1 where %I=$2',
          dep.parent_table,dep.parent_column,dep.parent_column) using missing,ref;
        raise exception 'TEST FAILED: referenced parent key change accepted';
      exception when check_violation then null;
      end;
    end if;
  end loop;

  insert into public.chats(chat_id,user_id) values(chat,uid);
  begin
    insert into public.chat_messages(chat_id,user_id) values(chat,other_uid);
    raise exception 'TEST FAILED: cross-user reference accepted';
  exception when foreign_key_violation then null;
  end;
  insert into public.chat_messages(chat_id,user_id,sender_type,content)
    values(chat,uid,'user','Synthetic integrity test');
  begin
    update public.chats set user_id=other_uid where chat_id=chat;
    raise exception 'TEST FAILED: referenced parent owner reassignment accepted';
  exception when foreign_key_violation then null;
  end;
  delete from public.chat_messages where chat_id=chat;
  delete from public.chats where chat_id=chat;
  insert into public.diet_recommendations(diet_recommendation_id,user_id,recommendation_date)
    values(recommendation,uid,current_date);
  insert into public.diet_meals(diet_meal_id,diet_recommendation_id,meal_type)
    values(meal,recommendation,'lunch');
  begin
    insert into public.diet_feedback(user_id,diet_meal_id,feedback_type)
      values(other_uid,meal,'skipped');
    raise exception 'TEST FAILED: indirect cross-user reference accepted';
  exception when foreign_key_violation then null;
  end;
  -- Optional meal_log_id stays NULL and does not require a parent.
  insert into public.diet_feedback(user_id,diet_meal_id,feedback_type)
    values(uid,meal,'skipped');
  delete from public.diet_feedback where diet_meal_id=meal;
  delete from public.diet_meals where diet_meal_id=meal;
  delete from public.diet_recommendations where diet_recommendation_id=recommendation;
  delete from auth.users where id in(uid,other_uid);

  -- Verify all current child rows through their normal write triggers.
  for dep in select distinct r.child_table,c.column_name
    from autofit_integrity.business_references r
    join information_schema.table_constraints k on k.table_schema='public'
      and k.table_name=r.child_table and k.constraint_type='PRIMARY KEY'
    join information_schema.key_column_usage c on c.constraint_schema=k.constraint_schema
      and c.constraint_name=k.constraint_name and c.table_name=k.table_name
  loop
    execute format('update public.%I set %I=%I',dep.child_table,dep.column_name,dep.column_name);
  end loop;
  if exists(select 1 from pg_constraint where connamespace='public'::regnamespace and contype='f') then
    raise exception 'TEST FAILED: physical FK present';
  end if;
  if has_function_privilege('authenticated','autofit_integrity.business_owner(text,jsonb,integer)','execute')
    or has_function_privilege('service_role','autofit_integrity.protect_business_parent()','execute') then
    raise exception 'TEST FAILED: private function callable';
  end if;
end $$;
rollback;
