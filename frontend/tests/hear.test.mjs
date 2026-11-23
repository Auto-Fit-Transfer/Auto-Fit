import assert from 'node:assert/strict';
import test from 'node:test';
import { hear, tooYoung } from '../src/features/b/hear.ts';

test('the design sentence is read into age, sex, foods, goal and experience', () => {
  const { got, marks } = hear('서른 살 여자예요. 땅콩이랑 새우는 못 먹고, 살을 빼고 싶은데 운동은 처음이에요.');
  assert.equal(got.age, 30);
  assert.equal(got.sex, 'female');
  assert.deepEqual(got.allergens, ['peanut', 'crab']);
  assert.equal(got.goal, 'fat-loss');
  assert.equal(got.level, 'beginner');
  assert.ok(marks.length >= 6);
  assert.ok(marks.every(([from, to], i) => from < to && (i === 0 || marks[i - 1][0] <= from)), 'marks run left to right');
});

test('numbers, Korean numbers, height and weight', () => {
  const { got } = hear('32살 남자고 키 175에 몸무게 70.5예요. 우유 못 먹고 근육 키우고 싶어요. 운동은 가끔 해요');
  assert.equal(got.age, 32);
  assert.equal(got.sex, 'male');
  assert.equal(got.height, 175);
  assert.equal(got.weight, 70.5);
  assert.deepEqual(got.allergens, ['milk']);
  assert.equal(got.goal, 'muscle-gain');
  assert.equal(got.level, 'intermediate');
  assert.equal(hear('서른두 살이에요').got.age, 32);
  const units = hear('160cm 55kg').got;
  assert.equal(units.height, 160);
  assert.equal(units.weight, 55);
});

test('nothing is made up, and peanut is not bean', () => {
  const none = hear('안녕하세요').got;
  assert.deepEqual(none, { age: null, sex: null, allergens: [], noAllergy: false, goal: null, level: null, height: null, weight: null });
  assert.deepEqual(hear('땅콩 못 먹어요').got.allergens, ['peanut']);
  assert.deepEqual(hear('몸무게 60, 게는 못 먹어요').got.allergens, ['crab'], 'the 게 of 몸무게 is not crab');
  assert.ok(hear('27살이고 다 잘 먹어요').got.noAllergy);
  assert.equal(hear('키 90').got.height, null, 'out of range is not heard');
  assert.equal(hear('몸무게 900kg').got.weight, null);
});

test('adults only', () => {
  assert.equal(tooYoung(18), true);
  assert.equal(tooYoung(19), false);
  assert.equal(tooYoung(null), false);
});
