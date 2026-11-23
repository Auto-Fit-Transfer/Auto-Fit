import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AutofitWordmark from '@/assets/icons/autofit-wordmark.svg';
import AutofitWordmarkDark from '@/assets/icons/autofit-wordmark-dark.svg';
import CheckIcon from '@/assets/icons/system/Check.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import ChatsIcon from '@/assets/icons/ui/chats-circle.svg';
import { ChatCharacterAvatar } from '@/src/components/chat/ChatCharacterAvatar';
import { Text } from '@/src/components/common';
import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal B's home ("the app does it first, I only confirm"), as a view that only shows what it is given:
// the black card says what the app already did for me today, the white card holds the one thing to do now,
// and the last card is this week. app/(tabs)/home.tsx fills it from the server; app/dev/b-home.tsx with samples.
export interface HomeDid {
  key: string;
  title: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
}

export interface HomeViewProps {
  name: string;
  // The face is the character chosen in the chat ("물어보기").
  characterId: ChatCharacterId;
  firstDay?: boolean;
  state: 'loading' | 'ready' | 'error';
  did: HomeDid[];
  now: { label: string; title: string; facts?: string; button: string; onPress: () => void };
  week: {
    days: { key: string; label: string; done: boolean; today: boolean }[];
    summary: string;
    onPress: () => void;
  };
  tier?: { name: string; ratio: number; next?: string; onPress: () => void } | null;
  onAsk: () => void;
  onRetry?: () => void;
  headerRight?: ReactNode;
}

