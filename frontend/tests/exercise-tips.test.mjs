import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { guideLines, halfTip, readVoiceGuide, readVoiceGuideStatus, setTip } from '../src/features/exercise/exerciseTips.ts';

const tips = JSON.parse(readFileSync(new URL('../src/features/exercise/exerciseTips.json', import.meta.url), 'utf8'));
const squat = tips.ex_a2d7b1609791b7;

test('each set start says one line, and a move the file left out says nothing', () => {
  assert.match(setTip(squat, 1, 3), /^발을 편안한 너비로/);
  assert.match(setTip(squat, 2, 3), /^무릎이 발 방향에서/);
  assert.match(setTip(squat, 3, 3), /^발바닥 전체의 지지/);
  assert.equal(setTip(squat, 4, 4), null);
  assert.match(setTip(squat, 1, 1), /일어나세요\. 무릎이/);
  assert.equal(setTip(squat, 1, null), setTip(squat, 1, 1)); // no set count runs as one set
  assert.match(halfTip(squat, null), /^발바닥 전체의 지지/); // the feel line, halfway through a one-set move
  assert.equal(halfTip(squat, 3), null);
  assert.equal(halfTip(undefined, 1), null);
  // A recommended move whose key the file marked [원본 동작 확인 필요] (11/26 build 28: ex_a19814aeecf8c0,
  // 제자리 걷기 변형): nothing from the bundle; from v4 the server sends its own lines (guideLines below).
  assert.equal(tips.ex_a19814aeecf8c0, undefined);
  assert.equal(setTip(tips.ex_a19814aeecf8c0, 1, null), null);
  assert.equal(halfTip(tips.ex_a19814aeecf8c0, null), null);
  assert.equal(setTip(tips.ex_f03eec744d3a8b, 1, 3), null); // marked [원본 동작 확인 필요]
  assert.equal(setTip(undefined, 1, 3), null);
});

// v4 (11/27): what the server says for the GIF it chose decides what may be said.
test('ready says the server lines, legacy the bundle, every other verdict nothing', () => {
  const server = { method: '제자리에서 걸으며 양팔을 앞으로 미세요.', caution: '허리를 젖히지 마세요.', focus: '호흡을 고르게 이어 가세요.' };
  const ready = { exerciseKey: 'ex_a19814aeecf8c0', voiceGuideStatus: 'ready', voiceGuide: server };
  assert.deepEqual(guideLines(ready, tips), [server.method, server.caution, server.focus]);
  assert.equal(setTip(guideLines(ready, tips), 1, null), `${server.method} ${server.caution}`);
  assert.equal(halfTip(guideLines(ready, tips), null), server.focus);
  // a legacy key reads the bundle, and a legacy key the bundle left out says nothing
  assert.equal(guideLines({ exerciseKey: 'ex_a2d7b1609791b7', voiceGuideStatus: 'legacy' }, tips), squat);
  assert.equal(guideLines({ exerciseKey: 'ex_1926328986b676', voiceGuideStatus: 'legacy' }, tips), undefined);
  // blocked, unavailable, unknown or missing: nothing, even for a key the bundle has
  for (const voiceGuideStatus of ['blocked_audio', 'unavailable', null, undefined]) {
    assert.equal(guideLines({ exerciseKey: 'ex_a2d7b1609791b7', voiceGuideStatus, voiceGuide: server }, tips), undefined);
  }
  assert.equal(guideLines({ exerciseKey: 'ex_a2d7b1609791b7', voiceGuideStatus: 'ready', voiceGuide: null }, tips), undefined);
});

test('the verdict and the three lines are read only when well formed', () => {
  assert.equal(readVoiceGuideStatus({ voice_guide_status: 'ready' }), 'ready');
  assert.equal(readVoiceGuideStatus({ voice_guide_status: 'reviewed' }), null);
  assert.equal(readVoiceGuideStatus({}), null);
  assert.deepEqual(readVoiceGuide({ voice_guide: { method: ' a ', caution: 'b', focus: 'c' } }), { method: 'a', caution: 'b', focus: 'c' });
  assert.equal(readVoiceGuide({ voice_guide: { method: 'a', caution: '', focus: 'c' } }), null);
  assert.equal(readVoiceGuide({ voice_guide: null }), null);
});
