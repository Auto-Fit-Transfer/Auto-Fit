import { Platform } from 'react-native';
import { File } from 'expo-file-system';

import { ApiError, apiRequest } from '@/src/api/client';

// Contract: backend docs/community-api-contract.md (community-backend branch).

export type CommunityAuthor = {
  user_id: string;
  nickname: string;
  profile_image_url: string | null;
};

export type CommunityImage = {
  url: string | null;
  width: number;
  height: number;
};

export type CommunityPost = {
  feed_item_id: string;
  feed_created_at: string;
  reposted_by: CommunityAuthor | null;
  post_id: string;
  author: CommunityAuthor;
  content: string | null;
  images: CommunityImage[];
  like_count: number;
  comment_count: number;
  repost_count: number;
  liked_by_me: boolean;
  reposted_by_me: boolean;
  is_mine: boolean;
  created_at: string;
};

export type CommunityComment = {
  comment_id: string;
  post_id: string;
  author: CommunityAuthor;
  content: string;
  created_at: string;
  is_mine: boolean;
  can_delete: boolean;
};

export type CommunityPage<T> = {
  items: T[];
  next_cursor: string | null;
};

export type CommunityBlockedUser = CommunityAuthor & { blocked_at: string };

export type CommunityFeedScope = 'all' | 'following';

export type CommunityProfile = CommunityAuthor & {
  post_count: number;
  follower_count: number;
  following_count: number;
  is_me: boolean;
  followed_by_me: boolean;
  follows_me: boolean;
};

export type CommunityFollowKind = 'followers' | 'following';

export type CommunityFollowUser = CommunityAuthor & {
  followed_at: string;
  is_me: boolean;
  followed_by_me: boolean;
};

export type CommunityNotification = {
  notification_id: string;
  type: 'follow' | 'like' | 'comment' | 'repost';
  actor: CommunityAuthor;
  post_id: string | null;
  comment_id: string | null;
  post_preview: string | null;
  comment_preview: string | null;
  created_at: string;
  is_read: boolean;
};

export type CommunityReportTarget = 'post' | 'comment' | 'user';

export type CommunityReportReason =
  'spam' | 'abuse' | 'sexual' | 'misinformation' | 'privacy' | 'other';

export const COMMUNITY_REPORT_REASONS: { label: string; value: CommunityReportReason }[] = [
  { label: '광고·도배', value: 'spam' },
  { label: '욕설·비하', value: 'abuse' },
  { label: '음란물', value: 'sexual' },
  { label: '잘못된 건강 정보', value: 'misinformation' },
  { label: '개인정보 노출', value: 'privacy' },
  { label: '기타', value: 'other' },
];

export const COMMUNITY_MAX_IMAGES = 5;
export const COMMUNITY_MAX_POST_LENGTH = 500;
export const COMMUNITY_MAX_COMMENT_LENGTH = 300;

export type CommunityPhoto = {
  uri: string;
  name: string;
  mimeType: string;
  webFile?: Blob;
};

function pageQuery(cursor?: string | null, limit?: number, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(extra);
  if (cursor) params.set('cursor', cursor);
  if (limit !== undefined) params.set('limit', String(limit));
  const query = params.toString();
  return query ? `?${query}` : '';
}

const postPath = (postId: string) => `/api/community/posts/${encodeURIComponent(postId)}`;

const userPath = (userId: string) => `/api/community/users/${encodeURIComponent(userId)}`;

export function getCommunityFeed(cursor?: string | null, scope: CommunityFeedScope = 'all') {
  return apiRequest<CommunityPage<CommunityPost>>(
    `/api/community/feed${pageQuery(cursor, undefined, scope === 'all' ? {} : { scope })}`,
  );
}

export function getCommunityPost(postId: string) {
  return apiRequest<CommunityPost>(postPath(postId));
}

export async function uploadCommunityPhoto(photo: CommunityPhoto) {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const blob = photo.webFile ?? (await (await fetch(photo.uri)).blob());
    formData.append('file', blob, photo.name);
  } else {
    formData.append('file', new File(photo.uri), photo.name);
  }
  return apiRequest<{ upload_id: string; width: number; height: number }>('/api/community/images', {
    body: formData,
    method: 'POST',
  });
}

