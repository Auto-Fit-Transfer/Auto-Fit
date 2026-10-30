-- G10: a user's saved posts. Deleting a post also removes its bookmarks.
create table public.community_post_bookmarks (
  user_id uuid not null,
  post_id uuid not null references public.community_posts(post_id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, post_id)
);
create index community_post_bookmarks_activity_idx
  on public.community_post_bookmarks(user_id, created_at desc, post_id desc);
create trigger check_user_reference before insert or update on public.community_post_bookmarks
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable before insert or update on public.community_post_bookmarks
  for each row execute function autofit_integrity.check_account_writable();
alter table public.community_post_bookmarks enable row level security;
revoke all on public.community_post_bookmarks from public, anon, authenticated;
grant select, insert, delete on public.community_post_bookmarks to service_role;

create function public.community_set_bookmark(p_user_id uuid, p_post_id uuid, p_bookmarked boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_post public.community_posts;
begin
  if p_user_id is null or p_post_id is null or p_bookmarked is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  if p_bookmarked then
    v_post := public.community_visible_post(p_user_id, p_post_id);
    insert into public.community_post_bookmarks(user_id, post_id)
      values (p_user_id, v_post.post_id) on conflict do nothing;
  else
    delete from public.community_post_bookmarks b
      where b.user_id = p_user_id and b.post_id = p_post_id;
  end if;
  return jsonb_build_object('post_id', p_post_id, 'bookmarked', p_bookmarked);
end;
$$;

create function public.community_bookmark_state(p_user_id uuid, p_post_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('post_id', p_post_id, 'bookmarked', exists (
    select 1 from public.community_post_bookmarks b
      where b.user_id = p_user_id and b.post_id = p_post_id));
$$;

create function public.community_bookmark_list(
  p_user_id uuid, p_before_created_at timestamptz, p_before_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_feed_item(p_user_id, s.post) ||
      jsonb_build_object('feed_created_at', s.created_at)
      order by s.created_at desc, s.post_id desc)
    from (
      select b.post_id, b.created_at, p as post
      from public.community_post_bookmarks b
      join public.community_posts p on p.post_id = b.post_id
      where b.user_id = p_user_id and p.hidden_at is null and p.repost_of_post_id is null
        and not public.community_blocked_between(p_user_id, p.user_id)
        and not exists (select 1 from public.community_reports r
          where r.reporter_user_id = p_user_id and r.target_type = 'post' and r.target_id = p.post_id)
        and (p_before_created_at is null or
             (b.created_at, b.post_id) < (p_before_created_at, p_before_id))
      order by b.created_at desc, b.post_id desc
      limit p_limit
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.community_set_bookmark(uuid, uuid, boolean),
  public.community_bookmark_state(uuid, uuid),
  public.community_bookmark_list(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.community_set_bookmark(uuid, uuid, boolean),
  public.community_bookmark_state(uuid, uuid),
  public.community_bookmark_list(uuid, timestamptz, uuid, integer)
  to service_role;

-- Rollback after clients stop using bookmarks:
-- drop function public.community_bookmark_list(uuid, timestamptz, uuid, integer);
-- drop function public.community_bookmark_state(uuid, uuid);
-- drop function public.community_set_bookmark(uuid, uuid, boolean);
-- drop table public.community_post_bookmarks;
