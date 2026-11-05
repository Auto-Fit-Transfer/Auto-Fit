import assert from 'node:assert/strict';
import test from 'node:test';
import { koreanDate } from '../src/lib/koreanDate.ts';

const now = new Date('2026-11-05T12:00:00');

test('dates of this year show only the month and day', () => {
  assert.equal(koreanDate('2026-11-04', now), '11월 4일');
  assert.equal(koreanDate(new Date('2026-01-31T23:59:00'), now), '1월 31일');
  assert.equal(koreanDate('2026-11-04T09:30:00', now), '11월 4일');
});

test('other years keep the year', () => {
  assert.equal(koreanDate('2000-03-09', now), '2000년 3월 9일');
  assert.equal(koreanDate('2027-01-02', now), '2027년 1월 2일');
});

test('a value that is not a date stays as it is', () => {
  assert.equal(koreanDate('날짜 미기록', now), '날짜 미기록');
});
