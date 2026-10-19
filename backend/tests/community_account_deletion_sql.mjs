// Run: node community_account_deletion_sql.mjs <@electric-sql/pglite path> <folder with the 20260917 integrity SQL>
// Full account-deletion flow with the applied integrity triggers and the community migration,
// in an isolated in-memory PostgreSQL. Never the remote project. Single connection: lock
// ordering for concurrent writers is reviewed, not exercised here.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

import { createUsers, loadAutofitSchema } from './support/autofit_schema.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;

const A = '0a000000-0000-4000-8000-00000000000a'; // deletes the account
const B = '0b000000-0000-4000-8000-00000000000b';
const C = '0c000000-0000-4000-8000-00000000000c';
const D = '0d000000-0000-4000-8000-00000000000d';
const E = '0e000000-0000-4000-8000-00000000000e'; // starts deleting at the same time

const rpc = async (name, ...args) => {
  const marks = args.map((_, i) => `$${i + 1}`).join(',');
  return (await db.query(`select public.${name}(${marks}) as r`, args)).rows[0].r;
};
const rejected = async (operation, message, label) => {
  await assert.rejects(operation, new RegExp(message), label); checks++;
};
const count = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const asSuperuser = async (task) => {
  await db.exec('reset role');
  try { return await task(); } finally { await db.exec('set role service_role'); }
};
const upload = async (user, name) =>
  (await rpc('community_register_upload', user, `${user}/${name}.jpg`, 800, 600)).upload_id;
const post = (user, content, uploads = []) => rpc('community_create_post', user, content, uploads);
const like = (user, p, on = true) => rpc('community_set_like', user, p.post_id, on);
const repost = (user, p) => rpc('community_set_repost', user, p.post_id, true);
const comment = (user, p, text) => rpc('community_add_comment', user, p.post_id, text);
const report = (user, type, id) => rpc('community_report', user, type, id, 'spam', null);
const block = (user, target) => rpc('community_set_block', user, target, true);
const follow = (user, target, on = true) => rpc('community_set_follow', user, target, on);
const counters = async (p) => (await db.query(
  'select like_count, comment_count, repost_count from public.community_posts where post_id=$1', [p.post_id])).rows[0];
const deleteAuthUser = (uid) => asSuperuser(() => db.query('delete from auth.users where id=$1', [uid]));
// Inspection queries read autofit_integrity, which the service role cannot see.
// Posts whose counters disagree with their rows (owners mid-deletion are skipped on purpose).
const counterDrift = () => asSuperuser(() => count(`select count(*)::int as n from public.community_posts p
  where p.repost_of_post_id is null
    and not exists (select 1 from autofit_integrity.account_deletions d where d.user_id = p.user_id)
    and (p.like_count <> (select count(*) from public.community_post_likes l where l.post_id = p.post_id)
      or p.comment_count <> (select count(*) from public.community_comments c where c.post_id = p.post_id)
      or p.repost_count <> (select count(*) from public.community_posts r where r.repost_of_post_id = p.post_id))`));
const leftoversOf = (uid) => asSuperuser(() => count(`select (
    (select count(*) from public.community_posts where user_id = $1)
  + (select count(*) from public.community_post_likes where user_id = $1)
  + (select count(*) from public.community_comments where user_id = $1)
  + (select count(*) from public.community_uploads where user_id = $1)
  + (select count(*) from public.community_reports where reporter_user_id = $1 or target_user_id = $1)
  + (select count(*) from public.community_blocks where blocker_user_id = $1 or blocked_user_id = $1)
  + (select count(*) from public.community_follows where follower_user_id = $1 or following_user_id = $1)
  + (select count(*) from public.community_notifications where user_id = $1 or actor_user_id = $1)
  + (select count(*) from public.community_mileage_ledger where user_id = $1)
  + (select count(*) from public.community_memberships where user_id = $1)
  + (select count(*) from public.community_club_members where user_id = $1)
  + (select count(*) from public.community_clubs where owner_user_id = $1)
  + (select count(*) from public.community_challenge_participants where user_id = $1)
  + (select count(*) from public.community_ranking_participants where user_id = $1)
  + (select count(*) from public.community_conversations where $1 in (user_low, user_high))
  + (select count(*) from public.community_messages where user_id = $1)
  + (select count(*) from public.community_conversation_reads where user_id = $1)
  + (select count(*) from public.profiles where user_id = $1)
  + (select count(*) from autofit_integrity.account_deletions where user_id = $1)
  + (select count(*) from auth.users where id = $1))::int as n`, [uid]));

