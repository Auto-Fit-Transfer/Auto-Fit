// Run: node community_messages_sql.mjs <@electric-sql/pglite path> <folder with the 20260917 integrity SQL>
// 1:1 messages in an isolated in-memory PostgreSQL with every migration. Never the remote
// project. Single connection: lock order is reviewed, not exercised here.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

import { createUsers, loadAutofitSchema } from './support/autofit_schema.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;

const A = '00000000-0000-4000-8000-0000000007a1';
const B = '00000000-0000-4000-8000-0000000007b2';
const C = '00000000-0000-4000-8000-0000000007c3';

const rpc = async (name, ...args) => {
  const marks = args.map((_, i) => `$${i + 1}`).join(',');
  return (await db.query(`select public.${name}(${marks}) as r`, args)).rows[0].r;
};
const rejected = async (operation, message) => {
  await assert.rejects(operation, new RegExp(message)); checks++;
};
const asSuperuser = async (task) => {
  await db.exec('reset role');
  try { return await task(); } finally { await db.exec('set role service_role'); }
};
const count = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const follow = (user, target, on = true) => rpc('community_set_follow', user, target, on);
const open = (user, target) => rpc('community_open_conversation', user, target);
const send = (user, conversation, text) => rpc('community_send_message', user, conversation, text);
const messages = (user, conversation, before = null, limit = 51) => rpc('community_message_list',
  user, conversation, before?.created_at ?? null, before?.message_id ?? null, limit);
const inbox = (user) => rpc('community_conversation_list', user, null, null, 51);
const unread = async (user) => (await rpc('community_unread_message_count', user)).unread_count;

try {
  await loadAutofitSchema(db, process.argv[3]);
  await createUsers(db, [
    { id: A, name: '실명A', nickname: '대화A' }, { id: B, name: '실명B', nickname: '대화B' },
    { id: C, name: '실명C', nickname: '구경C' },
  ]);
  await db.exec('set role anon');
  await rejected(() => open(A, B), 'permission denied');
  await rejected(() => db.query('select * from public.community_messages'), 'permission denied');
  await db.exec('set role service_role');

  // Starting needs both users to follow each other; the conversation is shared and unique.
  await rejected(() => open(A, A), 'COMMUNITY_SELF_TARGET');
  await rejected(() => open(A, B), 'COMMUNITY_DM_NOT_ALLOWED');
  await follow(A, B);
  await rejected(() => open(A, B), 'COMMUNITY_DM_NOT_ALLOWED');
  await follow(B, A);
  const started = await open(A, B);
  assert.deepEqual([started.other.nickname, started.last_message, started.unread_count, started.can_send],
    ['대화B', null, 0, true]);
  assert.equal((await open(B, A)).conversation_id, started.conversation_id);
  const id = started.conversation_id;
  assert.deepEqual(await inbox(A), []); checks++;

  // Messages, unread counts and read marks.
  await rejected(() => send(A, id, '   '), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => send(A, id, 'x'.repeat(1001)), 'COMMUNITY_INVALID_INPUT');
  const hello = await send(A, id, '  안녕하세요  ');
  assert.deepEqual([hello.content, hello.is_mine], ['안녕하세요', true]);
  assert.equal(await unread(B), 1);
  assert.equal(await unread(A), 0);
  const bInbox = await inbox(B);
  assert.deepEqual([bInbox.length, bInbox[0].unread_count, bInbox[0].last_message.content, bInbox[0].last_message.is_mine],
    [1, 1, '안녕하세요', false]);
  assert.ok(!JSON.stringify(bInbox).includes('실명'));
  assert.deepEqual(await rpc('community_read_conversation', B, id), { conversation_id: id, unread_count: 0 });
  assert.equal(await unread(B), 0);
  await send(B, id, '반가워요');
  assert.equal(await unread(A), 1); checks++;

  // Newest first with keyset paging; outsiders cannot read or write.
  for (const text of ['하나', '둘', '셋']) await send(A, id, text);
  const page = await messages(B, id, null, 2);
  assert.deepEqual(page.map((m) => m.content), ['셋', '둘']);
  assert.deepEqual((await messages(B, id, page[1])).map((m) => m.content), ['하나', '반가워요', '안녕하세요']);
  assert.deepEqual((await messages(A, id, null, 1))[0].is_mine, true);
  await rejected(() => messages(C, id), 'COMMUNITY_CONVERSATION_NOT_FOUND');
  await rejected(() => send(C, id, '끼어들기'), 'COMMUNITY_CONVERSATION_NOT_FOUND');
  await rejected(() => open(C, A), 'COMMUNITY_DM_NOT_ALLOWED'); checks++;

  // Senders delete their own messages only.
  await rejected(() => rpc('community_delete_message', B, hello.message_id), 'COMMUNITY_MESSAGE_NOT_FOUND');
  await rpc('community_delete_message', A, hello.message_id);
  assert.equal((await messages(B, id)).some((m) => m.message_id === hello.message_id), false); checks++;

  // Rate limit: 60 messages per 10 minutes per sender.
  await asSuperuser(() => db.query(`insert into public.community_messages(conversation_id, user_id, content)
    select $1, $2, 'bulk ' || g from generate_series(1, 57) g`, [id, A])); // 3 kept + 57 = 60
  await rejected(() => send(A, id, '61번째'), 'COMMUNITY_RATE_LIMITED');
  await send(B, id, 'B는 괜찮아요'); checks++;

  // Unfollowing later keeps the conversation; blocking hides it and stops messages both ways.
  await follow(A, B, false);
  await send(B, id, '언팔로우 후에도');
  await rpc('community_set_block', A, B, true);
  await rejected(() => send(B, id, '차단 후'), 'COMMUNITY_CONVERSATION_NOT_FOUND');
  await rejected(() => messages(A, id), 'COMMUNITY_CONVERSATION_NOT_FOUND');
  assert.deepEqual([await inbox(A), await inbox(B), await unread(A)], [[], [], 0]);
  await rpc('community_set_block', A, B, false);
  assert.equal((await inbox(A))[0].can_send, true); checks++;

  // Account deletion removes the whole conversation for both sides.
  await asSuperuser(() => db.query('delete from auth.users where id = $1', [B]));
  assert.deepEqual(await inbox(A), []);
  assert.equal(await count(`select ((select count(*) from public.community_conversations)
    + (select count(*) from public.community_messages)
    + (select count(*) from public.community_conversation_reads))::int as n`), 0); checks++;

  console.log(`${checks} message PostgreSQL checks passed (PGlite; not a multi-connection concurrency test).`);
} finally {
  await db.close();
}
