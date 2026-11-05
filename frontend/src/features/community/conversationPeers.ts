import type { CommunityConversation } from '@/src/api/community';

// The other person's name comes from the server's conversation list. A link must not be able to set it.
const peers = new Map<string, CommunityConversation['other']>();

export function rememberConversationPeer(conversationId: string, other: CommunityConversation['other']) {
  peers.set(conversationId, other);
}

export function conversationPeer(conversationId: string) {
  return peers.get(conversationId) ?? null;
}

export function forgetConversationPeers() {
  peers.clear();
}
