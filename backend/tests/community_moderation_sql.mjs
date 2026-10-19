// Run: node community_moderation_sql.mjs <@electric-sql/pglite path> <folder with the 20260917 integrity SQL>
// Report review and hiding in an isolated in-memory PostgreSQL with every migration. Never the
// remote project. Single connection: lock order is reviewed, not exercised here.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

import { createUsers, loadAutofitSchema } from './support/autofit_schema.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;

const M = '00000000-0000-4000-8000-0000000006a0'; // moderator
const A = '00000000-0000-4000-8000-0000000006a1'; // author
const B = '00000000-0000-4000-8000-0000000006b2';
const C = '00000000-0000-4000-8000-0000000006c3';
const D = '00000000-0000-4000-8000-0000000006d4';

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
const report = (user, type, id, reason, detail = null) => rpc('community_report', user, type, id, reason, detail);
const queue = (status = 'open') => rpc('community_report_queue', M, status, 100);
const moderate = (type, id, action, user = M) => rpc('community_moderate', user, type, id, action);
const timelineIds = async (viewer) =>
  (await rpc('community_timeline', viewer, 'all', null, null, null, 51)).map((i) => i.feed_item_id);

try {
  await loadAutofitSchema(db, process.argv[3]);
  await createUsers(db, [
    { id: M, name: '실명M', nickname: '운영자' }, { id: A, name: '실명A', nickname: '작성자' },
    { id: B, name: '실명B', nickname: '신고자B' }, { id: C, name: '실명C', nickname: '신고자C' },
    { id: D, name: '실명D', nickname: '구경꾼' },
  ]);
  await db.exec('set role anon');
  await rejected(() => rpc('community_report_queue', M, 'open', 10), 'permission denied');
  await db.exec('set role service_role');
  await rejected(() => db.query('insert into public.community_moderators(user_id) values ($1)', [B]), 'permission denied');
  await asSuperuser(() => db.query('insert into public.community_moderators(user_id, note) values ($1, $2)', [M, '테스트 운영자']));
  assert.deepEqual(await rpc('community_moderator_status', M), { is_moderator: true });
  assert.deepEqual(await rpc('community_moderator_status', B), { is_moderator: false });
  await rejected(() => rpc('community_report_queue', B, 'open', 10), 'COMMUNITY_FORBIDDEN');
  await rejected(() => moderate('post', A, 'hide', B), 'COMMUNITY_FORBIDDEN');

  const post = await rpc('community_create_post', A, '광고 글입니다', []);
  const comment = await rpc('community_add_comment', B, post.post_id, '욕설 댓글');
  await rpc('community_set_repost', D, post.post_id, true);
  await report(B, 'post', post.post_id, 'spam', '같은 글을 계속 올려요');
  await report(C, 'post', post.post_id, 'abuse');
  await report(C, 'comment', comment.comment_id, 'abuse');
  await report(B, 'user', A, 'spam');

  // Queue: one row per target with counts, reasons, details and the reported text; reporters
  // stay anonymous.
  const open = await queue();
  assert.equal(open.length, 3);
  const postItem = open.find((i) => i.target_type === 'post');
  assert.deepEqual([postItem.report_count, [...postItem.reasons].sort(), postItem.content_snapshot,
    postItem.target_user.nickname, postItem.exists, postItem.hidden, postItem.last_action],
  [2, ['abuse', 'spam'], '광고 글입니다', '작성자', true, false, null]);
  assert.deepEqual(postItem.details, [{ reason: 'spam', detail: '같은 글을 계속 올려요' }]);
  assert.ok(!JSON.stringify(open).includes(C) && !JSON.stringify(open).includes('실명'));
  assert.equal(open.find((i) => i.target_type === 'comment').post_id, post.post_id);
  assert.deepEqual(await queue('resolved'), []); checks++;

  // Hide: gone from detail, timelines (with its reposts), likes and comments, for everyone.
  await rejected(() => moderate('user', A, 'hide'), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => moderate('post', D, 'hide'), 'COMMUNITY_TARGET_NOT_FOUND');
  assert.ok((await timelineIds(D)).includes(post.post_id));
  await moderate('post', post.post_id, 'hide');
  for (const viewer of [A, D, M]) {
    await rejected(() => rpc('community_get_post', viewer, post.post_id), 'COMMUNITY_POST_NOT_FOUND');
    assert.equal((await timelineIds(viewer)).length, 0);
  }
  await rejected(() => rpc('community_set_like', D, post.post_id, true), 'COMMUNITY_POST_NOT_FOUND');
  await rejected(() => rpc('community_add_comment', D, post.post_id, '숨긴 글에 댓글'), 'COMMUNITY_POST_NOT_FOUND');
  const resolved = await queue('resolved');
  assert.deepEqual(resolved.map((i) => [i.target_type, i.last_action, i.hidden]), [['post', 'hide', true]]);
  assert.equal((await queue()).length, 2); checks++;

  // A new report reopens the target; unhide brings the post back.
  await report(D, 'post', post.post_id, 'other');
  assert.equal((await queue()).find((i) => i.target_type === 'post').report_count, 3);
  await moderate('post', post.post_id, 'unhide');
  assert.equal((await rpc('community_get_post', M, post.post_id)).post_id, post.post_id);
  assert.ok((await timelineIds(M)).includes(post.post_id)); checks++;

  // Comments hide the same way; dismiss only records the decision.
  await moderate('comment', comment.comment_id, 'hide');
  assert.deepEqual(await rpc('community_comments', M, post.post_id, null, null, 51), []);
  await moderate('user', A, 'dismiss');
  assert.deepEqual((await queue()).map((i) => i.target_type), []);
  assert.deepEqual((await queue('resolved')).map((i) => [i.target_type, i.last_action]).sort(),
    [['comment', 'hide'], ['post', 'unhide'], ['user', 'dismiss']]); checks++;

  // Club feeds hide too.
  await rpc('community_start_demo_membership', A);
  const club = await rpc('community_create_club', A, '검토 클럽', null, 'etc');
  const clubPost = await rpc('community_create_club_post', A, club.club_id, '클럽 글', []);
  await moderate('post', clubPost.post_id, 'hide');
  assert.deepEqual(await rpc('community_club_feed', M, club.club_id, null, null, 51), []); checks++;

  // Authors who are leaving: nothing to hide (their content goes with the account).
  await rpc('begin_account_deletion', A);
  await rejected(() => moderate('post', post.post_id, 'hide'), 'COMMUNITY_TARGET_NOT_FOUND');
  assert.equal((await moderate('post', post.post_id, 'dismiss')).action, 'dismiss');

  // Decisions and moderator rows belong to the moderator and are purged with that account.
  await asSuperuser(() => db.query('delete from auth.users where id = $1', [M]));
  assert.equal((await db.query(`select ((select count(*) from public.community_report_resolutions where user_id = $1)
    + (select count(*) from public.community_moderators where user_id = $1))::int as n`, [M])).rows[0].n, 0);
  checks++;

  console.log(`${checks} moderation PostgreSQL checks passed (PGlite; not a multi-connection concurrency test).`);
} finally {
  await db.close();
}
