import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SendIcon from '@/assets/icons/feature/PaperPlane_Fill.svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import InfoIcon from '@/assets/icons/ui/info.svg';
import { createChat, getChatMessages, getChats, sendChatMessage } from '@/src/api/chat';
import { ApiError, getApiErrorMessage } from '@/src/api/client';
import { R6ConnectionError } from '@/src/components/common/R6ConnectionError';
import { ChatCharacterAvatar, getChatAvatarVariant } from '@/src/components/chat/ChatCharacterAvatar';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { getChatSessionSnapshot, mergeChatSessionMessages, prefetchActiveChat, updateChatSessionSnapshot } from '@/src/features/chat/chatSessionCache';
import { chatCharacters, chatWelcomes, displayChatAnswer, loadChatCharacter } from '@/src/features/chat/chatCharacters';
import type { ChatMessage } from '@/src/types/chat';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';

const prompts = ['운동 기록 알려줘', '최근 건강 점수 알려줘'];

function newMessageId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (letter) => {
    const digit = Math.floor(Math.random() * 16);
    return (letter === 'x' ? digit : (digit & 3) | 8).toString(16);
  });
}

function messageTime(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getHours() < 12 ? '오전' : '오후'} ${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function R6ChatScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const scroll = useRef<ScrollView>(null);
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <View style={styles.header}>
          <Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={() => router.back()}><CaretLeftIcon color={colors.textPrimary} height={24} width={24} /></Pressable>
          <View style={styles.headerCenter}>
            <ChatCharacterAvatar characterId={character.id} size={28} />
            <Text style={[styles.headerName, simple && simpleStyles.headerName]}>{character.name}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/chat/characters')} style={styles.change}><Text style={styles.changeText}>바꾸기</Text></Pressable>
        </View>
      </View>
      <View style={styles.disclaimer}><InfoIcon color={colors.textBody} height={18} width={18} /><Text style={styles.disclaimerText}>건강 판단은 참고용이에요. 증상이 있으면 병원에 문의해 주세요.</Text></View>

      {loading && messages.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.primaryText} /></View>
      ) : initialLoadFailed && error && messages.length === 0 ? (
        <R6ConnectionError message={error} offline={offline} onRetry={() => void load()} preservesInput={Boolean(draft)} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          ref={scroll}
        >
          {messages.length === 0 ? (
            <View style={styles.assistantRow}>
              <ChatCharacterAvatar characterId={character.id} size={26} variant={getChatAvatarVariant({ isWelcome: true })} />
              <View style={styles.assistantColumn}><View style={[styles.assistantBubble, simple && simpleStyles.bubble]}><Text style={[styles.messageText, simple && simpleStyles.messageText]}>{chatWelcomes[character.id]}</Text></View><SimpleReadButton label="환영 인사 듣기" text={chatWelcomes[character.id]} /></View>
            </View>
          ) : null}
          {messages.map((message) => message.sender_type === 'user' ? (
            <View key={message.message_id} style={styles.userRow}>
              <View style={[styles.userBubble, simple && simpleStyles.bubble]}><Text style={[styles.userText, simple && simpleStyles.messageText]}>{message.content}</Text></View>
              <Text style={styles.time}>{messageTime(message.created_at)}</Text>
            </View>
          ) : (
            <View key={message.message_id} style={styles.assistantRow}>
              <ChatCharacterAvatar characterId={character.id} size={26} variant={getChatAvatarVariant({ needsMoreData: message.needs_more_data })} />
              <View style={styles.assistantColumn}>
                <View style={[styles.assistantBubble, simple && simpleStyles.bubble]}><Text style={[styles.messageText, simple && simpleStyles.messageText]}>{displayChatAnswer(message.content, character.id)}</Text></View>
                <SimpleReadButton label="답변 듣기" text={displayChatAnswer(message.content, character.id)} />
                <Text style={styles.time}>{messageTime(message.created_at)}</Text>
              </View>
            </View>
          ))}
          {sending ? <ActivityIndicator color={colors.primaryText} style={styles.sending} /> : null}
          {error ? <View style={styles.inlineError}><Text style={styles.inlineErrorText}>{error}</Text></View> : null}
          <View style={styles.promptRow}>{prompts.map((prompt) => (
            <Pressable accessibilityRole="button" key={prompt} onPress={() => setDraft(prompt)} style={styles.prompt}><Text style={styles.promptText}>{prompt}</Text></Pressable>
          ))}</View>
        </ScrollView>
      )}
      <View style={[styles.composer, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <TextInput accessibilityLabel="챗봇 메시지" editable={Boolean(chatId) && !sending} maxLength={500} onChangeText={setDraft} onSubmitEditing={() => void send()} placeholder={`${character.name}에게 물어보세요`} placeholderTextColor={colors.textDisabled} returnKeyType="send" style={[styles.input, simple && simpleStyles.input]} value={draft} />
        <Pressable accessibilityRole="button" accessibilityLabel="보내기" disabled={!chatId || !draft.trim() || sending} onPress={() => void send()} style={[styles.sendButton, (!chatId || !draft.trim() || sending) && styles.sendDisabled]}><SendIcon color="#FFFFFF" height={22} width={22} /></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    header: { alignItems: 'center', flexDirection: 'row', minHeight: 52, paddingHorizontal: 20 },
    headerCenter: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center' },
    headerName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    change: { padding: 8 },
    changeText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    disclaimer: { backgroundColor: colors.surfaceMuted, flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 10 },
    disclaimerText: { color: colors.textBody, flex: 1, fontSize: 14, lineHeight: 21 },
    center: { flex: 1, justifyContent: 'center' },
    messages: { flexGrow: 1, gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
    assistantRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, maxWidth: '88%' },
    assistantColumn: { flexShrink: 1, gap: 4 },
    assistantBubble: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexShrink: 1, padding: 14 },
    messageText: { color: colors.textPrimary, fontSize: 16, lineHeight: 24 },
    userRow: { alignItems: 'flex-end', gap: 4 },
    userBubble: { backgroundColor: colors.tabBar, borderRadius: 16, maxWidth: '82%', padding: 14 },
    userText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24 },
    time: { color: colors.textSecondary, fontSize: 12 },
    sending: { alignSelf: 'flex-start' },
    inlineError: { backgroundColor: colors.dangerLight, borderRadius: 12, padding: 12 },
    inlineErrorText: { color: colors.danger, fontSize: 14 },
    promptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 36 },
    prompt: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 40, justifyContent: 'center', paddingHorizontal: 16 },
    promptText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    composer: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, borderWidth: 1, color: colors.textPrimary, flex: 1, fontSize: 16, minHeight: 48, paddingHorizontal: 16 },
    sendButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
    sendDisabled: { opacity: 0.4 },
  } as const;
}

const simpleStyles = StyleSheet.create({
  headerName: {},
  bubble: { padding: 16, maxWidth: '100%' },
  messageText: {},
  input: { minHeight: 52 },
});
