import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { getApiErrorMessage } from '@/src/api/client';
import { getExerciseHistory } from '@/src/api/exercise';
import { AppButton, Badge, Text } from '@/src/components/common';
import { SurfaceCard } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import { sessionMinutes } from '@/src/features/exercise/weeklyMetrics';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type HistoryRow = Awaited<ReturnType<typeof getExerciseHistory>>['history'][number];

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const statusLabels: Record<string, { label: string; tone: 'good' | 'neutral' }> = {
  completed: { label: '완료', tone: 'good' },
  in_progress: { label: '진행 중', tone: 'neutral' },
};

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "10월 22일 수요일"
function sessionDay(value: unknown) {
  if (typeof value !== 'string') return '날짜 기록 없음';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '날짜 기록 없음';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekdays[d.getDay()]}요일`;
}

function exerciseNames(logs: unknown[]) {
  return logs
    .map((log) =>
      log &&
      typeof log === 'object' &&
      typeof (log as Record<string, unknown>).exercise_name === 'string'
        ? ((log as Record<string, unknown>).exercise_name as string)
        : null,
    )
    .filter((name): name is string => Boolean(name));
}

// Figma E9 (운동 기록) for the last 30 days. Saved routines and the week calendar wait for
// server support.
export default function History() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    const end = new Date(),
      start = new Date();
    start.setDate(end.getDate() - 29);
    void getExerciseHistory(dateKey(start), dateKey(end))
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

  const totalMinutes = rows.reduce(
    (sum, { session }) => sum + (sessionMinutes(session.total_duration_seconds) ?? 0),
    0,
  );

  return (
    <SubScreen gap={16} onBack={() => router.back()} title="운동 기록">
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.caption}>최근 30일</Text>
          <Text style={styles.summaryValue}>{loading || error ? '-' : `${rows.length}번`}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.caption}>운동 시간</Text>
          <Text style={styles.summaryValue}>
            {loading || error ? '-' : `${Math.round(totalMinutes)}분`}
          </Text>
        </View>
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : error ? (
        <SurfaceCard gap={12}>
          <Text style={styles.body}>{error}</Text>
          <AppButton
            fullWidth={false}
            onPress={() => {
              setLoading(true);
              setError('');
              setRetry((v) => v + 1);
            }}
            size="M"
            title="다시 시도"
            variant="outline"
          />
        </SurfaceCard>
      ) : rows.length === 0 ? (
        <SurfaceCard>
          <Text style={styles.body}>아직 기록한 운동이 없어요.</Text>
        </SurfaceCard>
      ) : (
        rows.map(({ session, logs }, index) => {
          const minutes = sessionMinutes(session.total_duration_seconds);
          const status = statusLabels[String(session.status ?? '')];
          const names = exerciseNames(logs);
          return (
            <SurfaceCard key={String(session.exercise_session_id ?? index)} gap={6}>
              <View style={styles.cardTop}>
                <Text style={[styles.strong, styles.flex]}>
                  {sessionDay(session.started_at ?? session.created_at)}
                </Text>
                {status ? <Badge label={status.label} tone={status.tone} /> : null}
              </View>
              <Text style={styles.caption}>
                {minutes === null ? '시간 기록 없음' : `${Math.round(minutes)}분`} · {logs.length}
                가지
              </Text>
              {names.length > 0 ? <Text style={styles.body}>{names.join(' · ')}</Text> : null}
            </SurfaceCard>
          );
        })
      )}
    </SubScreen>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1 },
    caption: { ...text.caption, color: colors.textSecondary },
    body: { ...text.body2, color: colors.textBody },
    strong: { ...text.body1Strong, color: colors.textPrimary },
    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryBox: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flex: 1,
      gap: 2,
      padding: 14,
    },
    summaryValue: { ...text.title2, color: colors.textPrimary },
    loading: { alignItems: 'center', paddingVertical: 40 },
    cardTop: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  } as const;
}
