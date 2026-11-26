import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { setTip } from '../src/features/exercise/exerciseTips.ts';

const tips = JSON.parse(readFileSync(new URL('../src/features/exercise/exerciseTips.json', import.meta.url), 'utf8'));
const squat = tips.ex_a2d7b1609791b7;

test('each set start says one line, and a move the file left out says nothing', () => {
  assert.match(setTip(squat, 1, 3), /^발을 편안한 너비로/);
  assert.match(setTip(squat, 2, 3), /^무릎이 발 방향에서/);
  assert.match(setTip(squat, 3, 3), /^발바닥 전체의 지지/);
  assert.equal(setTip(squat, 4, 4), null);
  assert.match(setTip(squat, 1, 1), /일어나세요\. 무릎이/);
  assert.equal(setTip(tips.ex_f03eec744d3a8b, 1, 3), null); // marked [원본 동작 확인 필요]
  assert.equal(setTip(undefined, 1, 3), null);
});
