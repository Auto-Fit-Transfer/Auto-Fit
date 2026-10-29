import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  COMMUNITY_CLUB_CATEGORIES,
  createCommunityClub,
  getCommunityClub,
  getCommunityErrorMessage,
  getCommunityMembership,
  getCommunityMileage,
  isProvisionalNote,
  type CommunityClubCategory,
  type CommunityMembership,
  type CommunityMileage,
  updateCommunityClub,
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

// Also the edit screen: with ?clubId= the owner changes name, interest and intro (no cost).
export default function CommunityNewClubScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { clubId } = useLocalSearchParams<{ clubId?: string }>();
  const editing = Boolean(clubId);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CommunityClubCategory | null>(null);
  const [membership, setMembership] = useState<CommunityMembership | null>(null);
  const [mileage, setMileage] = useState<CommunityMileage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const trimmedName = name.trim();
  const ready = trimmedName.length >= 2 && category !== null && !submitting;

  const loadCost = useCallback(async () => {
    if (clubId) {
      try {
        const club = await getCommunityClub(clubId);
        setName(club.name);
        setDescription(club.description ?? '');
        setCategory(club.category);
      } catch (error) {
        notify(getCommunityErrorMessage(error));
      }
      return;
    }
    const [nextMembership, nextMileage] = await Promise.allSettled([
      getCommunityMembership(),
      getCommunityMileage(),
    ]);
    if (nextMembership.status === 'fulfilled') setMembership(nextMembership.value);
    if (nextMileage.status === 'fulfilled') setMileage(nextMileage.value);
  }, [clubId, notify]);

  // Also on return from the membership screen, so a new membership shows right away. When
  // editing, load the club once (a refocus must not undo the owner's typing).
  const loaded = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (editing && loaded.current) return;
      loaded.current = true;
      void loadCost();
    }, [editing, loadCost]),
  );

  const costRule = mileage?.rules.find((rule) => rule.rule_key === 'club_create_cost');
  let costText = '개설 조건을 불러오는 중이에요.';
  if (membership?.active) {
    costText = '유료 회원이라 무료로 만들 수 있어요.';
  } else if (costRule && !costRule.enabled) {
    costText = '지금은 유료 회원만 클럽을 만들 수 있어요.';
  } else if (costRule && mileage) {
    costText = `만들면 마일리지 ${costRule.amount.toLocaleString()}점을 사용해요. (지금 ${mileage.balance.toLocaleString()}점)`;
  }
  const short =
    !membership?.active && costRule?.enabled && mileage ? mileage.balance < costRule.amount : false;

  const submit = async () => {
    if (!ready || !category || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (clubId) {
        await updateCommunityClub(clubId, trimmedName, description, category);
        router.back();
        return;
      }
      const club = await createCommunityClub(trimmedName, description, category);
      router.replace({ params: { clubId: club.club_id }, pathname: '/community/club/[clubId]' });
    } catch (error) {
      actions.handleError(error, undefined, () => void submit());
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <AppHeader onBackPress={() => router.back()} title={editing ? '클럽 수정' : '클럽 만들기'} />
      <ScrollView
        contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        {editing ? null : (
          <View style={[styles.cost, short && styles.costShort]}>
            <Text style={styles.costText}>{costText}</Text>
            {short ? (
              <Text style={styles.costHint}>
                마일리지가 부족해요. 운동을 완료하거나 식단을 기록하면 쌓여요.
              </Text>
            ) : null}
            {isProvisionalNote(costRule?.note) ? (
              <Text style={styles.costNote}>개설 규칙은 팀에서 정하기 전 임시값이에요.</Text>
            ) : null}
            {membership?.active ? null : (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/community/membership')}
              >
                <Text style={styles.link}>유료 회원 알아보기</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.label}>클럽 이름</Text>
        <TextInput
          accessibilityLabel="클럽 이름"
          maxLength={30}
          onChangeText={setName}
          placeholder="예: 새벽 러닝 크루 (2~30자)"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          value={name}
        />

        <Text style={styles.label}>관심사</Text>
        <View style={styles.chips}>
          {COMMUNITY_CLUB_CATEGORIES.map((item) => (
            <Pressable
              accessibilityRole="button"
              aria-selected={item.value === category}
              key={item.value}
              onPress={() => setCategory(item.value)}
              style={[styles.chip, item.value === category && styles.chipActive]}
            >
              <Text style={[styles.chipText, item.value === category && styles.chipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>소개 (선택)</Text>
        <TextInput
          accessibilityLabel="클럽 소개"
          lineBreakStrategyIOS="hangul-word"
          maxLength={300}
          multiline
          onChangeText={setDescription}
          placeholder="어떤 사람들이 모이면 좋을지 적어 주세요."
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, styles.multiline]}
          textAlignVertical="top"
          value={description}
        />

        <AppButton
          disabled={!ready}
          onPress={() => void submit()}
          title={submitting ? '저장하는 중' : editing ? '저장하기' : '클럽 만들기'}
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
    cost: {
      backgroundColor: colors.primaryLight,
      borderRadius: radius.md,
      gap: 4,
      marginBottom: spacing.md,
      padding: spacing.lg,
    },
    costShort: { backgroundColor: colors.dangerLight },
    costText: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardSemiBold,
      fontSize: 15,
    },
    costHint: { ...typography.bodySmall, color: colors.danger },
    costNote: { ...typography.bodySmall, color: colors.textSecondary },
    link: {
      color: colors.primaryPressed,
      fontFamily: fontFamilies.pretendardSemiBold,
      fontSize: 14,
      marginTop: 2,
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
    multiline: { minHeight: 110, marginBottom: spacing.lg },
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
  } as const;
}
