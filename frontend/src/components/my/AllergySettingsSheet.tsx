import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  getAllergies,
  saveAllergySelection,
  type AllergyType,
} from '@/src/api/allergies';
import { getApiErrorMessage } from '@/src/api/client';
import { AppBottomSheet } from '@/src/components/common';
import { colors, fontFamilies } from '@/src/theme';

type Props = { visible: boolean; onClose: () => void };

export function AllergySettingsSheet({ visible, onClose }: Props) {
  const [catalog, setCatalog] = useState<AllergyType[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    void getAllergies()
      .then((result) => {
        if (!live) return;
        setCatalog(result.catalog);
        setSelectedIds(result.selected.flatMap((item) => item.allergy_type_id ? [item.allergy_type_id] : []));
        setCustomNames(result.selected.flatMap((item) => item.custom_name ? [item.custom_name] : []));
        setLoaded(true);
      })
      .catch((cause) => { if (live) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [visible, attempt]);

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
    setSaved(false);
    setError('');
  };

  const addCustom = () => {
    const name = customDraft.trim();
    if (!name) return;
    if (name.length > 50) return setError('직접 추가한 알레르기는 50자 이하로 적어 주세요.');
    if (customNames.length >= 5) return setError('직접 추가는 최대 5개까지 가능해요.');
    if (customNames.some((value) => value.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return setError('이미 추가한 항목이에요.');
    }
    setCustomNames((current) => [...current, name]);
    setCustomDraft('');
    setSaved(false);
    setError('');
  };

  const save = async () => {
    if (!loaded || saving) return;
    const extra = customDraft.trim();
    if (extra.length > 50) return setError('직접 추가한 알레르기는 50자 이하로 적어 주세요.');
    const nextCustom = extra && !customNames.some((value) => value.toLocaleLowerCase() === extra.toLocaleLowerCase())
      ? [...customNames, extra] : customNames;
    if (nextCustom.length > 5) return setError('직접 추가는 최대 5개까지 가능해요.');
    if (selectedIds.length > 12) return setError('알레르기 종류는 최대 12개까지 선택할 수 있어요.');
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const result = await saveAllergySelection(selectedIds, nextCustom);
      setSelectedIds(result.selected.flatMap((item) => item.allergy_type_id ? [item.allergy_type_id] : []));
      setCustomNames(result.selected.flatMap((item) => item.custom_name ? [item.custom_name] : []));
      setCustomDraft('');
      setSaved(true);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const visibleCatalog = catalog.filter((item) => !/^\[DUMMY\b/i.test(item.name));
  const hiddenSelections = selectedIds.filter((id) => !visibleCatalog.some((item) => item.allergy_type_id === id));
  const none = selectedIds.length === 0 && customNames.length === 0 && !customDraft.trim();

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="식단 설정"
      scrollable="when-overflow"
      keyboardShouldPersistTaps="handled"
      contentStyle={styles.content}
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !loaded || saving }}
          disabled={!loaded || saving}
          onPress={() => void save()}
          style={[styles.save, (!loaded || saving) && styles.disabled]}
        >
          <Text style={styles.saveText}>{saving ? '저장 중…' : '저장하기'}</Text>
        </Pressable>
      }
    >
      {loading ? <Text style={styles.note}>알레르기 정보를 불러오는 중이에요.</Text> : null}
      {!loaded && !loading ? (
        <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setError(''); setAttempt((value) => value + 1); }}>
          <Text style={styles.retry}>불러오지 못했어요. 다시 시도하기</Text>
        </Pressable>
      ) : null}
      {loaded ? (
        <>
          <Text style={styles.sectionTitle}>알레르기</Text>
          <View style={styles.chips}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: none }}
              onPress={() => { setSelectedIds([]); setCustomNames([]); setCustomDraft(''); setSaved(false); }}
              style={[styles.chip, none && styles.selected]}
            >
              <Text style={[styles.chipText, none && styles.selectedText]}>없어요</Text>
            </Pressable>
            {visibleCatalog.map((item) => {
              const selected = selectedIds.includes(item.allergy_type_id);
              return (
                <Pressable key={item.allergy_type_id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggle(item.allergy_type_id)} style={[styles.chip, selected && styles.selected]}>
                  <Text style={[styles.chipText, selected && styles.selectedText]}>{item.name}</Text>
                </Pressable>
              );
            })}
            {customNames.map((name) => (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityLabel={name + ' 삭제'}
                onPress={() => { setCustomNames((values) => values.filter((value) => value !== name)); setSaved(false); }}
                style={[styles.chip, styles.selected]}
              >
                <Text style={styles.selectedText}>{name} ×</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.addRow}>
            <TextInput
              accessibilityLabel="알레르기 직접 추가"
              maxLength={50}
              placeholder="직접 추가 · 예: 키위, 망고"
              placeholderTextColor={colors.textDisabled}
              value={customDraft}
              onChangeText={(value) => { setCustomDraft(value); setSaved(false); }}
              onSubmitEditing={addCustom}
              style={styles.input}
            />
            <Pressable accessibilityRole="button" onPress={addCustom} style={styles.addButton}><Text style={styles.addText}>추가</Text></Pressable>
          </View>
          {hiddenSelections.length ? <Text style={styles.note}>이전 선택 항목 {hiddenSelections.length}개는 목록에 보이지 않아도 저장 시 유지돼요.</Text> : null}
          <View style={styles.reference}>
            <Text style={styles.referenceTitle}>ⓘ 참고용 정보예요</Text>
            <Text style={styles.note}>음식을 먹기 전에는 성분표를 꼭 확인해 주세요.</Text>
          </View>
          {saved ? <Text accessibilityRole="alert" style={styles.success}>식단 설정을 저장했어요.</Text> : null}
        </>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  sectionTitle: { fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold, color: colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 31, borderWidth: 1, borderColor: colors.border, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: colors.primaryDark, backgroundColor: colors.primaryDark },
  chipText: { fontSize: 12, color: colors.textBody },
  selectedText: { fontSize: 12, color: colors.surface, fontFamily: fontFamilies.pretendardMedium },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 39, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, fontSize: 12, color: colors.textPrimary },
  addButton: { width: 45, height: 39, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 12, color: colors.textBody },
  reference: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 10, borderWidth: 1, padding: 12, gap: 4 },
  referenceTitle: { fontSize: 12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  retry: { color: colors.primaryDark, fontSize: 13 },
  error: { color: colors.danger, fontSize: 12 },
  success: { color: colors.success, fontSize: 12 },
  save: { height: 48, borderRadius: 9, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  saveText: { color: colors.surface, fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold },
});
