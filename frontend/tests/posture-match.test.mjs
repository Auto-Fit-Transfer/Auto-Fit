import assert from 'node:assert/strict';
import test from 'node:test';
import { postureFor } from '../src/features/exercise/postureMatch.ts';

const profile = (exercise_code, display_name_ko, validation_status, catalog_exercise_keys) => ({
  exercise_code, display_name_ko, camera_view: 'side', validation_status, catalog_exercise_keys,
});
const list = [
  profile('squat', '스쿼트', 'validated', ['ex_96dcb551b33a8e', 'ex_3fb808cb84e33d']),
  profile('push_up', '푸시업', 'experimental', ['ex_f6c866501f5ac0']),
];

test('a move gets posture filming by its catalog key or its exact name', () => {
  assert.equal(postureFor(list, { exerciseKey: 'ex_3fb808cb84e33d', name: '맨몸 스쿼트' })?.exercise_code, 'squat');
  assert.equal(postureFor(list, { exerciseKey: null, name: '스쿼트' })?.exercise_code, 'squat');
});

test('a name that only contains 스쿼트, or an exercise not yet validated, gets nothing', () => {
  assert.equal(postureFor(list, { exerciseKey: 'ex_other', name: '스플릿 스쿼트' }), undefined);
  assert.equal(postureFor(list, { exerciseKey: 'ex_f6c866501f5ac0', name: '푸시업' }), undefined);
  assert.equal(postureFor(list, undefined), undefined);
});
