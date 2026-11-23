import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { getAllergies } from '@/src/api/allergies';
import { getCommunityProfile, type CommunityProfile } from '@/src/api/community';
import { getProfile, getProfileName } from '@/src/api/home';
import { getHabitTierProgress } from '@/src/api/tier';
import { getActiveHealthGoal, getNotificationPreferences, type HealthGoal } from '@/src/api/userSettings';
import { getAllHealthDocuments } from '@/src/api/healthDocuments';
import { MeView } from '@/src/components/b/MeView';
import { AllergySettingsSheet } from '@/src/components/my/AllergySettingsSheet';
import { goals as healthGoals, HealthGoalSheet } from '@/src/components/my/HealthGoalSheet';
import { useSteps } from '@/src/features/a/useSteps';
import { loadChatCharacter, type ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { tierLook, type TierLook } from '@/src/features/tier/tierLook';
import { getSupabaseClient } from '@/src/lib/supabase';

const FONT_NAMES = ['가장 작게', '작게', '기본', '크게', '가장 크게'];

// Renewal B's 내 정보 (src/components/b/MeView.tsx, b-me.html): what the app knows (goal, foods, papers) on the black
// card, then the list with 프로필 first. Same data as renewal A's 내 정보 (a-me.html).
// Left out on purpose, as decided with the design: short cuts to the report and the exercise settings (one
// tap from home), signing out (it is in 계정), and the community's own numbers (글 · 팔로워, 마일리지, the
// people I blocked: one line leads to my community profile, which opens them all).
export default function MyScreen() {
  const router = useRouter();
  const { preferences } = useDisplayPreferences();
  const walk = useSteps();
  const [characterId, setCharacterId] = useState<ChatCharacterId>('quni');
  const [docs, setDocs] = useState<number | null>(null);
  const [name, setName] = useState('회원');
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [tier, setTier] = useState<TierLook | null>(null);
  const [goal, setGoal] = useState<HealthGoal | null | undefined>(undefined); // undefined = not read yet
  const [allergies, setAllergies] = useState<string[] | null>(null);
  const [noticesOn, setNoticesOn] = useState<number | null>(null);
  const [mail, setMail] = useState('');
  const [days, setDays] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<'goal' | 'allergy' | null>(null);

  const loadGoal = useCallback(() => {
    void getActiveHealthGoal().then(({ goal: active }) => setGoal(active), () => undefined);
  }, []);
  const loadAllergies = useCallback(() => {
    void getAllergies().then(
      ({ catalog, selected }) =>
        setAllergies(selected.flatMap((item) => item.custom_name ?? catalog.find((kind) => kind.allergy_type_id === item.allergy_type_id)?.name ?? [])),
      () => undefined,
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const keep = <T,>(set: (value: T) => void) => (value: T) => {
        if (active) set(value);
      };
      setFailed(false);
      loadGoal();
      loadAllergies();
      // the face on the black card is the character chosen in 물어보기
      void loadChatCharacter().then(keep((character: { id: ChatCharacterId }) => setCharacterId(character.id)), () => undefined);
      void getAllHealthDocuments({ status: 'confirmed' }).then(keep((items: unknown[]) => setDocs(items.length)), () => undefined);
      void getProfile().then(keep((response) => setName(getProfileName(response) ?? '회원')), keep(() => setFailed(true)));
      void getCommunityProfile('me').then(keep(setProfile), () => undefined);
      void getHabitTierProgress().then(keep(({ progress }) => setTier(tierLook(progress))), () => undefined);
      void getNotificationPreferences().then(
        keep(({ preferences: kinds }) =>
          setNoticesOn([kinds.diet_enabled, kinds.exercise_enabled, kinds.health_report_enabled, kinds.community_enabled].filter(Boolean).length),
        ),
        () => undefined,
      );
      void getSupabaseClient().auth.getSession().then(
        keep(({ data }) => {
          const user = data.session?.user;
          setMail(user?.email ?? '');
          if (user?.created_at) setDays(Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000) + 1);
        }),
        () => undefined,
      );
      return () => {
        active = false;
      };
    }, [loadAllergies, loadGoal]),
  );

  const goalLabel = goal === undefined
    ? ''
    : (goal?.goal_type === 'other' && goal.goal_text ? goal.goal_text : healthGoals.find((item) => item.key === goal?.goal_type)?.label) ?? '아직 정하지 않았어요';
  const allergyLabel = allergies === null
    ? ''
    : allergies.length > 2 ? `${allergies[0]} 외 ${allergies.length - 1}가지` : allergies.join(' · ') || '없어요';

  const foodLine = allergies === null ? null : allergies.length ? `${allergyLabel} 빼고 식단을 짜요` : '가리는 음식 없이 식단을 짜요';

  return (
    <>
      <StatusBar style="dark" />
      <MeView
        characterId={characterId}
        days={days}
        know={[
          { key: 'goal', done: goal ? `${goalLabel} 목표로 맞추고 있어요` : null, missing: goal === undefined ? '목표를 확인하고 있어요' : '목표를 아직 몰라요', action: goal ? '고치기' : '알려 주기', onPress: () => setSheet('goal') },
          { key: 'food', done: foodLine, missing: '못 먹는 음식을 확인하고 있어요', action: '고치기', onPress: () => setSheet('allergy') },
          docs === null
            ? { key: 'docs', done: null, missing: '건강 서류를 확인하고 있어요', action: '보기', onPress: () => router.push('/health-data-management') }
            : docs > 0
              ? { key: 'docs', done: `건강 서류 ${docs}개를 보고 맞추고 있어요`, missing: '', action: '보기', onPress: () => router.push('/health-data-management') }
              : { key: 'docs', done: null, missing: '인바디 · 검진표가 아직 없어요', action: '올리기', onPress: () => router.push('/upload') },
        ]}
        name={profile?.nickname || name}
        notice={failed ? '프로필을 불러오지 못했어요' : null}
        onTier={() => router.push('/tier')}
        rows={[
          { key: 'profile', label: '프로필', onPress: () => router.push('/profile') },
          {
            key: 'community',
            label: '커뮤니티 활동',
            value: profile ? `글 ${profile.post_count.toLocaleString('ko-KR')} · 팔로워 ${profile.follower_count.toLocaleString('ko-KR')}` : '',
            onPress: () => router.push({ pathname: '/community/user/[userId]', params: { userId: 'me' } }),
          },
          { key: 'notice', label: '알림', value: noticesOn === null ? '' : noticesOn ? `${noticesOn}가지 켜짐` : '모두 꺼짐', onPress: () => router.push('/notifications') },
          { key: 'font', label: '글자 크기', value: FONT_NAMES[preferences.font_size_step - 1] ?? '', onPress: () => router.push('/display-settings') },
          { key: 'account', label: '계정', value: mail, onPress: () => router.push('/account') },
        ]}
        steps={
          walk.state === 'checking' || walk.state === 'unavailable'
            ? null
            : { on: walk.state === 'on', onToggle: () => (walk.state === 'on' ? walk.turnOff() : void walk.turnOn()) }
        }
        tier={tier}
      />
      {sheet === 'goal' ? (
        <HealthGoalSheet
          onClose={() => {
            setSheet(null);
            loadGoal();
          }}
          visible
        />
      ) : null}
      {sheet === 'allergy' ? (
        <AllergySettingsSheet
          onClose={() => {
            setSheet(null);
            loadAllergies();
          }}
          visible
        />
      ) : null}
    </>
  );
}
