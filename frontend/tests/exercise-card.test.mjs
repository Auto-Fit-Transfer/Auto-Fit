import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_LIFETIME_MS, cardConflictText, cardState, stopNotice } from '../src/features/chat/exerciseCard.ts';

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
