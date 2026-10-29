import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppBottomSheet,
  AppButton,
  AppCard,
  AppDialog,
  AppHeader,
  AppTextField,
  Badge,
  Chip,
  ListRow,
  Notice,
  ProgressBar,
  SectionHeader,
  SegmentedControl,
  SelectField,
  Text,
} from '@/src/components/common';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const colorModes = [
  { value: 'light', label: '밝게' },
  { value: 'dark', label: '어둡게' },
] as const;

const textModes = [
  { value: 'normal', label: '기본' },
  { value: 'easy', label: '간편' },
] as const;

// Development-only page with every shared part, to compare against the Figma "R3 · 부품" page
// in light, dark and easy mode. Open /dev/ui-kit in a development build or the web preview.
export default function UiKitScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, easyMode, updateSettings } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [chip, setChip] = useState('3개월');
  const [tab, setTab] = useState<'checkup' | 'inbody'>('checkup');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppHeader title="부품 모음" showBackButton={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <SegmentedControl
            onChange={(value) => updateSettings({ colorMode: value })}
            options={colorModes}
            style={styles.flex}
            value={isDark ? 'dark' : 'light'}
          />
          <SegmentedControl
            onChange={(value) => updateSettings({ easyMode: value === 'easy' })}
            options={textModes}
            style={styles.flex}
            value={easyMode ? 'easy' : 'normal'}
          />
        </View>

        <SectionHeader title="버튼" subtitle="L · M · S, 누를 수 없음" />
        <AppButton onPress={() => setDialogOpen(true)} title="확인 창 열기" />
        <AppButton onPress={() => setSheetOpen(true)} title="아래 시트 열기" variant="secondary" />
        <View style={styles.row}>
          <AppButton
            fullWidth={false}
            onPress={() => {}}
            size="M"
            style={styles.flex}
            title="다음"
          />
          <AppButton
            disabled
            fullWidth={false}
            onPress={() => {}}
            size="M"
            style={styles.flex}
            title="저장"
          />
        </View>
        <View style={styles.wrap}>
          <AppButton fullWidth={false} onPress={() => {}} title="건너뛰기" variant="text" />
          <AppButton fullWidth={false} onPress={() => {}} title="탈퇴" variant="danger" />
          <AppButton fullWidth={false} onPress={() => {}} title="바꾸기" variant="outline" />
          <AppButton fullWidth={false} onPress={() => {}} title="삭제" variant="dangerOutline" />
        </View>

        <SectionHeader title="칩 · 표시" />
        <View style={styles.wrap}>
          {['1개월', '3개월', '6개월', '정하지 않음'].map((label) => (
            <Chip
              key={label}
              label={label}
              onPress={() => setChip(label)}
              selected={chip === label}
            />
          ))}
        </View>
        <View style={styles.wrap}>
          <Badge label="정상" tone="good" />
          <Badge label="조금 높음" tone="caution" />
          <Badge label="확인 필요" tone="danger" />
          <Badge label="추천" tone="neutral" />
        </View>

        <SectionHeader title="탭 · 게이지" />
        <SegmentedControl
          onChange={setTab}
          options={[
            { value: 'checkup', label: '건강검진' },
            { value: 'inbody', label: '인바디' },
          ]}
          value={tab}
        />
        <AppCard>
          <Text style={styles.cardTitle}>오늘 먹은 양</Text>
          <Text style={styles.cardValue}>1,240 / 1,700 kcal</Text>
          <ProgressBar style={styles.gauge} value={0.73} />
        </AppCard>

        <SectionHeader title="안내" />
        <Notice title="참고용 정보예요" body="음식을 먹기 전에는 성분표를 꼭 확인해 주세요." />
        <Notice
          body="통증이 심하면 운동을 멈추고 전문가와 상담해 주세요."
          title="주의"
          tone="warning"
        />

        <SectionHeader title="목록" />
        <AppCard padding="none" style={styles.listCard}>
          <ListRow description="식단 · 운동 알림을 받을지 정해요" showDivider title="알림 설정" />
          <ListRow description="다크 모드 · 글자 크기 · 간편 모드" title="화면 설정" />
          <ListRow danger title="로그아웃" />
        </AppCard>

        <SectionHeader title="입력" />
        <AppTextField
          helperText="로그인할 때 쓰는 이메일이에요"
          label="이메일"
          placeholder="example@email.com"
        />
        <AppTextField
          error="비밀번호가 맞지 않아요"
          label="비밀번호"
          placeholder="8자 이상"
          secureTextEntry
        />
        <SelectField label="생년월일" onPress={() => {}} placeholder="날짜를 골라 주세요" />
      </ScrollView>

      <AppDialog
        description="지금 기록은 그대로 남아요."
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => setDialogOpen(false)}
        title="운동을 그만할까요?"
        visible={dialogOpen}
      />
      <AppBottomSheet onClose={() => setSheetOpen(false)} title="다시 올리기" visible={sheetOpen}>
        <Text style={styles.sheetText}>새 자료를 올리면 지금 결과 대신 새 자료로 다시 읽어요.</Text>
      </AppBottomSheet>
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    screen: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 16, padding: 20, paddingBottom: 60 },
    row: { flexDirection: 'row', gap: 8 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    flex: { flex: 1 },
    cardTitle: { ...text.body2, color: colors.textSecondary },
    cardValue: { ...text.title2, color: colors.textPrimary, marginTop: 4 },
    gauge: { marginTop: 12 },
    listCard: { paddingHorizontal: 16 },
    sheetText: { ...text.body2, color: colors.textSecondary },
  } as const;
}
