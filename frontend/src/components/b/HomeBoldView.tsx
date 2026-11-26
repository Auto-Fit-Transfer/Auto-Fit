import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AutofitWordmark from '@/assets/icons/autofit-wordmark.svg';
import AutofitWordmarkDark from '@/assets/icons/autofit-wordmark-dark.svg';
import CheckIcon from '@/assets/icons/system/Check.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import ChatsIcon from '@/assets/icons/ui/chats-circle.svg';
import { ChatCharacterAvatar } from '@/src/components/chat/ChatCharacterAvatar';
import { Text } from '@/src/components/common';
import { BOTTOM_NAVIGATION_MIN_BOTTOM_GAP, getBottomNavigationVisualHeight } from '@/src/components/navigation/BottomNavigation';
import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Headline, type HeadlinePart } from './Headline';

// A bolder candidate for renewal B's home (a test, not the home yet): the app speaks first, in the
// headline, with what it set for today (a proposal, never an allowance like "N kcal more is fine");
// each proposal in the black card takes one of three answers - take it as it is, meet halfway, or my
// own way (the service's three, 11/26); the one-thing card only when no proposal leads there; and the talk bar
// stays at the foot of the screen, above the tab bar. Same parts as the other B screens.
export interface HomeProposal {
  key: string;
  title: string;
  detail?: string;
  // 이대로 (take it) · 조정 (meet halfway) · 내 방식으로 (my own way)
  choices: { label: string; kind: 'accept' | 'adjust' | 'own'; onPress: () => void }[];
}
export interface HomeBoldProps {
  name: string;
  characterId: ChatCharacterId;
  // who said it and when it looked at my day, shown under the headline
  by: string;
  plan: HeadlinePart[][];
  proposals: HomeProposal[];
  // what it only recorded (no choice to make), one quiet line with a way to mend it
  recorded?: { text: string; action?: { label: string; onPress: () => void } } | null;
  // null while the routine card above already holds the way in (one door to one place)
  now: { label: string; title: string; facts?: string; button: string; onPress: () => void } | null;
  week: { days: { key: string; label: string; done: boolean; today: boolean }[]; summary: string; onPress: () => void };
  tier?: { name: string; ratio: number; next?: string; onPress: () => void } | null;
  onAsk: () => void;
  state: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  headerRight?: ReactNode;
}

