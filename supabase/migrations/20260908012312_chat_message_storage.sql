-- Applied to Auto-Fit on 2026-09-08; filename matches remote migration history.
-- Additive, no foreign keys.
alter table public.chat_messages
  add column client_message_id uuid,
  add column intent text,
  add column response_source text,
  add column needs_more_data boolean not null default false,
  add column evidence jsonb not null default '[]'::jsonb,
  add column required_data jsonb not null default '[]'::jsonb,
  add constraint chat_message_source_check check (
    response_source in ('database','database_ai','general_ai','need_more_data')),
  add constraint chat_message_arrays_check check (
    jsonb_typeof(evidence) = 'array' and jsonb_typeof(required_data) = 'array');

create unique index chat_message_request_sender_unique
  on public.chat_messages(user_id, client_message_id, sender_type)
  where client_message_id is not null;
create index chat_message_page_idx on public.chat_messages(user_id, chat_id, created_at desc, message_id desc);
create index chat_page_idx on public.chats(user_id, updated_at desc, chat_id desc);

-- Null p_answer performs a replay/ownership preflight without writing.
-- Final call atomically stores both messages, or returns the winning pair.
create function public.save_chat_exchange(
  p_user_id uuid, p_chat_id uuid, p_client_message_id uuid,
  p_content text, p_answer jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c public.chats%rowtype;
  u public.chat_messages%rowtype;
  a public.chat_messages%rowtype;
  replay boolean := false;
  t timestamptz;
begin
  if p_user_id is null or p_chat_id is null or p_client_message_id is null
     or p_content is null or length(btrim(p_content)) not between 1 and 500 then
    raise exception using message = 'CHAT_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_client_message_id::text, 0));
  select * into c from public.chats
    where chat_id = p_chat_id and user_id = p_user_id for update;
  if not found then
    raise exception using message = 'CHAT_NOT_FOUND', errcode = 'P0001';
  end if;
  select * into u from public.chat_messages
    where user_id = p_user_id and client_message_id = p_client_message_id and sender_type = 'user';
  if found then
    if u.chat_id <> p_chat_id or u.content <> p_content then
      raise exception using message = 'IDEMPOTENCY_CONFLICT', errcode = 'P0001';
    end if;
    select * into a from public.chat_messages
      where user_id = p_user_id and chat_id = p_chat_id
        and client_message_id = p_client_message_id and sender_type = 'assistant';
    if not found then
      raise exception using message = 'CHAT_STORAGE_INCOMPLETE', errcode = 'P0001';
    end if;
    replay := true;
  else
    if c.status <> 'active' then
      raise exception using message = 'CHAT_ARCHIVED', errcode = 'P0001';
    end if;
    if p_answer is null then return null; end if;
    if jsonb_typeof(p_answer) is distinct from 'object'
      or nullif(btrim(p_answer->>'content'), '') is null
      or coalesce(p_answer->>'response_source','') not in ('database','database_ai','general_ai','need_more_data')
      or jsonb_typeof(p_answer->'evidence') is distinct from 'array'
      or jsonb_typeof(p_answer->'required_data') is distinct from 'array'
      or jsonb_typeof(p_answer->'needs_more_data') is distinct from 'boolean' then
      raise exception using message = 'CHAT_INVALID_INPUT', errcode = 'P0001';
    end if;
    -- Keep user then assistant chronological, including rapid consecutive requests.
    select greatest(clock_timestamp(), coalesce(max(created_at) + interval '1 microsecond', clock_timestamp()))
      into t from public.chat_messages where chat_id = p_chat_id and user_id = p_user_id;
    insert into public.chat_messages(chat_id,user_id,client_message_id,sender_type,content,created_at)
      values(p_chat_id,p_user_id,p_client_message_id,'user',p_content,t) returning * into u;
    insert into public.chat_messages(chat_id,user_id,client_message_id,sender_type,content,
      intent,response_source,needs_more_data,evidence,required_data,created_at)
      values(p_chat_id,p_user_id,p_client_message_id,'assistant',p_answer->>'content',
        p_answer->>'intent',p_answer->>'response_source',(p_answer->>'needs_more_data')::boolean,
        p_answer->'evidence',p_answer->'required_data',t + interval '1 microsecond') returning * into a;
    update public.chats set title = coalesce(title,left(p_content,100)), updated_at = clock_timestamp()
      where chat_id = p_chat_id and user_id = p_user_id returning * into c;
  end if;
  return jsonb_build_object('is_replay',replay,'chat',to_jsonb(c),
    'user_message',to_jsonb(u),'assistant_message',to_jsonb(a));
end;
$$;
revoke all on function public.save_chat_exchange(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_chat_exchange(uuid,uuid,uuid,text,jsonb) to service_role;
