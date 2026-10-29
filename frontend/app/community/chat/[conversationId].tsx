import { useCallback, useRef, useState } from 'react';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SendIcon from '@/assets/icons/feature/PaperPlane_Fill.svg';
import MoreIcon from '@/assets/icons/system/DotsThreeVertical.svg';
import {
  COMMUNITY_MAX_MESSAGE_LENGTH,
  deleteCommunityMessage,
  getCommunityErrorCode,
  getCommunityErrorMessage,
  getCommunityMessages,
  readCommunityConversation,
  sendCommunityMessage,
  type CommunityMessage,
} from '@/src/api/community';
import { AppButton, AppHeader, IconButton, Text } from '@/src/components/common';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { COMMUNITY_MESSAGES_ENABLED } from '@/src/features/community/communityFeatures';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import {
  fontFamilies,
  radius,
  spacing,
  typography,
  useAppTheme,
  useThemedStyles,
  type AppTheme,
} from '@/src/theme';

// No real-time server: while this screen is shown it checks for new messages every few seconds.
const POLL_MS = 5000;

const merge = (current: CommunityMessage[], incoming: CommunityMessage[]) => {
  const byId = new Map(current.map((message) => [message.message_id, message]));
  incoming.forEach((message) => byId.set(message.message_id, message));
  return [...byId.values()].sort((a, b) =>
    a.created_at === b.created_at
      ? b.message_id.localeCompare(a.message_id)
      : b.created_at.localeCompare(a.created_at),
  );
};

// While messages are switched off, a direct link lands on the community tab instead.
export default function CommunityChatRoute() {
  if (!COMMUNITY_MESSAGES_ENABLED) return <Redirect href="/community" />;
  return <CommunityChatScreen />;
}

function CommunityChatScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{
    conversationId: string;
    nickname?: string;
    otherId?: string;
  }>();
  const conversationId = params.conversationId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { handleError, notify } = actions;
  const [messages, setMessages] = useState<CommunityMessage[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [closedMessage, setClosedMessage] = useState<string>();
  const loadingMoreRef = useRef(false);
  const latestSeen = useRef<string | null>(null);
  const loaded = useRef(false);

  // Fetches the newest page and merges it, so older pages already loaded stay.
  const refresh = useCallback(async () => {
    try {
      const page = await getCommunityMessages(conversationId);
      setMessages((current) => merge(current ?? [], page.items));
      if (!loaded.current) setCursor(page.next_cursor);
      loaded.current = true;
      const newest = page.items[0];
      if (newest && newest.message_id !== latestSeen.current) {
        latestSeen.current = newest.message_id;
        if (!newest.is_mine) readCommunityConversation(conversationId).catch(() => undefined);
      }
    } catch (error) {
      if (getCommunityErrorCode(error) === 'COMMUNITY_CONVERSATION_NOT_FOUND') {
        setClosedMessage('대화를 이어갈 수 없어요. 차단했거나 상대가 탈퇴했을 수 있어요.');
      } else if (!loaded.current) {
        setClosedMessage(getCommunityErrorMessage(error));
      }
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      readCommunityConversation(conversationId).catch(() => undefined);
      const timer = setInterval(() => void refresh(), POLL_MS);
      return () => clearInterval(timer);
    }, [conversationId, refresh]),
  );

  const loadOlder = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const page = await getCommunityMessages(conversationId, cursor);
      setMessages((current) => merge(current ?? [], page.items));
      setCursor(page.next_cursor);
    } catch (error) {
      notify(getCommunityErrorMessage(error));
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const message = await sendCommunityMessage(conversationId, text);
      setMessages((current) => merge(current ?? [], [message]));
      latestSeen.current = message.message_id;
      setDraft('');
    } catch (error) {
      if (getCommunityErrorCode(error) === 'COMMUNITY_CONVERSATION_NOT_FOUND') {
        setClosedMessage('대화를 이어갈 수 없어요. 차단했거나 상대가 탈퇴했을 수 있어요.');
      } else {
        handleError(error);
      }
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = (message: CommunityMessage) =>
    actions.askConfirm({
      confirmText: '삭제',
      description: '상대방 화면에서도 지워지고 되돌릴 수 없어요.',
      run: async () => {
        await deleteCommunityMessage(message.message_id);
        setMessages(
          (current) => current?.filter((item) => item.message_id !== message.message_id) ?? null,
        );
      },
      title: '메시지를 삭제할까요?',
    });

  const other = params.otherId
    ? { nickname: params.nickname ?? '회원', profile_image_url: null, user_id: params.otherId }
    : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <AppHeader
        onBackPress={() => router.back()}
        rightAction={
          other ? (
            <IconButton
              accessibilityLabel="신고·차단"
              icon={<MoreIcon color={colors.textBody} height={22} width={22} />}
              onPress={() => actions.openUserMenu(other)}
              size={44}
            />
          ) : null
        }
        title={params.nickname ?? '메시지'}
      />
      {closedMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{closedMessage}</Text>
          <AppButton fullWidth={false} onPress={() => router.back()} title="돌아가기" />
        </View>
      ) : messages === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={messages}
          inverted
          keyExtractor={(message) => message.message_id}
          ListEmptyComponent={
            <Text style={styles.empty}>첫 메시지를 보내 보세요. 서로 예의를 지켜 주세요.</Text>
          }
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => (
            <Pressable
              accessibilityHint={item.is_mine ? '길게 누르면 삭제할 수 있어요' : undefined}
              delayLongPress={400}
              onLongPress={item.is_mine ? () => confirmDelete(item) : undefined}
              style={[styles.bubbleRow, item.is_mine && styles.bubbleRowMine]}
            >
              <View style={[styles.bubble, item.is_mine ? styles.bubbleMine : styles.bubbleOther]}>
                <Text style={[styles.bubbleText, item.is_mine && styles.bubbleTextMine]}>
                  {item.content}
                </Text>
              </View>
              <Text style={styles.time}>{formatCommunityTime(item.created_at)}</Text>
            </Pressable>
          )}
        />
      )}
      {closedMessage ? null : (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            accessibilityLabel="메시지 입력"
            lineBreakStrategyIOS="hangul-word"
            maxLength={COMMUNITY_MAX_MESSAGE_LENGTH}
            multiline
            onChangeText={setDraft}
            placeholder="메시지를 입력하세요"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityLabel="보내기"
            accessibilityRole="button"
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
            style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
          >
            <SendIcon color={colors.elevated} height={20} width={20} />
          </Pressable>
        </View>
      )}
      {actions.elements}
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    message: {
      alignItems: 'center',
      flex: 1,
      gap: spacing.md,
      justifyContent: 'center',
      padding: spacing.xxl,
    },
    messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
    list: { flexGrow: 1, gap: spacing.sm, padding: spacing.lg },
    empty: {
      ...typography.body,
      color: colors.textSecondary,
      padding: spacing.xl,
      textAlign: 'center',
      transform: [{ scaleY: -1 }],
    },
    bubbleRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 6 },
    bubbleRowMine: { flexDirection: 'row-reverse' },
    bubble: { borderRadius: radius.lg, maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 9 },
    bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
    bubbleOther: { backgroundColor: colors.background, borderBottomLeftRadius: 4 },
    bubbleText: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 15,
      lineHeight: 21,
    },
    bubbleTextMine: { color: colors.elevated },
    time: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 11 },
    composer: {
      alignItems: 'flex-end',
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      color: colors.textPrimary,
      flex: 1,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 15,
      maxHeight: 120,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    send: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.round,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    sendDisabled: { opacity: 0.4 },
  } as const;
}
