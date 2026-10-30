import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getActiveExerciseGoal, getExerciseHistory } from '@/src/api/exercise';
import { getRunningHistory } from '@/src/api/running';
import { chartActivity, collectActivityDays, localDayKey, shiftDay, summarizeActivity, type ActivityDay } from '@/src/features/exercise/goalProgress';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies } from '@/src/theme';

type Goal = { weekly_duration_minutes: number };

export function WeeklyWorkoutCard() {
  const router = useRouter();
  const { isDark, preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const [days, setDays] = useState<ActivityDay[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [week, setWeek] = useState(() => {
    const today = new Date();
    const monday = shiftDay(today, -((today.getDay() + 6) % 7));
    return { monday, sunday: shiftDay(monday, 6) };
  });

  useFocusEffect(useCallback(() => {
    let active = true;
    const today = new Date();
    const monday = shiftDay(today, -((today.getDay() + 6) % 7));
    const sunday = shiftDay(monday, 6);
    setWeek({ monday, sunday });
    setLoaded(false);
    void Promise.all([
      getActiveExerciseGoal(),
      getExerciseHistory(localDayKey(monday), localDayKey(sunday)),
      getRunningHistory(localDayKey(monday), localDayKey(sunday)),
    ]).then(([goalResponse, exercise, running]) => {
      if (!active) return;
      setGoal((goalResponse.goal ?? null) as Goal | null);
      setDays(collectActivityDays(exercise.history ?? [], running.sessions ?? []));
      setError(false);
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []));

  const minutes = Math.round(summarizeActivity(days, week.monday, week.sunday).minutes);
  const target = goal?.weekly_duration_minutes ?? null;
  const bars = chartActivity(days, week.monday, week.sunday, 'week');
  const scale = Math.max(30, target ? target / 3 : 0, ...bars.map((bar) => bar.minutes));
  const ratio = target && target > 0 ? Math.min(100, Math.round(minutes / target * 100)) : 0;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="주간 운동 진행 현황 보기" onPress={() => router.push('/exercise/goal-progress')} style={[styles.card, isDark && dark.card, simple && simpleStyles.card]}>
      <Text style={[styles.label, isDark && dark.secondary, simple && simpleStyles.label]}>이번 주 운동 시간</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, isDark && dark.text, simple && simpleStyles.value]}>{loaded && !error ? `${minutes}` : '—'}<Text style={[styles.unit, isDark && dark.secondary]}> / {target ?? '—'}분</Text></Text>
        {loaded && !error && target ? <Text style={styles.percent}>{ratio}%</Text> : null}
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: loaded && !error ? ratio : 0 }} style={[styles.track, isDark && dark.track]}>
        <View style={[styles.fill, { width: `${loaded && !error ? ratio : 0}%` }]} />
      </View>
      {!simple ? <View style={styles.chart}>
        {bars.map((bar) => <View key={bar.label} style={styles.column}>
          <Text style={[styles.barValue, isDark && dark.secondary]}>{loaded && !error && bar.minutes > 0 ? `${Math.round(bar.minutes)}분` : ''}</Text>
          <View style={[styles.bar, isDark && dark.bar, { height: loaded && !error ? Math.max(3, Math.round(bar.minutes / scale * 52)) : 3 }]} />
          <Text style={[styles.day, isDark && dark.secondary]}>{bar.label}</Text>
        </View>)}
      </View> : null}
      {!loaded ? <Text style={[styles.hint, isDark && dark.hint, simple && simpleStyles.hint]}>운동 기록을 불러오는 중이에요.</Text>
        : error ? <Text style={[styles.hint, isDark && dark.hint, simple && simpleStyles.hint]}>운동 기록을 불러오지 못했어요. 진행 현황에서 다시 확인해 주세요.</Text>
        : <Text style={[styles.hint, isDark && dark.hint, simple && simpleStyles.hint]}>{target ? minutes >= target ? '이번 주 목표를 채웠어요.' : `${Math.max(0, target - minutes)}분 더 운동하면 이번 주 목표를 채워요.` : '운동 목표를 설정하면 달성률을 볼 수 있어요.'}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: '#E6E6ED', borderRadius: 14, borderWidth: 1, gap: 11, padding: 16 },
  label: { color: '#777781', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  valueRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  value: { color: '#222227', fontFamily: fontFamilies.pretendardBold, fontSize: 20 },
  unit: { color: '#777781', fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
  percent: { color: '#503DD7', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 12 },
  track: { backgroundColor: '#E8E9ED', borderRadius: 4, height: 6, overflow: 'hidden' },
  fill: { backgroundColor: '#503DD7', height: 6 },
  chart: { alignItems: 'flex-end', flexDirection: 'row', height: 86 },
  column: { alignItems: 'center', flex: 1, gap: 4 },
  barValue: { color: '#777781', fontSize: 9, height: 12 },
  bar: { backgroundColor: '#222227', borderRadius: 4, width: 17 },
  day: { color: '#777781', fontSize: 10 },
  hint: { backgroundColor: '#F5F5F7', borderRadius: 8, color: '#777781', fontSize: 11, lineHeight: 16, padding: 10 },
});

const simpleStyles = StyleSheet.create({
  card: { gap: 15, minHeight: 145, padding: 20 },
  label: { fontSize: 16 },
  value: { fontSize: 25 },
  hint: { fontSize: 14, lineHeight: 21, padding: 13 },
});

const dark = StyleSheet.create({
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
  secondary: { color: darkColors.textSecondary },
  track: { backgroundColor: darkColors.border },
  bar: { backgroundColor: darkColors.textPrimary },
  hint: { backgroundColor: darkColors.surfaceRaised, color: darkColors.textSecondary },
});