export function HomeBoldView({ characterId, by, plan, proposals, recorded, now, week, tier, onAsk, state, onRetry, headerRight }: HomeBoldProps) {
  const { colors, isDark } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const Wordmark = isDark ? AutofitWordmarkDark : AutofitWordmark;
  const tabBar = getBottomNavigationVisualHeight(height) + Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP);
  // the one moment of motion: a proposal comes in when it first appears, one after another
  const [shown] = useState(() => new Map<string, Animated.Value>());
  const keys = proposals.map((item) => item.key).join('|');
  useEffect(() => {
    const fresh = keys.split('|').filter((key) => key && !shown.has(key));
    if (!fresh.length) return undefined;
    const values = fresh.map((key) => { const value = new Animated.Value(0); shown.set(key, value); return value; });
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) { values.forEach((value) => value.setValue(1)); return; }
      Animated.stagger(140, values.map((value) => Animated.timing(value, { duration: 320, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }))).start();
    });
    return () => { cancelled = true; values.forEach((value) => value.setValue(1)); };
  }, [keys, shown]);
  // 이대로 on a proposal that has nothing to save leaves a quiet "taken" line in place of its buttons
  const [taken, setTaken] = useState<string[]>([]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBar + 84, paddingTop: insets.top + 14 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Wordmark accessibilityLabel="autofit" height={24} width={88} />
          <View style={styles.topRight}>{headerRight}</View>
        </View>

        {/* The app's plan for my day, said in one breath. */}
        <View style={styles.hero}>
          <View style={styles.by}>
            <View style={styles.face}>
              <ChatCharacterAvatar characterId={characterId} size={26} />
            </View>
            <Text style={styles.byText}>{by}</Text>
          </View>
          <Headline lines={plan} />
        </View>

        {state === 'error' ? (
          <Pressable hitSlop={{ bottom: 2, top: 2 }} accessibilityRole="button" onPress={onRetry} style={styles.retry}>
            <Text style={styles.retryText}>다시 불러오기</Text>
          </Pressable>
        ) : null}

        {proposals.length || recorded ? (
        <View style={styles.ai}>
          <Text style={styles.aiTitle}>이렇게 맞춰 뒀어요</Text>
          {proposals.map((item, index) => {
            const value = shown.get(item.key);
            return (
            <Animated.View
              key={item.key}
              style={[styles.proposal, index > 0 && styles.line, value ? { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] } : null]}
            >
              <Text style={styles.didTitle}>{item.title}</Text>
              {item.detail ? <Text style={styles.didDetail}>{item.detail}</Text> : null}
              {taken.includes(item.key) ? (
                <View style={styles.takenRow}>
                  <View style={styles.check}>
                    <CheckIcon color={'#010101'} height={12} width={12} />
                  </View>
                  <Text style={styles.takenText}>이대로 할게요</Text>
                </View>
              ) : (
                <View style={styles.choices}>
                  {item.choices.map((choice) => (
                    <Pressable hitSlop={{ bottom: 4, top: 4 }}
                      accessibilityLabel={`${item.title}, ${choice.label}`}
                      accessibilityRole="button"
                      key={choice.kind}
                      onPress={() => {
                        if (choice.kind === 'accept') setTaken((now) => [...now, item.key]);
                        choice.onPress();
                      }}
                      style={[styles.choice, choice.kind === 'accept' && styles.choiceAccept]}
                    >
                      <Text style={[styles.choiceText, choice.kind === 'accept' && styles.choiceAcceptText]}>{choice.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>
            );
          })}
          {recorded ? (
            <View style={[styles.line, styles.recorded]}>
              <View style={styles.check}>
                <CheckIcon color={'#010101'} height={12} width={12} />
              </View>
              <Text style={styles.recordedText}>{recorded.text}</Text>
              {recorded.action ? (
                <Pressable accessibilityRole="button" hitSlop={8} onPress={recorded.action.onPress} style={styles.didGo}>
                  <Text style={styles.didGoText}>{recorded.action.label}</Text>
                  <CaretRightIcon color={colors.onAiMuted} height={12} width={12} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
        ) : null}

        {now ? (
        <View style={styles.nowCard}>
          <View style={styles.nowRow}>
            <View style={styles.grow}>
              <Text style={styles.small}>{now.label}</Text>
              <Text style={styles.nowTitle}>{now.title}</Text>
              {now.facts ? <Text style={styles.nowFacts}>{now.facts}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" onPress={now.onPress} style={styles.go}>
              <Text style={styles.goText}>{now.button}</Text>
            </Pressable>
          </View>
        </View>
        ) : null}

        <Pressable accessibilityRole="button" onPress={week.onPress} style={styles.weekCard}>
          <View style={styles.spread}>
            <Text style={styles.small}>이번 주</Text>
            <Text style={styles.weekSummary}>{week.summary}</Text>
          </View>
          <View accessibilityLabel="이번 주 운동한 날" style={styles.days}>
            {week.days.map((day) => (
              <View key={day.key} style={[styles.day, day.today && styles.dayToday, day.done && styles.dayDone]}>
                <Text style={[styles.dayText, day.done && styles.dayTextDone]}>{day.label}</Text>
              </View>
            ))}
          </View>
          {tier ? (
            <View style={styles.tier}>
              <Text style={styles.tierName}>{tier.name}</Text>
              <View style={styles.tierTrack}>
                <View style={[styles.tierFill, { width: `${tier.ratio}%` }]} />
              </View>
              {tier.next ? <Text style={styles.tierNext}>{tier.next}</Text> : null}
            </View>
          ) : null}
        </Pressable>
      </ScrollView>

      {/* The assistant's talk bar stays at the foot of the screen, above the tab bar. */}
      <View pointerEvents="box-none" style={[styles.dock, { bottom: tabBar + 8 }]}>
        <Pressable accessibilityLabel="궁금한 것 물어보기" accessibilityRole="button" onPress={onAsk} style={styles.talk}>
          <Text style={styles.talkText}>무엇이든 물어보세요</Text>
          <View style={styles.talkIcon}>
            <ChatsIcon color={'#010101'} height={20} width={20} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const shadow = '0 6px 18px rgba(1,1,1,0.18)';
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 16, paddingHorizontal: 24, width: '100%' },
    grow: { flex: 1, minWidth: 0 },
    top: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
    topRight: { alignItems: 'center', flexDirection: 'row', gap: 10, marginRight: -10 },
    retry: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 999, justifyContent: 'center', minHeight: 40, paddingHorizontal: 18 },
    retryText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 19 },
    takenRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
    takenText: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    hero: { gap: 12, paddingBottom: 4, paddingTop: 8 },
    by: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    face: { borderColor: colors.border, borderRadius: 15, borderWidth: 1.5 },
    byText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13, lineHeight: 18 },
    ai: { backgroundColor: colors.aiCard, borderRadius: 28, gap: 12, paddingHorizontal: 20, paddingVertical: 18 },
    aiTitle: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    line: { borderTopColor: colors.aiLine, borderTopWidth: 1, paddingTop: 12 },
    proposal: { gap: 4 },
    choices: { flexDirection: 'row', gap: 6, marginTop: 8 },
    choice: { alignItems: 'center', backgroundColor: colors.aiRaised, borderRadius: 999, justifyContent: 'center', minHeight: 36, paddingHorizontal: 14 },
    choiceAccept: { backgroundColor: colors.lilac },
    choiceText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    choiceAcceptText: { color: colors.lilacInk },
    recorded: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    recordedText: { color: colors.onAiMuted, flex: 1, fontSize: 12.5, lineHeight: 18 },
    check: { alignItems: 'center', backgroundColor: colors.lilac, borderRadius: 10, height: 20, justifyContent: 'center', width: 20 },
    didTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 },
    didDetail: { color: colors.onAiMuted, fontSize: 12.5, lineHeight: 18 },
    didGo: { alignItems: 'center', flexDirection: 'row', gap: 2 },
    didGoText: { color: colors.onAiMuted, fontFamily: fontFamilies.pretendardMedium, fontSize: 12.5, lineHeight: 18 },
    nowCard: { backgroundColor: colors.surface, borderRadius: 28, paddingHorizontal: 18, paddingVertical: 16 },
    // the first move's demo as a square at the left; the demo GIFs have white baked in
    nowRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    small: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    nowTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 29 },
    nowFacts: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13, lineHeight: 19 },
    go: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, height: 48, justifyContent: 'center', paddingHorizontal: 26 },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
    weekCard: { backgroundColor: colors.surface, borderRadius: 28, gap: 14, paddingHorizontal: 22, paddingVertical: 18 },
    spread: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    weekSummary: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    days: { flexDirection: 'row', justifyContent: 'space-between' },
    day: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
    dayToday: { backgroundColor: colors.surface, borderColor: colors.now, borderWidth: 2 },
    dayDone: { backgroundColor: colors.primary, borderWidth: 0 },
    dayText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    dayTextDone: { color: colors.onPrimary },
    tier: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    tierName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 12.5, lineHeight: 18 },
    tierTrack: { backgroundColor: colors.surfaceMuted, borderRadius: 3, flex: 1, height: 6, overflow: 'hidden' },
    tierFill: { backgroundColor: colors.textPrimary, height: '100%' },
    tierNext: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
    dock: { gap: 8, left: 16, position: 'absolute', right: 16 },
    talk: { alignItems: 'center', backgroundColor: colors.aiCard, borderRadius: 999, boxShadow: shadow, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingLeft: 20, paddingRight: 6 },
    talkText: { color: colors.onAiMuted, fontSize: 14, lineHeight: 20 },
    talkIcon: { alignItems: 'center', backgroundColor: colors.lilac, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  } as const;
}