try {
  await loadAutofitSchema(db, process.argv[3]);
  await createUsers(db, [
    { id: A, nickname: '탈퇴예정' }, { id: B, nickname: '식단러' }, { id: C, nickname: '새싹' },
    { id: D, nickname: '러너' }, { id: E, nickname: '동시탈퇴' },
  ]);

  // The stock guards are attached to every community table.
  const guards = (await db.query(`select tgrelid::regclass::text as t, tgname from pg_trigger
    where not tgisinternal and tgrelid::regclass::text like 'community_%' order by 1, 2`)).rows
    .map((r) => `${r.t}:${r.tgname}`);
  for (const t of ['community_posts', 'community_uploads', 'community_post_likes', 'community_comments']) {
    assert.ok(guards.includes(`${t}:check_user_reference`) && guards.includes(`${t}:zzz_check_account_writable`), t);
  }
  assert.ok(guards.includes('community_reports:zzz_check_account_writable'));
  assert.ok(guards.includes('community_blocks:zzz_check_account_writable'));
  assert.ok(guards.includes('community_follows:zzz_check_account_writable'));
  for (const g of ['check_user_reference', 'zzz_check_account_writable', 'zzz_check_actor_writable']) {
    assert.ok(guards.includes(`community_notifications:${g}`), g);
  }
  checks++;
  assert.equal(await count(`select count(*)::int as n from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass and p.proname = 'community_account_cleanup'`), 0,
  'no separate auth.users trigger'); checks++;

  await db.exec('set role service_role');
  const pA1 = await post(A, 'A 사진 글', [await upload(A, 'a1'), await upload(A, 'a2')]);
  await upload(A, 'unused');
  const pA2 = await post(A, 'A 글');
  const pB1 = await post(B, 'B 사진 글', [await upload(B, 'b1')]);
  const pC1 = await post(C, 'C 글');
  const pE1 = await post(E, 'E 글');
  await like(B, pA1); await comment(C, pA1, '멋져요'); await repost(C, pA1); await like(D, pA2);
  await like(A, pB1); await like(A, pC1); await comment(A, pB1, '하나'); await comment(A, pB1, '둘');
  await repost(A, pB1); await comment(B, pB1, '내 댓글'); await like(C, pB1); await like(A, pE1);
  await report(B, 'post', pA2.post_id); await report(A, 'post', pC1.post_id); await report(D, 'user', A);
  await block(A, D); await block(C, A);
  await follow(A, B); await follow(B, A); await follow(D, B);
  // A owns a club (demo membership); E joins first but will be leaving too, so B takes over.
  await rpc('community_start_demo_membership', A);
  const clubA = await rpc('community_create_club', A, 'A 클럽', null, 'running');
  await rpc('community_set_club_membership', E, clubA.club_id, true);
  await rpc('community_set_club_membership', B, clubA.club_id, true);
  const challenge = (await rpc('community_challenge_list', A))[0];
  await rpc('community_set_challenge_participation', A, challenge.challenge_id, true);
  await rpc('community_set_ranking_participation', A, true);
  // A and B follow each other, so they can talk; both sides wrote something.
  const chat = (await rpc('community_open_conversation', A, B)).conversation_id;
  await rpc('community_send_message', A, chat, 'A의 메시지');
  await rpc('community_send_message', B, chat, 'B의 메시지');
  await asSuperuser(() => db.query(`insert into storage.objects(bucket_id, name) values
    ('community-photos', $1), ('community-photos', $2), ('community-photos', $3),
    ('community-photos', $4), ('meal-photos', $5)`,
  [`${A}/a1.jpg`, `${A}/a2.jpg`, `${A}/unused.jpg`, `${B}/b1.jpg`, `${A}/meal/1.png`]));
  assert.equal(await counterDrift(), 0);

  // 1. Deletion starts: the account can no longer write anything, through the API or directly.
  await rpc('begin_account_deletion', A);
  const unavailable = 'COMMUNITY_ACCOUNT_UNAVAILABLE';
  await rejected(() => post(A, '탈퇴 중 글'), unavailable, 'post');
  await rejected(() => upload(A, 'late'), unavailable, 'upload');
  await rejected(() => like(A, pC1, false), unavailable, 'unlike');
  await rejected(() => comment(A, pC1, '탈퇴 중 댓글'), unavailable, 'comment');
  await rejected(() => repost(A, pC1), unavailable, 'repost');
  await rejected(() => report(A, 'user', B), unavailable, 'report');
  await rejected(() => block(A, B), unavailable, 'block');
  await rejected(() => follow(A, D), unavailable, 'follow');
  await rejected(() => rpc('community_sync_mileage', A), unavailable, 'mileage');
  await rejected(() => rpc('community_start_demo_membership', A), unavailable, 'membership');
  await rejected(() => rpc('community_create_club', A, 'A 둘째 클럽', null, 'yoga'), unavailable, 'club');
  await rejected(() => rpc('community_set_challenge_participation', A, challenge.challenge_id, true),
    unavailable, 'challenge');
  await rejected(() => rpc('community_claim_challenge', A, challenge.challenge_id), unavailable, 'claim');
  await rejected(() => rpc('community_set_ranking_participation', A, true), unavailable, 'ranking');
  await rejected(() => rpc('community_send_message', A, chat, '탈퇴 중'), unavailable, 'message');
  await rejected(() => rpc('community_send_message', B, chat, '탈퇴 중인 상대에게'),
    'COMMUNITY_CONVERSATION_NOT_FOUND', 'message to leaving user');
  await rejected(() => db.query('insert into public.community_posts(user_id, content) values ($1, $2)', [A, '우회']),
    'Account deletion is in progress', 'direct insert');
  await rejected(() => db.query(`insert into public.community_reports(reporter_user_id, target_type, target_id,
    target_user_id, reason) values ($1, 'user', $2, $2, 'spam')`, [B, A]), 'Account deletion is in progress', 'direct report');
  await rejected(() => db.query('insert into public.community_blocks(blocker_user_id, blocked_user_id) values ($1, $2)', [B, A]),
    'Account deletion is in progress', 'direct block');
  await rejected(() => db.query('insert into public.community_follows(follower_user_id, following_user_id) values ($1, $2)', [D, A]),
    'Account deletion is in progress', 'direct follow');
  await rejected(() => db.query(`insert into public.community_notifications(user_id, actor_user_id, type)
    values ($1, $2, 'follow')`, [D, A]), 'Account deletion is in progress', 'direct notification');
  await rejected(() => asSuperuser(() => db.query(
    "insert into storage.objects(bucket_id, name) values ('community-photos', $1)", [`${A}/late.jpg`])),
  'Account deletion is in progress', 'storage upload');

  // Other users cannot attach new rows to the leaving account's posts or profile.
  await rejected(() => like(D, pA1), 'COMMUNITY_POST_NOT_FOUND');
  await rejected(() => comment(B, pA1, '늦은 댓글'), 'COMMUNITY_POST_NOT_FOUND');
  await rejected(() => repost(B, pA2), 'COMMUNITY_POST_NOT_FOUND');
  await rejected(() => report(D, 'post', pA1.post_id), 'COMMUNITY_TARGET_NOT_FOUND');
  await rejected(() => report(B, 'user', A), 'COMMUNITY_TARGET_NOT_FOUND');
  await rejected(() => block(B, A), 'COMMUNITY_USER_NOT_FOUND');
  await like(D, pC1); await comment(D, pB1, '응원해요'); checks++;

  // Follows: others can unfollow the leaving account but not follow it again, and can still
  // mark notifications from it as read.
  await follow(B, A, false);
  await rejected(() => follow(B, A), 'COMMUNITY_USER_NOT_FOUND', 'follow leaving account');
  assert.ok(await count(`select count(*)::int as n from public.community_notifications
    where user_id = $1 and actor_user_id = $2 and read_at is null`, [B, A]) > 0);
  assert.deepEqual(await rpc('community_read_notifications', B), { unread_count: 0 }); checks++;

  // Comment deletion follows the same rule (20261015005534 lock order): the leaving account
  // cannot delete, and comments tied to it are left for the cascade.
  const commentOf = async (user, text) => (await db.query(
    'select comment_id from public.community_comments where user_id = $1 and content = $2', [user, text])).rows[0].comment_id;
  await rejected(async () => rpc('community_delete_comment', A, await commentOf(A, '하나')), unavailable, 'own comment');
  await rejected(async () => rpc('community_delete_comment', C, await commentOf(C, '멋져요')),
    'COMMUNITY_COMMENT_NOT_FOUND', 'comment on leaving post');
  await rejected(async () => rpc('community_delete_comment', B, await commentOf(A, '둘')),
    'COMMUNITY_COMMENT_NOT_FOUND', 'leaving comment author');

  // 2. File listing covers community-photos (posted and unused) and other buckets.
  const files = (await db.query('select bucket_id, name from public.account_deletion_storage($1)', [A])).rows
    .map((r) => `${r.bucket_id}/${r.name}`).sort();
  assert.deepEqual(files, [`community-photos/${A}/a1.jpg`, `community-photos/${A}/a2.jpg`,
    `community-photos/${A}/unused.jpg`, `meal-photos/${A}/meal/1.png`]); checks++;

  // 3. Auth deletion is refused while files remain, and nothing is removed.
  const pB1Before = await counters(pB1);
  await rejected(() => deleteAuthUser(A), 'Remove account files through the Storage API', 'files remain');
  assert.equal(await count('select count(*)::int as n from public.community_posts where user_id=$1', [A]), 3);
  assert.deepEqual(await counters(pB1), pB1Before); checks++;

  // The Storage API removes the listed files (simulated; never delete storage.objects by SQL in the real DB).
  await asSuperuser(() => db.query("delete from storage.objects where split_part(name, '/', 1) = $1", [A]));
  // E starts deleting too; A's cleanup must not be blocked by E's write guard.
  await rpc('begin_account_deletion', E);

  // 4. A failure late in the cascade rolls back the community cleanup as well.
  await asSuperuser(() => db.exec(`create function public.test_fail_profile_delete() returns trigger
    language plpgsql as $$ begin raise exception 'TEST_FAILURE'; end $$;
    create trigger test_fail_profile_delete before delete on public.profiles
    for each row execute function public.test_fail_profile_delete();`));
  await rejected(() => deleteAuthUser(A), 'TEST_FAILURE', 'injected failure');
  assert.deepEqual(await counters(pB1), pB1Before);
  assert.equal(await count('select count(*)::int as n from public.community_post_likes where user_id=$1', [A]), 3);
  assert.equal(await count('select count(*)::int as n from public.community_reports where target_user_id=$1', [A]), 2); checks++;
  await asSuperuser(() => db.exec('drop trigger test_fail_profile_delete on public.profiles;'));

  // 5. Retry succeeds: nothing of A remains anywhere and every counter matches its rows.
  await deleteAuthUser(A);
  assert.equal(await leftoversOf(A), 0, 'rows about A');
  for (const p of [pA1, pA2]) {
    assert.equal(await count(`select (select count(*) from public.community_posts where post_id = $1 or repost_of_post_id = $1)
      + (select count(*) from public.community_post_likes where post_id = $1)
      + (select count(*) from public.community_comments where post_id = $1) as n`, [p.post_id]), 0, 'A post dependents');
  }
  assert.equal(await asSuperuser(() => count("select count(*)::int as n from storage.objects where split_part(name, '/', 1) = $1", [A])), 0);
  assert.equal(await counterDrift(), 0, 'counter drift'); checks++;
  assert.equal(await count('select count(*)::int as n from public.community_messages where conversation_id = $1', [chat]),
    0, 'conversation removed for both sides');
  const handedOver = await rpc('community_get_club', B, clubA.club_id);
  assert.deepEqual([handedOver.owner.user_id, handedOver.is_owner], [B, true], 'club skips leaving E');
  assert.equal(await count(`select count(*)::int as n from public.community_club_members
    where club_id = $1 and user_id = $2 and role = 'owner'`, [clubA.club_id, B]), 1); checks++;

  // Unrelated rows stay: B's post, photo and comment, C's like, D's new rows.
  assert.deepEqual(await counters(pB1), { like_count: 1, comment_count: 2, repost_count: 0 });
  assert.deepEqual(await counters(pC1), { like_count: 1, comment_count: 0, repost_count: 0 });
  assert.deepEqual((await db.query('select content from public.community_comments where post_id=$1 order by created_at',
    [pB1.post_id])).rows.map((r) => r.content), ['내 댓글', '응원해요']);
  assert.equal(await count('select count(*)::int as n from public.community_uploads where user_id=$1 and post_id is not null', [B]), 1);
  assert.equal(await asSuperuser(() => count('select count(*)::int as n from storage.objects where name = $1', [`${B}/b1.jpg`])), 1);
  assert.equal(await count('select count(*)::int as n from public.community_reports where reporter_user_id=$1', [B]), 0);
  assert.equal(await count('select count(*)::int as n from public.community_blocks'), 0); checks++;

  // E's post was skipped (E is mid-deletion) and disappears with E.
  assert.equal((await counters(pE1)).like_count, 1);
  await deleteAuthUser(E);
  assert.equal(await leftoversOf(E), 0);
  assert.equal((await rpc('community_get_club', B, clubA.club_id)).member_count, 1);
  assert.equal(await count('select count(*)::int as n from public.community_posts where post_id=$1', [pE1.post_id]), 0); checks++;

  // 6. Browser roles have no access; the service role uses the API but not the cleanup.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await rejected(() => rpc('community_feed', B, null, null, 10), 'permission denied', `${role} rpc`);
    await rejected(() => db.query('select * from public.community_posts'), 'permission denied', `${role} table`);
    await rejected(() => rpc('community_account_writable', B), 'permission denied', `${role} helper`);
  }
  await db.exec('set role service_role');
  assert.ok(Array.isArray(await rpc('community_feed', B, null, null, 10)));
  await rejected(() => rpc('community_delete_user_data', B), 'permission denied', 'service cleanup');
  await rejected(() => db.query('select * from autofit_integrity.account_deletions'), 'permission denied', 'integrity schema');

  console.log(`${checks} account-deletion PostgreSQL checks passed (PGlite; single connection, not a concurrency test).`);
} finally {
  await db.close();
}
