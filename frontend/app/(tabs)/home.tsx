import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getHome, type HomeResponse } from '@/src/api/home';
import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import { getDietNutritionSummary } from '@/src/api/diet';
import { nutritionNumber, type NutritionSummary } from '@/src/features/nutritionSummary';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { getSupabaseClient } from '@/src/lib/supabase';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies } from '@/src/theme';

type LoadState = 'loading' | 'ready' | 'error';
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
  const router = useRouter();
  const { onboardingSkip } = useLocalSearchParams<{ onboardingSkip?: string }>();
  const insets = useSafeAreaInsets();
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [name, setName] = useState('회원');
  const [nutrition, setNutrition] = useState<NutritionSummary | null>(null);
  const [tier, setTier] = useState<HabitTierProgress | null>(null);
  const { homeMetrics, latestSession, refreshHome } = useExerciseRoutine();
  const today = new Date();
  const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoadState((current) => (current === 'ready' ? current : 'loading'));
      void getHabitTierProgress().then(({ progress }) => {
        if (active) setTier(progress);
      }).catch(() => undefined);
      void refreshHome();
      void getDietNutritionSummary(dateKey)
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
    }, [dateKey, refreshHome]),
  );

  const score = home?.health_score.score;
  const hasScore = score !== null && score !== undefined;
  const isInitialLoading = loadState === 'loading' && home === null;
  const isInitialError = loadState === 'error' && home === null;
  const showGettingStarted = onboardingSkip === '1' && loadState === 'ready' && !hasScore;
  const dateLabel = String(today.getMonth() + 1) + '월 ' + String(today.getDate()) + '일';
  const consumed = nutritionNumber(nutrition?.calories.consumed);
  const calorieTarget = nutritionNumber(nutrition?.calories.target);
  const calorieRatio = consumed !== null && calorieTarget && calorieTarget > 0
    ? Math.min(100, (consumed / calorieTarget) * 100)
    : 0;
  const latestDate = latestSession?.date ? new Date(latestSession.date) : null;
  const exercisedToday = latestSession?.completed && latestDate && !Number.isNaN(latestDate.getTime()) && latestDate.toDateString() === today.toDateString();
  const weeklyCount = homeMetrics.currentWeekWorkoutCount;
  const weeklyTarget = homeMetrics.targetWorkoutCount;
  const weeklyRatio = weeklyCount !== null && weeklyTarget !== null && weeklyTarget > 0
    ? Math.min(100, (weeklyCount / weeklyTarget) * 100)
    : 0;

  return (
    <View style={[styles.root, isDark && dark.root]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={[styles.content, simple && simpleStyles.content, { paddingTop: insets.top + 14 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text accessibilityLabel="autofit" style={[styles.wordmark, isDark && dark.text]}>
            auto<Text style={styles.accent}>fit</Text>
          </Text>
          <SimpleReadButton text={`${name}님, 반가워요. ${tier ? `현재 티어는 ${tier.tier_name} ${tier.sublevel}입니다.` : ''} 오늘 식단과 운동을 확인하고 기록해 보세요.`} />
        </View>
        <Text style={styles.date}>{dateLabel}</Text>
        {!isInitialLoading ? <Text style={[styles.greeting, simple && simpleStyles.greeting, isDark && dark.text]}>{name}님, 반가워요</Text> : null}
        {isInitialLoading ? (
          <View style={[styles.initialLoading, isDark && dark.card]}>
            <ActivityIndicator color="#503DD7" />
            <Text style={styles.initialLoadingText}>홈 정보를 불러오는 중이에요</Text>
          </View>
        ) : isInitialError ? (
          <View style={[styles.initialLoading, isDark && dark.card]}>
            <Text style={styles.initialLoadingText}>홈 정보를 불러오지 못했어요.</Text>
            <Text style={styles.initialLoadingText}>잠시 후 홈 탭을 다시 열어 주세요.</Text>
          </View>
        ) : !showGettingStarted ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => router.push('/tier')} style={[styles.overviewTier, simple && simpleStyles.card, isDark && dark.card]}>
              <View style={styles.overviewTierTop}>
                <View style={styles.overviewBadge}><Text style={styles.overviewBadgeText}>◇</Text></View>
                <View style={styles.overviewTierCopy}>
                  <Text style={[styles.overviewTierTitle, simple && simpleStyles.cardTitle, isDark && dark.text]}>{tier ? `${tier.tier_name} ${tier.sublevel}` : '건강관리 티어 확인하기'}</Text>
                  <Text style={styles.overviewTierDetail}>{tier ? `누적 활동 ${tier.points.toLocaleString()}P` : '내 활동 점수 보기'}</Text>
                </View>
                <Text style={styles.overviewChevron}>›</Text>
              </View>
              <View style={styles.overviewTierLine} />
              <Text style={styles.overviewTierFoot}>식사와 운동 등 완료한 활동으로 티어 점수가 쌓여요.</Text>
            </Pressable>
            <View style={[styles.overviewStats, simple && simpleStyles.column]}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/diet')} style={[styles.overviewStatCard, simple && simpleStyles.statCard, isDark && dark.card]}>
                <Text style={[styles.overviewStatLabel, simple && simpleStyles.statLabel]}>오늘 식단</Text>
                <Text style={[styles.overviewStatValue, isDark && dark.text]}>{consumed === null ? '—' : Math.round(consumed).toLocaleString('ko-KR')}<Text style={styles.overviewStatUnit}> {calorieTarget === null ? 'kcal' : `/ ${Math.round(calorieTarget).toLocaleString('ko-KR')} kcal`}</Text></Text>
                <View style={styles.overviewTrack}><View style={[styles.overviewFill, { width: `${calorieRatio}%` }]} /></View>
                <Text style={styles.overviewStatHint}>{consumed === null ? '식사 기록을 시작해 보세요' : '기록한 식사의 열량'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push('/exercise')} style={[styles.overviewStatCard, simple && simpleStyles.statCard, isDark && dark.card]}>
                <Text style={[styles.overviewStatLabel, simple && simpleStyles.statLabel]}>오늘 운동</Text>
                <Text style={[styles.overviewStatValue, isDark && dark.text]}>{exercisedToday ? latestSession.durationMinutes ?? '—' : '—'}<Text style={styles.overviewStatUnit}> 분</Text></Text>
                <Text style={styles.overviewStatHint}>{exercisedToday ? '오늘 운동을 완료했어요' : '완료한 운동 기록이 없어요'}</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/exercise')} style={[styles.weeklyCard, simple && simpleStyles.card, isDark && dark.card]}>
              <View style={styles.weeklyHeading}>
                <Text style={[styles.weeklyTitle, isDark && dark.text]}>이번 주 운동</Text>
                <Text style={styles.weeklyCount}>{weeklyCount ?? '—'} / {weeklyTarget ?? '—'}회</Text>
              </View>
              <View style={styles.overviewTrack}><View style={[styles.overviewFill, { width: `${weeklyRatio}%` }]} /></View>
              <Text style={styles.weeklyHint}>{weeklyTarget === null ? '운동 목표를 설정해 보세요' : '꾸준한 운동으로 목표를 채워 보세요'} ›</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push(hasScore ? '/total-analysis' : '/upload')} style={[styles.analysisShortcut, isDark && dark.card]}>
              <Text style={[styles.analysisShortcutTitle, isDark && dark.text]}>{hasScore ? '내 건강 분석 보기' : '건강 데이터 올리기'}</Text>
              <Text style={styles.analysisShortcutDetail}>{hasScore ? '점수 변화와 맞춤 건강 제안을 확인해요' : '건강검진이나 인바디 결과를 올려 맞춤 분석을 시작해요'}</Text>
              <Text style={styles.overviewChevron}>›</Text>
            </Pressable>
          </>
        ) : (
          <>
        <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle, isDark && dark.text]}>오늘 시작해 보기</Text>
        <View style={[styles.tasks, isDark && dark.card]}>
          <TaskRow
            icon="◉"
            title="오늘 운동 추천 받기"
            subtitle="시간과 장소만 고르면 돼요"
            onPress={() => router.push('/exercise/condition')}
          />
          <TaskRow
            icon="♧"
            title="첫 끼니 기록하기"
            subtitle="사진 한 장이면 기록해 드려요"
            onPress={() => router.push('/diet')}
          />
          <TaskRow
            icon="♧"
            title="커뮤니티 둘러보기"
            subtitle="운동·식단 궁금한 걸 함께 나눠요"
            onPress={() => router.push('/community')}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/tier')}
          style={[styles.tierCard, simple && simpleStyles.card, isDark && dark.card]}
        >
          <View style={styles.tierBadge}>
            <Text style={styles.tierBadgeText}>◇</Text>
          </View>
          <View style={styles.tierCopy}>
            <Text style={[styles.tierTitle, isDark && dark.text]}>나의 건강관리 티어</Text>
            <Text style={styles.tierDescription}>{tier ? `${tier.tier_name} ${tier.sublevel} · ${tier.points.toLocaleString()}P` : '티어 기준과 진행 상태를 살펴보세요'}</Text>
          </View>
          <Text style={styles.tierLink}>티어 보기 ›</Text>
        </Pressable>
        <View style={[styles.healthCard, simple && simpleStyles.card, isDark && dark.card]}>
          <Text style={[styles.cardTitle, isDark && dark.text]}>건강 점수와 종합 분석</Text>
          <Text style={styles.cardDescription}>건강검진 결과나 인바디 결과지를 올리면 내 몸 상태를 함께 분석해 드려요.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(hasScore ? '/total-analysis' : '/upload')}
            style={styles.healthAction}
          >
            <Text style={styles.healthActionText}>{hasScore ? '분석 보기' : '자료 올리기'}</Text>
          </Pressable>
        </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TaskRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.task, simple && simpleStyles.task, pressed && styles.pressed]}
    >
      <View style={styles.taskIcon}>
        <Text style={styles.taskIconText}>{icon}</Text>
      </View>
      <View style={styles.taskCopy}>
        <Text style={[styles.taskTitle, simple && simpleStyles.taskTitle, isDark && dark.text]}>{title}</Text>
        <Text style={[styles.taskSubtitle, simple && simpleStyles.taskSubtitle]}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#FFFFFF', flex: 1 },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  content: {
    alignSelf: 'center',
    paddingBottom: 110,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 412,
  },
  initialLoading: {
    alignItems: 'center',
    backgroundColor: '#FAFAFB',
    borderRadius: 16,
    gap: 14,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 180,
  },
  initialLoadingText: { color: '#777780', fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
  wordmark: {
    color: '#18181C',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 25,
    letterSpacing: -1.3,
  },
  accent: { color: '#503DD7' },
  date: { color: '#9999A1', fontSize: 12, marginTop: 22 },
  greeting: {
    color: '#222227',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 22,
    marginTop: 5,
  },
  overviewTier: { backgroundColor: '#F8F7FF', borderColor: '#E9E6F5', borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 16 },
  overviewTierTop: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  overviewBadge: { alignItems: 'center', backgroundColor: '#E8E1FF', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  overviewBadgeText: { color: '#6955CD', fontSize: 24 },
  overviewTierCopy: { flex: 1, gap: 4 },
  overviewTierTitle: { color: '#34303F', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  overviewTierDetail: { color: '#8F8A9B', fontSize: 11 },
  overviewChevron: { color: '#8B86A0', fontSize: 22 },
  overviewTierLine: { backgroundColor: '#DCD5FA', borderRadius: 3, height: 5, marginTop: 15 },
  overviewTierFoot: { color: '#8F8A9B', fontSize: 11, marginTop: 9 },
  overviewStats: { flexDirection: 'row', gap: 10, marginTop: 16 },
  overviewStatCard: { backgroundColor: '#FFFFFF', borderColor: '#EAE9EE', borderRadius: 14, borderWidth: 1, flex: 1, gap: 8, minHeight: 126, padding: 13 },
  overviewStatLabel: { color: '#8F8D98', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  overviewStatValue: { color: '#29272F', fontFamily: fontFamilies.pretendardBold, fontSize: 19 },
  overviewStatUnit: { color: '#96939F', fontFamily: fontFamilies.pretendardRegular, fontSize: 10 },
  overviewStatHint: { color: '#9996A1', fontSize: 10, lineHeight: 14 },
  overviewTrack: { backgroundColor: '#EBE8F6', borderRadius: 4, height: 5, overflow: 'hidden' },
  overviewFill: { backgroundColor: '#7765DF', borderRadius: 4, height: 5 },
  weeklyCard: { borderColor: '#EAE9EE', borderRadius: 14, borderWidth: 1, gap: 14, marginTop: 16, padding: 16 },
  weeklyHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  weeklyTitle: { color: '#33313A', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15 },
  weeklyCount: { color: '#6955CD', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  weeklyHint: { color: '#8D8997', fontSize: 11 },
  analysisShortcut: { alignItems: 'center', borderColor: '#EAE9EE', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 14, padding: 15 },
  analysisShortcutTitle: { color: '#36333F', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  analysisShortcutDetail: { color: '#9A97A0', flex: 1, fontSize: 10 },
  sectionTitle: {
    color: '#222227',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    marginBottom: 9,
    marginTop: 22,
  },
  count: { color: '#777780', fontSize: 12 },
  tasks: { borderColor: '#E8E8ED', borderRadius: 11, borderWidth: 1, overflow: 'hidden' },
  task: {
    alignItems: 'center',
    borderBottomColor: '#F0F0F2',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: 12,
  },
  taskIcon: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    height: 33,
    justifyContent: 'center',
    width: 33,
  },
  taskIconText: { color: '#777780', fontSize: 17 },
  taskCopy: { flex: 1, gap: 4, marginLeft: 10 },
  taskTitle: { color: '#333339', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  taskSubtitle: { color: '#9999A1', fontSize: 10 },
  chevron: { color: '#9999A1', fontSize: 22 },
  tierCard: {
    alignItems: 'center',
    backgroundColor: '#FAFAFB',
    borderColor: '#E8E8ED',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 78,
    marginTop: 15,
    paddingHorizontal: 12,
  },
  tierBadge: {
    alignItems: 'center',
    backgroundColor: '#EFF1EB',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  tierBadgeText: { color: '#6D8A67', fontSize: 22 },
  tierCopy: { flex: 1, gap: 4, marginLeft: 10 },
  tierTitle: { color: '#333339', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  tierDescription: { color: '#9999A1', fontSize: 10 },
  tierLink: { color: '#55555D', fontSize: 11 },
  healthCard: {
    backgroundColor: '#FAFAFB',
    borderColor: '#E8E8ED',
    borderRadius: 11,
    borderWidth: 1,
    marginTop: 15,
    minHeight: 155,
    padding: 17,
  },
  cardTitle: { color: '#333339', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15 },
  cardDescription: { color: '#777780', fontSize: 12, lineHeight: 18, marginTop: 10 },
  score: { color: '#503DD7', fontFamily: fontFamilies.pretendardBold, fontSize: 30, marginTop: 7 },
  scoreUnit: { color: '#9999A1', fontSize: 12 },
  healthAction: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#DADAE1',
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 13,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  healthActionText: { color: '#55555D', fontSize: 11 },
  pressed: { opacity: 0.7 },
});

const simpleStyles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  greeting: { fontSize: 28 },
  column: { flexDirection: 'column' },
  card: { minHeight: 82, padding: 20 },
  cardTitle: { fontSize: 18 },
  statCard: { flex: 0, minHeight: 100, padding: 18 },
  statLabel: { fontSize: 17 },
  sectionTitle: { fontSize: 20 },
  task: { minHeight: 82, paddingHorizontal: 16 },
  taskTitle: { fontSize: 17 },
  taskSubtitle: { fontSize: 13, lineHeight: 19 },
});

const dark = StyleSheet.create({
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
});
