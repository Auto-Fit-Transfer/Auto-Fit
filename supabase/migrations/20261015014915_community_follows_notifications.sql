-- Community stage 2: follows, profiles, following/user timelines and notifications.
-- The applied community migrations (20261014062855, 20261015005534) stay untouched. This file
-- adds two tables and new functions, and replaces two existing functions in place:
--   autofit_integrity.check_community_pair_writable()  also guards the two new tables;
--   public.community_delete_user_data(uuid)            also cleans them, and runs concurrent
--                                                      account deletions one at a time.
-- Existing RPCs are unchanged: notifications follow likes, comments, reposts and follows
-- through triggers, and a block removes follows through a trigger.

create table public.community_follows (
  follower_user_id uuid not null,
  following_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (follower_user_id, following_user_id),
  check (follower_user_id <> following_user_id)
);
create index community_follows_followers_idx
  on public.community_follows(following_user_id, created_at desc, follower_user_id desc);
create index community_follows_following_idx
  on public.community_follows(follower_user_id, created_at desc, following_user_id desc);

-- One row per event shown to user_id. A like, repost or follow is kept once per actor and
-- target; undoing it removes the row (triggers below).
create table public.community_notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_user_id uuid not null,
  type text not null check (type in ('follow', 'like', 'comment', 'repost')),
  post_id uuid,
  comment_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  constraint community_notifications_target_check check (
    case type
      when 'follow' then post_id is null and comment_id is null
      when 'comment' then post_id is not null and comment_id is not null
      else post_id is not null and comment_id is null end),
  check (user_id <> actor_user_id)
);
create index community_notifications_inbox_idx
  on public.community_notifications(user_id, created_at desc, notification_id desc);
create index community_notifications_unread_idx on public.community_notifications(user_id)
  where read_at is null;
create index community_notifications_actor_idx on public.community_notifications(actor_user_id);
create index community_notifications_post_idx on public.community_notifications(post_id)
  where post_id is not null;
create index community_notifications_comment_idx on public.community_notifications(comment_id)
  where comment_id is not null;
create unique index community_notifications_follow_once_idx
  on public.community_notifications(user_id, actor_user_id) where type = 'follow';
create unique index community_notifications_reaction_once_idx
  on public.community_notifications(user_id, actor_user_id, type, post_id) where type in ('like', 'repost');

alter table public.community_follows enable row level security;
alter table public.community_notifications enable row level security;
revoke all on public.community_follows, public.community_notifications from public, anon, authenticated;
grant select, insert, update, delete on public.community_follows, public.community_notifications
  to service_role;

-- ---------------------------------------------------------------------------
-- Account-deletion write guards for the new tables
-- ---------------------------------------------------------------------------

-- Same as in 20261014062855 for reports and blocks; adds follows (two users) and the
-- notification actor (the recipient is user_id, covered by the stock guards below).
create or replace function autofit_integrity.check_community_pair_writable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'community_reports' then
    perform autofit_integrity.assert_account_writable(new.reporter_user_id);
    perform autofit_integrity.assert_account_writable(new.target_user_id);
  elsif tg_table_name = 'community_blocks' then
    perform autofit_integrity.assert_account_writable(new.blocker_user_id);
    perform autofit_integrity.assert_account_writable(new.blocked_user_id);
  elsif tg_table_name = 'community_follows' then
    perform autofit_integrity.assert_account_writable(new.follower_user_id);
    perform autofit_integrity.assert_account_writable(new.following_user_id);
  elsif tg_table_name = 'community_notifications' then
    perform autofit_integrity.assert_account_writable(new.actor_user_id);
  else
    raise exception 'check_community_pair_writable is not set up for %', tg_table_name;
  end if;
  return new;
end;
$$;

create trigger check_user_reference before insert or update on public.community_notifications
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable before insert or update on public.community_notifications
  for each row execute function autofit_integrity.check_account_writable();
-- Insert only: marking notifications read must keep working after an actor starts leaving.
create trigger zzz_check_actor_writable before insert on public.community_notifications
  for each row execute function autofit_integrity.check_community_pair_writable();
create trigger zzz_check_account_writable before insert or update on public.community_follows
  for each row execute function autofit_integrity.check_community_pair_writable();

-- ---------------------------------------------------------------------------
-- Notifications and block side effects (triggers)
-- ---------------------------------------------------------------------------

