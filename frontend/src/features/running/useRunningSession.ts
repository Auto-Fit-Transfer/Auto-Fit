import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import {
  addRunningTrackPoint, completeRunningSession, getRunningSession,
  getRunningApiErrorMessage, pauseRunningSession, resumeRunningSession,
  type RunningPlannedCourse, type RunningSession, type RunningTrackPoint,
} from '@/src/api/running';

export function useRunningSession(sessionId: string) {
  const [session, setSession] = useState<RunningSession | null>(null);
  const [points, setPoints] = useState<RunningTrackPoint[]>([]);
  const [plannedCourse, setPlannedCourse] = useState<RunningPlannedCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const sessionRef = useRef<RunningSession | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const queuedRef = useRef<Promise<void>>(Promise.resolve());
  const baseRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const trackingHaltedRef = useRef(false);

  const elapsedNow = useCallback(() =>
    baseRef.current + (segmentStartRef.current === null ? 0
      : Math.max(0, Math.floor((Date.now() - segmentStartRef.current) / 1000))), []);

  const applySession = useCallback((next: RunningSession) => {
    sessionRef.current = next;
    if (mountedRef.current) setSession(next);
  }, []);

  const stopWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
  }, []);

  const haltAfterError = useCallback(async (message: string) => {
    if (sessionRef.current?.status !== 'in_progress' || trackingHaltedRef.current) return;
    trackingHaltedRef.current = true;
    const frozen = elapsedNow();
    baseRef.current = frozen;
    segmentStartRef.current = null;
    stopWatch();
    if (mountedRef.current) {
      setElapsedSeconds(frozen);
      setError(message);
    }
    try {
      const response = await pauseRunningSession(sessionId, frozen);
      applySession(response.session);
    } catch {
      // Keep the error visible; the user can retry the pause once connected.
    }
  }, [applySession, elapsedNow, sessionId, stopWatch]);

  const startWatch = useCallback(async () => {
    stopWatch();
    trackingHaltedRef.current = false;
    try {
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 },
        (location) => {
          queuedRef.current = queuedRef.current.then(async () => {
            if (sessionRef.current?.status !== 'in_progress' || trackingHaltedRef.current || !mountedRef.current) return;
            const response = await addRunningTrackPoint(sessionId, {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy_meters: location.coords.accuracy,
              elapsed_seconds: elapsedNow(),
            });
            applySession(response.session);
            if (response.accepted && response.point && mountedRef.current) {
              setPoints((current) => [...current, response.point!]);
              setError('');
            } else if (response.reason === 'low_accuracy' && mountedRef.current) {
              setError('GPS 신호가 약해 위치를 기다리는 중이에요.');
            }
          }).catch((cause) => {
            void haltAfterError(`기록 저장에 실패해 러닝을 일시정지했어요. ${getRunningApiErrorMessage(cause)}`);
          });
        },
        () => { void haltAfterError('위치 신호가 끊겨 러닝을 일시정지했어요.'); },
      );
      if (sessionRef.current?.status === 'in_progress' && mountedRef.current) watchRef.current = subscription;
      else subscription.remove();
    } catch (cause) {
      if (mountedRef.current) setError(getRunningApiErrorMessage(cause));
      throw cause;
    }
  }, [applySession, elapsedNow, haltAfterError, sessionId, stopWatch]);

  const pause = useCallback(async () => {
    if (busyRef.current || sessionRef.current?.status !== 'in_progress') return;
    busyRef.current = true;
    if (mountedRef.current) setBusy(true);
    const frozenElapsed = elapsedNow();
    baseRef.current = frozenElapsed;
    segmentStartRef.current = null;
    stopWatch();
    try {
      await queuedRef.current;
      const response = await pauseRunningSession(sessionId, Math.max(
        frozenElapsed, sessionRef.current?.elapsed_seconds ?? 0));
      baseRef.current = response.session.elapsed_seconds;
      segmentStartRef.current = null;
      if (mountedRef.current) setElapsedSeconds(response.session.elapsed_seconds);
      applySession(response.session);
      if (mountedRef.current) setError('');
    } catch (cause) {
      if (mountedRef.current) setError(getRunningApiErrorMessage(cause));
      // The server may still be recording; keep the screen aligned with it.
      try {
        const fresh = await getRunningSession(sessionId);
        applySession(fresh.session);
        if (fresh.session.status === 'in_progress' && mountedRef.current) {
          baseRef.current = Math.max(frozenElapsed, fresh.session.elapsed_seconds);
          segmentStartRef.current = Date.now();
          await startWatch();
        }
      } catch { /* The error remains visible for a retry. */ }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [applySession, elapsedNow, sessionId, startWatch, stopWatch]);

  const resume = useCallback(async () => {
    if (busyRef.current || sessionRef.current?.status !== 'paused') return;
    busyRef.current = true;
    setBusy(true);
    let didResume = false;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || !await Location.hasServicesEnabledAsync()) {
        throw new Error('러닝을 계속하려면 위치 권한과 기기 위치 서비스를 켜 주세요.');
      }
      const response = await resumeRunningSession(sessionId);
      didResume = true;
      baseRef.current = response.session.elapsed_seconds;
      segmentStartRef.current = Date.now();
      setElapsedSeconds(response.session.elapsed_seconds);
      applySession(response.session);
      setError('');
      await startWatch();
    } catch (cause) {
      setError(getRunningApiErrorMessage(cause));
      if (didResume) {
        try {
          const paused = await pauseRunningSession(sessionId, baseRef.current);
          segmentStartRef.current = null;
          applySession(paused.session);
        } catch { /* The visible error prompts the user to retry. */ }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [applySession, sessionId, startWatch]);

  const complete = useCallback(async () => {
    if (busyRef.current || !sessionRef.current ||
        !['in_progress', 'paused'].includes(sessionRef.current.status)) return false;
    busyRef.current = true;
    setBusy(true);
    const frozenElapsed = elapsedNow();
    baseRef.current = frozenElapsed;
    segmentStartRef.current = null;
    stopWatch();
    try {
      await queuedRef.current;
      const response = await completeRunningSession(sessionId, Math.max(
        frozenElapsed, sessionRef.current?.elapsed_seconds ?? 0));
      segmentStartRef.current = null;
      baseRef.current = response.session.elapsed_seconds;
      setElapsedSeconds(response.session.elapsed_seconds);
      applySession(response.session);
      setError('');
      return true;
    } catch (cause) {
      setError(getRunningApiErrorMessage(cause));
      if (sessionRef.current?.status === 'in_progress' && mountedRef.current) {
        segmentStartRef.current = Date.now();
        void startWatch().catch(() => {});
      }
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [applySession, elapsedNow, sessionId, startWatch, stopWatch]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void getRunningSession(sessionId).then(async (response) => {
      if (cancelled) return;
      applySession(response.session);
      setPoints(response.points ?? []);
      setPlannedCourse(response.planned_course ?? null);
      baseRef.current = response.session.elapsed_seconds;
      setElapsedSeconds(response.session.elapsed_seconds);
      if (response.session.status === 'in_progress') {
        segmentStartRef.current = Date.now();
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.granted && !cancelled) await startWatch();
        else if (!permission.granted && !cancelled) {
          await pause();
          setError('위치 권한을 켠 뒤 러닝을 다시 시작해 주세요.');
        }
      }
    }).catch(async (cause) => {
      if (!cancelled) {
        await pause();
        setError(getRunningApiErrorMessage(cause));
      }
    })
      .finally(() => { if (!cancelled) setLoading(false); });
    const timer = setInterval(() => setElapsedSeconds(elapsedNow()), 1000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void pause();
    });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearInterval(timer);
      appState.remove();
      stopWatch();
      if (sessionRef.current?.status === 'in_progress' && !busyRef.current) {
        void pauseRunningSession(sessionId, elapsedNow()).catch(() => {});
      }
    };
  }, [applySession, elapsedNow, pause, sessionId, startWatch, stopWatch]);

  return { session, points, plannedCourse, loading, busy, error, elapsedSeconds,
    pause, resume, complete };
}
