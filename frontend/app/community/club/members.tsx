import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityClubMembers,
  getCommunityErrorMessage,
  removeCommunityClubMember,
  type CommunityClubMember,
} from '@/src/api/community';
import { AppButton, AppHeader, Text } from '@/src/components/common';
import { CommunityAvatar } from '@/src/components/community';
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

// Earliest members first. The owner can remove members; removed members cannot join again.
export default function CommunityClubMembersScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ clubId: string; clubName?: string; owner?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { notify } = actions;
  const isOwner = params.owner === '1';
  const [members, setMembers] = useState<CommunityClubMember[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const page = await getCommunityClubMembers(params.clubId);
      setMembers(page.items);
      setCursor(page.next_cursor);
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
    }
  }, [params.clubId]);

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
      const page = await getCommunityClubMembers(params.clubId, cursor);
      setMembers((current) => {
        const seen = new Set(current?.map((member) => member.user_id));
        return [...(current ?? []), ...page.items.filter((member) => !seen.has(member.user_id))];
      });
      setCursor(page.next_cursor);
    } catch (error) {
      notify(getCommunityErrorMessage(error));
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const confirmRemove = (member: CommunityClubMember) =>
    actions.askConfirm({
      confirmText: '내보내기',
      description: '내보낸 회원은 이 클럽에 다시 가입할 수 없어요. 이미 쓴 글은 남아요.',
      run: async () => {
        await removeCommunityClubMember(params.clubId, member.user_id);
        setMembers((current) => current?.filter((item) => item.user_id !== member.user_id) ?? null);
        notify(`${member.nickname}님을 내보냈어요.`);
      },
      title: `${member.nickname}님을 내보낼까요?`,
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader
        onBackPress={() => router.back()}
        title={params.clubName ? `${params.clubName} 회원` : '클럽 회원'}
      />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => void load()} title="다시 시도" />
        </View>
      ) : members === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          data={members}
          keyExtractor={(member) => member.user_id}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable
                accessibilityLabel={`${item.nickname}님 프로필`}
                accessibilityRole="link"
                onPress={() =>
                  router.push({
                    params: { userId: item.user_id },
                    pathname: '/community/user/[userId]',
                  })
                }
                style={styles.person}
              >
                <CommunityAvatar author={item} size={40} />
                <Text numberOfLines={1} style={styles.nickname}>
                  {item.nickname}
                  {item.is_me ? ' (나)' : ''}
                </Text>
                {item.role === 'owner' ? <Text style={styles.owner}>클럽장</Text> : null}
              </Pressable>
              {isOwner && item.role !== 'owner' ? (
                <Pressable
                  accessibilityLabel={`${item.nickname}님 내보내기`}
                  accessibilityRole="button"
                  onPress={() => confirmRemove(item)}
                  style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                >
                  <Text style={styles.removeText}>내보내기</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}
      {actions.elements}
    </View>
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
    row: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    person: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
    nickname: {
      color: colors.textPrimary,
      flexShrink: 1,
      fontFamily: fontFamilies.pretendardSemiBold,
      fontSize: 15,
    },
    owner: {
      backgroundColor: colors.primaryLight,
      borderRadius: radius.sm,
      color: colors.primaryPressed,
      fontFamily: fontFamilies.pretendardSemiBold,
      fontSize: 12,
      overflow: 'hidden',
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    remove: {
      borderColor: colors.danger,
      borderRadius: radius.round,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    pressed: { backgroundColor: colors.dangerLight },
    removeText: { color: colors.danger, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  } as const;
}
