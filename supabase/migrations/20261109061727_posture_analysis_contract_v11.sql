-- Expand the persisted posture result contract without relabeling legacy rows.
-- The AI capabilities response remains the source of truth for valid key/code/view
-- combinations. The API checks that exact combination before inserting a job.
alter table public.posture_analysis_jobs
  drop constraint posture_analysis_jobs_exercise_code_check,
  drop constraint posture_analysis_jobs_camera_view_check,
  add column exercise_key text,
  add column analysis_side text,
  add column rule_version text,
  add column validation_status text,
  add column pending_video_path text,
  add constraint ck_posture_job_exercise_code
    check (exercise_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  add constraint ck_posture_job_camera_view
    check (camera_view in ('side', 'front')),
  add constraint ck_posture_job_exercise_key
    check (exercise_key is null or exercise_key ~ '^ex_[0-9a-f]{8,64}$'),
  add constraint ck_posture_job_rule_version
    check (rule_version is null or length(btrim(rule_version)) between 1 and 80),
  add constraint ck_posture_job_validation_status
    check (validation_status is null or validation_status in ('validated', 'experimental')),
  add constraint ck_posture_job_contract_metadata
    check ((exercise_key is null and rule_version is null and validation_status is null)
       or (exercise_key is not null and rule_version is not null and validation_status is not null)),
  add constraint ck_posture_job_pending_video_path
    check (pending_video_path is null or
      (status = 'awaiting_upload' and temporary_video_path is null and
       length(pending_video_path) between 40 and 512 and
       left(pending_video_path, length(user_id::text) + 1) = user_id::text || '/')),
  add constraint ck_posture_job_analysis_side
    check ((exercise_code in ('lunge', 'split_squat') and camera_view = 'side'
            and analysis_side is not null and analysis_side in ('left', 'right'))
       or (exercise_code not in ('lunge', 'split_squat') and analysis_side is null));

-- At most one unfinished upload/analysis per user. The API expires abandoned
-- awaiting_upload jobs before admitting another one.
create unique index idx_posture_jobs_one_active_per_user
  on public.posture_analysis_jobs (user_id)
  where status in ('awaiting_upload', 'processing', 'cleanup_pending');

-- Existing assessments predate Schema 1.1, so their new fields stay NULL.
alter table public.posture_assessments
  add column schema_version text,
  add column verdict text,
  add constraint ck_posture_assessment_contract
    check ((schema_version is null and verdict is null)
       or (schema_version is not null and verdict is not null
           and schema_version = '1.1'
           and verdict in ('within_current_rules', 'needs_correction'))),
  add constraint ck_posture_assessment_v11_passing_score
    check (schema_version is distinct from '1.1' or passing_score is null);

-- Keep the two legacy/reserved codes valid for historical records. The ten
-- current codes are checked against the selected AI rule version by the API.
alter table public.posture_joint_angles
  drop constraint posture_joint_angles_angle_code_check,
  add constraint posture_joint_angles_angle_code_check check (angle_code in (
    'torso_lean', 'knee_flexion', 'hip_flexion', 'ankle_dorsiflexion',
    'elbow_flexion', 'body_alignment', 'hip_extension', 'upper_arm_drift',
    'ankle_flexion', 'shoulder_abduction', 'leg_abduction', 'bilateral_asymmetry'
  ));

-- Profile identity is immutable just like the existing exercise code and view.
create function autofit_integrity.guard_posture_job_profile_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.exercise_key is distinct from old.exercise_key or
     new.analysis_side is distinct from old.analysis_side or
     new.rule_version is distinct from old.rule_version or
     new.validation_status is distinct from old.validation_status then
    raise exception 'Posture job profile identity is immutable' using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function autofit_integrity.guard_posture_job_profile_identity()
  from public, anon, authenticated, service_role;

create trigger a_guard_posture_job_profile_identity before update
  on public.posture_analysis_jobs for each row
  execute function autofit_integrity.guard_posture_job_profile_identity();

-- Only the backend service role accesses raw uploads. There are no public
-- object policies and the bucket is never exposed as a public asset URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posture-analysis-temp', 'posture-analysis-temp', false, 50000000,
        array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A stale upload must retain its Storage path until deletion succeeds. The
-- queue survives a deleted job/user so the backend can retry raw-video cleanup.
create table public.posture_pending_video_cleanup (
  posture_analysis_job_id uuid primary key,
  user_id uuid not null,
  video_path text not null unique,
  created_at timestamptz not null default now(),
  constraint ck_posture_pending_cleanup_path check (
    length(video_path) between 40 and 512 and
    left(video_path, length(user_id::text) + 1) = user_id::text || '/'
  )
);
create index idx_posture_pending_cleanup_oldest
  on public.posture_pending_video_cleanup (created_at);
alter table public.posture_pending_video_cleanup enable row level security;
revoke all on public.posture_pending_video_cleanup from public, anon, authenticated;
grant select, insert, delete on public.posture_pending_video_cleanup to service_role;

-- Compare-and-set the observed activity and pending path before terminating
-- an abandoned upload. Queue insertion and the terminal transition are atomic.
create function public.expire_stale_posture_upload(
  p_job_id uuid, p_user_id uuid, p_updated_at timestamptz, p_pending_path text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_job public.posture_analysis_jobs%rowtype;
begin
  select * into v_job from public.posture_analysis_jobs
    where posture_analysis_job_id = p_job_id and user_id = p_user_id for update;
  if not found or v_job.status <> 'awaiting_upload'
     or v_job.updated_at is distinct from p_updated_at
     or v_job.pending_video_path is distinct from p_pending_path
     or v_job.updated_at >= pg_catalog.now() - interval '15 minutes' then
    return false;
  end if;
  if p_pending_path is not null then
    insert into public.posture_pending_video_cleanup (
      posture_analysis_job_id, user_id, video_path
    ) values (p_job_id, p_user_id, p_pending_path);
  end if;
  update public.posture_analysis_jobs set
    status = 'failed', analysis_stage = 'failed', pending_video_path = null,
    failure_code = 'UPLOAD_TIMEOUT', finished_at = pg_catalog.now()
    where posture_analysis_job_id = p_job_id;
  return true;
end $$;
revoke all on function public.expire_stale_posture_upload(uuid, uuid, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.expire_stale_posture_upload(uuid, uuid, timestamptz, text)
  to service_role;

-- Rollback (after disabling the posture writer and removing temporary videos
-- through Storage API): drop this trigger/function, active-job unique index,
-- cleanup queue/RPC, the new job columns, two assessment columns and constraints, then
-- restore the old check limits.
notify pgrst, 'reload schema';
