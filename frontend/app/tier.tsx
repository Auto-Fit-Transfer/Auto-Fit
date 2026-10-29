import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import FileTextIcon from '@/assets/icons/ui/file-text.svg';
import ForkKnifeIcon from '@/assets/icons/ui/fork-knife.svg';
import ActiveBadge from '@/assets/tier/active.svg';
import BalanceBadge from '@/assets/tier/balance.svg';
import CoreBadge from '@/assets/tier/core.svg';
import FitBadge from '@/assets/tier/fit.svg';
import PeakBadge from '@/assets/tier/peak.svg';
import { Notice, Text } from '@/src/components/common';
import { ChoiceSection } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const steps = [
  { name: 'CORE', description: '기반 다지기', Badge: CoreBadge },
  { name: 'BALANCE', description: '균형 잡기', Badge: BalanceBadge },
  { name: 'ACTIVE', description: '꾸준히 실천', Badge: ActiveBadge },
  { name: 'FIT', description: '나에게 맞춤', Badge: FitBadge },
  { name: 'PEAK', description: '최상의 흐름', Badge: PeakBadge },
] as const;

const ways = [
  { title: '식단 관리', body: '추천 식단대로 끼니 기록하기', Icon: ForkKnifeIcon, href: '/diet' },
  { title: '운동 관리', body: '추천 운동 끝까지 마치기', Icon: BarbellIcon, href: '/exercise' },
  {
    title: '건강 데이터',
    body: '새 검진 · 인바디 결과 올리기',
    Icon: FileTextIcon,
    href: '/upload',
  },
] as const;

// Figma C4. The server does not score tiers yet, so the score, the bar to the next step and the
// points per way wait for it. Everyone starts at CORE 1, as the home card says.
export default function TierScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <SubScreen gap={28} onBack={() => router.back()} title="내 티어">
      <View style={styles.hero}>
        <CoreBadge height={115} width={104} />
        <Text style={styles.heroTitle}>CORE 1</Text>
        <Text style={styles.heroBody}>건강관리의 기반을 다지는 단계예요</Text>
      </View>

      <Notice body="티어 점수 계산을 준비하고 있어요. 준비되면 여기에서 내 점수와 다음 단계까지 남은 점수를 보여 드려요." />

      <ChoiceSection title="이번 주 이렇게 올려 보세요">
        <View style={styles.card}>
          {ways.map(({ title, body, Icon, href }, index) => (
            <Pressable
              key={title}
              accessibilityRole="button"
              onPress={() => router.push(href)}
              style={({ pressed }) => [
                styles.way,
                index > 0 && styles.divider,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.wayIcon}>
                <Icon color={colors.textPrimary} height={20} width={20} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.wayTitle}>{title}</Text>
                <Text style={styles.wayBody}>{body}</Text>
              </View>
              <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
            </Pressable>
          ))}
        </View>
      </ChoiceSection>

      <ChoiceSection title="티어 단계">
        <View style={[styles.card, styles.stepsCard]}>
          <View style={styles.steps}>
            {steps.map(({ name, description, Badge }, index) => (
              <View key={name} style={styles.step}>
                <Badge height={44} width={40} />
                <Text style={styles.stepName}>{name}</Text>
                <Text style={styles.stepBody}>{description}</Text>
                {index === 0 ? (
                  <View style={styles.now}>
                    <Text style={styles.nowText}>지금</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <Text style={styles.stepNote}>
            한 단계에 1 · 2 · 3 세 칸이 있고, 3칸을 채우면 다음 단계로 올라가요. 점수는 식단 · 운동
            · 건강 데이터 기록으로 쌓여요.
          </Text>
        </View>
      </ChoiceSection>
    </SubScreen>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1, gap: 2 },
    hero: { alignItems: 'center', gap: 4, paddingTop: 8 },
    heroTitle: { ...text.display, color: colors.textPrimary, marginTop: 8 },
    heroBody: { ...text.body2, color: colors.textBody, textAlign: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      paddingHorizontal: 16,
    },
    way: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      minHeight: 72,
      paddingVertical: 14,
    },
    divider: { borderTopColor: colors.border, borderTopWidth: 1 },
    pressed: { opacity: 0.75 },
    wayIcon: {
      alignItems: 'center',
      backgroundColor: colors.elevated,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    wayTitle: { ...text.body1Strong, color: colors.textPrimary },
    wayBody: { ...text.body2, color: colors.textSecondary },
    stepsCard: { gap: 16, paddingVertical: 20 },
    steps: { flexDirection: 'row', justifyContent: 'space-between' },
    step: { alignItems: 'center', flex: 1, gap: 4 },
    stepName: { ...text.captionStrong, color: colors.textPrimary, marginTop: 4 },
    stepBody: { ...text.caption, color: colors.textSecondary, textAlign: 'center' },
    now: {
      backgroundColor: colors.tier.CORE.bg,
      borderRadius: 10,
      marginTop: 2,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    nowText: { ...text.captionStrong, color: colors.tier.CORE.fg },
    stepNote: { ...text.body2, color: colors.textBody },
  } as const;
}