-- Runs inside the RPC that inserted the row, which has already checked both accounts (lock
-- order auth users -> post -> rows), so the guards on the notification wait for nothing new.
create function public.community_notify()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid;
begin
  if tg_table_name = 'community_follows' then
    insert into public.community_notifications(user_id, actor_user_id, type)
      values (new.following_user_id, new.follower_user_id, 'follow') on conflict do nothing;
  elsif tg_table_name = 'community_post_likes' then
    select p.user_id into v_owner from public.community_posts p where p.post_id = new.post_id;
    if v_owner <> new.user_id then
      insert into public.community_notifications(user_id, actor_user_id, type, post_id)
        values (v_owner, new.user_id, 'like', new.post_id) on conflict do nothing;
    end if;
  elsif tg_table_name = 'community_comments' then
    select p.user_id into v_owner from public.community_posts p where p.post_id = new.post_id;
    if v_owner <> new.user_id then
      insert into public.community_notifications(user_id, actor_user_id, type, post_id, comment_id)
        values (v_owner, new.user_id, 'comment', new.post_id, new.comment_id);
    end if;
  else
    select p.user_id into v_owner from public.community_posts p where p.post_id = new.repost_of_post_id;
    if v_owner <> new.user_id then
      insert into public.community_notifications(user_id, actor_user_id, type, post_id)
        values (v_owner, new.user_id, 'repost', new.repost_of_post_id) on conflict do nothing;
    end if;
  end if;
  return null;
end;
$$;

create trigger community_notify after insert on public.community_follows
  for each row execute function public.community_notify();
create trigger community_notify after insert on public.community_post_likes
  for each row execute function public.community_notify();
create trigger community_notify after insert on public.community_comments
  for each row execute function public.community_notify();
create trigger community_notify after insert on public.community_posts
  for each row when (new.repost_of_post_id is not null) execute function public.community_notify();

-- Undoing an action, deleting a post or comment, or account cleanup drops its notifications.
create function public.community_drop_notifications()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'community_follows' then
    delete from public.community_notifications n using gone g
      where n.type = 'follow' and n.user_id = g.following_user_id and n.actor_user_id = g.follower_user_id;
  elsif tg_table_name = 'community_post_likes' then
    delete from public.community_notifications n using gone g
      where n.type = 'like' and n.post_id = g.post_id and n.actor_user_id = g.user_id;
  elsif tg_table_name = 'community_comments' then
    delete from public.community_notifications n using gone g where n.comment_id = g.comment_id;
  else
    delete from public.community_notifications n using gone g
      where n.post_id = g.post_id
         or (n.type = 'repost' and n.post_id = g.repost_of_post_id and n.actor_user_id = g.user_id);
  end if;
  return null;
end;
$$;

create trigger community_drop_notifications after delete on public.community_follows
  referencing old table as gone for each statement execute function public.community_drop_notifications();
create trigger community_drop_notifications after delete on public.community_post_likes
  referencing old table as gone for each statement execute function public.community_drop_notifications();
create trigger community_drop_notifications after delete on public.community_comments
  referencing old table as gone for each statement execute function public.community_drop_notifications();
create trigger community_drop_notifications after delete on public.community_posts
  referencing old table as gone for each statement execute function public.community_drop_notifications();

-- Follow and block for the same two users take turns, so a follow cannot slip in beside a
-- block that is being created.
create function public.community_lock_pair(p_a uuid, p_b uuid)
returns void language sql security invoker set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(
    least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text || ':community-pair', 0))
$$;

-- Blocking removes follows in both directions (community_set_block already checked both users).
create function public.community_unfollow_on_block()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.community_lock_pair(new.blocker_user_id, new.blocked_user_id);
  delete from public.community_follows
    where (follower_user_id = new.blocker_user_id and following_user_id = new.blocked_user_id)
       or (follower_user_id = new.blocked_user_id and following_user_id = new.blocker_user_id);
  return null;
end;
$$;
create trigger community_unfollow_on_block after insert on public.community_blocks
  for each row execute function public.community_unfollow_on_block();

-- ---------------------------------------------------------------------------
-- API functions
-- ---------------------------------------------------------------------------

-- Not found when the user has no profile or either user blocked the other.
create function public.community_require_visible_user(p_viewer uuid, p_user_id uuid)
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.user_id = p_user_id)
     or public.community_blocked_between(p_viewer, p_user_id) then
    raise exception using message = 'COMMUNITY_USER_NOT_FOUND', errcode = 'P0001';
  end if;
end;
$$;

