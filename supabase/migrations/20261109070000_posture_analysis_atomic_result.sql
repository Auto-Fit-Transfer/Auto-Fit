-- Persist a validated Schema 1.1 result atomically. A failed statement rolls
-- back the assessment and every child row, allowing a later new job.
alter table public.posture_assessments
  add column result_digest text
    check (result_digest is null or result_digest ~ '^[0-9a-f]{64}$');

create function public.save_posture_analysis_result(
  p_job_id uuid, p_result jsonb, p_result_digest text
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_job public.posture_analysis_jobs%rowtype;
  v_existing_digest text;
  v_assessment_id uuid := pg_catalog.gen_random_uuid();
  v_repetition_id uuid;
  v_finding_id uuid;
  v_rep_count integer;
  v_rep jsonb;
  v_keypoint jsonb;
  v_angle jsonb;
  v_finding jsonb;
  v_step jsonb;
begin
  if p_result_digest is null or p_result_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid posture result digest' using errcode = '23514';
  end if;

  select * into v_job from public.posture_analysis_jobs
    where posture_analysis_job_id = p_job_id for update;
  if not found then
    raise exception 'Posture job not found' using errcode = '23503';
  end if;

  select result_digest into v_existing_digest from public.posture_assessments
    where posture_analysis_job_id = p_job_id;
  if found then
    if v_existing_digest = p_result_digest
       and v_job.status in ('processing', 'cleanup_pending') then
      return;
    end if;
    raise exception 'Posture result already exists' using errcode = '23505';
  end if;
  if v_job.status <> 'processing' or v_job.video_uploaded_at is null then
    raise exception 'Posture job is not processing' using errcode = '23514';
  end if;
  if p_result->>'schema_version' <> '1.1'
     or (p_result->>'posture_analysis_job_id')::uuid <> p_job_id
     or p_result->>'exercise_code' <> v_job.exercise_code
     or p_result->>'camera_view' <> v_job.camera_view
     or pg_catalog.right(p_result->>'model_version',
                         pg_catalog.length(v_job.rule_version) + 1)
          <> '+' || v_job.rule_version then
    raise exception 'Posture result does not match job profile' using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(p_result->'routine_suggestions') is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_result->'routine_suggestions') <> 0 then
    raise exception 'Posture routine suggestions are not yet supported'
      using errcode = '23514';
  end if;
  if p_result->'assessment'->>'passing_score' is not null then
    raise exception 'Posture passing score is not defined in Schema 1.1'
      using errcode = '23514';
  end if;
  v_rep_count := pg_catalog.jsonb_array_length(p_result->'repetitions');
  if v_rep_count is null or v_rep_count not between 1 and 20
     or (p_result->'assessment'->>'repetition_count')::integer <> v_rep_count then
    raise exception 'Posture repetition count mismatch' using errcode = '23514';
  end if;

  insert into public.posture_assessments (
    posture_assessment_id, posture_analysis_job_id, result_digest,
    schema_version, model_version, overall_score, passing_score,
    verdict, repetition_count, summary
  ) values (
    v_assessment_id, p_job_id, p_result_digest,
    p_result->>'schema_version', p_result->>'model_version',
    (p_result->'assessment'->>'overall_score')::smallint,
    (p_result->'assessment'->>'passing_score')::smallint,
    p_result->'assessment'->>'verdict', v_rep_count,
    p_result->'assessment'->>'summary'
  );

  for v_rep in select value from pg_catalog.jsonb_array_elements(p_result->'repetitions') loop
    v_repetition_id := pg_catalog.gen_random_uuid();
    insert into public.posture_repetitions (
      posture_repetition_id, posture_assessment_id, repetition_number,
      start_offset_ms, keyframe_offset_ms, end_offset_ms, score
    ) values (
      v_repetition_id, v_assessment_id,
      (v_rep->>'repetition_number')::smallint,
      (v_rep->>'start_offset_ms')::integer,
      (v_rep->>'keyframe_offset_ms')::integer,
      (v_rep->>'end_offset_ms')::integer,
      (v_rep->>'score')::smallint
    );
    for v_keypoint in select value from pg_catalog.jsonb_array_elements(v_rep->'keypoints') loop
      insert into public.posture_joint_keypoints (
        posture_repetition_id, joint_code, x_normalized, y_normalized, confidence
      ) values (
        v_repetition_id, v_keypoint->>'joint_code',
        (v_keypoint->>'x_normalized')::numeric,
        (v_keypoint->>'y_normalized')::numeric,
        (v_keypoint->>'confidence')::numeric
      );
    end loop;
    for v_angle in select value from pg_catalog.jsonb_array_elements(v_rep->'angles') loop
      insert into public.posture_joint_angles (
        posture_repetition_id, angle_code, measured_degrees,
        target_min_degrees, target_max_degrees
      ) values (
        v_repetition_id, v_angle->>'angle_code',
        (v_angle->>'measured_degrees')::numeric,
        (v_angle->>'target_min_degrees')::numeric,
        (v_angle->>'target_max_degrees')::numeric
      );
    end loop;
  end loop;

  for v_finding in select value from pg_catalog.jsonb_array_elements(p_result->'findings') loop
    v_finding_id := pg_catalog.gen_random_uuid();
    insert into public.posture_findings (
      posture_finding_id, posture_assessment_id, display_order, finding_type,
      finding_code, title, explanation, repetition_start, repetition_end
    ) values (
      v_finding_id, v_assessment_id,
      (v_finding->>'display_order')::smallint,
      v_finding->>'finding_type', v_finding->>'finding_code',
      v_finding->>'title', v_finding->>'explanation',
      (v_finding->>'repetition_start')::smallint,
      (v_finding->>'repetition_end')::smallint
    );
    for v_step in select value from pg_catalog.jsonb_array_elements(v_finding->'guidance_steps') loop
      insert into public.posture_guidance_steps (
        posture_finding_id, sequence_order, instruction
      ) values (
        v_finding_id, (v_step->>'sequence_order')::smallint,
        v_step->>'instruction'
      );
    end loop;
  end loop;
end $$;

revoke all on function public.save_posture_analysis_result(uuid, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_posture_analysis_result(uuid, jsonb, text)
  to service_role;

notify pgrst, 'reload schema';
