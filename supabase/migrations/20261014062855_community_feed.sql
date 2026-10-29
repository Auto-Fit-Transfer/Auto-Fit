-- Community feed: posts with up to five photos, likes, reposts, comments, reports and blocks.
-- No foreign keys. All access goes through FastAPI with the service role; every write is a
-- SQL function so counters, ownership and block rules change atomically.
--
-- Requires the applied 2026-09-17 integrity migrations (schema autofit_integrity). This file
-- also replaces autofit_integrity.cascade_account_deletion() so account deletion cleans
-- community rows before its generic per-table purge. Apply once, after checking history.

create table public.community_posts (
  post_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  content text,
  images jsonb not null default '[]'::jsonb,
  repost_of_post_id uuid,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  repost_count integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  constraint community_posts_counts_check check (
    like_count >= 0 and comment_count >= 0 and repost_count >= 0),
  constraint community_posts_content_check check (
    content is null or char_length(content) between 1 and 500),
  constraint community_posts_images_check check (
    case when jsonb_typeof(images) = 'array' then jsonb_array_length(images) <= 5 else false end),
  -- A repost is a pointer row: no text or photos of its own.
  constraint community_posts_body_check check (
    case when repost_of_post_id is null
      then content is not null or images <> '[]'::jsonb
      else content is null and images = '[]'::jsonb and repost_of_post_id <> post_id end)
);
create index community_posts_feed_idx on public.community_posts(created_at desc, post_id desc);
create index community_posts_author_idx on public.community_posts(user_id, created_at desc, post_id desc);
create index community_posts_repost_of_idx on public.community_posts(repost_of_post_id)
  where repost_of_post_id is not null;
create unique index community_posts_one_repost_idx on public.community_posts(user_id, repost_of_post_id)
  where repost_of_post_id is not null;

-- Photos are uploaded one by one before the post exists, then claimed by community_create_post.
create table public.community_uploads (
  upload_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  storage_path text not null unique,
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  post_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index community_uploads_pending_idx on public.community_uploads(user_id, created_at)
  where post_id is null;
create index community_uploads_post_idx on public.community_uploads(post_id) where post_id is not null;

create table public.community_post_likes (
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (post_id, user_id)
);
create index community_post_likes_user_idx on public.community_post_likes(user_id);

create table public.community_comments (
  comment_id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  content text not null check (char_length(content) between 1 and 300),
  created_at timestamptz not null default clock_timestamp()
);
create index community_comments_post_idx on public.community_comments(post_id, created_at, comment_id);
create index community_comments_user_idx on public.community_comments(user_id, created_at);

create table public.community_reports (
  report_id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null,
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  target_id uuid not null,
  target_user_id uuid not null,
  reason text not null check (reason in ('spam', 'abuse', 'sexual', 'misinformation', 'privacy', 'other')),
  detail text check (detail is null or char_length(detail) between 1 and 300),
  -- Copy of the reported text so moderators can review it after the author edits or deletes.
  content_snapshot text,
  created_at timestamptz not null default clock_timestamp(),
  unique (reporter_user_id, target_type, target_id)
);
create index community_reports_review_idx on public.community_reports(target_type, target_id);
create index community_reports_target_user_idx on public.community_reports(target_user_id);

create table public.community_blocks (
  blocker_user_id uuid not null,
  blocked_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);
create index community_blocks_blocked_idx on public.community_blocks(blocked_user_id, blocker_user_id);

alter table public.community_posts enable row level security;
alter table public.community_uploads enable row level security;
alter table public.community_post_likes enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_blocks enable row level security;
revoke all on public.community_posts, public.community_uploads, public.community_post_likes,
  public.community_comments, public.community_reports, public.community_blocks
  from public, anon, authenticated;
grant select, insert, update, delete on public.community_posts, public.community_uploads,
  public.community_post_likes, public.community_comments, public.community_reports,
  public.community_blocks to service_role;

-- Private photos; FastAPI re-encodes every upload to JPEG without EXIF (GPS) metadata.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-photos', 'community-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------

-- Public identity only: nickname and avatar, never the real name.
create function public.community_author(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'user_id', p_user_id,
    'nickname', coalesce(
      (select nullif(btrim(p.nickname), '') from public.profiles p where p.user_id = p_user_id), '회원'),
    'profile_image_url',
      (select p.profile_image_url from public.profiles p where p.user_id = p_user_id))
$$;

create function public.community_blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.community_blocks b
    where (b.blocker_user_id = p_a and b.blocked_user_id = p_b)
       or (b.blocker_user_id = p_b and b.blocked_user_id = p_a))
