begin;
do $$
declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid();
  report uuid:=gen_random_uuid(); rec uuid:=gen_random_uuid(); other_rec uuid:=gen_random_uuid();
  item uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); log_id uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
    values(uid,'{"autofit_integration_test":true}','{}'),(other_uid,'{"autofit_integration_test":true}','{}');
  insert into public.reports(report_id,user_id,report_type,period_start,period_end)
    values(report,uid,'weekly',current_date,current_date);
  insert into public.notifications(user_id,notification_type,title,message)
    values(uid,'system','Test','No target');
  begin
    insert into public.notifications(user_id,notification_type,title,message,related_type,related_id)
      values(uid,'system','Test','Missing', 'report',gen_random_uuid());
    raise exception 'TEST FAILED: missing report accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.notifications(user_id,notification_type,title,message,related_type,related_id)
      values(other_uid,'system','Test','Other owner','report',report);
    raise exception 'TEST FAILED: cross-owner report accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.notifications(user_id,notification_type,title,message,related_type,related_id)
      values(uid,'system','Test','Unknown','unknown',report);
    raise exception 'TEST FAILED: unknown type accepted';
  exception when check_violation then null; end;
  begin
    insert into public.notifications(user_id,notification_type,title,message,related_type)
      values(uid,'system','Test','Incomplete','report');
    raise exception 'TEST FAILED: incomplete target accepted';
  exception when check_violation then null; end;
  insert into public.notifications(user_id,notification_type,title,message,related_type,related_id)
    values(uid,'system','Test','Valid','report',report);
  begin
    delete from public.reports where report_id=report;
    raise exception 'TEST FAILED: referenced report deleted';
  exception when foreign_key_violation then null; end;
  begin
    update public.reports set user_id=other_uid where report_id=report;
    raise exception 'TEST FAILED: referenced report reassigned';
  exception when foreign_key_violation then null; end;
  begin
    update public.notifications set related_id=gen_random_uuid() where related_id=report;
    raise exception 'TEST FAILED: bad notification UPDATE accepted';
  exception when foreign_key_violation then null; end;
  update public.reports set summary='Normal content edit' where report_id=report;
  delete from public.notifications where user_id=uid;
  delete from public.reports where report_id=report;

  insert into public.exercise_recommendations(exercise_recommendation_id,user_id,recommendation_date)
    values(rec,uid,current_date),(other_rec,uid,current_date);
  insert into public.exercise_items(exercise_item_id,exercise_recommendation_id,exercise_name)
    values(item,rec,'Test');
  insert into public.exercise_sessions(exercise_session_id,user_id,exercise_recommendation_id)
    values(session,uid,other_rec);
  begin
    insert into public.exercise_logs(user_id,exercise_name,performed_at,exercise_item_id,exercise_session_id)
      values(uid,'Test',now(),item,session);
    raise exception 'TEST FAILED: mismatched recommendations accepted';
  exception when check_violation then null; end;
  begin
    insert into public.exercise_discomfort_logs(user_id,symptom_type,exercise_item_id,exercise_session_id)
      values(uid,'pain',item,session);
    raise exception 'TEST FAILED: mismatched discomfort accepted';
  exception when check_violation then null; end;
  update public.exercise_sessions set exercise_recommendation_id=rec where exercise_session_id=session;
  insert into public.exercise_logs(exercise_log_id,user_id,exercise_name,performed_at,exercise_item_id,exercise_session_id)
    values(log_id,uid,'Test',now(),item,session);
  insert into public.exercise_discomfort_logs(user_id,symptom_type,exercise_session_id)
    values(uid,'pain',session);
  begin
    update public.exercise_items set exercise_recommendation_id=other_rec where exercise_item_id=item;
    raise exception 'TEST FAILED: recorded item reassigned';
  exception when foreign_key_violation then null; end;
  begin
    update public.exercise_sessions set exercise_recommendation_id=other_rec where exercise_session_id=session;
    raise exception 'TEST FAILED: recorded session reassigned';
  exception when foreign_key_violation then null; end;
  insert into public.exercise_sessions(user_id,exercise_recommendation_id)
    values(uid,other_rec) returning exercise_session_id into session;
  begin
    update public.exercise_logs set exercise_session_id=session where exercise_log_id=log_id;
    raise exception 'TEST FAILED: mismatched log UPDATE accepted';
  exception when check_violation then null; end;
  if exists(select 1 from pg_constraint where contype='f' and connamespace='public'::regnamespace) then
    raise exception 'TEST FAILED: physical FK exists';
  end if;
end $$;
rollback;
