-- E18's score graph needs the model's threshold as a result snapshot.
-- No default: the Figma value of 80 is an example, not an approved rule.
alter table public.posture_assessments
  add column passing_score smallint check (passing_score between 0 and 100);

-- The result skeleton and heel-contact finding also need foot landmarks.
alter table public.posture_joint_keypoints
  drop constraint posture_joint_keypoints_joint_code_check;
alter table public.posture_joint_keypoints
  add constraint posture_joint_keypoints_joint_code_check check (joint_code in (
    'head', 'neck', 'left_shoulder', 'right_shoulder',
    'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
    'left_hip', 'right_hip', 'left_knee', 'right_knee',
    'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
    'left_foot_index', 'right_foot_index'
  ));

comment on column public.posture_assessments.passing_score is
  'Model-versioned score reference shown in the repetition chart; no global default.';
