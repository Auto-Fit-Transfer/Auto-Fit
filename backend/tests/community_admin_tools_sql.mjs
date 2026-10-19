// Run: node community_admin_tools_sql.mjs <@electric-sql/pglite path> <folder with the 20260917 integrity SQL>
// Moderator tools (challenges, mileage rules) in an isolated in-memory PostgreSQL with every
// migration. Never the remote project. Single connection: lock order is reviewed, not exercised.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

import { createUsers, loadAutofitSchema } from './support/autofit_schema.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
let checks = 0;

const M = '00000000-0000-4000-8000-0000000008a0'; // moderator
const U = '00000000-0000-4000-8000-0000000008b1';

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
const today = async (offset = 0) => (await db.query(
  `select to_char((now() at time zone 'Asia/Seoul')::date + $1::int, 'YYYY-MM-DD') as d`, [offset])).rows[0].d;
const save = (user, id, fields) => rpc('community_admin_save_challenge', user, id, fields.title,
  fields.description ?? null, fields.metric ?? 'workout_days', fields.goal, fields.starts, fields.ends,
  fields.reward ?? 30, fields.enabled ?? true);
const rule = (user, key, amount, daily, enabled = true, restart = false, note = null) =>
  rpc('community_admin_update_rule', user, key, amount, daily, enabled, restart, note);

