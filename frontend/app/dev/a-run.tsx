import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { aForm } from '@/src/components/a/form';
import { RoutePicture, RunSetup, type RunCondition, type RunIntensity } from '@/src/components/a/RunParts';
import { RunReadyView, type RunTab } from '@/src/components/a/RunReadyView';
import { RunDoneView, RunLiveView } from '@/src/components/a/RunViews';
import { AppBottomSheet, Text } from '@/src/components/common';
import { useThemedStyles, type AppTheme } from '@/src/theme';

// Development only: renewal A's running screens with sample values, to look at them.
// ?state=resume | empty | finding | free | live | paused | freerun | done | donefree
const nothing = () => undefined;
// A line along the Han river at Jamsil, as an example of a path (no real run).
const path = [
  [37.5178, 127.0722], [37.5182, 127.0752], [37.5189, 127.0786], [37.5195, 127.0821], [37.5199, 127.0857],
  [37.5197, 127.0893], [37.5204, 127.0926], [37.5216, 127.0952], [37.5232, 127.0975],
].map(([latitude, longitude]) => ({ latitude, longitude }));
const found = [
  { key: '1', name: '잠실한강공원 왕복', detail: '잠실 · 5.5km · 약 37분 · 쉬움', onPress: nothing },
  { key: '2', name: '석촌호수 두 바퀴', detail: '석촌 · 5.1km · 약 34분 · 쉬움', onPress: nothing },
  { key: '3', name: '올림픽공원 한 바퀴', detail: '방이 · 5km · 약 35분 · 보통', onPress: nothing },
];
const kept = [{ key: 's1', name: '석촌호수 두 바퀴', detail: '석촌 · 5.1km', onPress: nothing }];

export default function ARunSample() {
  const styles = useThemedStyles(createStyles);
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [region, setRegion] = useState(state === 'empty' ? '' : '잠실');
  const [distance, setDistance] = useState('5km');
  const [tab, setTab] = useState<RunTab>('rec');
  const [free, setFree] = useState(state === 'free');
  const [condition, setCondition] = useState<RunCondition>('normal');
  const [intensity, setIntensity] = useState<RunIntensity>('moderate');
  const [minutes, setMinutes] = useState('30');

  if (state === 'live' || state === 'paused' || state === 'freerun') {
    return (
      <RunLiveView
        busy={false}
        clock="15:24"
        course={state === 'freerun' ? null : { ratio: 2310 / 5470, left: '남은 거리 3.16km' }}
        error={null}
        finished={false}
        held={state === 'paused'}
        km="2.31"
        loading={false}
        map={<RoutePicture label="예시 경로" points={path} style={styles.fill} />}
        missing={null}
        notice={null}
        onBack={nothing}
        onEnd={nothing}
        onResult={nothing}
        onToggle={nothing}
        pace={`6'40"`}
        title={state === 'freerun' ? '자유 러닝' : '잠실한강공원 왕복'}
      />
    );
  }
  if (state === 'done' || state === 'donefree') {
    return (
      <RunDoneView
        clock={state === 'done' ? '36:27' : '20:48'}
        courseName={state === 'done' ? '잠실한강공원 왕복' : null}
        km={state === 'done' ? '5.47' : '3.12'}
        leaveLabel="홈으로"
        loading={false}
        onLeave={nothing}
        pace={`6'40"`}
        path={path}
        problem={null}
        whole={state === 'done'}
      />
    );
  }
  const none = state === 'empty';
  return (
    <>
      <RunReadyView
        active={state === 'resume' ? { detail: '2.31km · 15:24', onResume: nothing } : null}
        counts={{ rec: none ? 0 : found.length, mine: none ? 0 : kept.length }}
        distance={distance}
        distances={['3km', '5km', '10km']}
        finding={state === 'finding'}
        kinds={[
          { label: '오늘의 운동', onPress: nothing },
          { label: '러닝', selected: true, onPress: nothing },
          { label: '자세 분석', onPress: nothing },
        ]}
        message=""
        onBack={nothing}
        onDistance={setDistance}
        onFind={nothing}
        onFree={() => setFree(true)}
        onRegion={setRegion}
        onTab={setTab}
        region={region}
        rows={none ? [] : tab === 'rec' ? found : kept}
        tab={tab}
      />
      <AppBottomSheet contentStyle={styles.sheet} onClose={() => setFree(false)} title="코스 없이 달리기" visible={free}>
        <RunSetup condition={condition} intensity={intensity} minutes={minutes} onCondition={setCondition} onIntensity={setIntensity} onMinutes={setMinutes} />
        <Pressable accessibilityRole="button" onPress={nothing} style={styles.go}>
          <Text style={styles.goText}>달리기 시작</Text>
        </Pressable>
      </AppBottomSheet>
    </>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    fill: { flex: 1 },
    sheet: { gap: 14, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 0 },
    go: a.go,
    goText: a.goText,
  } as const;
}
