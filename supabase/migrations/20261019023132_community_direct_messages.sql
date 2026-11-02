-- Community 1:1 messages (no real-time server; the app polls while a chat is open).
-- Requires 20261019022935_community_moderation.sql. Applied files stay untouched; this file adds
-- three tables and new functions and replaces two functions in place:
--   autofit_integrity.check_community_pair_writable()  also guards conversations;
--   public.community_delete_user_data(uuid)            also removes the leaving user's
--                                                      conversations and the bans of removed clubs.
-- Safety defaults (team can change later): a conversation can only be started between users who
-- follow each other; blocking either way stops new messages; reporting uses the user report.

create table public.community_conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  user_low uuid not null,
  user_high uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  last_message_at timestamptz,
  check (user_low < user_high),
  unique (user_low, user_high)
);
create index community_conversations_high_idx on public.community_conversations(user_high);

-- user_id = sender, so the stock guards check the sender.
create table public.community_messages (
  message_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index community_messages_conversation_idx
  on public.community_messages(conversation_id, created_at desc, message_id desc);
create index community_messages_user_idx on public.community_messages(user_id, created_at);

create table public.community_conversation_reads (
  conversation_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz not null,
  primary key (conversation_id, user_id)
);

alter table public.community_conversations enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_conversation_reads enable row level security;
revoke all on public.community_conversations, public.community_messages,
  public.community_conversation_reads from public, anon, authenticated;
grant select, insert, update, delete on public.community_conversations, public.community_messages,
  public.community_conversation_reads to service_role;

-- Same as in 20261015062629, plus conversations (both users).
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
  elsif tg_table_name = 'community_clubs' then
    perform autofit_integrity.assert_account_writable(new.owner_user_id);
  elsif tg_table_name = 'community_conversations' then
    perform autofit_integrity.assert_account_writable(new.user_low);
    perform autofit_integrity.assert_account_writable(new.user_high);
  else
    raise exception 'check_community_pair_writable is not set up for %', tg_table_name;
  end if;
  return new;
end;
$$;

create trigger zzz_check_account_writable before insert or update on public.community_conversations
  for each row execute function autofit_integrity.check_community_pair_writable();
do $$
declare
  t text;
begin
  foreach t in array array['community_messages', 'community_conversation_reads'] loop
    execute format('create trigger check_user_reference before insert or update on public.%I
      for each row execute function autofit_integrity.check_user_reference()', t);
    execute format('create trigger zzz_check_account_writable before insert or update on public.%I
      for each row execute function autofit_integrity.check_account_writable()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.community_conversation_other(p_conversation public.community_conversations, p_user_id uuid)
returns uuid language sql immutable security invoker set search_path = '' as $$
  select case when p_conversation.user_low = p_user_id then p_conversation.user_high else p_conversation.user_low end
$$;

-- The conversation if the user takes part in it and nobody blocked the other.
create function public.community_my_conversation(p_user_id uuid, p_conversation_id uuid)
returns public.community_conversations language plpgsql stable security invoker set search_path = '' as $$
declare
  v_conversation public.community_conversations;
begin
  select * into v_conversation from public.community_conversations
    where conversation_id = p_conversation_id and p_user_id in (user_low, user_high);
  if not found or public.community_blocked_between(
       p_user_id, public.community_conversation_other(v_conversation, p_user_id)) then
    raise exception using message = 'COMMUNITY_CONVERSATION_NOT_FOUND', errcode = 'P0001';
  end if;
  return v_conversation;
end;
$$;

create function public.community_conversation_view(p_user_id uuid, p_conversation public.community_conversations)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_other uuid := public.community_conversation_other(p_conversation, p_user_id);
  v_last public.community_messages;
  v_read timestamptz;
begin
  select * into v_last from public.community_messages m
    where m.conversation_id = p_conversation.conversation_id
    order by m.created_at desc, m.message_id desc limit 1;
  select r.last_read_at into v_read from public.community_conversation_reads r
    where r.conversation_id = p_conversation.conversation_id and r.user_id = p_user_id;
  return jsonb_build_object(
    'conversation_id', p_conversation.conversation_id,
    'other', public.community_author(v_other),
    'last_message', case when v_last.message_id is null then null else jsonb_build_object(
      'content', left(v_last.content, 100), 'created_at', v_last.created_at,
      'is_mine', v_last.user_id = p_user_id) end,
    'last_message_at', p_conversation.last_message_at,
    'unread_count', (select count(*) from public.community_messages m
                     where m.conversation_id = p_conversation.conversation_id and m.user_id <> p_user_id
                       and (v_read is null or m.created_at > v_read)),
    'can_send', not public.community_blocked_between(p_user_id, v_other));
end;
$$;

-- ---------------------------------------------------------------------------
-- API functions
-- ---------------------------------------------------------------------------

-- Opens the existing conversation with the target, or starts one if both follow each other.
create function public.community_open_conversation(p_user_id uuid, p_target_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_low uuid := least(p_user_id, p_target_user_id);
  v_high uuid := greatest(p_user_id, p_target_user_id);
  v_conversation public.community_conversations;
begin
  if p_user_id is null or p_target_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_user_id = p_target_user_id then
    raise exception using message = 'COMMUNITY_SELF_TARGET', errcode = 'P0001';
  end if;
  perform public.community_require_visible_user(p_user_id, p_target_user_id);
  select * into v_conversation from public.community_conversations
    where user_low = v_low and user_high = v_high;
  if found then
    return public.community_conversation_view(p_user_id, v_conversation);
  end if;
  -- Both accounts (auth rows) before the conversation row.
  perform public.community_require_writable(p_user_id);
  if not public.community_account_writable(p_target_user_id) then
    raise exception using message = 'COMMUNITY_USER_NOT_FOUND', errcode = 'P0001';
  end if;
  perform public.community_require_nickname(p_user_id);
  if not (exists (select 1 from public.community_follows f
                  where f.follower_user_id = p_user_id and f.following_user_id = p_target_user_id)
          and exists (select 1 from public.community_follows f
                      where f.follower_user_id = p_target_user_id and f.following_user_id = p_user_id)) then
    raise exception using message = 'COMMUNITY_DM_NOT_ALLOWED', errcode = 'P0001';
  end if;
  perform public.community_lock_pair(p_user_id, p_target_user_id);
  insert into public.community_conversations(user_low, user_high) values (v_low, v_high)
    on conflict (user_low, user_high) do nothing;
  select * into v_conversation from public.community_conversations
    where user_low = v_low and user_high = v_high;
  return public.community_conversation_view(p_user_id, v_conversation);
end;
$$;

-- At most 60 messages per 10 minutes per sender.
create function public.community_send_message(p_user_id uuid, p_conversation_id uuid, p_content text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_content text := nullif(btrim(p_content), '');
  v_conversation public.community_conversations;
  v_other uuid;
  v_message public.community_messages;
begin
  if p_user_id is null or p_conversation_id is null or v_content is null or char_length(v_content) > 1000 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  v_conversation := public.community_my_conversation(p_user_id, p_conversation_id);
  v_other := public.community_conversation_other(v_conversation, p_user_id);
  perform public.community_require_writable(p_user_id);
  if not public.community_account_writable(v_other) then
    raise exception using message = 'COMMUNITY_CONVERSATION_NOT_FOUND', errcode = 'P0001';
  end if;
  perform 1 from public.community_conversations where conversation_id = p_conversation_id for update;
  if not found then
    raise exception using message = 'COMMUNITY_CONVERSATION_NOT_FOUND', errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':community-message', 0));
  if (select count(*) from public.community_messages
      where user_id = p_user_id and created_at > clock_timestamp() - interval '10 minutes') >= 60 then
    raise exception using message = 'COMMUNITY_RATE_LIMITED', errcode = 'P0001';
  end if;
  insert into public.community_messages(conversation_id, user_id, content)
    values (p_conversation_id, p_user_id, v_content) returning * into v_message;
  update public.community_conversations set last_message_at = v_message.created_at
    where conversation_id = p_conversation_id;
  insert into public.community_conversation_reads(conversation_id, user_id, last_read_at)
    values (p_conversation_id, p_user_id, v_message.created_at)
    on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object('message_id', v_message.message_id, 'conversation_id', p_conversation_id,
    'content', v_message.content, 'created_at', v_message.created_at, 'is_mine', true);
end;
$$;

-- Newest first, keyset paginated; the app shows them bottom-up.
create function public.community_message_list(
  p_user_id uuid, p_conversation_id uuid, p_before_created_at timestamptz, p_before_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_conversation_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_my_conversation(p_user_id, p_conversation_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'message_id', m.message_id, 'conversation_id', m.conversation_id, 'content', m.content,
        'created_at', m.created_at, 'is_mine', m.user_id = p_user_id)
      order by m.created_at desc, m.message_id desc)
    from (
      select * from public.community_messages m
      where m.conversation_id = p_conversation_id
        and (p_before_created_at is null or (m.created_at, m.message_id) < (p_before_created_at, p_before_id))
      order by m.created_at desc, m.message_id desc
      limit p_limit
    ) m), '[]'::jsonb);
end;
$$;

-- Conversations with at least one message, most recent first. Blocked users are hidden.
create function public.community_conversation_list(
  p_user_id uuid, p_before_at timestamptz, p_before_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_before_at is null) <> (p_before_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_conversation_view(p_user_id, s.c)
                     order by (s.c).last_message_at desc, (s.c).conversation_id desc)
    from (
      select c
      from public.community_conversations c
      where p_user_id in (c.user_low, c.user_high) and c.last_message_at is not null
        and (p_before_at is null or (c.last_message_at, c.conversation_id) < (p_before_at, p_before_id))
        and not public.community_blocked_between(p_user_id, public.community_conversation_other(c, p_user_id))
      order by c.last_message_at desc, c.conversation_id desc
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

create function public.community_read_conversation(p_user_id uuid, p_conversation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_conversation_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  -- Hold the conversation until the read mark is written. Account deletion may otherwise
  -- remove it between the visibility check and INSERT, leaving an orphan read row.
  perform 1 from public.community_conversations
    where conversation_id = p_conversation_id and p_user_id in (user_low, user_high) for update;
  if not found then
    raise exception using message = 'COMMUNITY_CONVERSATION_NOT_FOUND', errcode = 'P0001';
  end if;
  perform public.community_my_conversation(p_user_id, p_conversation_id);
  insert into public.community_conversation_reads(conversation_id, user_id, last_read_at)
    values (p_conversation_id, p_user_id, clock_timestamp())
    on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object('conversation_id', p_conversation_id, 'unread_count', 0);
end;
$$;

-- Unread messages from others in conversations the user can still see.
create function public.community_unread_message_count(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('unread_count', count(*))
  from public.community_conversations c
  join public.community_messages m on m.conversation_id = c.conversation_id and m.user_id <> p_user_id
  left join public.community_conversation_reads r on r.conversation_id = c.conversation_id and r.user_id = p_user_id
  where p_user_id in (c.user_low, c.user_high)
    and (r.last_read_at is null or m.created_at > r.last_read_at)
    and not public.community_blocked_between(p_user_id, public.community_conversation_other(c, p_user_id))
$$;

-- Senders delete their own messages for both sides.
create function public.community_delete_message(p_user_id uuid, p_message_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_conversation_id uuid;
  v_conversation public.community_conversations;
begin
  if p_user_id is null or p_message_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  select m.conversation_id into v_conversation_id from public.community_messages m
    where m.message_id = p_message_id and m.user_id = p_user_id;
  if not found then
    raise exception using message = 'COMMUNITY_MESSAGE_NOT_FOUND', errcode = 'P0001';
  end if;
  select * into v_conversation from public.community_conversations
    where conversation_id = v_conversation_id and p_user_id in (user_low, user_high);
  if not found or not public.community_account_writable(
       public.community_conversation_other(v_conversation, p_user_id)) then
    raise exception using message = 'COMMUNITY_MESSAGE_NOT_FOUND', errcode = 'P0001';
  end if;
  -- Serialize with sends and recalculate the inbox ordering after deleting the message.
  perform 1 from public.community_conversations where conversation_id = v_conversation_id for update;
  if not found then
    raise exception using message = 'COMMUNITY_MESSAGE_NOT_FOUND', errcode = 'P0001';
  end if;
  delete from public.community_messages where message_id = p_message_id and user_id = p_user_id;
  if not found then
    raise exception using message = 'COMMUNITY_MESSAGE_NOT_FOUND', errcode = 'P0001';
  end if;
  update public.community_conversations set last_message_at = (
    select max(m.created_at) from public.community_messages m
    where m.conversation_id = v_conversation_id)
    where conversation_id = v_conversation_id;
  return jsonb_build_object('deleted', true, 'message_id', p_message_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

-- Same as in 20261015062629, plus the leaving user's conversations (both sides, so nothing they
-- wrote stays with the other user) and the bans of clubs removed with the owner.
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
  -- Owned clubs pass to the earliest-joined member who is not leaving.
  update public.community_clubs c set owner_user_id = h.user_id
    from (select distinct on (m.club_id) m.club_id, m.user_id
          from public.community_club_members m
          join public.community_clubs oc on oc.club_id = m.club_id and oc.owner_user_id = p_user_id
          where m.user_id <> p_user_id
            and not exists (select 1 from autofit_integrity.account_deletions d where d.user_id = m.user_id)
          order by m.club_id, m.joined_at, m.user_id) h
    where c.club_id = h.club_id;
  update public.community_club_members m set role = 'owner'
    from public.community_clubs c
    where c.club_id = m.club_id and c.owner_user_id = m.user_id and m.role <> 'owner';
  -- Clubs nobody can take over are removed. Earlier posts of former members keep their
  -- club_id and stay visible on the authors' profiles only.
  with gone as (delete from public.community_clubs where owner_user_id = p_user_id returning club_id),
       members as (delete from public.community_club_members m using gone g where m.club_id = g.club_id)
  delete from public.community_club_bans b using gone g where b.club_id = g.club_id;
  -- Conversations with the leaving user go for both sides.
  delete from public.community_messages m using public.community_conversations c
    where m.conversation_id = c.conversation_id and p_user_id in (c.user_low, c.user_high);
  delete from public.community_conversation_reads r using public.community_conversations c
    where r.conversation_id = c.conversation_id and p_user_id in (c.user_low, c.user_high);
  delete from public.community_conversations where p_user_id in (user_low, user_high);
end;
$$;

revoke all on function
  public.community_conversation_other(public.community_conversations, uuid),
  public.community_my_conversation(uuid, uuid),
  public.community_conversation_view(uuid, public.community_conversations),
  public.community_open_conversation(uuid, uuid),
  public.community_send_message(uuid, uuid, text),
  public.community_message_list(uuid, uuid, timestamptz, uuid, integer),
  public.community_conversation_list(uuid, timestamptz, uuid, integer),
  public.community_read_conversation(uuid, uuid),
  public.community_unread_message_count(uuid),
  public.community_delete_message(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.community_conversation_other(public.community_conversations, uuid),
  public.community_my_conversation(uuid, uuid),
  public.community_conversation_view(uuid, public.community_conversations),
  public.community_open_conversation(uuid, uuid),
  public.community_send_message(uuid, uuid, text),
  public.community_message_list(uuid, uuid, timestamptz, uuid, integer),
  public.community_conversation_list(uuid, timestamptz, uuid, integer),
  public.community_read_conversation(uuid, uuid),
  public.community_unread_message_count(uuid),
  public.community_delete_message(uuid, uuid)
  to service_role;
