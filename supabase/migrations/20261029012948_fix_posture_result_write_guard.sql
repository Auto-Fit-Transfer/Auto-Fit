-- INSERT triggers have no OLD row. Keep the completed-result exception inside
-- an UPDATE-only branch before accessing OLD's suggestion-specific columns.
create or replace function autofit_integrity.guard_posture_result_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare job_id uuid; job_status text; uploaded_at timestamptz;
begin
  if tg_table_name = 'posture_assessments' then
    job_id := new.posture_analysis_job_id;
  elsif tg_table_name in ('posture_repetitions','posture_findings','posture_routine_suggestions') then
    select posture_analysis_job_id into job_id from public.posture_assessments
      where posture_assessment_id = new.posture_assessment_id;
  elsif tg_table_name in ('posture_joint_keypoints','posture_joint_angles') then
    select a.posture_analysis_job_id into job_id
      from public.posture_repetitions r
      join public.posture_assessments a on a.posture_assessment_id = r.posture_assessment_id
      where r.posture_repetition_id = new.posture_repetition_id;
  elsif tg_table_name = 'posture_guidance_steps' then
    select a.posture_analysis_job_id into job_id
      from public.posture_findings f
      join public.posture_assessments a on a.posture_assessment_id = f.posture_assessment_id
      where f.posture_finding_id = new.posture_finding_id;
  end if;
  if job_id is null then
    raise exception 'Posture result parent does not exist' using errcode = '23503';
  end if;
  select status, video_uploaded_at into job_status, uploaded_at
    from public.posture_analysis_jobs where posture_analysis_job_id = job_id for share;
  if not found or uploaded_at is null then
    raise exception 'Posture result requires an uploaded video' using errcode = '23514';
  end if;
  if tg_table_name = 'posture_routine_suggestions' and tg_op = 'UPDATE' then
    if job_status = 'completed' and old.applied_routine_item_id is null
       and new.applied_routine_item_id is not null
       and (to_jsonb(new) - array['applied_routine_item_id','applied_at']) =
           (to_jsonb(old) - array['applied_routine_item_id','applied_at']) then
      return new;
    end if;
  end if;
  if job_status not in ('processing','cleanup_pending') then
    raise exception 'Posture result can only be written during analysis'
      using errcode = '23514';
  end if;
  return new;
end $$;
