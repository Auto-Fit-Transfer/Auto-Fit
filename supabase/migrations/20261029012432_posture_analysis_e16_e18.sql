-- R7 E16-E18 squat posture capture, analysis progress and result.
-- Raw video lives only in a private temporary Storage object while processing.
-- This schema never stores video bytes or a permanent video URL. The backend
-- must call the Storage API to delete the object before marking a job terminal.

create table public.posture_analysis_jobs (
  posture_analysis_job_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  exercise_session_id uuid,
  exercise_type_id uuid,
  exercise_code text not null default 'squat' check (exercise_code = 'squat'),
  camera_view text not null default 'side' check (camera_view = 'side'),
  status text not null default 'awaiting_upload'
    check (status in ('awaiting_upload', 'processing', 'cleanup_pending', 'completed', 'failed')),
  temporary_video_path text unique
    check (temporary_video_path is null or length(temporary_video_path) between 40 and 512),
  capture_duration_ms integer check (capture_duration_ms between 1000 and 30000),
  video_uploaded_at timestamptz,
  analysis_started_at timestamptz,
  video_deleted_at timestamptz,
  finished_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_posture_job_video_path check (
    temporary_video_path is null or
    left(temporary_video_path, length(user_id::text) + 1) = user_id::text || '/'
  ),
  constraint ck_posture_job_video_lifecycle check (
    (temporary_video_path is null or (video_uploaded_at is not null and video_deleted_at is null))
    and (video_uploaded_at is null or temporary_video_path is not null or video_deleted_at is not null)
    and (video_deleted_at is null or
      (video_uploaded_at is not null and video_deleted_at >= video_uploaded_at and temporary_video_path is null))
    and (analysis_started_at is null or
      (video_uploaded_at is not null and analysis_started_at >= video_uploaded_at))
    and (finished_at is null or finished_at >= created_at)
  ),
  constraint ck_posture_job_status check (
    (status = 'awaiting_upload' and video_uploaded_at is null and
      analysis_started_at is null and finished_at is null and failure_code is null)
    or (status = 'processing' and video_uploaded_at is not null and
      analysis_started_at is not null and finished_at is null and failure_code is null)
    or (status = 'cleanup_pending' and video_uploaded_at is not null and
      analysis_started_at is not null and finished_at is null)
    or (status = 'completed' and video_deleted_at is not null and
      finished_at is not null and failure_code is null)
    or (status = 'failed' and finished_at is not null and failure_code is not null and
      (video_uploaded_at is null or video_deleted_at is not null))
  ),
  constraint ck_posture_job_duration check (
    video_uploaded_at is null or capture_duration_ms is not null
  )
);
create index idx_posture_jobs_user_recent on public.posture_analysis_jobs
  (user_id, created_at desc, posture_analysis_job_id desc);
create index idx_posture_jobs_session on public.posture_analysis_jobs(exercise_session_id)
  where exercise_session_id is not null;
create index idx_posture_jobs_type on public.posture_analysis_jobs(exercise_type_id)
  where exercise_type_id is not null;
create index idx_posture_jobs_cleanup on public.posture_analysis_jobs(updated_at)
  where temporary_video_path is not null;

