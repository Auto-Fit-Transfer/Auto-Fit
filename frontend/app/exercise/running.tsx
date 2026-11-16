import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Pressable } from 'react-native';
import { getActiveRunningSession, getRunningApiErrorMessage, getRunningRecommendations, getSavedRunningCourses, startFreeRun, type RunningCourse, type RunningDistanceOption, type RunningSavedCourse, type RunningSession } from '@/src/api/running';
import { aForm } from '@/src/components/a/form';
import { RunSetup, type RunCondition, type RunIntensity } from '@/src/components/a/RunParts';
import { RunReadyView, type RunTab } from '@/src/components/a/RunReadyView';
import { AppBottomSheet, Text } from '@/src/components/common';
import { runClock, runKm } from '@/src/features/a/runFormat';
import { courseDifficultyLabel, hasRenderablePath } from '@/src/features/running/courseRoute';
import { useThemedStyles, type AppTheme } from '@/src/theme';

const distanceOptions: RunningDistanceOption[] = ['3km', '5km', '10km'];
const nameOf = (course: RunningCourse) => course.course_name || course.name || '이름 없는 코스';

// Renewal A's 러닝, before a run (src/components/a/RunReadyView.tsx shows it). A course is opened from
// the list on its own screen, where its map is drawn; running without one is asked in a box here.
export default function RunningRecommendations() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [region, setRegion] = useState('');
  const [distance, setDistance] = useState<RunningDistanceOption>('5km');
  const [minutes, setMinutes] = useState('30');
  const [intensity, setIntensity] = useState<RunIntensity>('light');
  const [condition, setCondition] = useState<RunCondition>('normal');
  const [activeSession, setActiveSession] = useState<RunningSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [courses, setCourses] = useState<RunningCourse[]>([]);
  const [savedCourses, setSavedCourses] = useState<RunningSavedCourse[]>([]);
  const [message, setMessage] = useState('');
  const [startMessage, setStartMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<RunTab>('rec');
  const [freeOpen, setFreeOpen] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void getActiveRunningSession().then((result) => {
      if (active) setActiveSession(result.session);
    }).catch(() => {});
    void getSavedRunningCourses().then((result) => {
      if (active) setSavedCourses((result.courses ?? []).filter((saved) => hasRenderablePath(saved.snapshot)));
    }).catch(() => {});
    return () => { active = false; };
  }, []));
  const search = async () => {
    setTab('rec');
    if (!region.trim()) { setMessage('러닝할 지역을 입력해 주세요.'); return; }
    setLoading(true);
    setCourses([]);
    setMessage('');
    try {
      const result = await getRunningRecommendations(region.trim(), distance);
      // The list carries no route coordinates; the course screen geocodes the ends and draws the route.
      const found = result.courses ?? [];
      setCourses(found);
      if (!found.length) setMessage('이 조건에 맞는 공식 코스가 없어요. 시·구 이름이나 다른 거리로 찾아보세요.');
    } catch (cause) {
      setMessage(getRunningApiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };
  const start = async () => {
    const targetMinutes = Number(minutes);
    if (!Number.isInteger(targetMinutes) || targetMinutes < 10 || targetMinutes > 240) {
      setStartMessage('목표 시간은 10~240분으로 입력해 주세요.');
      return;
    }
    setStarting(true);
    setStartMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setStartMessage('러닝 거리를 기록하려면 앱 사용 중 위치 권한이 필요해요.');
        return;
      }
      if (!await Location.hasServicesEnabledAsync()) {
        setStartMessage('기기의 위치 서비스를 켠 뒤 다시 시도해 주세요.');
        return;
      }
      const result = await startFreeRun({
        target_distance_meters: Number(distance.replace('km', '')) * 1000,
        target_duration_seconds: targetMinutes * 60,
        region_name: region.trim() || null,
        condition_level: condition,
        intensity,
        discomfort_areas: [],
      });
      setFreeOpen(false);
      router.push({ pathname: '/exercise/run-live', params: { sessionId: result.session.running_session_id } });
    } catch (cause) {
      setStartMessage(getRunningApiErrorMessage(cause));
      void getActiveRunningSession().then((result) => setActiveSession(result.session)).catch(() => {});
    } finally {
      setStarting(false);
    }
  };

  const rows = tab === 'rec'
    ? courses.map((course, index) => ({
        key: course.course_id || String(index),
        name: nameOf(course),
        detail: [course.region, typeof course.distance_km === 'number' ? `${course.distance_km}km` : null, typeof course.estimated_duration_minutes === 'number' ? `약 ${Math.round(course.estimated_duration_minutes)}분` : null, courseDifficultyLabel(course.difficulty)].filter(Boolean).join(' · '),
        onPress: () => router.push({ pathname: '/exercise/running-course', params: { courseId: course.course_id } }),
      }))
    : savedCourses.map((saved) => ({
        key: saved.running_saved_course_id,
        name: saved.course_name,
        detail: [saved.snapshot.region, typeof saved.snapshot.distance_km === 'number' ? `${saved.snapshot.distance_km}km` : null].filter(Boolean).join(' · '),
        onPress: () => router.push({ pathname: '/exercise/running-course', params: { savedId: saved.running_saved_course_id } }),
      }));

  return <>
    <RunReadyView
      active={activeSession ? {
        detail: `${runKm(activeSession.distance_meters)}km · ${runClock(activeSession.elapsed_seconds)}`,
        onResume: () => router.push({ pathname: '/exercise/run-live', params: { sessionId: activeSession.running_session_id } }),
      } : null}
      counts={{ rec: courses.length, mine: savedCourses.length }}
      distance={distance}
      distances={distanceOptions}
      finding={loading}
      kinds={[
        { label: '오늘의 운동', onPress: () => router.replace('/exercise') },
        { label: '러닝', selected: true, onPress: () => undefined },
        { label: '자세 분석', onPress: () => router.replace('/exercise/posture-check') },
      ]}
      message={message}
      onBack={() => router.back()}
      onDistance={(value) => setDistance(value as RunningDistanceOption)}
      onFind={() => void search()}
      onFree={() => { setStartMessage(''); setFreeOpen(true); }}
      onRegion={setRegion}
      onTab={setTab}
      region={region}
      rows={rows}
      tab={tab}
    />
    <AppBottomSheet contentStyle={styles.sheet} onClose={() => setFreeOpen(false)} title="코스 없이 달리기" visible={freeOpen}>
      <RunSetup condition={condition} intensity={intensity} minutes={minutes} onCondition={setCondition} onIntensity={setIntensity} onMinutes={setMinutes} />
      {startMessage ? <Text accessibilityRole="alert" style={styles.error}>{startMessage}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: starting }} disabled={starting} onPress={() => void start()} style={({ pressed }) => [styles.go, starting && styles.off, pressed && styles.goPressed]}>
        <Text style={styles.goText}>{starting ? '준비 중…' : '달리기 시작'}</Text>
      </Pressable>
    </AppBottomSheet>
  </>;
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    sheet: { gap: 14, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 0 },
    error: { ...a.p12, color: colors.danger },
    go: a.go,
    goPressed: a.goPressed,
    goText: a.goText,
    off: { opacity: 0.4 },
  } as const;
}
