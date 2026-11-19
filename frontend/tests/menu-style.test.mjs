import assert from 'node:assert/strict';
import test from 'node:test';
import { menuStyleFailure, menuStyleLabel } from '../src/features/diet/menuStyle.ts';

test('the button names the chosen style, or asks for one', () => {
  assert.equal(menuStyleLabel('health_focused'), '건강식 위주');
  assert.equal(menuStyleLabel('everyday'), '일반식 위주');
  assert.equal(menuStyleLabel(null), '메뉴 고르기');
});

test('422 and 503 get their own advice; anything else keeps the usual message', () => {
  assert.match(menuStyleFailure(422), /내 정보/);
  assert.match(menuStyleFailure(503), /다른 방식/);
  assert.equal(menuStyleFailure(500), null);
  assert.equal(menuStyleFailure(undefined), null);
});
