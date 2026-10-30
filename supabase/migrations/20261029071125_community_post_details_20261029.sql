-- Add the F3 post categories and searchable tags without changing existing posts.
alter table public.community_posts drop constraint community_posts_content_check;
alter table public.community_posts add constraint community_posts_content_check
  check (content is null or char_length(content) between 1 and 1000);
alter table public.community_posts
  add column category text not null default 'question'
    check (category in ('workout', 'routine', 'diet', 'question', 'review')),
  add column tags text[] not null default '{}'::text[]
    check (cardinality(tags) <= 5);
create index community_posts_category_feed_idx
  on public.community_posts(category, created_at desc, post_id desc)
  where repost_of_post_id is null and club_id is null and hidden_at is null;
create index community_posts_tags_idx on public.community_posts using gin(tags);

create or replace function public.community_post_view(p_viewer uuid, p_post public.community_posts)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'post_id', p_post.post_id,
    'author', public.community_author(p_post.user_id),
    'content', p_post.content,
    'images', p_post.images,
    'category', p_post.category,
    'tags', p_post.tags,
    'activity_snapshot', p_post.activity_snapshot,
    'like_count', p_post.like_count,
    'comment_count', p_post.comment_count,
    'repost_count', p_post.repost_count,
    'liked_by_me', exists (select 1 from public.community_post_likes l
      where l.post_id = p_post.post_id and l.user_id = p_viewer),
    'reposted_by_me', exists (select 1 from public.community_posts r
      where r.repost_of_post_id = p_post.post_id and r.user_id = p_viewer),
    'is_mine', p_post.user_id = p_viewer,
    'created_at', p_post.created_at)
$$;

-- Existing function keeps its lock order, upload claiming and hourly rate limit.
create or replace function public.community_create_post(p_user_id uuid, p_content text, p_upload_ids uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_content text := nullif(btrim(p_content), '');
  v_count integer := coalesce(cardinality(p_upload_ids), 0);
  v_found integer;
  v_images jsonb;
  v_post public.community_posts;
begin
  if p_user_id is null or v_count > 5
     or (v_content is null and v_count = 0)
     or char_length(v_content) > 1000
     or v_count <> (select count(distinct u) from unnest(p_upload_ids) u where u is not null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  perform public.community_require_nickname(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':community-post', 0));
  if (select count(*) from public.community_posts
      where user_id = p_user_id and repost_of_post_id is null
        and created_at > clock_timestamp() - interval '1 hour') >= 30 then
    raise exception using message = 'COMMUNITY_RATE_LIMITED', errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'path', u.storage_path, 'width', u.width, 'height', u.height) order by x.ord), '[]'::jsonb),
         count(*)
    into v_images, v_found
    from unnest(p_upload_ids) with ordinality as x(upload_id, ord)
    join public.community_uploads u on u.upload_id = x.upload_id
    where u.user_id = p_user_id and u.post_id is null;
  if v_found <> v_count then
    raise exception using message = 'COMMUNITY_UPLOAD_INVALID', errcode = 'P0001';
  end if;
  insert into public.community_posts(user_id, content, images)
    values (p_user_id, v_content, v_images) returning * into v_post;
  update public.community_uploads set post_id = v_post.post_id
    where upload_id = any(p_upload_ids) and user_id = p_user_id and post_id is null;
  get diagnostics v_found = row_count;
  if v_found <> v_count then
    raise exception using message = 'COMMUNITY_UPLOAD_INVALID', errcode = 'P0001';
  end if;
  return public.community_feed_item(p_user_id, v_post);
end;
$$;

-- Only completed sessions owned by the author can become a public card. The
-- snapshot intentionally contains no notes, pain reports, or health history.
create function public.community_activity_snapshot(p_user_id uuid, p_session_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_session public.exercise_sessions;
  v_names jsonb;
  v_first_name text;
begin
  select * into v_session from public.exercise_sessions
    where exercise_session_id = p_session_id and user_id = p_user_id and status = 'completed';
  if not found then
    raise exception using message = 'COMMUNITY_ACTIVITY_NOT_FOUND', errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(x.exercise_name order by x.performed_at), '[]'::jsonb)
    into v_names from (
      select l.exercise_name, min(l.performed_at) performed_at
      from public.exercise_logs l
      where l.exercise_session_id = p_session_id and l.user_id = p_user_id
        and l.completed and not l.skipped
      group by l.exercise_name order by min(l.performed_at) limit 3
    ) x;
  select l.exercise_name into v_first_name from public.exercise_logs l
    where l.exercise_session_id = p_session_id and l.user_id = p_user_id
      and l.completed and not l.skipped
    order by l.performed_at limit 1;
  return jsonb_build_object(
    'name', coalesce(v_first_name, '운동 기록'),
    'duration_minutes', round(v_session.total_duration_seconds / 60.0),
    'calories', round(v_session.total_calories_burned),
    'exercises', v_names);
