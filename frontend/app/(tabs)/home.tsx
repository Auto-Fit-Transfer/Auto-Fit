import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AutofitWordmark from '@/assets/icons/autofit-wordmark.svg';
import AutofitWordmarkDark from '@/assets/icons/autofit-wordmark-dark.svg';
import CheckIcon from '@/assets/icons/system/Check.svg';
import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import BellIcon from '@/assets/icons/ui/bell.svg';
import ChatsIcon from '@/assets/icons/ui/chats-circle.svg';
import ForkKnifeIcon from '@/assets/icons/ui/fork-knife.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { getHome, type HomeResponse } from '@/src/api/home';
import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import { getDietNutritionSummary } from '@/src/api/diet';
import { nutritionNumber, type NutritionSummary } from '@/src/features/nutritionSummary';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { CHAT_CHARACTER_KEY, chatCharacters } from '@/src/features/chat/chatCharacters';
import { localDayKey, useWeekWorkouts } from '@/src/features/exercise/useWeekWorkouts';
import { darkTierColors, nextTierName, tierBadges, tierColors } from '@/src/features/tier/tierBadges';
import { getSupabaseClient } from '@/src/lib/supabase';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

type LoadState = 'loading' | 'ready' | 'error';
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
async function getSessionName() {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    const metadata = data.session?.user.user_metadata;
    const name = metadata?.full_name ?? metadata?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { onboardingSkip } = useLocalSearchParams<{ onboardingSkip?: string }>();
  const insets = useSafeAreaInsets();
  const { preferences, isDark } = useDisplayPreferences();
  const Wordmark = isDark ? AutofitWordmarkDark : AutofitWordmark;
  const simple = preferences.simple_mode_enabled;
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [name, setName] = useState('회원');
  const [nutrition, setNutrition] = useState<NutritionSummary | null>(null);
  const [tier, setTier] = useState<HabitTierProgress | null>(null);
  const { days: workoutDays, minutes: weekMinutes } = useWeekWorkouts();
  const [characterName, setCharacterName] = useState<string>(chatCharacters[0].name);
  const { homeMetrics, latestSession, refreshHome, routine, status } = useExerciseRoutine();
  const today = new Date();
  const dateKey = localDayKey(today);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));

  useEffect(() => {
    void AsyncStorage.getItem(CHAT_CHARACTER_KEY).then((id) => {
      const found = chatCharacters.find((character) => character.id === id);
      if (found) setCharacterName(found.name);
    }).catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoadState((current) => (current === 'ready' ? current : 'loading'));
      void getHabitTierProgress().then(({ progress }) => {
        if (active) setTier(progress);
      }).catch(() => undefined);
      void refreshHome();
      void getDietNutritionSummary(localDayKey(new Date()))
        .then((response) => {
          if (active) setNutrition(response.summary);
        })
        .catch(() => undefined);
      void getHome()
        .then(async (response) => {
          if (!active) return;
          setHome(response);
          const resolvedName = response.user_name.trim() || (await getSessionName()) || '회원';
          if (!active) return;
          setName(resolvedName);
          setLoadState('ready');
        })
        .catch(async () => {
          if (!active) return;
          const resolvedName = (await getSessionName()) || '회원';
          if (!active) return;
          setName((current) => current === '회원' ? resolvedName : current);
          setLoadState('error');
        });
      return () => {
        active = false;
      };
    }, [refreshHome]),
  );

  const score = home?.health_score.score;
  const hasScore = score !== null && score !== undefined;
  const isInitialLoading = loadState === 'loading' && home === null;
  const isInitialError = loadState === 'error' && home === null;
  const showGettingStarted = onboardingSkip === '1' && loadState === 'ready' && !hasScore;
  const dateLabel = `${today.getMonth() + 1}월 ${today.getDate()}일 ${weekdays[today.getDay()]}요일`;
  const consumed = nutritionNumber(nutrition?.calories.consumed);
  const calorieTarget = nutritionNumber(nutrition?.calories.target);
  const calorieRatio = consumed !== null && calorieTarget && calorieTarget > 0
    ? Math.min(100, (consumed / calorieTarget) * 100)
    : 0;
  const latestDate = latestSession?.date ? new Date(latestSession.date) : null;
  const exercisedToday = latestSession?.completed && latestDate && !Number.isNaN(latestDate.getTime()) && latestDate.toDateString() === today.toDateString();
  const weeklyCount = homeMetrics.currentWeekWorkoutCount;
  const weeklyTarget = homeMetrics.targetWorkoutCount;
  const weeklyLeft = weeklyCount !== null && weeklyTarget !== null ? Math.max(0, weeklyTarget - weeklyCount) : null;
  const scoreChange = home?.score_change.change;
  const tierRatio = tier && tier.next_level_points !== null && tier.next_level_points > tier.level_start_points
    ? Math.min(100, Math.max(0, ((tier.points - tier.level_start_points) / (tier.next_level_points - tier.level_start_points)) * 100))
    : tier ? 100 : 0;
  const Badge = tierBadges[tier?.tier_code ?? 'CORE'];
  const nextName = tier ? nextTierName(tier) : null;
  const nextLabel = tier && nextName ? `${nextName}까지 ${Math.max(0, (tier.next_level_points ?? 0) - tier.points)}점` : null;
  const caloriesLeft = consumed !== null && calorieTarget !== null ? calorieTarget - consumed : null;
  const todayMinutes = exercisedToday ? Math.round(latestSession.durationMinutes ?? 0) : 0;
  // The context keeps the last recommendation even when it was made on an earlier day.
  const plannedMinutes = status === 'not-created' ? null : routine?.totalDurationMinutes ?? null;
  const exerciseRatio = plannedMinutes ? Math.min(100, (todayMinutes / plannedMinutes) * 100) : 0;

  return (
    <View style={[styles.root, isDark && dark.root]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={[styles.content, simple && simpleStyles.content, { paddingTop: insets.top + 14 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Wordmark accessibilityLabel="autofit" height={24} width={88} />
          <View style={styles.headerActions}>
            <SimpleReadButton text={`${name}님, 반가워요. ${tier ? `현재 티어는 ${tier.tier_name} ${tier.sublevel}입니다.` : ''} 오늘 식단과 운동을 확인하고 기록해 보세요.`} />
            <Pressable accessibilityLabel="알림" accessibilityRole="button" hitSlop={10} onPress={() => router.push('/community/notifications')}>
              <BellIcon color={isDark ? darkColors.textPrimary : colors.textPrimary} height={24} width={24} />
            </Pressable>
          </View>
        </View>
        <Text style={[styles.date, isDark && dark.secondary]}>{dateLabel}</Text>
        {!isInitialLoading ? <Text style={[styles.greeting, simple && simpleStyles.greeting, isDark && dark.text]}>{name}님, 반가워요</Text> : null}
        {isInitialLoading ? (
          <View style={[styles.initialLoading, isDark && dark.card]}>
            <ActivityIndicator color={colors.primaryText} />
            <Text style={styles.initialLoadingText}>홈 정보를 불러오는 중이에요</Text>
          </View>
        ) : isInitialError ? (
          <View style={[styles.initialLoading, isDark && dark.card]}>
            <Text style={styles.initialLoadingText}>홈 정보를 불러오지 못했어요.</Text>
            <Text style={styles.initialLoadingText}>잠시 후 홈 탭을 다시 열어 주세요.</Text>
          </View>
        ) : !showGettingStarted ? (
          <>
            <View style={[styles.box, styles.tierBox, simple && simpleStyles.card, isDark && dark.card]}>
              <View style={styles.tierTop}>
                <Badge height={48} width={48} />
                <View style={styles.tierCopy}>
                  <Text style={[styles.tierName, simple && simpleStyles.cardTitle, isDark && dark.text]}>{tier ? `${tier.tier_name} ${tier.sublevel}` : '건강관리 티어'}</Text>
                  <Text style={[styles.tierDetail, isDark && dark.secondary]}>
                    {hasScore ? <Text style={styles.tierScore}>건강 점수 {score}</Text> : tier ? `누적 활동 ${tier.points.toLocaleString()}P` : '내 활동 점수 보기'}
                    {hasScore && scoreChange ? ` · 지난번보다 ${scoreChange > 0 ? '+' : ''}${scoreChange}` : ''}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => router.push('/tier')} style={[styles.smallButton, isDark && dark.card]}>
                  <Text style={[styles.smallButtonText, isDark && dark.text]}>내 티어</Text>
                </Pressable>
              </View>
              <View style={[styles.tierTrack, isDark && dark.track]}><View style={[styles.tierFill, { backgroundColor: (isDark ? darkTierColors : tierColors)[tier?.tier_code ?? 'CORE'], width: `${tierRatio}%` }]} /></View>
              <View style={styles.spread}>
                <Text style={[styles.muted, isDark && dark.secondary]}>{tier ? `${tier.tier_name} ${tier.sublevel}` : ''}</Text>
                {nextLabel ? <Text style={[styles.tierNext, isDark && dark.text]}>{nextLabel}</Text> : null}
              </View>
            </View>
            <View style={[styles.stats, simple && simpleStyles.column]}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/diet')} style={[styles.box, styles.stat, simple && simpleStyles.statCard, isDark && dark.card]}>
                <Text style={[styles.muted, simple && simpleStyles.statLabel, isDark && dark.secondary]}>오늘 식단</Text>
                <Text style={[styles.statValue, isDark && dark.text]}>{consumed === null ? '—' : Math.round(consumed).toLocaleString('ko-KR')}<Text style={[styles.unit, isDark && dark.secondary]}> {calorieTarget === null ? 'kcal' : `/ ${Math.round(calorieTarget).toLocaleString('ko-KR')} kcal`}</Text></Text>
                <View style={[styles.track, isDark && dark.track]}><View style={[styles.fill, { width: `${calorieRatio}%` }]} /></View>
                <Text style={[styles.hint, isDark && dark.secondary]}>{caloriesLeft === null ? '식사 기록을 시작해 보세요' : caloriesLeft >= 0 ? `${Math.round(caloriesLeft).toLocaleString('ko-KR')}kcal 더 먹어도 돼요` : `${Math.round(-caloriesLeft).toLocaleString('ko-KR')}kcal 넘었어요`}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push('/exercise')} style={[styles.box, styles.stat, simple && simpleStyles.statCard, isDark && dark.card]}>
                <Text style={[styles.muted, simple && simpleStyles.statLabel, isDark && dark.secondary]}>오늘 운동</Text>
                <Text style={[styles.statValue, isDark && dark.text]}>{todayMinutes}<Text style={[styles.unit, isDark && dark.secondary]}> {plannedMinutes ? `/ ${plannedMinutes}분` : '분'}</Text></Text>
                <View style={[styles.track, isDark && dark.track]}><View style={[styles.fill, { width: `${exerciseRatio}%` }]} /></View>
                <Text style={[styles.hint, isDark && dark.secondary]}>{exercisedToday ? '오늘 운동을 완료했어요' : plannedMinutes ? `추천 운동 ${plannedMinutes}분 준비됨` : '오늘의 운동을 추천받아 보세요'}</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/exercise')} style={[styles.box, styles.weekBox, simple && simpleStyles.card, isDark && dark.card]}>
              <View style={styles.spread}>
                <Text style={[styles.boxTitle, isDark && dark.text]}>이번 주 운동</Text>
                <Text style={[styles.boxTitle, isDark && dark.text]}>{weeklyCount ?? '—'} / {weeklyTarget ?? '—'}회</Text>
              </View>
              <View style={styles.weekRow}>
                {week.map((day) => {
                  const key = localDayKey(day);
                  const done = workoutDays.includes(key);
                  const isToday = key === dateKey;
                  return (
                    <View key={key} style={styles.weekDay}>
                      <View style={[styles.dot, done && styles.dotDone, isToday && !done && styles.dotToday, isDark && !done && dark.card]}>
                        {done ? <CheckIcon color="#FFFFFF" height={16} width={16} /> : null}
                      </View>
                      <Text style={[isToday ? styles.dayToday : styles.muted, isDark && dark.secondary]}>{weekdays[day.getDay()]}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.hint, isDark && dark.secondary]}>
                이번 주 {weekMinutes}분 운동{weeklyLeft === null ? '' : weeklyLeft > 0 ? ` · 목표까지 ${weeklyLeft}회` : ' · 목표 달성'}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/chat')} style={[styles.box, styles.chatRow, isDark && dark.card]}>
              <View style={[styles.rowIcon, isDark && dark.card]}><ChatsIcon color={isDark ? darkColors.textPrimary : colors.textPrimary} height={22} width={22} /></View>
              <View style={styles.tierCopy}>
                <Text style={[styles.rowTitle, isDark && dark.text]}>{characterName}에게 물어보기</Text>
                <Text style={[styles.muted, isDark && dark.secondary]}>점수가 왜 바뀌었는지, 오늘 뭐 먹을지</Text>
              </View>
              <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle, isDark && dark.text]}>오늘 할 일</Text>
              <Text style={[styles.muted, isDark && dark.secondary]}>3개</Text>
            </View>
            <View style={[styles.box, styles.tasks, isDark && dark.card]}>
              <TaskRow Icon={BarbellIcon} onPress={() => router.push('/exercise/condition')} subtitle="시간과 장소만 고르면 돼요" title="오늘 운동 추천 받기" />
              <TaskRow Icon={ForkKnifeIcon} onPress={() => router.push('/diet')} subtitle="사진 한 장이면 칼로리를 알려 드려요" title="첫 끼니 기록하기" />
              <TaskRow Icon={ChatsIcon} onPress={() => router.push('/chat')} subtitle="운동 · 식단 궁금한 걸 편하게" title={`${characterName}에게 물어보기`} />
            </View>
            <View style={[styles.box, styles.startTier, simple && simpleStyles.card, isDark && dark.card]}>
              <Badge height={48} width={48} />
              <View style={styles.tierCopy}>
                <Text style={[styles.rowTitleBold, isDark && dark.text]}>{tier ? `${tier.tier_name} ${tier.sublevel}부터 시작해요` : '티어를 시작해요'}</Text>
                <Text style={[styles.muted, isDark && dark.secondary]}>오늘 할 일을 마치면 티어 점수가 쌓여요</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push('/tier')} style={[styles.smallButton, isDark && dark.card]}>
                <Text style={[styles.smallButtonText, isDark && dark.text]}>티어 보기</Text>
              </Pressable>
            </View>
            <View style={[styles.box, styles.healthBox, simple && simpleStyles.card, isDark && dark.card]}>
              <Text style={[styles.rowTitleBold, isDark && dark.text]}>건강 점수와 종합 분석</Text>
              <Text style={[styles.healthText, isDark && dark.secondary]}>건강검진 결과와 인바디 결과지를 올리면 내 몸 상태를 한눈에 보여 드려요.</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push(hasScore ? '/total-analysis' : '/upload')} style={[styles.smallButton, styles.healthButton, isDark && dark.card]}>
                <Text style={[styles.smallButtonText, isDark && dark.text]}>{hasScore ? '분석 보기' : '자료 올리기'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TaskRow({
  Icon,
  title,
  subtitle,
  onPress,
}: {
  Icon: typeof BarbellIcon;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.task, simple && simpleStyles.task, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, isDark && dark.card]}><Icon color={isDark ? darkColors.textPrimary : colors.textPrimary} height={22} width={22} /></View>
      <View style={styles.tierCopy}>
        <Text style={[styles.rowTitle, simple && simpleStyles.taskTitle, isDark && dark.text]}>{title}</Text>
        <Text style={[styles.muted, simple && simpleStyles.taskSubtitle, isDark && dark.secondary]}>{subtitle}</Text>
      </View>
      <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { paddingBottom: 110, paddingHorizontal: 20, width: '100%' },
    headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
    headerActions: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    date: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 12 },
    greeting: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30, marginTop: 4 },
    initialLoading: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, gap: 14, justifyContent: 'center', marginTop: 24, minHeight: 180 },
    initialLoadingText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    box: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1 },
    tierBox: { gap: 12, marginTop: 16, padding: 16 },
    tierTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    tierCopy: { flex: 1, gap: 2, minWidth: 0 },
    tierName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 25 },
    tierDetail: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    tierScore: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium },
    tierNext: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21 },
    tierTrack: { backgroundColor: colors.surfaceMuted, borderRadius: 4, height: 8, overflow: 'hidden' },
    tierFill: { borderRadius: 4, height: 8 },
    smallButton: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 12 },
    smallButtonText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    spread: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    muted: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    stats: { flexDirection: 'row', gap: 12, marginTop: 16 },
    stat: { flex: 1, gap: 8, minHeight: 136, padding: 16 },
    statValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30 },
    unit: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 14 },
    track: { backgroundColor: colors.gaugeTrack, borderRadius: 3, height: 6, overflow: 'hidden' },
    fill: { backgroundColor: colors.primary, borderRadius: 3, height: 6 },
    hint: { color: colors.textBody, fontSize: 14, lineHeight: 21 },
    weekBox: { gap: 14, marginTop: 16, padding: 18 },
    boxTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
    weekDay: { alignItems: 'center', gap: 6 },
    dot: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
    dotDone: { backgroundColor: colors.tabBar, borderColor: colors.textPrimary },
    dotToday: { borderColor: colors.textPrimary },
    dayToday: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21 },
    chatRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 16, minHeight: 70, paddingHorizontal: 16 },
    rowIcon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
    rowTitle: { color: colors.textPrimary, fontSize: 16, lineHeight: 24 },
    rowTitleBold: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 24 },
    sectionTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
    tasks: { overflow: 'hidden' },
    task: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64, paddingHorizontal: 16 },
    startTier: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 24, padding: 16 },
    healthBox: { alignItems: 'flex-start', gap: 8, marginTop: 16, padding: 20 },
    healthText: { color: colors.textBody, fontSize: 14, lineHeight: 21 },
    healthButton: { height: 44, marginTop: 8 },
    pressed: { opacity: 0.75 },
  } as const;
}

const simpleStyles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  greeting: {},
  column: { flexDirection: 'column' },
  card: { minHeight: 82, padding: 20 },
  cardTitle: {},
  statCard: { flex: 0, minHeight: 100, padding: 18 },
  statLabel: {},
  sectionTitle: {},
  task: { minHeight: 82, paddingHorizontal: 16 },
  taskTitle: {},
  taskSubtitle: {},
});

const dark = StyleSheet.create({
  track: { backgroundColor: darkColors.border },
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
  secondary: { color: darkColors.textSecondary },
});