$$;

create function public.community_post_view(p_viewer uuid, p_post public.community_posts)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'post_id', p_post.post_id,
    'author', public.community_author(p_post.user_id),
    'content', p_post.content,
    'images', p_post.images,
    'like_count', p_post.like_count,
    'comment_count', p_post.comment_count,
    'repost_count', p_post.repost_count,
    'liked_by_me', exists (
      select 1 from public.community_post_likes l
      where l.post_id = p_post.post_id and l.user_id = p_viewer),
    'reposted_by_me', exists (
      select 1 from public.community_posts r
      where r.repost_of_post_id = p_post.post_id and r.user_id = p_viewer),
    'is_mine', p_post.user_id = p_viewer,
    'created_at', p_post.created_at)
$$;

-- A feed entry is either an original post or a repost row that shows the original.
create function public.community_feed_item(p_viewer uuid, p_entry public.community_posts)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_original public.community_posts;
begin
  if p_entry.repost_of_post_id is null then
    return public.community_post_view(p_viewer, p_entry) || jsonb_build_object(
      'feed_item_id', p_entry.post_id, 'feed_created_at', p_entry.created_at, 'reposted_by', null);
  end if;
  select * into v_original from public.community_posts where post_id = p_entry.repost_of_post_id;
  return public.community_post_view(p_viewer, v_original) || jsonb_build_object(
    'feed_item_id', p_entry.post_id, 'feed_created_at', p_entry.created_at,
    'reposted_by', public.community_author(p_entry.user_id));
end;
$$;

-- Resolves a repost ID to its original and hides blocked or self-reported posts.
create function public.community_visible_post(p_viewer uuid, p_post_id uuid)
returns public.community_posts language plpgsql stable security invoker set search_path = '' as $$
declare
  v_post public.community_posts;
begin
  select * into v_post from public.community_posts where post_id = p_post_id;
  if found and v_post.repost_of_post_id is not null then
    select * into v_post from public.community_posts where post_id = v_post.repost_of_post_id;
  end if;
  if not found
     or public.community_blocked_between(p_viewer, v_post.user_id)
     or exists (
       select 1 from public.community_reports r
       where r.reporter_user_id = p_viewer and r.target_type = 'post' and r.target_id = v_post.post_id) then
    raise exception using message = 'COMMUNITY_POST_NOT_FOUND', errcode = 'P0001';
  end if;
  return v_post;
end;
$$;

