alter table public.chat_messages
  add column action text,
  add column action_status text,
  add column requires_backend_apply boolean,
  add column action_data jsonb,
  add column pending_action_id uuid,
  add constraint chat_message_action_data_object_check
    check (action_data is null or jsonb_typeof(action_data) = 'object');

-- Preserve structured actions across refresh while retaining the old nullable
-- fields for all existing chat messages.
create or replace function public.save_chat_exchange(
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
      or jsonb_typeof(p_answer->'needs_more_data') is distinct from 'boolean'
      or (p_answer ? 'action' and (
        jsonb_typeof(p_answer->'action') is distinct from 'string'
        or jsonb_typeof(p_answer->'action_status') is distinct from 'string'
        or jsonb_typeof(p_answer->'requires_backend_apply') is distinct from 'boolean'
        or (p_answer->'action_data' is not null
            and jsonb_typeof(p_answer->'action_data') not in ('object', 'null'))
      )) then
      raise exception using message = 'CHAT_INVALID_INPUT', errcode = 'P0001';
    end if;
    -- Keep user then assistant chronological, including rapid consecutive requests.
    select greatest(clock_timestamp(), coalesce(max(created_at) + interval '1 microsecond', clock_timestamp()))
      into t from public.chat_messages where chat_id = p_chat_id and user_id = p_user_id;
    insert into public.chat_messages(chat_id,user_id,client_message_id,sender_type,content,created_at)
      values(p_chat_id,p_user_id,p_client_message_id,'user',p_content,t) returning * into u;
    insert into public.chat_messages(chat_id,user_id,client_message_id,sender_type,content,
      intent,response_source,needs_more_data,evidence,required_data,
      action,action_status,requires_backend_apply,action_data,pending_action_id,created_at)
      values(p_chat_id,p_user_id,p_client_message_id,'assistant',p_answer->>'content',
        p_answer->>'intent',p_answer->>'response_source',(p_answer->>'needs_more_data')::boolean,
        p_answer->'evidence',p_answer->'required_data',
        p_answer->>'action',p_answer->>'action_status',
        (p_answer->>'requires_backend_apply')::boolean,
        nullif(p_answer->'action_data', 'null'::jsonb),
        (p_answer->>'pending_action_id')::uuid,t + interval '1 microsecond') returning * into a;
    update public.chats set title = coalesce(title,left(p_content,100)), updated_at = clock_timestamp()
      where chat_id = p_chat_id and user_id = p_user_id returning * into c;
  end if;
  return jsonb_build_object('is_replay',replay,'chat',to_jsonb(c),
    'user_message',to_jsonb(u),'assistant_message',to_jsonb(a));
end;
$$;
revoke all on function public.save_chat_exchange(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_chat_exchange(uuid,uuid,uuid,text,jsonb) to service_role;
