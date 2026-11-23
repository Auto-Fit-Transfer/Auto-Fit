import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { koreanDate } from '@/src/lib/koreanDate';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { claimCommunityChallenge, getCommunityChallenges, getCommunityErrorMessage, isProvisionalNote, setCommunityChallengeParticipation, type CommunityChallenge } from '@/src/api/community';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';
import { Text } from '@/src/components/common';

const metricLabel: Record<CommunityChallenge['metric'], string> = {
  workout_days: '운동한 날', meal_log_days: '식단 기록한 날',
};
const phaseLabel: Record<CommunityChallenge['phase'], string> = {
  ongoing: '진행 중', upcoming: '예정', ended: '종료',
};

export default function ChallengeDetail() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const [challenge, setChallenge] = useState<CommunityChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async (isActive: () => boolean = () => true) => {
    try {
      const items = await getCommunityChallenges();
      if (!isActive()) return;
      const found = items.find((item) => item.challenge_id === challengeId);
      if (!found) { setError('챌린지를 찾지 못했어요.'); return; }
      setChallenge(found);
      setError('');
    } catch (cause) {
      if (isActive()) setError(getCommunityErrorMessage(cause));
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [challengeId]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]));

  const act = async (task: () => Promise<CommunityChallenge>, success: string) => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    try { setChallenge(await task()); setNotice(success); }
    catch (cause) { setError(getCommunityErrorMessage(cause)); }
    finally { setBusy(false); }
  };

  const progress = challenge?.joined ? Math.min(100, Math.max(0, challenge.progress / Math.max(1, challenge.goal) * 100)) : 0;
  const remaining = challenge ? Math.max(0, challenge.goal - challenge.progress) : 0;
  const action = () => {
    if (!challenge) return;
    if (challenge.can_claim) { void act(() => claimCommunityChallenge(challenge.challenge_id), `마일리지 ${challenge.reward_mileage.toLocaleString()}점을 받았어요.`); return; }
    if (!challenge.joined && challenge.phase !== 'ended') { void act(() => setCommunityChallengeParticipation(challenge.challenge_id, true), '챌린지에 참여했어요.'); return; }
    if (challenge.joined && challenge.phase === 'ongoing') {
      router.push(challenge.metric === 'workout_days' ? '/exercise/condition' : '/(tabs)/diet');
    }
  };
  const actionText = !challenge ? '' : challenge.rewarded ? '보상을 받았어요' : challenge.can_claim ? '보상 받기'
    : !challenge.joined && challenge.phase !== 'ended' ? '챌린지 참여하기'
      : challenge.phase === 'ended' ? '종료된 챌린지예요'
        : challenge.phase === 'upcoming' ? '시작을 기다리는 중이에요'
          : challenge.metric === 'workout_days' ? '운동하러 가기' : '식단 기록하기';
  const actionDisabled = busy || !challenge || challenge.rewarded || challenge.phase === 'ended'
    || (challenge.joined && challenge.phase === 'upcoming' && !challenge.can_claim);

  return <View style={s.root}>
    <ScreenHeader onBack={() => router.back()} title="챌린지" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: 8, paddingBottom: insets.bottom + 36 }]}>
      {loading ? <ActivityIndicator color={colors.primaryText} /> : null}
      {error && !challenge ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }} style={s.card}><Text style={s.error}>{error} · 다시 시도</Text></Pressable> : null}
      {challenge ? <>
        <Text style={s.phase}>{phaseLabel[challenge.phase]}{challenge.phase === 'ongoing' ? ` · ${koreanDate(challenge.ends_on)}까지` : ''}</Text>
        <Text style={s.hero}>{challenge.title}</Text>
        {challenge.description ? <Text style={s.body}>{challenge.description}</Text> : null}
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statLabel}>기간</Text><Text style={s.statValue}>{koreanDate(challenge.starts_on)}~{koreanDate(challenge.ends_on)}</Text></View>
          <View style={s.stat}><Text style={s.statLabel}>보상</Text><Text style={s.statValue}>+{challenge.reward_mileage.toLocaleString()}P</Text></View>
          <View style={s.stat}><Text style={s.statLabel}>참여</Text><Text style={s.statValue}>{challenge.participant_count.toLocaleString()}명</Text></View>
        </View>
        {isProvisionalNote(challenge.note) ? <View style={s.notice}><Text style={s.noticeText}>기간·목표·보상은 현재 시험 기준이에요.</Text></View> : null}
        <View style={s.card}>
          <View style={s.row}><Text style={s.section}>내 진행</Text><Text style={s.progressValue}>{challenge.joined ? `${challenge.progress}/${challenge.goal}일` : '참여 전'}</Text></View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }} style={s.track}><View style={[s.fill, { width: `${progress}%` }]} /></View>
          <Text style={s.body}>{challenge.joined ? challenge.completed ? '목표를 달성했어요.' : `${metricLabel[challenge.metric]} ${remaining}일을 더 채우면 목표에 도달해요.` : '참여하면 완료한 기록이 목표에 반영돼요.'}</Text>
          <Text style={s.caption}>날짜별 기록은 현재 제공되지 않아 합계만 표시해요.</Text>
        </View>
        <View style={s.card}><Text style={s.section}>함께 도전해요</Text><Text style={s.body}>{challenge.participant_count.toLocaleString()}명이 이 챌린지에 참여하고 있어요.</Text></View>
        <View style={s.card}><Text style={s.section}>이렇게 진행돼요</Text>{[`기간 안에 ${metricLabel[challenge.metric]}을 기록해요.`, `${challenge.goal}일 목표를 채우면 완료 상태가 돼요.`, '보상을 받을 수 있을 때 신청해요.'].map((step, index) => <View key={step} style={s.stepRow}><View style={s.stepNumber}><Text style={s.stepNumberText}>{index + 1}</Text></View><Text style={s.step}>{step}</Text></View>)}</View>
        {notice ? <Text style={s.success}>{notice}</Text> : null}{error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={actionDisabled} onPress={action} style={[s.button, actionDisabled && s.disabled]}><Text style={[s.buttonText, actionDisabled && s.disabledText]}>{busy ? '처리 중…' : actionText}</Text></Pressable>
        {challenge.joined && challenge.phase !== 'ended' && !challenge.completed ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void act(() => setCommunityChallengeParticipation(challenge.challenge_id, false), '챌린지 참여를 취소했어요.')} style={s.outline}><Text style={s.outlineText}>참여 취소</Text></Pressable> : null}
      </> : null}
    </ScrollView>
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  // Renewal B: the name as a big bold title, the three facts in one light box, white cards, one black pill.
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 14, paddingHorizontal: 20 },
    phase: { ...a.p12, alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 99, color: colors.onPrimary, marginTop: 8, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
    hero: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 30, letterSpacing: -0.6, lineHeight: 38 },
    body: { color: colors.textSecondary, fontSize: 15, lineHeight: 24 },
    caption: a.note,
    stats: { backgroundColor: colors.surface, borderRadius: 18, flexDirection: 'row', paddingVertical: 14 },
    stat: { alignItems: 'center', flex: 1, gap: 2, paddingHorizontal: 6 },
    statLabel: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    statValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20, textAlign: 'center' },
    card: { ...a.card, gap: 10, paddingHorizontal: 20, paddingVertical: 18 },
    row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    section: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    progressValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    track: { backgroundColor: colors.surfaceMuted, borderRadius: 3, height: 6, overflow: 'hidden' },
    fill: { backgroundColor: colors.textPrimary, height: '100%' },
    stepRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
    stepNumber: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
    stepNumberText: { ...a.p12, color: colors.textPrimary },
    step: { color: colors.textPrimary, flex: 1, fontSize: 14, lineHeight: 22 },
    notice: { backgroundColor: colors.warningLight, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
    noticeText: { ...a.p12, color: colors.textPrimary },
    button: { ...a.go, marginTop: 4 },
    buttonText: a.goText,
    disabled: { ...a.goOff, },
    disabledText: { color: colors.textDisabled },
    outline: { alignItems: 'center', height: 44, justifyContent: 'center' },
    outlineText: a.link,
    success: { ...a.p12, color: colors.success },
    error: { ...a.p12, color: colors.danger },
  } as const;
}
