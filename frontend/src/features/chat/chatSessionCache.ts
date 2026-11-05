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

const emptySnapshot: ChatSessionSnapshot = {
  chatId: null,
  hasMore: false,
  messages: [],
  nextCursor: null,
  status: 'idle',
};

let snapshot = emptySnapshot;
let inFlight: Promise<ChatSessionSnapshot> | null = null;
let generation = 0;

// Called when the signed-in person changes. A reply still on its way for the old person is thrown away.
export function resetChatSessionCache() {
  generation += 1;
  snapshot = emptySnapshot;
  inFlight = null;
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

  const startedIn = generation;
  snapshot = { ...snapshot, status: 'loading' };
  const request = (async () => {
    try {
      const chatList = await getChats({ limit: 20, status: 'active' });
      const activeChat = chatList.chats[0];
      const history = activeChat ? await getChatMessages(activeChat.chat_id) : null;
      if (startedIn !== generation) return snapshot;

      snapshot = activeChat && history
        ? {
            chatId: activeChat.chat_id,
            hasMore: history.has_more,
            messages: history.messages,
            nextCursor: history.next_cursor,
            status: 'ready',
          }
        : { ...emptySnapshot, status: 'ready' };
      return snapshot;
    } catch {
      if (startedIn === generation) snapshot = { ...snapshot, status: 'error' };
      return snapshot;
    } finally {
      if (startedIn === generation) inFlight = null;
    }
  })();
  inFlight = request;
  return request;
}
