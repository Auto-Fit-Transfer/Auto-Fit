import { Text } from '@/src/components/common';
import { sessionLocalDate, sessionMinutes } from '@/src/features/exercise/weeklyMetrics';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getExerciseHistory } from '@/src/api/exercise';
import { getApiErrorMessage } from '@/src/api/client';
import { MainHeader, MainScreen, mainStyles } from '@/src/components/main/MainSurface';
export default function History() {
  const router = useRouter();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getExerciseHistory>>['history']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    const end = new Date(),
      start = new Date();
    start.setDate(end.getDate() - 29);
    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    void getExerciseHistory(key(start), key(end))
      .then((r) => {
        if (live) setRows(r.history ?? []);
      })
      .catch((e) => {
        if (live) setError(getApiErrorMessage(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [retry]);
  return (
    <MainScreen tabs={false}>
      <MainHeader title="운동 기록" height={110} back={() => router.back()} />
      <View style={mainStyles.content}>
        <Text style={mainStyles.sectionTitle}>최근 30일 기록</Text>
        {loading ? (
          <Text style={mainStyles.text}>기록을 불러오는 중이에요.</Text>
        ) : error ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setLoading(true);
              setError('');
              setRetry((v) => v + 1);
            }}
          >
            <Text style={mainStyles.text}>{error} · 다시 시도</Text>
          </Pressable>
        ) : rows.length === 0 ? (
          <View style={mainStyles.card}>
            <Text style={mainStyles.text}>아직 기록한 운동이 없어요.</Text>
          </View>
        ) : (
          rows.map(({ session, logs }, index) => (
            <View
              key={String(session.exercise_session_id ?? index)}
              style={[mainStyles.card, { gap: 8 }]}
            >
              <Text style={mainStyles.sectionTitle}>
                {sessionLocalDate(session.started_at ?? session.created_at)}
              </Text>
              <Text style={mainStyles.text}>
                {String(session.status ?? '')} · 운동 {logs.length}개
              </Text>
              <Text style={mainStyles.text}>
                {sessionMinutes(session.total_duration_seconds) === null
                  ? '시간 미기록'
                  : `${sessionMinutes(session.total_duration_seconds)}분`}
              </Text>
            </View>
          ))
        )}
      </View>
    </MainScreen>
  );
}
