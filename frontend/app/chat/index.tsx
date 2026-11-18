import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { createChat, decideExerciseAdjustment, getChatMessages, getChats, sendChatMessage } from '@/src/api/chat';
import { ApiError, getApiErrorMessage } from '@/src/api/client';
import { AskView, ToneSheet, type AskLine } from '@/src/components/a/AskView';
import { useHero } from '@/src/components/a/useHero';
import { R6ConnectionError } from '@/src/components/common/R6ConnectionError';
import { getChatSessionSnapshot, mergeChatSessionMessages, prefetchActiveChat, updateChatSessionSnapshot } from '@/src/features/chat/chatSessionCache';
import { chatCharacters, displayChatAnswer, loadChatCharacter, saveChatCharacter, type ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { cardConflictText, cardMessage, cardView } from '@/src/features/chat/exerciseCard';
import type { ChatMessage } from '@/src/types/chat';

// Renewal A: the app's three chat characters are three ways my own character talks. The server still
// gets quni / nabi / coach and still answers the same; only the name on the screen and the greeting differ.
const tones: Record<ChatCharacterId, { name: string; greeting: string }> = {
  quni: { name: '다정하게', greeting: '건강 점수와 식단 · 운동 기록을 같이 살펴봐요' },
  nabi: { name: '느긋하게', greeting: '편하게 이야기해 주세요. 천천히 함께 살펴볼게요' },
  coach: { name: '단호하게', greeting: '건강 점수와 식단 · 운동 기록부터 확인해 보죠' },
};

// The first two stay at hand during the talk; all four are offered before the first question.
// The AI answers these score questions from the latest health score without a paid model call (ai contract 1.5);
// a weight-trend question has no data behind it yet, so it is not offered.
const prompts = ['운동 기록 알려줘', '내 건강 점수를 알려줘', '무엇부터 개선해야 해?', '오늘 운동 가볍게 해 줘'];

function newMessageId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (letter) => {
    const digit = Math.floor(Math.random() * 16);
    return (letter === 'x' ? digit : (digit & 3) | 8).toString(16);
  });
}

