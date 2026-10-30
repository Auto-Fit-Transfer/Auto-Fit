-- Community moderation: moderators review reports and hide (or restore) posts and comments.
-- Requires 20261019022924_community_club_management.sql. Applied files stay untouched; this file
-- adds two tables and hidden_at columns, and replaces four read functions in place so hidden
-- content disappears everywhere:
--   public.community_visible_post(...)  hidden posts are not found (detail, likes, comments);
--   public.community_comments(...)      hidden comments are left out;
--   public.community_timeline(...)      hidden posts (and reposts of them) are left out;
--   public.community_club_feed(...)     the same for club posts.
-- Moderators are added by the DB owner with SQL (insert into community_moderators). Reporters
-- stay anonymous to moderators. Decisions go to their own table instead of updating reports, so
-- a reporter who is leaving the service never blocks a decision.

create table public.community_moderators (
  user_id uuid primary key,
  note text,
  added_at timestamptz not null default clock_timestamp()
);

-- One row per decision about a target; the newest one is the current state. Reports newer than
-- the newest decision make the target open again.
create table public.community_report_resolutions (
  resolution_id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  target_id uuid not null,
  action text not null check (action in ('hide', 'unhide', 'dismiss')),
  user_id uuid not null, -- the moderator
  created_at timestamptz not null default clock_timestamp()
);
create index community_report_resolutions_target_idx
  on public.community_report_resolutions(target_type, target_id, created_at desc);

alter table public.community_posts add column hidden_at timestamptz;
alter table public.community_comments add column hidden_at timestamptz;

alter table public.community_moderators enable row level security;
alter table public.community_report_resolutions enable row level security;
revoke all on public.community_moderators, public.community_report_resolutions
  from public, anon, authenticated;