create table public.posture_assessments (
  posture_assessment_id uuid primary key default gen_random_uuid(),
  posture_analysis_job_id uuid not null unique,
  model_version text not null check (length(btrim(model_version)) between 1 and 80),
  overall_score smallint not null check (overall_score between 0 and 100),
  repetition_count smallint not null check (repetition_count between 1 and 20),
  summary text not null check (length(btrim(summary)) between 1 and 1000),
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.posture_repetitions (
  posture_repetition_id uuid primary key default gen_random_uuid(),
  posture_assessment_id uuid not null,
  repetition_number smallint not null check (repetition_number between 1 and 20),
  start_offset_ms integer not null check (start_offset_ms >= 0),
  keyframe_offset_ms integer not null,
  end_offset_ms integer not null,
  score smallint not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  unique (posture_assessment_id, repetition_number),
  constraint ck_posture_repetition_offsets check (
    start_offset_ms <= keyframe_offset_ms and
    keyframe_offset_ms <= end_offset_ms and end_offset_ms <= 30000
  )
);

-- Coordinates are normalized to [0,1] for the selected repetition keyframe.
-- No image frames, face embeddings or video bytes are stored.
create table public.posture_joint_keypoints (
  posture_joint_keypoint_id uuid primary key default gen_random_uuid(),
  posture_repetition_id uuid not null,
  joint_code text not null check (joint_code in (
    'head', 'neck', 'left_shoulder', 'right_shoulder',
    'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
    'left_hip', 'right_hip', 'left_knee', 'right_knee',
    'left_ankle', 'right_ankle'
  )),
  x_normalized numeric(6,5) not null check (x_normalized between 0 and 1),
  y_normalized numeric(6,5) not null check (y_normalized between 0 and 1),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (posture_repetition_id, joint_code)
);

create table public.posture_joint_angles (
  posture_joint_angle_id uuid primary key default gen_random_uuid(),
  posture_repetition_id uuid not null,
  angle_code text not null check (angle_code in (
    'torso_lean', 'knee_flexion', 'hip_flexion', 'ankle_dorsiflexion'
  )),
  measured_degrees numeric(5,2) not null check (measured_degrees between 0 and 180),
  target_min_degrees numeric(5,2) check (target_min_degrees between 0 and 180),
  target_max_degrees numeric(5,2) check (target_max_degrees between 0 and 180),
  created_at timestamptz not null default now(),
  unique (posture_repetition_id, angle_code),
  constraint ck_posture_angle_targets check (
    (target_min_degrees is not null or target_max_degrees is not null) and
    (target_min_degrees is null or target_max_degrees is null or
      target_min_degrees <= target_max_degrees)
  )
);

create table public.posture_findings (
  posture_finding_id uuid primary key default gen_random_uuid(),
  posture_assessment_id uuid not null,
  display_order smallint not null check (display_order between 1 and 30),
  finding_type text not null check (finding_type in ('correction', 'positive')),
  finding_code text not null check (finding_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  explanation text not null check (length(btrim(explanation)) between 1 and 2000),
  repetition_start smallint,
  repetition_end smallint,
  created_at timestamptz not null default now(),
  unique (posture_assessment_id, display_order),
  constraint ck_posture_finding_range check (
    (repetition_start is null and repetition_end is null) or
    (repetition_start between 1 and 20 and repetition_end between repetition_start and 20)
  )
);

create table public.posture_guidance_steps (
  posture_guidance_step_id uuid primary key default gen_random_uuid(),
  posture_finding_id uuid not null,
  sequence_order smallint not null check (sequence_order between 1 and 10),
  instruction text not null check (length(btrim(instruction)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (posture_finding_id, sequence_order)
);

create table public.posture_routine_suggestions (
  posture_routine_suggestion_id uuid primary key default gen_random_uuid(),
  posture_assessment_id uuid not null,
  posture_finding_id uuid,
  exercise_type_id uuid,
  display_order smallint not null check (display_order between 1 and 20),
  exercise_name text not null check (length(btrim(exercise_name)) between 1 and 160),
  prescription text not null check (length(btrim(prescription)) between 1 and 1000),
  target_sets smallint check (target_sets between 1 and 20),
  target_repetitions smallint check (target_repetitions between 1 and 100),
  applied_routine_item_id uuid unique,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (posture_assessment_id, display_order),
  constraint ck_posture_suggestion_applied check (
    (applied_routine_item_id is null) = (applied_at is null)
  )
);
create index idx_posture_suggestions_finding on public.posture_routine_suggestions(posture_finding_id)
  where posture_finding_id is not null;
create index idx_posture_suggestions_type on public.posture_routine_suggestions(exercise_type_id)
  where exercise_type_id is not null;

insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column) values
  ('posture_analysis_jobs','exercise_session_id','exercise_sessions','exercise_session_id'),
  ('posture_analysis_jobs','exercise_type_id','exercise_types','exercise_type_id'),
  ('posture_assessments','posture_analysis_job_id','posture_analysis_jobs','posture_analysis_job_id'),
  ('posture_repetitions','posture_assessment_id','posture_assessments','posture_assessment_id'),
  ('posture_joint_keypoints','posture_repetition_id','posture_repetitions','posture_repetition_id'),
  ('posture_joint_angles','posture_repetition_id','posture_repetitions','posture_repetition_id'),
  ('posture_findings','posture_assessment_id','posture_assessments','posture_assessment_id'),
  ('posture_guidance_steps','posture_finding_id','posture_findings','posture_finding_id'),
  ('posture_routine_suggestions','posture_assessment_id','posture_assessments','posture_assessment_id'),
  ('posture_routine_suggestions','posture_finding_id','posture_findings','posture_finding_id'),
  ('posture_routine_suggestions','exercise_type_id','exercise_types','exercise_type_id'),
  ('posture_routine_suggestions','applied_routine_item_id',
   'user_workout_routine_items','user_workout_routine_item_id');

create function autofit_integrity.guard_posture_result_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare parent_count smallint; capture_ms integer; parent_assessment uuid;
begin
  if tg_table_name = 'posture_repetitions' then
    select a.repetition_count, j.capture_duration_ms into parent_count, capture_ms
      from public.posture_assessments a
      join public.posture_analysis_jobs j
        on j.posture_analysis_job_id = a.posture_analysis_job_id
      where a.posture_assessment_id = new.posture_assessment_id for share of a, j;
    if not found or new.repetition_number > parent_count or new.end_offset_ms > capture_ms then
      raise exception 'Posture repetition exceeds assessment or capture' using errcode = '23514';
    end if;
  elsif tg_table_name = 'posture_findings' then
    select repetition_count into parent_count from public.posture_assessments
      where posture_assessment_id = new.posture_assessment_id for share;
    if not found or
       (new.repetition_end is not null and new.repetition_end > parent_count) then
      raise exception 'Posture finding exceeds assessment repetitions' using errcode = '23514';
    end if;
  elsif tg_table_name = 'posture_routine_suggestions' and new.posture_finding_id is not null then
    select posture_assessment_id into parent_assessment from public.posture_findings
      where posture_finding_id = new.posture_finding_id for share;
    if not found or parent_assessment <> new.posture_assessment_id then
      raise exception 'Posture suggestion finding belongs to another assessment'
        using errcode = '23503';
    end if;
  end if;
  return new;
end $$;

create function autofit_integrity.guard_posture_result_write()
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
  if job_id is null then raise exception 'Posture result parent does not exist'
    using errcode = '23503'; end if;
  select status, video_uploaded_at into job_status, uploaded_at
    from public.posture_analysis_jobs where posture_analysis_job_id = job_id for share;
  if not found or uploaded_at is null then
    raise exception 'Posture result requires an uploaded video' using errcode = '23514';
  end if;
  if tg_table_name = 'posture_routine_suggestions' and tg_op = 'UPDATE'
     and job_status = 'completed' and old.applied_routine_item_id is null
     and new.applied_routine_item_id is not null
     and (to_jsonb(new) - array['applied_routine_item_id','applied_at']) =
         (to_jsonb(old) - array['applied_routine_item_id','applied_at']) then
    return new;
  end if;
  if job_status not in ('processing','cleanup_pending') then
    raise exception 'Posture result can only be written during analysis'
      using errcode = '23514';
  end if;
  return new;
end $$;

create function autofit_integrity.guard_posture_job_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare expected_reps smallint; actual_reps integer; incomplete_reps integer;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or
       new.exercise_session_id is distinct from old.exercise_session_id or
       new.exercise_type_id is distinct from old.exercise_type_id or
       new.exercise_code is distinct from old.exercise_code or
       new.camera_view is distinct from old.camera_view or
       new.created_at is distinct from old.created_at then
      raise exception 'Posture job ownership and capture identity are immutable'
        using errcode = '23514';
    end if;
    if old.status in ('completed','failed') and
       (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'Terminal posture job is immutable' using errcode = '23514';
    end if;
    if (old.status = 'awaiting_upload' and new.status not in ('awaiting_upload','processing','failed')) or
       (old.status = 'processing' and new.status not in ('processing','cleanup_pending')) or
       (old.status = 'cleanup_pending' and new.status not in ('cleanup_pending','completed','failed')) then
      raise exception 'Invalid posture job status transition' using errcode = '23514';
    end if;
    if new.status = 'completed' and old.status <> 'cleanup_pending' then
      raise exception 'Complete posture analysis only after cleanup'
        using errcode = '23514';
    end if;
  end if;
  if new.status = 'completed' then
    select repetition_count into expected_reps from public.posture_assessments
      where posture_analysis_job_id = new.posture_analysis_job_id for share;
    if not found then raise exception 'Completed posture job requires assessment'
      using errcode = '23514'; end if;
    select count(*), count(*) filter (where not exists (
      select 1 from public.posture_joint_keypoints k
        where k.posture_repetition_id = r.posture_repetition_id
    ) or not exists (
      select 1 from public.posture_joint_angles a
        where a.posture_repetition_id = r.posture_repetition_id
    )) into actual_reps, incomplete_reps
      from public.posture_repetitions r
      join public.posture_assessments a
        on a.posture_assessment_id = r.posture_assessment_id
      where a.posture_analysis_job_id = new.posture_analysis_job_id;
    if actual_reps <> expected_reps or incomplete_reps > 0 then
      raise exception 'Completed posture job requires all scored repetitions and measurements'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

revoke all on function autofit_integrity.guard_posture_result_scope(),
  autofit_integrity.guard_posture_result_write(),
  autofit_integrity.guard_posture_job_completion()
  from public, anon, authenticated, service_role;

create trigger a_guard_posture_job_completion before insert or update
  on public.posture_analysis_jobs for each row
  execute function autofit_integrity.guard_posture_job_completion();
do $$ declare tbl text; begin
  foreach tbl in array array[
    'posture_assessments','posture_repetitions','posture_joint_keypoints',
    'posture_joint_angles','posture_findings','posture_guidance_steps',
    'posture_routine_suggestions'
  ] loop
    execute format('create trigger a_guard_posture_result_write before insert or update on public.%I for each row execute function autofit_integrity.guard_posture_result_write()',tbl);
  end loop;
end $$;
create trigger a_guard_posture_result_scope before insert or update
  on public.posture_repetitions for each row
  execute function autofit_integrity.guard_posture_result_scope();
create trigger a_guard_posture_result_scope before insert or update
  on public.posture_findings for each row
  execute function autofit_integrity.guard_posture_result_scope();
create trigger a_guard_posture_result_scope before insert or update
  on public.posture_routine_suggestions for each row
  execute function autofit_integrity.guard_posture_result_scope();
create trigger check_user_reference before insert or update
  on public.posture_analysis_jobs for each row
  execute function autofit_integrity.check_user_reference();
create trigger trg_posture_jobs_updated_at before update
  on public.posture_analysis_jobs for each row execute function public.set_updated_at();

do $$ declare tbl text; begin
  foreach tbl in array array[
    'posture_analysis_jobs','posture_assessments','posture_repetitions',
    'posture_joint_keypoints','posture_joint_angles','posture_findings',
    'posture_guidance_steps','posture_routine_suggestions'
  ] loop
    execute format('create trigger z_check_business_references before insert or update on public.%I for each row execute function autofit_integrity.check_business_references()',tbl);
    execute format('create trigger zzz_check_account_writable before insert or update on public.%I for each row execute function autofit_integrity.check_account_writable()',tbl);
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',tbl);
    execute format('grant select, insert, update on public.%I to service_role',tbl);
  end loop;
  foreach tbl in array array[
    'posture_analysis_jobs','posture_assessments','posture_repetitions','posture_findings',
    'user_workout_routine_items'
  ] loop
    execute format('create trigger protect_business_parent before delete or update on public.%I for each row execute function autofit_integrity.protect_business_parent()',tbl);
    execute format('create trigger business_parent_block_truncate before truncate on public.%I for each statement execute function autofit_integrity.block_parent_truncate()',tbl);
  end loop;
end $$;

comment on table public.posture_analysis_jobs is
  'E16/E17 temporary-video lifecycle; a terminal job cannot retain a Storage path.';
comment on table public.posture_assessments is
  'E18 immutable-intent score snapshot; never stores a raw frame or video.';
comment on table public.posture_joint_keypoints is
  'Normalized skeleton coordinates for one keyframe per repetition.';
comment on table public.posture_joint_angles is
  'Observed and model-versioned target angle snapshots, not approved clinical thresholds.';

-- Rollback only after stopping the API, deleting temporary Storage objects
-- through the Storage API and exporting/removing assessment data:
-- drop table public.posture_routine_suggestions, public.posture_guidance_steps,
--   public.posture_findings, public.posture_joint_angles, public.posture_joint_keypoints,
--   public.posture_repetitions, public.posture_assessments, public.posture_analysis_jobs;
-- drop function autofit_integrity.guard_posture_result_scope();
-- drop function autofit_integrity.guard_posture_result_write();
-- drop function autofit_integrity.guard_posture_job_completion();
