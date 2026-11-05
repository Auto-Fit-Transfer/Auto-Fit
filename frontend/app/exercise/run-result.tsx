import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRunningApiErrorMessage, getRunningSession, type RunningSession, type RunningTrackPoint } from '@/src/api/running';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';

const duration = (seconds: number) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return total >= 3600
    ? `${Math.floor(total / 3600)}시간 ${Math.floor(total % 3600 / 60)}분`
    : `${Math.floor(total / 60)}분 ${total % 60}초`;
};
const pace = (seconds: number | null) => seconds && Number.isFinite(Number(seconds))
  ? `${Math.floor(Number(seconds) / 60)}분 ${Math.round(Number(seconds) % 60)}초/km` : '측정 전';

export default function RunResult() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<RunningSession | null>(null);
  const [points, setPoints] = useState<RunningTrackPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    void getRunningSession(sessionId)
      .then((result) => { if (active) { setSession(result.session); setPoints(result.points ?? []); setError(''); } })
      .catch((cause) => { if (active) setError(getRunningApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry, sessionId]);

  return <View style={styles.root}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 }]}>
      <View style={styles.header}>
        <Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="운동 화면으로" onPress={() => router.replace('/exercise')}><CaretLeftIcon color={colors.textPrimary} height={24} width={24} /></Pressable>
        <Text style={styles.title}>러닝 완료</Text>
        <View style={{ width: 24 }} />
      </View>
      {sessionId && loading ? <ActivityIndicator color={colors.primaryText} /> : !sessionId ? <Text style={styles.error}>러닝 기록 ID가 없습니다.</Text> : error ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }} style={styles.card}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable> :
        session?.status !== 'completed' ? <View style={styles.card}><Text style={styles.body}>아직 완료된 러닝이 아니에요.</Text></View> : <>
          <View style={styles.hero}><Text style={styles.eyebrow}>오늘의 러닝 기록</Text><Text style={styles.distance}>{(Number(session.distance_meters) / 1000).toFixed(2)} km</Text><Text style={styles.caption}>GPS로 확인된 이동 거리</Text></View>
          <View style={styles.card}>
            <View style={styles.row}><Text style={styles.body}>운동 시간</Text><Text style={styles.value}>{duration(session.elapsed_seconds)}</Text></View>
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.body}>평균 페이스</Text><Text style={styles.value}>{pace(session.average_pace_seconds_per_km)}</Text></View>
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.body}>기록된 GPS 위치</Text><Text style={styles.value}>{points.length}개</Text></View>
          </View>
          <Text style={styles.caption}>위치 정확도가 낮거나 비정상적으로 튄 좌표는 거리에 반영하지 않았어요. 칼로리는 검증된 계산 기준이 준비될 때까지 표시하지 않습니다.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/exercise')} style={styles.button}><Text style={styles.buttonText}>운동 화면으로</Text></Pressable>
        </>}
    </ScrollView>
  </View>;
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, gap: 18 },
    header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { fontSize: 32, color: colors.textPrimary, lineHeight: 36 },
    title: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    hero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, alignItems: 'center', padding: 28, gap: 8 },
    eyebrow: { color: colors.textSecondary, fontSize: 14 },
    distance: { color: colors.textPrimary, fontSize: 38, fontFamily: fontFamilies.pretendardBold },
    caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 19 },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 18, gap: 15 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    body: { color: colors.textSecondary, fontSize: 14 },
    value: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    divider: { height: 1, backgroundColor: colors.border },
    error: { color: colors.danger, fontSize: 14 },
    button: { backgroundColor: colors.primary, borderRadius: 12, height: 56, justifyContent: 'center', alignItems: 'center' },
    buttonText: { color: '#FFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  } as const;
}
