-- Apply before deploying the API caller. No foreign keys or message content.
create table public.chat_rate_limit_events (
  event_id bigint generated always as identity primary key,
  user_id uuid not null,
  bucket text not null check (bucket in ('requests', 'answers')),
  created_at timestamptz not null default clock_timestamp()
);
create index chat_rate_limit_user_window_idx on public.chat_rate_limit_events(user_id,bucket,created_at);
create index chat_rate_limit_cleanup_idx on public.chat_rate_limit_events(created_at);
alter table public.chat_rate_limit_events enable row level security;
revoke all on public.chat_rate_limit_events from public,anon,authenticated;
grant select,insert,delete on public.chat_rate_limit_events to service_role;
grant usage on sequence public.chat_rate_limit_events_event_id_seq to service_role;

create function public.consume_chat_rate_limit(p_user_id uuid, p_bucket text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  capacity int;
  t timestamptz;
  used int;
  oldest timestamptz;
begin
  if p_user_id is null or p_bucket is null or p_bucket not in ('requests','answers') then
    raise exception 'INVALID_RATE_LIMIT_INPUT';
  end if;
  capacity := case when p_bucket='requests' then 60 else 10 end;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':chat-limit:'||p_bucket,0));
  t := clock_timestamp();
  delete from public.chat_rate_limit_events
    where user_id=p_user_id and bucket=p_bucket and created_at <= t-interval '60 seconds';
  select count(*), min(created_at) into used,oldest from public.chat_rate_limit_events
    where user_id=p_user_id and bucket=p_bucket;
  if used >= capacity then
    return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from oldest+interval '60 seconds'-t))::int),'limit',capacity);
  end if;
  insert into public.chat_rate_limit_events(user_id,bucket,created_at) values(p_user_id,p_bucket,t);
  return jsonb_build_object('allowed',true,'retry_after',0,'limit',capacity);
end;
$$;
revoke all on function public.consume_chat_rate_limit(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_chat_rate_limit(uuid,text) to service_role;
