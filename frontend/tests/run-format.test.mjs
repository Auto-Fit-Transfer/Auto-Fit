import assert from 'node:assert/strict';
import test from 'node:test';
import { runClock, runKm, runPace, runProgress } from '../src/features/a/runFormat.ts';

test('distance, time and pace are written the way the running screens show them', () => {
  assert.equal(runKm(2310), '2.31');
  assert.equal(runKm('5470.4'), '5.47');
  assert.equal(runKm(null), '0.00');
  assert.equal(runClock(924), '15:24');
  assert.equal(runClock(4080), '1:08:00');
  assert.equal(runClock(-3), '00:00');
  assert.equal(runPace(400), `6'40"`);
  assert.equal(runPace(359.6), `6'00"`);
  assert.equal(runPace(null), `-'--"`);
  assert.equal(runPace(0), `-'--"`);
});

test('a course run knows how far along it is, and a free run has no course to measure against', () => {
  assert.deepEqual(runProgress(2310, 5470), { ratio: 2310 / 5470, left: 3160, finished: false });
  assert.deepEqual(runProgress(5600, 5470), { ratio: 1, left: 0, finished: true });
  assert.equal(runProgress(2310, null), null);
  assert.equal(runProgress(2310, 0), null);
});
