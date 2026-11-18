import { rememberConversationPeer } from '@/src/features/community/conversationPeers';
import { useCallback, useRef, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import {
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityConversations,
  getCommunityErrorMessage,
  type CommunityConversation,
} from '@/src/api/community';
import { ALoading } from '@/src/components/a/ALoading';
import { aForm } from '@/src/components/a/form';
import { AppButton, AppHeader, Text } from '@/src/components/common';
import { CommunityAvatar } from '@/src/components/community';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { radius, spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { COMMUNITY_MESSAGES_ENABLED } from '@/src/features/community/communityFeatures';

// Conversations with at least one message, most recent first. Reloads when shown again.
// While messages are switched off, a direct link lands on the community tab instead.
export default function CommunityMessagesRoute() {
  if (!COMMUNITY_MESSAGES_ENABLED) return <Redirect href="/community" />;
  return <CommunityMessagesScreen />;
}

function CommunityMessagesScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CommunityConversation[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const page = await getCommunityConversations();
      setItems(page.items);
      setCursor(page.next_cursor);
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const page = await getCommunityConversations(cursor);
      setItems((current) => {
        const seen = new Set(current?.map((item) => item.conversation_id));
        return [
          ...(current ?? []),
          ...page.items.filter((item) => !seen.has(item.conversation_id)),
        ];
      });
      setCursor(page.next_cursor);
    } catch {
      // Scrolling again retries.
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const openChat = (item: CommunityConversation) => {
    rememberConversationPeer(item.conversation_id, item.other);
    router.push({ params: { conversationId: item.conversation_id }, pathname: '/community/chat/[conversationId]' });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="메시지" />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => void load()} title="다시 시도" />
        </View>
      ) : items === null ? (
        <ALoading />
      ) : (
        <FlatList
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }}
          data={items}
          keyExtractor={(item) => item.conversation_id}
          ListEmptyComponent={
            <View style={styles.message}>
              <Text style={styles.messageText}>
                아직 대화가 없어요.{'\n'}서로 팔로우한 사람의 프로필에서 메시지를 보낼 수 있어요.
              </Text>
            </View>
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityLabel={`${item.other.nickname}님과의 대화${
                item.unread_count ? `, 안 읽은 메시지 ${item.unread_count}개` : ''
              }`}
              accessibilityRole="button"
              onPress={() => openChat(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <CommunityAvatar author={item.other} size={44} />
              <View style={styles.body}>
                <View style={styles.top}>
                  <Text numberOfLines={1} style={styles.nickname}>
                    {item.other.nickname}
                  </Text>
                  {item.last_message ? (
                    <Text style={styles.time}>
                      {formatCommunityTime(item.last_message.created_at)}
                    </Text>
                  ) : null}
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.preview, item.unread_count > 0 && styles.previewUnread]}
                >
                  {item.last_message
                    ? `${item.last_message.is_mine ? '나: ' : ''}${item.last_message.content}`
                    : '메시지가 삭제됐어요'}
                </Text>
              </View>
              {item.unread_count > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {item.unread_count > 99 ? '99+' : item.unread_count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    message: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xxl },
    messageText: { ...a.p15, color: colors.ink, textAlign: 'center' },
    row: { alignItems: 'center', borderBottomColor: colors.track, borderBottomWidth: 2, flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    pressed: { backgroundColor: colors.primaryLight },
    body: { flex: 1, gap: 2, minWidth: 0 },
    top: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
    nickname: { ...a.p15, color: colors.ink, flex: 1 },
    time: a.note,
    preview: { ...a.p12, color: colors.textBody },
    previewUnread: { color: colors.ink },
    // unread count: violet with the dark outline, not red
    badge: { alignItems: 'center', backgroundColor: colors.primary, borderColor: colors.ink, borderRadius: radius.round, borderWidth: 2, minWidth: 22, paddingHorizontal: 6 },
    badgeText: { ...a.p12, color: colors.onPrimary },
  } as const;
}
