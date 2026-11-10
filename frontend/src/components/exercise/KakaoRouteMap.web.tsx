import { useEffect, useMemo, useRef, useState } from 'react';

import type { RunningCoordinate } from '@/src/api/running';
import { KAKAO_MAP_JS_KEY, KAKAO_MAP_LOAD_TIMEOUT_MS, kakaoLiveMapHtml, kakaoMapHtml, liveMapPayload, type LiveMapInput } from '@/src/features/running/kakaoMap';

type Props = { points: RunningCoordinate[]; onFailure: () => void };

export function KakaoRouteMap({ points, onFailure }: Props) {
  const html = useMemo(() => kakaoMapHtml(KAKAO_MAP_JS_KEY, points), [points]);
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let ready = false;
    const timer = setTimeout(() => { if (!ready) onFailure(); }, KAKAO_MAP_LOAD_TIMEOUT_MS);
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data === 'ready') ready = true;
      else if (event.data === 'error') onFailure();
    };
    window.addEventListener('message', listener);
    return () => { clearTimeout(timer); window.removeEventListener('message', listener); };
  }, [html, onFailure]);

  return (
    <iframe
      ref={frame}
      sandbox="allow-scripts"
      srcDoc={html}
      title="러닝 코스 지도"
      style={{ border: 0, height: '100%', left: 0, position: 'absolute', top: 0, width: '100%' }}
    />
  );
}

type LiveProps = LiveMapInput & { onFailure: () => void; onReady: () => void };

// The page loads once; each new position is posted into it, so the map does not reload during a run.
export function KakaoLiveMap({ currentLocation, accuracyMeters, acceptedPath, plannedPath, onFailure, onReady }: LiveProps) {
  const html = useMemo(() => kakaoLiveMapHtml(KAKAO_MAP_JS_KEY), []);
  const payload = useMemo(
    () => JSON.stringify(liveMapPayload({ currentLocation, accuracyMeters, acceptedPath, plannedPath })),
    [currentLocation, accuracyMeters, acceptedPath, plannedPath],
  );
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = ready ? undefined : setTimeout(onFailure, KAKAO_MAP_LOAD_TIMEOUT_MS);
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data === 'ready') { setReady(true); onReady(); }
      else if (event.data === 'error') onFailure();
    };
    window.addEventListener('message', listener);
    return () => { clearTimeout(timer); window.removeEventListener('message', listener); };
  }, [ready, onFailure, onReady]);

  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage(payload, '*');
  }, [payload, ready]);

  return (
    <iframe
      ref={frame}
      sandbox="allow-scripts"
      srcDoc={html}
      title="내 위치와 이동 경로 지도"
      style={{ border: 0, height: '100%', left: 0, position: 'absolute', top: 0, width: '100%' }}
    />
  );
}
