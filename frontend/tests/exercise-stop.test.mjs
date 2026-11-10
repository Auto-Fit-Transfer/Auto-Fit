import assert from 'node:assert/strict';
import test from 'node:test';
import { finishedProgress, runStopSequence } from '../src/features/exercise/stopRecording.ts';

const squat = { mode: 'reps', targetRepetitions: 12, totalSets: 3 };

test('① stopping during set 2 or 3 of 3 records the sets finished before it', () => {
  assert.deepEqual(finishedProgress({ phase: 'exercise', currentSet: 2, currentRep: 0, exercise: squat }), { completedSets: 1, performedRepetitions: 12 });
  assert.deepEqual(finishedProgress({ phase: 'exercise', currentSet: 3, currentRep: 5, exercise: squat }), { completedSets: 2, performedRepetitions: 29 });
});

test('② stopping in the rest right after a set counts that set', () => {
  assert.deepEqual(finishedProgress({ phase: 'rest', currentSet: 2, currentRep: 12, exercise: squat }), { completedSets: 2, performedRepetitions: 24 });
  assert.deepEqual(finishedProgress({ phase: 'exercise', currentSet: 1, currentRep: 0, exercise: squat }), { completedSets: 0, performedRepetitions: 0 });
  const plank = { mode: 'timed', targetRepetitions: null, totalSets: 3 };
  assert.deepEqual(finishedProgress({ phase: 'rest', currentSet: 1, currentRep: 0, exercise: plank }), { completedSets: 1, performedRepetitions: null });
});

function recorder() {
  const order = [];
  const step = (name, fail = false) => () => {
    order.push(`${name} start`);
    return new Promise((resolve, reject) => setTimeout(() => {
      order.push(`${name} end`);
      if (fail) reject(new Error(name)); else resolve();
    }, 5));
  };
  return { order, step, logs: [] };
}

test('the stop waits for every item write, current item last, then stops once', async () => {
  const r = recorder();
  let stops = 0;
  await runStopSequence({
    settleQueued: () => [r.step('earlier item')(), r.step('other item')()],
    queueCurrentItem: () => [r.step('current item')()],
    sendStop: () => { stops += 1; return r.step('stop')(); },
    log: (message) => r.logs.push(message),
  });
  assert.equal(stops, 1);
  assert.ok(r.order.indexOf('other item end') < r.order.indexOf('current item start'));
  assert.ok(r.order.indexOf('current item end') < r.order.indexOf('stop start'));
  assert.deepEqual(r.logs, []);
});

test('③ a failed item write is logged and the stop is still sent once', async () => {
  const r = recorder();
  let stops = 0;
  await runStopSequence({
    settleQueued: () => [r.step('earlier item', true)(), r.step('slow item')()],
    queueCurrentItem: () => [r.step('current item', true)()],
    sendStop: () => { stops += 1; return r.step('stop')(); },
    log: (message) => r.logs.push(message),
  });
  assert.equal(stops, 1);
  assert.ok(r.order.indexOf('slow item end') < r.order.indexOf('stop start'), 'waits for the slow write even after another failed');
  assert.deepEqual(r.logs, ['Exercise item result failed before stop', 'Stopped exercise item result failed']);
});

test('④ ending the workout right after the stop does not cut the sequence short', async () => {
  const r = recorder();
  let session = { id: 'session-1' };
  const sessionId = session.id; // read once when the stop starts, as the app does
  const sent = [];
  const done = runStopSequence({
    settleQueued: () => [r.step('earlier item')()],
    queueCurrentItem: () => { sent.push(`item for ${sessionId}`); return [r.step('current item')()]; },
    sendStop: () => { sent.push(`stop for ${sessionId}`); return Promise.resolve(); },
    log: (message) => r.logs.push(message),
  });
  session = null; // "운동 종료" clears the session at once
  await done;
  assert.equal(session, null);
  assert.deepEqual(sent, ['item for session-1', 'stop for session-1']);
});

test('a failed stop is logged and does not throw', async () => {
  const logs = [];
  await runStopSequence({ settleQueued: () => [], queueCurrentItem: null, sendStop: () => Promise.reject(new Error('offline')), log: (m) => logs.push(m) });
  assert.deepEqual(logs, ['Exercise stop record failed']);
});
