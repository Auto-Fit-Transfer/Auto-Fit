import { memo, useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { aForm } from '@/src/components/a/form';
import { RunLiveView } from '@/src/components/a/RunViews';
import { KakaoLiveMap } from '@/src/components/exercise/KakaoRouteMap';
import { runClock, runKm, runPace, runProgress } from '@/src/features/a/runFormat';
import { useRunningSession, type LiveLocation } from '@/src/features/running/useRunningSession';
import { KAKAO_MAP_JS_KEY } from '@/src/features/running/kakaoMap';
import { gpsNotice } from '@/src/features/running/liveTracking';
import { routePolyline } from '@/src/features/running/courseRoute';
import type { RunningPlannedCourse, RunningTrackPoint } from '@/src/api/running';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

// The map of a run going on: the real map, or the two lines alone when it cannot be shown.
// It fills the box the screen gives it.
const RouteMap = memo(function RouteMap({ points, plannedCourse, currentLocation }: { points: RunningTrackPoint[]; plannedCourse: RunningPlannedCourse | null; currentLocation: LiveLocation | null }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [mapFailed, setMapFailed] = useState(!KAKAO_MAP_JS_KEY);
  const [mapReady, setMapReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const failMap = useCallback(() => setMapFailed(true), []);
  const readyMap = useCallback(() => setMapReady(true), []);
  const retryMap = () => { setMapReady(false); setMapFailed(false); setAttempt((count) => count + 1); };
  const actual = points.map(({ latitude, longitude }) => ({ latitude, longitude }));
  const planned = plannedCourse?.path ?? [];

  const diagram = () => {
    const { width, height } = box;
    if (!width || !height) return null;
    const here = currentLocation ?? actual.at(-1) ?? null;
    const bounds = [...planned, ...actual, ...(here ? [here] : [])];
    const plannedLine = routePolyline(planned, width, height, bounds);
    const actualLine = routePolyline(actual, width, height, bounds);
    const actualEnds = actualLine.split(' ');
    return <Svg width={width} height={height} accessibilityLabel={plannedLine ? '예정 경로와 실제 GPS 이동 경로 도식' : '실제 GPS 이동 경로 도식'}>
      {/* Ahead of me: dots. Behind me: the dark line with violet on it, the colour of how far I am. */}
      {plannedLine ? <Polyline points={plannedLine} fill="none" stroke={colors.ink} strokeDasharray="2 10" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" /> : null}
      {actualLine ? <><Polyline points={actualLine} fill="none" stroke={colors.ink} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
        <Polyline points={actualLine} fill="none" stroke={colors.primary} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={Number(actualEnds[0].split(',')[0])} cy={Number(actualEnds[0].split(',')[1])} r={6} fill="#FFF" stroke={colors.ink} strokeWidth={3} />
        <Circle cx={Number(actualEnds.at(-1)?.split(',')[0])} cy={Number(actualEnds.at(-1)?.split(',')[1])} r={7} fill={colors.primary} stroke={colors.ink} strokeWidth={3} /></>
        // One position has no line to draw, so the marker alone sits in the middle.
        : here && !plannedLine ? <Circle cx={width / 2} cy={height / 2} r={7} fill={colors.primary} stroke={colors.ink} strokeWidth={3} /> : null}
    </Svg>;
  };

  // No alignItems on the box: the WebView's own wrapper is flex: 1, and centring it collapses its width to 0.
  return <View onLayout={(event) => setBox({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })} style={styles.map}>
    {mapFailed ? diagram()
      : <KakaoLiveMap key={attempt} currentLocation={currentLocation} accuracyMeters={currentLocation?.accuracy} acceptedPath={actual} plannedPath={planned} onFailure={failMap} onReady={readyMap} />}
    {!mapFailed && !mapReady ? <View style={styles.mapLoading}><ActivityIndicator color={colors.ink} /><Text style={styles.note}>지도를 불러오고 있어요.</Text></View> : null}
    {mapFailed ? <View style={styles.mapFailed}>
      <Text style={[styles.note, styles.grow]}>지도를 불러오지 못했어요 · 경로 도식</Text>
      {KAKAO_MAP_JS_KEY ? <Pressable accessibilityRole="button" hitSlop={8} onPress={retryMap} style={styles.mini}><Text style={styles.miniText}>다시 시도</Text></Pressable> : null}
    </View> : null}
  </View>;
});

// Renewal A, while I run (src/components/a/RunViews.tsx shows it): this screen keeps the run going
// and hands over its numbers.
export default function RunLive() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const { session, points, plannedCourse, loading, busy, error, elapsedSeconds, currentLocation, rejection, preciseOff, pause, resume, complete } = useRunningSession(sessionId);
  const notice = gpsNotice({ tracking: session?.status === 'in_progress', hasLocation: currentLocation !== null, accuracyMeters: currentLocation?.accuracy, rejection, preciseOff });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const endRun = async () => {
    setConfirmEnd(false);
    if (await complete()) router.replace({ pathname: '/exercise/run-result', params: { sessionId } });
  };
  const leave = async () => {
    if (session?.status === 'in_progress') await pause();
    router.back();
  };
  const progress = session ? runProgress(session.distance_meters, plannedCourse?.target_distance_meters) : null;

  return <>
    <RunLiveView
      busy={busy}
      clock={runClock(elapsedSeconds)}
      course={progress ? { ratio: progress.ratio, left: progress.finished ? '코스를 다 달렸어요' : `남은 거리 ${runKm(progress.left)}km` } : null}
      error={session ? error || null : null}
      finished={session?.status === 'completed'}
      held={session?.status !== 'in_progress'}
      km={runKm(session?.distance_meters)}
      loading={loading}
      map={<RouteMap points={points} plannedCourse={plannedCourse} currentLocation={currentLocation} />}
      missing={session ? null : error || '러닝 기록을 찾지 못했어요.'}
      notice={notice || null}
      onBack={() => void leave()}
      onEnd={() => setConfirmEnd(true)}
      onResult={() => router.replace({ pathname: '/exercise/run-result', params: { sessionId } })}
      onToggle={() => void (session?.status === 'in_progress' ? pause() : resume())}
      pace={runPace(session?.average_pace_seconds_per_km)}
      title={plannedCourse?.name ?? '자유 러닝'}
    />
    <ConfirmDialog visible={confirmEnd} title="러닝을 끝낼까요?" description="지금까지 달린 기록을 저장해요." secondaryLabel="계속 달리기" primaryLabel="끝내고 저장" onSecondary={() => setConfirmEnd(false)} onPrimary={() => void endRun()} />
  </>;
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    map: { flex: 1 },
    mapLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', backgroundColor: colors.surface, gap: 8, justifyContent: 'center' },
    mapFailed: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 12,
      borderWidth: 2,
      bottom: 10,
      flexDirection: 'row',
      gap: 8,
      left: 10,
      paddingLeft: 12,
      paddingRight: 6,
      paddingVertical: 6,
      position: 'absolute',
      right: 10,
    },
    mini: a.mini,
    miniText: a.miniText,
    note: a.note,
    grow: { flex: 1 },
  } as const;
}
