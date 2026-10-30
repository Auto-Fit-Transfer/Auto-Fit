import { memo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { useRunningSession } from '@/src/features/running/useRunningSession';
import { routePolyline } from '@/src/features/running/courseRoute';
import type { RunningPlannedCourse, RunningTrackPoint } from '@/src/api/running';
import { fontFamilies } from '@/src/theme';

const purple = '#503DD7';
const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const rest = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};
const formatPace = (seconds: number | null) => {
  if (!seconds || !Number.isFinite(Number(seconds))) return '—';
  const rounded = Math.round(Number(seconds));
  return `${Math.floor(rounded / 60)}'${String(rounded % 60).padStart(2, '0')}''`;
};

const RouteCard = memo(function RouteCard({ points, plannedCourse, width }: { points: RunningTrackPoint[]; plannedCourse: RunningPlannedCourse | null; width: number }) {
  const height = 220;
  const actual = points.map(({ latitude, longitude }) => ({ latitude, longitude }));
  const planned = plannedCourse?.path ?? [];
  const bounds = [...planned, ...actual];
  const plannedLine = routePolyline(planned, width, height, bounds);
  const actualLine = routePolyline(actual, width, height, bounds);
  const actualEnds = actualLine.split(' ');
  return <View style={styles.routeCard}>
    <Text style={styles.routeTitle}>{plannedCourse ? `${plannedCourse.name} · 예정 경로` : 'GPS 이동 경로'}</Text>
    {!plannedLine && !actualLine ? <View style={styles.routeEmpty}><Text style={styles.routeEmptyText}>위치 신호를 받으면 실제 이동 경로가 여기에 표시돼요.</Text></View> :
      <Svg width={width} height={height} accessibilityLabel={plannedLine ? '예정 경로와 실제 GPS 이동 경로' : '실제 GPS 이동 경로'}>
        {plannedLine ? <Polyline points={plannedLine} fill="none" stroke="#A9ACB3" strokeDasharray="6 5" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {actualLine ? <><Polyline points={actualLine} fill="none" stroke="#74E3AE" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={Number(actualEnds[0].split(',')[0])} cy={Number(actualEnds[0].split(',')[1])} r={6} fill="#FFF" />
          <Circle cx={Number(actualEnds.at(-1)?.split(',')[0])} cy={Number(actualEnds.at(-1)?.split(',')[1])} r={7} fill="#503DD7" stroke="#FFF" strokeWidth={2} /></> : null}
      </Svg>}
    <Text style={styles.routeCaption}>{plannedLine ? '점선: 예정 경로 · 초록색: 실제 이동' : `${points.length}개 위치 기록`} · 앱 사용 중에만 수집</Text>
  </View>;
});

export default function RunLive() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session, points, plannedCourse, loading, busy, error, elapsedSeconds, pause, resume, complete } = useRunningSession(sessionId);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const endRun = async () => {
    setConfirmEnd(false);
    if (await complete()) router.replace({ pathname: '/exercise/run-result', params: { sessionId } });
  };
  const leave = async () => {
    if (session?.status === 'in_progress') await pause();
    router.back();
  };

  return <View style={styles.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => void leave()}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>러닝하기</Text>
        <Text style={styles.liveBadge}>{session?.status === 'in_progress' ? '기록 중' : '일시정지'}</Text>
      </View>
      {loading ? <ActivityIndicator color={purple} /> : !session ? <Text style={styles.error}>{error || '러닝 기록을 찾지 못했어요.'}</Text> : <>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>운동 시간</Text>
          <Text style={styles.heroTime}>{formatTime(elapsedSeconds)}</Text>
          <View style={styles.metrics}>
            <View><Text style={styles.metric}>{(Number(session.distance_meters) / 1000).toFixed(2)}</Text><Text style={styles.metricLabel}>거리 · km</Text></View>
            <View><Text style={styles.metric}>{formatPace(session.average_pace_seconds_per_km)}</Text><Text style={styles.metricLabel}>평균 페이스 · /km</Text></View>
          </View>
        </View>
        <RouteCard points={points} plannedCourse={plannedCourse} width={Math.max(200, width - 72)} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.hint}>화면을 벗어나거나 앱이 백그라운드로 가면 러닝이 일시정지돼요.</Text>
        {session.status === 'in_progress' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void pause()} style={styles.primary}><Text style={styles.primaryText}>{busy ? '처리 중…' : '일시정지'}</Text></Pressable> :
          session.status === 'paused' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void resume()} style={styles.primary}><Text style={styles.primaryText}>{busy ? '처리 중…' : '러닝 계속하기'}</Text></Pressable> : null}
        {session.status === 'completed' ? <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/exercise/run-result', params: { sessionId } })} style={styles.primary}><Text style={styles.primaryText}>완료 기록 보기</Text></Pressable> :
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirmEnd(true)} style={styles.secondary}><Text style={styles.secondaryText}>러닝 종료하고 저장</Text></Pressable>}
      </>}
    </ScrollView>
    <ConfirmDialog visible={confirmEnd} title="러닝을 종료할까요?" description="지금까지 기록된 시간과 GPS 이동 경로를 저장합니다." secondaryLabel="계속 달리기" primaryLabel="종료하고 저장" onSecondary={() => setConfirmEnd(false)} onPrimary={() => void endRun()} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { paddingHorizontal: 20, gap: 18 },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 32, color: '#1E1D24', lineHeight: 36 },
  headerTitle: { color: '#1E1D24', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  liveBadge: { backgroundColor: '#F0EEFC', color: purple, fontSize: 11, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7 },
  hero: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 16, padding: 22, alignItems: 'center', gap: 12 },
  heroLabel: { color: '#777681', fontSize: 13 },
  heroTime: { color: '#1E1D24', fontSize: 50, fontFamily: fontFamilies.pretendardBold, fontVariant: ['tabular-nums'] },
  metrics: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', borderTopWidth: 1, borderTopColor: '#E4E5EB', paddingTop: 18 },
  metric: { color: '#1E1D24', fontSize: 24, fontFamily: fontFamilies.pretendardBold, textAlign: 'center' },
  metricLabel: { color: '#777681', fontSize: 12, textAlign: 'center', marginTop: 4 },
  routeCard: { backgroundColor: '#1D2025', borderRadius: 16, padding: 16, overflow: 'hidden' },
  routeTitle: { color: '#FFF', fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  routeEmpty: { height: 220, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  routeEmptyText: { color: '#B9BCC2', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  routeCaption: { color: '#B9BCC2', fontSize: 11 },
  error: { color: '#A13A2F', fontSize: 13, lineHeight: 20 },
  hint: { color: '#777681', fontSize: 12, lineHeight: 18 },
  primary: { height: 51, backgroundColor: purple, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontSize: 15, fontFamily: fontFamilies.pretendardBold },
  secondary: { height: 48, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#1E1D24', fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold },
});