end;
$$;

create function public.community_my_activities(p_user_id uuid, p_limit integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_limit is null or p_limit not between 1 and 20 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'session_id', s.exercise_session_id, 'completed_at', s.completed_at,
    'snapshot', public.community_activity_snapshot(p_user_id, s.exercise_session_id))
    order by s.completed_at desc, s.exercise_session_id desc)
    from (select exercise_session_id, completed_at from public.exercise_sessions
          where user_id = p_user_id and status = 'completed'
          order by completed_at desc, exercise_session_id desc limit p_limit) s), '[]'::jsonb);
end;
$$;

create function public.community_create_post_v2(
  p_user_id uuid, p_content text, p_upload_ids uuid[],
  p_category text, p_tags text[], p_club_id uuid, p_session_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb;
  v_post public.community_posts;
begin
  if p_user_id is null or p_category is null
     or p_category not in ('workout', 'routine', 'diet', 'question', 'review')
     or p_tags is null or cardinality(p_tags) > 5
     or exists (select 1 from unnest(p_tags) t
                where t is null or char_length(t) not between 1 and 20
                   or t <> btrim(t) or t ~ '[[:space:]#]')
     or (select count(distinct lower(t)) from unnest(p_tags) t) <> cardinality(p_tags) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_club_id is not null then
    perform public.community_visible_club(p_user_id, p_club_id);
    if not exists (select 1 from public.community_club_members m
                   where m.club_id = p_club_id and m.user_id = p_user_id) then
      raise exception using message = 'COMMUNITY_CLUB_MEMBERS_ONLY', errcode = 'P0001';
    end if;
  end if;
  v_item := public.community_create_post(p_user_id, p_content, p_upload_ids);
  update public.community_posts
    set category = p_category, tags = p_tags, club_id = p_club_id,
        exercise_session_id = p_session_id,
        activity_snapshot = case when p_session_id is null then null
          else public.community_activity_snapshot(p_user_id, p_session_id) end
    where post_id = (v_item->>'post_id')::uuid and user_id = p_user_id
    returning * into v_post;
  return public.community_feed_item(p_user_id, v_post);
end;
$$;

revoke all on function public.community_create_post_v2(uuid,text,uuid[],text,text[],uuid,uuid),
  public.community_activity_snapshot(uuid,uuid),
  public.community_my_activities(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.community_create_post_v2(uuid,text,uuid[],text,text[],uuid,uuid),
  public.community_activity_snapshot(uuid,uuid),
  public.community_my_activities(uuid,integer)
  to service_role;

-- Category pages use server-side filtering before pagination, with the same
-- visibility rules as the main timeline. Reposts inherit the source category.
create function public.community_category_timeline(
  p_viewer uuid, p_category text, p_before_created_at timestamptz,
  p_before_item_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_category not in ('workout', 'routine', 'diet', 'question', 'review')
     or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_item_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_feed_item(p_viewer, s.entry)
                     order by (s.entry).created_at desc, (s.entry).post_id desc)
    from (
      select f as entry
      from public.community_posts f
      left join public.community_posts o on o.post_id = f.repost_of_post_id
      where (p_before_created_at is null
             or (f.created_at, f.post_id) < (p_before_created_at, p_before_item_id))
        and coalesce(o.category, f.category) = p_category
        and f.hidden_at is null and o.hidden_at is null and f.club_id is null
        and not public.community_blocked_between(p_viewer, f.user_id)
        and (o.post_id is null or not public.community_blocked_between(p_viewer, o.user_id))
        and not exists (
          select 1 from public.community_reports r
          where r.reporter_user_id = p_viewer and r.target_type = 'post'
            and r.target_id = coalesce(f.repost_of_post_id, f.post_id))
      order by f.created_at desc, f.post_id desc
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;
revoke all on function public.community_category_timeline(uuid,text,timestamptz,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.community_category_timeline(uuid,text,timestamptz,uuid,integer)
  to service_role;

-- Rollback after removing v2 posts: drop function public.community_create_post_v2(uuid,text,uuid[],text,text[],uuid,uuid);
-- Restore the original community_create_post and community_post_view definitions from
-- 20261014062855_community_feed.sql before dropping category/tags columns and the 1000-char check.
