import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import {
  addRunningTrackPoint, completeRunningSession, getRunningSession,
  getRunningApiErrorMessage, pauseRunningSession, resumeRunningSession,
  type RunningPlannedCourse, type RunningSession, type RunningTrackPoint,
} from '@/src/api/running';
import { appStateAction, INACTIVE_GRACE_MS, readLiveLocation, type LiveLocation } from './liveTracking';
import { qaLog } from './runQa';

const failed = (cause: unknown) => `실패 ${(cause as { status?: number } | null)?.status || '연결 없음'}`;
const meters = (accuracy: number | null) => (accuracy === null ? '없음' : `${Math.round(accuracy)}m`);

export type { LiveLocation } from './liveTracking';

export function useRunningSession(sessionId: string) {
  const [session, setSession] = useState<RunningSession | null>(null);
  const [points, setPoints] = useState<RunningTrackPoint[]>([]);
  const [plannedCourse, setPlannedCourse] = useState<RunningPlannedCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // Where the phone is now (map only). `points` stay the positions the server accepted for the distance.
  const [currentLocation, setCurrentLocation] = useState<LiveLocation | null>(null);
  const [rejection, setRejection] = useState('');
  const [preciseOff, setPreciseOff] = useState(false);
  const shownAtRef = useRef(0);
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

  const showLocation = useCallback((location: Location.LocationObject | null) => {
    if (!location || !mountedRef.current) return null;
    const next = readLiveLocation(location.coords);
    if (location.timestamp >= shownAtRef.current) {
      shownAtRef.current = location.timestamp;
      // Hide an invalid current fix without changing the server-approved track.
      setCurrentLocation(next);
    }
    return next;
  }, []);

  const readPermission = useCallback((permission: Location.LocationPermissionResponse) => {
    if (mountedRef.current) setPreciseOff(permission.ios?.accuracy === 'reduced' || permission.android?.accuracy === 'coarse');
    return permission.granted;
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
    qaLog('pause 요청 보냄 (오류 뒤)');
    try {
      const response = await pauseRunningSession(sessionId, frozen);
      qaLog('pause 응답 200');
      applySession(response.session);
    } catch (cause) {
      qaLog(`pause ${failed(cause)}`);
      // Keep the error visible; the user can retry the pause once connected.
    }
  }, [applySession, elapsedNow, sessionId, stopWatch]);

  // One position, from the watcher or a QA button, through the same queue: the server decides what counts.
  const sendPoint = useCallback((position: LiveLocation, source: string) => {
    queuedRef.current = queuedRef.current.then(async () => {
      if (sessionRef.current?.status !== 'in_progress' || trackingHaltedRef.current || !mountedRef.current) return;
      qaLog(`points 보냄 (${source}, 오차 ${meters(position.accuracy)})`);
      const response = await addRunningTrackPoint(sessionId, {
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy_meters: position.accuracy,
        elapsed_seconds: elapsedNow(),
      });
      qaLog(`points 응답 200 · ${response.accepted ? '저장됨' : `거절 ${response.reason ?? '이유 없음'}`}`);
      applySession(response.session);
      if (!mountedRef.current) return;
      if (response.accepted && response.point) {
        setPoints((current) => [...current, response.point!]);
        setError('');
      }
      // A small movement passed the accuracy check, so it clears an earlier notice too.
      setRejection(response.accepted || response.reason === 'small_movement' ? '' : response.reason ?? '');
    }).catch((cause) => {
      qaLog(`points ${failed(cause)}`);
      void haltAfterError(`기록 저장에 실패해 러닝을 일시정지했어요. ${getRunningApiErrorMessage(cause)}`);
    });
  }, [applySession, elapsedNow, haltAfterError, sessionId]);

  // QA buttons only: a test position goes through the watcher's path, map marker included.
  const qaFeed = useCallback((position: LiveLocation) => {
    const shown = showLocation({ coords: position, timestamp: Date.now() } as Location.LocationObject);
    if (shown) sendPoint(shown, 'QA 버튼');
  }, [sendPoint, showLocation]);

  const startWatch = useCallback(async () => {
    stopWatch();
    trackingHaltedRef.current = false;
    // A first fix for the map before the watcher's first callback; it is never sent as a track point.
    void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then((location) => {
      qaLog(`첫 위치 조회 (지도만, 보내지 않음, 오차 ${meters(location.coords.accuracy)})`);
      return showLocation(location);
    }).catch(() => {});
    try {
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 },
        (location) => {
          const position = showLocation(location);
          if (position) sendPoint(position, 'watcher');
          else qaLog('watcher 위치 무효 (보내지 않음)');
        },
        () => { qaLog('watcher 오류'); void haltAfterError('위치 신호가 끊겨 러닝을 일시정지했어요.'); },
      );
      if (sessionRef.current?.status === 'in_progress' && mountedRef.current) watchRef.current = subscription;
      else subscription.remove();
    } catch (cause) {
      if (mountedRef.current) setError(getRunningApiErrorMessage(cause));
      throw cause;
    }
  }, [haltAfterError, sendPoint, showLocation, stopWatch]);

  const pause = useCallback(async () => {
    if (busyRef.current || sessionRef.current?.status !== 'in_progress') return;
    busyRef.current = true;
    if (mountedRef.current) setBusy(true);
    const frozenElapsed = elapsedNow();
    baseRef.current = frozenElapsed;
    segmentStartRef.current = null;
    stopWatch();
    qaLog(`pause 시작 (${frozenElapsed}초)`);
    try {
      await queuedRef.current;
      qaLog('pause 요청 보냄');
      const response = await pauseRunningSession(sessionId, Math.max(
        frozenElapsed, sessionRef.current?.elapsed_seconds ?? 0));
      qaLog(`pause 응답 200 · ${response.session.elapsed_seconds}초`);
      baseRef.current = response.session.elapsed_seconds;
      segmentStartRef.current = null;
      if (mountedRef.current) setElapsedSeconds(response.session.elapsed_seconds);
      applySession(response.session);
      if (mountedRef.current) setError('');
    } catch (cause) {
      qaLog(`pause ${failed(cause)}`);
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
      if (!readPermission(permission) || !await Location.hasServicesEnabledAsync()) {
        throw new Error('러닝을 계속하려면 위치 권한과 기기 위치 서비스를 켜 주세요.');
      }
      qaLog(`resume 요청 보냄 (정확한 위치 ${permission.ios?.accuracy === 'reduced' || permission.android?.accuracy === 'coarse' ? '꺼짐' : '켜짐'})`);
      const response = await resumeRunningSession(sessionId);
      qaLog('resume 응답 200');
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
  }, [applySession, readPermission, sessionId, startWatch]);

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
      if (response.session.status === 'in_progress') segmentStartRef.current = Date.now();
      const granted = readPermission(await Location.getForegroundPermissionsAsync());
      // The last known position only centres the map quickly, also for a paused run.
      if (granted) showLocation(await Location.getLastKnownPositionAsync().catch(() => null));
      if (response.session.status !== 'in_progress' || cancelled) return;
      if (!granted) {
        await pause();
        setError('위치 권한을 켠 뒤 러닝을 다시 시작해 주세요.');
      } else if (!await Location.hasServicesEnabledAsync()) {
        await pause();
        setError('기기의 위치 서비스를 켜 주세요.');
      } else if (!cancelled) await startWatch();
    }).catch(async (cause) => {
      if (!cancelled) {
        await pause();
        setError(getRunningApiErrorMessage(cause));
      }
    })
      .finally(() => { if (!cancelled) setLoading(false); });
    const timer = setInterval(() => setElapsedSeconds(elapsedNow()), 1000);
    let grace: ReturnType<typeof setTimeout> | undefined;
    const appState = AppState.addEventListener('change', (state) => {
      const action = appStateAction(state);
      qaLog(`앱 상태 ${state}`);
      if (action === 'wait') {
        grace ??= setTimeout(() => { grace = undefined; qaLog('inactive 5초 지남'); void pause(); }, INACTIVE_GRACE_MS);
        return;
      }
      clearTimeout(grace);
      grace = undefined;
      if (action === 'pause') void pause();
    });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearInterval(timer);
      clearTimeout(grace);
      appState.remove();
      stopWatch();
      if (sessionRef.current?.status === 'in_progress' && !busyRef.current) {
        qaLog('화면 나감 → pause 요청 보냄');
        void pauseRunningSession(sessionId, elapsedNow()).catch(() => {});
      }
    };
  }, [applySession, elapsedNow, pause, readPermission, sessionId, showLocation, startWatch, stopWatch]);

  return { session, points, plannedCourse, loading, busy, error, elapsedSeconds,
    currentLocation, rejection, preciseOff, pause, resume, complete, qaFeed };
}
