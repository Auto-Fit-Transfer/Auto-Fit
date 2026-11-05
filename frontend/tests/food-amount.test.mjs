import assert from 'node:assert/strict';
import test from 'node:test';
import { amountFromInput, scaleFromSource } from '../src/features/diet/foodAmount.ts';

const food = { id: 'a', name: '김치찌개', amount: 300, baseAmount: 300, serving: 1, unit: 'g', kcal: 300, carbs: 12.3, protein: 3.2, fat: 1.1 };

test('the amount field keeps whole numbers from 1 to 999', () => {
  assert.deepEqual(amountFromInput('150'), { digits: '150', amount: 150 });
  assert.deepEqual(amountFromInput('1,50g'), { digits: '150', amount: 150 });
  assert.deepEqual(amountFromInput('0150'), { digits: '150', amount: 150 });
  assert.deepEqual(amountFromInput('1234'), { digits: '123', amount: 123 });
  assert.deepEqual(amountFromInput('0'), { digits: '', amount: null });
  assert.deepEqual(amountFromInput(''), { digits: '', amount: null });
});

test('typing through a tiny amount does not lose nutrition', () => {
  let scale = null;
  let current = food;
  for (const amount of [1, 15, 150]) {
    scale = scaleFromSource(scale, current, amount);
    current = scale.emitted;
  }
  assert.equal(current.amount, 150);
  assert.equal(current.serving, 0.5);
  assert.equal(current.kcal, 150);
  assert.equal(current.protein, 1.6);
  assert.equal(current.fat, 0.6);

  scale = scaleFromSource(scale, current, 300);
  assert.equal(scale.emitted.protein, 3.2);
});

test('another change to the food starts a new source', () => {
  const first = scaleFromSource(null, food, 150);
  const edited = { ...first.emitted, protein: 10 };
  const next = scaleFromSource(first, edited, 300);
  assert.equal(next.from, edited);
  assert.equal(next.emitted.protein, 20);

  const replaced = { ...food, id: 'b', amount: 100, kcal: 80 };
  assert.equal(scaleFromSource(next, replaced, 200).emitted.kcal, 160);
});
