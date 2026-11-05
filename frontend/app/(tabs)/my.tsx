import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaretText } from '@/src/components/common/CaretText';
import MoonIcon from '@/assets/icons/day/Moon.svg';
import SignOutIcon from '@/assets/icons/system/SignOut.svg';
import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import BellIcon from '@/assets/icons/ui/bell.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import ChartIcon from '@/assets/icons/ui/chart-line-up.svg';
import ChatsIcon from '@/assets/icons/ui/chats-circle.svg';
import ForkKnifeIcon from '@/assets/icons/ui/fork-knife.svg';
import LockIcon from '@/assets/icons/ui/lock.svg';
import ShieldIcon from '@/assets/icons/ui/shield-check.svg';
import TargetIcon from '@/assets/icons/ui/target.svg';
import UploadIcon from '@/assets/icons/ui/upload-simple.svg';
import UserIcon from '@/assets/icons/ui/user.svg';
import { getCommunityMileage, getCommunityProfile, type CommunityProfile } from '@/src/api/community';
import { getProfile, getProfileName } from '@/src/api/home';
import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import { getActiveHealthGoal, type HealthGoal } from '@/src/api/userSettings';
import { getSupabaseClient } from '@/src/lib/supabase';
import { goals as healthGoals, HealthGoalSheet } from '@/src/components/my/HealthGoalSheet';
import { AllergySettingsSheet } from '@/src/components/my/AllergySettingsSheet';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { tierBadges } from '@/src/features/tier/tierBadges';
import { darkColors, fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

// Only FIT and ACTIVE have tinted pills in Figma; the other tiers stay neutral beside their badge.
const tierPills: Partial<Record<HabitTierProgress['tier_code'], { backgroundColor: string; color: string }>> = {
  ACTIVE: { backgroundColor: '#FCEFE5', color: '#94481A' },
  FIT: { backgroundColor: '#ECE9FF', color: '#3A2DB5' },
};

type SettingRowProps = {
  Icon: typeof TargetIcon;
  label: string;
  description?: string;
  onPress: () => void;
};

function SettingRow({ Icon, label, description, onPress }: SettingRowProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  return (
    <Pressable hitSlop={16} accessibilityRole="button" onPress={onPress} style={[styles.settingRow, simple && simpleStyles.settingRow]}>
      <View style={[styles.settingIcon, isDark && dark.card]}><Icon color={isDark ? darkColors.textPrimary : colors.textPrimary} height={22} width={22} /></View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingLabel, isDark && dark.text, simple && simpleStyles.settingLabel]}>{label}</Text>
        {description ? <Text style={[styles.settingDescription, isDark && dark.secondary, simple && simpleStyles.settingDescription]}>{description}</Text> : null}
      </View>
      <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
    </Pressable>
  );
}

