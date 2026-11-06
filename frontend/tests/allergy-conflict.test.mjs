import assert from 'node:assert/strict';
import test from 'node:test';
import { allergyNamesFrom, conflictsAllergy, mealAllergyConflicts } from '../src/features/diet/allergyConflict.ts';

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
