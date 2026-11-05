import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  SectionList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityErrorMessage,
  getCommunityNotifications,
  readCommunityNotifications,
  type CommunityNotification,
} from '@/src/api/community';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { AppButton, Text } from '@/src/components/common';
import { CommunityAvatar } from '@/src/components/community';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { fontFamilies, spacing, typography, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CommunityNotification[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [readError, setReadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [tab, setTab] = useState<'all' | 'community'>('all');
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const page = await getCommunityNotifications();
      setItems(page.items);
      setCursor(page.next_cursor);
      setErrorMessage(undefined);
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

  const markAllRead = async () => {
    if (markingRead || !items?.some((item) => !item.is_read)) return;
    setMarkingRead(true);
    try {
      await readCommunityNotifications();
      setItems((current) => current?.map((item) => ({ ...item, is_read: true })) ?? null);
      setReadError('');
    } catch (cause) {
      setReadError(getCommunityErrorMessage(cause));
    } finally {
      setMarkingRead(false);
    }
  };
  const sections = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const groups = [
      { title: '오늘', data: [] as CommunityNotification[] },
      { title: '이번 주', data: [] as CommunityNotification[] },
      { title: '이전 알림', data: [] as CommunityNotification[] },
    ];
    for (const item of items ?? []) {
      const date = new Date(item.created_at);
      groups[Number.isNaN(date.getTime()) || date < monday ? 2 : date >= today ? 0 : 1].data.push(item);
    }
    return groups.filter((group) => group.data.length > 0);
  }, [items]);

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={() => router.back()} title="알림" />
      <View style={styles.filters}>
        {([['all', '전체'], ['community', '커뮤니티']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.filter, tab === key && styles.filterSelected]}><Text style={[styles.filterText, tab === key && styles.filterTextSelected]}>{label}</Text></Pressable>)}
        <View accessibilityLabel="챌린지·티어 알림은 준비 중" style={styles.filter}><Text style={styles.filterText}>챌린지 · 티어</Text></View>
        <Pressable hitSlop={16} accessibilityRole="button" disabled={markingRead || !items?.some((item) => !item.is_read)} onPress={() => void markAllRead()} style={styles.markReadButton}><Text style={styles.markRead}>모두 읽음</Text></Pressable>
      </View>
      <Text style={styles.availability}>커뮤니티 알림을 볼 수 있어요. 챌린지·티어 알림은 준비 중이에요.</Text>
      {readError ? <Text style={styles.readError}>{readError}</Text> : null}
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
        <SectionList
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }}
          sections={sections}
          keyExtractor={(item) => item.notification_id}
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
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
                  pressed && styles.pressed,
                ]}
              >
                <View accessibilityLabel={item.is_read ? undefined : '읽지 않음'} style={[styles.dot, item.is_read && styles.dotRead]} />
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

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    filters: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }, filter: { backgroundColor: colors.background, borderRadius: 999, height: 34, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }, filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, filterText: { color: colors.textSecondary, fontSize: 12 }, filterTextSelected: { color: '#FFFFFF' }, markReadButton: { marginLeft: 'auto' }, markRead: { color: colors.textSecondary, fontSize: 12 }, sectionTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }, readError: { color: colors.danger, fontSize: 12, paddingHorizontal: 20 },
    availability: { color: colors.textSecondary, fontSize: 12, paddingHorizontal: 20, paddingBottom: 8 },
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
    dot: { alignSelf: 'center', backgroundColor: colors.tabBar, borderRadius: 3, height: 6, marginLeft: -10, marginRight: -6, width: 6 },
    dotRead: { backgroundColor: 'transparent' },
    pressed: { opacity: 0.8 },
    body: { flex: 1, gap: 2, minWidth: 0 },
    text: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 14,
      lineHeight: 20,
    },
    actor: { fontFamily: fontFamilies.pretendardBold },
    preview: {
      color: colors.textSecondary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 12,
      lineHeight: 18,
    },
    time: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
  } as const;
}
