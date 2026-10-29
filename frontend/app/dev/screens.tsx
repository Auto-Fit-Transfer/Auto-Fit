import { Redirect } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import type { CommunityPost } from '@/src/api/community';
import { SegmentedControl } from '@/src/components/common';
import { CommunityPostCard } from '@/src/components/community';
import {
  ExerciseHomeView,
  type ExerciseHomeViewProps,
} from '@/src/components/exercise/ExerciseHomeView';
import { HomeView, type HomeViewProps } from '@/src/components/home';
import { MyView } from '@/src/components/my/MyView';
import { useAppTheme } from '@/src/theme';

const noop = () => {};

// Sample data copied from the Figma screens (C2 홈, C1 홈 · 데이터 없음, E3 운동, F1 글, G1 마이).
const homeBase: HomeViewProps = {
  dateLabel: '10월 26일 일요일',
  userName: '지원',
  loading: false,
  health: { score: 86, total: 100, change: 5 },
  diet: { consumed: 1240, target: 1700 },
  exercise: { status: 'ready', doneMinutes: null, plannedMinutes: 45 },
  week: {
    count: 2,
    target: 3,
    doneDays: [true, false, true, false, false, false, false],
    todayIndex: 6,
    minutes: 85,
  },
  onAskQwony: noop,
  onOpenAnalysis: noop,
  onOpenDiet: noop,
  onOpenExercise: noop,
  onOpenNotifications: noop,
  onOpenTier: noop,
  onStartExercise: noop,
  onUploadData: noop,
};

const exerciseBase: ExerciseHomeViewProps = {
  state: 'ready',
  routine: { title: '집에서 하는 전신 루틴', minutes: 45, count: 6, kcal: 280 },
  location: 'home',
  week: {
    rangeLabel: '10.20 ~ 10.26',
    count: 2,
    target: 3,
    percent: 67,
    doneDayLabels: ['월', '수'],
    minutes: 85,
  },
  recent: { title: '등 · 이두 루틴', detail: '10월 22일 · 60분 · 5가지 · 320kcal' },
  error: null,
  onLocationChange: noop,
  onOpenGoal: noop,
  onOpenProgress: noop,
  onOpenRecent: noop,
  onPrimary: noop,
  onRecommendAgain: noop,
  onRetry: noop,
};

const ago = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();
const samplePosts: CommunityPost[] = [
  {
    feed_item_id: 'a',
    feed_created_at: ago(2),
    reposted_by: null,
    post_id: 'a',
    author: { user_id: 'u1', nickname: '운동하는지원', profile_image_url: null },
    content:
      '오늘 등 운동 끝! 지난주보다 랫풀다운 무게를 5kg 올렸어요. 꾸준히 하니까 확실히 늘어요.',
    images: [],
    like_count: 24,
    comment_count: 8,
    repost_count: 1,
    liked_by_me: true,
    reposted_by_me: false,
    is_mine: false,
    created_at: ago(2),
  },
  {
    feed_item_id: 'b',
    feed_created_at: ago(5),
    reposted_by: null,
    post_id: 'b',
    author: { user_id: 'u2', nickname: '헬스지훈', profile_image_url: null },
    content: '하체 루틴 공유해요. 주 2회 이렇게 하고 있어요. 스쿼트는 무게보다 자세 먼저!',
    images: [],
    like_count: 37,
    comment_count: 3,
    repost_count: 0,
    liked_by_me: false,
    reposted_by_me: false,
    is_mine: false,
    created_at: ago(5),
  },
];

const screens: Record<string, () => ReactNode> = {
  posts: () => (
    <ScrollView>
      {samplePosts.map((post) => (
        <CommunityPostCard
          key={post.post_id}
          onLike={noop}
          onMore={noop}
          onPress={noop}
          onRepost={noop}
          post={post}
        />
      ))}
    </ScrollView>
  ),
  exercise: () => <ExerciseHomeView {...exerciseBase} />,
  exerciseNew: () => <ExerciseHomeView {...exerciseBase} routine={null} state="not-created" />,
  home: () => <HomeView {...homeBase} />,
  homeEmpty: () => <HomeView {...homeBase} health={null} />,
  my: () => (
    <MyView
      joinedDays={58}
      mileage={320}
      name="김지원"
      onEditProfile={noop}
      onLogout={noop}
      onOpenAccount={noop}
      onOpenExerciseSettings={noop}
      onOpenDietSettings={noop}
      onOpenDisplaySettings={noop}
      onOpenFollowers={noop}
      onOpenFollowing={noop}
      onOpenGoal={noop}
      onOpenMileage={noop}
      onOpenNotifications={noop}
      onOpenPosts={noop}
      onOpenReport={noop}
      onUploadData={noop}
      stats={{ posts: 3, followers: 12, following: 8 }}
    />
  ),
};

const options = [
  { value: 'home', label: '홈' },
  { value: 'homeEmpty', label: '홈 · 처음' },
  { value: 'exercise', label: '운동' },
  { value: 'exerciseNew', label: '운동 · 전' },
  { value: 'posts', label: '글' },
  { value: 'my', label: '마이' },
] as const;

// Development-only page that shows each redesigned tab screen with the Figma sample data,
// so it can be checked without signing in. Open /dev/screens on the web preview.
export default function DevScreens() {
  const [screen, setScreen] = useState<(typeof options)[number]['value']>('home');
  const { colors } = useAppTheme();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      {screens[screen]()}
      <View style={{ bottom: 12, left: 12, position: 'absolute', right: 12 }}>
        <SegmentedControl onChange={setScreen} options={options} value={screen} />
      </View>
    </View>
  );
}
