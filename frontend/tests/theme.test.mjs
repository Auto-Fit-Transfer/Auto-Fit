import assert from 'node:assert/strict';
import test from 'node:test';
import { scaleForEasyMode, toEasyFontSize } from '../src/theme/easyMode.ts';
import { darkPalette, lightPalette } from '../src/theme/palette.ts';

test('easy mode uses the Figma "Easy" sizes', () => {
  assert.equal(toEasyFontSize(12), 16);
  assert.equal(toEasyFontSize(14), 18);
  assert.equal(toEasyFontSize(16), 20);
  assert.equal(toEasyFontSize(22), 26);
  assert.equal(toEasyFontSize(32), 36);
  assert.ok(toEasyFontSize(40) > 40);
});

test('line height and letter spacing grow with the font', () => {
  const scaled = scaleForEasyMode({
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.24,
    color: 'red',
  });
  assert.deepEqual(scaled, { fontSize: 20, lineHeight: 30, letterSpacing: -0.3, color: 'red' });
});

test('text without its own size is left to inherit from its parent', () => {
  const style = { color: 'red' };
  assert.equal(scaleForEasyMode(style), style);
});

test('light and dark palettes define the same colors', () => {
  assert.deepEqual(Object.keys(darkPalette).sort(), Object.keys(lightPalette).sort());
  assert.deepEqual(Object.keys(darkPalette.tier).sort(), Object.keys(lightPalette.tier).sort());
  assert.equal(lightPalette.primary, '#4F3FDE');
  assert.equal(darkPalette.background, '#111214');
});
