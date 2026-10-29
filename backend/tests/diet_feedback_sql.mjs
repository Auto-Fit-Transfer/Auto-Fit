import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const read = name => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const meal = '00000000-0000-0000-0000-000000000004';
const rec = '00000000-0000-0000-0000-000000000003';
const items = [{ food_name: '사과', quantity: 1, unit: '개', calories: 100 }];
const call = async (fn, type, user = owner, actual = type === 'different_food' ? items : []) =>
  (await db.query('select public.' + fn + '($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::jsonb) as result',
    [user, meal, type, fn === 'record_recommended_meal' ? '2026-09-16T03:00:00Z' : null, JSON.stringify(actual)])).rows[0].result;
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const base = read('20260901055003_remote_schema.sql');
  for (const table of ['food_items','diet_recommendations','diet_meals','diet_meal_foods','meal_logs','meal_log_items','diet_feedback']) {
    const start = base.indexOf('CREATE TABLE "public"."' + table + '" (');
    await db.exec(base.slice(start, base.indexOf('\n);', start) + 3));
    await db.exec('alter table public.' + table + ' enable row level security; grant select,insert,update,delete on public.' + table + ' to service_role;');
  }
  await db.exec(read('20260903023055_create_diet_rpcs.sql'));
  await db.exec(read('20260916071945_update_diet_meal_feedback.sql'));
  await db.query("insert into diet_recommendations (diet_recommendation_id,user_id,recommendation_date,status) values ($1,$2,current_date,'active')", [rec,owner]);
  await db.query("insert into diet_meals (diet_meal_id,diet_recommendation_id,meal_type,meal_order,status) values ($1,$2,'lunch',1,'recommended')", [meal,rec]);
  await db.query("insert into diet_meal_foods (diet_meal_id,food_name,quantity,unit,calories) values ($1,'밥',1,'개',300)", [meal]);
  await db.exec('set role anon');
  await assert.rejects(() => call('update_recommended_meal','eaten'), /permission denied/);
  await db.exec('set role service_role');
  await assert.rejects(() => call('update_recommended_meal','eaten'), /meal feedback not found/);
  const first = await call('record_recommended_meal','eaten');
  await assert.rejects(() => call('record_recommended_meal','skipped'), /already recorded/);
  await assert.rejects(() => call('update_recommended_meal','skipped',other), /not found for user/);
  for (const from of ['eaten','different_food','skipped']) {
    for (const to of ['eaten','different_food','skipped']) {
      await call('update_recommended_meal',from);
      const result = await call('update_recommended_meal',to);
      assert.equal(result.feedback.diet_feedback_id, first.feedback.diet_feedback_id);
      assert.equal(result.feedback.recorded_at, first.feedback.recorded_at);
      assert.equal(result.feedback.feedback_type,to);
      const rows = (await db.query("select * from meal_logs where status = 'recorded'")).rows;
      assert.equal(rows.length,to === 'skipped' ? 0 : 1);
      const foods = (await db.query('select * from meal_log_items')).rows;
      assert.equal(foods.length,to === 'skipped' ? 0 : 1);
      if (to !== 'skipped') assert.equal(Number(foods[0].calories),to === 'eaten' ? 300 : 100);
      assert.equal((await db.query('select status from diet_meals')).rows[0].status,
        { eaten: 'completed', different_food: 'changed', skipped: 'skipped' }[to]);
    }
  }
  await call('update_recommended_meal','eaten');
  const before = (await db.query('select * from meal_log_items')).rows;
  await assert.rejects(() => call('update_recommended_meal','different_food',owner,[{food_name:'',quantity:1}]), /actual food name/);
  assert.deepEqual((await db.query('select * from meal_log_items')).rows,before);
  console.log('PASS: 9 transitions, identity/time preservation, ownership, permissions, POST duplicate, rollback');
} finally { await db.close(); }
