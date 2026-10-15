// Run: node community_social_sql.mjs <@electric-sql/pglite path> <folder with the 20260917 integrity SQL>
// Stage 2 (follows, profiles, timelines, notifications) in an isolated in-memory PostgreSQL
// with every migration. Never the remote project. Single connection: lock order is reviewed,
// not exercised here.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

import { createUsers, loadAutofitSchema } from './support/autofit_schema.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const C = '00000000-0000-4000-8000-0000000000c3';
const NO_NICK = '00000000-0000-4000-8000-0000000000d4';
const GHOST = '00000000-0000-4000-8000-0000000000e5';

const rpc = async (name, ...args) => {
  const marks = args.map((_, i) => `$${i + 1}`).join(',');
  return (await db.query(`select public.${name}(${marks}) as r`, args)).rows[0].r;
};
const rejected = async (operation, message) => {
  await assert.rejects(operation, new RegExp(message)); checks++;
};
const post = (user, content) => rpc('community_create_post', user, content, []);
const follow = (user, target, on = true) => rpc('community_set_follow', user, target, on);
const timeline = (viewer, scope, user = null, before = null, limit = 51) => rpc('community_timeline',
  viewer, scope, user, before?.feed_created_at ?? null, before?.feed_item_id ?? null, limit);
const followList = (viewer, user, kind, before = null, limit = 51) => rpc('community_follow_list',
  viewer, user, kind, before?.followed_at ?? null, before?.user_id ?? null, limit);
const inbox = (user, before = null, limit = 51) => rpc('community_notification_list',
  user, before?.created_at ?? null, before?.notification_id ?? null, limit);
const unread = async (user) => (await rpc('community_unread_notification_count', user)).unread_count;
const ids = (items, key = 'feed_item_id') => items.map((i) => i[key]);
const kinds = (items) => items.map((i) => `${i.type}:${i.actor.nickname}`);

