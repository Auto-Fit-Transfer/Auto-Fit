import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { claimCommunityChallenge, getCommunityChallenges, getCommunityErrorMessage, isProvisionalNote, setCommunityChallengeParticipation, type CommunityChallenge } from '@/src/api/community';
import { fontFamilies } from '@/src/theme';

const purple = '#503DD7';
const metricLabel: Record<CommunityChallenge['metric'], string> = {
  workout_days: '운동한 날', meal_log_days: '식단 기록한 날',
};
const phaseLabel: Record<CommunityChallenge['phase'], string> = {
  ongoing: '진행 중', upcoming: '예정', ended: '종료',
};
const dateLabel = (value: string) => {
  const parts = value.split('-').map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? `${parts[1]}.${parts[2]}` : value;
};

export default function ChallengeDetail() {
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
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 }]}>
      <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()}><Text style={s.back}>‹</Text></Pressable><Text style={s.title}>챌린지</Text><View style={{ width: 24 }} /></View>
      {loading ? <ActivityIndicator color={purple} /> : null}
      {error && !challenge ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }} style={s.card}><Text style={s.error}>{error} · 다시 시도</Text></Pressable> : null}
      {challenge ? <>
        <Text style={s.phase}>{phaseLabel[challenge.phase]}{challenge.phase === 'ongoing' ? ` · ${dateLabel(challenge.ends_on)}까지` : ''}</Text>
        <Text style={s.hero}>{challenge.title}</Text>
        {challenge.description ? <Text style={s.body}>{challenge.description}</Text> : null}
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statLabel}>기간</Text><Text style={s.statValue}>{dateLabel(challenge.starts_on)}~{dateLabel(challenge.ends_on)}</Text></View>
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
        <View style={s.card}><Text style={s.section}>이렇게 진행돼요</Text><Text style={s.step}>1  기간 안에 {metricLabel[challenge.metric]}을 기록해요.</Text><Text style={s.step}>2  {challenge.goal}일 목표를 채우면 완료 상태가 돼요.</Text><Text style={s.step}>3  보상을 받을 수 있을 때 신청해요.</Text></View>
        {notice ? <Text style={s.success}>{notice}</Text> : null}{error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={actionDisabled} onPress={action} style={[s.button, actionDisabled && s.disabled]}><Text style={s.buttonText}>{busy ? '처리 중…' : actionText}</Text></Pressable>
        {challenge.joined && challenge.phase !== 'ended' && !challenge.completed ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void act(() => setCommunityChallengeParticipation(challenge.challenge_id, false), '챌린지 참여를 취소했어요.')} style={s.outline}><Text style={s.outlineText}>참여 취소</Text></Pressable> : null}
      </> : null}
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' }, content: { paddingHorizontal: 20, gap: 17 },
  header: { height: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, back: { fontSize: 32, lineHeight: 36, color: '#1E1D24' }, title: { color: '#1E1D24', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  phase: { alignSelf: 'flex-start', color: '#24835E', backgroundColor: '#E8F6EF', borderRadius: 7, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6, fontSize: 11, marginTop: 10 },
  hero: { color: '#1E1D24', fontSize: 24, fontFamily: fontFamilies.pretendardBold }, body: { color: '#55545F', fontSize: 13, lineHeight: 20 }, caption: { color: '#777681', fontSize: 11, lineHeight: 16 },
  stats: { flexDirection: 'row', gap: 8 }, stat: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 10, padding: 11, gap: 6 }, statLabel: { color: '#777681', fontSize: 11 }, statValue: { color: '#1E1D24', fontSize: 14, fontFamily: fontFamilies.pretendardBold },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 14, padding: 16, gap: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between' }, section: { color: '#1E1D24', fontSize: 15, fontFamily: fontFamilies.pretendardBold }, progressValue: { color: purple, fontSize: 14, fontFamily: fontFamilies.pretendardBold },
  track: { height: 7, borderRadius: 5, backgroundColor: '#ECECF0', overflow: 'hidden' }, fill: { height: 7, backgroundColor: purple }, step: { color: '#55545F', fontSize: 12, lineHeight: 18 }, notice: { backgroundColor: '#FFF4E2', borderRadius: 9, padding: 12 }, noticeText: { color: '#8E641C', fontSize: 12 },
  button: { height: 50, backgroundColor: purple, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFF', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, disabled: { opacity: 0.5 }, outline: { height: 46, alignItems: 'center', justifyContent: 'center' }, outlineText: { color: '#777681', fontSize: 12 }, success: { color: '#24835E', fontSize: 12 }, error: { color: '#A13A2F', fontSize: 12, lineHeight: 18 },
});
