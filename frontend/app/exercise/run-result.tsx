import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RunDoneView } from '@/src/components/a/RunViews';
import { getRunningApiErrorMessage, getRunningSession, type RunningPlannedCourse, type RunningSession, type RunningTrackPoint } from '@/src/api/running';
import { runClock, runKm, runPace, runProgress } from '@/src/features/a/runFormat';

// Renewal A, after a run (src/components/a/RunViews.tsx shows it). Opened from the list of past runs
// (from=history) the button goes back there; after a run it goes home.
export default function RunResult() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string; from?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const fromHistory = params.from === 'history';
  const [session, setSession] = useState<RunningSession | null>(null);
  const [points, setPoints] = useState<RunningTrackPoint[]>([]);
  const [course, setCourse] = useState<RunningPlannedCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    void getRunningSession(sessionId)
      .then((result) => { if (active) { setSession(result.session); setPoints(result.points ?? []); setCourse(result.planned_course ?? null); setError(''); } })
      .catch((cause) => { if (active) setError(getRunningApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry, sessionId]);
  const done = session?.status === 'completed' ? session : null;
  const whole = done ? runProgress(done.distance_meters, course?.target_distance_meters)?.finished : false;

  return <RunDoneView
    clock={runClock(done?.elapsed_seconds)}
    courseName={course?.name ?? null}
    km={runKm(done?.distance_meters)}
    leaveLabel={fromHistory ? '기록으로' : '홈으로'}
    loading={Boolean(sessionId) && loading}
    onLeave={() => (fromHistory ? router.back() : router.replace('/home'))}
    pace={runPace(done?.average_pace_seconds_per_km)}
    path={points.map(({ latitude, longitude }) => ({ latitude, longitude }))}
    problem={!sessionId ? { text: '러닝 기록을 찾지 못했어요.' }
      : error ? { text: error, onRetry: () => { setLoading(true); setRetry((value) => value + 1); } }
        : !done ? { text: '아직 완료된 러닝이 아니에요.' } : null}
    whole={Boolean(whole)}
  />;
}
