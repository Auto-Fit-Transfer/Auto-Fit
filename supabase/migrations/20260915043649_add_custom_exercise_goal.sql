-- Version aligned with the remote migration applied through Supabase MCP.
begin;

alter table public.user_exercise_profiles
  add column custom_goal text,
  drop constraint user_exercise_profiles_goal_type_check,
  add constraint user_exercise_profiles_goal_type_check
    check (goal_type in ('weight_loss', 'muscle_gain', 'endurance',
                        'maintenance', 'rehabilitation', 'other')),
  add constraint user_exercise_profiles_custom_goal_check check (
    (goal_type = 'other' and custom_goal is not null
     and custom_goal = btrim(custom_goal)
     and char_length(custom_goal) between 1 and 200
     and custom_goal ~ '[^[:space:]]')
    or (goal_type <> 'other' and custom_goal is null)
  );

comment on column public.user_exercise_profiles.custom_goal is
  'Free-text exercise goal, required only for goal_type=other (1-200 characters).';

commit;
