import { Pressable, View } from 'react-native';

import BarbellIcon from '@/assets/icons/deco/Barbell.svg';
import RunningIcon from '@/assets/icons/deco/SneakerMove.svg';
import DietIcon from '@/assets/icons/feature/navigator/Diet.svg';
import { COMMUNITY_CLUB_CATEGORIES, type CommunityClub } from '@/src/api/community';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';
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
  // Renewal A: a card on its ledge, the club's kind in a violet square.
  const a = aForm(colors);
  return {
    card: { ...a.card, alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 12, marginHorizontal: 16, padding: 12 },
    pressed: { transform: [{ translateY: 4 }] },
    badge: { alignItems: 'center', backgroundColor: colors.primaryLight, borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
    badgeText: { ...a.p12, color: colors.ink, textAlign: 'center' },
    body: { flex: 1, gap: 2, minWidth: 0 },
    titleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    name: { ...a.p15, color: colors.ink, flexShrink: 1 },
    joined: { ...a.p12, backgroundColor: colors.primaryLight, borderRadius: 6, color: colors.ink, overflow: 'hidden', paddingHorizontal: 6 },
    meta: a.note,
  } as const;
}
