import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View } from 'react-native';

import {
  getCommunityClubs,
  getCommunityErrorMessage,
  type CommunityClub,
} from '@/src/api/community';
import { AppButton, Text } from '@/src/components/common';
import { CommunityClubCard } from '@/src/components/community';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies, spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';

type Scope = 'all' | 'mine';

// The 클럽 tab of the community screen. Reloads when the screen comes back into view, so a
// club created or joined elsewhere shows up.
export function CommunityClubsPane({ bottomSpace }: { bottomSpace: number }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { isDark } = useDisplayPreferences();
  const [scope, setScope] = useState<Scope>('mine');
  const [clubs, setClubs] = useState<CommunityClub[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const page = await getCommunityClubs(scope);
      if (id !== request.current) return;
      setClubs(page.items);
      setCursor(page.next_cursor);
      setErrorMessage(undefined);
    } catch (error) {
      if (id === request.current) setErrorMessage(getCommunityErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [scope]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const id = request.current;
    try {
      const page = await getCommunityClubs(scope, cursor);
      if (id !== request.current) return;
      setClubs((current) => {
        const seen = new Set(current?.map((club) => club.club_id));
        return [...(current ?? []), ...page.items.filter((club) => !seen.has(club.club_id))];
      });
      setCursor(page.next_cursor);
    } catch {
      // Scrolling again retries.
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const switchScope = (next: Scope) => {
    if (next === scope) return;
    setClubs(null);
    setCursor(null);
    setScope(next);
  };

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={[styles.heading, isDark && { color: darkColors.textPrimary }]}>
        {scope === 'mine' ? `내 클럽${clubs && !cursor ? ` ${clubs.length}` : ''}` : '클럽 찾기'}
      </Text>
      <View style={styles.headerActions}>
        <Pressable hitSlop={{ bottom: 6, top: 6 }} accessibilityRole="button" onPress={() => switchScope(scope === 'mine' ? 'all' : 'mine')} style={styles.switchButton}>
          <Text style={styles.switchText}>{scope === 'mine' ? '클럽 찾기' : '내 클럽'}</Text>
        </Pressable>
        {scope === 'all' ? <Pressable hitSlop={16} accessibilityRole="button" onPress={() => router.push('/community/club/new')} style={styles.createButton}><Text style={styles.createText}>만들기</Text></Pressable> : null}
      </View>
    </View>
  );

  if (errorMessage) {
    return (
      <View style={styles.message}>
        <Text style={styles.messageText}>{errorMessage}</Text>
        <AppButton
          fullWidth={false}
          onPress={() => {
            setErrorMessage(undefined);
            void load();
          }}
          title="다시 시도"
        />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomSpace + spacing.xl }}
      data={clubs ?? []}
      keyExtractor={(club) => club.club_id}
      ListEmptyComponent={
        clubs === null ? (
          <ActivityIndicator color={colors.primary} style={styles.message} />
        ) : (
          <View style={styles.message}>
            <Text style={styles.messageText}>
              {scope === 'mine'
                ? '아직 가입한 클럽이 없어요.\n전체 클럽에서 마음에 드는 모임에 가입해 보세요.'
                : '아직 만들어진 클럽이 없어요.\n관심사가 같은 사람들과 첫 클럽을 만들어 보세요!'}
            </Text>
          </View>
        )
      }
      ListHeaderComponent={header}
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
        <CommunityClubCard
          club={item}
          onPress={() =>
            router.push({ params: { clubId: item.club_id }, pathname: '/community/club/[clubId]' })
          }
        />
      )}
    />
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 16, paddingTop: 16 },
    heading: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    headerActions: { flexDirection: 'row', gap: 8 },
    switchButton: a.mini,
    switchText: a.miniText,
    createButton: { ...a.mini, backgroundColor: colors.primary },
    createText: { ...a.miniText, color: colors.onPrimary },
    message: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 32 },
    messageText: { ...a.p15, color: colors.textBody, textAlign: 'center' },
  } as const;
}
