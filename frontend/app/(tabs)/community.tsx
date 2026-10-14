import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PencilIcon from '@/assets/icons/feature/Pencil_Fill.svg';
import GearIcon from '@/assets/icons/system/GearSix.svg';
import {
  getCommunityErrorMessage,
  getCommunityFeed,
  type CommunityPost,
} from '@/src/api/community';
import { AppButton, IconButton } from '@/src/components/common';
import { CommunityPostCard } from '@/src/components/community';
import {
  BOTTOM_NAVIGATION_MIN_BOTTOM_GAP,
  getBottomNavigationVisualHeight,
} from '@/src/components/navigation/BottomNavigation';
import {
  applyCommunityEvent,
  subscribeCommunityEvents,
} from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, radius, shadows, spacing, typography } from '@/src/theme';

type LoadState = 'loading' | 'ready' | 'error';

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [items, setItems] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const bottomSpace =
    getBottomNavigationVisualHeight(windowHeight) +
    Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP);

  // The effect only starts the request; state changes happen after it answers.
  const loadFirstPage = useCallback(
    async (inlineError: boolean) => {
      try {
        const page = await getCommunityFeed();
        setItems(page.items);
        setCursor(page.next_cursor);
        setState('ready');
      } catch (error) {
        if (inlineError) {
          setErrorMessage(getCommunityErrorMessage(error));
          setState('error');
        } else {
          notify(getCommunityErrorMessage(error));
        }
      } finally {
        setRefreshing(false);
      }
    },
    [notify],
  );

  const refresh = () => {
    setRefreshing(true);
    void loadFirstPage(false);
  };

  const retry = () => {
    setState('loading');
    void loadFirstPage(true);
  };

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await getCommunityFeed(cursor);
      setItems((current) => {
        const seen = new Set(current.map((item) => item.feed_item_id));
        return [...current, ...page.items.filter((item) => !seen.has(item.feed_item_id))];
      });
      setCursor(page.next_cursor);
    } catch (error) {
      notify(getCommunityErrorMessage(error));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cursor, notify]);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void loadFirstPage(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [loadFirstPage]);

  useEffect(
    () =>
      subscribeCommunityEvents((event) =>
        setItems((current) => applyCommunityEvent(current, event)),
      ),
    [],
  );

  const openPost = (post: CommunityPost) =>
    router.push({ params: { postId: post.post_id }, pathname: '/community/[postId]' });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text accessibilityRole="header" style={styles.title}>
          커뮤니티
        </Text>
        <IconButton
          accessibilityLabel="차단한 사용자 관리"
          icon={<GearIcon color={colors.textBody} height={24} width={24} />}
          onPress={() => router.push('/community/blocks')}
          size={44}
        />
      </View>

      {state === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.center} />
      ) : state === 'error' ? (
        <View style={[styles.center, styles.message]}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={retry} title="다시 시도" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, { paddingBottom: bottomSpace + 96 }]}
          data={items}
          keyExtractor={(item) => item.feed_item_id}
          ListEmptyComponent={
            <View style={[styles.center, styles.message]}>
              <Text style={styles.emptyTitle}>아직 올라온 글이 없어요</Text>
              <Text style={styles.messageText}>오늘의 운동이나 식단을 처음으로 나눠 보세요!</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footer} /> : null
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={refresh}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <CommunityPostCard
              onLike={() => void actions.toggleLike(item)}
              onMore={() => actions.openPostMenu(item)}
              onPress={() => openPost(item)}
              onRepost={() => void actions.toggleRepost(item)}
              post={item}
            />
          )}
        />
      )}

      <Pressable
        accessibilityLabel="글쓰기"
        accessibilityRole="button"
        onPress={() => router.push('/community/compose')}
        style={({ pressed }) => [
          styles.compose,
          shadows.floating,
          { bottom: bottomSpace + spacing.lg },
          pressed && styles.composePressed,
        ]}
      >
        <PencilIcon color={colors.surface} height={26} width={26} />
      </Pressable>
      {actions.elements}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
  },
  title: { ...typography.title, color: colors.textPrimary },
  list: { flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center' },
  message: { alignItems: 'center', gap: spacing.md, padding: spacing.xxl },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 17,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  footer: { paddingVertical: spacing.lg },
  compose: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xl,
    width: 56,
  },
  composePressed: { backgroundColor: colors.primaryDark },
});
