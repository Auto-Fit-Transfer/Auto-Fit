import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { RecordView, type RecordMetric } from '@/src/components/a/RecordView';

// Development only: renewal A's workout record with a sample week, to look at it without signing in.
// ?state=open (a workout opened) | day (Wednesday picked) | nogoal | month | empty | loading
const nothing = () => undefined;
const WEEK = [['월', 29], ['화', 20], ['수', 8], ['목', 0], ['금', 0], ['토', 0], ['일', 0]] as const;
const ROWS = [
  { key: 'c', stopped: false, sub: '11월 18일 수요일 · 8분 · 30kcal', title: '크런치 외 2가지' },
  { key: 'b', stopped: false, sub: '11월 17일 화요일 · 20분 · 70kcal', title: '스쿼트 외 3가지' },
  { key: 'r', stopped: false, sub: '11월 16일 월요일 · 20분', title: '러닝 3.02km' },
  { key: 'a', stopped: true, sub: '11월 16일 월요일 · 9분 · 30kcal', title: '스쿼트 외 3가지' },
];

export default function ARecordSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [metric, setMetric] = useState<RecordMetric>('minutes');
  const [open, setOpen] = useState(state === 'open');
  const [day, setDay] = useState(state === 'day' ? '화' : null);
  const month = state === 'month';
  const empty = state === 'empty';
  const bars = month
    ? [['1주', 40], ['2주', 48], ['3주', 0], ['4주', 0], ['5주', 0]].map(([label, value], index) => ({ key: String(label), label: String(label), name: String(label), now: index === 2, picked: false, text: `${value}분`, value: Number(value) }))
    : WEEK.map(([label, value]) => ({ key: label, label, name: `${label}요일`, now: label === '수', picked: day === label, text: `${value}분`, value: empty ? 0 : value }));
  return (
    <RecordView
      bars={bars}
      canForward={false}
      error={null}
      goal={state === 'nogoal' ? null : '체력 기르기 · 주 90분 · 주 3회'}
      left={state === 'nogoal' ? '아직 정한 목표가 없어요' : month ? '목표 450분까지 362분 남았어요' : empty ? '목표 90분까지 90분 남았어요' : '목표 90분까지 33분 남았어요'}
      line={state === 'nogoal' ? null : month ? { label: '한 주 90분', value: 90 } : { label: '하루 13분', value: 12.9 }}
      listTitle={day ? '11월 17일 화요일' : empty ? '이번 주 운동 0번' : '이번 주 운동 4번'}
      loading={state === 'loading'}
      metric={metric}
      onAll={() => setDay(null)}
      onBack={nothing}
      onBar={(key) => setDay(day === key ? null : key)}
      onCloseSheet={() => setOpen(false)}
      onGoal={nothing}
      onMetric={setMetric}
      onMove={nothing}
      onPeriod={nothing}
      onRow={(key) => setOpen(key !== 'r')}
      period={month ? 'month' : 'week'}
      range={month ? '2026년 11월' : '11월 16일 – 22일'}
      when={month ? '이번 달은' : '이번 주는'}
      rows={empty ? [] : day ? ROWS.slice(1, 2) : ROWS}
      sheet={open ? {
        lead: '11월 17일 화요일 · 20분 · 70kcal',
        moves: [
          { name: '스쿼트', skipped: false, text: '4세트 · 15회' },
          { name: '런지', skipped: false, text: '3세트 · 12회' },
          { name: '글루트 브리지', skipped: false, text: '3세트 · 15회' },
          { name: '카프 레이즈', skipped: true, text: '건너뜀' },
        ],
        next: ['현재 운동 강도와 구성을 유지'],
        note: null,
        save: { disabled: false, label: '내 루틴으로 저장', onPress: nothing },
        tell: '계획한 운동을 안정적으로 수행했습니다.',
        title: '스쿼트 외 3가지',
      } : null}
      showAll={Boolean(day)}
      sums={[['운동한 날', empty ? '0일' : '3일'], ['한 번에 평균', empty ? '0분' : '19분'], ['쓴 열량', empty ? '—' : '130kcal']]}
      top={month ? 120 : 30}
      value={month ? '88분' : empty ? '0분' : '57분'}
    />
  );
}
