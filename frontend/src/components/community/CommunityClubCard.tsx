import { Pressable, StyleSheet, Text, View } from 'react-native';

import BarbellIcon from '@/assets/icons/deco/Barbell.svg';
import RunningIcon from '@/assets/icons/deco/SneakerMove.svg';
import DietIcon from '@/assets/icons/feature/navigator/Diet.svg';
import { COMMUNITY_CLUB_CATEGORIES, type CommunityClub } from '@/src/api/community';
import { colors, fontFamilies, radius, spacing } from '@/src/theme';

export function communityClubCategoryLabel(category: CommunityClub['category']) {
  return COMMUNITY_CLUB_CATEGORIES.find((item) => item.value === category)?.label ?? '기타';
}

export function CommunityClubCard({ club, onPress }: { club: CommunityClub; onPress: () => void }) {
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
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
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
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: 44,
  },
  badgeText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
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
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
  },
  meta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
  chevron: { color: colors.textSecondary, fontSize: 22 },
});
