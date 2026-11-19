import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { RoutinePlanView } from '@/src/components/a/RoutinePlanView';

// Development only: renewal A's "today's routine, all of it" with a sample routine, to look at it
// without signing in. ?state=week (a plan over several days) | short (three moves) | empty | loading
const nothing = () => undefined;
// a stand-in picture for the demo clip: the bought clips must not be in this public code
const DEMO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#fff"/><text x="160" y="96" font-size="16" text-anchor="middle" fill="#6E7389">시범 영상 자리</text></svg>')}`;
const MOVES = [
  { id: '1', name: '스쿼트', posture: true, text: '3세트 · 15회 · 쉬는 시간 30초', demo: DEMO, how: '발을 어깨너비로 벌리고, 무릎이 발끝과 같은 쪽을 보게 앉았다 일어나요.' },
  { id: '2', name: '푸시업', posture: false, text: '3세트 · 12회 · 쉬는 시간 30초', demo: null, how: null },
  { id: '3', name: '플랭크', posture: false, text: '3세트 · 40초 · 쉬는 시간 20초', demo: null, how: null },
  { id: '4', name: '런지', posture: false, text: '3세트 · 좌우 12회 · 쉬는 시간 30초', demo: null, how: null },
  { id: '5', name: '힙 브리지', posture: false, text: '3세트 · 15회 · 쉬는 시간 20초', demo: null, how: null },
  { id: '6', name: '버드독', posture: false, text: '2세트 · 좌우 10회 · 쉬는 시간 20초', demo: null, how: null },
];

export default function APlanSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [day, setDay] = useState('a');
  const week = state === 'week';
  return (
    <RoutinePlanView
      button={{ disabled: week && day !== 'a', label: week && day !== 'a' ? '예정된 운동' : '운동 시작하기' }}
      header={week ? '요일별 운동 계획' : '오늘의 맞춤 운동'}
      loading={state === 'loading'}
      onBack={nothing}
      onChange={nothing}
      onPickDay={setDay}
      onPosture={nothing}
      onStart={nothing}
      routine={state === 'empty' || state === 'loading' ? null : {
        days: week ? [
          { date: '11월 17일 화요일', id: 'a', meta: '45분 · 6개 운동', name: '하체와 코어', selected: day === 'a', status: '시작 가능' },
          { date: '11월 19일 목요일', id: 'b', meta: '40분 · 5개 운동', name: '상체', selected: day === 'b', status: '예정' },
          { date: '11월 21일 토요일', id: 'c', meta: '45분 · 6개 운동', name: '전신', selected: day === 'c', status: '예정' },
        ] : [],
        listTitle: `${week ? '하체와 코어 · ' : ''}운동 ${state === 'short' ? 3 : 6}개`,
        made: '45분 · 집 · 맨몸, 밴드 · 컨디션 보통',
        meta: '45분 · 약 210kcal · 강도 보통',
        moves: state === 'short' ? MOVES.slice(0, 3) : MOVES,
        reasons: ['무릎이 불편하다고 해서 뛰는 동작은 뺐어요.', '집에서 맨몸과 밴드로 할 수 있는 동작만 골랐어요.', '컨디션이 보통이라 강도는 보통으로 맞췄어요.'],
        source: 'AI 모델 추천',
        subtitle: '집에서 맨몸으로 하는 하체 · 코어 운동이에요.',
        title: '하체와 코어 루틴',
      }}
    />
  );
}
