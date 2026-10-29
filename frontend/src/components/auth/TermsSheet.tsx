import { useState } from 'react';
import { Pressable, View } from 'react-native';

import CheckIcon from '@/assets/icons/ui/check.svg';
import { AppBottomSheet, AppButton, Text } from '@/src/components/common';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// The required consents of the Figma A4 sheet. The optional "혜택 · 이벤트 알림" item and the
// "보기" links wait until the team has the terms pages and a place to save the choice.
const terms = [
  { id: 'age', label: '만 14세 이상이에요' },
  { id: 'service', label: '서비스 이용약관' },
  { id: 'privacy', label: '개인정보 수집 · 이용' },
  {
    id: 'health',
    label: '건강정보(민감정보) 수집 · 이용',
    detail: '검진 결과 · 체성분 · 알레르기 · 운동 기록을 맞춤 추천에 써요',
  },
] as const;

type TermId = (typeof terms)[number]['id'];

export interface TermsSheetProps {
  visible: boolean;
  onClose: () => void;
  onAgree: () => void;
}

export function TermsSheet({ visible, onClose, onAgree }: TermsSheetProps) {
  const styles = useThemedStyles(createStyles);
  const [checked, setChecked] = useState<TermId[]>([]);
  const allChecked = checked.length === terms.length;
  const toggle = (id: TermId) =>
    setChecked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <AppBottomSheet
      footer={<AppButton disabled={!allChecked} onPress={onAgree} title="동의하고 계속하기" />}
      onClose={onClose}
      visible={visible}
    >
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          약관에 동의해 주세요
        </Text>
        <Text style={styles.description}>필수 항목에 모두 동의하면 가입할 수 있어요.</Text>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allChecked }}
        onPress={() => setChecked(allChecked ? [] : terms.map((term) => term.id))}
        style={({ pressed }) => [styles.allBox, pressed && styles.pressed]}
      >
        <CheckBox checked={allChecked} />
        <View style={styles.flex}>
          <Text style={styles.allTitle}>모두 동의하기</Text>
          <Text style={styles.caption}>아래 항목에 한 번에 동의해요</Text>
        </View>
      </Pressable>
      <View style={styles.list}>
        {terms.map((term) => (
          <Pressable
            key={term.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: checked.includes(term.id) }}
            onPress={() => toggle(term.id)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <CheckBox checked={checked.includes(term.id)} />
            <View style={styles.flex}>
              <View style={styles.rowLine}>
                <Text style={styles.required}>필수</Text>
                <Text style={styles.rowLabel}>{term.label}</Text>
              </View>
              {'detail' in term ? <Text style={styles.caption}>{term.detail}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </AppBottomSheet>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.box, checked && styles.boxChecked]}>
      {checked ? <CheckIcon color={colors.onPrimary} height={16} width={16} /> : null}
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1, gap: 2 },
    heading: { gap: 6, marginBottom: 20 },
    title: { ...text.title2, color: colors.textPrimary },
    description: { ...text.body2, color: colors.textSecondary },
    allBox: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 16,
    },
    allTitle: { ...text.body1Strong, color: colors.textPrimary },
    caption: { ...text.caption, color: colors.textSecondary },
    list: { gap: 4, marginTop: 12, paddingHorizontal: 4 },
    row: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingVertical: 10 },
    rowLine: { flexDirection: 'row', gap: 6 },
    required: { ...text.body2Strong, color: colors.textPrimary },
    rowLabel: { ...text.body2, color: colors.textBody, flex: 1 },
    box: {
      alignItems: 'center',
      borderColor: colors.textDisabled,
      borderRadius: 6,
      borderWidth: 1.5,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    pressed: { opacity: 0.75 },
  } as const;
}
