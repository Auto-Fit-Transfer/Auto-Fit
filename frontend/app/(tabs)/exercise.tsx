import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { BOTTOM_NAVIGATION_MIN_BOTTOM_GAP, getBottomNavigationVisualHeight } from '@/src/components/navigation';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies } from '@/src/theme';

const purple = '#503DD7';
const ink = '#1E1D24';
const muted = '#777681';
const border = '#E4E5EB';
const value = (number: number | null | undefined, suffix = '') =>
  number == null ? '—' : `${number}${suffix}`;

function MenuRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.menuRow, simple && simpleStyles.menuRow]}>
      <View style={styles.menuIcon}><Text style={styles.menuIconText}>◈</Text></View>
      <View style={styles.menuCopy}>
        <Text style={[styles.menuTitle, simple && simpleStyles.menuTitle, isDark && dark.text]}>{title}</Text>
        <Text style={[styles.menuDetail, simple && simpleStyles.menuDetail]}>{detail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function ExerciseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const navigationHeight = simple
    ? Math.max(82, getBottomNavigationVisualHeight(windowHeight))
    : getBottomNavigationVisualHeight(windowHeight);
  const bottomPadding = navigationHeight + Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP) + 24;
  const {
    homeError, homeLoadState, homeMetrics, latestSession, refreshHome,
    resultRecordCompleted, routine, status,
  } = useExerciseRoutine();

  useFocusEffect(useCallback(() => { void refreshHome(); }, [refreshHome]));

  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const day = (date: Date) => `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`;
  const progress = Math.min(100, Math.max(0, homeMetrics.goalAchievementRate ?? 0));
  const mainAction = () => {
    if (status === 'completed') {
      router.push(resultRecordCompleted ? '/exercise/ai-report' : '/exercise/completion');
    } else if (status === 'ready') {
      router.push('/exercise/summary');
    } else {
      router.push('/exercise/condition');
    }
  };

  return (
    <View style={[styles.root, isDark && dark.root]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={[styles.content, simple && simpleStyles.content, { paddingTop: insets.top + 16, paddingBottom: bottomPadding }]} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}><Text style={[styles.pageTitle, simple && simpleStyles.pageTitle, isDark && dark.text]}>운동</Text><SimpleReadButton text={`오늘의 운동입니다. ${status === 'completed' ? '오늘 운동을 마쳤어요.' : routine?.title ?? '오늘의 맞춤 운동을 준비해요.'} 이번 주 운동은 ${value(homeMetrics.currentWeekWorkoutCount)}회 완료했고 목표는 ${value(homeMetrics.targetWorkoutCount)}회입니다.`} /></View>
        <View style={[styles.card, simple && simpleStyles.card, isDark && dark.card]}>
          <Text style={styles.eyebrow}>오늘의 운동</Text>
          <Text style={[styles.heroTitle, simple && simpleStyles.heroTitle, isDark && dark.text]}>
            {status === 'completed' ? '오늘 운동을 마쳤어요' : routine?.title ?? '오늘의 맞춤 운동을 준비해요'}
          </Text>
          <Text style={[styles.heroMeta, simple && simpleStyles.heroMeta]}>
            {status === 'completed'
              ? `${value(latestSession?.durationMinutes, '분')} · ${value(latestSession?.itemCount, '개 운동')} · ${value(latestSession?.calories, 'kcal')}`
              : routine
                ? `${value(routine.totalDurationMinutes, '분')} · ${routine.exercises.length}개 운동 · ${value(routine.estimatedCalories, 'kcal')}`
                : '오늘의 시간과 컨디션에 맞춰 추천받으세요'}
          </Text>
          <Pressable accessibilityRole="button" disabled={homeLoadState === 'loading'} onPress={mainAction} style={[styles.primaryButton, simple && simpleStyles.primaryButton, homeLoadState === 'loading' && styles.disabled]}>
            <Text style={[styles.primaryText, simple && simpleStyles.primaryText]}>
              {homeLoadState === 'loading' ? '운동 정보 확인 중' : status === 'completed' ? '운동 결과 보기' : status === 'ready' ? '운동 시작하기' : '운동 추천받기'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/condition')} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>다시 추천받기</Text>
          </Pressable>
        </View>

        {homeError ? (
          <Pressable accessibilityRole="button" onPress={() => void refreshHome()} style={styles.errorCard}>
            <Text style={styles.errorText}>{homeError} · 다시 시도</Text>
          </Pressable>
        ) : null}

        <View style={[styles.card, simple && simpleStyles.card, isDark && dark.card]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionTitle, isDark && dark.text]}>이번 주 목표</Text>
            <Text style={styles.caption}>{day(start)}–{day(end)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.bigCount}>{value(homeMetrics.currentWeekWorkoutCount)}<Text style={styles.countUnit}> / {value(homeMetrics.targetWorkoutCount)}회</Text></Text>
            <Text style={styles.percent}>{value(homeMetrics.goalAchievementRate, '%')}</Text>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }} style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.caption}>이번 주 완료 {value(homeMetrics.currentWeekWorkoutCount, '회')}</Text>
            <Text style={styles.caption}>목표까지 {value(homeMetrics.remainingGoalWorkoutCount, '회')}</Text>
          </View>
          <View style={[styles.statRow, simple && simpleStyles.statRow]}>
            <View style={[styles.statBox, isDark && dark.card]}><Text style={styles.statLabel}>연속 운동</Text><Text style={[styles.statValue, isDark && dark.text]}>{value(homeMetrics.currentWorkoutStreakDays, '일')}</Text></View>
            <View style={[styles.statBox, isDark && dark.card]}><Text style={styles.statLabel}>최근 운동</Text><Text style={[styles.statValue, isDark && dark.text]}>{latestSession?.date?.slice(5, 10) ?? '—'}</Text></View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle, isDark && dark.text]}>최근 운동</Text>
        <View style={[styles.card, simple && simpleStyles.card, isDark && dark.card]}>
          <MenuRow title="운동 기록 확인" detail="완료한 운동과 운동 시간을 살펴보세요" onPress={() => router.push('/exercise/history')} />
          <View style={styles.divider} />
          <MenuRow title="저장한 운동" detail="추천 운동을 모으고 내 루틴을 만드세요" onPress={() => router.push('/exercise/saved-routines')} />
          <View style={styles.divider} />
          <MenuRow title="러닝 코스 추천" detail="지역과 거리에 맞는 코스를 찾아보세요" onPress={() => router.push('/exercise/running')} />
          <View style={styles.divider} />
          <MenuRow title="운동 목표 설정" detail="기간 · 근육량 · 체중 · 꾸준함" onPress={() => router.push('/exercise/goal')} />
          <View style={styles.divider} />
          <MenuRow title="진행 상황 보기" detail="목표와 운동 기록을 확인하세요" onPress={() => router.push('/exercise/goal-progress')} />
          <View style={styles.divider} />
          <MenuRow title="자세 점검" detail="스쿼트 자세 촬영을 준비하세요" onPress={() => router.push('/exercise/posture-check')} />
          <View style={styles.divider} />
          <MenuRow title="부위별 운동 가이드" detail="불편 부위의 가이드를 살펴보세요" onPress={() => router.push('/exercise/body-guide')} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  content: { paddingHorizontal: 20, gap: 18 },
  pageTitle: { color: ink, fontSize: 24, fontFamily: fontFamilies.pretendardBold, marginBottom: 2 },
  card: { backgroundColor: '#FFF', borderColor: border, borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  eyebrow: { color: muted, fontSize: 13, fontFamily: fontFamilies.pretendardMedium },
  heroTitle: { color: ink, fontSize: 20, fontFamily: fontFamilies.pretendardBold },
  heroMeta: { color: muted, fontSize: 13, fontFamily: fontFamilies.pretendardMedium },
  primaryButton: { backgroundColor: purple, borderRadius: 9, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: '#FFF', fontSize: 15, fontFamily: fontFamilies.pretendardBold },
  secondaryButton: { alignItems: 'center', paddingVertical: 8 },
  secondaryText: { color: ink, fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  disabled: { opacity: 0.5 },
  errorCard: { backgroundColor: '#FFF1F0', borderRadius: 10, padding: 14 },
  errorText: { color: '#A13A2F', fontSize: 13 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: ink, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  caption: { color: muted, fontSize: 12, fontFamily: fontFamilies.pretendardMedium },
  bigCount: { color: purple, fontSize: 23, fontFamily: fontFamilies.pretendardBold },
  countUnit: { color: muted, fontSize: 13, fontFamily: fontFamilies.pretendardMedium },
  percent: { color: purple, fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#E9E8EE', overflow: 'hidden' },
  progressFill: { height: 7, backgroundColor: purple },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  statRow: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  statBox: { flex: 1, borderColor: border, borderWidth: 1, borderRadius: 9, padding: 12, gap: 3 },
  statLabel: { color: muted, fontSize: 11 },
  statValue: { color: ink, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 },
  menuIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0EEFC', alignItems: 'center', justifyContent: 'center' },
  menuIconText: { color: purple, fontSize: 16 },
  menuCopy: { flex: 1, gap: 2 },
  menuTitle: { color: ink, fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  menuDetail: { color: muted, fontSize: 11 },
  chevron: { color: muted, fontSize: 20 },
  divider: { height: 1, backgroundColor: border },
});

const simpleStyles = StyleSheet.create({
  content: { gap: 20 },
  pageTitle: { fontSize: 29 },
  card: { gap: 16, padding: 20 },
  heroTitle: { fontSize: 23 },
  heroMeta: { fontSize: 16, lineHeight: 23 },
  primaryButton: { minHeight: 58 },
  primaryText: { fontSize: 18 },
  sectionTitle: { fontSize: 20 },
  statRow: { flexDirection: 'column' },
  menuRow: { minHeight: 76 },
  menuTitle: { fontSize: 17 },
  menuDetail: { fontSize: 13, lineHeight: 19 },
});

const dark = StyleSheet.create({
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
});
