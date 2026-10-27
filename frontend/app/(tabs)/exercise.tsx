import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Fire from '@/assets/figma/main/8e9a7.svg';
import Target from '@/assets/figma/main/38132.svg';
import Sneaker from '@/assets/figma/main/d4633.svg';
import Calendar from '@/assets/figma/main/21ddc.svg';
import Chevron from '@/assets/figma/main/7c632.svg';
import Clock from '@/assets/figma/main/ec0f6.svg';
import Barbell from '@/assets/figma/main/2ad95.svg';
import Energy from '@/assets/figma/main/28b8d.svg';
import Gym from '@/assets/figma/main/fca0e.svg';
import House from '@/assets/figma/main/5e1e4.svg';
import Run from '@/assets/figma/main/a72ff.svg';
import Arrow from '@/assets/figma/main/ab977.svg';
import { Text } from '@/src/components/common';
import {
  MainHeader,
  MainScreen,
  MainGradient,
  mainStyles,
} from '@/src/components/main/MainSurface';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { getProfile, getProfileName } from '@/src/api/home';
import { colors, fontFamilies } from '@/src/theme';

const heroImages = {
  loading: require('@/assets/figma/main/35e60.png'),
  'not-created': require('@/assets/figma/main/35e60.png'),
  ready: require('@/assets/figma/main/9e211.png'),
  completed: require('@/assets/figma/main/57a0c.png'),
};
const count = (value: number | null | undefined) => (value == null ? '—' : String(value));

