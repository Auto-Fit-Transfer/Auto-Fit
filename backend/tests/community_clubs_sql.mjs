// Run: node community_clubs_sql.mjs <@electric-sql/pglite path> <folder with the 20260917 integrity SQL>
// Stage 3 (mileage, demo membership, clubs) in an isolated in-memory PostgreSQL with every
// migration. Never the remote project. Single connection: lock order is reviewed, not exercised.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

import { createUsers, loadAutofitSchema } from './support/autofit_schema.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;

const A = '00000000-0000-4000-8000-0000000003a1';
const B = '00000000-0000-4000-8000-0000000003b2';
const C = '00000000-0000-4000-8000-0000000003c3';
const NO_NICK = '00000000-0000-4000-8000-0000000003d4';

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
const setRule = (key, patch) => asSuperuser(() => db.query(
  `update public.community_rules set amount = coalesce($2, amount), enabled = coalesce($3, enabled),
     starts_at = coalesce($4, starts_at) where rule_key = $1`,
  [key, patch.amount ?? null, patch.enabled ?? null, patch.startsAt ?? null]));
const workout = (user, ago, status = 'completed') => asSuperuser(() => db.query(
  `insert into public.exercise_sessions(user_id, status, started_at, completed_at)
   values ($1, $2, now() - $3::interval - interval '30 minutes',
           case when $2 = 'completed' then now() - $3::interval end)`, [user, status, ago]));
const meal = (user, status = 'recorded') => asSuperuser(() => db.query(
  `insert into public.meal_logs(user_id, meal_type, status) values ($1, 'lunch', $2)`, [user, status]));
const sync = (user) => rpc('community_sync_mileage', user);
const createClub = (user, name, category = 'running', description = null) =>
  rpc('community_create_club', user, name, description, category);
const clubs = (viewer, scope = 'all', category = null, before = null, limit = 51) => rpc('community_club_list',
  viewer, scope, category, before?.created_at ?? null, before?.club_id ?? null, limit);
const join = (user, club, on = true) => rpc('community_set_club_membership', user, club.club_id, on);
const clubFeed = (viewer, club) => rpc('community_club_feed', viewer, club.club_id, null, null, 51);
const ids = (items, key) => items.map((i) => i[key]);