-- Moderators are managed by the DB owner only.
grant select on public.community_moderators to service_role;
grant select, insert, update, delete on public.community_report_resolutions to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['community_moderators', 'community_report_resolutions'] loop
    execute format('create trigger check_user_reference before insert or update on public.%I
      for each row execute function autofit_integrity.check_user_reference()', t);
    execute format('create trigger zzz_check_account_writable before insert or update on public.%I
      for each row execute function autofit_integrity.check_account_writable()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hidden content leaves the read functions
-- ---------------------------------------------------------------------------

-- Same as in 20261014062855, plus hidden posts (the original of a repost included).
create or replace function public.community_visible_post(p_viewer uuid, p_post_id uuid)
returns public.community_posts language plpgsql stable security invoker set search_path = '' as $$
declare
  v_post public.community_posts;
begin
  select * into v_post from public.community_posts where post_id = p_post_id;
  if found and v_post.repost_of_post_id is not null then
    select * into v_post from public.community_posts where post_id = v_post.repost_of_post_id;
  end if;
  if not found
     or v_post.hidden_at is not null
     or public.community_blocked_between(p_viewer, v_post.user_id)
     or exists (
       select 1 from public.community_reports r
       where r.reporter_user_id = p_viewer and r.target_type = 'post' and r.target_id = v_post.post_id) then
    raise exception using message = 'COMMUNITY_POST_NOT_FOUND', errcode = 'P0001';
  end if;
  return v_post;
end;
$$;

-- Same as in 20261014062855, plus hidden comments.
create or replace function public.community_comments(
  p_viewer uuid, p_post_id uuid, p_after_created_at timestamptz, p_after_comment_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_post public.community_posts;
begin
  if p_viewer is null or p_post_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_after_created_at is null) <> (p_after_comment_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  v_post := public.community_visible_post(p_viewer, p_post_id);
  return coalesce((
    select jsonb_agg(public.community_comment_view(p_viewer, v_post.user_id, s.c)
                     order by (s.c).created_at, (s.c).comment_id)
    from (
      select c
      from public.community_comments c
      where c.post_id = v_post.post_id
        and c.hidden_at is null
        and (p_after_created_at is null
             or (c.created_at, c.comment_id) > (p_after_created_at, p_after_comment_id))
        and not public.community_blocked_between(p_viewer, c.user_id)
        and not exists (
          select 1 from public.community_reports r
          where r.reporter_user_id = p_viewer and r.target_type = 'comment'
            and r.target_id = c.comment_id)
      order by c.created_at, c.comment_id
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

-- Same as in 20261015062629, plus hidden posts and reposts of hidden posts.
create or replace function public.community_timeline(
  p_viewer uuid, p_scope text, p_user_id uuid,
  p_before_created_at timestamptz, p_before_item_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_scope is null or p_scope not in ('all', 'following', 'user')
     or (p_scope = 'user') <> (p_user_id is not null)
     or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_item_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_scope = 'user' then
    perform public.community_require_visible_user(p_viewer, p_user_id);
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
        and f.hidden_at is null and o.hidden_at is null
        and (p_scope = 'user' or f.club_id is null)
        and case p_scope
              when 'user' then f.user_id = p_user_id
              when 'following' then f.user_id = p_viewer or exists (
                select 1 from public.community_follows w
                where w.follower_user_id = p_viewer and w.following_user_id = f.user_id)
              else true end
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

-- Same as in 20261015062629, plus hidden posts.
create or replace function public.community_club_feed(
  p_viewer uuid, p_club_id uuid, p_before_created_at timestamptz, p_before_item_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_club_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_item_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_visible_club(p_viewer, p_club_id);
  return coalesce((
    select jsonb_agg(public.community_feed_item(p_viewer, s.entry)
                     order by (s.entry).created_at desc, (s.entry).post_id desc)
    from (
      select f as entry
      from public.community_posts f
      where f.club_id = p_club_id
        and f.hidden_at is null
        and (p_before_created_at is null
             or (f.created_at, f.post_id) < (p_before_created_at, p_before_item_id))
        and not public.community_blocked_between(p_viewer, f.user_id)
        and not exists (
          select 1 from public.community_reports r
          where r.reporter_user_id = p_viewer and r.target_type = 'post' and r.target_id = f.post_id)
      order by f.created_at desc, f.post_id desc
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderator API
-- ---------------------------------------------------------------------------

create function public.community_is_moderator(p_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.community_moderators m where m.user_id = p_user_id)
$$;

create function public.community_require_moderator(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.community_require_writable(p_user_id);
  if not public.community_is_moderator(p_user_id) then
    raise exception using message = 'COMMUNITY_FORBIDDEN', errcode = 'P0001';
  end if;
end;
$$;

create function public.community_moderator_status(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('is_moderator', public.community_is_moderator(p_user_id))
$$;

-- Reported targets, newest report first, at most p_limit. status 'open' = reported after the
-- latest decision (or never decided); 'resolved' = decided since the last report.
create function public.community_report_queue(p_moderator uuid, p_status text, p_limit integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_moderator is null or p_status is null or p_status not in ('open', 'resolved')
     or p_limit is null or p_limit not between 1 and 100 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if not public.community_is_moderator(p_moderator) then
    raise exception using message = 'COMMUNITY_FORBIDDEN', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'target_type', q.target_type,
        'target_id', q.target_id,
        'target_user', public.community_author(q.target_user_id),
        'report_count', q.report_count,
        'reasons', q.reasons,
        'details', q.details,
        'content_snapshot', q.snapshot,
        'latest_reported_at', q.latest_at,
        'post_id', case q.target_type when 'post' then q.target_id
                   when 'comment' then (select c.post_id from public.community_comments c where c.comment_id = q.target_id) end,
        'exists', case q.target_type
          when 'post' then exists (select 1 from public.community_posts p where p.post_id = q.target_id)
          when 'comment' then exists (select 1 from public.community_comments c where c.comment_id = q.target_id)
          else exists (select 1 from public.profiles p where p.user_id = q.target_id) end,
        'hidden', case q.target_type
          when 'post' then exists (select 1 from public.community_posts p
                                   where p.post_id = q.target_id and p.hidden_at is not null)
          when 'comment' then exists (select 1 from public.community_comments c
                                      where c.comment_id = q.target_id and c.hidden_at is not null)
          else false end,
        'last_action', q.last_action,
        'last_action_at', q.last_action_at)
      order by q.latest_at desc, q.target_id)
    from (
      select r.target_type, r.target_id,
             (array_agg(r.target_user_id order by r.created_at desc))[1] as target_user_id,
             count(*)::integer as report_count,
             to_jsonb(array_agg(distinct r.reason)) as reasons,
             coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'detail', r.detail)
                                order by r.created_at desc) filter (where r.detail is not null), '[]'::jsonb) as details,
             (array_agg(r.content_snapshot order by r.created_at desc))[1] as snapshot,
             max(r.created_at) as latest_at,
             d.action as last_action, d.created_at as last_action_at
      from public.community_reports r
      left join lateral (
        select x.action, x.created_at from public.community_report_resolutions x
        where x.target_type = r.target_type and x.target_id = r.target_id
        order by x.created_at desc limit 1) d on true
      group by r.target_type, r.target_id, d.action, d.created_at
      having (p_status = 'open') = (d.created_at is null or max(r.created_at) > d.created_at)
      order by max(r.created_at) desc, r.target_id
      limit p_limit
    ) q), '[]'::jsonb);
end;
$$;

-- hide / unhide (posts and comments) or dismiss (any target). Lock order: moderator and target
-- owner (auth rows) first, then the post or comment row.
create function public.community_moderate(
  p_moderator uuid, p_target_type text, p_target_id uuid, p_action text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid;
begin
  if p_moderator is null or p_target_id is null
     or p_target_type is null or p_target_type not in ('post', 'comment', 'user')
     or p_action is null or p_action not in ('hide', 'unhide', 'dismiss')
     or (p_target_type = 'user' and p_action <> 'dismiss') then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_moderator(p_moderator);
  if p_action <> 'dismiss' then
    if p_target_type = 'post' then
      select p.user_id into v_owner from public.community_posts p
        where p.post_id = p_target_id and p.repost_of_post_id is null;
    else
      select c.user_id into v_owner from public.community_comments c where c.comment_id = p_target_id;
    end if;
    -- A target whose author is leaving disappears with the account anyway.
    if v_owner is null or not public.community_account_writable(v_owner) then
      raise exception using message = 'COMMUNITY_TARGET_NOT_FOUND', errcode = 'P0001';
    end if;
    if p_target_type = 'post' then
      update public.community_posts
        set hidden_at = case p_action when 'hide' then clock_timestamp() end
        where post_id = p_target_id;
    else
      update public.community_comments
        set hidden_at = case p_action when 'hide' then clock_timestamp() end
        where comment_id = p_target_id;
    end if;
    if not found then
      raise exception using message = 'COMMUNITY_TARGET_NOT_FOUND', errcode = 'P0001';
    end if;
  end if;
  insert into public.community_report_resolutions(target_type, target_id, action, user_id)
    values (p_target_type, p_target_id, p_action, p_moderator);
  return jsonb_build_object('target_type', p_target_type, 'target_id', p_target_id, 'action', p_action);
end;
$$;

revoke all on function
  public.community_is_moderator(uuid),
  public.community_require_moderator(uuid),
  public.community_moderator_status(uuid),
  public.community_report_queue(uuid, text, integer),
  public.community_moderate(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.community_is_moderator(uuid),
  public.community_require_moderator(uuid),
  public.community_moderator_status(uuid),
  public.community_report_queue(uuid, text, integer),
  public.community_moderate(uuid, text, uuid, text)
  to service_role;
