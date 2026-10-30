import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import UserIcon from '@/assets/icons/input/User.svg';
import TargetIcon from '@/assets/icons/deco/Target.svg';
import LeafIcon from '@/assets/icons/deco/Leaf.svg';
import BarbellIcon from '@/assets/icons/deco/Barbell.svg';
import BellIcon from '@/assets/icons/system/Bell.svg';
import GearIcon from '@/assets/icons/system/GearSix.svg';
import ChatIcon from '@/assets/icons/deco/ChatCircle.svg';
import SignOutIcon from '@/assets/icons/system/SignOut.svg';
import { getCommunityMileage, getCommunityProfile, type CommunityProfile } from '@/src/api/community';
import { getProfile, getProfileName } from '@/src/api/home';
import { getSupabaseClient } from '@/src/lib/supabase';
import { HealthGoalSheet } from '@/src/components/my/HealthGoalSheet';
import { AllergySettingsSheet } from '@/src/components/my/AllergySettingsSheet';
import { WeeklyWorkoutCard } from '@/src/components/my/WeeklyWorkoutCard';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies } from '@/src/theme';

type SettingRowProps = {
  icon: ReactNode;
  label: string;
  description?: string;
  onPress: () => void;
  isDark?: boolean;
};

function SettingRow({ icon, label, description, onPress, isDark }: SettingRowProps) {
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.settingRow, simple && simpleStyles.settingRow]}>
      <View style={styles.settingIcon}>{icon}</View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingLabel, isDark && dark.text, simple && simpleStyles.settingLabel]}>{label}</Text>
        {description ? <Text style={[styles.settingDescription, isDark && dark.secondary, simple && simpleStyles.settingDescription]}>{description}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function MyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark, preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const [name, setName] = useState('회원');
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [mileage, setMileage] = useState<number | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [healthGoalVisible, setHealthGoalVisible] = useState(false);
  const [allergySettingsVisible, setAllergySettingsVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setProfileError(false);
      void getProfile()
        .then((response) => {
          if (active) setName(getProfileName(response) ?? '회원');
        })
        .catch(() => {
          if (active) setProfileError(true);
        });
      void getCommunityProfile('me').then(
        (result) => {
          if (active) setProfile(result);
        },
        () => {
          if (active) setProfile(null);
        },
      );
      void getCommunityMileage().then(
        (result) => {
          if (active) setMileage(result.balance);
        },
        () => {
          if (active) setMileage(null);
        },
      );
      return () => {
        active = false;
      };
    }, []),
  );

  const openCommunityProfile = () =>
    router.push({ pathname: '/community/user/[userId]', params: { userId: 'me' } });
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      router.replace('/login');
    } catch {
      setSigningOut(false);
      setSignOutError(true);
    }
  };

  return (
    <>
    <ScrollView
      contentContainerStyle={[styles.content, simple && simpleStyles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 116 }]}
      style={[styles.root, isDark && dark.root]}
    >
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[styles.title, isDark && dark.text, simple && simpleStyles.title]}>마이</Text>
        <SimpleReadButton label="마이 화면 읽어 주기" text={`${name}님의 마이페이지입니다. 마일리지 ${mileage ?? 0}점. 건강 데이터를 올리고 건강 리포트를 볼 수 있어요. 운동 추천과 화면 설정을 확인할 수 있어요.`} />
      </View>

      <View style={styles.profileRow}>
        <View style={[styles.avatar, isDark && dark.card]}><UserIcon color={isDark ? '#F5F5F7' : '#62626B'} height={24} width={24} /></View>
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={[styles.name, isDark && dark.text, simple && simpleStyles.name]}>{name}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/tier')}>
            <Text style={styles.tierLink}>건강 티어 확인 ›</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={[styles.profileEdit, isDark && dark.card, simple && simpleStyles.profileEdit]}>
          <Text style={[styles.profileEditText, isDark && dark.text, simple && simpleStyles.profileEditText]}>프로필 수정</Text>
        </Pressable>
      </View>

      {profileError ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>프로필을 불러오지 못했어요. 다시 확인하기 ›</Text>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" onPress={openCommunityProfile} style={[styles.stats, isDark && dark.card, simple && simpleStyles.stats]}>
        <View style={styles.stat}><Text style={[styles.statValue, isDark && dark.text]}>{profile?.post_count ?? '–'}</Text><Text style={[styles.statLabel, isDark && dark.secondary]}>글</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><Text style={[styles.statValue, isDark && dark.text]}>{profile?.follower_count ?? '–'}</Text><Text style={[styles.statLabel, isDark && dark.secondary]}>팔로워</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><Text style={[styles.statValue, isDark && dark.text]}>{profile?.following_count ?? '–'}</Text><Text style={[styles.statLabel, isDark && dark.secondary]}>팔로잉</Text></View>
      </Pressable>

      <Pressable
        accessibilityLabel={`마일리지 ${mileage === null ? '확인하기' : `${mileage.toLocaleString()}P`}`}
        accessibilityRole="button"
        onPress={() => router.push('/community/mileage')}
        style={[styles.mileage, isDark && dark.card, simple && simpleStyles.mileage]}
      >
        <Text style={[styles.mileageLabel, isDark && dark.secondary, simple && simpleStyles.mileageText]}>마일리지</Text>
        <Text style={[styles.mileageAmount, isDark && dark.text, simple && simpleStyles.mileageText]}>{mileage === null ? '확인하기' : `${mileage.toLocaleString()}P`}  ›</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, isDark && dark.text, simple && simpleStyles.sectionTitle]}>내 건강</Text>
      <View style={[styles.healthCards, simple && simpleStyles.healthCards]}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/health-data-management')} style={[styles.healthCard, isDark && dark.card, simple && simpleStyles.healthCard]}>
          <Text style={styles.healthIcon}>↥</Text>
          <Text style={[styles.healthCardTitle, isDark && dark.text, simple && simpleStyles.healthCardTitle]}>건강 데이터 올리기</Text>
          <Text style={[styles.healthCardDescription, isDark && dark.secondary, simple && simpleStyles.healthCardDescription]}>새 검진표 · 체성분 기록</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/health-report')} style={[styles.healthCard, isDark && dark.card, simple && simpleStyles.healthCard]}>
          <Text style={styles.healthIcon}>▤</Text>
          <Text style={[styles.healthCardTitle, isDark && dark.text, simple && simpleStyles.healthCardTitle]}>건강 리포트</Text>
          <Text style={[styles.healthCardDescription, isDark && dark.secondary, simple && simpleStyles.healthCardDescription]}>검진 · 인바디 내역</Text>
        </Pressable>
      </View>

      <WeeklyWorkoutCard />

      <Text style={[styles.sectionTitle, isDark && dark.text, simple && simpleStyles.sectionTitle]}>운동 추천</Text>
      <View style={[styles.group, isDark && dark.card]}>
        <SettingRow isDark={isDark} icon={<TargetIcon color={isDark ? '#F5F5F7' : '#55555E'} height={20} width={20} />} label="건강 목표 설정" description="나의 건강 목표와 한 줄 설명" onPress={() => setHealthGoalVisible(true)} />
        <View style={styles.rowDivider} />
        <SettingRow isDark={isDark} icon={<LeafIcon color={isDark ? '#F5F5F7' : '#55555E'} height={20} width={20} />} label="식단 기록" description="오늘의 식사 확인하기" onPress={() => router.push('/diet')} />
        <View style={styles.rowDivider} />
        <SettingRow isDark={isDark} icon={<LeafIcon color={isDark ? '#F5F5F7' : '#55555E'} height={20} width={20} />} label="식단 설정" description="알레르기 음식 관리" onPress={() => setAllergySettingsVisible(true)} />
        <View style={styles.rowDivider} />
        <SettingRow isDark={isDark} icon={<BarbellIcon color={isDark ? '#F5F5F7' : '#55555E'} height={20} width={20} />} label="운동 설정" description="운동 빈도와 선호 운동" onPress={() => router.push('/exercise/goal')} />
      </View>

      <Text style={[styles.sectionTitle, isDark && dark.text, simple && simpleStyles.sectionTitle]}>설정 · 도움</Text>
      {signOutError ? <Text style={styles.inlineErrorText}>로그아웃하지 못했어요. 다시 시도해 주세요.</Text> : null}
      <View style={[styles.group, isDark && dark.card]}>
        <SettingRow isDark={isDark} icon={<UserIcon color={isDark ? '#F5F5F7' : '#55555E'} height={20} width={20} />} label="계정 설정" onPress={() => router.push('/account')} />
        <View style={styles.rowDivider} />
        <SettingRow isDark={isDark} icon={<BellIcon color={isDark ? '#F5F5F7' : '#55555E'} height={20} width={20} />} label="알림 설정" onPress={() => router.push('/notifications')} />
        <View style={styles.rowDivider} />
        <SettingRow isDark={isDark} icon={<GearIcon color={isDark ? '#F5F5F7' : '#55555E'} height={20} width={20} />} label="화면 설정" description="화면 모드 · 글자 크기" onPress={() => router.push('/display-settings')} />
        <View style={styles.rowDivider} />
        <SettingRow isDark={isDark} icon={<ChatIcon color={isDark ? '#F5F5F7' : '#55555E'} height={20} width={20} />} label="커뮤니티 활동" description="내 글 · 댓글 · 좋아요" onPress={() => router.push('/community/activity')} />
        <View style={styles.rowDivider} />
        <SettingRow isDark={isDark} icon={<SignOutIcon color={isDark ? '#F5F5F7' : '#55555E'} height={20} width={20} />} label={signingOut ? '로그아웃 중…' : '로그아웃'} onPress={() => void signOut()} />
      </View>
    </ScrollView>
    {healthGoalVisible ? <HealthGoalSheet visible onClose={() => setHealthGoalVisible(false)} /> : null}
    {allergySettingsVisible ? <AllergySettingsSheet visible onClose={() => setAllergySettingsVisible(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#FFFFFF', flex: 1 },
  content: { gap: 14, paddingHorizontal: 20 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: '#222227', fontFamily: fontFamilies.pretendardBold, fontSize: 24, marginBottom: 4 },
  profileRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  avatar: { alignItems: 'center', backgroundColor: '#F6F6FA', borderColor: '#E8E8EE', borderRadius: 25, borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  profileCopy: { flex: 1, gap: 3, minWidth: 0 },
  name: { color: '#222227', fontFamily: fontFamilies.pretendardBold, fontSize: 17 },
  tierLink: { color: '#503DD7', fontFamily: fontFamilies.pretendardMedium, fontSize: 11 },
  profileEdit: { borderColor: '#E6E6ED', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  profileEditText: { color: '#45454B', fontFamily: fontFamilies.pretendardMedium, fontSize: 11 },
  inlineError: { backgroundColor: '#FFF4F4', borderRadius: 8, padding: 10 },
  inlineErrorText: { color: '#B34141', fontSize: 12 },
  stats: { alignItems: 'center', borderColor: '#E6E6ED', borderRadius: 12, borderWidth: 1, flexDirection: 'row', height: 66 },
  stat: { alignItems: 'center', flex: 1, gap: 4 },
  statValue: { color: '#222227', fontFamily: fontFamilies.pretendardBold, fontSize: 15 },
  statLabel: { color: '#8A8A92', fontFamily: fontFamilies.pretendardRegular, fontSize: 11 },
  statDivider: { backgroundColor: '#ECECF1', height: 28, width: 1 },
  mileage: { alignItems: 'center', borderColor: '#E6E6ED', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 16 },
  mileageLabel: { color: '#45454B', fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
  mileageAmount: { color: '#222227', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  sectionTitle: { color: '#222227', fontFamily: fontFamilies.pretendardBold, fontSize: 16, marginTop: 4 },
  healthCards: { flexDirection: 'row', gap: 8 },
  healthCard: { borderColor: '#E6E6ED', borderRadius: 12, borderWidth: 1, flex: 1, minHeight: 100, padding: 13 },
  healthIcon: { color: '#5B4ACF', fontSize: 21, lineHeight: 26 },
  healthCardTitle: { color: '#222227', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13, marginTop: 8 },
  healthCardDescription: { color: '#888891', fontFamily: fontFamilies.pretendardRegular, fontSize: 10, marginTop: 3 },
  group: { borderColor: '#E6E6ED', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  settingRow: { alignItems: 'center', flexDirection: 'row', minHeight: 57, paddingHorizontal: 13, paddingVertical: 8 },
  settingIcon: { alignItems: 'center', justifyContent: 'center', width: 28 },
  settingCopy: { flex: 1, gap: 3, marginLeft: 9 },
  settingLabel: { color: '#333339', fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
  settingDescription: { color: '#8A8A92', fontFamily: fontFamilies.pretendardRegular, fontSize: 10 },
  chevron: { color: '#9B9BA3', fontSize: 24 },
  rowDivider: { backgroundColor: '#EFEFF2', height: StyleSheet.hairlineWidth, marginLeft: 50 },
});

const simpleStyles = StyleSheet.create({
  content: { gap: 20 },
  title: { fontSize: 30 },
  name: { fontSize: 21 },
  profileEdit: { justifyContent: 'center', minHeight: 48 },
  profileEditText: { fontSize: 14 },
  stats: { height: 82 },
  mileage: { minHeight: 64 },
  mileageText: { fontSize: 17 },
  sectionTitle: { fontSize: 20 },
  healthCards: { flexDirection: 'column' },
  healthCard: { flex: 0, minHeight: 96 },
  healthCardTitle: { fontSize: 17 },
  healthCardDescription: { fontSize: 13 },
  settingRow: { minHeight: 75, paddingVertical: 12 },
  settingLabel: { fontSize: 17 },
  settingDescription: { fontSize: 13, lineHeight: 18 },
});

const dark = StyleSheet.create({
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
  secondary: { color: darkColors.textSecondary },
});
