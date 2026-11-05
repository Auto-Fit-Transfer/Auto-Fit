// Isolated PostgreSQL tests. Never contacts Supabase or deletes real data.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const base = readFileSync(new URL('../../supabase/migrations/20260901055003_remote_schema.sql', import.meta.url), 'utf8');
  for (const table of ['chats', 'chat_messages']) {
    const start = base.indexOf(`CREATE TABLE "public"."${table}" (`);
    await db.exec(base.slice(start, base.indexOf('\n);', start) + 3));
  }
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260908012312_chat_message_storage.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../sql/chat_retention_30_days.sql', import.meta.url), 'utf8'));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => db.query('select autofit_maintenance.purge_expired_chat_messages()'), /permission denied/); checks++;
    await db.exec('reset role');
  }
  await db.exec('begin');
  for (let n=1; n<=4; n++) await db.query('insert into chats(chat_id,user_id,title,status) values($1,$2,$3,$4)', [uid(n),uid(10), n===1?'expired question':'custom title',n===3?'archived':'active']);
  const msg = async (n, room, request, sender, age, content='expired question') => db.query(
    "insert into chat_messages(message_id,chat_id,user_id,client_message_id,sender_type,content,created_at) values($1,$2,$3,$4,$5,$6,transaction_timestamp()-$7::interval)",
    [uid(n),uid(room),uid(10),request===null?null:uid(request),sender,content,age]);
  await msg(100,1,200,'user','721 hours');
  await msg(101,1,200,'assistant','721 hours');
  await msg(102,1,201,'user','1 hour','recent');
  await msg(103,1,201,'assistant','1 hour','recent answer');
  await msg(104,2,202,'user','720 hours');
  await msg(105,2,202,'assistant','720 hours -1 microsecond');
  await msg(106,3,null,'user','800 hours');
  await msg(107,999,null,'user','800 hours');
  await msg(108,4,null,'user','720 hours');
  await db.exec('create table unrelated_test_data(id int); insert into unrelated_test_data values(1)');
  const purge = async () => (await db.query('select autofit_maintenance.purge_expired_chat_messages() as result')).rows[0].result;
  eq(await purge(),{skipped:false,deleted_messages:5,cleared_titles:1});
  eq((await db.query('select message_id from chat_messages order by message_id')).rows.map(r=>r.message_id),[102,103,104,105].map(uid));
  eq((await db.query('select title from chats where chat_id=$1',[uid(1)])).rows[0].title,null);
  eq((await db.query('select title from chats where chat_id=$1',[uid(3)])).rows[0].title,'custom title');
  eq((await db.query('select count(*)::int as n from chats')).rows[0].n,4);
  eq((await db.query('select count(*)::int as n from unrelated_test_data')).rows[0].n,1);
  eq(await purge(),{skipped:false,deleted_messages:0,cleared_titles:0});
  await db.query("update chat_messages set created_at=transaction_timestamp()-interval '721 hours' where client_message_id=$1",[uid(202)]);
  eq((await purge()).deleted_messages,2);
  eq((await db.query("select count(*)::int as n from pg_constraint where contype='f' and conrelid in ('chats'::regclass,'chat_messages'::regclass)")).rows[0].n,0);
  await db.exec('rollback');
  console.log(`${checks} retention checks passed (isolated PGlite; cron scheduling/concurrency not tested).`);
} finally { await db.close(); }
