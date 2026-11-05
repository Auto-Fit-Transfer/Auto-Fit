-- Community: club management (edit, delete, member list, remove and ban members).
-- Requires 20261015062629_community_mileage_membership_clubs.sql. Applied files stay untouched;
-- this file adds one table and new functions and replaces two club functions in place:
--   public.community_set_club_membership(...)  also refuses members the club removed;
--   public.community_create_club_post(...)     holds the club row so a deleted club gets no posts.

-- Members the owner removed cannot join again. user_id = the removed member, so the stock
-- account-deletion guards and the generic purge cover it.
create table public.community_club_bans (
  club_id uuid not null,
  user_id uuid not null,
  banned_at timestamptz not null default clock_timestamp(),
  primary key (club_id, user_id)
);
alter table public.community_club_bans enable row level security;
revoke all on public.community_club_bans from public, anon, authenticated;
grant select, insert, update, delete on public.community_club_bans to service_role;
create trigger check_user_reference before insert or update on public.community_club_bans
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable before insert or update on public.community_club_bans
  for each row execute function autofit_integrity.check_account_writable();

-- Locks the club for its owner: user (auth) first, then the club row, like every other writer.
create function public.community_lock_owned_club(p_user_id uuid, p_club_id uuid)
returns public.community_clubs language plpgsql security invoker set search_path = '' as $$
declare
  v_club public.community_clubs;
begin
  perform public.community_require_writable(p_user_id);
  select * into v_club from public.community_clubs where club_id = p_club_id for update;
  if not found then
    raise exception using message = 'COMMUNITY_CLUB_NOT_FOUND', errcode = 'P0001';
  end if;
  if v_club.owner_user_id <> p_user_id then
    raise exception using message = 'COMMUNITY_CLUB_OWNER_ONLY', errcode = 'P0001';
  end if;
  return v_club;
end;
$$;