export function HomeView({
  name,
  characterId,
  firstDay = false,
  state,
  did,
  now,
  week,
  tier,
  onAsk,
  onRetry,
  headerRight,
}: HomeViewProps) {
  const { colors, isDark } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const Wordmark = isDark ? AutofitWordmarkDark : AutofitWordmark;
  const headline =
    state === 'loading'
      ? '오늘을 살펴보고 있어요'
      : state === 'error'
        ? '오늘 정보를 불러오지 못했어요'
        : did.length > 0
          ? `오늘 ${did.length}가지를 해 뒀어요`
          : '오늘을 같이 시작해요';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <Wordmark accessibilityLabel="autofit" height={24} width={88} />
          <View style={styles.topRight}>{headerRight}</View>
        </View>

        <View style={styles.ai}>
          <View style={styles.who}>
            <View style={styles.face}>
              <ChatCharacterAvatar characterId={characterId} size={44} />
            </View>
            <View style={styles.whoText}>
              <Text style={styles.hello}>
                {firstDay ? '반가워요' : '안녕'}, {name}
              </Text>
              <Text style={styles.headline}>{headline}</Text>
            </View>
          </View>
          {state === 'error' && onRetry ? (
            <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.pill, styles.retry]}>
              <Text style={styles.pillText}>다시 시도</Text>
            </Pressable>
          ) : null}
          {state === 'ready'
            ? did.map((item, index) => (
                <View key={item.key} style={[styles.did, index > 0 && styles.didLine]}>
                  <View style={styles.check}>
                    <CheckIcon color={'#010101'} height={14} width={14} />
                  </View>
                  <View style={styles.didText}>
                    <Text style={styles.didTitle}>{item.title}</Text>
                    {item.detail ? <Text style={styles.didDetail}>{item.detail}</Text> : null}
                    {item.action ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={item.action.onPress}
                        style={styles.pill}
                      >
                        <Text style={styles.pillText}>{item.action.label}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            : null}
          <Pressable
            accessibilityLabel="궁금한 것 물어보기"
            accessibilityRole="button"
            onPress={onAsk}
            style={styles.ask}
          >
            <Text style={styles.askText}>무엇이든 물어보세요</Text>
            <View style={styles.askIcon}>
              <ChatsIcon color={'#010101'} height={20} width={20} />
            </View>
          </Pressable>
        </View>

        <View style={styles.nowCard}>
          <View style={styles.nowText}>
            <Text style={styles.small}>{now.label}</Text>
            <Text style={styles.nowTitle}>{now.title}</Text>
            {now.facts ? <Text style={styles.nowFacts}>{now.facts}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" onPress={now.onPress} style={styles.go}>
            <Text style={styles.goText}>{now.button}</Text>
          </Pressable>
        </View>

        <View style={styles.weekCard}>
          <View style={styles.spread}>
            <Text style={styles.small}>이번 주</Text>
            <Pressable accessibilityRole="button" onPress={week.onPress} style={styles.link}>
              <Text style={styles.linkText}>{week.summary}</Text>
              <CaretRightIcon color={colors.textPrimary} height={14} width={14} />
            </Pressable>
          </View>
          <View accessibilityLabel="이번 주 운동한 날" style={styles.days}>
            {week.days.map((day) => (
              <View
                key={day.key}
                style={[styles.day, day.today && styles.dayToday, day.done && styles.dayDone]}
              >
                <Text
                  style={[
                    styles.dayText,
                    day.today && styles.dayTextToday,
                    day.done && styles.dayTextDone,
                  ]}
                >
                  {day.label}
                </Text>
              </View>
            ))}
          </View>
          {tier ? (
            <Pressable
              accessibilityLabel={`내 티어 ${tier.name}`}
              accessibilityRole="button"
              onPress={tier.onPress}
              style={styles.tier}
            >
              <View style={styles.tierChip}>
                <Text style={styles.tierChipText}>{tier.name}</Text>
              </View>
              <View style={styles.tierTrack}>
                <View style={[styles.tierFill, { width: `${tier.ratio}%` }]} />
              </View>
              {tier.next ? <Text style={styles.tierNext}>{tier.next}</Text> : null}
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 16, paddingBottom: 110, paddingHorizontal: 24, width: '100%' },
    top: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    topRight: { alignItems: 'center', flexDirection: 'row', gap: 10, marginRight: -10 },

    ai: {
      backgroundColor: colors.aiCard,
      borderColor: colors.aiBorder,
      borderRadius: 28,
      borderWidth: 1,
      gap: 12,
      paddingHorizontal: 21,
      paddingVertical: 19,
    },
    who: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    // A thin ring, so a dark picture (the black cat, the coach) does not sink into the black card.
    face: { borderColor: colors.aiRing, borderRadius: 24, borderWidth: 1.5 },
    whoText: { flex: 1, gap: 1, minWidth: 0 },
    hello: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    headline: { color: colors.onAi, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 18, lineHeight: 25 },
    did: { flexDirection: 'row', gap: 10, paddingVertical: 2 },
    didLine: { borderTopColor: colors.aiLine, borderTopWidth: 1, paddingTop: 12 },
    check: {
      alignItems: 'center',
      backgroundColor: colors.lilac,
      borderRadius: 12,
      height: 24,
      justifyContent: 'center',
      marginTop: -1.5,
      width: 24,
    },
    didText: { alignItems: 'flex-start', flex: 1, gap: 2, minWidth: 0 },
    didTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 21 },
    didDetail: { color: colors.onAiMuted, fontSize: 12.5, lineHeight: 18 },
    pill: {
      backgroundColor: colors.aiRaised,
      borderRadius: 999,
      marginTop: 6,
      minHeight: 34,
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    retry: { alignSelf: 'flex-start', marginLeft: 59, marginTop: 0 },
    pillText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    ask: {
      alignItems: 'center',
      backgroundColor: colors.aiBar,
      borderRadius: 999,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingLeft: 18,
      paddingRight: 4,
      paddingVertical: 4,
    },
    askText: { color: colors.onAiMuted, fontSize: 13.5, lineHeight: 20 },
    askIcon: {
      alignItems: 'center',
      backgroundColor: colors.lilac,
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },

    nowCard: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 28,
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 22,
      paddingVertical: 20,
    },
    nowText: { flex: 1, gap: 2, minWidth: 0 },
    small: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    nowTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 29 },
    nowFacts: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13, lineHeight: 19 },
    go: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 999,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 26,
    },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 15, lineHeight: 21 },

    weekCard: { backgroundColor: colors.surface, borderRadius: 28, gap: 16, paddingHorizontal: 22, paddingVertical: 20 },
    spread: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    link: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 28 },
    linkText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 19 },
    days: { flexDirection: 'row', justifyContent: 'space-between' },
    day: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 18,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    dayToday: { backgroundColor: colors.surface, borderColor: colors.now, borderWidth: 2 },
    dayDone: { backgroundColor: colors.textPrimary },
    dayText: { color: colors.textDisabled, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    dayTextToday: { color: colors.textPrimary },
    dayTextDone: { color: colors.onPrimary },
    tier: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 28 },
    tierChip: { backgroundColor: colors.textPrimary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
    tierChipText: {
      color: colors.onPrimary,
      fontFamily: fontFamilies.pretendardExtraBold,
      fontSize: 11.5,
      letterSpacing: 0.3,
      lineHeight: 16,
    },
    tierTrack: { backgroundColor: colors.surfaceMuted, borderRadius: 4, flex: 1, height: 8, overflow: 'hidden' },
    tierFill: { backgroundColor: colors.textPrimary, borderRadius: 4, height: 8 },
    tierNext: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  } as const;
}
