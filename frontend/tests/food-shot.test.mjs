import assert from 'node:assert/strict';
import test from 'node:test';
import { foodShotErrorText, foodShotFoods, hasMissingNutrition, missingNutritionNote, needsRecalculation, withRecalculated } from '../src/features/diet/foodShot.ts';

const item = (over = {}) => ({
  name: '김치볶음밥', amount_g: 250.4, catalog_matched: true, matched_food_code: 'D101',
  calories_kcal: 412.36, carbohydrate_g: 60.04, protein_g: 10, fat_g: 13.55, ...over,
});

test('analysed foods become editable records; missing nutrition stays missing, not 0', () => {
  const [rice, soup] = foodShotFoods({ status: 'partial', nutrition_complete: false, message: '', items: [item(), item({ name: '된장국', amount_g: null, catalog_matched: false, calories_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null })] }, 'shot-1');
  assert.deepEqual(rice, { id: 'shot-1-0', name: '김치볶음밥', serving: 1, amount: 250, baseAmount: 250, unit: 'g', isCustom: false, kcal: 412.4, carbs: 60, protein: 10, fat: 13.6 });
  assert.equal(soup.amount, 0, 'no amount means the user fills it in');
  assert.equal(soup.kcal, undefined);
  assert.equal(soup.isCustom, true);
});

test('an unavailable analysis gives no foods, so the user searches by name', () => {
  assert.deepEqual(foodShotFoods({ status: 'unavailable', nutrition_complete: false, message: '음식을 찾지 못했어요', items: [item()] }), []);
});

test('only foods without nutrition are recalculated, and only with grams and a name', () => {
  assert.equal(needsRecalculation({ name: '된장국', amount: 200, unit: 'g', kcal: undefined }), true);
  assert.equal(needsRecalculation({ name: '된장국', amount: 200, unit: 'g', kcal: 120 }), false);
  assert.equal(needsRecalculation({ name: '된장국', amount: 0, unit: 'g', kcal: undefined }), false);
  assert.equal(needsRecalculation({ name: '된장국', amount: 6000, unit: 'g', kcal: undefined }), false, 'server limit is 5000 g');
  assert.equal(needsRecalculation({ name: '된장국', amount: 1, unit: '인분', kcal: undefined }), false);
  assert.equal(needsRecalculation({ name: '  ', amount: 200, unit: 'g', kcal: undefined }), false);
});

test('a recalculation fills nutrition only when the catalog found it', () => {
  const food = { id: 'x', name: '된장국', serving: 1, amount: 200, unit: 'g' };
  assert.equal(withRecalculated(food, { status: 'completed', nutrition_complete: true, message: '', items: [item({ calories_kcal: 80 })] }).kcal, 80);
  assert.equal(withRecalculated(food, { status: 'partial', nutrition_complete: false, message: '', items: [item({ calories_kcal: null })] }).kcal, undefined);
});

test('a meal with any missing nutrition is not complete', () => {
  assert.equal(hasMissingNutrition([{ kcal: 100 }, { kcal: undefined }]), true);
  assert.equal(hasMissingNutrition([{ kcal: 100 }, { kcal: 0 }]), false);
});

test('each error code has its own message', () => {
  assert.match(foodShotErrorText(413, { code: 'FOOD_SHOT_TOO_LARGE' }), /너무 커요/);
  assert.match(foodShotErrorText(415, { code: 'UNSUPPORTED_IMAGE_TYPE' }), /JPEG, PNG, WebP/);
  assert.match(foodShotErrorText(503, null), /이름으로 찾아/);
});

test('a food left without nutrition says why: no grams, not in the catalog, or the request failed', () => {
  const tofu = { name: '두부구이', amount: 0, unit: 'g' };
  assert.match(missingNutritionNote(tofu, false), /‘두부구이’ 양을 g으로 입력/);
  assert.match(missingNutritionNote({ ...tofu, amount: 6000 }, false), /5,000g 이하/);
  assert.match(missingNutritionNote({ ...tofu, amount: 150 }, 'not_found'), /찾지 못했어요. 이름을 바꾸거나 영양 정보를 직접 입력/);
  assert.match(missingNutritionNote({ ...tofu, amount: 150 }, 0), /연결 문제/);
  assert.match(missingNutritionNote({ ...tofu, amount: 150 }, 401), /로그인이 만료/);
  assert.match(missingNutritionNote({ ...tofu, amount: 150 }, 502), /지금은 ‘두부구이’/);
  assert.match(missingNutritionNote({ name: ' ', amount: 0, unit: 'g' }, false), /‘이 음식’/);
});
