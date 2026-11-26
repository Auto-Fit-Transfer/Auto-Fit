import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityBlocks,
  getCommunityErrorMessage,
  setCommunityBlock,
  type CommunityBlockedUser,
} from '@/src/api/community';
import { AppButton, AppHeader, Text } from '@/src/components/common';
import { CommunityAvatar } from '@/src/components/community';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';

export default function CommunityBlocksScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [users, setUsers] = useState<CommunityBlockedUser[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const load = useCallback(async () => {
    try {
      setUsers(await getCommunityBlocks());
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const unblock = async (user: CommunityBlockedUser) => {
    try {
      await setCommunityBlock(user.user_id, false);
      setUsers((current) => current?.filter((item) => item.user_id !== user.user_id) ?? null);
      notify(`${user.nickname}님 차단을 풀었어요. 피드를 새로고침하면 다시 보여요.`);
    } catch (error) {
      notify(getCommunityErrorMessage(error));
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="차단한 사용자" />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton
            fullWidth={false}
            onPress={() => {
              setErrorMessage(undefined);
              setUsers(null);
              void load();
            }}
            title="다시 시도"
          />
        </View>
      ) : users === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          data={users}
          keyExtractor={(user) => user.user_id}
          ListEmptyComponent={
            <View style={styles.message}>
              <Text style={styles.messageText}>차단한 사용자가 없어요.</Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={styles.description}>
              차단하면 서로의 글과 댓글이 보이지 않아요. 언제든 풀 수 있어요.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <CommunityAvatar author={item} size={40} />
              <Text numberOfLines={1} style={styles.nickname}>
                {item.nickname}
              </Text>
              <Pressable hitSlop={{ bottom: 6, top: 6 }}
                accessibilityLabel={`${item.nickname}님 차단 풀기`}
                accessibilityRole="button"
                onPress={() => void unblock(item)}
                style={({ pressed }) => [styles.unblock, pressed && styles.pressed]}
              >
                <Text style={styles.unblockText}>차단 풀기</Text>
              </Pressable>
            </View>
          )}
        />
      )}
      {actions.elements}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    description: { ...a.note, paddingHorizontal: 16, paddingVertical: 12 },
    message: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 32 },
    messageText: { ...a.p15, color: colors.textBody, textAlign: 'center' },
    row: { alignItems: 'center', borderBottomColor: colors.track, borderBottomWidth: 2, flexDirection: 'row', gap: 12, marginHorizontal: 16, paddingVertical: 12 },
    nickname: { ...a.p15, color: colors.ink, flex: 1 },
    unblock: a.mini,
    pressed: { boxShadow: '0 0 0 rgba(32, 35, 63, 0.3)', transform: [{ translateY: 3 }] },
    unblockText: a.miniText,
  } as const;
}
