// Run: node community_challenges_sql.mjs <@electric-sql/pglite path> <folder with the 20260917 integrity SQL>
// Stages 4-5 (challenges, weekly rankings) in an isolated in-memory PostgreSQL with every
// migration. Never the remote project. Single connection: lock order is reviewed, not exercised.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

import { createUsers, loadAutofitSchema } from './support/autofit_schema.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;

const A = '00000000-0000-4000-8000-0000000004a1';
const B = '00000000-0000-4000-8000-0000000004b2';
const C = '00000000-0000-4000-8000-0000000004c3';
const NO_NICK = '00000000-0000-4000-8000-0000000004d4';

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
// A completed workout `daysAgo` Korean days back, at noon Korea time (never near midnight).
const workout = (user, daysAgo = 0) => asSuperuser(() => db.query(
  `insert into public.exercise_sessions(user_id, status, started_at, completed_at)
   select $1, 'completed', t - interval '30 minutes', t
   from (select (((now() at time zone 'Asia/Seoul')::date - $2::int) + time '12:00')
                at time zone 'Asia/Seoul' as t) x`, [user, daysAgo]));
const addChallenge = (title, startOffset, endOffset, extra = {}) => asSuperuser(async () => (await db.query(
  `insert into public.community_challenges(title, metric, goal, starts_on, ends_on, reward_mileage, enabled)
   select $1, $2, $3, d + $4::int, d + $5::int, $6, $7
   from (select (now() at time zone 'Asia/Seoul')::date as d) x returning challenge_id`,
  [title, extra.metric ?? 'workout_days', extra.goal ?? 3, startOffset, endOffset,
    extra.reward ?? 40, extra.enabled ?? true])).rows[0].challenge_id);
const list = (viewer) => rpc('community_challenge_list', viewer);
const join = (user, id, on = true) => rpc('community_set_challenge_participation', user, id, on);
const claim = (user, id) => rpc('community_claim_challenge', user, id);
const ranking = (viewer, metric = 'workout', scope = 'all', club = null, limit = 50) =>
  rpc('community_ranking', viewer, metric, scope, club, limit);
const optIn = (user, on = true) => rpc('community_set_ranking_participation', user, on);
const ranks = (result) => result.items.map((i) => [i.nickname, i.rank, i.score]);

