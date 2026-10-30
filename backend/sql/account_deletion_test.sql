-- Synthetic accounts only; every data change rolls back.
begin;
do $$
declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid();
  chat uuid:=gen_random_uuid(); rec uuid:=gen_random_uuid(); meal uuid:=gen_random_uuid();
  meal_log uuid:=gen_random_uuid(); exercise_rec uuid:=gen_random_uuid(); item uuid:=gen_random_uuid();
  session uuid:=gen_random_uuid(); report uuid:=gen_random_uuid(); upload uuid:=gen_random_uuid();
  assessment uuid:=gen_random_uuid(); risk uuid:=gen_random_uuid(); food uuid:=gen_random_uuid();
  dep record; remaining boolean; row_count bigint; baseline jsonb:='{}'; current_counts jsonb:='{}';
begin
  for dep in select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' loop
    execute format('select count(*) from public.%I',dep.table_name) into row_count;
    baseline:=baseline||jsonb_build_object(dep.table_name,row_count);
  end loop;
  insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
    values(uid,'{"autofit_integration_test":true}','{}'),(other_uid,'{"autofit_integration_test":true}','{}');
  update public.profiles set name='Populated account' where user_id=uid;
  insert into public.food_items(food_item_id,name) values(food,'Shared test food');
  insert into public.chats(chat_id,user_id) values(chat,uid);
  insert into public.chat_messages(chat_id,user_id,sender_type,content) values(chat,uid,'user','Test');
  insert into public.chats(user_id,title) values(other_uid,'Other account must survive');
  insert into public.diet_recommendations(diet_recommendation_id,user_id,recommendation_date)
    values(rec,uid,current_date);
  insert into public.diet_meals(diet_meal_id,diet_recommendation_id,meal_type) values(meal,rec,'lunch');
  insert into public.diet_meal_foods(diet_meal_id,food_item_id) values(meal,food);
  insert into public.meal_logs(meal_log_id,user_id,diet_meal_id,meal_type) values(meal_log,uid,meal,'lunch');
  insert into public.meal_log_items(meal_log_id,food_item_id,food_name,quantity,unit)
    values(meal_log,food,'Test',1,'g');
  insert into public.diet_feedback(user_id,diet_meal_id,meal_log_id,feedback_type)
    values(uid,meal,meal_log,'eaten');
  insert into public.exercise_recommendations(exercise_recommendation_id,user_id,recommendation_date)
    values(exercise_rec,uid,current_date);
  insert into public.exercise_items(exercise_item_id,exercise_recommendation_id,exercise_name)
    values(item,exercise_rec,'Test');
  insert into public.exercise_sessions(exercise_session_id,user_id,exercise_recommendation_id)
    values(session,uid,exercise_rec);
  insert into public.exercise_logs(user_id,exercise_item_id,exercise_session_id,exercise_name,performed_at)
    values(uid,item,session,'Test',now());
  insert into public.exercise_discomfort_logs(user_id,exercise_item_id,exercise_session_id,symptom_type)
    values(uid,item,session,'pain');
  insert into public.exercise_session_feedback(user_id,exercise_session_id) values(uid,session);
  insert into public.upload_files(uploaded_file_id,user_id,file_name,storage_path)
    values(upload,uid,'Test.pdf',uid::text||'/test.pdf');
  insert into public.ocr_results(uploaded_file_id) values(upload);
  insert into public.health_assessments(health_assessment_id,user_id,overall_score,overall_status)
    values(assessment,uid,80,'normal');
  insert into public.health_assessment_items(health_assessment_id,metric_type,metric_name)
    values(assessment,'test','Test');
  insert into public.disease_risk(disease_risk_id,user_id) values(risk,uid);
  insert into public.disease_risk_details(disease_risk_id,disease_name) values(risk,'Test');
  insert into public.reports(report_id,user_id,report_type,period_start,period_end)
    values(report,uid,'weekly',current_date,current_date);
  insert into public.report_evaluations(report_id,content) values(report,'Test');
  insert into public.report_health_scores(report_id,health_assessment_id) values(report,assessment);
  insert into public.notifications(user_id,notification_type,title,message,related_type,related_id)
    values(uid,'system','Test','Test','report',report);
  perform public.begin_account_deletion(uid);
  perform public.begin_account_deletion(uid); -- Retry is idempotent.
  begin
    insert into public.chats(user_id) values(uid);
    raise exception 'TEST FAILED: deletion account accepted new root';
  exception when check_violation then null; end;
  begin
    update public.chats set user_id=other_uid where chat_id=chat;
    raise exception 'TEST FAILED: deleting account data escaped to another owner';
  exception when check_violation or foreign_key_violation then null; end;
  begin
    insert into public.diet_meal_foods(diet_meal_id) values(meal);
    raise exception 'TEST FAILED: deletion account accepted indirect child';
  exception when check_violation then null; end;
  begin
    update public.notification_settings set diet_enabled=false where user_id=uid;
    raise exception 'TEST FAILED: deletion account accepted settings update';
  exception when check_violation then null; end;
  delete from auth.users where id=uid;
  for dep in select table_name from information_schema.columns where table_schema='public' and column_name='user_id' loop
    execute format('select exists(select 1 from public.%I where user_id=$1)',dep.table_name) into remaining using uid;
    if remaining then raise exception 'TEST FAILED: account rows remain in %',dep.table_name; end if;
  end loop;
  if exists(select 1 from public.diet_meals where diet_recommendation_id=rec)
    or exists(select 1 from public.diet_meal_foods where diet_meal_id=meal)
    or exists(select 1 from public.meal_log_items where meal_log_id=meal_log)
    or exists(select 1 from public.exercise_items where exercise_recommendation_id=exercise_rec)
    or exists(select 1 from public.ocr_results where uploaded_file_id=upload)
    or exists(select 1 from public.health_assessment_items where health_assessment_id=assessment)
    or exists(select 1 from public.disease_risk_details where disease_risk_id=risk)
    or exists(select 1 from public.report_evaluations where report_id=report)
    or exists(select 1 from public.report_health_scores where report_id=report)
    or exists(select 1 from autofit_integrity.account_deletions where user_id=uid) then
    raise exception 'TEST FAILED: indirect account data remains';
  end if;
  if not exists(select 1 from public.chats where user_id=other_uid)
    or not exists(select 1 from public.food_items where food_item_id=food) then
    raise exception 'TEST FAILED: other account or shared catalog was deleted';
  end if;
  -- Direct admin deletion also cascades without having to begin a file cleanup.
  delete from auth.users where id=other_uid;
  delete from public.food_items where food_item_id=food;
  for dep in select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' loop
    execute format('select count(*) from public.%I',dep.table_name) into row_count;
    current_counts:=current_counts||jsonb_build_object(dep.table_name,row_count);
  end loop;
  if current_counts<>baseline then raise exception 'TEST FAILED: public table counts differ from baseline'; end if;
  if has_function_privilege('anon','public.begin_account_deletion(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.account_deletion_storage(uuid)','EXECUTE')
    or has_function_privilege('service_role','autofit_integrity.cascade_account_deletion()','EXECUTE') then
    raise exception 'TEST FAILED: unsafe deletion privilege';
  end if;
  if exists(select 1 from pg_constraint where contype='f' and connamespace='public'::regnamespace) then
    raise exception 'TEST FAILED: physical FK exists';
  end if;
end $$;
-- Exercise the Storage write trigger on temporary metadata, never actual objects.
create temporary table account_storage_fixture(owner_id text,name text);
create trigger account_storage_write before insert or update on account_storage_fixture
  for each row execute function autofit_integrity.check_storage_account_writable();
do $$ declare uid uuid:=gen_random_uuid(); begin
  insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
    values(uid,'{"autofit_integration_test":true}','{}');
  insert into account_storage_fixture values(null,uid::text||'/before.pdf');
  perform public.begin_account_deletion(uid);
  begin
    insert into account_storage_fixture values(null,uid::text||'/after.pdf');
    raise exception 'TEST FAILED: deleting account accepted a service upload';
  exception when check_violation then null; end;
  begin
    update account_storage_fixture set name='shared/escaped.pdf';
    raise exception 'TEST FAILED: deleting account storage moved to shared path';
  exception when check_violation then null; end;
  delete from auth.users where id=uid;
end $$;
rollback;