try {
  await loadAutofitSchema(db, process.argv[3]);
  await createUsers(db, [{ id: M, name: '실명M', nickname: '운영자' }, { id: U, name: '실명U', nickname: '참여자' }]);
  await asSuperuser(() => db.query('insert into public.community_moderators(user_id) values ($1)', [M]));
  await db.exec('set role anon');
  await rejected(() => rpc('community_admin_rule_list', M), 'permission denied');
  await db.exec('set role service_role');
  const [d0, d6, d13] = [await today(0), await today(6), await today(13)];

  // Moderators only.
  await rejected(() => rpc('community_admin_challenge_list', U), 'COMMUNITY_FORBIDDEN');
  await rejected(() => rpc('community_admin_rule_list', U), 'COMMUNITY_FORBIDDEN');
  await rejected(() => save(U, null, { title: '몰래 만들기', goal: 3, starts: d0, ends: d6 }), 'COMMUNITY_FORBIDDEN');
  await rejected(() => rule(U, 'earn_workout', 99, 1), 'COMMUNITY_FORBIDDEN');

  // Creating: validated, then visible to users like the provisional examples.
  await rejected(() => save(M, null, { title: '짧', goal: 3, starts: d0, ends: d6 }), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => save(M, null, { title: '목표가 기간보다 김', goal: 8, starts: d0, ends: d6 }), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => save(M, null, { title: '끝이 시작보다 빠름', goal: 1, starts: d6, ends: d0 }), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => save(M, null, { title: '걸음 수', metric: 'steps', goal: 1, starts: d0, ends: d6 }), 'COMMUNITY_INVALID_INPUT');
  const created = await save(M, null, { title: ' 일주일 3일 운동 ', description: '가볍게 시작해요', goal: 3, starts: d0, ends: d6 });
  assert.deepEqual([created.title, created.goal, created.locked, created.participant_count, created.note],
    ['일주일 3일 운동', 3, false, 0, '운영자가 만든 챌린지']);
  assert.ok((await rpc('community_challenge_list', U)).some((c) => c.challenge_id === created.challenge_id));
  const all = await rpc('community_admin_challenge_list', M);
  assert.equal(all.length, 3);
  checks++;

  // Editing: free before anyone joins; afterwards goal, start, reward and an earlier end are fixed.
  const id = created.challenge_id;
  assert.equal((await save(M, id, { title: '일주일 4일 운동', goal: 4, starts: d0, ends: d6, reward: 40 })).goal, 4);
  await rpc('community_set_challenge_participation', U, id, true);
  assert.equal((await rpc('community_admin_challenge_list', M)).find((c) => c.challenge_id === id).locked, true);
  await rejected(() => save(M, id, { title: '일주일 4일 운동', goal: 2, starts: d0, ends: d6, reward: 40 }), 'COMMUNITY_CHALLENGE_LOCKED');
  await rejected(() => save(M, id, { title: '일주일 4일 운동', goal: 4, starts: d0, ends: d6, reward: 999 }), 'COMMUNITY_CHALLENGE_LOCKED');
  const d5 = await today(5);
  await rejected(() => save(M, id, { title: '일주일 4일 운동', goal: 4, starts: d0, ends: d5, reward: 40 }), 'COMMUNITY_CHALLENGE_LOCKED');
  const extended = await save(M, id, { title: '2주 4일 운동', goal: 4, starts: d0, ends: d13, reward: 40 });
  assert.deepEqual([extended.title, extended.ends_on, extended.participant_count], ['2주 4일 운동', d13, 1]);
  await save(M, id, { title: '2주 4일 운동', goal: 4, starts: d0, ends: d13, reward: 40, enabled: false });
  assert.equal((await rpc('community_challenge_list', U)).some((c) => c.challenge_id === id), false);
  await rejected(() => save(M, '00000000-0000-4000-8000-000000000999',
    { title: '없는 챌린지', goal: 1, starts: d0, ends: d6 }), 'COMMUNITY_CHALLENGE_NOT_FOUND');
  // A provisional example stops being labelled provisional once a moderator saves it.
  const example = all.find((c) => c.note?.startsWith('임시값'));
  const fixed = await save(M, example.challenge_id, { title: example.title, description: example.description,
    metric: example.metric, goal: example.goal, starts: example.starts_on, ends: example.ends_on,
    reward: example.reward_mileage });
  assert.equal(fixed.note, '운영자가 정함');
  checks++;

  // Rules: amounts, limits and on/off; a saved rule is no longer provisional.
  const rules = await rpc('community_admin_rule_list', M);
  assert.equal(rules.length, 4);
  assert.ok(rules.every((r) => r.note.startsWith('임시값') || r.note.startsWith('시연용')));
  await rejected(() => rule(M, 'club_create_cost', 300, 1), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => rule(M, 'earn_workout', -1, 1), 'COMMUNITY_INVALID_INPUT');
  await rejected(() => rule(M, 'no_such_rule', 1, null), 'COMMUNITY_INVALID_INPUT');
  const workout = await rule(M, 'earn_workout', 20, 2);
  assert.deepEqual([workout.amount, workout.daily_limit, workout.note], [20, 2, '운영자가 정함']);
  assert.equal((await rule(M, 'club_create_cost', 300, null, true, false, '클럽 개설 300점 (10/19 결정)')).note,
    '클럽 개설 300점 (10/19 결정)');
  assert.equal((await rpc('community_sync_mileage', U)).rules.find((r) => r.rule_key === 'club_create_cost').amount, 300);
  checks++;

  // Restart: activity before the restart never earns under the rule; later activity does.
  const insertWorkout = () => asSuperuser(() => db.query(`insert into public.exercise_sessions(user_id, status, started_at, completed_at)
    values ($1, 'completed', now() - interval '30 minutes', now())`, [U]));
  await insertWorkout();
  await rule(M, 'earn_workout', 20, 2, true, true);
  assert.equal((await rpc('community_sync_mileage', U)).balance, 0);
  await insertWorkout();
  assert.equal((await rpc('community_sync_mileage', U)).balance, 20);
  await rule(M, 'earn_workout', 20, 2, false);
  await insertWorkout();
  assert.equal((await rpc('community_sync_mileage', U)).balance, 20);
  checks++;

  console.log(`${checks} admin tools PostgreSQL checks passed (PGlite; not a multi-connection concurrency test).`);
} finally {
  await db.close();
}
