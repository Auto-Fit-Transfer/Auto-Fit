import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { getRunningApiErrorMessage, getRunningCourseDetail, getSavedRunningCourses, previewRunningRoute, saveRunningCourse, startSavedCourseRun, type RunningCourse, type RunningRoutePreview } from '@/src/api/running';
import { canPreviewRoute, routePoints, routePolyline } from '@/src/features/running/courseRoute';
import { fontFamilies } from '@/src/theme';

const purple = '#503DD7';
const nameOf = (course: RunningCourse) => course.course_name || course.name || '이름 없는 코스';
const sourceOf = (course: RunningCourse) => course.source?.source_type ?? course.source_type;

function RouteDiagram({ course, preview }: { course: RunningCourse; preview: RunningRoutePreview | null }) {
  const points = preview?.path?.length ? preview.path : routePoints(course);
  const line = routePolyline(points);
  const ends = line.split(' ');
  return <View style={s.map}>
    <Svg height="180" viewBox="0 0 320 180" width="100%">
      {Array.from({ length: 8 }, (_, index) => <Line key={`h${index}`} x1="0" x2="320" y1={index * 26} y2={index * 26} stroke="#E7E8EA" strokeWidth="1" />)}
      {Array.from({ length: 13 }, (_, index) => <Line key={`v${index}`} x1={index * 27} x2={index * 27} y1="0" y2="180" stroke="#E7E8EA" strokeWidth="1" />)}
      {line ? <><Polyline points={line} fill="none" stroke="#252329" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={Number(ends[0]?.split(',')[0])} cy={Number(ends[0]?.split(',')[1])} r="6" fill="#FFF" stroke="#252329" strokeWidth="3" />
        <Circle cx={Number(ends.at(-1)?.split(',')[0])} cy={Number(ends.at(-1)?.split(',')[1])} r="6" fill={purple} stroke="#FFF" strokeWidth="2" /></> : null}
    </Svg>
    {!line ? <View style={s.mapEmpty}><Text style={s.mapEmptyText}>제공된 경로 좌표가 없어요</Text></View> : null}
    <View style={s.mapBadge}><Text style={s.mapBadgeText}>경로 도식 · 실제 지도가 아니에요</Text></View>
  </View>;
}