export default function ExerciseScreen() {
  const router = useRouter();
  const {
    homeMetrics,
    homeError,
    homeLoadState,
    latestSession,
    refreshHome,
    resultRecordCompleted,
    routine,
    status,
    condition,
    setCondition,
  } = useExerciseRoutine();
  const [name, setName] = useState('회원');
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void refreshHome();
      void getProfile()
        .then((r) => {
          if (live) setName(getProfileName(r) ?? '회원');
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, [refreshHome]),
  );
  const state = status ?? 'loading';
  const current = homeMetrics.currentWeekWorkoutCount;
  const remaining = homeMetrics.remainingGoalWorkoutCount;
  const goal = homeMetrics.targetWorkoutCount;
  const percentage = homeMetrics.goalAchievementRate;
  const progress = Math.min(100, Math.max(0, percentage ?? 0));
  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const date = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const title =
    state === 'completed' ? (
      <>
        오늘 운동을{'\n'}
        <Text style={s.accent}>완료</Text>했어요!
      </>
    ) : state === 'ready' ? (
      <>
        오늘의 운동이{'\n'}
        <Text style={s.accent}>준비</Text>되었어요!
      </>
    ) : state === 'loading' ? (
      <>오늘의 운동을{'\n'}확인하고 있어요</>
    ) : (
      <>
        {name}님, 오늘은{'\n'}
        <Text style={s.accent}>어떤 운동</Text>을 해볼까요?
      </>
    );
  const action = () => {
    if (state === 'completed')
      router.push(
        resultRecordCompleted
          ? { pathname: '/exercise/ai-report', params: { source: 'home' } }
          : { pathname: '/exercise/result', params: { source: 'home' } },
      );
    else if (state === 'ready') router.push('/exercise/summary');
    else if (state !== 'loading') router.push('/exercise/condition');
  };
  return (
    <MainScreen>
      <MainHeader title="운동 추천" topColor={state === 'completed' ? '#413B71' : undefined}>
        {state === 'completed' && (
          <Image
            source={require('@/assets/figma/main/9ce91.png')}
            style={s.confetti}
            resizeMode="contain"
          />
        )}
        <Image source={heroImages[state]} style={s.heroImage} resizeMode="contain" />
        <Text style={s.heroTitle}>{title}</Text>
        <View style={s.headerBottom}>
          {state === 'not-created' || state === 'loading' ? (
            <View style={s.locations}>
              {(
                [
                  { value: 'gym', label: '헬스', Icon: Gym },
                  { value: 'home', label: '홈트', Icon: House },
                  { value: 'outdoor', label: '러닝', Icon: Run },
                ] as const
              ).map(({ value, label, Icon }) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: condition.location === value }}
                  onPress={() => setCondition({ ...condition, location: value })}
                  style={[s.chip, condition.location === value && s.selectedChip]}
                >
                  <Icon />
                  <Text style={[s.chipText, condition.location === value && s.selectedChipText]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={s.routineBadge}>
              <Text style={s.chipText}>
                {state === 'completed'
                  ? `${count(latestSession?.calories)} kcal · 운동 완료`
                  : `${routine?.title ?? '오늘의 루틴'} · ${count(routine?.totalDurationMinutes)}분`}
              </Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={state === 'loading'}
            onPress={action}
            style={[s.action, state === 'loading' && { opacity: 0.6 }]}
          >
            <MainGradient top={colors.primaryMedium} bottom={colors.primaryDark} radius={24} />
            <View style={s.arrow}>
              <Arrow />
            </View>
            <Text style={s.actionText}>
              {state === 'loading'
                ? '운동 정보 확인 중'
                : state === 'not-created'
                  ? '오늘 운동 추천받기'
                  : state === 'ready'
                    ? '운동 시작하기'
                    : '운동 결과 확인하기'}
            </Text>
          </Pressable>
        </View>
      </MainHeader>
      <View style={mainStyles.content}>
        {homeError && (
          <Pressable
            accessibilityRole="button"
            onPress={() => void refreshHome()}
            style={mainStyles.card}
          >
            <Text style={mainStyles.text}>{homeError} · 다시 시도</Text>
          </Pressable>
        )}
        <View style={s.section}>
          <View style={s.heading}>
            <Text style={s.sectionTitle}>이번 주 운동 목표</Text>
            <Text style={s.date}>
              {date(start)} ~ {date(end)}
            </Text>
          </View>
          <View style={s.heading}>
            <Text style={s.counter}>
              {count(current)}
              <Text style={s.unit}> / {count(goal)}회 완료</Text>
            </Text>
            <Text style={s.percent}>{percentage == null ? '—' : `${percentage}%`}</Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: progress }}
            style={s.track}
          >
            <View style={[s.fill, { width: `${progress}%` }]} />
          </View>
          <View style={[mainStyles.card, s.stats]}>
            <View style={s.stat}>
              <View style={s.icon}>
                <Fire />
              </View>
              <Text style={s.statLabel}>
                최장 연속 <Text style={s.value}>{count(homeMetrics.currentWorkoutStreakDays)}</Text>
                <Text style={s.small}>일째</Text>
              </Text>
            </View>
            <View style={s.divider} />
            <View style={s.stat}>
              <View style={s.icon}>
                <Target />
              </View>
              <Text style={s.statLabel}>
                {remaining === 0 ? '횟수 목표 ' : '목표까지 '}
                <Text style={s.value}>{remaining === 0 ? '달성!' : count(remaining)}</Text>
                <Text style={s.small}>{remaining === 0 ? '' : '회 남음'}</Text>
              </Text>
            </View>
          </View>
        </View>
        <View style={s.section}>
          <View style={s.heading}>
            <Text style={s.sectionTitle}>내 최근 루틴</Text>
            <Text style={s.date}>{latestSession?.date?.slice(0, 10) ?? ''}</Text>
          </View>
          {routine ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push(state === 'ready' ? '/exercise/summary' : '/exercise/history')
              }
              style={[mainStyles.card, s.recent]}
            >
              <Image
                source={
                  routine.exercises[0]?.thumbnailUrl
                    ? { uri: routine.exercises[0].thumbnailUrl }
                    : require('@/assets/figma/main/29ca1.png')
                }
                style={s.recentImage}
                resizeMode="cover"
              />
              <View style={s.recentBody}>
                <View style={s.heading}>
                  <Text numberOfLines={1} style={s.routineTitle}>
                    {routine.title}
                  </Text>
                  <Text style={s.manage}>{state === 'ready' ? '세부 관리 ›' : '기록 보기 ›'}</Text>
                </View>
                <View style={s.factors}>
                  <View style={s.factor}>
                    <Clock />
                    <Text style={s.small}>{count(routine.totalDurationMinutes)}분</Text>
                  </View>
                  <View style={s.factor}>
                    <Barbell />
                    <Text style={s.small}>{routine.exercises.length}종목</Text>
                  </View>
                  <View style={s.factor}>
                    <Energy />
                    <Text style={s.small}>{count(routine.estimatedCalories)}kcal</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={s.exercises}>
                  {routine.exercises.map((e) => e.name).join(', ')}
                </Text>
              </View>
            </Pressable>
          ) : (
            <View style={[mainStyles.card, mainStyles.empty]}>
              <Text style={mainStyles.text}>
                {homeLoadState === 'loading'
                  ? '운동 기록을 불러오는 중이에요.'
                  : '아직 추천받은 루틴이 없어요.'}
              </Text>
            </View>
          )}
        </View>
        <View style={{ gap: 5 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/exercise/history')}
            style={s.menu}
          >
            <View style={s.menuIcon}>
              <Sneaker />
            </View>
            <Text style={s.menuText}>운동 기록 확인</Text>
            <Chevron />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/exercise/goal')}
            style={s.menu}
          >
            <View style={s.menuIcon}>
              <Calendar />
            </View>
            <Text style={s.menuText}>운동 목표 설정</Text>
            <Chevron />
          </Pressable>
        </View>
      </View>
    </MainScreen>
  );
}
const s = StyleSheet.create({
  heroImage: { position: 'absolute', right: -13, top: -37, width: 170, height: 170 },
  confetti: {
    position: 'absolute',
    width: 442,
    height: 147,
    top: -112,
    left: -45,
    transform: [{ scaleY: -1 }],
  },
  heroTitle: {
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 24,
    lineHeight: 27,
    color: colors.textWhite,
    marginTop: 12,
    maxWidth: 260,
  },
  accent: { color: colors.primaryMedium },
  headerBottom: { marginTop: 'auto', gap: 10 },
  locations: { flexDirection: 'row', gap: 7 },
  chip: {
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 9,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  selectedChip: { backgroundColor: colors.primaryLight },
  chipText: {
    color: colors.primaryLight,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
  },
  selectedChipText: { color: colors.primary },
  routineBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: colors.primaryLight,
    padding: 9,
    maxWidth: '100%',
  },
  action: {
    height: 45,
    borderRadius: 24,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  arrow: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#FFF', fontFamily: fontFamilies.pretendardBold, fontSize: 20 },
  section: { gap: 15 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: fontFamilies.pretendardBold, fontSize: 22, color: colors.textBody },
  date: { fontFamily: fontFamilies.pretendardMedium, fontSize: 13, color: colors.textSecondary },
  counter: { fontFamily: fontFamilies.pretendardBold, fontSize: 30, color: colors.primary },
  unit: { fontFamily: fontFamilies.pretendardMedium, fontSize: 18, color: colors.textSecondary },
  percent: { fontSize: 18, color: colors.primary, fontFamily: fontFamilies.pretendardMedium },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  stats: {
    flexDirection: 'row',
    height: 80,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  icon: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    flexShrink: 1,
  },
  value: { fontSize: 24, color: colors.primary, fontFamily: fontFamilies.pretendardBold },
  small: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium },
  divider: { width: 1, height: 60, backgroundColor: colors.border, marginHorizontal: 10 },
  recent: { flexDirection: 'row', paddingHorizontal: 10, gap: 10 },
  recentImage: { width: 87, height: 87, borderRadius: 10, backgroundColor: colors.primaryLight },
  recentBody: { flex: 1, gap: 10 },
  routineTitle: {
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 18,
    color: colors.textBody,
    flex: 1,
  },
  manage: {
    fontSize: 13,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 15,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  factors: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' },
  factor: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exercises: {
    backgroundColor: colors.border,
    padding: 4,
    borderRadius: 5,
    fontSize: 14,
    color: colors.textSecondary,
  },
  menu: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    minHeight: 65,
    paddingHorizontal: 15,
    flexDirection: 'row',
    gap: 13,
    alignItems: 'center',
    boxShadow: '0px 0px 5px rgba(0,0,0,0.08)',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
    fontSize: 18,
    fontFamily: fontFamilies.pretendardSemiBold,
    color: colors.textBody,
  },
});