export default function R6ChatScreen() {
  const router = useRouter();
  const hero = useHero();
  const [toneOpen, setToneOpen] = useState(false);
  // The clock the workout card's ten minutes are counted by: read outside rendering, moved on every 15 seconds.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const loadRequest = useRef(0);
  const pending = useRef<{ content: string; id: string } | null>(null);
  const [character, setCharacter] = useState<(typeof chatCharacters)[number]>(chatCharacters[0]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  // The exercise adjustment card: it stays open until the server answers; a tap alone is not a success (contract).
  const [deciding, setDeciding] = useState<string | null>(null);
  const [cardNotes, setCardNotes] = useState<Record<string, string>>({});
  const decisionKeys = useRef<Record<string, string>>({});
  const cards = useMemo(() => messages.map(cardMessage), [messages]);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setError(null);
    setInitialLoadFailed(false);
    try {
      const cached = getChatSessionSnapshot().status === 'ready'
        ? getChatSessionSnapshot()
        : await prefetchActiveChat();
      let id = cached.chatId;
      if (!id) {
        const list = await getChats({ limit: 20, status: 'active' });
        id = list.chats[0]?.chat_id ?? null;
      }
      if (!id) id = (await createChat('건강 상담')).chat.chat_id;
      const history = cached.chatId === id && cached.status === 'ready'
        ? { messages: cached.messages, next_cursor: cached.nextCursor, has_more: cached.hasMore }
        : await getChatMessages(id);
      if (request !== loadRequest.current) return;
      setChatId(id);
      setMessages(history.messages);
      setInitialLoadFailed(false);
      updateChatSessionSnapshot(id, history.messages, history.next_cursor, history.has_more);
    } catch (reason) {
      if (request !== loadRequest.current) return;
      setError(getApiErrorMessage(reason));
      setOffline(reason instanceof ApiError && reason.status === 0);
      setInitialLoadFailed(true);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadChatCharacter().then((next) => { if (active) setCharacter(next); });
    void load();
    return () => { active = false; loadRequest.current += 1; };
  }, [load]));

  const send = async (content = draft) => {
    const text = content.trim();
    if (!chatId || !text || text.length > 500 || sending) return;
    const id = pending.current?.content === text ? pending.current.id : newMessageId();
    pending.current = { content: text, id };
    setSending(true);
    setError(null);
    try {
      const response = await sendChatMessage(chatId, text, id, character.id);
      const incoming = [response.user_message, response.assistant_message];
      setMessages((current) => {
        const known = new Set(current.map((item) => item.message_id));
        return [...current, ...incoming.filter((item) => !known.has(item.message_id))];
      });
      mergeChatSessionMessages(chatId, incoming);
      if (draft.trim() === text) setDraft('');
      pending.current = null;
    } catch (reason) {
      setError(getApiErrorMessage(reason));
      setOffline(reason instanceof ApiError && reason.status === 0);
      setInitialLoadFailed(false);
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  // Opened with a question (from the report): it is sent once, as if I had typed it here.
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  const asked = useRef(false);
  useEffect(() => {
    if (!ask || asked.current || loading || !chatId) return;
    asked.current = true;
    void send(ask);
    // send is made anew on every render; this runs once, when the talk is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, chatId, loading]);

  const decide = async (pendingActionId: string, decision: 'confirm' | 'cancel') => {
    if (!chatId || deciding) return;
    const slot = `${pendingActionId}:${decision}`;
    decisionKeys.current[slot] ??= newMessageId(); // a retry of the same decision reuses its key
    setDeciding(pendingActionId);
    setError(null);
    try {
      const response = await decideExerciseAdjustment(chatId, pendingActionId, decision, decisionKeys.current[slot]);
      const incoming = [response.user_message, response.assistant_message].filter(Boolean);
      setMessages((current) => {
        const known = new Set(current.map((item) => item.message_id));
        return [...current, ...incoming.filter((item) => !known.has(item.message_id))];
      });
      mergeChatSessionMessages(chatId, incoming);
    } catch (reason) {
      // A 409 means this card can no longer be used; its line under the answer says why.
      const note = reason instanceof ApiError && reason.status === 409 ? cardConflictText(reason.detail) : null;
      if (note) setCardNotes((current) => ({ ...current, [pendingActionId]: note }));
      else {
        setError(getApiErrorMessage(reason));
        setOffline(reason instanceof ApiError && reason.status === 0);
        setInitialLoadFailed(false);
      }
    } finally {
      setDeciding(null);
    }
  };

  const pickTone = async (id: ChatCharacterId) => {
    setToneOpen(false);
    if (id === character.id) return;
    try {
      await saveChatCharacter(id);
      setCharacter(chatCharacters.find((item) => item.id === id) ?? chatCharacters[0]);
    } catch {
      Alert.alert('선택을 저장하지 못했어요', '잠시 후 다시 시도해 주세요.');
    }
  };

  const lines: AskLine[] = messages.map((message, index) => {
    if (message.sender_type === 'user') return { key: message.message_id, mine: message.content };
    // The card is shown only from the server's action fields, never from the answer text.
    const view = cardView(cards[index], cards, now, cardNotes);
    return {
      key: message.message_id,
      // Every answer opens with the sentence of the way of talking chosen now, old answers too.
      answer: displayChatAnswer(message.content, character.id),
      note: view?.kind === 'note' ? view.text : undefined,
      card:
        view?.kind === 'buttons'
          ? {
              busy: Boolean(deciding),
              waiting: deciding === view.pendingActionId,
              onNo: () => void decide(view.pendingActionId, 'cancel'),
              onYes: () => void decide(view.pendingActionId, 'confirm'),
            }
          : undefined,
    };
  });

  return (
    <>
      <AskView
        canType={Boolean(chatId) && !sending}
        draft={draft}
        error={initialLoadFailed ? null : error}
        failed={
          initialLoadFailed && error && messages.length === 0 ? (
            <R6ConnectionError message={error} offline={offline} onRetry={() => void load()} preservesInput={Boolean(draft)} />
          ) : undefined
        }
        greeting={tones[character.id].greeting}
        lines={lines}
        loading={loading && messages.length === 0}
        onBack={() => router.back()}
        onDraft={setDraft}
        onSend={(text) => void send(text)}
        onTone={() => setToneOpen(true)}
        prompts={prompts}
        tier={hero.tierIndex}
        tone={tones[character.id].name}
        waiting={sending}
        who={hero.who}
      />
      <ToneSheet
        chosen={character.id}
        onClose={() => setToneOpen(false)}
        onPick={(id) => void pickTone(id)}
        tones={chatCharacters.map((item) => ({ id: item.id, name: tones[item.id].name, first: displayChatAnswer('', item.id).trim() }))}
        visible={toneOpen}
      />
    </>
  );
}
