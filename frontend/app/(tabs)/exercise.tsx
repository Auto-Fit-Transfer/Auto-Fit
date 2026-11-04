import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import CalendarIcon from '@/assets/icons/ui/calendar-check.svg';
import CameraIcon from '@/assets/icons/ui/camera.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import ChartIcon from '@/assets/icons/ui/chart-line-up.svg';
import ClockIcon from '@/assets/icons/ui/clock.svg';
import FileIcon from '@/assets/icons/ui/file-text.svg';
import FireIcon from '@/assets/icons/ui/fire.svg';
import HeartbeatIcon from '@/assets/icons/ui/heartbeat.svg';
import TargetIcon from '@/assets/icons/ui/target.svg';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useWeekWorkouts } from '@/src/features/exercise/useWeekWorkouts';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { BOTTOM_NAVIGATION_MIN_BOTTOM_GAP, getBottomNavigationVisualHeight } from '@/src/components/navigation';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies } from '@/src/theme';
import { Text } from '@/src/components/common';

const purple = '#5246C6';
const ink = '#17161D';
const body = '#3B3A42';
const muted = '#5E5D66';
const border = '#DFE2E7';
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const value = (number: number | null | undefined, suffix = '') =>
  number == null ? '—' : `${number}${suffix}`;

function MenuRow({ Icon, title, detail, onPress }: { Icon: typeof TargetIcon; title: string; detail: string; onPress: () => void }) {
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  return (
    <Pressable hitSlop={16} accessibilityRole="button" onPress={onPress} style={[styles.menuRow, simple && simpleStyles.menuRow]}>
      <View style={[styles.menuIcon, isDark && dark.card]}><Icon color={isDark ? darkColors.textPrimary : ink} height={22} width={22} /></View>
      <View style={styles.menuCopy}>
        <Text style={[styles.menuTitle, simple && simpleStyles.menuTitle, isDark && dark.text]}>{title}</Text>
        <Text style={[styles.menuDetail, simple && simpleStyles.menuDetail, isDark && dark.secondary]}>{detail}</Text>
      </View>
      <CaretRightIcon color={muted} height={20} width={20} />
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
    resultRecordCompleted, routine: loadedRoutine, status,
  } = useExerciseRoutine();
  // The context keeps the last recommendation even when it was made on an earlier day.
  const routine = status === 'not-created' ? null : loadedRoutine;
  const week = useWeekWorkouts();

  useFocusEffect(useCallback(() => { void refreshHome(); }, [refreshHome]));

  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const day = (date: Date) => `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`;
  const progress = Math.min(100, Math.max(0, homeMetrics.goalAchievementRate ?? 0));
  const target = homeMetrics.targetWorkoutCount;
  const doneCount = homeMetrics.currentWeekWorkoutCount ?? 0;
  const segments = target && target <= 7 ? Array.from({ length: target }, (_, index) => index) : [];
  const segmentLabel = (index: number) => {
    const key = week.days[index];
    const when = index >= doneCount ? '남음' : key ? weekdays[new Date(`${key}T12:00:00`).getDay()] : '';
    if (segments.length > 4) return when;
    return when ? `${index + 1}회 · ${when}` : `${index + 1}회`;
  };
  const heroMeta: [typeof ClockIcon, string][] = status === 'completed'
    ? [[ClockIcon, value(latestSession?.durationMinutes, '분')], [BarbellIcon, value(latestSession?.itemCount, '가지')], [FireIcon, value(latestSession?.calories, 'kcal')]]
    : routine
      ? [[ClockIcon, value(routine.totalDurationMinutes, '분')], [BarbellIcon, `${routine.exercises.length}가지`], [FireIcon, routine.estimatedCalories == null ? '—' : `약 ${routine.estimatedCalories}kcal`]]
      : [];
  const shownHeroMeta = heroMeta.filter(([, label]) => label !== '—');
  const latestDate = latestSession?.date ? new Date(latestSession.date) : null;
  const latestDetail = latestSession
    ? [
        latestDate && !Number.isNaN(latestDate.getTime()) ? `${latestDate.getMonth() + 1}월 ${latestDate.getDate()}일` : null,
        latestSession.durationMinutes == null ? null : `${Math.round(latestSession.durationMinutes)}분`,
        latestSession.itemCount == null ? null : `${latestSession.itemCount}가지`,
        latestSession.calories == null ? null : `${latestSession.calories}kcal`,
      ].filter(Boolean).join(' · ')
    : '끝낸 운동이 여기에 쌓여요';
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
          <Text style={[styles.eyebrow, isDark && dark.secondary]}>오늘의 운동</Text>
          <Text style={[styles.heroTitle, simple && simpleStyles.heroTitle, isDark && dark.text]}>
            {status === 'completed' ? '오늘 운동을 마쳤어요' : routine?.title ?? '오늘의 맞춤 운동을 준비해요'}
          </Text>
          {shownHeroMeta.length ? (
            <View style={styles.heroMetaRow}>
              {shownHeroMeta.map(([Icon, label]) => (
                <View key={label} style={styles.heroMetaItem}>
                  <Icon color={isDark ? darkColors.textSecondary : body} height={18} width={18} />
                  <Text style={[styles.heroMeta, simple && simpleStyles.heroMeta, isDark && dark.secondary]}>{label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.heroMeta, simple && simpleStyles.heroMeta, isDark && dark.secondary]}>오늘의 시간과 컨디션에 맞춰 추천받으세요</Text>
          )}
          <Pressable accessibilityRole="button" disabled={homeLoadState === 'loading'} onPress={mainAction} style={[styles.primaryButton, simple && simpleStyles.primaryButton, homeLoadState === 'loading' && styles.disabled]}>
            <Text style={[styles.primaryText, simple && simpleStyles.primaryText]}>
              {homeLoadState === 'loading' ? '운동 정보 확인 중' : status === 'completed' ? '결과 보기' : status === 'ready' ? '운동 시작하기' : '오늘 운동 추천받기'}
            </Text>
          </Pressable>
          {routine || status === 'completed' ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/condition')} style={styles.secondaryButton}>
              <Text style={[styles.secondaryText, isDark && dark.text]}>다시 추천받기</Text>
            </Pressable>
          ) : null}
        </View>

        {homeError ? (
          <Pressable accessibilityRole="button" onPress={() => void refreshHome()} style={styles.errorCard}>
            <Text style={styles.errorText}>{homeError} · 다시 시도</Text>
          </Pressable>
        ) : null}

        <View style={[styles.card, simple && simpleStyles.card, isDark && dark.card]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionSmall, isDark && dark.text]}>이번 주 목표</Text>
            <Text style={[styles.caption, isDark && dark.secondary]}>{day(start)} ~ {day(end)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[styles.bigCount, isDark && dark.text]}>{value(homeMetrics.currentWeekWorkoutCount)}<Text style={[styles.countUnit, isDark && dark.secondary]}> / {value(target)}회</Text></Text>
            <Text style={[styles.percent, isDark && dark.text]}>{value(homeMetrics.goalAchievementRate == null ? null : Math.round(homeMetrics.goalAchievementRate), '%')}</Text>
          </View>
          {segments.length ? (
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }} style={styles.segments}>
              {segments.map((index) => (
                <View key={index} style={styles.segment}>
                  <View style={[styles.segmentBar, isDark && dark.track, index < doneCount && styles.segmentDone]} />
                  <Text style={[index < doneCount ? styles.segmentLabelDone : styles.segmentLabel, isDark && dark.secondary]}>{segmentLabel(index)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }} style={[styles.progressTrack, isDark && dark.track]}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}
          <View style={[styles.statRow, simple && simpleStyles.statRow]}>
            <View style={[styles.statBox, isDark && dark.card]}><Text style={[styles.statLabel, isDark && dark.secondary]}>운동 시간</Text><Text style={[styles.statValue, isDark && dark.text]}>{week.minutes}분</Text></View>
            <View style={[styles.statBox, isDark && dark.card]}><Text style={[styles.statLabel, isDark && dark.secondary]}>목표까지</Text><Text style={[styles.statValue, isDark && dark.text]}>{value(homeMetrics.remainingGoalWorkoutCount, '회')}</Text></View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle, isDark && dark.text]}>최근 운동</Text>
        <View style={[styles.list, isDark && dark.card]}>
          <MenuRow Icon={BarbellIcon} title={latestSession ? '지난 운동 기록' : '아직 운동 기록이 없어요'} detail={latestDetail} onPress={() => router.push('/exercise/history')} />
        </View>
        <View style={[styles.list, isDark && dark.card]}>
          <MenuRow Icon={TargetIcon} title="운동 목표 설정" detail="기간 · 근육량 · 체중 · 꾸준함" onPress={() => router.push('/exercise/goal')} />
          <View style={[styles.divider, isDark && dark.track]} />
          <MenuRow Icon={ChartIcon} title="진행 현황 보기" detail="주간 · 월간 변화" onPress={() => router.push('/exercise/goal-progress')} />
          <View style={[styles.divider, isDark && dark.track]} />
          <MenuRow Icon={CameraIcon} title="자세 점검" detail="옆모습 영상으로 확인" onPress={() => router.push('/exercise/posture-check')} />
          <View style={[styles.divider, isDark && dark.track]} />
          <MenuRow Icon={CalendarIcon} title="저장한 운동" detail="추천 운동을 모으고 내 루틴 만들기" onPress={() => router.push('/exercise/saved-routines')} />
          <View style={[styles.divider, isDark && dark.track]} />
          <MenuRow Icon={HeartbeatIcon} title="러닝 코스 추천" detail="지역과 거리에 맞는 코스" onPress={() => router.push('/exercise/running')} />
          <View style={[styles.divider, isDark && dark.track]} />
          <MenuRow Icon={FileIcon} title="부위별 운동 가이드" detail="불편한 부위의 가이드" onPress={() => router.push('/exercise/body-guide')} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  content: { paddingHorizontal: 20, gap: 16 },
  pageTitle: { color: ink, fontSize: 22, lineHeight: 30, fontFamily: fontFamilies.pretendardBold },
  card: { backgroundColor: '#FAFBFC', borderColor: border, borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  list: { backgroundColor: '#FAFBFC', borderColor: border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  eyebrow: { color: muted, fontSize: 14, lineHeight: 21 },
  heroTitle: { color: ink, fontSize: 18, lineHeight: 26, fontFamily: fontFamilies.pretendardBold },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  heroMetaItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  heroMeta: { color: body, fontSize: 14, lineHeight: 21 },
  primaryButton: { backgroundColor: purple, borderRadius: 12, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { color: '#FFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  secondaryButton: { alignItems: 'center', paddingVertical: 8 },
  secondaryText: { color: ink, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
  disabled: { opacity: 0.5 },
  errorCard: { backgroundColor: '#FFF1F0', borderRadius: 12, padding: 14 },
  errorText: { color: '#A13A2F', fontSize: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: ink, fontSize: 18, lineHeight: 26, fontFamily: fontFamilies.pretendardBold, marginTop: 4 },
  sectionSmall: { color: ink, fontSize: 16, lineHeight: 24, fontFamily: fontFamilies.pretendardBold },
  caption: { color: muted, fontSize: 14, lineHeight: 21 },
  bigCount: { color: ink, fontSize: 22, lineHeight: 30, fontFamily: fontFamilies.pretendardBold },
  countUnit: { color: muted, fontSize: 16, fontFamily: fontFamilies.pretendardRegular },
  percent: { color: ink, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  segments: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, gap: 4 },
  segmentBar: { backgroundColor: '#E3E6EB', borderRadius: 4, height: 8 },
  segmentDone: { backgroundColor: purple },
  segmentLabel: { color: muted, fontSize: 12, lineHeight: 18 },
  segmentLabelDone: { color: ink, fontFamily: fontFamilies.pretendardMedium, fontSize: 12, lineHeight: 18 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#E3E6EB', overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: purple },
  statRow: { flexDirection: 'row', gap: 8 },
  statBox: { alignItems: 'center', backgroundColor: '#FAFBFC', flex: 1, flexDirection: 'row', justifyContent: 'space-between', borderColor: border, borderWidth: 1, borderRadius: 12, minHeight: 43, paddingHorizontal: 12 },
  statLabel: { color: body, fontSize: 14 },
  statValue: { color: ink, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8 },
  menuIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  menuCopy: { flex: 1, gap: 2 },
  menuTitle: { color: ink, fontSize: 16, lineHeight: 24 },
  menuDetail: { color: muted, fontSize: 14, lineHeight: 21 },
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
  track: { backgroundColor: darkColors.border },
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
  secondary: { color: darkColors.textSecondary },
});
