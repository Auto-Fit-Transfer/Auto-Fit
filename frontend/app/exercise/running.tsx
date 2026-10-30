import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveRunningSession, getRunningApiErrorMessage, getRunningRecommendations, getSavedRunningCourses, startFreeRun, type RunningCourse, type RunningDistanceOption, type RunningSavedCourse, type RunningSession } from '@/src/api/running';
import { fontFamilies } from '@/src/theme';

const purple = '#503DD7';
const distanceOptions: RunningDistanceOption[] = ['3km', '5km', '10km'];
const nameOf = (course: RunningCourse) => course.course_name || course.name || '이름 없는 코스';

export default function RunningRecommendations() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [region, setRegion] = useState('');
  const [distance, setDistance] = useState<RunningDistanceOption>('5km');
  const [minutes, setMinutes] = useState('30');
  const [intensity, setIntensity] = useState<'light' | 'moderate' | 'hard'>('light');
  const [condition, setCondition] = useState<'good' | 'normal' | 'tired'>('normal');
  const [activeSession, setActiveSession] = useState<RunningSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [courses, setCourses] = useState<RunningCourse[]>([]);
  const [savedCourses, setSavedCourses] = useState<RunningSavedCourse[]>([]);
  const [message, setMessage] = useState('지역과 거리를 선택하면 실제 코스를 찾아드려요.');
  const [loading, setLoading] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void getActiveRunningSession().then((result) => {
      if (active) setActiveSession(result.session);
    }).catch(() => {});
    void getSavedRunningCourses().then((result) => {
      if (active) setSavedCourses(result.courses ?? []);
    }).catch(() => {});
    return () => { active = false; };
  }, []));
  const search = async () => {
    if (!region.trim()) { setMessage('러닝할 지역을 입력해 주세요.'); return; }
    setLoading(true);
    setCourses([]);
    setMessage('');
    try {
      const result = await getRunningRecommendations(region.trim(), distance);
      setCourses(result.courses ?? []);
      if (result.status === 'generation_required') setMessage('이 조건에 맞는 공식 코스가 없어요. 자동 코스 생성은 출발 위치 선택 기능을 연결한 뒤 사용할 수 있어요.');
      else if (!result.courses?.length) setMessage('추천 가능한 코스를 찾지 못했어요. 다른 지역이나 거리를 선택해 주세요.');
    } catch (cause) {
      setMessage(getRunningApiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };
  const start = async () => {
    const targetMinutes = Number(minutes);
    if (!Number.isInteger(targetMinutes) || targetMinutes < 10 || targetMinutes > 240) {
      setMessage('목표 시간은 10~240분으로 입력해 주세요.');
      return;
    }
    setStarting(true);
    setMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMessage('러닝 거리를 기록하려면 앱 사용 중 위치 권한이 필요해요.');
        return;
      }
      if (!await Location.hasServicesEnabledAsync()) {
        setMessage('기기의 위치 서비스를 켠 뒤 다시 시도해 주세요.');
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
      router.push({ pathname: '/exercise/run-live', params: { sessionId: result.session.running_session_id } });
    } catch (cause) {
      setMessage(getRunningApiErrorMessage(cause));
      void getActiveRunningSession().then((result) => setActiveSession(result.session)).catch(() => {});
    } finally {
      setStarting(false);
    }
  };

  return <View style={styles.root}>
    <StatusBar style="dark" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 38 }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>러닝 추천</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={styles.sectionTitle}>어디서 달릴까요?</Text>
      <TextInput accessibilityLabel="러닝 지역" placeholder="예: 성남시, 서울숲" value={region} onChangeText={setRegion} maxLength={120} style={styles.input} />
      <Text style={styles.sectionTitle}>목표 거리</Text>
      <View style={styles.options}>{distanceOptions.map((option) =>
        <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: distance === option }} onPress={() => setDistance(option)} style={[styles.option, distance === option && styles.selected]}>
          <Text style={[styles.optionText, distance === option && styles.selectedText]}>{option}</Text>
        </Pressable>)}</View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>코스 없이 자유 러닝</Text>
        <Text style={styles.caption}>앱이 열려 있는 동안 GPS로 이동 거리와 시간을 기록해요.</Text>
        <Text style={styles.meta}>목표 시간 · 분</Text>
        <TextInput accessibilityLabel="목표 러닝 시간(분)" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} style={styles.input} />
        <Text style={styles.meta}>강도</Text>
        <View style={styles.options}>{([['light', '가볍게'], ['moderate', '보통'], ['hard', '강하게']] as const).map(([value, label]) =>
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: intensity === value }} onPress={() => setIntensity(value)} style={[styles.option, intensity === value && styles.selected]}>
            <Text style={[styles.optionText, intensity === value && styles.selectedText]}>{label}</Text>
          </Pressable>)}</View>
        <Text style={styles.meta}>오늘 컨디션</Text>
        <View style={styles.options}>{([['good', '좋음'], ['normal', '보통'], ['tired', '피곤함']] as const).map(([value, label]) =>
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: condition === value }} onPress={() => setCondition(value)} style={[styles.option, condition === value && styles.selected]}>
            <Text style={[styles.optionText, condition === value && styles.selectedText]}>{label}</Text>
          </Pressable>)}</View>
        {activeSession ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/run-live', params: { sessionId: activeSession.running_session_id } })} style={styles.button}><Text style={styles.buttonText}>진행 중인 러닝 이어하기</Text></Pressable> :
          <Pressable accessibilityRole="button" disabled={starting} onPress={() => void start()} style={[styles.button, starting && { opacity: 0.6 }]}><Text style={styles.buttonText}>{starting ? '준비 중…' : '자유 러닝 시작하기'}</Text></Pressable>}
      </View>
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => void search()} style={[styles.button, loading && { opacity: 0.6 }]}><Text style={styles.buttonText}>코스 추천받기</Text></Pressable>
      {loading ? <ActivityIndicator color={purple} /> : null}
      {message ? <View style={styles.notice}><Text style={styles.body}>{message}</Text></View> : null}
      {courses.length > 0 ? <Text style={styles.sectionTitle}>추천 코스 {courses.length}개</Text> : null}
      {courses.map((course, index) => <Pressable accessibilityRole="button" accessibilityLabel={`${nameOf(course)} 코스 자세히 보기`} onPress={() => router.push({ pathname: '/exercise/running-course', params: { courseId: course.course_id } })} key={course.course_id || String(index)} style={styles.card}>
        <Text style={styles.courseTitle}>{nameOf(course)}</Text>
        <Text style={styles.meta}>{[course.region, typeof course.distance_km === 'number' ? `${course.distance_km}km` : null, typeof course.estimated_duration_minutes === 'number' ? `약 ${course.estimated_duration_minutes}분` : null, course.difficulty].filter(Boolean).join(' · ')}</Text>
        {course.description ? <Text style={styles.body}>{course.description}</Text> : null}
        <Text style={styles.courseLink}>코스 보기 · 경로 확인 · 저장  ›</Text>
      </Pressable>)}
      {savedCourses.length > 0 ? <Text style={styles.sectionTitle}>저장한 러닝 코스</Text> : null}
      {savedCourses.map((saved) => <Pressable key={saved.running_saved_course_id} accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/running-course', params: { savedId: saved.running_saved_course_id } })} style={styles.card}>
        <View style={styles.savedHeading}><Text style={styles.courseTitle}>{saved.course_name}</Text>{saved.is_selected ? <Text style={styles.savedBadge}>선택됨</Text> : null}</View>
        <Text style={styles.meta}>{[saved.snapshot.region, typeof saved.snapshot.distance_km === 'number' ? `${saved.snapshot.distance_km}km` : null].filter(Boolean).join(' · ') || '경로 자세히 보기'}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { paddingHorizontal: 20, gap: 17 },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 32, color: '#1E1D24', lineHeight: 36 },
  title: { color: '#1E1D24', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  sectionTitle: { color: '#1E1D24', fontSize: 17, fontFamily: fontFamilies.pretendardBold },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 10, paddingHorizontal: 13, height: 49, fontSize: 14, color: '#1E1D24' },
  options: { flexDirection: 'row', gap: 9 },
  option: { flex: 1, borderWidth: 1, borderColor: '#E4E5EB', backgroundColor: '#FFF', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  selected: { borderColor: purple, backgroundColor: '#F0EEFC' },
  optionText: { color: '#777681', fontSize: 13 },
  selectedText: { color: purple, fontFamily: fontFamilies.pretendardBold },
  button: { backgroundColor: purple, borderRadius: 10, height: 50, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 15, fontFamily: fontFamilies.pretendardBold },
  notice: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 14, padding: 16 },
  body: { color: '#1E1D24', fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 15, padding: 16, gap: 8 },
  courseTitle: { color: '#1E1D24', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  courseLink: { color: purple, fontSize: 12, fontFamily: fontFamilies.pretendardSemiBold, marginTop: 4 }, savedHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, savedBadge: { backgroundColor: '#F0EEFC', color: purple, borderRadius: 6, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4, fontSize: 10 },
  meta: { color: '#777681', fontSize: 12 },
  caption: { color: '#777681', fontSize: 12, lineHeight: 18 },
});