try {
  await loadAutofitSchema(db, process.argv[3]);
  await createUsers(db, [
    { id: A, name: '실명A', nickname: '러너' }, { id: B, name: '실명B', nickname: '요가' },
    { id: C, name: '실명C', nickname: '새싹' }, { id: NO_NICK, name: '실명D' },
  ]);
  await db.exec('set role anon');
  await rejected(() => rpc('community_sync_mileage', A), 'permission denied');
  await rejected(() => db.query('select * from public.community_rules'), 'permission denied');
  await db.exec('set role authenticated');
  // Since 20261019130000 the service role may change rules, only through the moderator tools.
  await rejected(() => db.query("update public.community_rules set amount = 1 where rule_key = 'earn_workout'"),
    'permission denied');
  await db.exec('set role service_role');

  // Rules start as provisional values the team can change later.
  const rules = (await sync(C)).rules;
  assert.deepEqual(rules.map((r) => [r.rule_key, r.amount, r.daily_limit, r.enabled]), [
    ['club_create_cost', 500, null, true], ['earn_meal_log', 5, 3, true],
    ['earn_workout', 10, 1, true], ['membership_demo_days', 30, null, true]]);
  assert.ok(rules.every((r) => /임시값|시연용/.test(r.note))); checks++;

  // Mileage: completed workouts and recorded meals, once each, within daily limits, never
  // for activity before the rule started.
  await workout(A, '2 days');
  await setRule('earn_workout', { startsAt: new Date(Date.now() - 36 * 3600e3).toISOString() });
  await setRule('earn_meal_log', { startsAt: new Date(Date.now() - 3600e3).toISOString() });
  await workout(A, '1 day'); await workout(A, '5 minutes'); await workout(A, '3 minutes');
  await workout(A, '0 minutes', 'in_progress');
  for (let i = 0; i < 4; i++) await meal(A);
  await meal(A, 'draft');
  const first = await sync(A);
  assert.equal(first.balance, 10 + 10 + 3 * 5);
  assert.equal(first.earned_today, 10 + 3 * 5);
  assert.equal((await sync(A)).balance, 35);
  assert.equal(await count(`select count(*)::int as n from public.community_mileage_ledger
    where user_id = $1 and reason = 'workout'`, [A]), 2); checks++;
  await setRule('earn_meal_log', { enabled: false });
  await meal(B); await workout(B, '1 minute');
  assert.equal((await sync(B)).balance, 10);
  await setRule('earn_meal_log', { enabled: true });
  const history = await rpc('community_mileage_history', A, null, null, 2);
  assert.equal(history.length, 2);
  const rest = await rpc('community_mileage_history', A, history[1].created_at, history[1].entry_id, 51);
  assert.equal(history.length + rest.length, 5); checks++;

  // Clubs: mileage pays when there is no membership; validation and unique names.
  await rejected(() => createClub(A, '아침 러닝'), 'COMMUNITY_MILEAGE_NOT_ENOUGH');
  await setRule('club_create_cost', { amount: 30 });
  await rejected(() => createClub(A, '아침 러닝', 'swimming'), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => createClub(A, '아'), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => createClub(NO_NICK, '닉네임 없음'), 'COMMUNITY_NICKNAME_REQUIRED');
  const running = await createClub(A, '  아침 러닝  ', 'running', '매일 아침 5km');
  assert.equal(running.name, '아침 러닝');
  assert.deepEqual([running.paid_with, running.mileage_spent, running.member_count, running.is_owner],
    ['mileage', 30, 1, true]);
  assert.equal((await sync(A)).balance, 5);
  await rejected(() => createClub(B, '아침 러닝'), 'COMMUNITY_CLUB_NAME_TAKEN');
  checks++;

  // Demo membership: free, no payment, can be switched off; members create clubs for free.
  const membership = await rpc('community_start_demo_membership', B);
  assert.equal(membership.active, true);
  assert.equal(membership.source, 'demo');
  assert.ok(new Date(membership.expires_at) - Date.now() > 29 * 86400e3);
  const extended = await rpc('community_start_demo_membership', B);
  assert.ok(new Date(extended.expires_at) - new Date(membership.expires_at) > 29 * 86400e3);
  await rejected(() => createClub(B, '아침 러닝'), 'COMMUNITY_CLUB_NAME_TAKEN');
  const yoga = await createClub(B, '저녁 요가', 'yoga');
  assert.deepEqual([yoga.paid_with, yoga.mileage_spent], ['membership', 0]);
  // Turning a rule back on also credits activity recorded while it was off (B's meal);
  // moving starts_at forward skips that.
  assert.equal((await sync(B)).balance, 15);
  await setRule('membership_demo_days', { enabled: false });
  await rejected(() => rpc('community_start_demo_membership', C), 'COMMUNITY_DEMO_UNAVAILABLE');
  assert.equal((await rpc('community_membership', C)).demo_available, false);
  await setRule('club_create_cost', { enabled: false });
  await rejected(() => createClub(A, '두번째 클럽'), 'COMMUNITY_MEMBERSHIP_REQUIRED');
  await setRule('club_create_cost', { enabled: true });
  for (let i = 0; i < 4; i++) await createClub(B, `요가 모임 ${i}`, 'yoga');
  await rejected(() => createClub(B, '여섯번째'), 'COMMUNITY_CLUB_LIMIT');
  checks++;

  // Lists: newest first, mine, category, paging.
  const all = await clubs(C);
  assert.equal(all.length, 6);
  assert.equal(all.at(-1).club_id, running.club_id);
  assert.deepEqual(await clubs(C, 'mine'), []);
  assert.deepEqual(ids(await clubs(C, 'all', 'running'), 'club_id'), [running.club_id]);
  const page = await clubs(C, 'all', null, null, 4);
  assert.equal((await clubs(C, 'all', null, page[3])).length, 2);
  await rejected(() => clubs(C, 'joined'), 'COMMUNITY_INVALID_INPUT');
  checks++;

  // Membership and club posts: members only; club posts stay out of all/following feeds.
  const post = await rpc('community_create_post', C, '일반 글', []);
  await rejected(() => rpc('community_create_club_post', C, running.club_id, '가입 전 글', []),
    'COMMUNITY_CLUB_MEMBERS_ONLY');
  assert.equal((await join(C, running)).member_count, 2);
  assert.equal((await join(C, running)).member_count, 2);
  const clubPost = await rpc('community_create_club_post', C, running.club_id, '오늘 같이 뛰어요', []);
  assert.deepEqual(ids(await clubFeed(A, running), 'post_id'), [clubPost.post_id]);
  assert.deepEqual(ids(await rpc('community_timeline', A, 'all', null, null, null, 51), 'post_id'), [post.post_id]);
  await rpc('community_set_follow', A, C, true);
  assert.deepEqual(ids(await rpc('community_timeline', A, 'following', null, null, null, 51), 'post_id'),
    [post.post_id]);
  assert.deepEqual(ids(await rpc('community_timeline', A, 'user', C, null, null, 51), 'post_id'),
    [clubPost.post_id, post.post_id]);
  const view = await rpc('community_get_club', C, running.club_id);
  assert.deepEqual([view.is_member, view.is_owner, view.post_count, view.owner.nickname], [true, false, 1, '러너']);
  assert.deepEqual(ids(await clubs(C, 'mine'), 'club_id'), [running.club_id]);
  await rpc('community_set_like', A, clubPost.post_id, true);
  assert.equal((await rpc('community_get_post', C, clubPost.post_id)).like_count, 1);
  await rejected(() => join(A, running, false), 'COMMUNITY_CLUB_OWNER');
  assert.equal((await join(C, running, false)).member_count, 1);
  await join(C, running);
  checks++;

  // Blocking hides the owner's clubs both ways.
  await rpc('community_set_block', A, C, true);
  await rejected(() => rpc('community_get_club', C, running.club_id), 'COMMUNITY_CLUB_NOT_FOUND');
  assert.equal((await clubs(C)).some((c) => c.club_id === running.club_id), false);
  await rpc('community_set_block', A, C, false);
  checks++;

  // Account deletion: owned clubs pass to the earliest remaining member, clubs with nobody
  // left are removed, and mileage, membership and club rows of the leaving user are purged.
  await join(B, running);
  for (const user of [A, B]) {
    await asSuperuser(() => db.query('delete from auth.users where id = $1', [user]));
  }
  const handedOver = await rpc('community_get_club', C, running.club_id);
  assert.deepEqual([handedOver.owner.user_id, handedOver.is_owner, handedOver.member_count], [C, true, 1]);
  assert.equal(await count(`select count(*)::int as n from public.community_club_members
    where club_id = $1 and user_id = $2 and role = 'owner'`, [running.club_id, C]), 1);
  assert.deepEqual(ids(await clubs(C), 'club_id'), [running.club_id]);
  for (const user of [A, B]) {
    assert.equal(await count(`select (
        (select count(*) from public.community_mileage_ledger where user_id = $1)
      + (select count(*) from public.community_memberships where user_id = $1)
      + (select count(*) from public.community_club_members where user_id = $1)
      + (select count(*) from public.community_clubs where owner_user_id = $1))::int as n`, [user]), 0);
  }
  assert.equal(await count('select count(*)::int as n from public.community_club_members m where not exists (select 1 from public.community_clubs c where c.club_id = m.club_id)'), 0);
  checks++;

  console.log(`${checks} community stage-3 PostgreSQL checks passed (PGlite; not a multi-connection concurrency test).`);
} finally {
  await db.close();
}
