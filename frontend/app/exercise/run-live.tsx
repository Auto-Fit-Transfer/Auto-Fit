import { memo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { useRunningSession } from '@/src/features/running/useRunningSession';
import { routePolyline } from '@/src/features/running/courseRoute';
import type { RunningPlannedCourse, RunningTrackPoint } from '@/src/api/running';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
        {actualLine ? <><Polyline points={actualLine} fill="none" stroke={colors.textPrimary} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={Number(actualEnds[0].split(',')[0])} cy={Number(actualEnds[0].split(',')[1])} r={6} fill="#FFF" />
          <Circle cx={Number(actualEnds.at(-1)?.split(',')[0])} cy={Number(actualEnds.at(-1)?.split(',')[1])} r={7} fill={colors.primary} stroke="#FFF" strokeWidth={2} /></> : null}
      </Svg>}
    <Text style={styles.routeCaption}>{plannedLine ? '점선: 예정 경로 · 실선: 실제 이동' : `${points.length}개 위치 기록`} · 앱 사용 중에만 수집</Text>
  </View>;
});

export default function RunLive() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
    <ScreenHeader onBack={() => void leave()} title="러닝하기" right={<Text style={styles.liveBadge}>{session?.status === 'in_progress' ? '기록 중' : '일시정지'}</Text>} />
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 32 }]}>
      {loading ? <ActivityIndicator color={colors.primaryText} /> : !session ? <Text style={styles.error}>{error || '러닝 기록을 찾지 못했어요.'}</Text> : <>
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

function createStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, gap: 18 },
    liveBadge: { backgroundColor: colors.primaryLight, color: colors.textPrimary, fontSize: 12, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
    hero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 22, alignItems: 'center', gap: 12 },
    heroLabel: { color: colors.textSecondary, fontSize: 14 },
    heroTime: { color: colors.textPrimary, fontSize: 64, fontFamily: fontFamilies.pretendardBold, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
    metrics: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18 },
    metric: { color: colors.textPrimary, fontSize: 22, fontFamily: fontFamilies.pretendardBold, textAlign: 'center' },
    metricLabel: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 4 },
    routeCard: { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 16, overflow: 'hidden' },
    routeTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    routeEmpty: { height: 220, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    routeEmptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    routeCaption: { color: colors.textSecondary, fontSize: 12 },
    error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    hint: { color: colors.textSecondary, fontSize: 14, lineHeight: 18 },
    primary: { height: 56, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: '#FFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    secondary: { height: 56, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
  } as const;
}
