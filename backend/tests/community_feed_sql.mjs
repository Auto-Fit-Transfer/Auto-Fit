// Run: node community_feed_sql.mjs <@electric-sql/pglite path> <folder with the 20260917 integrity SQL>
// Uses an isolated in-memory PostgreSQL with every migration, never the remote project.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

import { createUsers, loadAutofitSchema } from './support/autofit_schema.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const NO_NICK = '00000000-0000-4000-8000-00000000000d';

const rpc = async (name, ...args) => {
  const marks = args.map((_, i) => `$${i + 1}`).join(',');
  return (await db.query(`select public.${name}(${marks}) as r`, args)).rows[0].r;
};
const rejected = async (operation, message) => {
  await assert.rejects(operation, new RegExp(message)); checks++;
};
const feed = async (viewer, before = null, limit = 51) =>
  rpc('community_feed', viewer, before?.feed_created_at ?? null, before?.feed_item_id ?? null, limit);
const upload = async (user, name) =>
  (await rpc('community_register_upload', user, `${user}/${name}.jpg`, 1200, 900)).upload_id;
const post = (user, content, uploads = []) => rpc('community_create_post', user, content, uploads);
const count = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;

try {
  await loadAutofitSchema(db, process.argv[3]);
  await createUsers(db, [
    { id: A, name: '실명A', nickname: '운동왕' }, { id: B, name: '실명B', nickname: '식단러' },
    { id: C, name: '실명C', nickname: '새싹' }, { id: NO_NICK, name: '실명D' },
  ]);
  assert.equal((await db.query("select public from storage.buckets where id='community-photos'")).rows[0].public, false); checks++;

  await db.exec('set role anon');
  await rejected(() => feed(A), 'permission denied');
  await rejected(() => db.query('select * from public.community_posts'), 'permission denied');
  await db.exec('set role service_role');

  // Posting rules: nickname, body, photo ownership and order.
  await rejected(() => post(NO_NICK, '안녕하세요'), 'COMMUNITY_NICKNAME_REQUIRED');
  await rejected(() => post(A, '   '), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => post(A, 'x'.repeat(501)), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => rpc('community_register_upload', A, `${B}/stolen.jpg`, 10, 10), 'COMMUNITY_INVALID_INPUT');
  const [u1, u2] = [await upload(A, 'one'), await upload(A, 'two')];
  await rejected(() => post(A, null, [u1, u1]), 'COMMUNITY_INVALID_INPUT');
  const bUpload = await upload(B, 'b-photo');
  await rejected(() => post(A, '남의 사진', [bUpload]), 'COMMUNITY_UPLOAD_INVALID');
  const sixth = [u1, u2, await upload(A, '3'), await upload(A, '4'), await upload(A, '5'), await upload(A, '6')];
  await rejected(() => post(A, '여섯 장', sixth), 'COMMUNITY_INVALID_INPUT');
  const photoPost = await post(A, '  오늘 오운완!  ', [u2, u1]);
  assert.equal(photoPost.content, '오늘 오운완!');
  assert.deepEqual(photoPost.images.map((i) => i.path), [`${A}/two.jpg`, `${A}/one.jpg`]);
  assert.deepEqual(photoPost.author, { user_id: A, nickname: '운동왕', profile_image_url: null });
  assert.equal(photoPost.is_mine, true);
  assert.equal(photoPost.reposted_by, null); checks++;
  await rejected(() => post(A, '재사용', [u1]), 'COMMUNITY_UPLOAD_INVALID');
  const photoOnly = await post(A, null, sixth.slice(2, 5));
  assert.equal(photoOnly.content, null);
  assert.equal(photoOnly.images.length, 3); checks++;
  const bPost = await post(B, '샐러드 인증');
  const cPost = await post(C, '첫 글입니다');

  // Feed: newest first, keyset pagination, real name never exposed.
  let page = await feed(A);
  assert.deepEqual(page.map((i) => i.post_id), [cPost.post_id, bPost.post_id, photoOnly.post_id, photoPost.post_id]);
  assert.ok(!JSON.stringify(page).includes('실명')); checks++;
  const first = await feed(A, null, 2);
  const second = await feed(A, first[1], 2);
  assert.deepEqual([...first, ...second].map((i) => i.post_id), page.map((i) => i.post_id)); checks++;

  // Likes are idempotent and counted once.
  assert.equal((await rpc('community_set_like', B, photoPost.post_id, true)).like_count, 1);
  assert.equal((await rpc('community_set_like', B, photoPost.post_id, true)).like_count, 1);
  assert.equal((await rpc('community_set_like', C, photoPost.post_id, true)).like_count, 2);
  assert.equal((await rpc('community_get_post', B, photoPost.post_id)).liked_by_me, true);
  assert.equal((await rpc('community_set_like', C, photoPost.post_id, false)).like_count, 1);
  assert.equal((await rpc('community_set_like', C, photoPost.post_id, false)).like_count, 1); checks++;

  // Reposts point at the original; reposting a repost reposts the original.
  await rejected(() => rpc('community_set_repost', NO_NICK, bPost.post_id, true), 'COMMUNITY_NICKNAME_REQUIRED');
  assert.equal((await rpc('community_set_repost', A, bPost.post_id, true)).repost_count, 1);
  page = await feed(C);
  const repostItem = page[0];
  assert.equal(repostItem.post_id, bPost.post_id);
  assert.notEqual(repostItem.feed_item_id, bPost.post_id);
  assert.equal(repostItem.reposted_by.nickname, '운동왕');
  assert.equal(repostItem.author.nickname, '식단러'); checks++;
  assert.equal((await rpc('community_set_repost', C, repostItem.feed_item_id, true)).post_id, bPost.post_id);
  assert.equal((await rpc('community_get_post', A, bPost.post_id)).repost_count, 2);
  assert.equal((await rpc('community_get_post', C, repostItem.feed_item_id)).reposted_by_me, true);
  assert.equal((await rpc('community_set_repost', C, bPost.post_id, false)).repost_count, 1); checks++;
  await rejected(() => db.query(`insert into public.community_posts(user_id,content,repost_of_post_id)
    values ($1,'내용 있는 공유',$2)`, [C, bPost.post_id]), 'community_posts_body_check');

  // Comments: oldest first, paginated, post owner can moderate, strangers cannot.
  await rejected(() => rpc('community_add_comment', NO_NICK, photoPost.post_id, '댓글'), 'COMMUNITY_NICKNAME_REQUIRED');
  await rejected(() => rpc('community_add_comment', B, photoPost.post_id, 'x'.repeat(301)), 'COMMUNITY_INVALID_INPUT');
  const c1 = await rpc('community_add_comment', B, photoPost.post_id, '멋져요');
  const c2 = await rpc('community_add_comment', C, photoPost.post_id, '저도 해볼게요');
  const c3 = await rpc('community_add_comment', B, photoPost.post_id, '화이팅');
  assert.equal(c1.can_delete, true);
  assert.equal(c1.is_mine, true);
  const comments = await rpc('community_comments', A, photoPost.post_id, null, null, 51);
  assert.deepEqual(comments.map((c) => c.comment_id), [c1.comment_id, c2.comment_id, c3.comment_id]);
  assert.ok(comments.every((c) => c.can_delete && !c.is_mine));
  const later = await rpc('community_comments', C, photoPost.post_id, c1.created_at, c1.comment_id, 51);
  assert.deepEqual(later.map((c) => c.comment_id), [c2.comment_id, c3.comment_id]);
  assert.equal(later[0].can_delete, true);
  assert.equal(later[1].can_delete, false); checks++;
  assert.equal((await rpc('community_get_post', A, photoPost.post_id)).comment_count, 3);
  await rejected(() => rpc('community_delete_comment', C, c1.comment_id), 'COMMUNITY_COMMENT_NOT_FOUND');
  await rpc('community_delete_comment', A, c1.comment_id);
  await rpc('community_delete_comment', C, c2.comment_id);
  assert.equal((await rpc('community_get_post', A, photoPost.post_id)).comment_count, 1); checks++;

  // Reports hide the target only for the reporter and are idempotent.
  await rejected(() => rpc('community_report', A, 'post', photoPost.post_id, 'spam', null), 'COMMUNITY_SELF_TARGET');
  await rejected(() => rpc('community_report', C, 'post', bPost.post_id, 'weird', null), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => rpc('community_report', C, 'post', C, 'spam', null), 'COMMUNITY_TARGET_NOT_FOUND');
  await rpc('community_report', C, 'post', bPost.post_id, 'misinformation', '  근거 없는 주장  ');
  await rpc('community_report', C, 'post', bPost.post_id, 'misinformation', null);
  assert.equal(await count("select count(*)::int as n from public.community_reports"), 1);
  assert.equal((await db.query('select detail, content_snapshot from public.community_reports')).rows[0].detail, '근거 없는 주장');
  assert.ok(!(await feed(C)).some((i) => i.post_id === bPost.post_id));
  assert.ok((await feed(A)).some((i) => i.post_id === bPost.post_id));
  await rejected(() => rpc('community_get_post', C, bPost.post_id), 'COMMUNITY_POST_NOT_FOUND');
  await rpc('community_report', A, 'comment', c3.comment_id, 'abuse', null);
  assert.equal((await rpc('community_comments', A, photoPost.post_id, null, null, 51)).length, 0);
  assert.equal((await rpc('community_comments', C, photoPost.post_id, null, null, 51)).length, 1); checks++;

  // Blocking works in both directions for posts, reposts, comments and actions.
  await rejected(() => rpc('community_set_block', A, A, true), 'COMMUNITY_SELF_TARGET');
  await rejected(() => rpc('community_set_block', A, '00000000-0000-4000-8000-0000000000ff', true), 'COMMUNITY_USER_NOT_FOUND');
  await rpc('community_set_block', B, A, true);
  await rpc('community_set_block', B, A, true);
  assert.ok(!(await feed(B)).some((i) => i.author.user_id === A || i.reposted_by?.user_id === A));
  assert.ok(!(await feed(A)).some((i) => i.author.user_id === B));
  await rejected(() => rpc('community_set_like', B, photoPost.post_id, true), 'COMMUNITY_POST_NOT_FOUND');
  await rejected(() => rpc('community_add_comment', A, bPost.post_id, '안녕'), 'COMMUNITY_POST_NOT_FOUND');
  const blocked = await rpc('community_blocked_users', B);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].nickname, '운동왕');
  assert.ok(blocked[0].blocked_at);
  await rpc('community_set_block', B, A, false);
  assert.ok((await feed(B)).some((i) => i.author.user_id === A)); checks++;

  // Only the author deletes; dependents and claimed uploads go with the post.
  await rejected(() => rpc('community_delete_post', B, photoPost.post_id), 'COMMUNITY_POST_NOT_FOUND');
  await rpc('community_set_repost', C, photoPost.post_id, true);
  const removed = await rpc('community_delete_post', A, photoPost.post_id);
  assert.deepEqual(removed.image_paths, [`${A}/two.jpg`, `${A}/one.jpg`]);
  for (const table of ['community_post_likes', 'community_comments', 'community_uploads']) {
    assert.equal(await count(`select count(*)::int as n from public.${table} where post_id=$1`, [photoPost.post_id]), 0);
  }
  assert.equal(await count('select count(*)::int as n from public.community_posts where repost_of_post_id=$1', [photoPost.post_id]), 0);
  await rejected(() => rpc('community_get_post', B, photoPost.post_id), 'COMMUNITY_POST_NOT_FOUND'); checks++;

  // Abuse limits and stale upload cleanup.
  await db.query(`insert into public.community_posts(user_id,content)
    select $1, '연속 글 ' || g from generate_series(1, 29) g`, [C]);
  await rejected(() => post(C, '서른한 번째'), 'COMMUNITY_RATE_LIMITED');
  await db.query(`insert into public.community_uploads(user_id,storage_path,width,height)
    select $1::uuid, $2::text || '/bulk-' || g || '.jpg', 10, 10 from generate_series(1, 20) g`, [C, C]);
  await rejected(() => upload(C, 'too-many'), 'COMMUNITY_UPLOAD_LIMIT');
  await db.query(`update public.community_uploads set created_at = now() - interval '2 days'
    where user_id=$1 and storage_path like '%/bulk-1.jpg'`, [C]);
  assert.deepEqual(await rpc('community_claim_stale_uploads', C), [`${C}/bulk-1.jpg`]);
  assert.deepEqual(await rpc('community_claim_stale_uploads', C), []); checks++;

  // Account deletion through Auth (the applied cascade trigger) removes the user's community
  // data and fixes counters. The full deletion flow is in community_account_deletion_sql.mjs.
  const aPost = await post(A, '탈퇴 전 글');
  await rpc('community_set_like', B, aPost.post_id, true);
  await rpc('community_set_repost', B, aPost.post_id, true);
  await rpc('community_add_comment', B, aPost.post_id, '잘 봤어요');
  await rpc('community_set_like', A, bPost.post_id, true);
  await rpc('community_add_comment', A, bPost.post_id, '좋아요');
  await rpc('community_set_block', A, C, true);
  await db.exec('reset role');
  await db.query('delete from auth.users where id=$1', [A]);
  await db.exec('set role service_role');
  for (const [table, column] of [['community_posts', 'user_id'], ['community_post_likes', 'user_id'],
    ['community_comments', 'user_id'], ['community_uploads', 'user_id'], ['community_blocks', 'blocker_user_id']]) {
    assert.equal(await count(`select count(*)::int as n from public.${table} where ${column}=$1`, [A]), 0, table);
  }
  assert.equal(await count('select count(*)::int as n from public.community_posts where repost_of_post_id=$1', [aPost.post_id]), 0);
  assert.equal(await count('select count(*)::int as n from public.community_reports where target_user_id=$1', [A]), 0);
  const bAfter = await rpc('community_get_post', B, bPost.post_id);
  assert.equal(bAfter.like_count, 0);
  assert.equal(bAfter.repost_count, 0);
  assert.equal(bAfter.comment_count, 0); checks++;

  console.log(`${checks} community PostgreSQL checks passed (PGlite; not a multi-connection concurrency test).`);
} finally {
  await db.close();
}
