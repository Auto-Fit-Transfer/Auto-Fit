import assert from 'node:assert/strict';
import test from 'node:test';
import { countWeek, partOf, weekFrame, weightLine } from '../src/features/a/weekReport.ts';

const goals = { steps: 6000, water: 6 };
// Thursday 12 November 2026.
const week = (fill) => weekFrame(new Date(2026, 10, 12, 9)).map((day, index) => ({ ...day, ...(fill[index] ?? {}) }));

test('the week runs Monday to Sunday and knows today', () => {
  const days = weekFrame(new Date(2026, 10, 12, 9));
  assert.deepEqual(days.map((day) => day.label).join(''), '월화수목금토일');
  assert.equal(days[0].key, '2026-11-09');
  assert.deepEqual(days.map((day) => day.state), ['past', 'past', 'past', 'today', 'later', 'later', 'later']);
  // On a Sunday the week is the one that ends that day.
  assert.equal(weekFrame(new Date(2026, 10, 15))[0].key, '2026-11-09');
});

test('an exercise is given a part by its name, or none, or is unknown', () => {
  assert.equal(partOf('맨몸 스쿼트'), 'low');
  assert.equal(partOf('무릎 푸시업'), 'up');
  assert.equal(partOf('플랭크'), 'core');
  assert.equal(partOf('마무리 스트레칭'), 'none');
  assert.equal(partOf('전신 웨이트 트레이닝'), null);
});

test('the title, the road, the icons and the sentences come from the same days', () => {
  const count = countWeek(
    week([
      { minutes: 20, exercises: ['전신 워밍업 스트레칭', '맨몸 스쿼트', '런지'], kcal: 1630, kcalGoal: 1700, protein: 90, proteinGoal: 100, steps: 7240, water: 6, stretch: true },
      { kcal: 1840, kcalGoal: 1700, protein: 80, proteinGoal: 100, steps: 6310, water: 6 },
      { minutes: 20, exercises: ['맨몸 스쿼트', '플랭크'], kcal: 1550, kcalGoal: 1700, protein: 82, proteinGoal: 100, steps: 5480, stretch: true },
      { kcal: 480, kcalGoal: 1700, protein: 20, proteinGoal: 100, steps: 4820, water: 2 },
    ]),
    goals,
  );
  assert.equal(count.workoutDays, 2);
  assert.deepEqual(count.days.map((day) => day.cleared), [5, 3, 3, 1, 0, 0, 0]);
  assert.deepEqual(Object.fromEntries(count.loot.map((item) => [item.key, item.count])), { walk: 2, water: 2, stretch: 2, meal: 4, workout: 2 });
  assert.equal(count.questTotal, 12);
  assert.equal(count.parts.low.times, 2);
  assert.deepEqual(count.parts.low.names, { '맨몸 스쿼트': 2, 런지: 1 });
  assert.equal(count.parts.core.times, 1);
  assert.equal(count.parts.up.times, 0);
  // Today (480 kcal so far) is not judged.
  assert.deepEqual(count.protein, { average: 84, goal: 100 });
  assert.deepEqual(count.kept, { days: 2, of: 3 });
  assert.equal(count.say, '하체는 충분하고 상체가 비어 있어요');
  assert.deepEqual(count.story.map((row) => row.kind), ['done', 'bonus', 'next']);
  assert.equal(count.story[0].note, '월요일 · 수요일');
  assert.equal(count.story[1].note, '하루 평균 16g이 모자라요');
  assert.equal(count.story[2].title, '다음은 상체부터');
});

test('an exercise the app cannot place keeps it from saying a part is missing', () => {
  const count = countWeek(week([{ minutes: 30, exercises: ['전신 웨이트 트레이닝', '맨몸 스쿼트'] }, { minutes: 20, exercises: ['런지'] }]), goals);
  assert.equal(count.parts.low.times, 2);
  assert.equal(count.say, '이번 주 2일 운동했어요');
  assert.deepEqual(count.story.map((row) => row.kind), ['done']);
});

test('a week with nothing yet asks for nothing but the first workout', () => {
  const count = countWeek(week([]), goals);
  assert.equal(count.say, '기록이 쌓이면 여기에 모여요');
  assert.equal(count.questTotal, 0);
  assert.equal(count.protein, null);
  assert.equal(count.kept, null);
  // No steps were counted, so there is no walking quest to show.
  assert.deepEqual(count.loot.map((item) => item.key), ['water', 'stretch', 'meal', 'workout']);
  assert.deepEqual(count.story.map((row) => row.title), ['이번 주 첫 운동']);
});

test('the weight line is the last five measurements, one a day, oldest first', () => {
  const line = weightLine([
    { date: '2026-11-11T08:00:00Z', kg: '55.0' },
    { date: '2026-10-14', kg: 56.6 },
    { date: '2026-10-21', kg: 56.3 },
    { date: '2026-10-28', kg: null },
    { date: '2026-11-04', kg: 55.4 },
    { date: '2026-09-01', kg: 57.2 },
    { date: '2026-08-01', kg: 58 },
    { date: '2026-11-11', kg: 0 },
  ]);
  assert.deepEqual(line.map((point) => point.kg), [58, 57.2, 56.6, 56.3, 55.4, 55].slice(-5));
  assert.equal(line.at(-1).date, '2026-11-11');
});
