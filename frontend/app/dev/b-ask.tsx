import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { AskLine } from '@/src/components/a/AskView';
import { AskView, WhoSheet } from '@/src/components/b/AskView';
import { R6ConnectionError } from '@/src/components/common/R6ConnectionError';
import { chatCharacters, chatSamples, type ChatCharacterId } from '@/src/features/chat/chatCharacters';

// Development only: renewal B's 물어보기 with sample lines, to look at the screen.
// ?state=talk | adjust | adjusted | kept | wait | fail | long | loading | lost | who   ?as=quni | nabi | coach
const nothing = () => undefined;
const score: AskLine[] = [
  { key: 'q1', mine: '내 건강 점수를 알려 줘' },
  { key: 'a1', answer: '좋아요, 같이 살펴볼게요.\n지금 건강 점수는 78점이에요. 지난주보다 2점 올랐어요.' },
];
const light = (card: AskLine['card'], note?: string, done?: boolean): AskLine[] => [
  { key: 'q2', mine: '오늘 운동 가볍게 해 줘' },
  { key: 'a2', answer: '좋아요, 같이 살펴볼게요.\n오늘의 코어 루틴을 가볍게 바꿀까요? 세트를 하나씩 줄여서 8분이 6분이 돼요.', card, done, note },
];

export default function BAskSample() {
  const params = useLocalSearchParams<{ state?: string; as?: string }>();
  const [id, setId] = useState<ChatCharacterId>(chatCharacters.find((item) => item.id === params.as)?.id ?? 'quni');
  const [draft, setDraft] = useState(params.state === 'fail' ? '운동 기록 알려 줘' : '');
  const [whoOpen, setWhoOpen] = useState(params.state === 'who');
  const character = chatCharacters.find((item) => item.id === id) ?? chatCharacters[0];
  const open = { busy: false, waiting: false, onNo: nothing, onYes: nothing };
  const state = params.state;
  const lines: AskLine[] =
    state === 'talk' ? score
      : state === 'adjust' ? light(open)
        : state === 'adjusted' ? light(undefined, '운동을 조정했어요.', true)
          : state === 'kept' ? light(undefined, '조정하지 않고 그대로 두었어요.', false)
            : state === 'wait' ? [score[0]]
              : state === 'fail' ? [{ key: 'q0', mine: '운동 기록 알려 줘' }]
                : state === 'long' ? [...score, ...light(open)]
                  : [];
  return (
    <>
      <AskView
        canType
        characterId={id}
        draft={draft}
        error={state === 'fail' ? '답을 받지 못했어요. 다시 보내 주세요' : null}
        failed={state === 'lost' ? <R6ConnectionError offline onRetry={nothing} /> : undefined}
        greeting="건강 점수와 식단 · 운동 기록을 같이 살펴봐요"
        lines={lines}
        loading={state === 'loading'}
        name={character.name}
        onBack={nothing}
        onDraft={setDraft}
        onSend={nothing}
        onWho={() => setWhoOpen(true)}
        prompts={['운동 기록 알려 줘', '내 건강 점수를 알려 줘', '무엇부터 개선해야 해?', '오늘 운동 가볍게 해 줘']}
        waiting={state === 'wait'}
      />
      <WhoSheet
        cast={chatCharacters.map((item) => ({ id: item.id, name: item.name, role: item.role, sample: chatSamples[item.id] }))}
        chosen={id}
        onClose={() => setWhoOpen(false)}
        onPick={(next) => { setId(next); setWhoOpen(false); }}
        visible={whoOpen}
      />
    </>
  );
}
