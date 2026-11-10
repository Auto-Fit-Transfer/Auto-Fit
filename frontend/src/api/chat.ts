import { apiRequest } from '@/src/api/client';
import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';
import type {
  ChatListResponse,
  ChatMessagesResponse,
  ChatStatus,
  CreateChatResponse,
  ExerciseDecisionResponse,
  SendChatMessageResponse,
  UpdateChatResponse,
} from '@/src/types/chat';

function queryString(values: Record<string, number | string | null | undefined>) {
  const query = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `?${query}` : '';
}

export function getChats({
  cursor,
  limit = 20,
  status = 'active',
}: { cursor?: string; limit?: number; status?: ChatStatus } = {}) {
  return apiRequest<ChatListResponse>(`/api/chats${queryString({ cursor, limit, status })}`);
}

export function createChat(title?: string) {
  return apiRequest<CreateChatResponse>('/api/chats', {
    body: JSON.stringify(title ? { title } : {}),
    method: 'POST',
  });
}

export function getChatMessages(chatId: string, before?: string, limit = 30) {
  return apiRequest<ChatMessagesResponse>(
    `/api/chats/${encodeURIComponent(chatId)}/messages${queryString({ before, limit })}`,
  );
}

export function sendChatMessage(chatId: string, content: string, clientMessageId: string, characterId: ChatCharacterId) {
  return apiRequest<SendChatMessageResponse>(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
    body: JSON.stringify({ client_message_id: clientMessageId, content }),
    headers: { 'X-AutoFit-Character': characterId },
    method: 'POST',
  });
}

// Same key on a network retry; a new key is a new decision (contract).
export function decideExerciseAdjustment(chatId: string, pendingActionId: string, decision: 'confirm' | 'cancel', idempotencyKey: string) {
  return apiRequest<ExerciseDecisionResponse>(
    `/api/chats/${encodeURIComponent(chatId)}/pending-actions/${encodeURIComponent(pendingActionId)}/${decision}`,
    { body: JSON.stringify({ idempotency_key: idempotencyKey }), method: 'POST' },
  );
}

export function updateChat(chatId: string, patch: { status?: ChatStatus; title?: string }) {
  return apiRequest<UpdateChatResponse>(`/api/chats/${encodeURIComponent(chatId)}`, {
    body: JSON.stringify(patch),
    method: 'PATCH',
  });
}
