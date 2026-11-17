import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckIcon from '@/assets/icons/ui/check.svg';
import TargetIcon from '@/assets/icons/ui/target.svg';
import { AppBottomSheet, Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Hero, HERO_HEIGHT, HeroHead, heroWidth, pixelated, PixelIcon, street, STREET, type Who } from './sprites';

// Renewal A's home, the lobby of the game: my character walks down the street in the middle, the road
// to the next tier is on top, the round menus are at the sides, and the next quest sits below.
// A view that only shows what it is given; app/(tabs)/home.tsx fills it from the server.
export interface LobbyQuest {
  key: string;
  icon: number;
  name: string;
  state?: string;
  done: boolean;
  say?: string;
  // Tier points the server gives when this is done; shown as the gold +N.
  points?: number;
  action?: { label: string; onPress: () => void };
}

export type LobbyMenu = 'diet' | 'exercise' | 'community' | 'report';

export interface LobbyViewProps {
  name: string;
  who: Who;
  // The server's habit tier: index 0 CORE … 4 PEAK, stars = the step inside it (1–3).
  tier: { index: number; name: string; stars: number; ratio: number; left: string; next: string } | null;
  quests: LobbyQuest[];
  bell?: ReactNode;
  // Today's steps from the phone's counter; ask = the counter is there but not allowed yet.
  steps?: { count: number } | { ask: () => void } | null;
  onMe: () => void;
  // Opens 물어보기; left out, the bubble is only what the character says.
  onAsk?: () => void;
  onTier: () => void;
  onMenu: (menu: LobbyMenu) => void;
  // Choosing the character (job and sex); it is kept on this phone.
  onPickWho?: (who: Who) => void;
}

const menus: { key: LobbyMenu; label: string; icon: number; side: 'l' | 'r' }[] = [
  { key: 'diet', label: '식단', icon: 0, side: 'l' },
  { key: 'exercise', label: '운동', icon: 1, side: 'l' },
  { key: 'community', label: '커뮤니티', icon: 2, side: 'r' },
  { key: 'report', label: '리포트', icon: 3, side: 'r' },
];