-- False while the account is being deleted (or is gone). Takes the same auth.users lock as
-- the integrity triggers, so callers that check the post author first lock in the same
-- order as account deletion (auth user, then rows) and wait instead of deadlocking.
create function public.community_account_writable(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform autofit_integrity.assert_account_writable(p_user_id);
  return true;
exception when sqlstate '23503' or sqlstate '23514' then
  return false;
end;
$$;

-- Locks another user's post before a like, repost or comment changes its counters.
-- A post whose author is mid-deletion is treated as already gone.
create function public.community_lock_post(p_post public.community_posts)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.community_account_writable(p_post.user_id) then
    raise exception using message = 'COMMUNITY_POST_NOT_FOUND', errcode = 'P0001';
  end if;
  perform 1 from public.community_posts where post_id = p_post.post_id for update;
  if not found then
    raise exception using message = 'COMMUNITY_POST_NOT_FOUND', errcode = 'P0001';
  end if;
end;
$$;

create function public.community_require_writable(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.community_account_writable(p_user_id) then
    raise exception using message = 'COMMUNITY_ACCOUNT_UNAVAILABLE', errcode = 'P0001';
  end if;
end;
$$;

create function public.community_require_nickname(p_user_id uuid)
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_user_id and nullif(btrim(p.nickname), '') is not null) then
    raise exception using message = 'COMMUNITY_NICKNAME_REQUIRED', errcode = 'P0001';
  end if;
end;
$$;

create function public.community_comment_view(
  p_viewer uuid, p_post_owner uuid, p_comment public.community_comments
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'comment_id', p_comment.comment_id,
    'post_id', p_comment.post_id,
    'author', public.community_author(p_comment.user_id),
    'content', p_comment.content,
    'created_at', p_comment.created_at,
    'is_mine', p_comment.user_id = p_viewer,
    'can_delete', p_comment.user_id = p_viewer or p_post_owner = p_viewer)
$$;

-- ---------------------------------------------------------------------------
-- API functions
-- ---------------------------------------------------------------------------

-- Newest first, keyset paginated by (created_at, post_id) of the feed entry.
create function public.community_feed(
  p_viewer uuid, p_before_created_at timestamptz, p_before_item_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_limit is null or p_limit not between 1 and 51
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

create function public.community_get_post(p_viewer uuid, p_post_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_post public.community_posts;
begin
  if p_viewer is null or p_post_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  v_post := public.community_visible_post(p_viewer, p_post_id);
  return public.community_feed_item(p_viewer, v_post);
end;
$$;

create function public.community_register_upload(
  p_user_id uuid, p_storage_path text, p_width integer, p_height integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_upload public.community_uploads;
begin
  if p_user_id is null or p_storage_path is null
     or p_storage_path not like p_user_id::text || '/%'
     or p_width is null or p_width not between 1 and 20000
     or p_height is null or p_height not between 1 and 20000 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':community-upload', 0));
  if (select count(*) from public.community_uploads
      where user_id = p_user_id and post_id is null
        and created_at > clock_timestamp() - interval '1 day') >= 20 then
    raise exception using message = 'COMMUNITY_UPLOAD_LIMIT', errcode = 'P0001';
  end if;
  insert into public.community_uploads(user_id, storage_path, width, height)
    values (p_user_id, p_storage_path, p_width, p_height) returning * into v_upload;
  return jsonb_build_object(
    'upload_id', v_upload.upload_id, 'width', v_upload.width, 'height', v_upload.height);
end;
$$;

-- Removes photos that were uploaded but never posted; FastAPI deletes the returned files.
create function public.community_claim_stale_uploads(p_user_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  with gone as (
    delete from public.community_uploads
    where user_id = p_user_id and post_id is null
      and created_at < clock_timestamp() - interval '1 day'
    returning storage_path)
  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) from gone
$$;

create function public.community_create_post(p_user_id uuid, p_content text, p_upload_ids uuid[])
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
     or char_length(v_content) > 500
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
    -- Another request claimed a photo first; the whole post rolls back.
    raise exception using message = 'COMMUNITY_UPLOAD_INVALID', errcode = 'P0001';
  end if;
  return public.community_feed_item(p_user_id, v_post);
end;
$$;

-- Author only. Reposts, likes and comments of the post go with it.
create function public.community_delete_post(p_user_id uuid, p_post_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_post public.community_posts;
begin
  select * into v_post from public.community_posts
    where post_id = p_post_id and user_id = p_user_id and repost_of_post_id is null
    for update;
  if not found then
    raise exception using message = 'COMMUNITY_POST_NOT_FOUND', errcode = 'P0001';
  end if;
  delete from public.community_posts where repost_of_post_id = v_post.post_id;
  delete from public.community_post_likes where post_id = v_post.post_id;
  delete from public.community_comments where post_id = v_post.post_id;
  delete from public.community_uploads where post_id = v_post.post_id;
  delete from public.community_posts where post_id = v_post.post_id;
  return jsonb_build_object('deleted', true, 'image_paths', coalesce(
    (select jsonb_agg(i->>'path') from jsonb_array_elements(v_post.images) i), '[]'::jsonb));
end;
$$;

create function public.community_set_like(p_user_id uuid, p_post_id uuid, p_liked boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_post public.community_posts;
  v_changed integer;
begin
  if p_user_id is null or p_post_id is null or p_liked is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  v_post := public.community_visible_post(p_user_id, p_post_id);
  perform public.community_lock_post(v_post);
  if p_liked then
    insert into public.community_post_likes(post_id, user_id) values (v_post.post_id, p_user_id)
      on conflict do nothing;
  else
    delete from public.community_post_likes where post_id = v_post.post_id and user_id = p_user_id;
  end if;
  get diagnostics v_changed = row_count;
  update public.community_posts
    set like_count = like_count + case when p_liked then v_changed else -v_changed end
    where post_id = v_post.post_id
    returning * into v_post;
  return jsonb_build_object('post_id', v_post.post_id, 'liked', p_liked, 'like_count', v_post.like_count);
end;
$$;

create function public.community_set_repost(p_user_id uuid, p_post_id uuid, p_reposted boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_post public.community_posts;
  v_changed integer;
begin
  if p_user_id is null or p_post_id is null or p_reposted is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  v_post := public.community_visible_post(p_user_id, p_post_id);
  perform public.community_lock_post(v_post);
  if p_reposted then
    perform public.community_require_nickname(p_user_id);
    insert into public.community_posts(user_id, repost_of_post_id) values (p_user_id, v_post.post_id)
      on conflict (user_id, repost_of_post_id) where repost_of_post_id is not null do nothing;
  else
    delete from public.community_posts where user_id = p_user_id and repost_of_post_id = v_post.post_id;
  end if;
  get diagnostics v_changed = row_count;
  update public.community_posts
    set repost_count = repost_count + case when p_reposted then v_changed else -v_changed end
    where post_id = v_post.post_id
    returning * into v_post;
  return jsonb_build_object(
    'post_id', v_post.post_id, 'reposted', p_reposted, 'repost_count', v_post.repost_count);
end;
$$;

-- Oldest first, keyset paginated by (created_at, comment_id).
create function public.community_comments(
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

create function public.community_add_comment(p_user_id uuid, p_post_id uuid, p_content text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_content text := nullif(btrim(p_content), '');
  v_post public.community_posts;
  v_comment public.community_comments;
begin
  if p_user_id is null or p_post_id is null or v_content is null or char_length(v_content) > 300 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  perform public.community_require_nickname(p_user_id);
  v_post := public.community_visible_post(p_user_id, p_post_id);
  perform public.community_lock_post(v_post);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':community-comment', 0));
  if (select count(*) from public.community_comments
      where user_id = p_user_id and created_at > clock_timestamp() - interval '1 hour') >= 60 then
    raise exception using message = 'COMMUNITY_RATE_LIMITED', errcode = 'P0001';
  end if;
  insert into public.community_comments(post_id, user_id, content)
    values (v_post.post_id, p_user_id, v_content) returning * into v_comment;
  update public.community_posts set comment_count = comment_count + 1 where post_id = v_post.post_id;
  return public.community_comment_view(p_user_id, v_post.user_id, v_comment);
end;
$$;

-- The comment author or the post author may delete a comment.
create function public.community_delete_comment(p_user_id uuid, p_comment_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_comment public.community_comments;
  v_post_owner uuid;
begin
  select c.* into v_comment from public.community_comments c where c.comment_id = p_comment_id for update;
  if found then
    select p.user_id into v_post_owner from public.community_posts p where p.post_id = v_comment.post_id;
  end if;
  if v_comment.comment_id is null or p_user_id is null
     or (v_comment.user_id <> p_user_id and v_post_owner is distinct from p_user_id) then
    raise exception using message = 'COMMUNITY_COMMENT_NOT_FOUND', errcode = 'P0001';
  end if;
  delete from public.community_comments where comment_id = v_comment.comment_id;
  if public.community_account_writable(v_post_owner) then
    update public.community_posts set comment_count = comment_count - 1 where post_id = v_comment.post_id;
  end if;
  return jsonb_build_object('deleted', true, 'post_id', v_comment.post_id);
end;
$$;

-- Reporters stop seeing the reported post or comment immediately.
create function public.community_report(
  p_reporter uuid, p_target_type text, p_target_id uuid, p_reason text, p_detail text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_detail text := nullif(btrim(p_detail), '');
  v_owner uuid;
  v_snapshot text;
begin
  if p_reporter is null or p_target_id is null
     or p_target_type is null or p_target_type not in ('post', 'comment', 'user')
     or p_reason is null or p_reason not in ('spam', 'abuse', 'sexual', 'misinformation', 'privacy', 'other')
     or char_length(v_detail) > 300 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_target_type = 'post' then
    select p.user_id, p.content into v_owner, v_snapshot from public.community_posts p
      where p.post_id = p_target_id and p.repost_of_post_id is null;
  elsif p_target_type = 'comment' then
    select c.user_id, c.content into v_owner, v_snapshot from public.community_comments c
      where c.comment_id = p_target_id;
  else
    select p.user_id into v_owner from public.profiles p where p.user_id = p_target_id;
  end if;
  if v_owner is null then
    raise exception using message = 'COMMUNITY_TARGET_NOT_FOUND', errcode = 'P0001';
  end if;
  if v_owner = p_reporter then
    raise exception using message = 'COMMUNITY_SELF_TARGET', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_reporter);
  if not public.community_account_writable(v_owner) then
    raise exception using message = 'COMMUNITY_TARGET_NOT_FOUND', errcode = 'P0001';
  end if;
  insert into public.community_reports(
    reporter_user_id, target_type, target_id, target_user_id, reason, detail, content_snapshot)
    values (p_reporter, p_target_type, p_target_id, v_owner, p_reason, v_detail, v_snapshot)
    on conflict (reporter_user_id, target_type, target_id) do nothing;
  return jsonb_build_object('reported', true);
end;
$$;

-- Blocking hides both users' posts and comments from each other.
create function public.community_set_block(p_user_id uuid, p_target_user_id uuid, p_blocked boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_target_user_id is null or p_blocked is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_user_id = p_target_user_id then
    raise exception using message = 'COMMUNITY_SELF_TARGET', errcode = 'P0001';
  end if;
  if p_blocked then
    perform public.community_require_writable(p_user_id);
    if not exists (select 1 from public.profiles p where p.user_id = p_target_user_id)
       or not public.community_account_writable(p_target_user_id) then
      raise exception using message = 'COMMUNITY_USER_NOT_FOUND', errcode = 'P0001';
    end if;
    insert into public.community_blocks(blocker_user_id, blocked_user_id)
      values (p_user_id, p_target_user_id) on conflict do nothing;
  else
    delete from public.community_blocks
      where blocker_user_id = p_user_id and blocked_user_id = p_target_user_id;
  end if;
  return jsonb_build_object('user_id', p_target_user_id, 'blocked', p_blocked);
end;
$$;

create function public.community_blocked_users(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(
    public.community_author(b.blocked_user_id) || jsonb_build_object('blocked_at', b.created_at)
    order by b.created_at desc), '[]'::jsonb)
  from public.community_blocks b
  where b.blocker_user_id = p_user_id
$$;

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

-- Removes everything the user wrote and fixes counters on other users' posts.
-- Called first by autofit_integrity.cascade_account_deletion() (replaced below), before its
-- generic per-table purge deletes community rows without fixing counters. Photo files are
-- removed earlier by the account-deletion Storage step (account_deletion_storage lists every
-- bucket, including community-photos).
create function public.community_delete_user_data(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
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
end;
$$;

-- ---------------------------------------------------------------------------
-- Integration with the applied account-deletion integrity (2026-09-17 migrations)
-- ---------------------------------------------------------------------------

-- Every other user-owned table has these two guards, but the integrity migrations only
-- created them for tables that existed then, so community tables get them explicitly.
-- zzz_check_account_writable rejects writes once begin_account_deletion has run.
do $$
declare
  t text;
begin
  foreach t in array array['community_posts', 'community_uploads', 'community_post_likes', 'community_comments'] loop
    execute format('create trigger check_user_reference before insert or update on public.%I
      for each row execute function autofit_integrity.check_user_reference()', t);
    execute format('create trigger zzz_check_account_writable before insert or update on public.%I
      for each row execute function autofit_integrity.check_account_writable()', t);
  end loop;
end;
$$;

-- Reports and blocks name two users instead of user_id, so the stock guard cannot see them.
create function autofit_integrity.check_community_pair_writable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'community_reports' then
    perform autofit_integrity.assert_account_writable(new.reporter_user_id);
    perform autofit_integrity.assert_account_writable(new.target_user_id);
  else
    perform autofit_integrity.assert_account_writable(new.blocker_user_id);
    perform autofit_integrity.assert_account_writable(new.blocked_user_id);
  end if;
  return new;
end;
$$;
revoke all on function autofit_integrity.check_community_pair_writable()
  from public, anon, authenticated, service_role;
create trigger zzz_check_account_writable before insert or update on public.community_reports
  for each row execute function autofit_integrity.check_community_pair_writable();
create trigger zzz_check_account_writable before insert or update on public.community_blocks
  for each row execute function autofit_integrity.check_community_pair_writable();

-- Same as 20260917021925_cascade_account_deletion.sql (remote 20260917022453) except for the
-- marked [community] call. Diff against pg_get_functiondef before applying.
create or replace function autofit_integrity.cascade_account_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
declare dep record;
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'Account deletion requires READ COMMITTED' using errcode='0A000';
  end if;
  if exists(select 1 from storage.objects where owner_id=old.id::text or split_part(name,'/',1)=old.id::text) then
    raise exception 'Remove account files through the Storage API before deleting the account'
      using errcode='23503';
  end if;
  -- [community] Community rows reference other users' rows (likes, comments, reposts and
  -- their counters), so clean them before the generic purge below deletes them blindly.
  perform public.community_delete_user_data(old.id);
  for dep in select c.table_name from information_schema.columns c
    join information_schema.tables t using(table_schema,table_name)
    where c.table_schema='public' and c.column_name='user_id' and t.table_type='BASE TABLE'
      and c.table_name not in ('profiles','notification_settings') order by c.table_name loop
    perform autofit_integrity.purge_account_rows(dep.table_name,'user_id',old.id,old.id);
  end loop;
  delete from public.notification_settings where user_id=old.id;
  delete from public.profiles where user_id=old.id;
  delete from autofit_integrity.account_deletions where user_id=old.id;
  return old;
end $$;
revoke all on function autofit_integrity.cascade_account_deletion()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function
  public.community_author(uuid),
  public.community_blocked_between(uuid, uuid),
  public.community_post_view(uuid, public.community_posts),
  public.community_feed_item(uuid, public.community_posts),
  public.community_visible_post(uuid, uuid),
  public.community_account_writable(uuid),
  public.community_lock_post(public.community_posts),
  public.community_require_writable(uuid),
  public.community_require_nickname(uuid),
  public.community_comment_view(uuid, uuid, public.community_comments),
  public.community_feed(uuid, timestamptz, uuid, integer),
  public.community_get_post(uuid, uuid),
  public.community_register_upload(uuid, text, integer, integer),
  public.community_claim_stale_uploads(uuid),
  public.community_create_post(uuid, text, uuid[]),
  public.community_delete_post(uuid, uuid),
  public.community_set_like(uuid, uuid, boolean),
  public.community_set_repost(uuid, uuid, boolean),
  public.community_comments(uuid, uuid, timestamptz, uuid, integer),
  public.community_add_comment(uuid, uuid, text),
  public.community_delete_comment(uuid, uuid),
  public.community_report(uuid, text, uuid, text, text),
  public.community_set_block(uuid, uuid, boolean),
  public.community_blocked_users(uuid),
  public.community_delete_user_data(uuid)
  from public, anon, authenticated;
grant execute on function
  public.community_author(uuid),
  public.community_blocked_between(uuid, uuid),
  public.community_post_view(uuid, public.community_posts),
  public.community_feed_item(uuid, public.community_posts),
  public.community_visible_post(uuid, uuid),
  public.community_account_writable(uuid),
  public.community_lock_post(public.community_posts),
  public.community_require_writable(uuid),
  public.community_require_nickname(uuid),
  public.community_comment_view(uuid, uuid, public.community_comments),
  public.community_feed(uuid, timestamptz, uuid, integer),
  public.community_get_post(uuid, uuid),
  public.community_register_upload(uuid, text, integer, integer),
  public.community_claim_stale_uploads(uuid),
  public.community_create_post(uuid, text, uuid[]),
  public.community_delete_post(uuid, uuid),
  public.community_set_like(uuid, uuid, boolean),
  public.community_set_repost(uuid, uuid, boolean),
  public.community_comments(uuid, uuid, timestamptz, uuid, integer),
  public.community_add_comment(uuid, uuid, text),
  public.community_delete_comment(uuid, uuid),
  public.community_report(uuid, text, uuid, text, text),
  public.community_set_block(uuid, uuid, boolean),
  public.community_blocked_users(uuid)
  to service_role;

-- Only the account-deletion cascade may run the cleanup. The cascade is security definer, so
-- it runs as its own owner; grant that owner explicitly in case it is not the applying role.
revoke all on function public.community_delete_user_data(uuid) from service_role;
do $$
begin
  execute format('grant execute on function public.community_delete_user_data(uuid) to %I',
    (select pg_get_userbyid(p.proowner) from pg_proc p
     where p.oid = 'autofit_integrity.cascade_account_deletion()'::regprocedure));
end;
$$;
