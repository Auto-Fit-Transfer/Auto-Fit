import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, Text } from '@/src/components/common';
import {
  fontFamilies,
  radius,
  spacing,
  typography,
  useThemedStyles,
  type AppTheme,
} from '@/src/theme';

const TOOLS: { title: string; description: string; href: Href }[] = [
  {
    description: '신고된 글·댓글을 숨기거나 되돌리고, 문제없는 신고는 넘겨요.',
    href: '/community/moderation',
    title: '신고 검토',
  },
  {
    description: '새 챌린지를 만들고, 기간·목표·보상을 고치거나 꺼요.',
    href: '/community/admin/challenges',
    title: '챌린지 관리',
  },
  {
    description: '운동·식단 점수, 하루 한도, 클럽 개설 비용, 시연 회원 기간을 정해요.',
    href: '/community/admin/rules',
    title: '마일리지 규칙',
  },
];

// Shown from my profile to moderators only; every tool is checked again by the server.
export default function CommunityAdminScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="운영자 도구" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.note}>
          운영자로 지정된 계정만 쓸 수 있어요. 바꾼 내용은 모든 사용자에게 바로 적용돼요.
        </Text>
        {TOOLS.map((tool) => (
          <Pressable
            accessibilityRole="button"
            key={tool.title}
            onPress={() => router.push(tool.href)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardBody}>
              <Text style={styles.title}>{tool.title}</Text>
              <Text style={styles.description}>{tool.description}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    body: { gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
    note: { ...typography.bodySmall, color: colors.textSecondary },
    card: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      flexDirection: 'row',
      padding: spacing.lg,
    },
    pressed: { backgroundColor: colors.background },
    cardBody: { flex: 1, gap: 4 },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    description: { ...typography.bodySmall, color: colors.textBody },
    chevron: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 22 },
  } as const;
}