export function LobbyView({ name, who, tier, quests, bell, steps, onMe, onAsk, onTier, onMenu, onPickWho }: LobbyViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 412, height: 917 });
  const [frame, setFrame] = useState<0 | 1>(0);
  const [listOpen, setListOpen] = useState(false);
  const [pick, setPick] = useState<Who | null>(null); // the character looked at in the choice, not chosen yet
  const tierIndex = tier?.index ?? 0;

  // The walk: two drawn steps, quicker at a higher tier (as in the design: 560 ms a step down to 190 ms).
  useEffect(() => {
    const timer = setInterval(() => setFrame((now) => (now ? 0 : 1)), [560, 480, 380, 300, 190][tierIndex]);
    return () => clearInterval(timer);
  }, [tierIndex]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };
  const top = insets.top;
  // The feet stand 580 from the top on a tall phone; on a short one they move up so the quest card stays clear.
  const feet = Math.min(580 + top, size.height - insets.bottom - 24 - 150 - 28);
  const heroLeft = (size.width - heroWidth(who)) / 2;
  const doneCount = quests.filter((quest) => quest.done).length;
  const next = quests.find((quest) => !quest.done && quest.action) ?? quests.find((quest) => !quest.done);
  const say = next?.say ?? (quests.length > 0 ? '오늘 할 일을 모두 끝냈어요!' : `${name} 님, 오늘도 같이 걸어요`);

  const go = (quest: LobbyQuest, small = false) =>
    quest.action ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setListOpen(false);
          quest.action?.onPress();
        }}
        style={({ pressed }) => [small ? styles.goSmall : styles.go, pressed && styles.pressed]}
      >
        <Text style={small ? styles.goSmallText : styles.goText}>{quest.action.label}</Text>
      </Pressable>
    ) : null;

  return (
    <View onLayout={onLayout} style={styles.root}>
      <Image resizeMode="stretch" source={street} style={[styles.street, pixelated]} />

      <View style={[styles.shadow, { left: size.width / 2 - 50, top: feet - 6 }]} />
      <Pressable
        accessibilityLabel="캐릭터 바꾸기"
        accessibilityRole="button"
        onPress={() => setPick(who)}
        style={{ left: heroLeft, position: 'absolute', top: feet - HERO_HEIGHT }}
      >
        <Hero frame={frame} tier={tierIndex} who={who} />
      </Pressable>

      <Pressable
        accessibilityLabel="내 정보"
        accessibilityRole="button"
        onPress={onMe}
        style={({ pressed }) => [styles.card, styles.me, { top: top + 16 }, pressed && styles.pressed]}
      >
        <View style={styles.face}>
          <HeroHead tier={tierIndex} who={who} />
        </View>
        <View>
          <Text style={styles.name}>{name}</Text>
          {tier ? (
            <View style={styles.level}>
              <Text style={styles.levelText}>{tier.name}</Text>
              <Text style={styles.stars}>
                {[1, 2, 3].map((star) => (
                  <Text key={star} style={{ color: star <= tier.stars ? colors.gold : colors.track }}>
                    ★
                  </Text>
                ))}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={[styles.bell, { top: top + 20 }]}>
        {bell}
        {steps && 'count' in steps ? (
          <View accessibilityLabel={`오늘 ${steps.count.toLocaleString('ko-KR')}걸음`} style={[styles.card, styles.steps]}>
            <PixelIcon index={4} />
            <Text style={styles.allText}>{steps.count.toLocaleString('ko-KR')}</Text>
          </View>
        ) : steps ? (
          <Pressable accessibilityRole="button" onPress={steps.ask} style={({ pressed }) => [styles.card, styles.steps, pressed && styles.pressed]}>
            <PixelIcon index={4} />
            <Text style={styles.small}>걸음 켜기</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityLabel="티어 보기"
        accessibilityRole="button"
        onPress={onTier}
        style={({ pressed }) => [styles.card, styles.road, { top: top + 78 }, pressed && styles.pressed]}
      >
        <View style={styles.roadRow}>
          <Text style={styles.big}>{tier?.left ?? '—'}</Text>
          <Text style={styles.small}>{tier?.next ?? '티어를 불러오고 있어요'}</Text>
        </View>
        <View style={styles.line}>
          <View style={[styles.fill, { width: `${tier?.ratio ?? 0}%` }]} />
          <View style={[styles.tick, { left: '33.3%' }]} />
          <View style={[styles.tick, { left: '66.6%' }]} />
          <View style={[styles.mark, { left: `${tier?.ratio ?? 0}%` }]}>
            <HeroHead tier={tierIndex} who={who} />
          </View>
          <View style={styles.goal}>
            <TargetIcon color={colors.onPrimary} height={16} width={16} />
          </View>
        </View>
      </Pressable>

      {/* What the character says is the door to 물어보기: the violet tag on its corner says so. */}
      <View pointerEvents="box-none" style={[styles.sayWrap, { top: feet - HERO_HEIGHT - 62 }]}>
        <Pressable
          accessibilityHint="캐릭터에게 물어보기"
          accessibilityRole="button"
          disabled={!onAsk}
          onPress={onAsk}
          style={styles.say}
        >
          <Text style={styles.sayText}>{say}</Text>
          {onAsk ? <Text style={styles.sayTag}>물어보기</Text> : null}
        </Pressable>
        <View pointerEvents="none" style={styles.sayTail} />
      </View>

      {(['l', 'r'] as const).map((side) => (
        <View key={side} style={[styles.side, side === 'l' ? styles.sideLeft : styles.sideRight, { top: feet - 230 }]}>
          {menus
            .filter((menu) => menu.side === side)
            .map((menu) => (
              <Pressable
                key={menu.key}
                accessibilityRole="button"
                onPress={() => onMenu(menu.key)}
                style={styles.menu}
              >
                {({ pressed }) => (
                  <>
                    <View style={[styles.menuIcon, pressed && styles.pressed]}>
                      <PixelIcon index={menu.icon} />
                    </View>
                    <Text style={styles.menuLabel}>{menu.label}</Text>
                  </>
                )}
              </Pressable>
            ))}
        </View>
      ))}

      <View style={[styles.card, styles.dock, { bottom: insets.bottom + 24 }]}>
        <View style={styles.next}>
          <View style={styles.questIcon}>
            {next ? <PixelIcon index={next.icon} /> : <CheckIcon color={colors.ink} height={26} width={26} />}
          </View>
          <View style={styles.nextCopy}>
            <Text style={styles.eyebrow}>{next ? '다음 퀘스트' : '오늘의 퀘스트'}</Text>
            <Text style={styles.title}>{next ? next.name : '모두 끝냈어요'}</Text>
            <View style={styles.stateRow}>
              {next?.state ? <Text style={styles.small}>{next.state}</Text> : null}
              {next?.points ? <Text style={styles.reward}>+{next.points}</Text> : null}
            </View>
          </View>
          {next ? go(next) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setListOpen(true)}
          style={({ pressed }) => [styles.all, pressed && styles.allPressed]}
        >
          <Text style={styles.allText}>
            오늘의 퀘스트 {doneCount} / {quests.length}
          </Text>
          <Text style={styles.small}>전체 보기</Text>
        </Pressable>
      </View>

      <AppBottomSheet onClose={() => setListOpen(false)} title="오늘의 퀘스트" visible={listOpen}>
        <View style={styles.list}>
          {quests.map((quest) => (
            <View key={quest.key} style={styles.listRow}>
              <View style={styles.questIcon}>
                <PixelIcon index={quest.icon} />
              </View>
              <View style={styles.nextCopy}>
                <Text style={styles.listName}>{quest.name}</Text>
                <Text style={styles.small}>{quest.done ? '완료' : quest.state ?? ''}</Text>
              </View>
              {quest.points ? <Text style={styles.reward}>+{quest.points}</Text> : null}
              {quest.done ? <CheckIcon color={colors.primaryText} height={22} width={22} /> : go(quest, true)}
            </View>
          ))}
        </View>
      </AppBottomSheet>

      <AppBottomSheet onClose={() => setPick(null)} title="누구와 걸을까요?" visible={pick !== null}>
        {pick ? (
          <View style={styles.pick}>
            <Text style={styles.small}>지금은 지쳐 있어도, 걸을수록 달라져요.</Text>
            <View style={styles.pickShow}>
              {([0, 4] as const).map((at) => (
                <View key={at} style={styles.pickCell}>
                  <Hero exact tier={at} who={pick} zoom={1} />
                  <Text style={styles.small}>{at ? 'PEAK' : '지금'}</Text>
                </View>
              ))}
            </View>
            {(
              [
                [['worker', '직장인'], ['student', '학생']],
                [['f', '여성'], ['m', '남성']],
              ] as const
            ).map((group, part) => (
              <View key={part} style={styles.seg}>
                {group.map(([value, label]) => {
                  const parts = pick.split('-');
                  const on = parts[part] === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setPick((part ? `${parts[0]}-${value}` : `${value}-${parts[1]}`) as Who)}
                      style={[styles.segButton, on && styles.segOn]}
                    >
                      <Text style={styles.allText}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onPickWho?.(pick);
                setPick(null);
              }}
              style={({ pressed }) => [styles.go, pressed && styles.pressed]}
            >
              <Text style={styles.goText}>이 캐릭터로 시작</Text>
            </Pressable>
          </View>
        ) : null}
      </AppBottomSheet>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const p12 = { fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 } as const;
  const p15 = { fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  const ledge = `0 4px 0 ${colors.ink}`;
  return {
    // The asphalt carries on under the cards.
    root: { backgroundColor: '#6A6E7E', flex: 1, overflow: 'hidden' },
    street: { height: STREET.height, left: 0, position: 'absolute', top: 0, width: STREET.width },
    shadow: { backgroundColor: 'rgba(15, 14, 30, 0.28)', height: 10, position: 'absolute', width: 100 },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 18,
      borderWidth: 2,
      boxShadow: '0 4px 0 rgba(32, 35, 63, 0.3)',
    },
    pressed: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 4 }] },

    me: {
      alignItems: 'center',
      borderRadius: 16,
      boxShadow: ledge,
      flexDirection: 'row',
      gap: 10,
      left: 16,
      paddingBottom: 4,
      paddingLeft: 4,
      paddingRight: 14,
      paddingTop: 4,
      position: 'absolute',
    },
    face: {
      alignItems: 'center',
      backgroundColor: colors.primaryLight,
      borderColor: colors.ink,
      borderRadius: 11,
      borderWidth: 2,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    name: { ...p15, color: colors.ink, lineHeight: 18 },
    level: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    levelText: { ...p12, color: colors.primaryText },
    stars: { fontSize: 11, lineHeight: 14 },
    bell: { alignItems: 'center', flexDirection: 'row', gap: 8, position: 'absolute', right: 16 },
    steps: { alignItems: 'center', borderRadius: 99, flexDirection: 'row', gap: 4, height: 40, paddingLeft: 4, paddingRight: 12 },

    road: { boxShadow: ledge, left: 16, paddingBottom: 16, paddingHorizontal: 16, paddingTop: 10, position: 'absolute', right: 16 },
    roadRow: { alignItems: 'baseline', flexDirection: 'row', gap: 8 },
    big: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 36, lineHeight: 40 },
    small: { ...p12, color: colors.textSecondary },
    line: {
      backgroundColor: colors.track,
      borderColor: colors.ink,
      borderRadius: 99,
      borderWidth: 2,
      height: 16,
      marginLeft: 2,
      marginRight: 40,
      marginTop: 32,
    },
    fill: { backgroundColor: colors.primary, borderRadius: 99, bottom: -1, left: -1, position: 'absolute', top: -1 },
    tick: { backgroundColor: colors.ink, bottom: 0, marginLeft: -1, position: 'absolute', top: 0, width: 2 },
    mark: { marginLeft: -13, position: 'absolute', top: -30 },
    goal: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderColor: colors.ink,
      borderRadius: 15,
      borderWidth: 2,
      height: 30,
      justifyContent: 'center',
      position: 'absolute',
      right: -42,
      top: -9,
      width: 30,
    },

    sayWrap: { alignItems: 'center', left: 0, position: 'absolute', right: 0 },
    say: {
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      maxWidth: '78%',
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    sayText: { ...p15, color: colors.ink, textAlign: 'center' },
    sayTag: {
      ...p12,
      backgroundColor: colors.primary,
      borderColor: colors.ink,
      borderRadius: 99,
      borderWidth: 2,
      color: colors.onPrimary,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 2,
      position: 'absolute',
      right: -14,
      top: -15,
    },
    sayTail: {
      backgroundColor: colors.surface,
      borderBottomWidth: 2,
      borderColor: colors.ink,
      borderRightWidth: 2,
      height: 10,
      marginTop: -6,
      transform: [{ rotate: '45deg' }],
      width: 10,
    },

    side: { gap: 14, position: 'absolute' },
    sideLeft: { left: 14 },
    sideRight: { right: 14 },
    menu: { alignItems: 'center', gap: 9 },
    menuIcon: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 28,
      borderWidth: 2,
      boxShadow: ledge,
      height: 56,
      justifyContent: 'center',
      width: 56,
    },
    // White letters with a dark edge, so they read on the street.
    menuLabel: {
      ...p12,
      color: '#FFFFFF',
      lineHeight: 14,
      textShadowColor: colors.ink,
      textShadowOffset: { height: 1, width: 1 },
      textShadowRadius: 1,
    },

    dock: { borderRadius: 22, left: 16, overflow: 'hidden', position: 'absolute', right: 16 },
    next: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 88, paddingLeft: 12, paddingRight: 14, paddingVertical: 12 },
    questIcon: {
      alignItems: 'center',
      backgroundColor: colors.primaryLight,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      height: 56,
      justifyContent: 'center',
      width: 56,
    },
    nextCopy: { flex: 1, gap: 3, minWidth: 0 },
    eyebrow: { ...p12, color: colors.primaryText, lineHeight: 14 },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    go: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      boxShadow: ledge,
      height: 50,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    goSmall: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderColor: colors.ink,
      borderRadius: 12,
      borderWidth: 2,
      boxShadow: ledge,
      height: 38,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    goSmallText: { ...p15, color: colors.onPrimary },
    all: {
      alignItems: 'center',
      borderTopColor: colors.surfaceMuted,
      borderTopWidth: 2,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    allPressed: { backgroundColor: colors.surfaceMuted },
    allText: { ...p15, color: colors.ink },

    stateRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    reward: {
      ...p12,
      backgroundColor: colors.gold,
      borderColor: colors.ink,
      borderRadius: 99,
      borderWidth: 2,
      color: '#2B2000',
      lineHeight: 14,
      overflow: 'hidden',
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    list: { gap: 12, paddingBottom: 12 },
    pick: { gap: 12, paddingBottom: 12 },
    pickShow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-evenly' },
    pickCell: { alignItems: 'center', gap: 4 },
    seg: { flexDirection: 'row', gap: 6 },
    segButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      boxShadow: '0 4px 0 rgba(32, 35, 63, 0.3)',
      flex: 1,
      height: 46,
      justifyContent: 'center',
    },
    segOn: { backgroundColor: colors.primary, boxShadow: ledge },
    listRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    listName: { ...p15, color: colors.ink },
  } as const;
}