try {
  await loadAutofitSchema(db, process.argv[3]);
  await createUsers(db, [
    { id: A, name: '실명A', nickname: '도전왕' }, { id: B, name: '실명B', nickname: '꾸준이' },
    { id: C, name: '실명C', nickname: '새싹' }, { id: NO_NICK, name: '실명D' },
  ]);
  await db.exec('set role anon');
  await rejected(() => list(A), 'permission denied');
  await rejected(() => db.query('select * from public.community_ranking_participants'), 'permission denied');
  await db.exec('set role authenticated');
  // Since 20261023002812 the service role may change challenges, only through the moderator tools.
  await rejected(() => db.query("update public.community_challenges set goal = 1"), 'permission denied');
  await db.exec('set role service_role');

  // Two provisional example challenges start today and run two weeks.
  const examples = await list(A);
  assert.deepEqual(
    examples.map((c) => [c.metric, c.goal, c.reward_mileage, c.phase, c.joined])
      .sort(([left], [right]) => left.localeCompare(right)),
    [['meal_log_days', 7, 30, 'ongoing', false], ['workout_days', 5, 50, 'ongoing', false]],
  );
  assert.ok(examples.every((c) => c.note.startsWith('임시값'))); checks++;

  // Progress counts distinct Korean days in the period; the reward is paid once.
  const week = await addChallenge('일주일 3일 운동', -6, 1);
  await workout(A, 0); await workout(A, 0); await workout(A, 1); await workout(A, 2); await workout(A, 9);
  await rejected(() => claim(A, week), 'COMMUNITY_CHALLENGE_NOT_JOINED');
  const joined = await join(A, week);
  assert.deepEqual([joined.joined, joined.progress, joined.completed, joined.can_claim, joined.participant_count],
    [true, 3, true, true, 1]);
  assert.deepEqual(await join(A, week).then((c) => c.participant_count), 1);
  const claimed = await claim(A, week);
  assert.deepEqual([claimed.rewarded, claimed.can_claim], [true, false]);
  assert.equal(await rpc('community_mileage_balance', A), 40);
  await rejected(() => claim(A, week), 'COMMUNITY_CHALLENGE_ALREADY_CLAIMED');
  await rejected(() => join(A, week, false), 'COMMUNITY_CHALLENGE_ALREADY_CLAIMED');
  assert.equal(await count(`select count(*)::int as n from public.community_mileage_ledger
    where user_id = $1 and reason = 'challenge' and source_id = $2`, [A, week]), 1); checks++;

  await join(B, week);
  await rejected(() => claim(B, week), 'COMMUNITY_CHALLENGE_NOT_COMPLETED');
  assert.equal((await join(B, week, false)).joined, false);
  await rejected(() => join(NO_NICK, '00000000-0000-4000-8000-000000000999'), 'COMMUNITY_CHALLENGE_NOT_FOUND');

  // Ended challenges stay listed for a week (to claim) but cannot be joined; disabled are gone.
  const recent = await addChallenge('지난주 챌린지', -10, -3);
  const old = await addChallenge('오래된 챌린지', -30, -10);
  const off = await addChallenge('꺼진 챌린지', -1, 5, { enabled: false });
  const listed = (await list(A)).map((c) => c.challenge_id);
  assert.ok(listed.includes(recent) && !listed.includes(old) && !listed.includes(off));
  assert.equal((await list(A)).at(-1).phase, 'ended');
  await rejected(() => join(A, recent), 'COMMUNITY_CHALLENGE_ENDED');
  await rejected(() => join(A, off), 'COMMUNITY_CHALLENGE_NOT_FOUND');
  const upcoming = await addChallenge('다음 주 챌린지', 3, 10);
  assert.equal((await list(A)).find((c) => c.challenge_id === upcoming).phase, 'upcoming');
  checks++;

  // Rankings: only opted-in users with activity this week; ties share a rank.
  assert.deepEqual((await ranking(C)).items, []);
  await rejected(() => optIn(NO_NICK), 'COMMUNITY_NICKNAME_REQUIRED');
  await optIn(B); await optIn(C);
  await workout(C, 0); await workout(C, 0); await workout(B, 0);
  const first = await ranking(C);
  assert.deepEqual(ranks(first), [['새싹', 1, 2], ['꾸준이', 2, 1]]);
  assert.deepEqual([first.participating, first.me], [true, { rank: 1, score: 2 }]);
  assert.ok(first.items.every((i) => !JSON.stringify(i).includes('실명')));
  assert.equal((await ranking(A)).participating, false);
  assert.equal((await ranking(A)).me, null);
  await workout(B, 0);
  assert.deepEqual(ranks(await ranking(C)), [['꾸준이', 1, 2], ['새싹', 1, 2]]);
  assert.deepEqual(ranks(await ranking(C, 'workout', 'all', null, 1)).length, 1);
  checks++;

  // Scopes: following (followed users and me) and club members.
  assert.deepEqual(ranks(await ranking(B, 'workout', 'following')), [['꾸준이', 1, 2]]);
  await rpc('community_set_follow', B, C, true);
  assert.equal((await ranking(B, 'workout', 'following')).items.length, 2);
  await rpc('community_start_demo_membership', C);
  const club = await rpc('community_create_club', C, '랭킹 클럽', null, 'running');
  assert.deepEqual(ranks(await ranking(B, 'workout', 'club', club.club_id)), [['새싹', 1, 2]]);
  await rpc('community_set_club_membership', B, club.club_id, true);
  assert.equal((await ranking(B, 'workout', 'club', club.club_id)).items.length, 2);
  await rejected(() => ranking(B, 'workout', 'club'), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => ranking(B, 'steps'), 'COMMUNITY_INVALID_INPUT');
  checks++;

  // Mileage metric counts earned mileage this week (challenge rewards included); opting out
  // and blocking hide a user.
  await optIn(A);
  assert.deepEqual(ranks(await ranking(B, 'mileage')), [['도전왕', 1, 40]]);
  await optIn(C, false);
  // A's workout count this week depends on the weekday the test runs, so compare names only.
  assert.deepEqual(ranks(await ranking(B)).map((r) => r[0]).sort(), ['꾸준이', '도전왕']);
  await rpc('community_set_block', B, A, true);
  assert.deepEqual(ranks(await ranking(B)).map((r) => r[0]), ['꾸준이']);
  checks++;

  // Account deletion purges challenge and ranking rows (generic purge, user_id tables).
  await asSuperuser(() => db.query('delete from auth.users where id = $1', [A]));
  assert.equal(await count(`select ((select count(*) from public.community_challenge_participants where user_id = $1)
    + (select count(*) from public.community_ranking_participants where user_id = $1)
    + (select count(*) from public.community_mileage_ledger where user_id = $1))::int as n`, [A]), 0);
  checks++;

  console.log(`${checks} community stage-4/5 PostgreSQL checks passed (PGlite; not a multi-connection concurrency test).`);
} finally {
  await db.close();
}
