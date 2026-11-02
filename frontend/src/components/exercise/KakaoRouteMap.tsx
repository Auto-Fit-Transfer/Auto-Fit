import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import type { RunningCoordinate } from '@/src/api/running';
import { KAKAO_MAP_JS_KEY, KAKAO_MAP_LOAD_TIMEOUT_MS, KAKAO_MAP_ORIGIN, kakaoMapHtml } from '@/src/features/running/kakaoMap';

type Props = { points: RunningCoordinate[]; onFailure: () => void };

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
      accessibilityLabel="러닝 코스 지도"
      bounces={false}
      onError={onFailure}
      onHttpError={onFailure}
      onMessage={(event) => {
        if (event.nativeEvent.data === 'ready') ready.current = true;
        else if (event.nativeEvent.data === 'error') onFailure();
      }}
      onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url.startsWith(KAKAO_MAP_ORIGIN)}
      originWhitelist={['*']}
      scrollEnabled={false}
      setSupportMultipleWindows={false}
      source={{ html, baseUrl: KAKAO_MAP_ORIGIN }}
      style={StyleSheet.absoluteFill}
    />
  );
}
