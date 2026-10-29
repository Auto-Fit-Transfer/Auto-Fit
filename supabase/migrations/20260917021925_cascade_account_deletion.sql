-- No physical FKs. Account deletion is the only automatic business-data cascade.
create table autofit_integrity.account_deletions (
  user_id uuid primary key,
  started_at timestamptz not null default now()
);
alter table autofit_integrity.account_deletions enable row level security;
revoke all on autofit_integrity.account_deletions from public,anon,authenticated,service_role;

create function autofit_integrity.assert_account_writable(uid uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if uid is null then return; end if;
  perform 1 from auth.users where id=uid and deleted_at is null for share;
  if not found then raise exception 'Account is unavailable' using errcode='23503'; end if;
  if exists(select 1 from autofit_integrity.account_deletions where user_id=uid) then
    raise exception 'Account deletion is in progress' using errcode='23514';
  end if;
end $$;

create function autofit_integrity.check_account_writable()
returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
  uid:=autofit_integrity.business_owner(tg_table_name,to_jsonb(new));
  perform autofit_integrity.assert_account_writable(uid);
  if tg_op='UPDATE' then
    perform autofit_integrity.assert_account_writable(autofit_integrity.business_owner(tg_table_name,to_jsonb(old)));
  end if;
  return new;
end $$;

-- Guard Storage INSERT/UPDATE, including service uploads whose owner_id is NULL.
-- Never delete Storage metadata via SQL: the API must remove the underlying file.
create function autofit_integrity.check_storage_account_writable()
returns trigger language plpgsql security definer set search_path='' as $$
declare candidate text; candidates text[]; path_uid text;
begin
  path_uid:=case when strpos(new.name,'/')>0 then split_part(new.name,'/',1) end;
  if new.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and path_uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and new.owner_id::uuid<>path_uid::uuid then
    raise exception 'Storage owner and account folder must match' using errcode='23514';
  end if;
  candidates:=array[new.owner_id,case when strpos(new.name,'/')>0 then split_part(new.name,'/',1) end];
  if tg_op='UPDATE' then
    candidates:=candidates||array[old.owner_id,case when strpos(old.name,'/')>0 then split_part(old.name,'/',1) end];
  end if;
  for candidate in select distinct x from unnest(candidates) x where x is not null loop
    if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform autofit_integrity.assert_account_writable(candidate::uuid);
    end if;
  end loop;
  return new;
end $$;

create function public.begin_account_deletion(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'Account deletion requires READ COMMITTED' using errcode='0A000';
  end if;
  perform 1 from auth.users where id=p_user_id and deleted_at is null for update;
  if not found then raise exception 'Account not found' using errcode='P0002'; end if;
  insert into autofit_integrity.account_deletions(user_id) values(p_user_id) on conflict do nothing;
end $$;

create function public.account_deletion_storage(p_user_id uuid)
returns table(bucket_id text,name text) language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from autofit_integrity.account_deletions where user_id=p_user_id) then
    raise exception 'Begin account deletion before listing files' using errcode='23514';
  end if;
  if exists(select 1 from storage.objects o
    where (o.owner_id=p_user_id::text or split_part(o.name,'/',1)=p_user_id::text)
      and o.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(o.name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and lower(o.owner_id)<>lower(split_part(o.name,'/',1))) then
    raise exception 'Conflicting storage ownership requires inspection' using errcode='23503';
  end if;
  return query select o.bucket_id,o.name from storage.objects o
    where o.owner_id=p_user_id::text or split_part(o.name,'/',1)=p_user_id::text
    order by o.bucket_id,o.name limit 500;
end $$;

-- Delete incoming references first. Keep shared catalog rows; reject unexpected
-- links owned by another account rather than silently deleting another user's data.
create function autofit_integrity.purge_account_rows(tbl text,col text,ref uuid,uid uuid,depth integer default 0)
returns void language plpgsql security definer set search_path='' as $$
declare row_data jsonb; dep record; owner_id uuid; child_ref uuid;
begin
  if depth>16 then raise exception 'Account dependency cycle or excessive depth'; end if;
  for row_data in execute format('select to_jsonb(r) from public.%I r where %I=$1 for update',tbl,col) using ref loop
    owner_id:=autofit_integrity.business_owner(tbl,row_data);
    if owner_id is distinct from uid then
      raise exception 'Account cascade encountered another owner in %',tbl using errcode='23503';
    end if;
    for dep in select * from autofit_integrity.business_references where parent_table=tbl order by child_table,child_column loop
      child_ref:=(row_data->>dep.parent_column)::uuid;
      if child_ref is not null then
        perform autofit_integrity.purge_account_rows(dep.child_table,dep.child_column,child_ref,uid,depth+1);
      end if;
    end loop;
    if tbl='reports' then
      perform autofit_integrity.purge_account_rows('notifications','related_id',(row_data->>'report_id')::uuid,uid,depth+1);
    end if;
  end loop;
  execute format('delete from public.%I where %I=$1',tbl,col) using ref;
end $$;

create function autofit_integrity.cascade_account_deletion()
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

revoke all on function autofit_integrity.assert_account_writable(uuid),
  autofit_integrity.check_account_writable(),autofit_integrity.check_storage_account_writable(),
  autofit_integrity.purge_account_rows(text,text,uuid,uuid,integer),autofit_integrity.cascade_account_deletion()
  from public,anon,authenticated,service_role;
revoke all on function public.begin_account_deletion(uuid),public.account_deletion_storage(uuid)
  from public,anon,authenticated;
grant execute on function public.begin_account_deletion(uuid),public.account_deletion_storage(uuid) to service_role;

do $$ declare dep record; begin
  for dep in select c.table_name from information_schema.columns c
    join information_schema.tables t using(table_schema,table_name)
    where c.table_schema='public' and c.column_name='user_id' and t.table_type='BASE TABLE'
    union select distinct child_table from autofit_integrity.business_references loop
    execute format('create trigger zzz_check_account_writable before insert or update on public.%I for each row execute function autofit_integrity.check_account_writable()',dep.table_name);
  end loop;
end $$;
create trigger zzz_check_storage_account_writable before insert or update on storage.objects
  for each row execute function autofit_integrity.check_storage_account_writable();
-- Alphabetical trigger order: cascade precedes auth_user_protect_removal.
create trigger aa_cascade_account_deletion before delete on auth.users
  for each row execute function autofit_integrity.cascade_account_deletion();