export function createCommunityPost(content: string, uploadIds: string[]) {
  return apiRequest<CommunityPost>('/api/community/posts', {
    body: JSON.stringify({ content: content.trim() || null, upload_ids: uploadIds }),
    method: 'POST',
  });
}

export function deleteCommunityPost(postId: string) {
  return apiRequest<void>(postPath(postId), { method: 'DELETE' });
}

export function setCommunityLike(postId: string, liked: boolean) {
  return apiRequest<{ post_id: string; liked: boolean; like_count: number }>(
    `${postPath(postId)}/like`,
    { method: liked ? 'PUT' : 'DELETE' },
  );
}

export function setCommunityRepost(postId: string, reposted: boolean) {
  return apiRequest<{ post_id: string; reposted: boolean; repost_count: number }>(
    `${postPath(postId)}/repost`,
    { method: reposted ? 'PUT' : 'DELETE' },
  );
}

export function getCommunityComments(postId: string, cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityComment>>(
    `${postPath(postId)}/comments${pageQuery(cursor, 30)}`,
  );
}

export function createCommunityComment(postId: string, content: string) {
  return apiRequest<CommunityComment>(`${postPath(postId)}/comments`, {
    body: JSON.stringify({ content }),
    method: 'POST',
  });
}

export function deleteCommunityComment(commentId: string) {
  return apiRequest<void>(`/api/community/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  });
}

export function reportCommunityContent(
  targetType: CommunityReportTarget,
  targetId: string,
  reason: CommunityReportReason,
) {
  return apiRequest<{ reported: boolean }>('/api/community/reports', {
    body: JSON.stringify({ reason, target_id: targetId, target_type: targetType }),
    method: 'POST',
  });
}

export function setCommunityBlock(userId: string, blocked: boolean) {
  return apiRequest<{ user_id: string; blocked: boolean }>(
    `/api/community/blocks/${encodeURIComponent(userId)}`,
    { method: blocked ? 'PUT' : 'DELETE' },
  );
}

export function getCommunityBlocks() {
  return apiRequest<CommunityBlockedUser[]>('/api/community/blocks');
}

// 'me' resolves to the signed-in user.
export function getCommunityProfile(userId: string) {
  return apiRequest<CommunityProfile>(userPath(userId));
}

export function getCommunityUserPosts(userId: string, cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityPost>>(`${userPath(userId)}/posts${pageQuery(cursor)}`);
}

export function getCommunityFollowList(
  userId: string,
  kind: CommunityFollowKind,
  cursor?: string | null,
) {
  return apiRequest<CommunityPage<CommunityFollowUser>>(
    `${userPath(userId)}/${kind}${pageQuery(cursor, 30)}`,
  );
}

export function setCommunityFollow(userId: string, following: boolean) {
  return apiRequest<{ user_id: string; following: boolean; follower_count: number }>(
    `/api/community/follows/${encodeURIComponent(userId)}`,
    { method: following ? 'PUT' : 'DELETE' },
  );
}

export function getCommunityNotifications(cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityNotification>>(
    `/api/community/notifications${pageQuery(cursor, 30)}`,
  );
}

export function getCommunityUnreadCount() {
  return apiRequest<{ unread_count: number }>('/api/community/notifications/unread-count');
}

export function readCommunityNotifications() {
  return apiRequest<{ unread_count: number }>('/api/community/notifications/read', {
    method: 'POST',
  });
}

export function saveCommunityNickname(nickname: string) {
  return apiRequest('/api/profile', {
    body: JSON.stringify({ nickname: nickname.trim() }),
    method: 'PATCH',
  });
}

// The server nests the code: { detail: { code, message, fields } }.
export function getCommunityErrorCode(error: unknown) {
  if (!(error instanceof ApiError)) return undefined;
  const code = (error.detail as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function isNicknameRequired(error: unknown) {
  return getCommunityErrorCode(error) === 'COMMUNITY_NICKNAME_REQUIRED';
}

export function getCommunityErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  const detail = error.detail as { message?: unknown } | undefined;
  if (typeof detail?.message === 'string' && detail.message.trim()) return detail.message;
  if (error.status === 0) return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해 주세요.';
  if (error.status === 404) return '삭제되었거나 볼 수 없는 글이에요.';
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
