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
  category?: CommunityPostCategory;
  tags?: string[];
  activity_snapshot?: Record<string, unknown> | null;
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
export type CommunityPostCategory = 'workout' | 'routine' | 'diet' | 'question' | 'review';
export type CommunityPostDetails = { category: CommunityPostCategory; tags: string[]; exercise_session_id?: string | null };
export type CommunityActivity = {
  session_id: string;
  completed_at: string;
  snapshot: { name: string; duration_minutes: number; calories: number; exercises: string[] };
};

export type CommunitySearchResult = {
  posts: CommunityPost[];
  routines: CommunityPost[];
  users: CommunityProfile[];
  clubs: CommunityClub[];
};

export type CommunityProfile = CommunityAuthor & {
  bio: string | null;
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

export type CommunityRule = {
  rule_key:
    | 'earn_workout'
    | 'earn_workout_high'
    | 'earn_streak_5'
    | 'earn_streak_30'
    | 'earn_meal_log'
    | 'club_create_cost'
    | 'membership_demo_days';
  amount: number;
  daily_limit: number | null;
  enabled: boolean;
  note: string | null;
};

export type CommunityMileage = {
  balance: number;
  earned_today: number;
  rules: CommunityRule[];
};

export type CommunityMileageMonthly = {
  earned_this_month: number;
  earned_last_month: number;
  spent_this_month: number;
};

export type CommunityActivityItem = {
  activity_id: string;
  occurred_at: string;
  detail: string | null;
  post: CommunityPost;
};

export type CommunityMileageEntry = {
  entry_id: string;
  amount: number;
  reason:
    | 'workout'
    | 'workout_high_adjustment'
    | 'workout_streak_5'
    | 'workout_streak_30'
    | 'meal_log'
    | 'club_create'
    | 'challenge';
  created_at: string;
};

export type CommunityMembership = {
  active: boolean;
  plan: string | null;
  source: 'demo' | null;
  expires_at: string | null;
  demo_available: boolean;
  demo_days: number | null;
};

export type CommunityClubCategory =
  'running' | 'strength' | 'diet' | 'yoga' | 'hiking' | 'cycling' | 'sports' | 'etc';

export const COMMUNITY_CLUB_CATEGORIES: { label: string; value: CommunityClubCategory }[] = [
  { label: '러닝', value: 'running' },
  { label: '헬스·근력', value: 'strength' },
  { label: '식단', value: 'diet' },
  { label: '요가·필라테스', value: 'yoga' },
  { label: '등산', value: 'hiking' },
  { label: '자전거', value: 'cycling' },
  { label: '구기·스포츠', value: 'sports' },
  { label: '기타', value: 'etc' },
];

export type CommunityClub = {
  club_id: string;
  name: string;
  description: string | null;
  category: CommunityClubCategory;
  owner: CommunityAuthor;
  member_count: number;
  post_count: number;
  is_member: boolean;
  is_owner: boolean;
  created_at: string;
};

export type CommunityChallenge = {
  challenge_id: string;
  title: string;
  description: string | null;
  metric: 'workout_days' | 'meal_log_days';
  goal: number;
  starts_on: string;
  ends_on: string;
  reward_mileage: number;
  note: string | null;
  phase: 'upcoming' | 'ongoing' | 'ended';
  participant_count: number;
  joined: boolean;
  progress: number;
  completed: boolean;
  rewarded: boolean;
  can_claim: boolean;
};

export type CommunityRankingMetric = 'workout' | 'mileage';
export type CommunityRankingScope = 'all' | 'following' | 'club';

export type CommunityRanking = {
  metric: CommunityRankingMetric;
  scope: CommunityRankingScope;
  week_start: string;
  week_end: string;
  participating: boolean;
  items: (CommunityAuthor & { rank: number; score: number; is_me: boolean })[];
  me: { rank: number; score: number } | null;
};

export type CommunityClubMember = CommunityAuthor & {
  role: 'owner' | 'member';
  joined_at: string;
  is_me: boolean;
  followed_by_me: boolean;
};

export type CommunityReportItem = {
  target_type: CommunityReportTarget;
  target_id: string;
  target_user: CommunityAuthor;
  report_count: number;
  reasons: CommunityReportReason[];
  details: { reason: CommunityReportReason; detail: string }[];
  content_snapshot: string | null;
  latest_reported_at: string;
  post_id: string | null;
  exists: boolean;
  hidden: boolean;
  last_action: 'hide' | 'unhide' | 'dismiss' | null;
  last_action_at: string | null;
};

export type CommunityModerationAction = 'hide' | 'unhide' | 'dismiss';

export type CommunityConversation = {
  conversation_id: string;
  other: CommunityAuthor;
  last_message: { content: string; created_at: string; is_mine: boolean } | null;
  last_message_at: string | null;
  unread_count: number;
  can_send: boolean;
};

export type CommunityMessage = {
  message_id: string;
  conversation_id: string;
  content: string;
  created_at: string;
  is_mine: boolean;
};

export const COMMUNITY_MAX_MESSAGE_LENGTH = 1000;

export type CommunityAdminChallenge = {
  challenge_id: string;
  title: string;
  description: string | null;
  metric: CommunityChallenge['metric'];
  goal: number;
  starts_on: string;
  ends_on: string;
  reward_mileage: number;
  enabled: boolean;
  note: string | null;
  participant_count: number;
  rewarded_count: number;
  locked: boolean;
};

export type CommunityChallengeInput = {
  title: string;
  description: string | null;
  metric: CommunityChallenge['metric'];
  goal: number;
  starts_on: string;
  ends_on: string;
  reward_mileage: number;
  enabled: boolean;
};

export type CommunityAdminRule = {
  rule_key: CommunityRule['rule_key'];
  amount: number;
  daily_limit: number | null;
  enabled: boolean;
  note: string | null;
  starts_at: string;
  updated_at: string;
};

// Rules and challenges whose note starts with this are still waiting for the team's decision.
export const isProvisionalNote = (note: string | null | undefined) =>
  Boolean(note?.startsWith('임시값') || note?.startsWith('시험 기준'));

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
export const COMMUNITY_MAX_POST_LENGTH = 1000;
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

export function getCommunityFeed(cursor?: string | null, scope: CommunityFeedScope = 'all', category?: CommunityPostCategory | null) {
  return apiRequest<CommunityPage<CommunityPost>>(
    `/api/community/feed${pageQuery(cursor, undefined, { ...(scope === 'all' ? {} : { scope }), ...(category ? { category } : {}) })}`,
  );
}

export function searchCommunity(query: string) {
  return apiRequest<CommunitySearchResult>(
    `/api/community/search?q=${encodeURIComponent(query.trim())}`,
  );
}

export function getMyCommunityActivities() {
  return apiRequest<{ items: CommunityActivity[] }>('/api/community/my-activities');
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

export function createCommunityPost(content: string, uploadIds: string[], details?: CommunityPostDetails) {
  return apiRequest<CommunityPost>('/api/community/posts', {
    body: JSON.stringify({ content: content.trim() || null, upload_ids: uploadIds, ...details }),
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
  detail: string | null = null,
) {
  return apiRequest<{ reported: boolean }>('/api/community/reports', {
    body: JSON.stringify({ detail, reason, target_id: targetId, target_type: targetType }),
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

export function getCommunityMileage() {
  return apiRequest<CommunityMileage>('/api/community/mileage');
}

export function getCommunityMileageMonthly() {
  return apiRequest<CommunityMileageMonthly>('/api/community/mileage/monthly');
}

export function getMyCommunityActivity(kind: 'comments' | 'likes', cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityActivityItem>>(
    `/api/community/activity?kind=${kind}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
}

export function getCommunityBookmarks(cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityPost>>(
    `/api/community/bookmarks${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
}

export type CommunityBookmarkState = { post_id: string; bookmarked: boolean };

export function getCommunityBookmarkState(postId: string) {
  return apiRequest<CommunityBookmarkState>(`${postPath(postId)}/bookmark`);
}

export function setCommunityBookmark(postId: string, bookmarked: boolean) {
  return apiRequest<CommunityBookmarkState>(`${postPath(postId)}/bookmark`, {
    method: bookmarked ? 'PUT' : 'DELETE',
  });
}

export function getCommunityMileageHistory(cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityMileageEntry>>(
    `/api/community/mileage/history${pageQuery(cursor, 30)}`,
  );
}

export function getCommunityMembership() {
  return apiRequest<CommunityMembership>('/api/community/membership');
}

export function startCommunityDemoMembership() {
  return apiRequest<CommunityMembership>('/api/community/membership/demo', { method: 'POST' });
}

const clubPath = (clubId: string) => `/api/community/clubs/${encodeURIComponent(clubId)}`;

export function getCommunityClubs(scope: 'all' | 'mine', cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityClub>>(
    `/api/community/clubs${pageQuery(cursor, undefined, { scope })}`,
  );
}

export function createCommunityClub(
  name: string,
  description: string,
  category: CommunityClubCategory,
) {
  return apiRequest<CommunityClub & { paid_with: 'membership' | 'mileage'; mileage_spent: number }>(
    '/api/community/clubs',
    {
      body: JSON.stringify({
        category,
        description: description.trim() || null,
        name: name.trim(),
      }),
      method: 'POST',
    },
  );
}

export function getCommunityClub(clubId: string) {
  return apiRequest<CommunityClub>(clubPath(clubId));
}

export function setCommunityClubMembership(clubId: string, joined: boolean) {
  return apiRequest<{ club_id: string; joined: boolean; member_count: number }>(
    `${clubPath(clubId)}/membership`,
    { method: joined ? 'PUT' : 'DELETE' },
  );
}

export function getCommunityClubPosts(clubId: string, cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityPost>>(`${clubPath(clubId)}/posts${pageQuery(cursor)}`);
}

export function createCommunityClubPost(clubId: string, content: string, uploadIds: string[], details?: CommunityPostDetails) {
  return apiRequest<CommunityPost>(`${clubPath(clubId)}/posts`, {
    body: JSON.stringify({ content: content.trim() || null, upload_ids: uploadIds, ...details }),
    method: 'POST',
  });
}

export function getCommunityChallenges() {
  return apiRequest<CommunityChallenge[]>('/api/community/challenges');
}

export function setCommunityChallengeParticipation(challengeId: string, joined: boolean) {
  return apiRequest<CommunityChallenge>(
    `/api/community/challenges/${encodeURIComponent(challengeId)}/participation`,
    { method: joined ? 'PUT' : 'DELETE' },
  );
}

export function claimCommunityChallenge(challengeId: string) {
  return apiRequest<CommunityChallenge>(
    `/api/community/challenges/${encodeURIComponent(challengeId)}/claim`,
    { method: 'POST' },
  );
}

export function getCommunityRanking(
  metric: CommunityRankingMetric,
  scope: CommunityRankingScope,
  clubId?: string,
) {
  const params = new URLSearchParams({ metric, scope });
  if (clubId) params.set('club_id', clubId);
  return apiRequest<CommunityRanking>(`/api/community/rankings?${params.toString()}`);
}

export function setCommunityRankingParticipation(participating: boolean) {
  return apiRequest<{ participating: boolean }>('/api/community/rankings/participation', {
    method: participating ? 'PUT' : 'DELETE',
  });
}

export function updateCommunityClub(
  clubId: string,
  name: string,
  description: string,
  category: CommunityClubCategory,
) {
  return apiRequest<CommunityClub>(clubPath(clubId), {
    body: JSON.stringify({ category, description: description.trim() || null, name: name.trim() }),
    method: 'PATCH',
  });
}

export function deleteCommunityClub(clubId: string) {
  return apiRequest<void>(clubPath(clubId), { method: 'DELETE' });
}

export function getCommunityClubMembers(clubId: string, cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityClubMember>>(
    `${clubPath(clubId)}/members${pageQuery(cursor, 30)}`,
  );
}

export function removeCommunityClubMember(clubId: string, userId: string) {
  return apiRequest<{ club_id: string; member_count: number }>(
    `${clubPath(clubId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export function getCommunityModeratorStatus() {
  return apiRequest<{ is_moderator: boolean }>('/api/community/moderation/status');
}

export function getCommunityReportQueue(status: 'open' | 'resolved') {
  return apiRequest<CommunityReportItem[]>(`/api/community/moderation/reports?status=${status}`);
}

export function moderateCommunityTarget(
  targetType: CommunityReportTarget,
  targetId: string,
  action: CommunityModerationAction,
) {
  return apiRequest<{ target_type: string; target_id: string; action: CommunityModerationAction }>(
    '/api/community/moderation/actions',
    {
      body: JSON.stringify({ action, target_id: targetId, target_type: targetType }),
      method: 'POST',
    },
  );
}

const conversationPath = (conversationId: string) =>
  `/api/community/conversations/${encodeURIComponent(conversationId)}`;

export function getCommunityConversations(cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityConversation>>(
    `/api/community/conversations${pageQuery(cursor)}`,
  );
}

export function openCommunityConversation(userId: string) {
  return apiRequest<CommunityConversation>('/api/community/conversations', {
    body: JSON.stringify({ user_id: userId }),
    method: 'POST',
  });
}

export function getCommunityUnreadMessages() {
  return apiRequest<{ unread_count: number }>('/api/community/conversations/unread-count');
}

export function getCommunityMessages(conversationId: string, cursor?: string | null) {
  return apiRequest<CommunityPage<CommunityMessage>>(
    `${conversationPath(conversationId)}/messages${pageQuery(cursor, 30)}`,
  );
}

export function sendCommunityMessage(conversationId: string, content: string) {
  return apiRequest<CommunityMessage>(`${conversationPath(conversationId)}/messages`, {
    body: JSON.stringify({ content: content.trim() }),
    method: 'POST',
  });
}

export function readCommunityConversation(conversationId: string) {
  return apiRequest<{ conversation_id: string; unread_count: number }>(
    `${conversationPath(conversationId)}/read`,
    { method: 'POST' },
  );
}

export function deleteCommunityMessage(messageId: string) {
  return apiRequest<void>(`/api/community/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  });
}

export function getCommunityAdminChallenges() {
  return apiRequest<CommunityAdminChallenge[]>('/api/community/admin/challenges');
}

export function saveCommunityAdminChallenge(
  challengeId: string | null,
  input: CommunityChallengeInput,
) {
  return apiRequest<CommunityAdminChallenge>(
    challengeId
      ? `/api/community/admin/challenges/${encodeURIComponent(challengeId)}`
      : '/api/community/admin/challenges',
    { body: JSON.stringify(input), method: challengeId ? 'PUT' : 'POST' },
  );
}

export function getCommunityAdminRules() {
  return apiRequest<CommunityAdminRule[]>('/api/community/admin/rules');
}

export function updateCommunityAdminRule(
  ruleKey: CommunityRule['rule_key'],
  input: {
    amount: number;
    daily_limit: number | null;
    enabled: boolean;
    restart: boolean;
    note: string | null;
  },
) {
  return apiRequest<CommunityAdminRule>(`/api/community/admin/rules/${ruleKey}`, {
    body: JSON.stringify(input),
    method: 'PATCH',
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
