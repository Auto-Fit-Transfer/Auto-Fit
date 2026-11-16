import { ScrollView, View } from 'react-native';

import type { CommunityAuthor, CommunityClub, CommunityComment, CommunityPost } from '@/src/api/community';
import { AppHeader } from '@/src/components/common';
import { CommunityClubCard, CommunityCommentRow, CommunityFollowButton, CommunityPostCard } from '@/src/components/community';
import { useThemedStyles, type AppTheme } from '@/src/theme';

// Development only: renewal A's community pieces with sample posts, to look at them (the feed itself
// asks the server and needs a signed-in account).
const nothing = () => undefined;
const who = (id: string, nickname: string): CommunityAuthor => ({ user_id: id, nickname, profile_image_url: null });
const hoursAgo = (hours: number) => new Date(new Date('2026-11-16T12:00:00').getTime() - hours * 3600000).toISOString();
const post = (id: string, author: CommunityAuthor, content: string, more: Partial<CommunityPost> = {}): CommunityPost => ({
  feed_item_id: id,
  feed_created_at: hoursAgo(2),
  reposted_by: null,
  post_id: id,
  author,
  content,
  images: [],
  like_count: 12,
  comment_count: 2,
  repost_count: 2,
  liked_by_me: false,
  reposted_by_me: false,
  is_mine: false,
  created_at: hoursAgo(2),
  ...more,
});
const posts = [
  post('p1', who('u1', '민지'), '하체 루틴 끝! 스쿼트 4세트를 처음으로 다 채웠어요. 내일 계단이 무섭네요', {
    category: 'workout',
    tags: ['하체', '스쿼트'],
    activity_snapshot: { name: '하체 루틴', duration_minutes: 20, exercises: [1, 2, 3, 4], calories: 70 },
  }),
  post('p2', who('u2', '서연'), '점심 도시락이에요. 닭가슴살이 질릴 땐 두부로 바꾸니까 훨씬 낫네요', {
    category: 'diet',
    liked_by_me: true,
    like_count: 31,
    images: [1, 2, 3, 4].map(() => ({ url: null, width: 4, height: 3 })),
    reposted_by: who('u3', '도윤'),
  }),
];
const comments: CommunityComment[] = [
  { comment_id: 'c1', post_id: 'p1', author: who('u2', '서연'), content: '4세트 대단해요! 저는 아직 3세트에서 멈춰요', created_at: hoursAgo(1), is_mine: false, can_delete: false },
  { comment_id: 'c2', post_id: 'p1', author: who('u4', '지원'), content: '저도 어제 하체 했는데 같이 힘내요', created_at: hoursAgo(0.6), is_mine: true, can_delete: true },
];
const club = (id: string, name: string, more: Partial<CommunityClub>): CommunityClub => ({
  club_id: id,
  name,
  description: null,
  category: 'running',
  owner: who('u1', '민지'),
  member_count: 128,
  post_count: 342,
  is_member: false,
  is_owner: false,
  created_at: hoursAgo(240),
  ...more,
});
const clubs = [
  club('k1', '잠실 새벽 러닝', { is_member: true }),
  club('k2', '퇴근 후 홈트', { category: 'strength', is_owner: true, member_count: 1204 }),
  club('k3', '주말 등산 모임', { category: 'hiking', member_count: 36, post_count: 12 }),
];

export default function ACommunitySample() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.root}>
      <AppHeader onBackPress={nothing} title="게시글" />
      <ScrollView contentContainerStyle={styles.content}>
        {posts.map((item) => (
          <View key={item.post_id} style={styles.wrap}>
            <CommunityPostCard onLike={nothing} onMore={nothing} onPress={nothing} onRepost={nothing} post={item} />
          </View>
        ))}
        <View style={styles.row}>
          <CommunityFollowButton following={false} nickname="민지" onPress={nothing} />
          <CommunityFollowButton following nickname="민지" onPress={nothing} />
          <CommunityFollowButton followsMe following={false} nickname="민지" onPress={nothing} />
        </View>
        {comments.map((item) => (
          <CommunityCommentRow comment={item} key={item.comment_id} onMore={nothing} />
        ))}
        <View style={styles.clubs}>
          {clubs.map((item) => (
            <CommunityClubCard club={item} key={item.club_id} onPress={nothing} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, paddingTop: 12, width: '100%' },
    content: { paddingBottom: 40 },
    wrap: { marginHorizontal: 16, marginTop: 12 },
    row: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 16 },
    clubs: { marginTop: 16 },
  } as const;
}
