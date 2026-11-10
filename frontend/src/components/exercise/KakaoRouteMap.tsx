import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';

import type { RunningCoordinate } from '@/src/api/running';
import { isMapPageUrl, KAKAO_MAP_JS_KEY, KAKAO_MAP_LOAD_TIMEOUT_MS, KAKAO_MAP_ORIGIN, kakaoLiveMapHtml, kakaoMapHtml, liveMapPayload, type LiveMapInput } from '@/src/features/running/kakaoMap';

type Props = { points: RunningCoordinate[]; onFailure: () => void };

const lockedDown: WebViewProps = {
  allowFileAccess: false,
  bounces: false,
  mixedContentMode: 'never',
  onShouldStartLoadWithRequest: (request: { url: string }) => isMapPageUrl(request.url),
  // The library hands any address outside this list to the phone's other apps, so the check above does the blocking.
  originWhitelist: ['*'],
  scrollEnabled: false,
  setSupportMultipleWindows: false,
  style: StyleSheet.absoluteFill,
  thirdPartyCookiesEnabled: false,
};

export function KakaoRouteMap({ points, onFailure }: Props) {
  const html = useMemo(() => kakaoMapHtml(KAKAO_MAP_JS_KEY, points), [points]);
  const ready = useRef(false);

  useEffect(() => {
    ready.current = false;
    const timer = setTimeout(() => { if (!ready.current) onFailure(); }, KAKAO_MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [html, onFailure]);

  return (
    <WebView
      {...lockedDown}
      accessibilityLabel="러닝 코스 지도"
      onError={onFailure}
      onHttpError={onFailure}
      onMessage={(event) => {
        if (event.nativeEvent.data === 'ready') ready.current = true;
        else if (event.nativeEvent.data === 'error') onFailure();
      }}
      source={{ html, baseUrl: KAKAO_MAP_ORIGIN }}
    />
  );
}

type LiveProps = LiveMapInput & { onFailure: () => void; onReady: () => void };

// The page loads once; each new position is sent into it, so the map does not reload during a run.
export function KakaoLiveMap({ currentLocation, accuracyMeters, acceptedPath, plannedPath, onFailure, onReady }: LiveProps) {
  const html = useMemo(() => kakaoLiveMapHtml(KAKAO_MAP_JS_KEY), []);
  const payload = useMemo(
    () => JSON.stringify(liveMapPayload({ currentLocation, accuracyMeters, acceptedPath, plannedPath })),
    [currentLocation, accuracyMeters, acceptedPath, plannedPath],
  );
  // WebView's own default props type is `undefined`, which leaves no props to pass with a ref.
  const web = useRef<WebView<object>>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return undefined;
    const timer = setTimeout(onFailure, KAKAO_MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready, onFailure]);

  useEffect(() => {
    // The payload holds numbers only (liveMapPayload), so it is safe to hand to the page as code.
    if (ready) web.current?.injectJavaScript(`window.__autofitUpdate(${payload});true;`);
  }, [payload, ready]);

  return (
    <WebView
      {...lockedDown}
      ref={web}
      accessibilityLabel="내 위치와 이동 경로 지도"
      onError={onFailure}
      onHttpError={onFailure}
      onMessage={(event) => {
        if (event.nativeEvent.data === 'ready') { setReady(true); onReady(); }
        else if (event.nativeEvent.data === 'error') onFailure();
      }}
      source={{ html, baseUrl: KAKAO_MAP_ORIGIN }}
    />
  );
}
