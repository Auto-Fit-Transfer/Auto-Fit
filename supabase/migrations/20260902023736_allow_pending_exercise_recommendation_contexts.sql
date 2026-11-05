alter table public.exercise_recommendation_contexts
  alter column exercise_recommendation_id drop not null;

revoke all on table public.exercise_recommendation_contexts
  from anon, authenticated;

grant select, insert, update, delete
  on table public.exercise_recommendation_contexts
  to service_role;

comment on column public.exercise_recommendation_contexts.exercise_recommendation_id is
  'Nullable until the recommendation input context is processed and linked to a generated recommendation.';
