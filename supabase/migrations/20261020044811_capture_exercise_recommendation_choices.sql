-- Main exercise settings: retain the exact user choices that produced a routine.
-- Existing recommendations keep NULL/empty values because those inputs were not recorded.
alter table public.exercise_recommendation_contexts
  add column focus_areas text[] not null default '{}'::text[]
    check (cardinality(focus_areas) <= 10),
  add column training_method text
    check (training_method in ('machine', 'free_weight', 'any')),
  add column workout_style text
    check (workout_style in ('quiet', 'sweaty'));

comment on column public.exercise_recommendation_contexts.focus_areas is
  'User-selected focus areas such as upper_body, lower_body, or full_body.';
comment on column public.exercise_recommendation_contexts.training_method is
  'Gym preference: machine, free_weight, or any.';
comment on column public.exercise_recommendation_contexts.workout_style is
  'Home workout preference: quiet or sweaty.';

-- Rollback after dependent code stops writing the new choices:
-- alter table public.exercise_recommendation_contexts
--   drop column workout_style, drop column training_method, drop column focus_areas;
