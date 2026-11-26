import assert from 'node:assert/strict';
import test from 'node:test';

import { homeHeadline, nextMeal } from '../src/features/b/homePlan.ts';

const say = (lines) => lines.map((line) => line.map((part) => (part.mark ? `[${part.text}]` : part.text)).join('')).join(' / ');
const lunch = { id: 'lunch', title: '점심', kcal: 560 };

test('the headline proposes the routine and the next meal, with the right particles', () => {
  assert.equal(say(homeHeadline('지원', '코어 루틴 8분', false, lunch)), '지원 님, 오늘은 / [코어 루틴 8분]과 / [점심 560kcal]로 맞춰 뒀어요');
  assert.equal(say(homeHeadline('지원', '하체 루틴', false, lunch)), '지원 님, 오늘은 / [하체 루틴]과 / [점심 560kcal]로 맞춰 뒀어요');
  assert.equal(say(homeHeadline('지원', '코어 루틴 8분', false, { id: 'lunch', title: '점심', kcal: null })), '지원 님, 오늘은 / [코어 루틴 8분]과 / [점심]으로 맞춰 뒀어요');
  assert.equal(say(homeHeadline('지원', '스트레칭 10분', false, null)), '지원 님, 오늘은 / [스트레칭 10분]으로 / 맞춰 뒀어요');
});

test('never an allowance; after the workout only the next meal; nothing set, an invitation', () => {
  for (const line of [homeHeadline('지원', 'A 8분', false, lunch), homeHeadline('지원', null, true, lunch)].map(say)) assert.doesNotMatch(line, /먹어도/);
  assert.equal(say(homeHeadline('지원', '코어 루틴 8분', true, { id: 'dinner', title: '저녁', kcal: 520 })), '지원 님, 오늘 운동은 / 끝냈어요. 다음은 / [저녁 520kcal]로 맞춰 뒀어요');
  assert.equal(say(homeHeadline('지원', null, false, null)), '지원 님, / 오늘을 같이 시작해요');
});

test('the next meal is the first of the day not recorded yet', () => {
  const meals = [{ id: 'dinner', title: '저녁', kcal: 520 }, { id: 'breakfast', title: '아침', kcal: 400 }, lunch];
  assert.equal(nextMeal(meals, []).id, 'breakfast');
  assert.equal(nextMeal(meals, ['breakfast']).id, 'lunch');
  assert.equal(nextMeal(meals, ['breakfast', 'lunch', 'dinner']), null);
});