create function public.community_profile(p_viewer uuid, p_user_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_visible_user(p_viewer, p_user_id);
  return public.community_author(p_user_id) || jsonb_build_object(
    'post_count', (select count(*) from public.community_posts p
                   where p.user_id = p_user_id and p.repost_of_post_id is null),
    'follower_count', (select count(*) from public.community_follows f where f.following_user_id = p_user_id),
    'following_count', (select count(*) from public.community_follows f where f.follower_user_id = p_user_id),
    'is_me', p_user_id = p_viewer,
    'followed_by_me', exists (select 1 from public.community_follows f
      where f.follower_user_id = p_viewer and f.following_user_id = p_user_id),
    'follows_me', exists (select 1 from public.community_follows f
      where f.follower_user_id = p_user_id and f.following_user_id = p_viewer));
end;
$$;

create function public.community_set_follow(p_user_id uuid, p_target_user_id uuid, p_following boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_target_user_id is null or p_following is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_user_id = p_target_user_id then
    raise exception using message = 'COMMUNITY_SELF_TARGET', errcode = 'P0001';
  end if;
  if p_following then
    -- Both accounts (auth rows) before the follow row: the same order as account deletion.
    perform public.community_require_writable(p_user_id);
    if not exists (select 1 from public.profiles p where p.user_id = p_target_user_id)
       or not public.community_account_writable(p_target_user_id) then
      raise exception using message = 'COMMUNITY_USER_NOT_FOUND', errcode = 'P0001';
    end if;
    perform public.community_require_nickname(p_user_id);
    perform public.community_lock_pair(p_user_id, p_target_user_id);
    if public.community_blocked_between(p_user_id, p_target_user_id) then
      raise exception using message = 'COMMUNITY_USER_NOT_FOUND', errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':community-follow', 0));
    if (select count(*) from public.community_follows
        where follower_user_id = p_user_id and created_at > clock_timestamp() - interval '1 hour') >= 100 then
      raise exception using message = 'COMMUNITY_RATE_LIMITED', errcode = 'P0001';
    end if;
    insert into public.community_follows(follower_user_id, following_user_id)
      values (p_user_id, p_target_user_id) on conflict do nothing;
  else
    delete from public.community_follows
      where follower_user_id = p_user_id and following_user_id = p_target_user_id;
  end if;
  return jsonb_build_object('user_id', p_target_user_id, 'following', p_following,
    'follower_count', (select count(*) from public.community_follows f
                       where f.following_user_id = p_target_user_id));
end;
$$;

