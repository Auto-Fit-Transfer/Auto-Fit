-- E17 polling state. The backend owns progress updates; the mobile app reads
-- them through an authenticated API, never through a direct table grant.
alter table public.posture_analysis_jobs
  add column analysis_stage text not null default 'waiting'
    check (analysis_stage in (
      'waiting','joint_detection','posture_scoring','result_summary','complete','failed'
    )),
  add column progress_percent smallint not null default 0
    check (progress_percent between 0 and 100),
  add column processed_frames integer not null default 0
    check (processed_frames >= 0),
  add column total_frames integer check (total_frames > 0),
  add column detected_repetitions smallint not null default 0
    check (detected_repetitions between 0 and 20);

alter table public.posture_analysis_jobs
  add constraint ck_posture_progress_frames check (
    total_frames is null or processed_frames <= total_frames
  ),
  add constraint ck_posture_progress_status check (
    (status = 'awaiting_upload' and analysis_stage = 'waiting' and progress_percent = 0)
    or (status = 'processing' and analysis_stage in (
      'joint_detection','posture_scoring','result_summary'
    ) and progress_percent < 100)
    or (status = 'cleanup_pending' and analysis_stage = 'result_summary'
      and progress_percent < 100)
    or (status = 'completed' and analysis_stage = 'complete'
      and progress_percent = 100)
    or (status = 'failed' and analysis_stage = 'failed')
  );

comment on column public.posture_analysis_jobs.analysis_stage is
  'E17 processing stage for authenticated backend polling.';
comment on column public.posture_analysis_jobs.progress_percent is
  'UI progress, 0-100; completed jobs must be 100.';
