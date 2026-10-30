-- Search only content already visible in the public community feed. Club posts remain
-- inside their club; hidden, blocked, and self-reported posts are excluded.
create function public.community_search_posts(
  p_viewer uuid, p_query text, p_routines_only boolean, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_query is null or char_length(btrim(p_query)) not between 2 and 80
     or p_routines_only is null or p_limit is null or p_limit not between 1 and 21 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_feed_item(p_viewer, s.post)
                     order by (s.post).created_at desc, (s.post).post_id desc)
    from (
      select p as post from public.community_posts p
      where p.repost_of_post_id is null and p.club_id is null and p.hidden_at is null
        and (not p_routines_only or p.category = 'routine')
        and (strpos(lower(coalesce(p.content, '')), lower(btrim(p_query))) > 0
             or exists (select 1 from unnest(p.tags) t
                        where strpos(lower(t), lower(btrim(p_query))) > 0)
             or (p.activity_snapshot is not null and
                 strpos(lower(coalesce(p.activity_snapshot->>'name', '')), lower(btrim(p_query))) > 0))
        and not public.community_blocked_between(p_viewer, p.user_id)
        and not exists (select 1 from public.community_reports r
                        where r.reporter_user_id = p_viewer and r.target_type = 'post'
                          and r.target_id = p.post_id)
      order by p.created_at desc, p.post_id desc limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

create function public.community_search_users(p_viewer uuid, p_query text, p_limit integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_query is null or char_length(btrim(p_query)) not between 2 and 80
     or p_limit is null or p_limit not between 1 and 21 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_profile(p_viewer, s.user_id)
                     order by s.nickname, s.user_id)
    from (
      select p.user_id, p.nickname from public.profiles p
      where nullif(btrim(p.nickname), '') is not null
        and strpos(lower(p.nickname), lower(btrim(p_query))) > 0
        and not public.community_blocked_between(p_viewer, p.user_id)
      order by p.nickname, p.user_id limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

create function public.community_search_clubs(p_viewer uuid, p_query text, p_limit integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_query is null or char_length(btrim(p_query)) not between 2 and 80
     or p_limit is null or p_limit not between 1 and 21 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_club_view(p_viewer, s.club)
                     order by (s.club).created_at desc, (s.club).club_id desc)
    from (
      select c as club from public.community_clubs c
      where (strpos(lower(c.name), lower(btrim(p_query))) > 0
             or strpos(lower(coalesce(c.description, '')), lower(btrim(p_query))) > 0)
        and not public.community_blocked_between(p_viewer, c.owner_user_id)
      order by c.created_at desc, c.club_id desc limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

revoke all on function public.community_search_posts(uuid, text, boolean, integer),
  public.community_search_users(uuid, text, integer),
  public.community_search_clubs(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.community_search_posts(uuid, text, boolean, integer),
  public.community_search_users(uuid, text, integer),
  public.community_search_clubs(uuid, text, integer) to service_role;

-- Rollback: drop function public.community_search_posts(uuid,text,boolean,integer);
-- drop function public.community_search_users(uuid,text,integer);
-- drop function public.community_search_clubs(uuid,text,integer);
