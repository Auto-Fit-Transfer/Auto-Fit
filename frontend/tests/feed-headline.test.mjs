import assert from 'node:assert/strict';
import test from 'node:test';

import { feedHeadline } from '../src/features/b/feedHeadline.ts';

const now = new Date(2026, 10, 23, 15);
const at = (d, h) => new Date(2026, 10, d, h).toISOString();
const say = (lines) => lines.map((line) => line.map((part) => (part.mark ? `[${part.text}]` : part.text)).join('')).join(' / ');
const post = (id, who, d, h = 9) => ({ post_id: id, created_at: at(d, h), author: { user_id: who } });

test('counts today exactly when the page reaches yesterday', () => {
  assert.equal(say(feedHeadline([post('a', 'u1', 23), post('b', 'u2', 23), post('c', 'u1', 22)], true, false, now)), '오늘 새 글이 / [2개] 올라왔어요');
});

test('says "넘게" when every loaded post is from today and more pages follow', () => {
  assert.equal(say(feedHeadline([post('a', 'u1', 23), post('b', 'u2', 23)], true, false, now)), '오늘 새 글이 / [2개 넘게] 올라왔어요');
  assert.equal(say(feedHeadline([post('a', 'u1', 23), post('b', 'u2', 23)], false, false, now)), '오늘 새 글이 / [2개] 올라왔어요');
  assert.equal(say(feedHeadline([post('a', 'u1', 23)], true, true, now)), '팔로우한 [1명 넘게] / 오늘 글을 올렸어요');
});

test('a repost of the same post counts once; following counts people', () => {
  const items = [post('a', 'u1', 23), post('a', 'u1', 23), post('b', 'u1', 23), post('c', 'u2', 23), post('d', 'u3', 20)];
  assert.equal(say(feedHeadline(items, true, false, now)), '오늘 새 글이 / [3개] 올라왔어요');
  assert.equal(say(feedHeadline(items, true, true, now)), '팔로우한 [2명]이 / 오늘 글을 올렸어요');
});

test('nothing today: an invitation, no number', () => {
  assert.equal(say(feedHeadline([post('a', 'u1', 21)], true, false, now)), '오늘의 운동을 / 나눠 보세요');
  assert.equal(say(feedHeadline([], false, true, now)), '오늘의 운동을 / 나눠 보세요');
});
