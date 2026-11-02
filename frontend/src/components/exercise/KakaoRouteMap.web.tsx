import { useEffect, useMemo, useRef } from 'react';

import type { RunningCoordinate } from '@/src/api/running';
import { KAKAO_MAP_JS_KEY, KAKAO_MAP_LOAD_TIMEOUT_MS, kakaoMapHtml } from '@/src/features/running/kakaoMap';

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
      srcDoc={html}
      title="러닝 코스 지도"
      style={{ border: 0, height: '100%', left: 0, position: 'absolute', top: 0, width: '100%' }}
    />
  );
}