try {
  await loadAutofitSchema(db, process.argv[3]);
  await createUsers(db, [
    { id: A, name: '실명A', nickname: '운동왕' }, { id: B, name: '실명B', nickname: '식단러' },
    { id: C, name: '실명C', nickname: '새싹' }, { id: NO_NICK, name: '실명D' },
  ]);

  await db.exec('set role anon');
  await rejected(() => rpc('community_profile', A, B), 'permission denied');
  await rejected(() => db.query('select * from public.community_notifications'), 'permission denied');
  await db.exec('set role service_role');
  await rejected(() => db.query('select public.community_notify()'), 'permission denied');

  // Follow rules: no self, nickname first, target must exist, idempotent, count returned.
  await rejected(() => follow(A, A), 'COMMUNITY_SELF_TARGET');
  await rejected(() => follow(NO_NICK, A), 'COMMUNITY_NICKNAME_REQUIRED');
  await rejected(() => follow(A, GHOST), 'COMMUNITY_USER_NOT_FOUND');
  assert.deepEqual(await follow(A, B), { user_id: B, following: true, follower_count: 1 });
  assert.deepEqual(await follow(A, B), { user_id: B, following: true, follower_count: 1 });
  await follow(C, B); await follow(B, A); checks++;

  // Profile: public identity only, counts and relationship flags.
  const pa1 = await post(A, 'A 첫 글');
  const pb1 = await post(B, 'B 첫 글');
  const pc1 = await post(C, 'C 첫 글');
  assert.deepEqual(await rpc('community_profile', A, B), {
    user_id: B, nickname: '식단러', profile_image_url: null, post_count: 1,
    follower_count: 2, following_count: 1, is_me: false, followed_by_me: true, follows_me: true });
  const me = await rpc('community_profile', A, A);
  assert.equal(me.is_me, true);
  assert.equal(me.following_count, 1);
  assert.ok(!JSON.stringify(me).includes('실명')); checks++;
  await rejected(() => rpc('community_profile', A, GHOST), 'COMMUNITY_USER_NOT_FOUND');

  // Timelines: following = followed users + me; user = one user's posts and reposts.
  await rpc('community_set_repost', B, pc1.post_id, true);
  const times = [[pa1, 9], [pb1, 8], [pc1, 7]];
  for (const [item, ago] of times) {
    await db.query(`update public.community_posts set created_at = now() - ($2::int * interval '1 second')
      where post_id = $1`, [item.post_id, ago]);
  }
  const repostOfC = (await db.query(`select post_id from public.community_posts
    where user_id = $1 and repost_of_post_id = $2`, [B, pc1.post_id])).rows[0].post_id;
  const all = await timeline(A, 'all');
  assert.deepEqual(ids(all), [repostOfC, pc1.post_id, pb1.post_id, pa1.post_id]);
  assert.deepEqual(ids(await timeline(A, 'following')), [repostOfC, pb1.post_id, pa1.post_id]);
  const bPage = await timeline(A, 'user', B);
  assert.deepEqual(ids(bPage), [repostOfC, pb1.post_id]);
  assert.equal(bPage[0].reposted_by.user_id, B);
  assert.deepEqual(ids(await timeline(C, 'following')), [repostOfC, pc1.post_id, pb1.post_id]);
  const first = await timeline(A, 'all', null, null, 2);
  const second = await timeline(A, 'all', null, first[1], 2);
  assert.deepEqual([...ids(first), ...ids(second)], ids(all)); checks++;
  await rejected(() => timeline(A, 'user'), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => timeline(A, 'all', B), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => timeline(A, 'friends'), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => timeline(A, 'user', GHOST), 'COMMUNITY_USER_NOT_FOUND');

  // Follower / following lists, newest first, with keyset pagination.
  await db.query(`update public.community_follows set created_at = now() - interval '1 minute'
    where follower_user_id = $1`, [A]);
  const followers = await followList(C, B, 'followers');
  assert.deepEqual(ids(followers, 'user_id'), [C, A]);
  assert.deepEqual(followers.map((f) => [f.is_me, f.followed_by_me]), [[true, false], [false, false]]);
  const firstFollower = await followList(C, B, 'followers', null, 1);
  assert.deepEqual(ids(await followList(C, B, 'followers', firstFollower[0]), 'user_id'), [A]);
  assert.deepEqual(ids(await followList(A, A, 'following'), 'user_id'), [B]);
  assert.equal((await followList(A, B, 'following'))[0].followed_by_me, false); checks++;
  await rejected(() => followList(A, B, 'fans'), 'COMMUNITY_INVALID_INPUT');

  // Notifications: follow, like, comment, repost; never for your own actions.
  const bInbox = await inbox(B);
  assert.deepEqual(kinds(bInbox).sort(), ['follow:새싹', 'follow:운동왕']);
  assert.deepEqual(kinds(await inbox(C)), ['repost:식단러']);
  await rpc('community_set_like', C, pa1.post_id, true);
  await rpc('community_set_like', A, pa1.post_id, true);
  const comment = await rpc('community_add_comment', C, pa1.post_id, '좋은 글이에요');
  await rpc('community_add_comment', A, pa1.post_id, '감사합니다');
  const aInbox = await inbox(A);
  assert.deepEqual(kinds(aInbox).sort(), ['comment:새싹', 'follow:식단러', 'like:새싹']);
  const commentNote = aInbox.find((n) => n.type === 'comment');
  assert.equal(commentNote.comment_id, comment.comment_id);
  assert.equal(commentNote.comment_preview, '좋은 글이에요');
  assert.equal(commentNote.post_preview, 'A 첫 글');
  assert.equal(await unread(A), 3); checks++;

  // Undo removes the notification; redo is not duplicated.
  await rpc('community_set_like', C, pa1.post_id, false);
  await rpc('community_set_like', C, pa1.post_id, true);
  await rpc('community_set_like', C, pa1.post_id, true);
  assert.equal((await inbox(A)).filter((n) => n.type === 'like').length, 1);
  await follow(C, B, false);
  assert.deepEqual(kinds(await inbox(B)), ['follow:운동왕']);
  await rpc('community_set_repost', B, pc1.post_id, false);
  assert.deepEqual(await inbox(C), []);
  await rpc('community_delete_comment', A, comment.comment_id);
  assert.equal((await inbox(A)).some((n) => n.type === 'comment'), false); checks++;

  // Read state and paging.
  const page1 = await inbox(A, null, 1);
  assert.equal(page1.length, 1);
  assert.equal((await inbox(A, page1[0])).length, 1);
  assert.deepEqual(await rpc('community_read_notifications', A), { unread_count: 0 });
  assert.equal(await unread(A), 0);
  assert.ok((await inbox(A)).every((n) => n.is_read));
  await rpc('community_add_comment', C, pa1.post_id, '하나 더');
  assert.equal(await unread(A), 1); checks++;

  // Reporting a comment hides its notification for the reporter.
  const reported = await rpc('community_add_comment', B, pa1.post_id, '광고');
  assert.equal(await unread(A), 2);
  await rpc('community_report', A, 'comment', reported.comment_id, 'spam', null);
  assert.equal(await unread(A), 1);
  assert.equal((await inbox(A)).some((n) => n.comment_id === reported.comment_id), false); checks++;

  // Deleting a post drops every notification about it.
  const pa2 = await post(A, 'A 두번째');
  await rpc('community_set_like', B, pa2.post_id, true);
  await rpc('community_set_repost', B, pa2.post_id, true);
  assert.equal((await inbox(A)).filter((n) => n.post_id === pa2.post_id).length, 2);
  await rpc('community_delete_post', A, pa2.post_id);
  assert.equal((await inbox(A)).filter((n) => n.post_id === pa2.post_id).length, 0); checks++;

  // Blocking removes follows both ways, hides profiles/lists/notifications, and stops new follows.
  await follow(C, A);
  assert.equal((await rpc('community_profile', A, A)).follower_count, 2);
  await rpc('community_set_block', A, C, true);
  assert.equal(await count('select count(*)::int as n from public.community_follows where $1 in (follower_user_id, following_user_id) and $2 in (follower_user_id, following_user_id)', [A, C]), 0);
  await rejected(() => rpc('community_profile', A, C), 'COMMUNITY_USER_NOT_FOUND');
  await rejected(() => rpc('community_profile', C, A), 'COMMUNITY_USER_NOT_FOUND');
  await rejected(() => follow(C, A), 'COMMUNITY_USER_NOT_FOUND');
  await rejected(() => timeline(C, 'user', A), 'COMMUNITY_USER_NOT_FOUND');
  assert.equal((await inbox(A)).some((n) => n.actor.user_id === C), false);
  assert.equal((await followList(B, B, 'followers')).length, 1);
  await rpc('community_set_block', A, C, false);
  await follow(C, A); checks++;

  // Account deletion (applied cascade) removes follows and notifications in both directions.
  await follow(A, C);
  await db.exec('reset role');
  await db.query('delete from auth.users where id = $1', [C]);
  await db.exec('set role service_role');
  assert.equal(await count(`select count(*)::int as n from public.community_follows
    where $1 in (follower_user_id, following_user_id)`, [C]), 0);
  assert.equal(await count(`select count(*)::int as n from public.community_notifications
    where $1 in (user_id, actor_user_id)`, [C]), 0);
  assert.deepEqual(await rpc('community_profile', A, A).then((p) => [p.follower_count, p.following_count]), [1, 1]);
  checks++;

  console.log(`${checks} community stage-2 PostgreSQL checks passed (PGlite; not a multi-connection concurrency test).`);
} finally {
  await db.close();
}

async function count(sql, params = []) {
  return (await db.query(sql, params)).rows[0].n;
}
