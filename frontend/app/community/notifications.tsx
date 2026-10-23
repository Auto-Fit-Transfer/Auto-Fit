import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityErrorMessage,
  getCommunityNotifications,
  readCommunityNotifications,
  type CommunityNotification,
} from '@/src/api/community';
import { AppButton, AppHeader } from '@/src/components/common';
import { CommunityAvatar } from '@/src/components/community';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { colors, fontFamilies, spacing, typography } from '@/src/theme';

function describe(item: CommunityNotification) {
  switch (item.type) {
    case 'follow':
      return '님이 나를 팔로우했어요.';
    case 'like':
      return '님이 내 글을 좋아해요.';
    case 'repost':
      return '님이 내 글을 공유했어요.';
    case 'comment':
      return '님이 내 글에 댓글을 남겼어요.';
  }
}

export default function CommunityNotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CommunityNotification[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);

  // Unread rows stay highlighted for this visit; the server marks them read right away.
  const load = useCallback(async () => {
    try {
      const page = await getCommunityNotifications();
      setItems(page.items);
      setCursor(page.next_cursor);
      setErrorMessage(undefined);
      if (page.items.some((item) => !item.is_read)) {
        readCommunityNotifications().catch(() => undefined);
      }
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const page = await getCommunityNotifications(cursor);
      setItems((current) => {
        const seen = new Set(current?.map((item) => item.notification_id));
        return [
          ...(current ?? []),
          ...page.items.filter((item) => !seen.has(item.notification_id)),
        ];
      });
      setCursor(page.next_cursor);
    } catch {
      // The list stays usable; scrolling again retries.
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const openActor = (item: CommunityNotification) =>
    router.push({ params: { userId: item.actor.user_id }, pathname: '/community/user/[userId]' });

  const open = (item: CommunityNotification) => {
    if (item.post_id) {
      router.push({ params: { postId: item.post_id }, pathname: '/community/[postId]' });
    } else {
      openActor(item);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="알림" />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton
            fullWidth={false}
            onPress={() => {
              setErrorMessage(undefined);
              setItems(null);
              void load();
            }}
            title="다시 시도"
          />
        </View>
      ) : items === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }}
          data={items}
          keyExtractor={(item) => item.notification_id}
          ListEmptyComponent={
            <View style={styles.message}>
              <Text style={styles.messageText}>
                아직 알림이 없어요.{'\n'}누군가 나를 팔로우하거나 내 글에 반응하면 알려 드려요.
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
          renderItem={({ item }) => {
            const preview = item.type === 'comment' ? item.comment_preview : item.post_preview;
            return (
              // No button role on the row: it contains the avatar button (no nested buttons on web).
              <Pressable
                onPress={() => open(item)}
                style={({ pressed }) => [
                  styles.row,
                  !item.is_read && styles.unread,
                  pressed && styles.pressed,
                ]}
              >
                <Pressable
                  accessibilityLabel={`${item.actor.nickname}님 프로필`}
                  onPress={() => openActor(item)}
                >
                  <CommunityAvatar author={item.actor} size={40} />
                </Pressable>
                <View style={styles.body}>
                  <Text style={styles.text}>
                    <Text style={styles.actor}>{item.actor.nickname}</Text>
                    {describe(item)}
                  </Text>
                  {preview ? (
                    <Text numberOfLines={2} style={styles.preview}>
                      {preview}
                    </Text>
                  ) : null}
                  <Text style={styles.time}>{formatCommunityTime(item.created_at)}</Text>
                </View>
              </Pressable>
            );
          }}
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
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  unread: { backgroundColor: colors.primaryLight },
  pressed: { opacity: 0.8 },
  body: { flex: 1, gap: 2, minWidth: 0 },
  text: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 15,
    lineHeight: 21,
  },
  actor: { fontFamily: fontFamilies.pretendardBold },
  preview: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 14,
    lineHeight: 20,
  },
  time: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
});
