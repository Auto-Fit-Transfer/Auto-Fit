import assert from 'node:assert/strict';
import test from 'node:test';
import { qaPosition, qaStamp, RUN_QA } from '../src/features/running/runQa.ts';

const last = { latitude: 37.5172, longitude: 127.0473, accuracy: 6 };
const here = { latitude: 37.5175, longitude: 127.0476, accuracy: 7 };
const km = (a, b) => {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('the QA panel is off unless the build sets EXPO_PUBLIC_RUN_QA=1', () => {
  assert.equal(RUN_QA, false);
});

test('times keep milliseconds, to compare with the server log', () => {
  assert.equal(qaStamp(new Date(2026, 10, 16, 9, 5, 7, 42)), '09:05:07.042');
});

test('each test position is one the server refuses for the named reason', () => {
  assert.deepEqual(qaPosition('low_accuracy', last, here), { ...here, accuracy: 80 }, 'over the 50 m limit, at the current place');
  assert.deepEqual(qaPosition('small_movement', last, here), { latitude: last.latitude, longitude: last.longitude, accuracy: 5 }, 'under 3 m from the last stored point');
  const jump = qaPosition('gps_jump', last, here);
  assert.equal(jump.accuracy, 5);
  assert.ok(km(last, jump) > 99, 'about 100 km: over 12 m/s unless the last point is over 2 hours old');
});

test('without a stored point only the accuracy test can be sent, so a test point is never stored as the first point', () => {
  assert.equal(qaPosition('small_movement', null, here), null);
  assert.equal(qaPosition('gps_jump', null, here), null);
  assert.equal(qaPosition('low_accuracy', null, here).accuracy, 80);
  assert.equal(qaPosition('low_accuracy', null, null), null);
});
