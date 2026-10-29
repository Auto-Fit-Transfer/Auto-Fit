import assert from 'node:assert/strict';
import test from 'node:test';
import { keepKoreanWords, WORD_JOINER } from '../src/lib/koreanLineBreak.ts';

const shown = (text) => text.split(WORD_JOINER).join('|');

test('Korean words stay whole so lines only break at spaces', () => {
  assert.equal(shown(keepKoreanWords('물기를 닦아요.')), '물|기|를 닦|아|요|.');
  assert.equal(shown(keepKoreanWords('꿀 1작은술을')), '꿀 1|작|은|술|을');
  assert.equal(shown(keepKoreanWords('근육(회전근개)')), '근|육|(|회|전|근|개|)');
});

test('text without Korean, spaces and line breaks are left alone', () => {
  assert.equal(keepKoreanWords('Auto-Fit 2.0'), 'Auto-Fit 2.0');
  assert.equal(keepKoreanWords('85분'), '85|분'.split('|').join(WORD_JOINER));
  assert.equal(shown(keepKoreanWords('첫 줄\n둘째 줄')), '첫 줄\n둘|째 줄');
});

test('running it twice changes nothing more', () => {
  const once = keepKoreanWords('오늘 하체 루틴 완료!');
  assert.equal(keepKoreanWords(once), once);
});

test('emoji and combining marks are not split', () => {
  assert.equal(shown(keepKoreanWords('좋아요😀')), '좋|아|요|😀');
  const accent = 'e' + String.fromCharCode(0x0301);
  assert.equal(shown(keepKoreanWords('가' + accent)), '가|' + accent);
});
