import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AskView, ToneSheet, type AskLine } from '@/src/components/a/AskView';
import { whoList, type Who } from '@/src/components/a/sprites';
import { R6ConnectionError } from '@/src/components/common/R6ConnectionError';

// Development only: renewal A's 물어보기 with sample lines, to look at the screen.
// ?state=talk | adjust | adjusted | wait | fail | long | loading | lost | broken | tone   ?who=…  ?tier=0…4
const nothing = () => undefined;
const score: AskLine[] = [
  { key: 'q1', mine: '내 건강 점수를 알려 줘' },
  { key: 'a1', answer: '좋아요, 같이 살펴볼게요.\n지금 건강 점수는 78점이에요. 지난주보다 2점 올랐어요. 체중이 4주 동안 1.6kg 줄어든 것이 가장 크게 들어갔어요.' },
];
const light = (card: AskLine['card'], note?: string): AskLine[] => [
  { key: 'q2', mine: '오늘 운동 가볍게 해 줘' },
  { key: 'a2', answer: '좋아요, 같이 살펴볼게요.\n오늘의 코어 루틴을 가볍게 바꿀까요? 세트를 하나씩 줄여서 8분이 6분이 돼요.', card, note },
];

export default function AAskSample() {
  const params = useLocalSearchParams<{ state?: string; who?: string; tier?: string }>();
  const who = whoList.includes(params.who as Who) ? (params.who as Who) : 'worker-f';
  const tier = Math.min(4, Math.max(0, Number(params.tier ?? 1) || 0));
  const [draft, setDraft] = useState(params.state === 'fail' ? '운동 기록 알려 줘' : '');
  const [tone, setTone] = useState('quni');
  const [toneOpen, setToneOpen] = useState(params.state === 'tone');
  const tones = [
    { id: 'quni', name: '다정하게', first: '좋아요, 같이 살펴볼게요.' },
    { id: 'nabi', name: '느긋하게', first: '천천히 확인해 볼게요.' },
    { id: 'coach', name: '단호하게', first: '핵심부터 확인하겠습니다.' },
  ];
  const open = { busy: false, waiting: false, onNo: nothing, onYes: nothing };
  const lines: AskLine[] =
    params.state === 'talk'
      ? score
      : params.state === 'adjust'
        ? light(open)
        : params.state === 'adjusted'
          ? light(undefined, '운동을 조정했어요.')
          : params.state === 'wait'
            ? [score[0]]
            : params.state === 'fail'
              ? [{ key: 'q0', mine: '운동 기록 알려 줘' }]
              : params.state === 'long'
                ? [...score, ...light(open)]
                : [];
  return (
    <>
    <AskView
      canType
      draft={draft}
      error={params.state === 'fail' ? '답을 받지 못했어요. 다시 보내 주세요' : null}
      failed={
        params.state === 'lost' || params.state === 'broken' ? (
          <R6ConnectionError offline={params.state === 'lost'} onRetry={nothing} />
        ) : undefined
      }
      greeting="건강 점수와 식단 · 운동 기록을 같이 살펴봐요"
      lines={lines}
      loading={params.state === 'loading'}
      onBack={nothing}
      onDraft={setDraft}
      onSend={nothing}
      onTone={() => setToneOpen(true)}
      prompts={['운동 기록 알려 줘', '내 건강 점수를 알려 줘', '무엇부터 개선해야 해?', '오늘 운동 가볍게 해 줘']}
      tier={tier}
      tone={tones.find((item) => item.id === tone)?.name ?? ''}
      waiting={params.state === 'wait'}
      who={who}
    />
    <ToneSheet
      chosen={tone}
      onClose={() => setToneOpen(false)}
      onPick={(id) => {
        setTone(id);
        setToneOpen(false);
      }}
      tones={tones}
      visible={toneOpen}
    />
    </>
  );
}
