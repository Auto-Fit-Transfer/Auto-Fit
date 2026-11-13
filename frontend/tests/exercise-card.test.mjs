import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_LIFETIME_MS, cardConflictText, cardMessage, cardState, cardView, stopNotice } from '../src/features/chat/exerciseCard.ts';

const now = Date.parse('2026-11-10T06:00:00Z');
const card = { action: 'confirm_exercise_adjustment', actionStatus: 'awaiting_confirmation', pendingActionId: 'p1', createdAt: now - 60_000 };

test('a card shows only for the adjustment action, never from text', () => {
  assert.equal(cardState({ action: null, createdAt: now }, [], now), null);
  assert.equal(cardState({ ...card, pendingActionId: null }, [], now), null);
  assert.equal(cardState(card, [card], now), 'open');
});

test('the card closes only on the server answer with the same pending action', () => {
  const confirmed = { action: 'exercise_session_adjust', pendingActionId: 'p1', createdAt: now };
  const cancelled = { action: 'exercise_adjustment_cancelled', pendingActionId: 'p1', createdAt: now };
  const other = { action: 'exercise_session_adjust', pendingActionId: 'p2', createdAt: now };
  assert.equal(cardState(card, [card, confirmed], now), 'confirmed');
  assert.equal(cardState(card, [card, cancelled], now), 'cancelled');
  assert.equal(cardState(card, [card, other], now), 'open', 'another card answer does not close this one');
});

test('after 10 minutes the card is closed', () => {
  assert.equal(cardState({ ...card, createdAt: now - CARD_LIFETIME_MS }, [], now), 'expired');
  assert.equal(cardState({ ...card, actionStatus: 'completed' }, [], now), 'expired');
});

test('each 409 says why the card cannot be used', () => {
  assert.match(cardConflictText('PENDING_ACTION_EXPIRED'), /10분/);
  assert.match(cardConflictText({ code: 'SESSION_VERSION_CONFLICT', latest_session: {} }), /운동 상태가 바뀌어/);
  assert.equal(cardConflictText('PENDING_ACTION_CONSUMED'), '이미 처리된 제안이에요.');
  assert.equal(cardConflictText('Something else'), null);
});

test('a stop that could not stop the session says so; an applied stop says nothing extra', () => {
  assert.equal(stopNotice({ action: 'exercise_session_stop', actionData: { backend_apply_status: 'applied' } }), null);
  assert.match(stopNotice({ action: 'exercise_session_stop', actionData: { backend_apply_status: 'unable_to_apply' } }), /직접 멈춰/);
  assert.equal(stopNotice({ action: 'confirm_exercise_adjustment' }), null);
});

// The real chat screen (app/chat/index.tsx) holds messages in the server's shape; build 62 showed the answer text only.
const server = (over = {}) => ({ message_id: 'm1', sender_type: 'assistant', content: '강도를 낮출까요?', created_at: new Date(now - 60_000).toISOString(), ...over });

test('a server message awaiting confirmation gives the two buttons on the chat screen', () => {
  const cards = [server({ sender_type: 'user', content: '무릎이 찌릿해' }), server({ action: 'confirm_exercise_adjustment', action_status: 'awaiting_confirmation', pending_action_id: 'p1' })].map(cardMessage);
  assert.equal(cardView(cards[0], cards, now), null, 'an ordinary message has no card');
  assert.deepEqual(cardView(cards[1], cards, now), { kind: 'buttons', pendingActionId: 'p1' });
});

test('the chat screen shows one line instead of buttons once the card is answered, refused or expired', () => {
  const ask = server({ action: 'confirm_exercise_adjustment', action_status: 'awaiting_confirmation', pending_action_id: 'p1' });
  const done = [ask, server({ message_id: 'm2', action: 'exercise_session_adjust', pending_action_id: 'p1' })].map(cardMessage);
  assert.deepEqual(cardView(done[0], done, now), { kind: 'note', text: '운동을 조정했어요.' });
  assert.equal(cardView(done[1], done, now), null, 'the answer itself carries no card');
  const open = [ask].map(cardMessage);
  assert.match(cardView(open[0], open, now, { p1: cardConflictText('PENDING_ACTION_EXPIRED') }).text, /10분/, 'a 409 note replaces the buttons');
  assert.match(cardView(open[0], open, now + CARD_LIFETIME_MS).text, /10분이 지나/);
  const stop = [server({ action: 'exercise_session_stop', action_data: { backend_apply_status: 'unable_to_apply' } })].map(cardMessage);
  assert.match(cardView(stop[0], stop, now).text, /직접 멈춰/);
});
