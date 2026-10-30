import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityAdminRules,
  getCommunityErrorMessage,
  isProvisionalNote,
  updateCommunityAdminRule,
  type CommunityAdminRule,
} from '@/src/api/community';
import { AppButton, AppHeader } from '@/src/components/common';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, radius, spacing, typography } from '@/src/theme';

const RULES: Record<
  CommunityAdminRule['rule_key'],
  { title: string; amountLabel: string; daily?: string }
> = {
  club_create_cost: { amountLabel: '사용 마일리지 (유료 회원은 무료)', title: '클럽 개설 비용' },
  earn_meal_log: { amountLabel: '적립 마일리지', daily: '하루 최대 건수', title: '식단 기록 1건' },
  earn_workout: { amountLabel: '적립 마일리지', daily: '하루 최대 횟수', title: '운동 완료 1회' },
  earn_workout_high: { amountLabel: '해당 일 운동 보상 총액', title: '고강도 운동 완료일' },
  earn_streak_5: { amountLabel: '적립 마일리지', title: '운동 5일 연속 달성' },
  earn_streak_30: { amountLabel: '적립 마일리지', title: '운동 30일 연속 달성' },
  membership_demo_days: { amountLabel: '기간 (일)', title: '시연용 유료 회원' },
};
const ORDER: CommunityAdminRule['rule_key'][] = [
  'earn_workout',
  'earn_meal_log',
  'club_create_cost',
  'membership_demo_days',
];

// Operators set the team's decided numbers here; saving clears the "provisional" label.
export default function CommunityAdminRulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const [rules, setRules] = useState<CommunityAdminRule[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const load = useCallback(async () => {
    try {
      setRules(await getCommunityAdminRules());
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const replace = (next: CommunityAdminRule) =>
    setRules(
      (current) => current?.map((rule) => (rule.rule_key === next.rule_key ? next : rule)) ?? null,
    );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <AppHeader onBackPress={() => router.back()} title="마일리지 규칙" />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => void load()} title="다시 시도" />
        </View>
      ) : rules === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.note}>
            저장하면 모든 사용자에게 바로 적용돼요. 이미 쌓인 마일리지는 바뀌지 않아요.
          </Text>
          <Text style={styles.note}>
            고강도 운동과 연속 운동 시험 규칙은 서버의 수정 기능이 연결된 뒤 이곳에서 조정할 수 있어요.
          </Text>
          {ORDER.map((key) => rules.find((rule) => rule.rule_key === key))
            .filter((rule): rule is CommunityAdminRule => Boolean(rule))
            .map((rule) => (
              <RuleCard
                key={rule.rule_key}
                onSaved={(next) => {
                  replace(next);
                  actions.notify(`${RULES[next.rule_key].title} 규칙을 저장했어요.`);
                }}
                onError={(error) => actions.handleError(error)}
                rule={rule}
              />
            ))}
        </ScrollView>
      )}
      {actions.elements}
    </KeyboardAvoidingView>
  );
}

function RuleCard({
  rule,
  onSaved,
  onError,
}: {
  rule: CommunityAdminRule;
  onSaved: (rule: CommunityAdminRule) => void;
  onError: (error: unknown) => void;
}) {
  const meta = RULES[rule.rule_key];
  const [amount, setAmount] = useState(String(rule.amount));
  const [daily, setDaily] = useState(rule.daily_limit === null ? '' : String(rule.daily_limit));
  const [enabled, setEnabled] = useState(rule.enabled);
  const [restart, setRestart] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const amountNumber = Number(amount);
  const dailyNumber = daily.trim() === '' ? null : Number(daily);
  const invalid =
    !Number.isInteger(amountNumber) ||
    amountNumber < 0 ||
    amountNumber > 100000 ||
    (dailyNumber !== null &&
      (!Number.isInteger(dailyNumber) || dailyNumber < 0 || dailyNumber > 100));

  const save = async () => {
    if (invalid || saving) return;
    setSaving(true);
    try {
      const next = await updateCommunityAdminRule(rule.rule_key, {
        amount: amountNumber,
        daily_limit: meta.daily ? dailyNumber : null,
        enabled,
        note: note.trim() || null,
        restart,
      });
      setRestart(false);
      setNote('');
      onSaved(next);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.title}>{meta.title}</Text>
        {isProvisionalNote(rule.note) ? <Text style={styles.provisional}>임시값</Text> : null}
      </View>
      {rule.note ? <Text style={styles.ruleNote}>{rule.note}</Text> : null}
      <Text style={styles.label}>{meta.amountLabel}</Text>
      <TextInput
        accessibilityLabel={`${meta.title} ${meta.amountLabel}`}
        keyboardType="number-pad"
        onChangeText={setAmount}
        style={styles.input}
        value={amount}
      />
      {meta.daily ? (
        <>
          <Text style={styles.label}>{meta.daily} (비우면 제한 없음)</Text>
          <TextInput
            accessibilityLabel={`${meta.title} ${meta.daily}`}
            keyboardType="number-pad"
            onChangeText={setDaily}
            style={styles.input}
            value={daily}
          />
        </>
      ) : null}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>켜기</Text>
        <Switch
          accessibilityLabel={`${meta.title} 켜기`}
          onValueChange={setEnabled}
          thumbColor={colors.surface}
          trackColor={{ false: colors.border, true: colors.primary }}
          value={enabled}
        />
      </View>
      {meta.daily ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>지금 이후 활동만 적립 (이전 기록은 소급 안 함)</Text>
          <Switch
            accessibilityLabel={`${meta.title} 지금 이후 활동만 적립`}
            onValueChange={setRestart}
            thumbColor={colors.surface}
            trackColor={{ false: colors.border, true: colors.primary }}
            value={restart}
          />
        </View>
      ) : null}
      <Text style={styles.label}>메모 (선택, 비우면 「운영자가 정함」)</Text>
      <TextInput
        accessibilityLabel={`${meta.title} 메모`}
        maxLength={100}
        onChangeText={setNote}
        placeholder="예: 10/20 팀 회의에서 결정"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={note}
      />
      <AppButton disabled={invalid || saving} onPress={() => void save()} title="저장" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  message: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  body: { gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  note: { ...typography.bodySmall, color: colors.textSecondary },
  card: {
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  provisional: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.sm,
    color: colors.danger,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ruleNote: { ...typography.bodySmall, color: colors.textSecondary },
  label: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  input: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  switchLabel: { ...typography.bodySmall, color: colors.textBody, flex: 1 },
});