create function public.community_update_club(
  p_user_id uuid, p_club_id uuid, p_name text, p_description text, p_category text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_description text := nullif(btrim(p_description), '');
  v_club public.community_clubs;
begin
  if p_user_id is null or p_club_id is null or v_name is null or char_length(v_name) not between 2 and 30
     or char_length(v_description) > 300
     or p_category is null
     or p_category not in ('running', 'strength', 'diet', 'yoga', 'hiking', 'cycling', 'sports', 'etc') then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_lock_owned_club(p_user_id, p_club_id);
  if exists (select 1 from public.community_clubs
             where lower(name) = lower(v_name) and club_id <> p_club_id) then
    raise exception using message = 'COMMUNITY_CLUB_NAME_TAKEN', errcode = 'P0001';
  end if;
  begin
    update public.community_clubs
      set name = v_name, description = v_description, category = p_category
      where club_id = p_club_id returning * into v_club;
  exception when unique_violation then
    raise exception using message = 'COMMUNITY_CLUB_NAME_TAKEN', errcode = 'P0001';
  end;
  return public.community_club_view(p_user_id, v_club);
end;
$$;

-- The owner deletes the club with all its posts (and their likes, comments, reposts and
-- uploads). Returns the photo paths so FastAPI removes the files through the Storage API.
-- Takes the community account-deletion lock: a cleanup running at the same time removes the
-- same kinds of rows, and the two must not interleave (40P01).
create function public.community_delete_club(p_user_id uuid, p_club_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_paths jsonb;
begin
  if p_user_id is null or p_club_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('community:account-deletion', 0));
  perform public.community_lock_owned_club(p_user_id, p_club_id);
  -- Club posts first (fixed order), so a like or comment in flight finishes before its rows go.
  perform 1 from public.community_posts where club_id = p_club_id order by post_id for update;
  select coalesce(jsonb_agg(i->>'path'), '[]'::jsonb) into v_paths
    from public.community_posts p cross join lateral jsonb_array_elements(p.images) i
    where p.club_id = p_club_id;
  delete from public.community_posts r using public.community_posts p
    where r.repost_of_post_id = p.post_id and p.club_id = p_club_id;
  delete from public.community_post_likes l using public.community_posts p
    where l.post_id = p.post_id and p.club_id = p_club_id;
  delete from public.community_comments c using public.community_posts p
    where c.post_id = p.post_id and p.club_id = p_club_id;
  delete from public.community_uploads u using public.community_posts p
    where u.post_id = p.post_id and p.club_id = p_club_id;
  delete from public.community_posts where club_id = p_club_id;
  delete from public.community_club_members where club_id = p_club_id;
  delete from public.community_club_bans where club_id = p_club_id;
  delete from public.community_clubs where club_id = p_club_id;
  return jsonb_build_object('deleted', true, 'image_paths', v_paths);
end;
$$;

-- Earliest first (the owner joined first). Users blocked with the viewer are hidden.
create function public.community_club_member_list(
  p_viewer uuid, p_club_id uuid, p_after_joined_at timestamptz, p_after_user_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_club_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_after_joined_at is null) <> (p_after_user_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_visible_club(p_viewer, p_club_id);
  return coalesce((
    select jsonb_agg(public.community_author(s.user_id) || jsonb_build_object(
        'role', s.role, 'joined_at', s.joined_at, 'is_me', s.user_id = p_viewer,
        'followed_by_me', exists (select 1 from public.community_follows f
          where f.follower_user_id = p_viewer and f.following_user_id = s.user_id))
      order by s.joined_at, s.user_id)
    from (
      select m.user_id, m.role, m.joined_at
      from public.community_club_members m
      where m.club_id = p_club_id
        and (p_after_joined_at is null or (m.joined_at, m.user_id) > (p_after_joined_at, p_after_user_id))
        and not public.community_blocked_between(p_viewer, m.user_id)
      order by m.joined_at, m.user_id
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

-- The owner removes a member, who then cannot join again. Their earlier posts stay in the club.
create function public.community_remove_club_member(p_user_id uuid, p_club_id uuid, p_member_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_club_id is null or p_member_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_member_user_id = p_user_id then
    raise exception using message = 'COMMUNITY_SELF_TARGET', errcode = 'P0001';
  end if;
  perform public.community_lock_owned_club(p_user_id, p_club_id);
  delete from public.community_club_members where club_id = p_club_id and user_id = p_member_user_id;
  if not found then
    raise exception using message = 'COMMUNITY_USER_NOT_FOUND', errcode = 'P0001';
  end if;
  -- A member who is leaving the service needs no ban; their rows are being removed anyway.
  if public.community_account_writable(p_member_user_id) then
    insert into public.community_club_bans(club_id, user_id) values (p_club_id, p_member_user_id)
      on conflict do nothing;
  end if;
  return jsonb_build_object('club_id', p_club_id,
    'member_count', (select count(*) from public.community_club_members m where m.club_id = p_club_id));
end;
$$;

-- Same as in 20261015062629, plus the ban check.
create or replace function public.community_set_club_membership(p_user_id uuid, p_club_id uuid, p_joined boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_club public.community_clubs;
begin
  if p_user_id is null or p_club_id is null or p_joined is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  v_club := public.community_visible_club(p_user_id, p_club_id);
  if p_joined then
    perform public.community_require_writable(p_user_id);
    perform public.community_require_nickname(p_user_id);
    perform 1 from public.community_clubs where club_id = p_club_id for share;
    if not found then
      raise exception using message = 'COMMUNITY_CLUB_NOT_FOUND', errcode = 'P0001';
    end if;
    if exists (select 1 from public.community_club_bans b where b.club_id = p_club_id and b.user_id = p_user_id) then
      raise exception using message = 'COMMUNITY_CLUB_BANNED', errcode = 'P0001';
    end if;
    insert into public.community_club_members(club_id, user_id) values (p_club_id, p_user_id)
      on conflict do nothing;
  else
    if v_club.owner_user_id = p_user_id then
      raise exception using message = 'COMMUNITY_CLUB_OWNER', errcode = 'P0001';
    end if;
    delete from public.community_club_members where club_id = p_club_id and user_id = p_user_id;
  end if;
  return jsonb_build_object('club_id', p_club_id, 'joined', p_joined,
    'member_count', (select count(*) from public.community_club_members m where m.club_id = p_club_id));
end;
$$;

-- Same as in 20261015062629, except that it holds the club row (after the user, like joining)
-- and checks membership under it, so a club deleted meanwhile cannot get a post.
create or replace function public.community_create_club_post(
  p_user_id uuid, p_club_id uuid, p_content text, p_upload_ids uuid[]
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb;
begin
  if p_user_id is null or p_club_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_visible_club(p_user_id, p_club_id);
  perform public.community_require_writable(p_user_id);
  perform 1 from public.community_clubs where club_id = p_club_id for share;
  if not found then
    raise exception using message = 'COMMUNITY_CLUB_NOT_FOUND', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.community_club_members m
                 where m.club_id = p_club_id and m.user_id = p_user_id) then
    raise exception using message = 'COMMUNITY_CLUB_MEMBERS_ONLY', errcode = 'P0001';
  end if;
  v_item := public.community_create_post(p_user_id, p_content, p_upload_ids);
  update public.community_posts set club_id = p_club_id where post_id = (v_item->>'post_id')::uuid;
  return v_item;
end;
$$;

revoke all on function
  public.community_lock_owned_club(uuid, uuid),
  public.community_update_club(uuid, uuid, text, text, text),
  public.community_delete_club(uuid, uuid),
  public.community_club_member_list(uuid, uuid, timestamptz, uuid, integer),
  public.community_remove_club_member(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.community_lock_owned_club(uuid, uuid),
  public.community_update_club(uuid, uuid, text, text, text),
  public.community_delete_club(uuid, uuid),
  public.community_club_member_list(uuid, uuid, timestamptz, uuid, integer),
  public.community_remove_club_member(uuid, uuid, uuid)
  to service_role;
