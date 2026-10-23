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
  COMMUNITY_REPORT_REASONS,
  getCommunityErrorMessage,
  getCommunityReportQueue,
  moderateCommunityTarget,
  type CommunityModerationAction,
  type CommunityReportItem,
} from '@/src/api/community';
import { AppButton, AppHeader } from '@/src/components/common';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, radius, spacing, typography } from '@/src/theme';

type Status = 'open' | 'resolved';

const TARGET_LABEL: Record<CommunityReportItem['target_type'], string> = {
  comment: '댓글',
  post: '글',
  user: '사용자',
};
const ACTION_LABEL: Record<CommunityModerationAction, string> = {
  dismiss: '넘김',
  hide: '숨김',
  unhide: '되돌림',
};
const reasonLabel = (value: string) =>
  COMMUNITY_REPORT_REASONS.find((item) => item.value === value)?.label ?? value;

// Moderators only (the server refuses everyone else). Reporters are never shown.
export default function CommunityModerationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { handleError, notify } = actions;
  const [status, setStatus] = useState<Status>('open');
  const [items, setItems] = useState<CommunityReportItem[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(new Set<string>());
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const next = await getCommunityReportQueue(status);
      if (id !== request.current) return;
      setItems(next);
      setErrorMessage(undefined);
    } catch (error) {
      if (id === request.current) setErrorMessage(getCommunityErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const act = async (item: CommunityReportItem, action: CommunityModerationAction) => {
    const key = `${item.target_type}:${item.target_id}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try {
      await moderateCommunityTarget(item.target_type, item.target_id, action);
      notify(
        action === 'hide'
          ? `${TARGET_LABEL[item.target_type]}을(를) 숨겼어요.`
          : action === 'unhide'
            ? '숨김을 되돌렸어요.'
            : '신고를 넘겼어요.',
      );
      await load();
    } catch (error) {
      handleError(error);
    } finally {
      busy.current.delete(key);
    }
  };

  const confirmHide = (item: CommunityReportItem) =>
    actions.askConfirm({
      confirmText: '숨기기',
      description: '모든 사람의 화면에서 보이지 않게 돼요. 처리됨 목록에서 되돌릴 수 있어요.',
      run: () => act(item, 'hide'),
      title: `이 ${TARGET_LABEL[item.target_type]}을(를) 숨길까요?`,
    });

  const switchStatus = (next: Status) => {
    if (next === status) return;
    setItems(null);
    setStatus(next);
  };

  const renderItem = ({ item }: { item: CommunityReportItem }) => {
    const canHide = item.target_type !== 'user' && item.exists;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.type}>{TARGET_LABEL[item.target_type]}</Text>
          <Text numberOfLines={1} style={styles.author}>
            {item.target_user.nickname}
          </Text>
          <Text style={styles.count}>신고 {item.report_count}건</Text>
        </View>
        <Text style={styles.reasons}>{item.reasons.map(reasonLabel).join(' · ')}</Text>
        {item.content_snapshot ? (
          <Text numberOfLines={4} style={styles.snapshot}>
            {item.content_snapshot}
          </Text>
        ) : null}
        {item.details.slice(0, 3).map((detail, index) => (
          <Text key={index} numberOfLines={2} style={styles.detail}>
            “{detail.detail}” ({reasonLabel(detail.reason)})
          </Text>
        ))}
        <Text style={styles.meta}>
          최근 신고 {formatCommunityTime(item.latest_reported_at)}
          {!item.exists ? ' · 이미 삭제됨' : item.hidden ? ' · 숨김 상태' : ''}
          {item.last_action ? ` · 마지막 처리: ${ACTION_LABEL[item.last_action]}` : ''}
        </Text>
        <View style={styles.actions}>
          {item.post_id && item.exists && !item.hidden && item.target_type !== 'user' ? (
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                router.push({
                  params: { postId: item.post_id as string },
                  pathname: '/community/[postId]',
                })
              }
            >
              <Text style={styles.link}>글 보기</Text>
            </Pressable>
          ) : null}
          {canHide && item.hidden ? (
            <ActionButton label="되돌리기" onPress={() => void act(item, 'unhide')} />
          ) : null}
          {canHide && !item.hidden ? (
            <ActionButton danger label="숨기기" onPress={() => confirmHide(item)} />
          ) : null}
          {status === 'open' ? (
            <ActionButton label="넘기기" onPress={() => void act(item, 'dismiss')} />
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="신고 검토" />
      <View style={styles.tabs}>
        {(['open', 'resolved'] as Status[]).map((value) => (
          <Pressable
            accessibilityRole="tab"
            aria-selected={value === status}
            key={value}
            onPress={() => switchStatus(value)}
            style={[styles.tab, value === status && styles.tabActive]}
          >
            <Text style={[styles.tabText, value === status && styles.tabTextActive]}>
              {value === 'open' ? '대기 중' : '처리됨'}
            </Text>
          </Pressable>
        ))}
      </View>
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
          keyExtractor={(item) => `${item.target_type}:${item.target_id}`}
          ListEmptyComponent={
            <View style={styles.message}>
              <Text style={styles.messageText}>
                {status === 'open' ? '검토할 신고가 없어요.' : '처리한 신고가 없어요.'}
              </Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={styles.note}>
              신고한 사람은 보이지 않아요. 숨기면 모든 사람의 화면에서 사라지고, 처리됨에서 되돌릴
              수 있어요.
            </Text>
          }
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
          renderItem={renderItem}
        />
      )}
      {actions.elements}
    </View>
  );
}

function ActionButton({
  danger = false,
  label,
  onPress,
}: {
  danger?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        danger && styles.buttonDanger,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, danger && styles.buttonTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  tabs: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  tab: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flex: 1,
    paddingVertical: spacing.md,
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 15 },
  tabTextActive: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
  note: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  card: {
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  type: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.sm,
    color: colors.danger,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  author: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
  },
  count: { color: colors.danger, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  reasons: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
  snapshot: {
    ...typography.body,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    color: colors.textPrimary,
    padding: spacing.md,
  },
  detail: { ...typography.bodySmall, color: colors.textBody },
  meta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  link: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    marginRight: 'auto',
  },
  button: {
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  buttonDanger: { borderColor: colors.danger },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  buttonTextDanger: { color: colors.danger },
  message: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
