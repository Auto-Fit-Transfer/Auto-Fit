-- Applied community_feed is immutable. Fix the comment-delete lock order in a
-- separate migration: auth users -> post -> comment, matching account cleanup.
create or replace function public.community_delete_comment(p_user_id uuid, p_comment_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_comment public.community_comments;
  v_post_owner uuid;
  v_user uuid;
begin
  -- Read first to establish authorization; do not lock a child before its users.
  select c.* into v_comment from public.community_comments c where c.comment_id = p_comment_id;
  if found then
    select p.user_id into v_post_owner from public.community_posts p where p.post_id = v_comment.post_id;
  end if;
  if v_comment.comment_id is null or p_user_id is null or v_post_owner is null
     or (v_comment.user_id <> p_user_id and v_post_owner <> p_user_id) then
    raise exception using message = 'COMMUNITY_COMMENT_NOT_FOUND', errcode = 'P0001';
  end if;

  -- All referenced accounts precede any community row lock. A deterministic
  -- user order also keeps concurrent moderation requests consistent.
  for v_user in select distinct u from unnest(array[p_user_id, v_comment.user_id, v_post_owner]) as users(u)
    order by u loop
    if not public.community_account_writable(v_user) then
      if v_user = p_user_id then
        raise exception using message = 'COMMUNITY_ACCOUNT_UNAVAILABLE', errcode = 'P0001';
      end if;
      raise exception using message = 'COMMUNITY_COMMENT_NOT_FOUND', errcode = 'P0001';
    end if;
  end loop;

  perform 1 from public.community_posts
    where post_id = v_comment.post_id and user_id = v_post_owner for update;
  if not found then
    raise exception using message = 'COMMUNITY_COMMENT_NOT_FOUND', errcode = 'P0001';
  end if;
  -- Recheck after waiting. A concurrent delete must never decrement twice.
  perform 1 from public.community_comments
    where comment_id = p_comment_id and post_id = v_comment.post_id and user_id = v_comment.user_id
    for update;
  if not found then
    raise exception using message = 'COMMUNITY_COMMENT_NOT_FOUND', errcode = 'P0001';
  end if;
  delete from public.community_comments where comment_id = p_comment_id;
  update public.community_posts set comment_count = comment_count - 1 where post_id = v_comment.post_id;
  return jsonb_build_object('deleted', true, 'post_id', v_comment.post_id);
end;
$$;

-- CREATE OR REPLACE preserves the existing function owner and grants.
