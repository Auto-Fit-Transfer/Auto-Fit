// Run with a path to an installed @electric-sql/pglite package (test-only).
// Uses an isolated in-memory PostgreSQL instance, never the remote project.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
const base = readFileSync(new URL('../../supabase/migrations/20260901055003_remote_schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260908012312_chat_message_storage.sql', import.meta.url), 'utf8');
let checks = 0;
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const table of ['chats', 'chat_messages']) {
    const start = base.indexOf(`CREATE TABLE "public"."${table}" (`);
    const end = base.indexOf('\n);', start) + 3;
    await db.exec(base.slice(start, end));
    await db.exec(`alter table public.${table} enable row level security; grant select,insert,update,delete on public.${table} to service_role;`);
  }
  await db.exec(migration);
  const owner = '00000000-0000-0000-0000-000000000001';
  const victim = '00000000-0000-0000-0000-000000000002';
  const chat = '00000000-0000-0000-0000-000000000003';
  const otherChat = '00000000-0000-0000-0000-000000000004';
  const request = '00000000-0000-0000-0000-000000000005';
  await db.query('insert into chats(chat_id,user_id) values($1,$2),($3,$2)', [chat, owner, otherChat]);
  const answer = { content: '최근 점수는 86점입니다.', intent: 'health_score_latest', response_source: 'database', needs_more_data: false, evidence: [], required_data: [] };
  const call = async (user, room, id, content, result) => (await db.query(
    'select public.save_chat_exchange($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb) as result',
    [user, room, id, content, result === null ? null : JSON.stringify(result)]
  )).rows[0].result;
  const rejected = async (operation, message) => {
    await assert.rejects(operation, new RegExp(message)); checks++;
  };
  await db.exec('set role anon');
  await rejected(() => call(owner,chat,request,'질문',answer), 'permission denied');
  await db.exec('set role service_role');
  assert.equal(await call(owner,chat,request,'질문',null), null); checks++;
  await rejected(() => call(victim,chat,request,'질문',answer), 'CHAT_NOT_FOUND');
  const first = await call(owner,chat,request,'질문',answer);
  assert.equal(first.is_replay,false);
  assert.equal(first.chat.title,'질문');
  assert.ok(first.user_message.created_at < first.assistant_message.created_at); checks++;
  const replay = await call(owner,chat,request,'질문',null);
  assert.equal(replay.is_replay,true);
  assert.deepEqual(replay.assistant_message, first.assistant_message); checks++;
  await rejected(() => call(owner,chat,request,'변경 질문',answer), 'IDEMPOTENCY_CONFLICT');
  await rejected(() => call(owner,otherChat,request,'질문',answer), 'IDEMPOTENCY_CONFLICT');
  assert.equal((await db.query('select count(*)::int as n from chat_messages')).rows[0].n,2); checks++;
  await db.query("update chats set status='archived' where chat_id=$1",[chat]);
  assert.equal((await call(owner,chat,request,'질문',null)).is_replay,true); checks++;
  await rejected(() => call(owner,chat,otherChat,'새 질문',answer), 'CHAT_ARCHIVED');
  await rejected(() => call(owner,otherChat,otherChat,'질문',{...answer,evidence:{}}), 'CHAT_INVALID_INPUT');
  // Force the second insert to fail: verify the first insert rolls back too.
  await db.exec("reset role; create function public.reject_test_answer() returns trigger language plpgsql as $$ begin if new.sender_type='assistant' then raise exception 'TEST_FAILURE'; end if; return new; end $$; create trigger reject_test_answer before insert on chat_messages for each row execute function public.reject_test_answer(); set role service_role;");
  await rejected(() => call(owner,otherChat,otherChat,'질문',answer), 'TEST_FAILURE');
  assert.equal((await db.query('select count(*)::int as n from chat_messages')).rows[0].n,2); checks++;
  console.log(`${checks} PostgreSQL storage checks passed (PGlite; not a multi-connection concurrency test).`);
} finally {
  await db.close();
}
