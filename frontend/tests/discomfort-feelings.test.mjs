import assert from 'node:assert/strict';
import test from 'node:test';
import { discomfortFeelings } from '../src/features/exercise/discomfortFeelings.ts';

test('severe pain, dizziness and breathing trouble end the workout instead of adjusting it', () => {
  const stops = discomfortFeelings.filter((item) => item.stops).map((item) => item.key);
  assert.deepEqual(stops, ['pain', 'dizzy', 'breathing']);
});

test('every stop carries the symptom the server records', () => {
  const stops = discomfortFeelings.filter((item) => item.stops);
  assert.deepEqual(stops.map((item) => item.symptomType), ['pain', 'dizziness', 'breathing']);
});

test('only mild feelings adjust, and never at a severe level', () => {
  const adjusts = discomfortFeelings.filter((item) => !item.stops);
  assert.deepEqual(adjusts.map((item) => item.key), ['stiff', 'tingling']);
  assert.ok(adjusts.every((item) => item.severity < 8));
});
