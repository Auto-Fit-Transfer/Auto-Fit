import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppBottomSheet, Text } from '@/src/components/common';
import type { MenuStyle } from '@/src/features/diet/menuStyle';
import { useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';

// a-diet.html "어떻게 먹을까요?": 건강식 위주 or 일반식 위주 for the main meals. The tab saves it (back-end to add).
const options: { value: MenuStyle; title: string; sub: string }[] = [
  { value: 'health_focused', title: '건강식 위주', sub: '단백질과 채소 중심으로' },
  { value: 'everyday', title: '일반식 위주', sub: '평소 먹는 메뉴에서 양만 맞춰요' },
];

export interface MenuStyleSheetProps {
  visible: boolean;
  value: MenuStyle | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (style: MenuStyle) => void;
}

export function MenuStyleSheet({ visible, value, saving, error, onClose, onSave }: MenuStyleSheetProps) {
  const styles = useThemedStyles(createStyles);
  // what was tapped this time; each opening starts again from what is saved
  const [touched, setTouched] = useState<MenuStyle | null>(null);
  const picked = touched ?? value;
  const close = () => { setTouched(null); onClose(); };
  const ready = picked != null && !saving;

  return (
    <AppBottomSheet onClose={close} scrollable="when-overflow" title="어떻게 먹을까요?" visible={visible}>
      <View style={styles.content}>
        {options.map((option) => {
          const on = picked === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setTouched(option.value)}
              style={[styles.opt, on && styles.on]}
            >
              <Text style={[styles.title, on && styles.onText]}>{option.title}</Text>
              <Text style={[styles.sub, on && styles.onText]}>{option.sub}</Text>
            </Pressable>
          );
        })}
        <Text style={styles.note}>새로 짜는 7일 식단의 아침 · 점심 · 저녁부터 적용돼요. 간식은 그대로예요.</Text>
        {error ? <Text style={styles.body}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={() => { if (picked) { setTouched(null); onSave(picked); } }}
          style={({ pressed }) => [styles.go, !ready && styles.goOff, pressed && styles.goPressed]}
        >
          <Text style={styles.goText}>{saving ? '저장하는 중…' : '확인'}</Text>
        </Pressable>
      </View>
    </AppBottomSheet>
  );
}

function createStyles({ colors }: AppTheme) {
  const f = aForm(colors);
  return {
    content: { gap: 10, paddingBottom: 8 },
    opt: { ...f.card, borderRadius: 14, gap: 2, paddingHorizontal: 14, paddingVertical: 12 },
    on: { ...f.on, boxShadow: `0 4px 0 ${colors.ink}` },
    onText: f.onText,
    title: { ...f.p15, color: colors.ink },
    sub: f.note,
    note: f.note,
    body: { ...f.p15, color: colors.ink },
    go: { ...f.go, marginTop: 4 },
    goOff: f.goOff,
    goPressed: f.goPressed,
    goText: f.goText,
  } as const;
}
