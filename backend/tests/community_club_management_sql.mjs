// Run: node community_club_management_sql.mjs <@electric-sql/pglite path> <folder with the 20260917 integrity SQL>
// Club edit, delete, member list and removal in an isolated in-memory PostgreSQL with every
// migration. Never the remote project. Single connection: lock order is reviewed, not exercised.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

import { createUsers, loadAutofitSchema } from './support/autofit_schema.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;

const A = '00000000-0000-4000-8000-0000000005a1'; // owner
const B = '00000000-0000-4000-8000-0000000005b2';
const C = '00000000-0000-4000-8000-0000000005c3';

const rpc = async (name, ...args) => {
  const marks = args.map((_, i) => `$${i + 1}`).join(',');
  return (await db.query(`select public.${name}(${marks}) as r`, args)).rows[0].r;
};
const rejected = async (operation, message) => {
  await assert.rejects(operation, new RegExp(message)); checks++;
};
const count = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const members = (viewer, club, after = null, limit = 51) => rpc('community_club_member_list',
  viewer, club, after?.joined_at ?? null, after?.user_id ?? null, limit);
const update = (user, club, name, description = null, category = 'running') =>
  rpc('community_update_club', user, club, name, description, category);

try {
  await loadAutofitSchema(db, process.argv[3]);
  await createUsers(db, [
    { id: A, name: '실명A', nickname: '클럽장' }, { id: B, name: '실명B', nickname: '회원B' },
    { id: C, name: '실명C', nickname: '회원C' },
  ]);
  await db.exec('set role anon');
  await rejected(() => rpc('community_delete_club', A, A), 'permission denied');
  await db.exec('set role service_role');

  await rpc('community_start_demo_membership', A);
  const club = (await rpc('community_create_club', A, '아침 러닝', null, 'running')).club_id;
  const other = (await rpc('community_create_club', A, '저녁 요가', null, 'yoga')).club_id;
  for (const user of [B, C]) await rpc('community_set_club_membership', user, club, true);
  const upload = (await rpc('community_register_upload', B, `${B}/club.jpg`, 800, 600)).upload_id;
  const clubPost = await rpc('community_create_club_post', B, club, '같이 뛰어요', [upload]);
  await rpc('community_set_like', C, clubPost.post_id, true);
  await rpc('community_add_comment', C, clubPost.post_id, '저도요');
  await rpc('community_set_repost', C, clubPost.post_id, true);
  const outside = await rpc('community_create_post', C, '클럽 밖 글', []);
  await rpc('community_set_like', B, outside.post_id, true);

  // Edit: owner only, validated, names stay unique.
  await rejected(() => update(B, club, '내 클럽'), 'COMMUNITY_CLUB_OWNER_ONLY');
  await rejected(() => update(A, club, '아'), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => update(A, club, '저녁 요가'), 'COMMUNITY_CLUB_NAME_TAKEN');
  const edited = await update(A, club, ' 새벽 러닝 ', '매일 5km', 'running');
  assert.deepEqual([edited.name, edited.description, edited.is_owner], ['새벽 러닝', '매일 5km', true]);
  assert.equal((await update(A, club, '새벽 러닝', null, 'hiking')).category, 'hiking'); checks++;

  // Member list: earliest first (owner), paged, blocked users hidden.
  const list = await members(C, club);
  assert.deepEqual(list.map((m) => [m.nickname, m.role, m.is_me]),
    [['클럽장', 'owner', false], ['회원B', 'member', false], ['회원C', 'member', true]]);
  assert.ok(!JSON.stringify(list).includes('실명'));
  const first = await members(C, club, null, 1);
  assert.deepEqual((await members(C, club, first[0])).map((m) => m.nickname), ['회원B', '회원C']);
  await rpc('community_set_block', C, B, true);
  assert.deepEqual((await members(C, club)).map((m) => m.nickname), ['클럽장', '회원C']);
  await rpc('community_set_block', C, B, false); checks++;

  // Remove: owner only, not yourself, and the removed member cannot come back.
  await rejected(() => rpc('community_remove_club_member', B, club, C), 'COMMUNITY_CLUB_OWNER_ONLY');
  await rejected(() => rpc('community_remove_club_member', A, club, A), 'COMMUNITY_SELF_TARGET');
  assert.equal((await rpc('community_remove_club_member', A, club, C)).member_count, 2);
  await rejected(() => rpc('community_remove_club_member', A, club, C), 'COMMUNITY_USER_NOT_FOUND');
  await rejected(() => rpc('community_set_club_membership', C, club, true), 'COMMUNITY_CLUB_BANNED');
  await rejected(() => rpc('community_create_club_post', C, club, '쫓겨난 뒤 글', []), 'COMMUNITY_CLUB_MEMBERS_ONLY');
  assert.equal((await rpc('community_get_club', C, club)).post_count, 1);
  assert.equal((await rpc('community_set_club_membership', C, other, true)).joined, true); checks++;

  // Delete: owner only; posts, their likes, comments, reposts, uploads and notifications go,
  // the photo paths come back for Storage, and nothing outside the club changes.
  await rejected(() => rpc('community_delete_club', B, club), 'COMMUNITY_CLUB_OWNER_ONLY');
  const deleted = await rpc('community_delete_club', A, club);
  assert.deepEqual(deleted, { deleted: true, image_paths: [`${B}/club.jpg`] });
  await rejected(() => rpc('community_get_club', A, club), 'COMMUNITY_CLUB_NOT_FOUND');
  await rejected(() => rpc('community_get_post', A, clubPost.post_id), 'COMMUNITY_POST_NOT_FOUND');
  assert.equal(await count(`select (
      (select count(*) from public.community_posts where club_id = $1 or repost_of_post_id = $2)
    + (select count(*) from public.community_post_likes where post_id = $2)
    + (select count(*) from public.community_comments where post_id = $2)
    + (select count(*) from public.community_uploads where post_id = $2)
    + (select count(*) from public.community_notifications where post_id = $2)
    + (select count(*) from public.community_club_members where club_id = $1)
    + (select count(*) from public.community_club_bans where club_id = $1))::int as n`,
  [club, clubPost.post_id]), 0);
  assert.equal((await rpc('community_get_post', A, outside.post_id)).like_count, 1);
  assert.equal((await rpc('community_get_club', C, other)).member_count, 2);
  assert.equal(await count('select count(*)::int as n from public.community_uploads where user_id = $1', [B]), 0);
  checks++;

  // Bans are user rows: the generic purge removes them when the banned user leaves.
  await rpc('community_remove_club_member', A, other, C);
  await db.exec('reset role');
  await db.query('delete from auth.users where id = $1', [C]);
  await db.exec('set role service_role');
  assert.equal(await count('select count(*)::int as n from public.community_club_bans where user_id = $1', [C]), 0);
  checks++;

  console.log(`${checks} club management PostgreSQL checks passed (PGlite; not a multi-connection concurrency test).`);
} finally {
  await db.close();
}
