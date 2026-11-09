import assert from 'node:assert/strict';
import test from 'node:test';
import { allergyNamesFrom, conflictsAllergy, mealAllergyConflicts, mealAllergyNotice, readAllergySafety } from '../src/features/diet/allergyConflict.ts';
import { weeklyDietErrorMessage } from '../src/features/diet/weeklyDietErrors.ts';
import { mergeDayMeals } from '../src/features/diet/weeklyMeals.ts';

test('a saved egg breakfast is caught for an egg allergy (11/3 retest)', () => {
  const meal = {
    foods: '현미밥 · 달걀스크램블(올리브유 소량) · 방울토마토',
    intake: [['현미밥', '150g'], ['달걀스크램블(올리브유 소량)', '120g'], ['방울토마토', '150g']],
    usedIngredients: [],
  };
  assert.deepEqual(mealAllergyConflicts(meal, ['계란']), ['계란']);
  assert.deepEqual(mealAllergyConflicts(meal, ['우유']), []);
});

test('aliases and ingredient lists match like the backend', () => {
  assert.equal(conflictsAllergy('참치마요네즈 주먹밥', '계란'), true);
  assert.equal(conflictsAllergy('그릭 요거트', '우유'), true);
  assert.equal(conflictsAllergy('Shrimp salad', '새우'), true);
  assert.equal(conflictsAllergy('닭가슴살 구이', '계란'), false);
  assert.equal(conflictsAllergy('', '계란'), false);
  const meal = { foods: '비빔밥', intake: [['비빔밥', '400g']], usedIngredients: ['메추리알', '고추장'] };
  assert.deepEqual(mealAllergyConflicts(meal, ['계란', '대두']), ['계란']);
});

test('allergy names come from custom names first, then the catalog', () => {
  const names = allergyNamesFrom({
    catalog: [{ allergy_type_id: 'a', name: '계란' }, { allergy_type_id: 'b', name: '우유' }],
    selected: [
      { allergy_type_id: 'a', custom_name: null },
      { allergy_type_id: null, custom_name: ' 키위 ' },
      { allergy_type_id: 'missing', custom_name: null },
    ],
  });
  assert.deepEqual(names, ['계란', '키위']);
});

const plain = { foods: '현미밥', intake: [['현미밥', '150g']], usedIngredients: [] };
const judged = (status, names = []) => ({ ...plain, allergySafety: readAllergySafety({ status, matched_food_names: names }) });

test('each server allergy status blocks or warns as agreed (R1)', () => {
  const conflict = mealAllergyNotice(judged('conflict', ['달걀스크램블']), []);
  assert.equal(conflict.blocked, true);
  assert.equal(conflict.regenerateDay, true);
  assert.match(conflict.message, /달걀스크램블/);
  for (const status of ['context_changed', 'context_unverified']) {
    const notice = mealAllergyNotice(judged(status), []);
    assert.deepEqual([notice.blocked, notice.regenerateDay], [true, true]);
  }
  const partial = mealAllergyNotice(judged('ingredients_unverified'), []);
  assert.deepEqual([partial.blocked, partial.regenerateDay], [false, false]);
  assert.equal(partial.message, '전체 재료는 확인되지 않았어요.');
  assert.equal(mealAllergyNotice(judged('no_selected_allergies'), ['계란']), null);
});

test('an unknown server status is blocked, never treated as safe', () => {
  assert.equal(mealAllergyNotice(judged('something_new'), []).blocked, true);
});

test('the server answer wins, and the name check only covers unjudged meals', () => {
  const egg = { foods: '달걀찜', intake: [], usedIngredients: [] };
  assert.equal(mealAllergyNotice({ ...egg, allergySafety: readAllergySafety({ status: 'no_selected_allergies' }) }, ['계란']), null);
  const named = mealAllergyNotice(egg, ['계란']);
  assert.deepEqual([named.blocked, named.regenerateDay], [true, false]);
  assert.equal(mealAllergyNotice(plain, ['계란']), null);
});

test('malformed allergy data counts as no server answer', () => {
  assert.equal(readAllergySafety(null), undefined);
  assert.equal(readAllergySafety({ matched_food_names: [] }), undefined);
  assert.deepEqual(readAllergySafety({ status: 'conflict', matched_food_names: ['a', 1] }), { status: 'conflict', matchedFoodNames: ['a'] });
});

test('a conflicting daily meal is not replaced by the weekly meal of the same slot', () => {
  const daily = [{ id: 'breakfast', source: 'daily', allergySafety: { status: 'conflict', matchedFoodNames: [] } }];
  const weekly = [{ id: 'breakfast', source: 'weekly' }, { id: 'lunch', source: 'weekly' }];
  const merged = mergeDayMeals(daily, weekly);
  assert.equal(merged[0].source, 'daily');
  assert.equal(merged[0].allergySafety.status, 'conflict');
  assert.equal(merged[1].source, 'weekly');
});

test('every allergy 409 code has its own message instead of the generic one', () => {
  for (const code of ['DIET_MEAL_ALLERGY_CONFLICT', 'DIET_MEAL_ALLERGY_UNVERIFIED', 'DIET_RECIPE_INGREDIENTS_UNVERIFIED', 'AI_ALLERGEN_CONFLICT', 'AI_RECIPE_INGREDIENTS_UNVERIFIED', 'DIET_ALLERGY_CONTEXT_CHANGED']) {
    assert.ok(weeklyDietErrorMessage({ code }), code);
  }
});
