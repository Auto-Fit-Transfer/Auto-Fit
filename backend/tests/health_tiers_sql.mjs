// Isolated PostgreSQL execution. No live user data or remote database is touched.
// node backend/tests/health_tiers_sql.mjs /path/to/@electric-sql/pglite
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const read = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const migration = read('20261015012742_create_versioned_health_tiers.sql');
const base = read('20260901055003_remote_schema.sql');
let checks = 0;
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const rejects = async (sql, args, expected) => {
  await assert.rejects(() => db.query(sql, args), e => e.code === expected, sql);
  checks++;
};
const owner = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const missing = '10000000-0000-0000-0000-000000000003';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema autofit_integrity;
    create table auth.users(id uuid primary key, deleted_at timestamptz);
    create table storage.objects(owner_id text,name text);
    create table public.notification_settings(user_id uuid);
    create table autofit_integrity.business_references(child_table text,child_column text,parent_table text,parent_column text,primary key(child_table,child_column));
    create table autofit_integrity.account_deletions(user_id uuid primary key,started_at timestamptz default now());`);
  for (const table of ['profiles','health_assessments']) {
    const start = base.indexOf(`CREATE TABLE "public"."${table}" (`);
    const end = base.indexOf('\n);',start)+3;
    assert.ok(start >= 0);
    await db.exec(base.slice(start,end));
  }
  for (const name of [
    '20260917013929_enforce_notification_settings_integrity.sql',
    '20260917014724_enforce_user_reference_integrity.sql',
    '20260917015323_enforce_business_reference_integrity.sql',
    '20260917021925_cascade_account_deletion.sql',
  ]) {
    const functions = [...read(name).matchAll(/create function [\s\S]*?\$\$;/gi)];
    for (const match of functions) await db.exec(match[0]);
  }
  await db.exec(`create trigger protect_business_parent before delete or update on public.health_assessments
    for each row execute function autofit_integrity.protect_business_parent();
    create trigger aa_cascade_account_deletion before delete on auth.users
    for each row execute function autofit_integrity.cascade_account_deletion();`);
  await db.exec(migration);
  check(await scalar('select count(*)::int from tier_definitions'),5,'Main catalog');
  check(await scalar("select status from tier_policy_versions where version=1"),'draft','unapproved policy stays draft');
  check(await scalar('select count(*)::int from tier_policy_bands'),0,'no invented thresholds');
  check(await scalar('select count(*)::int from user_tier_evaluations'),0,'no fabricated awards');
  check(await scalar("select count(*)::int from pg_constraint where contype='f' and conrelid in ('tier_definitions'::regclass,'tier_policy_versions'::regclass,'tier_policy_bands'::regclass,'user_tier_evaluations'::regclass)"),0,'no physical FK');
  check(await scalar("select count(*)::int from pg_class where relname in ('tier_definitions','tier_policy_versions','tier_policy_bands','user_tier_evaluations') and relrowsecurity"),4,'all tables RLS');
  const policy = await scalar('select tier_policy_version_id from tier_policy_versions where version=1');
  const core = await scalar("select tier_definition_id from tier_definitions where code='CORE'");
  const balance = await scalar("select tier_definition_id from tier_definitions where code='BALANCE'");
  const active = await scalar("select tier_definition_id from tier_definitions where code='ACTIVE'");
  const peak = await scalar("select tier_definition_id from tier_definitions where code='PEAK'");
  const fit = await scalar("select tier_definition_id from tier_definitions where code='FIT'");
  const addBand = `insert into tier_policy_bands(tier_policy_version_id,tier_definition_id,sublevel,score_from,score_to) values($1,$2,$3,$4,$5) returning tier_policy_band_id`;
  await rejects(addBand,[policy,core,0,0,10],'23514');
  await rejects(addBand,[policy,core,1,-1,10],'23514');
  await rejects(addBand,[policy,core,1,10,101],'23514');
  await rejects(addBand,[policy,core,1,'NaN',100],'23514');
  const low = await scalar(addBand,[policy,core,1,0,50]);
  await rejects(addBand,[policy,fit,1,49,100],'23514');
  const high = await scalar(addBand,[policy,peak,1,51,100]);
  await rejects("update tier_policy_versions set status='active' where tier_policy_version_id=$1",[policy],'23514');
  await db.query("update tier_policy_versions set scoring_rules='{" + '"test_only":true' + "}' where tier_policy_version_id=$1",[policy]);
  await rejects("update tier_policy_versions set status='active' where tier_policy_version_id=$1",[policy],'23514');
  await db.query('update tier_policy_bands set score_from=50 where tier_policy_band_id=$1',[high]);
  await rejects("update tier_policy_versions set status='active' where tier_policy_version_id=$1",[policy],'23514');
  await db.query('update tier_policy_bands set score_to=10 where tier_policy_band_id=$1',[low]);
  await scalar(addBand,[policy,balance,1,10,20]);
  await scalar(addBand,[policy,active,1,20,30]);
  await scalar(addBand,[policy,fit,1,30,50]);
  await db.query('update tier_definitions set display_order=6 where tier_definition_id=$1',[peak]);
  await rejects("update tier_policy_versions set status='active' where tier_policy_version_id=$1",[policy],'23514');
  await db.query('update tier_definitions set display_order=5 where tier_definition_id=$1',[peak]);
  await db.query('update tier_definitions set display_order=case when tier_definition_id=$1 then 5 else 1 end where tier_definition_id in ($1,$2)',[core,peak]);
  await db.query('update tier_policy_bands set sublevel=2 where tier_policy_band_id=$1',[high]);
  await db.query('update tier_policy_bands set tier_definition_id=$2 where tier_policy_band_id=$1',[low,peak]);
  await db.query('update tier_policy_bands set tier_definition_id=$2,sublevel=1 where tier_policy_band_id=$1',[high,core]);
  await rejects("update tier_policy_versions set status='active' where tier_policy_version_id=$1",[policy],'23514');
  await db.query('update tier_policy_bands set sublevel=2 where tier_policy_band_id=$1',[high]);
  await db.query('update tier_policy_bands set tier_definition_id=$2 where tier_policy_band_id=$1',[low,core]);
  await db.query('update tier_policy_bands set tier_definition_id=$2,sublevel=1 where tier_policy_band_id=$1',[high,peak]);
  await db.query('update tier_definitions set display_order=case when tier_definition_id=$1 then 1 else 5 end where tier_definition_id in ($1,$2)',[core,peak]);
  await db.query("update tier_policy_versions set status='active' where tier_policy_version_id=$1",[policy]);
  check(await scalar('select published_at is not null from tier_policy_versions where tier_policy_version_id=$1',[policy]),true,'publication timestamp');
  await rejects('update tier_policy_bands set score_to=49 where tier_policy_band_id=$1',[low],'23514');
  await rejects('delete from tier_policy_bands where tier_policy_band_id=$1',[low],'23514');
  await rejects("update tier_policy_versions set diet_max_score=35 where tier_policy_version_id=$1",[policy],'23514');
  await rejects("update tier_definitions set display_order=8 where tier_definition_id=$1",[core],'23514');
  await rejects("update tier_policy_versions set status='draft' where tier_policy_version_id=$1",[policy],'23514');
  await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,other,missing]);
  await db.query("insert into profiles(user_id,name) values($1,''),($2,'')",[owner,other]);
  const ownAssessment = await scalar("insert into health_assessments(user_id,overall_score,overall_status) values($1,80,'normal') returning health_assessment_id",[owner]);
  const otherAssessment = await scalar("insert into health_assessments(user_id,overall_score,overall_status) values($1,80,'normal') returning health_assessment_id",[other]);
  const award = `insert into user_tier_evaluations(user_id,tier_policy_version_id,tier_policy_band_id,source_key,diet_score,exercise_score,health_score,health_assessment_id)
    values($1,$2,$3,$4,$5,$6,$7,$8) returning user_tier_evaluation_id`;
  const args = [owner,policy,high,'first',20,25,35,ownAssessment];
  await rejects(award,[...args.slice(0,7),otherAssessment],'23503');
  await rejects(award,[missing,...args.slice(1)],'23503');
  await rejects(award,['10000000-0000-0000-0000-000000000099',...args.slice(1)],'23503');
  await rejects(award,[owner,policy,low,'wrong-band',20,25,35,null],'23514');
  await rejects(award,[owner,policy,high,'over-cap',31,20,20,null],'23514');
  await rejects(award,[owner,policy,low,'negative',-1,20,20,null],'23514');
  await rejects(award,[owner,policy,high,'nan','NaN',20,20,null],'23514');
  await db.exec('set role service_role');
  const evaluation = await scalar(award,args);
  check(await scalar('select total_score::text from user_tier_evaluations where user_tier_evaluation_id=$1',[evaluation]),'80.00','generated sum');
  await rejects(award,args,'23505');
  await scalar(award,[owner,policy,high,'maximum',30,30,40,null]);
  checks++;
  await scalar(award,[owner,policy,high,'boundary',20,20,10,null]);
  checks++;
  await rejects(award,[owner,policy,low,'wrong-boundary',20,20,10,null],'23514');
  await rejects('update user_tier_evaluations set diet_score=10 where user_tier_evaluation_id=$1',[evaluation],'42501');
  await rejects('delete from user_tier_evaluations where user_tier_evaluation_id=$1',[evaluation],'42501');
  await rejects("update tier_policy_versions set name='client change' where tier_policy_version_id=$1",[policy],'42501');
  for (const role of ['anon','authenticated']) {
    await db.exec(`reset role; set role ${role}`);
    for (const table of ['tier_definitions','tier_policy_versions','tier_policy_bands','user_tier_evaluations']) {
      await rejects(`select * from ${table}`,[],'42501');
    }
    await rejects(award,args,'42501');
  }
  await db.exec('reset role');
  await rejects('update user_tier_evaluations set diet_score=10 where user_tier_evaluation_id=$1',[evaluation],'23514');
  await rejects('delete from health_assessments where health_assessment_id=$1',[ownAssessment],'23503');
  await rejects('truncate tier_policy_versions',[],'0A000');
  await db.query('insert into autofit_integrity.account_deletions(user_id) values($1)',[owner]);
  await rejects(award,[owner,policy,high,'during-deletion',20,25,35,null],'23514');
  await db.query('delete from auth.users where id=$1',[owner]);
  check(await scalar('select count(*)::int from user_tier_evaluations where user_id=$1',[owner]),0,'account deletion removes tier history');
  check(await scalar('select count(*)::int from tier_definitions'),5,'catalog survives account deletion');
  check(await scalar('select count(*)::int from auth.users where id=$1',[other]),1,'other owner survives');
  const nextPolicy = await scalar("insert into tier_policy_versions(version,name,scoring_rules) values(2,'next draft','{\"test_only\":true}') returning tier_policy_version_id");
  const revisedCore = await scalar("insert into tier_definitions(code,revision,display_name,description,display_order) values('CORE',2,'CORE revised','new wording',1) returning tier_definition_id");
  check(await scalar('select display_name from tier_definitions where tier_definition_id=$1',[core]),'CORE','old definition preserved');
  await scalar(addBand,[nextPolicy,revisedCore,1,0,10]);
  await scalar(addBand,[nextPolicy,balance,1,10,20]);
  await scalar(addBand,[nextPolicy,active,1,20,30]);
  await scalar(addBand,[nextPolicy,fit,1,30,50]);
  const nextBand = await scalar(addBand,[nextPolicy,peak,1,50,100]);
  await rejects("update tier_policy_versions set status='active' where tier_policy_version_id=$1",[nextPolicy],'23505');
  await rejects(award,[other,nextPolicy,nextBand,'draft-award',20,25,35,null],'23514');
  await rejects(award,[other,policy,nextBand,'cross-version',20,25,35,null],'23503');
  await db.query("update tier_policy_versions set diet_max_score=20,exercise_max_score=40 where tier_policy_version_id=$1",[nextPolicy]);
  check(await scalar('select diet_max_score::text from tier_policy_versions where tier_policy_version_id=$1',[policy]),'30.00','draft changes preserve published policy');
  await db.exec('begin isolation level repeatable read');
  await rejects('update tier_policy_versions set name=name where tier_policy_version_id=$1',[nextPolicy],'0A000');
  await db.exec('rollback');
  await db.query("update tier_policy_versions set status='retired' where tier_policy_version_id=$1",[policy]);
  await rejects(award,[other,policy,high,'retired',20,25,35,otherAssessment],'23514');
  await rejects("update tier_policy_versions set status='active' where tier_policy_version_id=$1",[policy],'23514');
  await db.query("update tier_policy_versions set status='active' where tier_policy_version_id=$1",[nextPolicy]);
  check(await scalar("select count(*)::int from tier_policy_versions where status='active'"),1,'one active policy after version change');
  console.log(`PASS: ${checks} tier schema and access checks`);
} catch (error) {
  console.error({ message: error.message, code: error.code, query: error.query, cause: error.actual?.message });
  process.exitCode = 1;
} finally { await db.close(); }
