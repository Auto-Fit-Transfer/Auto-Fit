-- Main Figma 1:2 / Tier_Screen 1323:3256.
-- Deliberately no physical FOREIGN KEYs: reuse Auto-Fit's logical integrity registry.
-- No score thresholds or user awards are seeded. Version 1 remains a draft.

create table public.tier_definitions (
  tier_definition_id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  revision integer not null default 1 check (revision > 0),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  description text not null default '' check (length(description) <= 1000),
  display_order integer not null check (display_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(code,revision)
);

create table public.tier_policy_versions (
  tier_policy_version_id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  name text not null check (length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  -- Main illustrates diet 30 + exercise 30 + health-data 40. These are draft caps,
  -- not an approved scoring algorithm; publication requires an explicit rules object.
  diet_max_score numeric(7,2) not null default 30 check (diet_max_score between 0 and 10000),
  exercise_max_score numeric(7,2) not null default 30 check (exercise_max_score between 0 and 10000),
  health_max_score numeric(7,2) not null default 40 check (health_max_score between 0 and 10000),
  total_max_score numeric(7,2) generated always as (diet_max_score + exercise_max_score + health_max_score) stored,
  scoring_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(scoring_rules) = 'object'),
  change_note text not null default '' check (length(change_note) <= 2000),
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tier_policy_positive_total check (total_max_score > 0 and total_max_score <= 10000),
  constraint tier_policy_lifecycle check (
    (status='draft' and published_at is null and retired_at is null) or
    (status='active' and published_at is not null and retired_at is null) or
    (status='retired' and published_at is not null and retired_at is not null and retired_at >= published_at)
  )
);
create unique index tier_policy_one_active on public.tier_policy_versions(status) where status='active';

create table public.tier_policy_bands (
  tier_policy_band_id uuid primary key default gen_random_uuid(),
  tier_policy_version_id uuid not null,
  tier_definition_id uuid not null,
  sublevel integer not null check (sublevel between 1 and 99),
  score_from numeric(7,2) not null check (score_from >= 0 and score_from < 10000),
  score_to numeric(7,2) not null check (score_to > 0 and score_to <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tier_band_positive_range check (score_from < score_to),
  constraint tier_band_unique_level unique (tier_policy_version_id,tier_definition_id,sublevel),
  constraint tier_band_unique_floor unique (tier_policy_version_id,score_from)
);
create index tier_band_definition_idx on public.tier_policy_bands(tier_definition_id);

create table public.user_tier_evaluations (
  user_tier_evaluation_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tier_policy_version_id uuid not null,
  tier_policy_band_id uuid not null,
  -- Optional source for the health-data contribution. Ownership is checked by
  -- the same registry as other Auto-Fit health references.
  health_assessment_id uuid,
  source_key text not null check (length(btrim(source_key)) between 1 and 160),
  diet_score numeric(7,2) not null check (diet_score between 0 and 10000),
  exercise_score numeric(7,2) not null check (exercise_score between 0 and 10000),
  health_score numeric(7,2) not null check (health_score between 0 and 10000),
  total_score numeric(7,2) generated always as (diet_score + exercise_score + health_score) stored,
  -- Calculation evidence is server-owned. No medical documents or secrets belong here.
  calculation_details jsonb not null default '{}'::jsonb check (jsonb_typeof(calculation_details) = 'object'),
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_tier_evaluation_source_unique unique(user_id,tier_policy_version_id,source_key),
  constraint user_tier_evaluation_time check (isfinite(evaluated_at) and evaluated_at <= created_at),
  constraint user_tier_evaluation_created_time check (isfinite(created_at))
);
create index user_tier_evaluation_latest_idx on public.user_tier_evaluations(user_id,evaluated_at desc,created_at desc,user_tier_evaluation_id desc);
create index user_tier_evaluation_policy_idx on public.user_tier_evaluations(tier_policy_version_id);
create index user_tier_evaluation_band_idx on public.user_tier_evaluations(tier_policy_band_id);
create index user_tier_evaluation_assessment_idx on public.user_tier_evaluations(health_assessment_id) where health_assessment_id is not null;

-- Reuse the existing private, revoked trigger helpers; do not replace any existing
-- account-deletion/community functions. Registering user_id and these UUID links
-- makes account deletion discover and remove tier evaluations automatically.
insert into autofit_integrity.business_references(child_table,child_column,parent_table,parent_column) values
('tier_policy_bands','tier_policy_version_id','tier_policy_versions','tier_policy_version_id'),
('tier_policy_bands','tier_definition_id','tier_definitions','tier_definition_id'),
('user_tier_evaluations','tier_policy_version_id','tier_policy_versions','tier_policy_version_id'),
('user_tier_evaluations','tier_policy_band_id','tier_policy_bands','tier_policy_band_id'),
('user_tier_evaluations','health_assessment_id','health_assessments','health_assessment_id');

create function autofit_integrity.guard_tier_definition()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'Tier configuration changes require READ COMMITTED' using errcode='0A000';
  end if;
  if tg_op='UPDATE' then
    if new.code is distinct from old.code or new.revision is distinct from old.revision or new.created_at is distinct from old.created_at then
      raise exception 'Tier code, revision and creation time are immutable' using errcode='23514';
    end if;
    -- Publishing locks these definition rows FOR SHARE. Once published, labels
    -- and rank are historical data too; insert a new revision of the same code for changes.
    if exists(select 1 from public.tier_policy_bands b join public.tier_policy_versions p
      on p.tier_policy_version_id=b.tier_policy_version_id
      where b.tier_definition_id=old.tier_definition_id and p.status<>'draft') then
      raise exception 'Published tier definitions are immutable' using errcode='23514';
    end if;
    new.updated_at:=now();
  end if;
  return new;
end $$;

create function autofit_integrity.guard_tier_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record; previous_end numeric:=0; previous_rank integer:=0; previous_stage integer:=0; band_count integer:=0;
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'Tier configuration changes require READ COMMITTED' using errcode='0A000';
  end if;
  if tg_op='INSERT' then
    if new.status<>'draft' or new.published_at is not null or new.retired_at is not null then
      raise exception 'Create tier policies as drafts before publication' using errcode='23514';
    end if;
    return new;
  end if;
  if new.version is distinct from old.version or new.created_at is distinct from old.created_at then
    raise exception 'Tier policy version and creation time are immutable' using errcode='23514';
  end if;
  if old.status<>'draft' then
    if not (old.status='active' and new.status='retired') or
      (to_jsonb(new)-array['status','updated_at','published_at','retired_at','total_max_score']) is distinct from
      (to_jsonb(old)-array['status','updated_at','published_at','retired_at','total_max_score']) then
      raise exception 'Published tier policies are immutable; create a new version' using errcode='23514';
    end if;
    new.published_at:=old.published_at;
    new.retired_at:=now();
  elsif new.status='active' then
    if new.scoring_rules='{}'::jsonb then
      raise exception 'Define scoring rules before activating a tier policy' using errcode='23514';
    end if;
    -- The UPDATE already locks the policy row. Band edits take the same lock,
    -- serializing edits/publication even when they run concurrently.
    if (select count(distinct b.tier_definition_id) from public.tier_policy_bands b
      where b.tier_policy_version_id=new.tier_policy_version_id)<>5 or
      (select array_agg(distinct d.code order by d.code) from public.tier_policy_bands b
       join public.tier_definitions d on d.tier_definition_id=b.tier_definition_id
       where b.tier_policy_version_id=new.tier_policy_version_id) is distinct from
       array['ACTIVE','BALANCE','CORE','FIT','PEAK']::text[] then
      raise exception 'An active policy requires exactly one revision of each Main tier' using errcode='23514';
    end if;
    for item in select b.*,d.display_order,d.code from public.tier_policy_bands b
      join public.tier_definitions d on d.tier_definition_id=b.tier_definition_id
      where b.tier_policy_version_id=new.tier_policy_version_id
      order by b.score_from for share of d
    loop
      band_count:=band_count+1;
      if item.display_order<>array_position(array['CORE','BALANCE','ACTIVE','FIT','PEAK']::text[],item.code) then
        raise exception 'Tier order must match Main: CORE, BALANCE, ACTIVE, FIT, PEAK' using errcode='23514';
      end if;
      if item.score_from<>previous_end or item.display_order<previous_rank or item.display_order>previous_rank+1 or
        (item.display_order=previous_rank and item.sublevel<>previous_stage+1) or
        (item.display_order>previous_rank and item.sublevel<>1) then
        raise exception 'Tier bands must cover the score range in tier/sublevel order without gaps' using errcode='23514';
      end if;
      previous_end:=item.score_to; previous_rank:=item.display_order; previous_stage:=item.sublevel;
    end loop;
    if band_count=0 or previous_rank<>5 or previous_end<>new.diet_max_score+new.exercise_max_score+new.health_max_score then
      raise exception 'Tier bands must cover zero through the total maximum score' using errcode='23514';
    end if;
    new.published_at:=now(); new.retired_at:=null;
  elsif new.status<>'draft' then
    raise exception 'A draft tier policy can only become active' using errcode='23514';
  else
    if exists(select 1 from public.tier_policy_bands b where b.tier_policy_version_id=new.tier_policy_version_id
      and b.score_to>new.diet_max_score+new.exercise_max_score+new.health_max_score) then
      raise exception 'Policy maximum is below an existing tier band' using errcode='23514';
    end if;
    new.published_at:=null; new.retired_at:=null;
  end if;
  new.updated_at:=now();
  return new;
end $$;

create function autofit_integrity.guard_tier_band()
returns trigger language plpgsql security definer set search_path='' as $$
declare policy_row public.tier_policy_versions; row_data public.tier_policy_bands;
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'Tier configuration changes require READ COMMITTED' using errcode='0A000';
  end if;
  if tg_op='DELETE' then row_data:=old; else row_data:=new; end if;
  if tg_op='UPDATE' and (new.tier_policy_version_id is distinct from old.tier_policy_version_id
    or new.created_at is distinct from old.created_at) then
    raise exception 'A tier band cannot move between policy versions' using errcode='23514';
  end if;
  select * into policy_row from public.tier_policy_versions
    where tier_policy_version_id=row_data.tier_policy_version_id for update;
  if not found then raise exception 'Tier policy does not exist' using errcode='23503'; end if;
  if policy_row.status<>'draft' then
    raise exception 'Published tier bands are immutable; create a new policy version' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.score_from is null or new.score_to is null or not (
    new.score_from>=0 and new.score_from<new.score_to and new.score_to<=policy_row.total_max_score
  ) then
    raise exception 'Tier band must be finite, positive-width and within policy maximum' using errcode='23514';
  end if;
  if exists(select 1 from public.tier_policy_bands b
    where b.tier_policy_version_id=new.tier_policy_version_id
    and b.tier_policy_band_id<>new.tier_policy_band_id
    and numrange(b.score_from,b.score_to,'[)') && numrange(new.score_from,new.score_to,'[)')) then
    raise exception 'Tier score bands cannot overlap' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end $$;

create function autofit_integrity.guard_tier_evaluation()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.tier_policy_versions; b public.tier_policy_bands; score numeric;
begin
  if tg_op='UPDATE' then
    raise exception 'Tier evaluations are immutable; append a corrected evaluation' using errcode='23514';
  end if;
  select * into p from public.tier_policy_versions where tier_policy_version_id=new.tier_policy_version_id for share;
  if not found then raise exception 'Tier policy does not exist' using errcode='23503'; end if;
  if p.status<>'active' then raise exception 'Tier evaluations require an active policy' using errcode='23514'; end if;
  select * into b from public.tier_policy_bands where tier_policy_band_id=new.tier_policy_band_id for share;
  if not found or b.tier_policy_version_id<>p.tier_policy_version_id then
    raise exception 'Tier band must belong to the evaluation policy' using errcode='23503';
  end if;
  score:=new.diet_score+new.exercise_score+new.health_score;
  if new.diet_score>p.diet_max_score or new.exercise_score>p.exercise_max_score or new.health_score>p.health_max_score then
    raise exception 'Tier component score exceeds policy maximum' using errcode='23514';
  end if;
  if score<b.score_from or score>b.score_to or (score=b.score_to and b.score_to<>p.total_max_score) then
    raise exception 'Tier evaluation score does not match its band' using errcode='23514';
  end if;
  -- Generated columns are not available in BEFORE triggers; validate the sum above.
  return new;
end $$;

revoke all on function autofit_integrity.guard_tier_definition(),autofit_integrity.guard_tier_policy(),
  autofit_integrity.guard_tier_band(),autofit_integrity.guard_tier_evaluation()
  from public,anon,authenticated,service_role;

create trigger a_guard_tier_definition before update on public.tier_definitions
for each row execute function autofit_integrity.guard_tier_definition();
create trigger a_guard_tier_policy before insert or update on public.tier_policy_versions
for each row execute function autofit_integrity.guard_tier_policy();
create trigger a_guard_tier_band before insert or update or delete on public.tier_policy_bands
for each row execute function autofit_integrity.guard_tier_band();
create trigger check_user_reference before insert or update on public.user_tier_evaluations
for each row execute function autofit_integrity.check_user_reference();
-- Alphabetically after check_user_reference: lock the auth owner before policies.
create trigger tier_evaluation_validate before insert or update on public.user_tier_evaluations
for each row execute function autofit_integrity.guard_tier_evaluation();
create trigger zzz_check_account_writable before insert or update on public.user_tier_evaluations
for each row execute function autofit_integrity.check_account_writable();

do $$ declare tbl text; begin
  foreach tbl in array array['tier_policy_bands','user_tier_evaluations'] loop
    execute format('create trigger z_check_business_references before insert or update on public.%I for each row execute function autofit_integrity.check_business_references()',tbl);
  end loop;
  foreach tbl in array array['tier_definitions','tier_policy_versions','tier_policy_bands'] loop
    execute format('create trigger protect_business_parent before delete or update on public.%I for each row execute function autofit_integrity.protect_business_parent()',tbl);
    execute format('create trigger block_tier_truncate before truncate on public.%I for each statement execute function autofit_integrity.block_parent_truncate()',tbl);
  end loop;
  foreach tbl in array array['tier_definitions','tier_policy_versions','tier_policy_bands','user_tier_evaluations'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tbl);
    execute format('grant select on public.%I to service_role',tbl);
  end loop;
end $$;
-- Backend may append verified evaluations. Editing rules/publishing policies is
-- an administrative migration, never a mobile or arbitrary REST write.
grant insert on public.user_tier_evaluations to service_role;

insert into public.tier_definitions(code,display_name,description,display_order) values
('CORE','CORE','건강관리 기반 형성',1),
('BALANCE','BALANCE','건강의 균형 잡아가기',2),
('ACTIVE','ACTIVE','꾸준한 실천',3),
('FIT','FIT','나에게 맞는 건강관리 안정화',4),
('PEAK','PEAK','최상의 건강흐름 유지',5);
insert into public.tier_policy_versions(version,name,change_note)
values (1,'Main 티어 기준 초안','점수 구간과 승급·강등 기준 미정. 확정 전 활성화 및 사용자 티어 산정 금지.');

comment on table public.tier_definitions is 'Main의 티어 카탈로그. 물리 FK 대신 autofit_integrity 참조 검증.';
comment on table public.tier_policy_versions is '티어 산정 기준 버전. 초안만 수정 가능하며 게시 후에는 새 버전으로 변경.';
comment on table public.tier_policy_bands is '버전별 티어·하위 단계 점수 구간. 하한 포함, 상한 제외; 정책의 최종 최대 점수만 포함.';
comment on table public.user_tier_evaluations is '서버가 검증한 티어 산정 이력. 수정하지 않고 새 평가를 추가. 가장 최근 evaluated_at을 현재 상태로 조회.';
