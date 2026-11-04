-- G10: list one's comments and liked posts without reading someone else's activity.
create index community_post_likes_activity_idx
  on public.community_post_likes(user_id, created_at desc, post_id desc);
create index community_comments_activity_idx
  on public.community_comments(user_id, created_at desc, comment_id desc)
  where hidden_at is null;

create function public.community_my_activity(
  p_user_id uuid, p_kind text, p_before_created_at timestamptz,
  p_before_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_kind not in ('comments', 'likes') or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'activity_id', s.activity_id,
      'occurred_at', s.created_at,
      'detail', s.detail,
      'post', public.community_feed_item(p_user_id, s.post))
      order by s.created_at desc, s.activity_id desc)
    from (
      select e.activity_id, e.created_at, e.detail, p as post
      from (
        select c.comment_id as activity_id, c.post_id, c.created_at, c.content as detail
          from public.community_comments c
          where p_kind = 'comments' and c.user_id = p_user_id and c.hidden_at is null
        union all
        select l.post_id as activity_id, l.post_id, l.created_at, null::text as detail
          from public.community_post_likes l
          where p_kind = 'likes' and l.user_id = p_user_id
      ) e
      join public.community_posts p on p.post_id = e.post_id
      where p.repost_of_post_id is null and p.hidden_at is null
        and not public.community_blocked_between(p_user_id, p.user_id)
        and not exists (select 1 from public.community_reports r
          where r.reporter_user_id = p_user_id and r.target_type = 'post' and r.target_id = p.post_id)
        and (p_before_created_at is null or
          (e.created_at, e.activity_id) < (p_before_created_at, p_before_id))
      order by e.created_at desc, e.activity_id desc
      limit p_limit
    ) s
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.community_my_activity(uuid, text, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.community_my_activity(uuid, text, timestamptz, uuid, integer)
  to service_role;

-- Rollback: drop function public.community_my_activity(uuid, text, timestamptz, uuid, integer);
-- drop index public.community_post_likes_activity_idx;
-- drop index public.community_comments_activity_idx;