export default function RunningCourseScreen() {
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
  const [intensity, setIntensity] = useState<'light' | 'moderate' | 'hard'>('light');
  const [condition, setCondition] = useState<'good' | 'normal' | 'tired'>('normal');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [acceptDistanceError, setAcceptDistanceError] = useState(false);
  const [retry, setRetry] = useState(0);

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
      if (next.requires_route_validation && canPreviewRoute(next)) {
        try {
          const route = await previewRunningRoute({
            start: next.start!, end: next.end!, waypoints: next.waypoints ?? [],
          });
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
  const canSave = !!course?.selection_token && !validationNeeded && !pathMissing && (!distanceAcceptanceNeeded || acceptDistanceError);

  return <View style={s.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 }]}>
      <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()}><Text style={s.back}>‹</Text></Pressable><Text style={s.title}>러닝 코스</Text><View style={{ width: 24 }} /></View>
      {loading ? <ActivityIndicator color={purple} /> : null}
      {error && !course ? <Pressable accessibilityRole="button" onPress={() => { setError(''); setPreviewError(''); setLoading(true); setRetry((value) => value + 1); }} style={s.notice}><Text style={s.error}>{error} · 다시 시도</Text></Pressable> : null}
      {course ? <>
        <Text style={s.eyebrow}>{saved ? '저장한 코스' : '추천 코스'}</Text>
        <Text style={s.courseTitle}>{nameOf(course)}</Text>
        {course.description ? <Text style={s.body}>{course.description}</Text> : null}
        <View style={s.tags}>{course.region ? <Text style={s.tag}>{course.region}</Text> : null}<Text style={s.tag}>{sourceOf(course) === 'auto_generated' ? '생성 코스' : '공식 코스'}</Text></View>
        <RouteDiagram course={course} preview={preview} />
        <View style={s.metrics}>
          <View style={s.metric}><Text style={s.metricLabel}>거리</Text><Text style={s.metricValue}>{typeof (preview?.distance_km ?? course.distance_km) === 'number' ? `${preview?.distance_km ?? course.distance_km}km` : '—'}</Text></View>
          <View style={s.metric}><Text style={s.metricLabel}>예상 시간</Text><Text style={s.metricValue}>{typeof course.estimated_duration_minutes === 'number' ? `약 ${course.estimated_duration_minutes}분` : '—'}</Text></View>
          <View style={s.metric}><Text style={s.metricLabel}>난이도</Text><Text style={s.metricValue}>{course.difficulty || '—'}</Text></View>
        </View>
        {validationNeeded ? <View style={s.notice}><Text style={s.body}>{canPreviewRoute(course) ? `경로를 검증하지 못했어요. ${previewError || '잠시 후 다시 시도해 주세요.'}` : '이 코스의 출발·도착 좌표가 없어 경로를 검증할 수 없어요.'}</Text></View> : null}
        {pathMissing ? <View style={s.notice}><Text style={s.body}>경로 좌표가 없어 이 코스를 저장할 수 없어요.</Text></View> : null}
        {distanceAcceptanceNeeded ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acceptDistanceError }} onPress={() => setAcceptDistanceError((value) => !value)} style={s.notice}><Text style={s.body}>{acceptDistanceError ? '☑' : '□'}  요청한 거리와 실제 코스가 {course.distance_error_percent ?? '다소'}% 차이 나는 것을 확인했어요.</Text></Pressable> : null}
        {error && course ? <Text style={s.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={saved || !canSave || saving} onPress={() => void save()} style={[s.button, (saved || !canSave || saving) && s.disabled]}><Text style={s.buttonText}>{saved ? '저장된 코스예요' : saving ? '저장 중…' : '이 코스 저장하기'}</Text></Pressable>
        {saved && savedCourseId ? <View style={s.startCard}>
          <Text style={s.metricLabel}>목표 시간 · 분</Text><TextInput accessibilityLabel="목표 러닝 시간(분)" keyboardType="number-pad" value={targetMinutes} onChangeText={setTargetMinutes} style={s.input} />
          <Text style={s.metricLabel}>강도</Text><View style={s.choices}>{([['light', '가볍게'], ['moderate', '보통'], ['hard', '강하게']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: intensity === key }} onPress={() => setIntensity(key)} style={[s.choice, intensity === key && s.choiceSelected]}><Text style={[s.choiceText, intensity === key && s.choiceTextSelected]}>{label}</Text></Pressable>)}</View>
          <Text style={s.metricLabel}>오늘 컨디션</Text><View style={s.choices}>{([['good', '좋음'], ['normal', '보통'], ['tired', '피곤함']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: condition === key }} onPress={() => setCondition(key)} style={[s.choice, condition === key && s.choiceSelected]}><Text style={[s.choiceText, condition === key && s.choiceTextSelected]}>{label}</Text></Pressable>)}</View>
          <Pressable accessibilityRole="button" disabled={starting || path.length < 2} onPress={() => void start()} style={[s.button, (starting || path.length < 2) && s.disabled]}><Text style={s.buttonText}>{starting ? '준비 중…' : '이 코스로 러닝 시작하기'}</Text></Pressable><Text style={s.metricLabel}>앱 사용 중 GPS로 실제 이동을 기록해요.</Text>{path.length < 2 ? <Text style={s.error}>경로 좌표가 없어 이 코스로 러닝을 시작할 수 없어요.</Text> : null}</View> : null}
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.outline}><Text style={s.outlineText}>다른 코스 보기</Text></Pressable>
      </> : null}
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' }, content: { paddingHorizontal: 20, gap: 16 },
  header: { height: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, back: { color: '#1E1D24', fontSize: 32, lineHeight: 36 }, title: { color: '#1E1D24', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  eyebrow: { color: '#777681', fontSize: 12, marginTop: 12 }, courseTitle: { color: '#1E1D24', fontSize: 21, fontFamily: fontFamilies.pretendardBold }, body: { color: '#55545F', fontSize: 13, lineHeight: 20 },
  tags: { flexDirection: 'row', gap: 7 }, tag: { backgroundColor: '#F0F0F2', color: '#55545F', borderRadius: 5, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5, fontSize: 11 },
  map: { height: 180, backgroundColor: '#F1F2F3', borderRadius: 13, overflow: 'hidden' }, mapEmpty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }, mapEmptyText: { color: '#777681', fontSize: 12 }, mapBadge: { position: 'absolute', right: 8, top: 8, backgroundColor: '#FFFE', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 }, mapBadgeText: { color: '#55545F', fontSize: 10 },
  metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 10, padding: 11, gap: 5 }, metricLabel: { color: '#777681', fontSize: 11 }, metricValue: { color: '#1E1D24', fontSize: 14, fontFamily: fontFamilies.pretendardBold },
  notice: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 10, padding: 14 }, error: { color: '#A13A2F', fontSize: 12, lineHeight: 18 },
  button: { height: 50, backgroundColor: purple, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.5 }, buttonText: { color: '#FFF', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, outline: { height: 50, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, outlineText: { color: '#1E1D24', fontSize: 14, fontFamily: fontFamilies.pretendardBold },
  startCard: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 12, padding: 14, gap: 10 }, input: { height: 45, borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 8, paddingHorizontal: 12, fontSize: 14, color: '#1E1D24' },
  choices: { flexDirection: 'row', gap: 7 }, choice: { flex: 1, borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }, choiceSelected: { backgroundColor: '#F0EEFC', borderColor: purple }, choiceText: { color: '#777681', fontSize: 12 }, choiceTextSelected: { color: purple, fontFamily: fontFamilies.pretendardBold },
});
