import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import { type DisplayPreferences } from '@/src/api/userSettings';
import { getApiErrorMessage } from '@/src/api/client';
import { AppBottomSheet, Text } from '@/src/components/common';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies } from '@/src/theme';

const modes = [
  { label: '기기 설정대로', tone: '#DFDFE5', value: 'system' },
  { label: '밝게', tone: '#F5F5F8', value: 'light' },
  { label: '어둡게', tone: '#25252B', value: 'dark' },
] as const;

export default function DisplaySettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences, isDark, ready, serverSynced, save } = useDisplayPreferences();
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmSimple, setConfirmSimple] = useState(false);
  const simple = preferences.simple_mode_enabled;
  const fontRatio = (preferences.font_size_step - 1) / 4;

  const persist = async (next: DisplayPreferences) => {
    if (saving || !ready) return false;
    setSaving(true);
    setSaveError('');
    try {
      await save(next);
      return true;
    } catch (cause) {
      setSaveError(getApiErrorMessage(cause));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <ScrollView
      contentContainerStyle={[styles.content, simple && simpleStyles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      style={[styles.root, isDark && dark.root]}
    >
      <View style={styles.header}>
        <Pressable hitSlop={16} accessibilityLabel="뒤로" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <CaretLeftIcon color={isDark ? darkColors.textPrimary : '#17161D'} height={24} width={24} />
        </Pressable>
        <Text style={[styles.title, isDark && dark.text]}>화면 설정</Text>
        <View style={styles.headerRead}><SimpleReadButton text="화면 설정입니다. 화면 모드, 글자 크기, 간편 모드를 바꿀 수 있어요. 간편 모드를 끄면 기본 화면으로 돌아갑니다." /></View>
      </View>
      <Text style={[styles.sectionTitle, isDark && dark.text, simple && simpleStyles.sectionTitle]}>화면 모드</Text>
      <View style={styles.modes}>
        {modes.map((mode) => (
          <Pressable key={mode.label} accessibilityRole="radio" accessibilityLabel={mode.label} accessibilityState={{ selected: preferences.theme_mode === mode.value, disabled: !ready || saving }} disabled={!ready || saving} onPress={() => void persist({ ...preferences, theme_mode: mode.value })} style={[styles.mode, isDark && dark.card, preferences.theme_mode === mode.value && styles.selectedMode]}>
            <View style={[styles.phone, { backgroundColor: mode.tone }]}>
              <View style={[styles.phoneBar, mode.label === '어둡게' && styles.darkPhoneBar]} />
              <View style={[styles.phoneLine, mode.label === '어둡게' && styles.darkPhoneLine]} />
              <View style={[styles.phoneLine, mode.label === '어둡게' && styles.darkPhoneLine]} />
              <View style={[styles.phoneLine, mode.label === '어둡게' && styles.darkPhoneLine]} />
            </View>
            <Text style={[styles.modeLabel, isDark && dark.text]}>{mode.label}</Text>
            <View style={[styles.radio, preferences.theme_mode === mode.value && styles.radioSelected]}>
              {preferences.theme_mode === mode.value ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        ))}
      </View>
      {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
      {serverSynced === false ? <Text style={[styles.note, isDark && dark.secondary]}>기기에 저장됐어요. 서버 연결 후 동기화할 예정이에요.</Text> : null}
      <Text style={[styles.note, isDark && dark.secondary]}>기기 설정대로를 고르면 휴대폰의 화면 모드를 따라요.</Text>
      <Text style={[styles.sectionTitle, isDark && dark.text, simple && simpleStyles.sectionTitle]}>글자 크기</Text>
      <View style={[styles.fontCard, isDark && dark.card]}>
        <View style={styles.fontSliderRow}>
          <Text style={[styles.fontSample, isDark && dark.text]}>가</Text>
          <View style={styles.fontTrack}>
            <View style={[styles.fontProgress, { width: `${fontRatio * 100}%` }]} />
            {([1, 2, 3, 4, 5] as const).map((step) => (
              <Pressable
                key={step}
                accessibilityRole="radio"
                accessibilityLabel={`글자 크기 ${step}단계`}
                accessibilityState={{ selected: preferences.font_size_step === step, disabled: !ready || saving }}
                disabled={!ready || saving}
                hitSlop={12}
                onPress={() => void persist({ ...preferences, font_size_step: step })}
                style={[styles.fontStop, { left: `${(step - 1) * 25}%` }, preferences.font_size_step === step && styles.fontStopSelected]}
              >
                {preferences.font_size_step === step ? null : <View style={styles.fontTick} />}
              </Pressable>
            ))}
          </View>
          <Text style={[styles.fontSampleLarge, isDark && dark.text]}>가</Text>
        </View>
        <View style={styles.fontScaleLabels}><Text style={[styles.note, isDark && dark.secondary]}>작게</Text><Text style={[styles.note, isDark && dark.secondary]}>기본</Text><Text style={[styles.note, isDark && dark.secondary]}>크게</Text></View>
        <View style={[styles.fontPreview, isDark && dark.action]}>
          <Text style={[styles.fontPreviewCaption, isDark && dark.secondary]}>미리 보기</Text>
          <Text style={[styles.fontPreviewText, isDark && dark.text, { fontSize: 13 + preferences.font_size_step * 1.5 }]}>오늘 저녁은 그릭요거트 볼 어때요? 단백질 25g을 채울 수 있어요.</Text>
        </View>
      </View>
      <Text style={[styles.note, isDark && dark.secondary]}>글자 크기는 일부 화면부터 적용돼요.</Text>
      <Text style={[styles.sectionTitle, isDark && dark.text, simple && simpleStyles.sectionTitle]}>간편 모드</Text>
      <View style={[styles.simpleCard, isDark && dark.card]}>
        <View style={styles.simpleIntro}>
          <View style={styles.simplePreview}>
            <View style={styles.simplePreviewBar} />
            <View style={styles.simplePreviewLine} />
            <View style={styles.simplePreviewLine} />
            <View style={styles.simplePreviewLine} />
          </View>
          <View style={styles.simpleCopy}>
            <Text style={[styles.simpleTitle, isDark && dark.text, simple && simpleStyles.simpleTitle]}>큰 글씨 · 읽어 주기</Text>
            <Text style={[styles.simpleDescription, isDark && dark.secondary, simple && simpleStyles.simpleDescription]}>글씨와 버튼을 크게 하고, 주요 화면에 읽어 주기 버튼을 넣어요.</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready || saving }} disabled={!ready || saving} onPress={() => setConfirmSimple(true)} style={[styles.simpleAction, isDark && dark.action]}>
          <Text style={[styles.simpleActionText, isDark && dark.text]}>{simple ? '기본 모드로 바꾸기' : '간편 모드로 바꾸기'}</Text>
        </Pressable>
      </View>
      <Text style={[styles.note, isDark && dark.secondary]}>간편 모드는 홈·식단·운동·커뮤니티·마이의 주요 화면에 적용돼요.</Text>
    </ScrollView>
    <AppBottomSheet visible={confirmSimple} onClose={() => setConfirmSimple(false)} title={simple ? '기본 모드로 돌아갈까요?' : '간편 모드로 바꿀까요?'} scrollable="when-overflow" contentStyle={styles.confirmContent} footer={
      <View style={styles.confirmFooter}>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => {
          void persist({ ...preferences, simple_mode_enabled: !simple }).then((saved) => {
            if (saved) setConfirmSimple(false);
          });
        }} style={styles.confirmButton}><Text style={styles.confirmButtonText}>{simple ? '기본 모드로 바꾸기' : '간편 모드로 바꾸기'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setConfirmSimple(false)} style={styles.cancelButton}><Text style={styles.cancelText}>취소</Text></Pressable>
      </View>
    }>
      <View style={styles.previewRow}>
        <View style={styles.previewColumn}><View style={styles.sheetPhone}><View style={styles.sheetPhoneBar} />{[0, 1, 2, 3].map((item) => <View key={item} style={styles.sheetPhoneLine} />)}</View><Text style={styles.previewLabel}>지금</Text></View>
        <CaretRightIcon color="#5E5D66" height={24} width={24} />
        <View style={styles.previewColumn}><View style={styles.sheetPhone}><View style={styles.sheetPhoneBar} />{[0, 1, 2].map((item) => <View key={item} style={styles.sheetPhoneLineLarge} />)}</View><Text style={styles.previewLabel}>간편 모드</Text></View>
      </View>
      {['주요 화면의 글씨와 버튼이 커져요', "주요 화면에 '읽어 주기' 버튼이 생겨요", '나란한 정보 카드는 한 줄에 하나씩 보여요', '기록 · 목표 · 티어는 그대로 이어져요'].map((item) => <View key={item} style={styles.benefitRow}><CheckIcon color="#0E7C48" height={20} width={20} /><Text style={styles.benefitText}>{item}</Text></View>)}
      <Text style={styles.note}>마이 › 화면 설정에서 언제든 기본 모드로 돌아올 수 있어요.</Text>
    </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#FFFFFF', flex: 1 },
  content: { gap: 16, paddingHorizontal: 20 },
  header: { alignItems: 'center', height: 48, justifyContent: 'center', marginBottom: 10 },
  headerRead: { position: 'absolute', right: 0, top: 0 },
  back: { left: 0, position: 'absolute', top: 12 },
  title: { color: '#17161D', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  sectionTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  modes: { flexDirection: 'row', gap: 8 },
  mode: { backgroundColor: '#FAFBFC', alignItems: 'center', borderColor: '#DFE2E7', borderRadius: 12, borderWidth: 1, flex: 1, gap: 8, padding: 10 },
  selectedMode: { borderColor: '#5246C6', borderWidth: 2, padding: 9 },
  phone: { borderColor: '#DFE2E7', borderRadius: 8, borderWidth: 1, height: 78, padding: 9, width: 49 },
  phoneBar: { backgroundColor: '#33333B', borderRadius: 2, height: 5, marginBottom: 10, width: 26 },
  darkPhoneBar: { backgroundColor: '#F2F4F6' },
  phoneLine: { backgroundColor: '#E3E6EB', borderRadius: 2, height: 5, marginBottom: 6, width: 27 },
  darkPhoneLine: { backgroundColor: '#5B5B67' },
  modeLabel: { color: '#3B3A42', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  radio: { borderColor: '#C5C5CD', borderRadius: 8, borderWidth: 1, height: 16, width: 16 },
  radioSelected: { alignItems: 'center', borderColor: '#5246C6', justifyContent: 'center' },
  radioDot: { backgroundColor: '#5246C6', borderRadius: 4, height: 8, width: 8 },
  note: { color: '#5E5D66', fontFamily: fontFamilies.pretendardRegular, fontSize: 12, lineHeight: 18 },
  confirmContent: { gap: 16, paddingBottom: 12 },
  confirmButton: { alignItems: 'center', backgroundColor: '#5246C6', borderRadius: 12, height: 56, justifyContent: 'center' },
  confirmButtonText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  error: { color: '#B34141', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  fontCard: { backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, gap: 12, padding: 18 },
  fontSliderRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 34 },
  fontSample: { color: '#17161D', fontSize: 12 },
  fontSampleLarge: { color: '#17161D', fontSize: 22 },
  fontTrack: { backgroundColor: '#E3E6EB', borderRadius: 2, flex: 1, height: 4, justifyContent: 'center', marginHorizontal: 10 },
  fontProgress: { backgroundColor: '#5246C6', borderRadius: 2, height: 4 },
  fontStop: { alignItems: 'center', borderRadius: 12, height: 24, justifyContent: 'center', marginLeft: -12, position: 'absolute', width: 24 },
  fontTick: { backgroundColor: '#C9CCD2', borderRadius: 3, height: 6, width: 6 },
  fontStopSelected: { backgroundColor: '#FFFFFF', borderColor: '#5246C6', borderWidth: 2 },
  fontScaleLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  fontPreview: { backgroundColor: '#FFFFFF', borderColor: '#DFE2E7', borderRadius: 12, borderWidth: 1, gap: 6, padding: 13 },
  fontPreviewCaption: { color: '#5E5D66', fontSize: 12 },
  fontPreviewText: { color: '#17161D', fontFamily: fontFamilies.pretendardRegular, lineHeight: 26 },
  simpleCard: { backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, gap: 16, padding: 15 },
  simpleIntro: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  simplePreview: { backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 7, borderWidth: 1, gap: 7, height: 74, padding: 9, width: 52 },
  simplePreviewBar: { backgroundColor: '#5246C6', borderRadius: 2, height: 7, width: 23 },
  simplePreviewLine: { backgroundColor: '#E3E6EB', borderRadius: 2, height: 5, width: 30 },
  simpleCopy: { flex: 1, gap: 5 },
  simpleTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  simpleDescription: { color: '#5E5D66', fontFamily: fontFamilies.pretendardRegular, fontSize: 12, lineHeight: 16 },
  simpleState: { color: '#5246C6', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  simpleAction: { alignItems: 'center', backgroundColor: '#F2F4F6', borderRadius: 12, minHeight: 48, justifyContent: 'center' },
  simpleActionText: { color: '#17161D', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  confirmFooter: { gap: 8 },
  cancelButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  cancelText: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 16 },
  previewRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 25 },
  previewColumn: { alignItems: 'center', gap: 6 },
  sheetPhone: { borderColor: '#DFE2E7', borderRadius: 12, borderWidth: 1, gap: 8, height: 132, padding: 10, width: 84 },
  sheetPhoneBar: { backgroundColor: '#17161D', borderRadius: 4, height: 7, width: 35 },
  sheetPhoneLine: { backgroundColor: '#F2F4F6', borderRadius: 5, height: 12 },
  sheetPhoneLineLarge: { backgroundColor: '#F2F4F6', borderRadius: 5, height: 22 },
  previewLabel: { color: '#5E5D66', fontSize: 12 },
  benefitRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  benefitText: { color: '#3B3A42', flex: 1, fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 21 },
});

const simpleStyles = StyleSheet.create({
  content: { gap: 20 },
  sectionTitle: { fontSize: 20 },
  simpleTitle: { fontSize: 18 },
  simpleDescription: { fontSize: 14, lineHeight: 21 },
});

const dark = StyleSheet.create({
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
  secondary: { color: darkColors.textSecondary },
  action: { backgroundColor: darkColors.surfaceRaised },
});
