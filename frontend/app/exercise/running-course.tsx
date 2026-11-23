import { useEffect, useState } from 'react';
import { useCanGoBack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CheckIcon from '@/assets/icons/system/Check.svg';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getRunningApiErrorMessage, getRunningCourseDetail, getSavedRunningCourses, previewRunningRoute, saveRunningCourse, startSavedCourseRun, type RunningCourse, type RunningRoutePreview } from '@/src/api/running';
import { ALoading } from '@/src/components/a/ALoading';
import { aForm } from '@/src/components/a/form';
import { RoutePicture, RunSetup, type RunCondition, type RunIntensity } from '@/src/components/a/RunParts';
import { canPreviewRoute, courseDifficultyLabel, previewRouteInput, routePoints } from '@/src/features/running/courseRoute';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

const nameOf = (course: RunningCourse) => course.course_name || course.name || '이름 없는 코스';
const sourceOf = (course: RunningCourse) => course.source?.source_type ?? course.source_type;

// Renewal A: one course as a stage, its map on top, how far and how long under it. The course is
// kept first (the server starts a run only on a kept course), then the three things before a run
// are asked and the run starts.
export default function RunningCourseScreen() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ courseId?: string; savedId?: string }>();
  const [course, setCourse] = useState<RunningCourse | null>(null);
  const [preview, setPreview] = useState<RunningRoutePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedCourseId, setSavedCourseId] = useState<string | null>(null);
  const [targetMinutes, setTargetMinutes] = useState('30');
  const [intensity, setIntensity] = useState<RunIntensity>('light');
  const [condition, setCondition] = useState<RunCondition>('normal');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [acceptDistanceError, setAcceptDistanceError] = useState(false);
  const [retry, setRetry] = useState(0);
  const canGoBack = useCanGoBack();
  const back = () => canGoBack ? router.back() : router.replace('/exercise/running');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (params.savedId) {
        const rows = await getSavedRunningCourses();
        const row = rows.courses?.find((item) => item.running_saved_course_id === params.savedId);
        if (!row) throw new Error('저장한 코스를 찾지 못했어요.');
        if (active) { setCourse(row.snapshot); setSaved(true); setSavedCourseId(row.running_saved_course_id); setTargetMinutes(String(Math.round(row.snapshot.estimated_duration_minutes ?? 30))); }
        return;
      }
      if (!params.courseId) throw new Error('코스 정보를 찾지 못했어요.');
      const result = await getRunningCourseDetail(params.courseId);
      const next = result.course ?? result;
      if (active) { setCourse(next); setTargetMinutes(String(Math.round(next.estimated_duration_minutes ?? 30))); }
      const routeInput = previewRouteInput(next);
      if (next.requires_route_validation && routeInput) {
        try {
          const route = await previewRunningRoute(routeInput);
          if (active) setPreview(route);
        } catch (cause) {
          if (active) setPreviewError(getRunningApiErrorMessage(cause));
        }
      }
    };
    void load().catch((cause) => { if (active) setError(getRunningApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.courseId, params.savedId, retry]);

  const save = async () => {
    if (!course?.selection_token || saving) return;
    setSaving(true);
    setError('');
    try {
      const savedRow = await saveRunningCourse({
        snapshot: course, selection_token: course.selection_token,
        ...(preview ? { preview } : {}),
        accept_distance_error: acceptDistanceError,
      });
      setCourse(savedRow.snapshot);
      setSavedCourseId(savedRow.running_saved_course_id);
      setSaved(true);
    } catch (cause) {
      setError(getRunningApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    if (!savedCourseId || starting) return;
    const duration = Number(targetMinutes);
    if (!Number.isInteger(duration) || duration < 10 || duration > 240) {
      setError('목표 시간은 10~240분으로 입력해 주세요.');
      return;
    }
    setStarting(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setError('러닝 기록에는 앱 사용 중 위치 권한이 필요해요.'); return; }
      if (!await Location.hasServicesEnabledAsync()) { setError('기기의 위치 서비스를 켠 뒤 다시 시도해 주세요.'); return; }
      const result = await startSavedCourseRun({
        saved_course_id: savedCourseId,
        target_duration_seconds: duration * 60,
        condition_level: condition, intensity,
      });
      router.push({ pathname: '/exercise/run-live', params: { sessionId: result.session.running_session_id } });
    } catch (cause) {
      setError(getRunningApiErrorMessage(cause));
    } finally {
      setStarting(false);
    }
  };

  const path = course ? (preview?.path?.length ? preview.path : routePoints(course)) : [];
  const validationNeeded = course?.requires_route_validation === true && !preview;
  const pathMissing = course && ['official_gpx', 'auto_generated'].includes(sourceOf(course) ?? '') && path.length < 2;
  const distanceAcceptanceNeeded = course?.within_tolerance === false;
  const distanceKm = preview?.distance_km ?? course?.distance_km;
  // The official time belongs to the official distance, so a drawn route shows its own.
  const minutes = typeof preview?.estimated_duration_minutes === 'number' ? preview.estimated_duration_minutes : course?.estimated_duration_minutes;
  const canSave = !!course?.selection_token && !validationNeeded && !pathMissing && (!distanceAcceptanceNeeded || acceptDistanceError);
  const noSave = !canSave || saving;
  const noStart = starting || path.length < 2;

  return <View style={s.root}>
    <ScreenHeader onBack={back} title="러닝 코스" />
    {loading ? <ALoading /> : <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {error && !course ? <Pressable accessibilityRole="button" onPress={() => { setError(''); setPreviewError(''); setLoading(true); setRetry((value) => value + 1); }} style={s.notice}><Text style={s.body}>{error} · 다시 시도</Text></Pressable> : null}
      {course ? <>
        <Text style={s.courseTitle}>{nameOf(course)}</Text>
        {course.description ? <Text style={s.body}>{course.description}</Text> : null}
        <View style={s.stage}>
          {path.length >= 2 ? <RoutePicture label={`${nameOf(course)} 경로`} points={path} style={s.map} /> : null}
          <View style={s.tags}>
            <Text style={s.tag}>{saved ? '저장한 코스' : sourceOf(course) === 'auto_generated' ? '앱이 만든 코스' : '공식 코스'}</Text>
            {course.region ? <Text style={s.tag}>{course.region}</Text> : null}
          </View>
          <View style={s.metrics}>
            <View style={s.metric}><Text style={s.metricValue}>{typeof distanceKm === 'number' ? `${Math.round(distanceKm * 10) / 10}km` : '–'}</Text><Text style={s.note}>거리</Text></View>
            <View style={[s.metric, s.metricNext]}><Text style={s.metricValue}>{typeof minutes === 'number' ? `약 ${Math.round(minutes)}분` : '–'}</Text><Text style={s.note}>예상 시간</Text></View>
            <View style={[s.metric, s.metricNext]}><Text style={s.metricValue}>{courseDifficultyLabel(course.difficulty) || '–'}</Text><Text style={s.note}>난이도</Text></View>
          </View>
        </View>
        {path.length >= 2 && sourceOf(course) === 'official_metadata' ? <Text style={s.note}>길찾기로 그린 경로예요. 공식 코스{preview && typeof course.distance_km === 'number' ? `(${course.distance_km}km)` : ''}와 다를 수 있어요.</Text> : null}
        {validationNeeded ? <View style={s.notice}><Text style={s.body}>{canPreviewRoute(course) ? `경로를 검증하지 못했어요. ${previewError || '잠시 후 다시 시도해 주세요.'}` : '이 코스는 출발지와 도착지만으로 경로를 그릴 수 없어요.'}</Text></View> : null}
        {pathMissing ? <View style={s.notice}><Text style={s.body}>경로 좌표가 없어 이 코스를 저장할 수 없어요.</Text></View> : null}
        {distanceAcceptanceNeeded && !saved ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acceptDistanceError }} onPress={() => setAcceptDistanceError((value) => !value)} style={[s.notice, s.checkRow]}><View style={[s.tick, acceptDistanceError && s.on]}>{acceptDistanceError ? <CheckIcon color={colors.onPrimary} height={18} width={18} /> : null}</View><Text style={[s.body, s.grow]}>요청한 거리와 실제 코스가 {course.distance_error_percent ?? '다소'}% 차이 나는 것을 확인했어요.</Text></Pressable> : null}
        {saved && savedCourseId ? <>
          <RunSetup condition={condition} intensity={intensity} minutes={targetMinutes} onCondition={setCondition} onIntensity={setIntensity} onMinutes={setTargetMinutes} />
          {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
          {path.length < 2 ? <Text style={s.error}>경로 좌표가 없어 이 코스로 러닝을 시작할 수 없어요.</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: noStart }} disabled={noStart} onPress={() => void start()} style={({ pressed }) => [s.go, noStart && s.off, pressed && s.goPressed]}><Text style={s.goText}>{starting ? '준비 중…' : '이 코스로 달리기'}</Text></Pressable>
        </> : <>
          {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: noSave }} disabled={noSave} onPress={() => void save()} style={({ pressed }) => [s.go, noSave && s.off, pressed && s.goPressed]}><Text style={s.goText}>{saving ? '저장 중…' : '이 코스 저장하기'}</Text></Pressable>
          <Text style={[s.note, s.center]}>저장한 코스로 달릴 수 있어요</Text>
        </>}
        <Pressable accessibilityRole="button" hitSlop={8} onPress={back} style={s.other}><Text style={s.link}>다른 코스 보기</Text></Pressable>
      </> : null}
    </ScrollView>}
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 14, paddingHorizontal: 16, paddingTop: 8 },
    courseTitle: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    body: { ...a.p15, color: colors.textBody },
    note: a.note,
    center: { textAlign: 'center' },
    // The stage: the map, what kind of course it is on its corner, and its three numbers under it.
    stage: { ...a.card, overflow: 'hidden' },
    map: { borderBottomColor: colors.ink, borderBottomWidth: 2, height: 220 },
    tags: { flexDirection: 'row', gap: 6, left: 10, position: 'absolute', top: 10 },
    tag: {
      ...a.p12,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 99,
      borderWidth: 1,
      color: colors.ink,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 1,
    },
    metrics: { flexDirection: 'row', paddingVertical: 12 },
    metric: { alignItems: 'center', flex: 1, gap: 2, minWidth: 0 },
    metricNext: { borderLeftColor: colors.track, borderLeftWidth: 2 },
    metricValue: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 28 },
    notice: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, padding: 12 },
    checkRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    tick: a.tick,
    on: a.on,
    grow: { flex: 1 },
    error: { ...a.p12, color: colors.danger },
    go: a.go,
    goPressed: a.goPressed,
    goText: a.goText,
    off: { opacity: 0.4 },
    other: { alignItems: 'center', height: 44, justifyContent: 'center' },
    link: a.link,
  } as const;
}
