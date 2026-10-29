import { useCallback, useRef, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityConversations,
  getCommunityErrorMessage,
  type CommunityConversation,
} from '@/src/api/community';
import { AppButton, AppHeader, Text } from '@/src/components/common';
import { CommunityAvatar } from '@/src/components/community';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { COMMUNITY_MESSAGES_ENABLED } from '@/src/features/community/communityFeatures';
import { colors, fontFamilies, radius, spacing, typography } from '@/src/theme';

// While messages are switched off, a direct link lands on the community tab instead.
export default function CommunityMessagesRoute() {
  if (!COMMUNITY_MESSAGES_ENABLED) return <Redirect href="/community" />;
  return <CommunityMessagesScreen />;
}

// Conversations with at least one message, most recent first. Reloads when shown again.
function CommunityMessagesScreen() {
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

  const openChat = (item: CommunityConversation) =>
    router.push({
      params: {
        conversationId: item.conversation_id,
        nickname: item.other.nickname,
        otherId: item.other.user_id,
      },
      pathname: '/community/chat/[conversationId]',
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="메시지" />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => void load()} title="다시 시도" />
        </View>
      ) : items === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
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

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  message: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.background },
  body: { flex: 1, gap: 2, minWidth: 0 },
  top: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  nickname: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
  },
  time: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
  preview: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 14,
  },
  previewUnread: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.round,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: colors.surface, fontFamily: fontFamilies.pretendardBold, fontSize: 12 },
});
