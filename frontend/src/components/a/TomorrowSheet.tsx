import { Pressable, View } from 'react-native';

import { AppBottomSheet, Text } from '@/src/components/common';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';
import { aForm } from './form';

// Renewal A's 내일 맞추기 (a-diet.html, the flow agreed with AI on 11/19): when today went over the goal, the AI
// proposes tomorrow's four meals, lighter but with every meal and the protein kept; I look and say yes, and
// the server saves the four at once. A view that only shows what it is given: the diet tab fills it once the
// back-end and AI calls exist (until then only /dev/a-tomorrow shows it).
export type TomorrowPlan = {
  meals: { slot: string; menu: string; kcal: number | null; changed: boolean }[];
  kcal: number | null;
  target: number | null;
  why: string | null; // the AI's one line about the change
};

export interface TomorrowSheetProps {
  visible: boolean;
  over: number; // kcal over today's goal
  state: 'loading' | 'ready' | 'error' | 'saving' | 'saved';
  plan: TomorrowPlan | null;
  error: string;
  onClose: () => void;
  onRetry: () => void;
  onSave: () => void;
}

const number = (value: number | null) => (value == null ? '—' : Math.round(value).toLocaleString('ko-KR'));

export function TomorrowSheet({ visible, over, state, plan, error, onClose, onRetry, onSave }: TomorrowSheetProps) {
  const styles = useThemedStyles(createStyles);
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
    <AppBottomSheet onClose={onClose} scrollable="when-overflow" title="내일 맞추기" visible={visible}>
      <View style={styles.content}>
        <Text style={styles.q}>더 먹은 {number(over)}kcal를 내일 식단에서 맞춰요</Text>
        <Text style={styles.note}>끼니는 거르지 않고, 단백질은 지키면서 가볍게 바꿔요.</Text>

        {state === 'loading' ? (
          <View style={styles.wait}>
            <ALoading label="내일 식단을 짜는 중" />
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
            {plan.why ? <Text style={styles.body}>{plan.why}</Text> : null}
            {state === 'saved' ? (
              <>
                <Text style={styles.body}>내일 식단을 바꿔 뒀어요.</Text>
                {button('확인', onClose)}
              </>
            ) : (
              <View style={styles.duo}>
                <View style={styles.grow}>{button('그대로 두기', onClose, true, state === 'saving')}</View>
                <View style={styles.grow}>{button(state === 'saving' ? '바꾸는 중…' : '이대로 바꾸기', onSave, false, state === 'saving')}</View>
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
    q: { ...a.p15, color: colors.ink },
    note: a.note,
    body: { ...a.p15, color: colors.ink },
    wait: { height: 220 },
    card: { ...a.card, paddingHorizontal: 14, paddingVertical: 4 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 48, paddingVertical: 8 },
    line: { borderTopColor: colors.track, borderTopWidth: 2 },
    slot: { ...a.p12, color: colors.textSecondary, width: 30 },
    tag: { ...a.p12, backgroundColor: colors.primaryLight, borderColor: colors.ink, borderRadius: 8, borderWidth: 2, color: colors.ink, overflow: 'hidden', paddingHorizontal: 5 },
    kcal: { ...a.p12, color: colors.ink, minWidth: 44, textAlign: 'right' },
    total: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    duo: { flexDirection: 'row', gap: 10 },
    go: { ...a.go, height: 52 },
    ghost: a.goGhost,
    off: a.goOff,
    pressed: a.goPressed,
    goText: { ...a.goText, fontSize: 20, lineHeight: 24 },
    ghostText: { color: colors.ink },
  } as const;
}
