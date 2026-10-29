import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityAdminChallenges,
  getCommunityErrorMessage,
  saveCommunityAdminChallenge,
  type CommunityAdminChallenge,
} from '@/src/api/community';
import { AppButton, AppHeader, Text } from '@/src/components/common';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import {
  fontFamilies,
  radius,
  spacing,
  typography,
  useAppTheme,
  useThemedStyles,
  type AppTheme,
} from '@/src/theme';

const METRICS: { label: string; value: CommunityAdminChallenge['metric'] }[] = [
  { label: '운동한 날', value: 'workout_days' },
  { label: '식단 기록한 날', value: 'meal_log_days' },
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Korean calendar date, `days` from today, as YYYY-MM-DD.
function koreanDate(days = 0) {
  const date = new Date(Date.now() + 9 * 3600e3 + days * 86400e3);
  return date.toISOString().slice(0, 10);
}

const daysBetween = (start: string, end: string) =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400e3) + 1;

// New challenge without ?challengeId=, otherwise edit. When people already joined, the server
// keeps the measured activity, goal, start and reward fixed; those inputs are shown read-only.
export default function CommunityAdminChallengeScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<CommunityAdminChallenge['metric']>('workout_days');
  const [goal, setGoal] = useState('5');
  const [startsOn, setStartsOn] = useState(koreanDate());
  const [endsOn, setEndsOn] = useState(koreanDate(13));
  const [reward, setReward] = useState('50');
  const [enabled, setEnabled] = useState(true);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  // Load once: a refocus must not undo what the operator typed.
  useFocusEffect(
    useCallback(() => {
      if (!challengeId || loaded.current) return;
      loaded.current = true;
      getCommunityAdminChallenges().then(
        (items) => {
          const item = items.find((candidate) => candidate.challenge_id === challengeId);
          if (!item) return;
          setTitle(item.title);
          setDescription(item.description ?? '');
          setMetric(item.metric);
          setGoal(String(item.goal));
          setStartsOn(item.starts_on);
          setEndsOn(item.ends_on);
          setReward(String(item.reward_mileage));
          setEnabled(item.enabled);
          setLocked(item.locked);
        },
        (error) => notify(getCommunityErrorMessage(error)),
      );
    }, [challengeId, notify]),
  );

  const goalNumber = Number(goal);
  const rewardNumber = Number(reward);
  let problem = '';
  if (title.trim().length < 2) problem = '제목을 2자 이상 적어 주세요.';
  else if (!DATE.test(startsOn) || !DATE.test(endsOn))
    problem = '날짜는 2026-10-19처럼 적어 주세요.';
  else if (daysBetween(startsOn, endsOn) < 1) problem = '끝나는 날이 시작하는 날보다 빨라요.';
  else if (!Number.isInteger(goalNumber) || goalNumber < 1)
    problem = '목표 일수를 1 이상으로 적어 주세요.';
  else if (goalNumber > daysBetween(startsOn, endsOn)) problem = '목표 일수가 기간보다 길어요.';
  else if (!Number.isInteger(rewardNumber) || rewardNumber < 0 || rewardNumber > 100000)
    problem = '보상은 0~100,000점으로 적어 주세요.';

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    try {
      await saveCommunityAdminChallenge(challengeId ?? null, {
        description: description.trim() || null,
        enabled,
        ends_on: endsOn,
        goal: goalNumber,
        metric,
        reward_mileage: rewardNumber,
        starts_on: startsOn,
        title: title.trim(),
      });
      // Opened directly (e.g. a shared link) there is no list behind it to go back to.
      if (router.canGoBack()) router.back();
      else router.replace('/community/admin/challenges');
    } catch (error) {
      actions.handleError(error);
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    options: { numeric?: boolean; placeholder?: string; readOnly?: boolean } = {},
  ) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={!options.readOnly}
        keyboardType={options.numeric ? 'number-pad' : 'default'}
        onChangeText={onChange}
        placeholder={options.placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, options.readOnly && styles.readOnly]}
        value={value}
      />
    </>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <AppHeader
        onBackPress={() => router.back()}
        title={challengeId ? '챌린지 수정' : '새 챌린지'}
      />
      <ScrollView
        contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        {locked ? (
          <Text style={styles.lockedNote}>
            참여한 사람이 있어 측정 기준·목표·시작일·보상은 바꿀 수 없어요. 종료일은 늦추기만 할 수
            있어요.
          </Text>
        ) : null}
        {field('제목', title, setTitle, { placeholder: '예: 2주 운동 습관 (2~40자)' })}
        {field('설명 (선택)', description, setDescription)}
        <Text style={styles.label}>무엇을 셀까요</Text>
        <View style={styles.chips}>
          {METRICS.map((item) => (
            <Pressable
              accessibilityRole="button"
              aria-selected={item.value === metric}
              disabled={locked}
              key={item.value}
              onPress={() => setMetric(item.value)}
              style={[styles.chip, item.value === metric && styles.chipActive]}
            >
              <Text style={[styles.chipText, item.value === metric && styles.chipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {field('목표 일수', goal, setGoal, { numeric: true, readOnly: locked })}
        {field('시작일 (YYYY-MM-DD, 한국 날짜)', startsOn, setStartsOn, { readOnly: locked })}
        {field('종료일 (YYYY-MM-DD, 한국 날짜)', endsOn, setEndsOn)}
        {field('보상 마일리지', reward, setReward, { numeric: true, readOnly: locked })}
        <View style={styles.switchRow}>
          <Text style={styles.label}>사용자에게 보이기</Text>
          <Switch
            accessibilityLabel="사용자에게 보이기"
            onValueChange={setEnabled}
            thumbColor={colors.elevated}
            trackColor={{ false: colors.border, true: colors.primary }}
            value={enabled}
          />
        </View>
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
        <AppButton
          disabled={Boolean(problem) || saving}
          onPress={() => void save()}
          title={saving ? '저장하는 중' : '저장하기'}
        />
      </ScrollView>
      {actions.elements}
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    form: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
    lockedNote: {
      ...typography.bodySmall,
      backgroundColor: colors.background,
      borderRadius: radius.md,
      color: colors.textBody,
      padding: spacing.md,
    },
    label: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardSemiBold,
      fontSize: 15,
      marginTop: spacing.sm,
    },
    input: {
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 15,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    readOnly: { backgroundColor: colors.background, color: colors.textSecondary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: {
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    chipTextActive: { color: colors.elevated },
    switchRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: spacing.sm,
    },
    problem: { ...typography.bodySmall, color: colors.danger },
  } as const;
}
