import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { PostureResultView, PostureShootView, PostureTips, PostureWaitView } from '@/src/components/a/PostureViews';
import { failureText } from '@/src/features/exercise/postureFlow';

// Development only: renewal A's 자세 분석 with sample values, to look at the screens.
// ?state=lie | recording | review | blocked | tips | wait | waitfail | result | ten | one | broken
const nothing = () => undefined;
const names = ['스쿼트', '푸시업', '플랭크', '런지', '힙 브리지'];
const kinds = [
  { label: '오늘의 운동', onPress: nothing },
  { label: '러닝', onPress: nothing },
  { label: '자세 분석', selected: true, onPress: nothing },
];
const angle = (label: string, target: string, value: string, status: string, off = false) => ({ label, target, value, status, off });
const squat = [
  angle('무릎 굽힘', '권장 90~110°', '82°', '8° 모자람', true),
  angle('상체 기울기', '권장 45° 이하', '52°', '7° 넘음', true),
  angle('엉덩이 굽힘', '권장 80~110°', '96°', '범위 안'),
];

export default function APostureSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [selected, setSelected] = useState(state === 'lie' ? 2 : 0);
  const [tips, setTips] = useState(state === 'tips');

  if (state === 'wait' || state === 'waitfail') {
    return (
      <PostureWaitView
        error={state === 'waitfail' ? failureText('POSE_COVERAGE_LOW') : null}
        failed={state === 'waitfail'}
        meta="스쿼트 · 옆에서 · 10초 영상"
        onAgain={state === 'waitfail' ? nothing : undefined}
        onBack={nothing}
        steps={[
          { title: '영상 올리기', description: '10초 영상을 보냈어요', state: 'done' },
          { title: '자세 분석', description: '관절을 찾고 각도를 재요', state: 'active' },
          { title: '결과 정리', description: '잘한 점과 고칠 점을 골라요', state: 'waiting' },
        ]}
      />
    );
  }
  if (state === 'result' || state === 'ten' || state === 'one' || state === 'broken') {
    return (
      <PostureResultView
        fixes={[
          { id: 'f1', title: '무릎을 더 굽혀요', when: '2~3회째', why: '허벅지가 바닥과 나란해지기 전에 올라왔어요. 얕게 앉으면 엉덩이와 허벅지 뒤쪽이 덜 쓰여요.', steps: ['천천히 내려가요', '의자에 앉듯 엉덩이를 뒤로 빼요', '허벅지가 바닥과 나란해지면 1초 멈춰요'] },
          { id: 'f2', title: '상체가 앞으로 숙여져요', when: '2회째', why: '내려갈 때 가슴이 무릎 쪽으로 기울었어요.', steps: ['시선을 정면에 둬요'] },
        ]}
        goods={['발뒤꿈치가 바닥에서 뜨지 않았어요', '내려가는 속도가 일정해요']}
        loading={false}
        onAgain={nothing}
        onBack={nothing}
        onHome={nothing}
        passing={80}
        problem={state === 'broken' ? '분석 결과를 불러오지 못했습니다.' : null}
        reps={
          state === 'one'
            ? [{ id: 'r1', number: 1, score: 74, scene: '0:05', angles: squat.slice(0, 2) }]
            : (state === 'ten' ? [84, 72, 76, 80, 90, 88, 79, 81, 95, 100] : [84, 72, 76, 80]).map((score, index) => ({ id: `r${index}`, number: index + 1, score, scene: `0:${String(index * 2 + 2).padStart(2, "0")}`, angles: squat }))
        }
        score={state === 'one' ? 74 : 78}
        summary="깊이만 조금 더 내려가면 돼요"
        title="스쿼트 자세 결과"
      />
    );
  }
  const phase = state === 'recording' ? 'recording' : state === 'review' ? 'review' : 'idle';
  const lie = selected === 1 || selected === 2 || selected === 4;
  return (
    <>
      <PostureShootView
        camera={null}
        canStart
        chipsOff={phase === 'recording'}
        cover={
          phase === 'review'
            ? { title: '10초 촬영을 마쳤어요', lines: ['영상은 분석에만 쓰고,\n끝나면 서버에서 바로 지워요'] }
            : state === 'blocked'
              ? { title: '카메라를 써도 될까요?', lines: ['자세를 10초 동안 찍어요.\n소리는 녹음하지 않아요.'], action: { label: '카메라 허용', onPress: nothing } }
              : null
        }
        exercises={names}
        frameLabel={lie ? '몸 옆면이 보이게, 머리부터 발끝까지 이 선 안에' : '옆으로 서서 머리부터 발끝까지 이 선 안에'}
        hint={phase === 'review' ? '' : '천천히 3~5회 · 10초가 지나면 자동으로 멈춰요'}
        kinds={kinds}
        lie={lie}
        onAlbum={nothing}
        onAnalyze={nothing}
        onBack={nothing}
        onRetake={nothing}
        onSelect={setSelected}
        onStart={nothing}
        onStop={nothing}
        onTips={() => setTips(true)}
        phase={phase}
        seconds={4}
        selected={selected}
        total={10}
      />
      <PostureTips
        limits={['옷이 헐렁하면 관절 위치가 조금 어긋날 수 있어요']}
        lines={['온몸이 화면에 들어오게 2~3m 떨어져요', '카메라는 허리 높이에 세워 둬요', '밝은 곳에서 찍어요']}
        onClose={() => setTips(false)}
        visible={tips}
      />
    </>
  );
}
