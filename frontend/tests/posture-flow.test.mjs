import assert from 'node:assert/strict';
import test from 'node:test';
import { angleRow, postureVideoProblem, postureVideoType, recoveryAction, secondsLabel, stepOf } from '../src/features/exercise/postureFlow.ts';

test('the video type follows the file, so the server sees a matching container', () => {
  assert.deepEqual(postureVideoType('file:///cache/Camera/abc.MOV'), { mimeType: 'video/quicktime', name: 'posture.mov' });
  assert.deepEqual(postureVideoType('file:///cache/x.mp4?v=1'), { mimeType: 'video/mp4', name: 'posture.mp4' });
  assert.deepEqual(postureVideoType('blob:http://localhost/123', 'video/webm'), { mimeType: 'video/webm', name: 'posture.webm' });
  assert.equal(postureVideoType('file:///photo.heic', 'image/heic'), null);
});

test('the app checks the server limits before uploading', () => {
  const ok = { durationMs: 13_000, sizeBytes: 12_000_000, mimeType: 'video/mp4' };
  assert.equal(postureVideoProblem(ok), null);
  assert.equal(postureVideoProblem({ ...ok, durationMs: 30_000, sizeBytes: 50_000_000 }), null, 'the limits themselves pass');
  assert.match(postureVideoProblem({ ...ok, durationMs: 30_001 }), /30초 이하/);
  assert.match(postureVideoProblem({ ...ok, durationMs: 500 }), /1초 이상/);
  assert.match(postureVideoProblem({ ...ok, durationMs: null }), /1초 이상/);
  assert.match(postureVideoProblem({ ...ok, sizeBytes: 50_000_001 }), /50MB 이하/);
  assert.match(postureVideoProblem({ ...ok, mimeType: null }), /MP4, MOV/);
});

test('after an upload error the job decides what comes next', () => {
  assert.equal(recoveryAction('awaiting_upload'), 'reupload');
  assert.equal(recoveryAction('processing'), 'wait');
  assert.equal(recoveryAction('cleanup_pending'), 'wait');
  assert.equal(recoveryAction('completed'), 'result');
  assert.equal(recoveryAction('failed'), 'new_job');
});

test('the three steps follow the job status only', () => {
  assert.deepEqual(['awaiting_upload', 'processing', 'cleanup_pending', 'completed', null].map(stepOf), [0, 1, 2, 3, 0]);
});

test('an angle row compares the measured value with the allowed range', () => {
  assert.deepEqual(angleRow({ angle_code: 'torso_lean', measured_degrees: 52.4, target_min_degrees: null, target_max_degrees: 45 }),
    { label: '상체 기울기', value: '52°', target: '권장 45° 이하', status: '7° 넘음', off: true });
  assert.deepEqual(angleRow({ angle_code: 'knee_flexion', measured_degrees: 84, target_min_degrees: 70, target_max_degrees: 100 }),
    { label: '무릎 굽힘', value: '84°', target: '권장 70~100°', status: '범위 안', off: false });
  assert.equal(angleRow({ angle_code: 'hip_flexion', measured_degrees: 60, target_min_degrees: 75, target_max_degrees: null }).status, '15° 모자람');
  assert.equal(angleRow({ angle_code: 'new_code', measured_degrees: 10, target_min_degrees: null, target_max_degrees: 20 }).label, '각도', 'no English code on screen');
  assert.equal(secondsLabel(7_400), '0:07');
});
