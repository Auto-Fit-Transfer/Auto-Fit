ALTER TABLE public.user_exercise_profiles DROP CONSTRAINT user_exercise_profiles_user_id_fkey;
COMMENT ON TABLE public.user_exercise_profiles IS 'One current exercise goal and experience level per user. Auto-Fit design principle: minimal logical units; no physical foreign keys. Reference existence, ownership, and related deletion are application responsibilities.';
COMMENT ON COLUMN public.user_exercise_profiles.user_id IS 'Logical reference to profiles.user_id; no physical foreign key or cascading delete. UNIQUE enforces one exercise profile per user.';