-- Newest first, keyset paginated like community_feed. Scopes: 'all'; 'following' = people the
-- viewer follows plus the viewer; 'user' = one user's posts and reposts (p_user_id).
create function public.community_timeline(
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

-- Followers or followings of p_user_id, most recent first; users blocked with the viewer are hidden.
create function public.community_follow_list(
  p_viewer uuid, p_user_id uuid, p_kind text,
  p_before_created_at timestamptz, p_before_user_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_user_id is null or p_kind is null or p_kind not in ('followers', 'following')
     or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_user_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_visible_user(p_viewer, p_user_id);
  return coalesce((
    select jsonb_agg(public.community_author(s.other) || jsonb_build_object(
        'followed_at', s.created_at,
        'is_me', s.other = p_viewer,
        'followed_by_me', exists (select 1 from public.community_follows m
          where m.follower_user_id = p_viewer and m.following_user_id = s.other))
      order by s.created_at desc, s.other desc)
    from (
      select x.other, f.created_at
      from public.community_follows f
      cross join lateral (select case p_kind when 'followers' then f.follower_user_id
                                             else f.following_user_id end as other) x
      where (case p_kind when 'followers' then f.following_user_id else f.follower_user_id end) = p_user_id
        and (p_before_created_at is null or (f.created_at, x.other) < (p_before_created_at, p_before_user_id))
        and not public.community_blocked_between(p_viewer, x.other)
      order by f.created_at desc, x.other desc
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

-- Hides notifications from blocked users and about comments the viewer reported.
create function public.community_notification_visible(p_viewer uuid, p_notification public.community_notifications)
returns boolean language sql stable security invoker set search_path = '' as $$
  select not public.community_blocked_between(p_viewer, p_notification.actor_user_id)
    and not exists (
      select 1 from public.community_reports r
      where r.reporter_user_id = p_viewer and r.target_type = 'comment'
        and r.target_id = p_notification.comment_id)
$$;

create function public.community_notification_list(
  p_user_id uuid, p_before_created_at timestamptz, p_before_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'notification_id', (s.n).notification_id,
        'type', (s.n).type,
        'actor', public.community_author((s.n).actor_user_id),
        'post_id', (s.n).post_id,
        'comment_id', (s.n).comment_id,
        'post_preview', (select left(p.content, 80) from public.community_posts p
                         where p.post_id = (s.n).post_id),
        'comment_preview', (select left(c.content, 80) from public.community_comments c
                            where c.comment_id = (s.n).comment_id),
        'created_at', (s.n).created_at,
        'is_read', (s.n).read_at is not null)
      order by (s.n).created_at desc, (s.n).notification_id desc)
    from (
      select n
      from public.community_notifications n
      where n.user_id = p_user_id
        and (p_before_created_at is null
             or (n.created_at, n.notification_id) < (p_before_created_at, p_before_id))
        and public.community_notification_visible(p_user_id, n)
      order by n.created_at desc, n.notification_id desc
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

create function public.community_unread_notification_count(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('unread_count', count(*))
  from public.community_notifications n
  where n.user_id = p_user_id and n.read_at is null
    and public.community_notification_visible(p_user_id, n)
$$;

create function public.community_read_notifications(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  update public.community_notifications set read_at = clock_timestamp()
    where user_id = p_user_id and read_at is null;
  return jsonb_build_object('unread_count', 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

-- Same as in 20261014062855, plus the serialization lock and the two new tables.
create or replace function public.community_delete_user_data(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  -- Concurrent account deletions clean community rows one at a time. Without this, two leaving
  -- users with likes or comments on each other's posts delete the same rows in opposite orders
  -- (40P01), and two leaving users can fix a third user's counters in different orders. Each
  -- deletion already holds its own auth.users row; the cleanup skips posts of other leaving
  -- users (begin_account_deletion runs first), so it never waits on another leaving account.
  perform pg_advisory_xact_lock(hashtextextended('community:account-deletion', 0));
  -- Posts whose authors are also mid-deletion disappear anyway; updating them would trip the
  -- write guard and block this deletion until the other one finishes.
  update public.community_posts o set like_count = o.like_count - x.n
    from (select post_id, count(*)::integer as n from public.community_post_likes
          where user_id = p_user_id group by post_id) x
    where o.post_id = x.post_id and o.user_id <> p_user_id
      and not exists (select 1 from autofit_integrity.account_deletions d where d.user_id = o.user_id);
  update public.community_posts o set comment_count = o.comment_count - x.n
    from (select post_id, count(*)::integer as n from public.community_comments
          where user_id = p_user_id group by post_id) x
    where o.post_id = x.post_id and o.user_id <> p_user_id
      and not exists (select 1 from autofit_integrity.account_deletions d where d.user_id = o.user_id);
  update public.community_posts o set repost_count = o.repost_count - x.n
    from (select repost_of_post_id as post_id, count(*)::integer as n from public.community_posts
          where user_id = p_user_id and repost_of_post_id is not null group by repost_of_post_id) x
    where o.post_id = x.post_id and o.user_id <> p_user_id
      and not exists (select 1 from autofit_integrity.account_deletions d where d.user_id = o.user_id);
  delete from public.community_post_likes where user_id = p_user_id;
  delete from public.community_comments where user_id = p_user_id;
  -- Other users' reposts, likes and comments on this user's posts go with the posts.
  delete from public.community_posts r using public.community_posts o
    where r.repost_of_post_id = o.post_id and o.user_id = p_user_id;
  delete from public.community_post_likes l using public.community_posts o
    where l.post_id = o.post_id and o.user_id = p_user_id;
  delete from public.community_comments c using public.community_posts o
    where c.post_id = o.post_id and o.user_id = p_user_id;
  delete from public.community_posts where user_id = p_user_id;
  delete from public.community_uploads where user_id = p_user_id;
  delete from public.community_blocks where blocker_user_id = p_user_id or blocked_user_id = p_user_id;
  delete from public.community_reports where reporter_user_id = p_user_id or target_user_id = p_user_id;
  delete from public.community_follows where follower_user_id = p_user_id or following_user_id = p_user_id;
  delete from public.community_notifications where user_id = p_user_id or actor_user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges (create or replace above keeps the existing grants)
-- ---------------------------------------------------------------------------

revoke all on function
  public.community_notify(),
  public.community_drop_notifications(),
  public.community_unfollow_on_block()
  from public, anon, authenticated, service_role;
revoke all on function
  public.community_lock_pair(uuid, uuid),
  public.community_require_visible_user(uuid, uuid),
  public.community_profile(uuid, uuid),
  public.community_set_follow(uuid, uuid, boolean),
  public.community_timeline(uuid, text, uuid, timestamptz, uuid, integer),
  public.community_follow_list(uuid, uuid, text, timestamptz, uuid, integer),
  public.community_notification_visible(uuid, public.community_notifications),
  public.community_notification_list(uuid, timestamptz, uuid, integer),
  public.community_unread_notification_count(uuid),
  public.community_read_notifications(uuid)
  from public, anon, authenticated;
grant execute on function
  public.community_lock_pair(uuid, uuid),
  public.community_require_visible_user(uuid, uuid),
  public.community_profile(uuid, uuid),
  public.community_set_follow(uuid, uuid, boolean),
  public.community_timeline(uuid, text, uuid, timestamptz, uuid, integer),
  public.community_follow_list(uuid, uuid, text, timestamptz, uuid, integer),
  public.community_notification_visible(uuid, public.community_notifications),
  public.community_notification_list(uuid, timestamptz, uuid, integer),
  public.community_unread_notification_count(uuid),
  public.community_read_notifications(uuid)
  to service_role;
