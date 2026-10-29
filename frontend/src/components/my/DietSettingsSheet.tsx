import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import {
  getAllergySelection,
  getSignupApiErrorMessage,
  saveAllergySelection,
} from '@/src/api/onboarding';
import {
  AppBottomSheet,
  AppButton,
  AppTextField,
  Chip,
  Notice,
  Text,
} from '@/src/components/common';
import { useThemedStyles, type AppTheme } from '@/src/theme';

// Same chips and order as the sign-up allergy step (Figma A6 · G8).
const allergenOptions = [
  { id: 'milk', label: '우유' },
  { id: 'egg', label: '계란' },
  { id: 'peanut', label: '땅콩' },
  { id: 'nuts', label: '견과류' },
  { id: 'wheat', label: '밀(글루텐)' },
  { id: 'soybean', label: '콩(대두)' },
  { id: 'buckwheat', label: '메밀' },
  { id: 'crab', label: '갑각류' },
  { id: 'shellfish', label: '조개' },
  { id: 'fish', label: '생선' },
  { id: 'peach', label: '복숭아' },
  { id: 'sesame', label: '참깨' },
] as const;

export interface DietSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

// Figma G8: the saved allergies are read first, so saving never drops ones not shown.
export function DietSettingsSheet({ visible, onClose }: DietSettingsSheetProps) {
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const noneSelected = !loading && selected.length === 0 && customNames.length === 0;

  useEffect(() => {
    if (!visible) return undefined;
    let live = true;
    const frame = requestAnimationFrame(() => {
      setLoading(true);
      setLoadError('');
      void getAllergySelection()
        .then((selection) => {
          if (!live) return;
          setSelected(selection.allergens);
          setCustomNames(selection.customNames);
        })
        .catch((error) => {
          if (live) setLoadError(getSignupApiErrorMessage(error));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [attempt, visible]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const addCustom = () => {
    const name = draft.trim();
    if (!name) return;
    if (name.length > 50) {
      Alert.alert('알레르기 이름을 확인해 주세요', '50자 이하로 적어 주세요.');
      return;
    }
    setCustomNames((current) => (current.includes(name) ? current : [...current, name]));
    setDraft('');
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveAllergySelection(selected, customNames);
      onClose();
    } catch (error) {
      Alert.alert('식단 설정을 저장하지 못했어요', getSignupApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppBottomSheet
      contentStyle={styles.content}
      footer={
        <AppButton
          disabled={loading || Boolean(loadError)}
          loading={saving}
          onPress={() => void save()}
          title="저장하기"
        />
      }
      keyboardShouldPersistTaps="handled"
      onClose={onClose}
      scrollable="when-overflow"
      title="식단 설정"
      visible={visible}
    >
      <Text style={styles.sectionTitle}>알레르기</Text>
      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.body}>{loadError}</Text>
          <AppButton
            fullWidth={false}
            onPress={() => setAttempt((value) => value + 1)}
            size="M"
            title="다시 불러오기"
            variant="outline"
          />
        </View>
      ) : (
        <>
          <View style={styles.chips}>
            <Chip
              label="없어요"
              onPress={() => {
                setSelected([]);
                setCustomNames([]);
              }}
              selected={noneSelected}
            />
            {allergenOptions.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                onPress={() => toggle(option.id)}
                selected={selected.includes(option.id)}
              />
            ))}
            {customNames.map((name) => (
              <Chip
                key={`custom-${name}`}
                label={`${name} ✕`}
                onPress={() => setCustomNames((current) => current.filter((item) => item !== name))}
                selected
              />
            ))}
          </View>
          <View style={styles.addRow}>
            <AppTextField
              accessibilityLabel="알레르기 직접 추가"
              containerStyle={styles.flex}
              maxLength={50}
              onChangeText={setDraft}
              onSubmitEditing={addCustom}
              placeholder="직접 추가 · 예: 키위, 망고"
              returnKeyType="done"
              value={draft}
            />
            <AppButton
              disabled={!draft.trim()}
              fullWidth={false}
              onPress={addCustom}
              size="M"
              style={styles.addButton}
              title="추가"
              variant="outline"
            />
          </View>
        </>
      )}
      <Notice body="음식을 먹기 전에는 성분표를 꼭 확인해 주세요." title="참고용 정보예요" />
    </AppBottomSheet>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    content: { gap: 16, paddingBottom: 8 },
    flex: { flex: 1 },
    sectionTitle: { ...text.body1Strong, color: colors.textPrimary },
    body: { ...text.body2, color: colors.textBody },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    addRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    addButton: { height: 52 },
    loading: { paddingVertical: 24 },
    errorBox: { alignItems: 'flex-start', gap: 12 },
  } as const;
}
