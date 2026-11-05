import { Pressable, View } from 'react-native';

import BarbellIcon from '@/assets/icons/deco/Barbell.svg';
import RunningIcon from '@/assets/icons/deco/SneakerMove.svg';
import DietIcon from '@/assets/icons/feature/navigator/Diet.svg';
import { COMMUNITY_CLUB_CATEGORIES, type CommunityClub } from '@/src/api/community';
import { fontFamilies, spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';

export function communityClubCategoryLabel(category: CommunityClub['category']) {
  return COMMUNITY_CLUB_CATEGORIES.find((item) => item.value === category)?.label ?? '기타';
}

export function CommunityClubCard({ club, onPress }: { club: CommunityClub; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityLabel={`${club.name} 클럽, 회원 ${club.member_count}명`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.badge}>
        {club.category === 'running' ? <RunningIcon color={colors.textPrimary} />
          : club.category === 'strength' ? <BarbellIcon color={colors.textPrimary} />
            : club.category === 'diet' ? <DietIcon color={colors.textPrimary} />
              : <Text style={styles.badgeText}>{communityClubCategoryLabel(club.category).slice(0, 2)}</Text>}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.name}>
            {club.name}
          </Text>
          {club.is_owner ? (
            <Text style={styles.joined}>클럽장</Text>
          ) : club.is_member ? (
            <Text style={styles.joined}>가입함</Text>
          ) : null}
        </View>
        <Text style={styles.meta}>
          {communityClubCategoryLabel(club.category)} · 회원 {club.member_count.toLocaleString()}명 · 글 {club.post_count.toLocaleString()}개
        </Text>
      </View>
      <CaretRightIcon color={colors.textSecondary} height={18} width={18} />
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    card: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      flexDirection: 'row',
      gap: spacing.md,
      marginHorizontal: spacing.xl,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    pressed: { backgroundColor: colors.background },
    badge: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      paddingHorizontal: 4,
      width: 40,
    },
    badgeText: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 12,
      textAlign: 'center',
    },
    body: { flex: 1, gap: 2, minWidth: 0 },
    titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
    name: {
      color: colors.textPrimary,
      flexShrink: 1,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 16,
    },
    joined: {
      color: colors.textSecondary,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 12,
    },
    meta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
  } as const;
}