export default function MyScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark, preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const [name, setName] = useState('회원');
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [mileage, setMileage] = useState<number | null>(null);
  const [tier, setTier] = useState<HabitTierProgress | null>(null);
  const [goal, setGoal] = useState<HealthGoal | null>(null);
  const [joinedDays, setJoinedDays] = useState<number | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [healthGoalVisible, setHealthGoalVisible] = useState(false);
  const [allergySettingsVisible, setAllergySettingsVisible] = useState(false);

  const loadGoal = useCallback(() => {
    void getActiveHealthGoal().then(({ goal: active }) => setGoal(active), () => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setProfileError(false);
      loadGoal();
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
      void getHabitTierProgress().then(
        ({ progress }) => {
          if (active) setTier(progress);
        },
        () => undefined,
      );
      void getSupabaseClient().auth.getSession().then(
        ({ data }) => {
          const created = data.session?.user.created_at;
          if (active && created) setJoinedDays(Math.floor((Date.now() - new Date(created).getTime()) / 86400000) + 1);
        },
        () => undefined,
      );
      return () => {
        active = false;
      };
    }, [loadGoal]),
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
  const Badge = tier ? tierBadges[tier.tier_code] : null;
  const pill = tier ? tierPills[tier.tier_code] : undefined;
  const goalLabel = goal?.goal_type === 'other' && goal.goal_text
    ? goal.goal_text
    : healthGoals.find((item) => item.key === goal?.goal_type)?.label;

  return (
    <>
    <ScrollView
      contentContainerStyle={[styles.content, simple && simpleStyles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 116 }]}
      style={[styles.root, isDark && dark.root]}
    >
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[styles.title, isDark && dark.text, simple && simpleStyles.title]}>마이</Text>
        <SimpleReadButton label="마이 화면 읽어 주기" text={`${name}님의 마이페이지입니다. 마일리지 ${mileage ?? 0}점. 건강 데이터를 올리고 건강 리포트를 볼 수 있어요. 운동 추천과 화면 설정을 확인할 수 있어요.`} />
      </View>

      <View style={styles.profileRow}>
        <View style={[styles.avatar, isDark && dark.card]}><UserIcon color={isDark ? darkColors.textPrimary : colors.textPrimary} height={26} width={26} /></View>
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={[styles.name, isDark && dark.text, simple && simpleStyles.name]}>{name}</Text>
          <View style={styles.profileMeta}>
            {tier && Badge ? (
              <Pressable accessibilityLabel={`내 티어 ${tier.tier_name} ${tier.sublevel}`} accessibilityRole="button" hitSlop={10} onPress={() => router.push('/tier')} style={[styles.tierPill, pill && { backgroundColor: pill.backgroundColor }]}>
                <Badge height={16} width={16} />
                <Text style={[styles.tierPillText, pill && { color: pill.color }]}>{tier.tier_name} {tier.sublevel}</Text>
              </Pressable>
            ) : null}
            {joinedDays ? <Text style={[styles.muted, isDark && dark.secondary]}>함께한 지 {joinedDays}일</Text> : null}
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={[styles.profileEdit, isDark && dark.card, simple && simpleStyles.profileEdit]}>
          <Text style={[styles.profileEditText, isDark && dark.text, simple && simpleStyles.profileEditText]}>프로필 수정</Text>
        </Pressable>
      </View>

      {profileError ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={styles.inlineError}>
          <CaretText style={styles.inlineErrorText}>프로필을 불러오지 못했어요. 다시 확인하기</CaretText>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" onPress={openCommunityProfile} style={[styles.stats, isDark && dark.card, simple && simpleStyles.stats]}>
        <View style={styles.stat}><Text style={[styles.statValue, isDark && dark.text]}>{profile?.post_count ?? '–'}</Text><Text style={[styles.muted, isDark && dark.secondary]}>글</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><Text style={[styles.statValue, isDark && dark.text]}>{profile?.follower_count ?? '–'}</Text><Text style={[styles.muted, isDark && dark.secondary]}>팔로워</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><Text style={[styles.statValue, isDark && dark.text]}>{profile?.following_count ?? '–'}</Text><Text style={[styles.muted, isDark && dark.secondary]}>팔로잉</Text></View>
      </Pressable>

      <Pressable
        accessibilityLabel={`마일리지 ${mileage === null ? '확인하기' : `${mileage.toLocaleString()}P`}`}
        accessibilityRole="button"
        onPress={() => router.push('/community/mileage')}
        style={[styles.mileage, isDark && dark.card, simple && simpleStyles.mileage]}
      >
        <Text style={[styles.mileageLabel, isDark && dark.text, simple && simpleStyles.mileageText]}>마일리지</Text>
        <View style={styles.mileageRight}>
          <Text style={[styles.mileageAmount, isDark && dark.text, simple && simpleStyles.mileageText]}>{mileage === null ? '확인하기' : `${mileage.toLocaleString()}P`}</Text>
          <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
        </View>
      </Pressable>

      <Text style={[styles.sectionTitle, isDark && dark.secondary, simple && simpleStyles.sectionTitle]}>내 건강</Text>
      <View style={[styles.healthCards, simple && simpleStyles.healthCards]}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/health-data-management')} style={[styles.healthCard, isDark && dark.card, simple && simpleStyles.healthCard]}>
          <View style={[styles.settingIcon, isDark && dark.card]}><UploadIcon color={isDark ? darkColors.textPrimary : colors.textPrimary} height={22} width={22} /></View>
          <Text style={[styles.healthCardTitle, isDark && dark.text, simple && simpleStyles.healthCardTitle]}>건강 데이터 올리기</Text>
          <Text style={[styles.healthCardDescription, isDark && dark.secondary, simple && simpleStyles.healthCardDescription]}>새 검진표 · 체성분 결과</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/health-report')} style={[styles.healthCard, isDark && dark.card, simple && simpleStyles.healthCard]}>
          <View style={[styles.settingIcon, isDark && dark.card]}><ChartIcon color={isDark ? darkColors.textPrimary : colors.textPrimary} height={22} width={22} /></View>
          <Text style={[styles.healthCardTitle, isDark && dark.text, simple && simpleStyles.healthCardTitle]}>건강 리포트</Text>
          <Text style={[styles.healthCardDescription, isDark && dark.secondary, simple && simpleStyles.healthCardDescription]}>검진 · 인바디 변화</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, isDark && dark.secondary, simple && simpleStyles.sectionTitle]}>맞춤 추천</Text>
      <View style={[styles.group, isDark && dark.card]}>
        <SettingRow Icon={TargetIcon} label="건강 목표 설정" description={goalLabel ? `지금 목표: ${goalLabel}` : '아직 정하지 않았어요'} onPress={() => setHealthGoalVisible(true)} />
        <View style={[styles.rowDivider, isDark && dark.divider]} />
        <SettingRow Icon={ForkKnifeIcon} label="식단 설정" description="알레르기" onPress={() => setAllergySettingsVisible(true)} />
        <View style={[styles.rowDivider, isDark && dark.divider]} />
        <SettingRow Icon={BarbellIcon} label="운동 설정" description="오늘의 운동 설정으로 이동" onPress={() => router.push('/exercise/condition')} />
      </View>

      <Text style={[styles.sectionTitle, isDark && dark.secondary, simple && simpleStyles.sectionTitle]}>설정 · 활동</Text>
      {signOutError ? <Text style={styles.inlineErrorText}>로그아웃하지 못했어요. 다시 시도해 주세요.</Text> : null}
      <View style={[styles.group, isDark && dark.card]}>
        <SettingRow Icon={LockIcon} label="계정 설정" onPress={() => router.push('/account')} />
        <View style={[styles.rowDivider, isDark && dark.divider]} />
        <SettingRow Icon={BellIcon} label="알림 설정" onPress={() => router.push('/notifications')} />
        <View style={[styles.rowDivider, isDark && dark.divider]} />
        <SettingRow Icon={MoonIcon} label="화면 설정" description="다크 모드 · 글자 크기 · 간편 모드" onPress={() => router.push('/display-settings')} />
        <View style={[styles.rowDivider, isDark && dark.divider]} />
        <SettingRow Icon={ChatsIcon} label="커뮤니티 활동" description="쓴 글 · 댓글 · 좋아요 · 스크랩" onPress={() => router.push('/community/activity')} />
        <View style={[styles.rowDivider, isDark && dark.divider]} />
        <SettingRow Icon={ShieldIcon} label="차단한 사용자" onPress={() => router.push('/community/blocks')} />
        <View style={[styles.rowDivider, isDark && dark.divider]} />
        <SettingRow Icon={SignOutIcon} label={signingOut ? '로그아웃 중…' : '로그아웃'} onPress={() => void signOut()} />
      </View>
    </ScrollView>
    {healthGoalVisible ? <HealthGoalSheet visible onClose={() => { setHealthGoalVisible(false); loadGoal(); }} /> : null}
    {allergySettingsVisible ? <AllergySettingsSheet visible onClose={() => setAllergySettingsVisible(false)} /> : null}
    </>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 14, paddingHorizontal: 20 },
    titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30 },
    profileRow: { alignItems: 'center', flexDirection: 'row', gap: 14 },
    avatar: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
    profileCopy: { flex: 1, gap: 2, minWidth: 0 },
    name: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
    profileMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tierPill: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 999, flexDirection: 'row', gap: 4, height: 22, paddingLeft: 4, paddingRight: 8 },
    tierPillText: { color: colors.textBody, fontFamily: fontFamilies.pretendardBold, fontSize: 12 },
    muted: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    profileEdit: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 12 },
    profileEditText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    inlineError: { backgroundColor: colors.dangerLight, borderRadius: 8, padding: 10 },
    inlineErrorText: { color: colors.danger, fontSize: 14 },
    stats: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', minHeight: 74 },
    stat: { alignItems: 'center', flex: 1, gap: 2 },
    statValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
    statDivider: { backgroundColor: colors.border, height: 28, width: 1 },
    mileage: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 18 },
    mileageRight: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    mileageLabel: { color: colors.textPrimary, fontSize: 16 },
    mileageAmount: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    sectionTitle: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21, marginTop: 4 },
    healthCards: { flexDirection: 'row', gap: 10 },
    healthCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, minHeight: 131, padding: 16 },
    healthCardTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24, marginTop: 10 },
    healthCardDescription: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 2 },
    group: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    settingRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8 },
    settingIcon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
    settingCopy: { flex: 1, gap: 2 },
    settingLabel: { color: colors.textPrimary, fontSize: 16, lineHeight: 24 },
    settingDescription: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    rowDivider: { backgroundColor: colors.border, height: 1 },
  } as const;
}

const simpleStyles = StyleSheet.create({
  content: { gap: 20 },
  title: {},
  name: {},
  profileEdit: { justifyContent: 'center', minHeight: 48 },
  profileEditText: {},
  stats: { height: 82 },
  mileage: { minHeight: 64 },
  mileageText: {},
  sectionTitle: {},
  healthCards: { flexDirection: 'column' },
  healthCard: { flexBasis: 'auto', flexGrow: 0, flexShrink: 0, minHeight: 96 },
  healthCardTitle: {},
  healthCardDescription: {},
  settingRow: { minHeight: 75, paddingVertical: 12 },
  settingLabel: {},
  settingDescription: {},
});

const dark = StyleSheet.create({
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
  secondary: { color: darkColors.textSecondary },
  divider: { backgroundColor: darkColors.border },
});
