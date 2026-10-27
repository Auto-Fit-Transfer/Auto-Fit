import { Pressable, StyleSheet, View } from 'react-native';

import { COMMUNITY_CLUB_CATEGORIES, type CommunityClub } from '@/src/api/community';
import { Text } from '@/src/components/common';
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
        <Text style={styles.badgeText}>{communityClubCategoryLabel(club.category)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.name}>
            {club.name}
          </Text>
          {club.is_member ? (
            <Text style={styles.joined}>{club.is_owner ? '클럽장' : '가입함'}</Text>
          ) : null}
        </View>
        {club.description ? (
          <Text numberOfLines={1} style={styles.description}>
            {club.description}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          회원 {club.member_count.toLocaleString()}명 · 글 {club.post_count.toLocaleString()}개
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.background },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: 64,
  },
  badgeText: {
    color: colors.primaryDark,
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
  description: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 14,
  },
  meta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
});
