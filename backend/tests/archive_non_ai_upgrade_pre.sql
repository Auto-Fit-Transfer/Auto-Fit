-- Used only with an isolated database and the paired post-check; both roll back.
begin;
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000210');

-- Reconstruct one pre-archive row inside the test transaction.
alter table public.exercise_recommendations
  drop constraint exercise_recommendations_ai_or_archived_check;
alter table public.exercise_recommendations
  disable trigger require_ai_exercise_recommendation_insert;
insert into public.exercise_recommendations (
  exercise_recommendation_id, user_id, recommendation_date, generator, status
) values (
  '00000000-0000-4000-8000-000000000211',
  '00000000-0000-4000-8000-000000000210',
  current_date, 'obsolete-rule-source', 'active'
);
alter table public.exercise_recommendations
  enable trigger require_ai_exercise_recommendation_insert;

insert into public.exercise_items (
  exercise_item_id, exercise_recommendation_id, exercise_name, sequence_order,
  duration_minutes
) values (
  '00000000-0000-4000-8000-000000000212',
  '00000000-0000-4000-8000-000000000211',
  '과거 운동', 1, 10
);
insert into public.exercise_sessions (
  exercise_session_id, user_id, exercise_recommendation_id,
  plan_session_id, planned_item_count, status
) values (
  '00000000-0000-4000-8000-000000000213',
  '00000000-0000-4000-8000-000000000210',
  '00000000-0000-4000-8000-000000000211',
  null, 2, 'in_progress'
);
insert into public.exercise_logs (
  user_id, exercise_item_id, exercise_name, performed_at,
  exercise_session_id, completed
) values (
  '00000000-0000-4000-8000-000000000210',
  '00000000-0000-4000-8000-000000000212',
  '과거 운동', now(),
  '00000000-0000-4000-8000-000000000213', true
);
insert into public.exercise_session_feedback (
  exercise_session_id, user_id, perceived_difficulty,
  post_condition, uncomfortable_areas
) values (
  '00000000-0000-4000-8000-000000000213',
  '00000000-0000-4000-8000-000000000210',
  3, 'normal', '[]'::jsonb
);
