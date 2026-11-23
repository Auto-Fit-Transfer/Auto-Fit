import { useState } from 'react';
import { Pressable, View } from 'react-native';

import CheckIcon from '@/assets/icons/system/Check.svg';
import { AppBottomSheet, Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { plannedCuts } from '@/src/features/diet/tomorrowAdjust';

import { ALoading } from './ALoading';
import { aForm } from './form';

// Renewal A's 내일 맞추기 (a-diet.html; the user's choices of 11/19): when today went over the goal even after the
// workout's calories, I am asked first whether to let it go as a cheat day or adjust tomorrow (a light user must
// not feel pushed). Adjusting does not remake the whole day: I pick the meals of tomorrow to make lighter, what
// went over is shared among them, and only those come back changed; I look at the day and say yes. A view that
// only shows what it is given: the diet tab fills it once the back-end and AI calls exist (until then only
// /dev/a-tomorrow shows it).
export type TomorrowMeal = { slot: string; menu: string; kcal: number | null };
export type TomorrowPlan = {
  meals: { slot: string; menu: string; kcal: number | null; changed: boolean }[];
  kcal: number | null;
  target: number | null;
  why: string | null; // the AI's one line about the change
  cut: number | null; // from the server's adjustment: kcal really taken off the picked meals
  left: number | null; // and what stayed, since a meal gives up at most 15%
  failed: number; // picked meals the AI found no safe lighter menu for: they stay as they are
  canSave: boolean; // the server gave a preview to confirm (nothing changed means nothing to save)
};

export interface TomorrowSheetProps {
  visible: boolean;
  over: number; // kcal over today's goal after the workout's calories
  eaten: number | null;
  target: number | null;
  burned: number | null; // today's workout and run calories (an estimate)
  state: 'choose' | 'pick' | 'loading' | 'ready' | 'error' | 'saving' | 'saved';
  tomorrow: TomorrowMeal[]; // tomorrow's meals as they are now, to pick from
  plan: TomorrowPlan | null;
  error: string;
  onClose: () => void;
  onRetry: () => void;
  onSave: () => void;
  onCheat: () => void; // let it go: nothing changes tomorrow
  onAdjust: () => void; // go on to pick the meals
  onPick: (slots: string[]) => void; // ask the AI for lighter versions of these meals only
}

const number = (value: number | null) => (value == null ? '—' : Math.round(value).toLocaleString('ko-KR'));


export function TomorrowSheet({ visible, over, eaten, target, burned, state, tomorrow, plan, error, onClose, onRetry, onSave, onCheat, onAdjust, onPick }: TomorrowSheetProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const [picked, setPicked] = useState<string[]>([]);
  const close = () => { setPicked([]); onClose(); };
  const toggle = (slot: string) => setPicked((now) => (now.includes(slot) ? now.filter((item) => item !== slot) : [...now, slot]));
  const pickedMeals = tomorrow.filter((meal) => picked.includes(meal.slot));
  const cuts = plannedCuts(over, pickedMeals.map((meal) => meal.kcal));
  const cutOf = (slot: string) => cuts[pickedMeals.findIndex((meal) => meal.slot === slot)] ?? 0;
  const cutSum = cuts.reduce((sum, cut) => sum + cut, 0);
  const button = (label: string, onPress: () => void, ghost = false, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.go, ghost && styles.ghost, disabled && styles.off, pressed && styles.pressed]}
    >
      <Text style={[styles.goText, ghost && styles.ghostText]}>{label}</Text>
    </Pressable>
  );

  return (
    <AppBottomSheet onClose={close} scrollable="when-overflow" title="내일 맞추기" visible={visible}>
      <View style={styles.content}>
        {state === 'choose' ? (
          <>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={[styles.body, styles.grow]}>오늘 먹은 양</Text>
                <Text style={styles.kcal}>{number(eaten)}kcal</Text>
              </View>
              {burned ? (
                <View style={[styles.row, styles.line]}>
                  <Text style={[styles.body, styles.grow]}>운동으로 쓴 열량</Text>
                  <Text style={styles.kcal}>−{number(burned)}kcal</Text>
                </View>
              ) : null}
              <View style={[styles.row, styles.line]}>
                <Text style={[styles.body, styles.grow]}>오늘 목표</Text>
                <Text style={styles.kcal}>{number(target)}kcal</Text>
              </View>
            </View>
            <Text style={styles.q}>목표보다 {number(over)}kcal 더 먹었어요. 어떻게 할까요?</Text>
            <View style={styles.duo}>
              <View style={styles.grow}>{button('치팅 데이로 넘기기', onCheat, true)}</View>
              <View style={styles.grow}>{button('내일 조절하기', onAdjust)}</View>
            </View>
          </>
        ) : state === 'pick' ? (
          <>
            <Text style={styles.q}>가볍게 할 끼니를 골라 주세요</Text>
            <Text style={styles.note}>더 먹은 {number(over)}kcal를 고른 끼니에 나눠서 줄여요. 한 끼는 15%까지만 줄여요.</Text>
            {tomorrow.length ? (
              <View style={styles.card}>
                {tomorrow.map((meal, index) => {
                  const on = picked.includes(meal.slot);
                  return (
                    <Pressable
                      key={meal.slot}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => toggle(meal.slot)}
                      style={[styles.row, index > 0 && styles.line]}
                    >
                      <View style={[styles.tick, on && styles.tickOn]}>{on ? <CheckIcon color={colors.onPrimary} height={16} width={16} /> : null}</View>
                      <Text style={styles.slot}>{meal.slot}</Text>
                      <Text numberOfLines={2} style={[styles.body, styles.grow]}>{meal.menu}</Text>
                      <Text style={styles.kcal}>{on ? `−${number(cutOf(meal.slot))}` : number(meal.kcal)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.body}>내일 식단이 아직 없어요.</Text>
            )}
            {picked.length ? <Text style={styles.body}>고른 끼니로 약 {number(cutSum)}kcal 줄여요.</Text> : null}
            {button(picked.length ? `${picked.length}끼 가볍게 바꾸기` : '끼니를 골라 주세요', () => onPick(picked), false, picked.length === 0)}
          </>
        ) : (
          <>
            <Text style={styles.q}>더 먹은 {number(over)}kcal를 고른 끼니에서 맞춰요</Text>
            <Text style={styles.note}>끼니는 거르지 않고, 단백질은 지키면서 가볍게 바꿔요.</Text>
          </>
        )}

        {state === 'loading' ? (
          <View style={styles.wait}>
            <ALoading label="고른 끼니를 다시 짜는 중" />
          </View>
        ) : null}
        {state === 'error' ? (
          <>
            <Text style={styles.body}>{error || '내일 식단을 짜지 못했어요.'}</Text>
            {button('다시 시도', onRetry)}
          </>
        ) : null}
        {plan && (state === 'ready' || state === 'saving' || state === 'saved') ? (
          <>
            <View style={styles.card}>
              {plan.meals.map((meal, index) => (
                <View key={`${meal.slot}-${index}`} style={[styles.row, index > 0 && styles.line]}>
                  <Text style={styles.slot}>{meal.slot}</Text>
                  <Text numberOfLines={2} style={[styles.body, styles.grow]}>{meal.menu}</Text>
                  {meal.changed ? <Text style={styles.tag}>바뀜</Text> : null}
                  <Text style={styles.kcal}>{number(meal.kcal)}</Text>
                </View>
              ))}
              <View style={[styles.row, styles.line]}>
                <Text style={[styles.body, styles.grow]}>내일 합계</Text>
                <Text style={styles.total}>
                  {number(plan.kcal)}
                  <Text style={styles.note}> / 목표 {number(plan.target)}kcal</Text>
                </Text>
              </View>
            </View>
            {plan.cut != null ? (
              <Text style={styles.body}>
                {number(plan.cut)}kcal 줄였어요.{plan.left ? ` ${number(plan.left)}kcal는 줄이지 않았어요(한 끼는 15%까지만 줄여요).` : ''}
              </Text>
            ) : null}
            {plan.failed ? <Text style={styles.body}>{plan.failed}끼는 맞는 메뉴를 못 찾아 그대로 둬요.</Text> : null}
            {plan.why ? <Text style={styles.body}>{plan.why}</Text> : null}
            {state === 'saved' ? (
              <>
                <Text style={styles.body}>내일 식단을 바꿔 뒀어요.</Text>
                {button('확인', onClose)}
              </>
            ) : (
              <View style={styles.duo}>
                <View style={styles.grow}>{button('그대로 두기', onClose, true, state === 'saving')}</View>
                <View style={styles.grow}>{button(state === 'saving' ? '바꾸는 중…' : '이대로 바꾸기', onSave, false, state === 'saving' || !plan.canSave)}</View>
              </View>
            )}
          </>
        ) : null}
      </View>
    </AppBottomSheet>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    content: { gap: 12, paddingBottom: 8 },
    grow: { flex: 1, minWidth: 0 },
    q: { ...a.p15, color: colors.textPrimary },
    note: a.note,
    body: { ...a.p15, color: colors.textPrimary },
    wait: { height: 220 },
    card: { ...a.card, paddingHorizontal: 14, paddingVertical: 4 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 48, paddingVertical: 8 },
    line: { borderTopColor: colors.surfaceMuted, borderTopWidth: 2 },
    slot: { ...a.p12, color: colors.textSecondary, width: 30 },
    tag: { ...a.p12, backgroundColor: colors.surfaceMuted, borderRadius: 8, color: colors.textPrimary, overflow: 'hidden', paddingHorizontal: 5 },
    kcal: { ...a.p12, color: colors.textPrimary, minWidth: 44, textAlign: 'right' },
    total: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 26 },
    duo: { flexDirection: 'row', gap: 10 },
    go: { ...a.go, height: 52 },
    ghost: a.goGhost,
    off: a.goOff,
    pressed: a.goPressed,
    goText: { ...a.goText, fontSize: 20, lineHeight: 24 },
    ghostText: { color: colors.textPrimary },
    tick: { ...a.tick, height: 26, width: 26 },
    tickOn: a.on,
  } as const;
}
