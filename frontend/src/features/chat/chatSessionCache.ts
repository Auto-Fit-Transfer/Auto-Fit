import { getChatMessages, getChats } from '@/src/api/chat';
import type { ChatMessage } from '@/src/types/chat';

export type ChatPrefetchStatus = 'error' | 'idle' | 'loading' | 'ready';

export interface ChatSessionSnapshot {
  chatId: string | null;
  hasMore: boolean;
  messages: ChatMessage[];
  nextCursor: string | null;
  status: ChatPrefetchStatus;
}

let snapshot: ChatSessionSnapshot = {
  chatId: null,
  hasMore: false,
  messages: [],
  nextCursor: null,
  status: 'idle',
};
let inFlight: Promise<ChatSessionSnapshot> | null = null;

function logDuration(label: string, startedAt: number) {
  if (__DEV__) {
    //console.info(`[ChatPrefetch] ${label}: ${Date.now() - startedAt}ms`);
  }
}

async function withDuration<T>(label: string, request: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    return await request();
  } finally {
    logDuration(label, startedAt);
  }
}

export function getChatSessionSnapshot() {
  return snapshot;
}

export function updateChatSessionSnapshot(
  chatId: string,
  messages: ChatMessage[],
  nextCursor: string | null = null,
  hasMore = false,
) {
  snapshot = {
    chatId,
    hasMore,
    messages,
    nextCursor,
    status: 'ready',
  };
}

export function mergeChatSessionMessages(chatId: string, messages: ChatMessage[]) {
  const currentMessages = snapshot.chatId === chatId ? snapshot.messages : [];
  const byId = new Map(currentMessages.map((message) => [message.message_id, message]));
  messages.forEach((message) => byId.set(message.message_id, message));
  snapshot = {
    ...snapshot,
    chatId,
    messages: Array.from(byId.values()),
    status: 'ready',
  };
}

export function prefetchActiveChat() {
  if (inFlight) return inFlight;
  if (snapshot.status === 'ready') return Promise.resolve(snapshot);

  snapshot = { ...snapshot, status: 'loading' };
  inFlight = (async () => {
    try {
      const chatList = await withDuration('GET /api/chats?status=active', () =>
        getChats({ limit: 20, status: 'active' }),
      );

      const activeChat = chatList.chats[0];
      if (!activeChat) {
        snapshot = {
          chatId: null,
          hasMore: false,
          messages: [],
          nextCursor: null,
          status: 'ready',
        };
        return snapshot;
      }

      const history = await withDuration('GET /api/chats/{chat_id}/messages', () =>
        getChatMessages(activeChat.chat_id),
      );

      snapshot = {
        chatId: activeChat.chat_id,
        hasMore: history.has_more,
        messages: history.messages,
        nextCursor: history.next_cursor,
        status: 'ready',
      };
      return snapshot;
    } catch {
      //if (__DEV__) console.warn('[ChatPrefetch] background prefetch failed', error);
      snapshot = { ...snapshot, status: 'error' };
      return snapshot;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
