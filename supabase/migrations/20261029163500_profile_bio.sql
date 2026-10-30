-- G2: optional community introduction, capped to the designed 50 characters.
alter table public.profiles
  add column bio varchar(50);

comment on column public.profiles.bio is 'Optional introduction shown on the community profile.';

create or replace function public.community_profile(p_viewer uuid, p_user_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_visible_user(p_viewer, p_user_id);
  return public.community_author(p_user_id) || jsonb_build_object(
    'bio', (select p.bio from public.profiles p where p.user_id = p_user_id),
    'post_count', (select count(*) from public.community_posts p
                   where p.user_id = p_user_id and p.repost_of_post_id is null),
    'follower_count', (select count(*) from public.community_follows f where f.following_user_id = p_user_id),
    'following_count', (select count(*) from public.community_follows f where f.follower_user_id = p_user_id),
    'is_me', p_user_id = p_viewer,
    'followed_by_me', exists (select 1 from public.community_follows f
      where f.follower_user_id = p_viewer and f.following_user_id = p_user_id),
    'follows_me', exists (select 1 from public.community_follows f
      where f.following_user_id = p_viewer and f.follower_user_id = p_user_id));
end;
$$;

-- Rollback after removing bio from API clients:
-- alter table public.profiles drop column bio;
