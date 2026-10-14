import type { CommunityPost } from '@/src/api/community';

// Keeps the feed in sync with changes made on the compose and detail screens
// without refetching (and losing the scroll position).
export type CommunityEvent =
  | { type: 'created'; post: CommunityPost }
  | { type: 'updated'; postId: string; patch: Partial<CommunityPost> }
  | { type: 'removed'; postId: string }
  | { type: 'blocked'; userId: string };

type Listener = (event: CommunityEvent) => void;

const listeners = new Set<Listener>();

export function emitCommunityEvent(event: CommunityEvent) {
  listeners.forEach((listener) => listener(event));
}

export function subscribeCommunityEvents(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyCommunityEvent(items: CommunityPost[], event: CommunityEvent) {
  switch (event.type) {
    case 'created':
      return [event.post, ...items.filter((item) => item.feed_item_id !== event.post.feed_item_id)];
    case 'updated':
      return items.map((item) =>
        item.post_id === event.postId ? { ...item, ...event.patch } : item,
      );
    case 'removed':
      return items.filter((item) => item.post_id !== event.postId);
    case 'blocked':
      return items.filter(
        (item) =>
          item.author.user_id !== event.userId && item.reposted_by?.user_id !== event.userId,
      );
  }
}

export function formatCommunityTime(value: string, now = new Date()) {
  const time = new Date(value);
  const seconds = Math.max(0, (now.getTime() - time.getTime()) / 1000);
  if (seconds < 60) return '방금 전';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}일 전`;
  const sameYear = time.getFullYear() === now.getFullYear();
  return `${sameYear ? '' : `${time.getFullYear()}년 `}${time.getMonth() + 1}월 ${time.getDate()}일`;
}
