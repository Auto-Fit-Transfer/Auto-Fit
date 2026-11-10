// Rules for the exercise adjustment card in chat (back-end docs/exercise-chat-api-contract.md).

export const CARD_LIFETIME_MS = 10 * 60 * 1000;

type CardMessage = {
  action?: string | null;
  actionStatus?: string | null;
  pendingActionId?: string | null;
  createdAt: number;
};

export type CardState = 'open' | 'confirmed' | 'cancelled' | 'expired';

// The card closes only when the server says so: a later message with the same pending action id.
export function cardState(message: CardMessage, all: CardMessage[], now: number): CardState | null {
  if (message.action !== 'confirm_exercise_adjustment' || !message.pendingActionId) return null;
  const answer = all.find((other) => other !== message && other.pendingActionId === message.pendingActionId
    && (other.action === 'exercise_session_adjust' || other.action === 'exercise_adjustment_cancelled'));
  if (answer) return answer.action === 'exercise_session_adjust' ? 'confirmed' : 'cancelled';
  if (message.actionStatus !== 'awaiting_confirmation' || now - message.createdAt >= CARD_LIFETIME_MS) return 'expired';
  return 'open';
}

// A 409 from confirm/cancel means this card can no longer be used; the text says why.
export function cardConflictText(detail: unknown): string | null {
  const code = typeof detail === 'string' ? detail : (detail as { code?: unknown } | null)?.code;
  if (code === 'PENDING_ACTION_EXPIRED') return '10분이 지나 이 제안은 닫혔어요. 다시 말씀해 주세요.';
  if (code === 'SESSION_VERSION_CONFLICT' || code === 'SESSION_NOT_ACTIVE' || code === 'SESSION_NOT_FOUND')
    return '운동 상태가 바뀌어 이 제안은 쓸 수 없어요. 다시 말씀해 주세요.';
  if (typeof code === 'string' && code.startsWith('PENDING_ACTION_')) return '이미 처리된 제안이에요.';
  return null;
}

// A high-risk stop is decided by the server; this only says when the session itself could not be stopped.
export function stopNotice(message: { action?: string | null; actionData?: unknown }): string | null {
  if (message.action !== 'exercise_session_stop') return null;
  const data = (message.actionData ?? {}) as { backend_apply_status?: unknown };
  return data.backend_apply_status === 'applied' ? null : '운동 기록은 자동으로 멈추지 못했어요. 운동 화면에서 직접 멈춰 주세요.';
}
