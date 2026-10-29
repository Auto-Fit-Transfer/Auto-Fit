-- A shared workout card keeps its origin and a public, user-approved snapshot.
-- The snapshot avoids silently changing an old post after a routine is edited.
alter table public.community_posts
  add column exercise_session_id uuid,
  add column exercise_recommendation_id uuid,
  add column activity_snapshot jsonb,
  add constraint ck_community_posts_activity_source check (
    (num_nonnulls(exercise_session_id, exercise_recommendation_id) = 0
      and activity_snapshot is null)
    or
    (num_nonnulls(exercise_session_id, exercise_recommendation_id) = 1
      and jsonb_typeof(activity_snapshot) = 'object')
  );

create index idx_community_posts_exercise_session
  on public.community_posts(exercise_session_id) where exercise_session_id is not null;
create index idx_community_posts_exercise_recommendation
  on public.community_posts(exercise_recommendation_id)
  where exercise_recommendation_id is not null;

insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column) values
  ('community_posts','exercise_session_id','exercise_sessions','exercise_session_id'),
  ('community_posts','exercise_recommendation_id','exercise_recommendations','exercise_recommendation_id');

-- The existing owner is community_posts.user_id. The shared source must match it.
create trigger z_check_business_references before insert or update on public.community_posts
  for each row execute function autofit_integrity.check_business_references();

comment on column public.community_posts.activity_snapshot is
  'Only the workout values intentionally shared in the post, not a complete private session.';

-- Rollback after posts with workout cards have been removed:
-- delete from autofit_integrity.business_references
--   where child_table = 'community_posts'
--     and child_column in ('exercise_session_id','exercise_recommendation_id');
-- drop trigger z_check_business_references on public.community_posts;
-- alter table public.community_posts drop constraint ck_community_posts_activity_source,
--   drop column activity_snapshot, drop column exercise_recommendation_id,
--   drop column exercise_session_id;
