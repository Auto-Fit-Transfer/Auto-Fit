import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import ChevronRightIcon from '@/assets/icons/common/chevrons/Right.svg';
import PencilIcon from '@/assets/icons/feature/Pencil.svg';
import UserIcon from '@/assets/icons/input/User.svg';
import BellIcon from '@/assets/icons/system/Bell.svg';
import SignOutIcon from '@/assets/icons/system/SignOut.svg';
import WarningIcon from '@/assets/icons/system/WarningCircle.svg';
import { getProfile, getProfileName } from '@/src/api/home';
import {
  BOTTOM_NAVIGATION_MIN_BOTTOM_GAP,
  getBottomNavigationVisualHeight,
} from '@/src/components/navigation/BottomNavigation';
import { getSupabaseClient } from '@/src/lib/supabase';
import { colors, fontFamilies } from '@/src/theme';

const background = require('../../assets/images/backgrounds/5_MyPage_New.png');
const healthDataIllustration = require('../../assets/images/illustrations/my_page/data.png');
const healthReportIllustration = require('../../assets/images/illustrations/my_page/report.png');
const fitTierIllustration = require('../../assets/images/illustrations/tier/Fit.png');

const referenceWidth = 412;
const referenceContentBottom = 817;
const profileGradient = ['#F4FFFC', '#D8F6F0', '#F7FFFD', '#BDEDE4'] as const;
const buttonGradient = ['rgba(255,255,255,0.72)', '#DDF7F2', '#FFFFFF', '#E8F8F4'] as const;

const cardShadow: ViewStyle = {
  boxShadow: '0px 0px 5px rgba(0, 0, 0, 0.10)',
};

const profileShadow: ViewStyle = {
  boxShadow:
    '-5px -5px 5px rgba(0, 0, 0, 0.03), 3px 3px 5px rgba(0, 0, 0, 0.05)',
};

const tierShadow: ViewStyle = {
  boxShadow:
    '-2px -2px 5px rgba(73, 205, 177, 0.10), 2px 2px 5px rgba(47, 175, 150, 0.15)',
};

function GradientFill({
  colors: gradientColors,
  id,
  radius,
}: {
  colors: readonly [string, string, string, string];
  id: string;
  radius: number;
}) {
  return (
    <Svg height="100%" pointerEvents="none" style={StyleSheet.absoluteFill} width="100%">
      <Defs>
        <LinearGradient id={id} x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor={gradientColors[0]} />
          <Stop offset="0.34" stopColor={gradientColors[1]} />
          <Stop offset="0.68" stopColor={gradientColors[2]} />
          <Stop offset="1" stopColor={gradientColors[3]} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${id})`} height="100%" rx={radius} ry={radius} width="100%" />
    </Svg>
  );
}

function MenuIcon({ children }: { children: ReactNode }) {
  return <View style={styles.menuIcon}>{children}</View>;
}

export default function MyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [name, setName] = useState('사용자');
  const bottomNavigationSpace =
    getBottomNavigationVisualHeight(windowHeight) +
    Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP);
  const isCompactLayout = windowHeight - bottomNavigationSpace < referenceContentBottom;
  const isNarrowLayout = windowWidth < 390;
  const pageTop = Math.max(insets.top + 10, 38);

  useFocusEffect(
    useCallback(() => {
      void getProfile()
        .then((response) => setName(getProfileName(response) ?? '사용자'))
        .catch(() => undefined);
    }, []),
  );

  const handleSignOut = useCallback(() => {
    Alert.alert('로그아웃', '로그아웃하시겠어요?', [
      { style: 'cancel', text: '취소' },
      {
        style: 'destructive',
        text: '로그아웃',
        onPress: () => void getSupabaseClient().auth.signOut().then(() => router.replace('/login')),
      },
    ]);
  }, [router]);

  return (
    <View style={styles.root}>
      <Image resizeMode="cover" source={background} style={styles.background} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: isCompactLayout ? bottomNavigationSpace + 24 : 0,
            paddingTop: pageTop,
          },
        ]}
        scrollEnabled={isCompactLayout}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <Text style={styles.screenTitle}>마이 페이지</Text>

        <View style={styles.profile}>
          <View style={styles.profileIdentity}>
            <View style={[styles.avatar, profileShadow]}>
              <GradientFill colors={profileGradient} id="profileAvatarGradient" radius={48} />
              <View style={styles.avatarInner}>
                <UserIcon color="#A5A8A7" height={63} width={63} />
              </View>
            </View>
            <View style={styles.profileText}>
              <Text numberOfLines={1} style={styles.name}>
                {name}님
              </Text>
              <Pressable style={styles.editButton}>
                <GradientFill colors={buttonGradient} id="profileEditGradient" radius={10} />
                <PencilIcon color={colors.primaryDark} height={20} width={20} />
                <Text style={styles.editText}>프로필 수정</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.tierBlock}>
            <Image resizeMode="contain" source={fitTierIllustration} style={styles.tierImage} />
            <View style={[styles.tierBadge, tierShadow]}>
              <GradientFill colors={buttonGradient} id="tierBadgeGradient" radius={20} />
              <Text style={styles.tierText}>FIT 2</Text>
            </View>
          </View>
        </View>

        <View style={styles.healthSection}>
          <Text style={styles.sectionTitle}>내 건강</Text>
          <View style={styles.healthCards}>
            <Pressable
              onPress={() => router.push('/health-data-management')}
              style={[styles.healthCard, cardShadow]}
            >
              <Image
                resizeMode="contain"
                source={healthDataIllustration}
                style={[styles.healthIllustration, isNarrowLayout && styles.healthIllustrationNarrow]}
              />
              <View style={styles.healthCopy}>
                <Text style={[styles.cardTitle, isNarrowLayout && styles.cardTitleNarrow]}>
                  건강 데이터 관리
                </Text>
                <Text style={[styles.cardDescription, isNarrowLayout && styles.cardDescriptionNarrow]}>
                  검사 결과와{`\n`}건강 데이터를 관리해요.
                </Text>
              </View>
              <View style={styles.cardDivider} />
              <CardFooter label="최근 검사" value="업로드 데이터 확인" />
            </Pressable>

            <View style={[styles.healthCard, cardShadow]}>
              <Image
                resizeMode="contain"
                source={healthReportIllustration}
                style={[styles.healthIllustration, isNarrowLayout && styles.healthIllustrationNarrow]}
              />
              <View style={styles.healthCopy}>
                <Text style={[styles.cardTitle, isNarrowLayout && styles.cardTitleNarrow]}>
                  건강 리포트
                </Text>
                <Text style={[styles.cardDescription, isNarrowLayout && styles.cardDescriptionNarrow]}>
                  나의 건강 변화를 확인해요.
                </Text>
              </View>
              <View style={styles.cardDivider} />
              <CardFooter label="최근 리포트" report value="리포트 준비 중" />
            </View>
          </View>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>계정 및 설정</Text>
          <View style={[styles.settingsCard, cardShadow]}>
            <MenuRow Icon={UserIcon} label="계정 관리" />
            <View style={styles.menuDivider} />
            <MenuRow Icon={BellIcon} label="알림 설정" />
            <View style={styles.menuDivider} />
            <View style={styles.menuRow}>
              <View style={styles.menuLeft}>
                <MenuIcon>
                  <WarningIcon color={colors.primary} height={25} width={25} />
                </MenuIcon>
                <Text style={styles.menuLabel}>앱 정보</Text>
              </View>
              <Text style={styles.version}>v.1.0.0</Text>
            </View>
          </View>
        </View>

        <Pressable onPress={handleSignOut} style={[styles.logout, cardShadow]}>
          <MenuIcon>
            <SignOutIcon color={colors.primary} height={25} width={25} />
          </MenuIcon>
          <Text style={styles.menuLabel}>로그아웃</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function CardFooter({ label, report = false, value }: { label: string; report?: boolean; value: string }) {
  return (
    <View style={[styles.cardFooter, report && styles.reportFooter]}>
      <View style={styles.cardFooterCopy}>
        <Text style={[styles.primaryLabel, report && styles.reportLabel]}>{label}</Text>
        <Text numberOfLines={1} style={styles.cardDate}>
          {value}
        </Text>
      </View>
      <View style={[styles.cardArrow, report && styles.reportArrow]}>
        <ChevronRightIcon color={colors.surface} height={12} width={12} />
      </View>
    </View>
  );
}

function MenuRow({ Icon, label }: { Icon: typeof UserIcon; label: string }) {
  return (
    <View style={styles.menuRow}>
      <View style={styles.menuLeft}>
        <MenuIcon>
          <Icon color={colors.primary} height={25} width={25} />
        </MenuIcon>
        <Text style={styles.menuLabel}>{label}</Text>
      </View>
      <ChevronRightIcon color={colors.textSecondary} height={20} width={20} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderColor: 'rgba(73, 205, 177, 0.22)',
    borderRadius: 48,
    borderWidth: 1,
    height: 95,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 95,
  },
  avatarInner: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
    borderColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 40,
    borderWidth: 1,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  background: { ...StyleSheet.absoluteFill, height: '100%', width: '100%' },
  cardArrow: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  cardDate: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
    letterSpacing: 0.39,
    lineHeight: 16,
  },
  cardDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    lineHeight: 19,
  },
  cardDescriptionNarrow: { fontSize: 12, lineHeight: 17 },
  cardDivider: { backgroundColor: colors.border, height: 0.5, marginTop: 10, width: '100%' },
  cardFooter: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    flexDirection: 'row',
    height: 53,
    justifyContent: 'space-between',
    marginTop: 10,
    padding: 10,
  },
  cardFooterCopy: { flex: 1, minWidth: 0 },
  cardTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 22,
  },
  cardTitleNarrow: { fontSize: 16, lineHeight: 20 },
  content: {
    alignSelf: 'center',
    maxWidth: referenceWidth,
    paddingHorizontal: 21,
    width: '100%',
  },
  editButton: {
    alignItems: 'center',
    borderColor: colors.primaryDark,
    borderRadius: 10,
    borderWidth: 0.5,
    flexDirection: 'row',
    gap: 5,
    height: 30,
    justifyContent: 'center',
    marginTop: 3,
    overflow: 'hidden',
    width: 113,
  },
  editText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 20,
  },
  healthCard: {
    backgroundColor: colors.surface,
    borderRadius: 15,
    flex: 1,
    height: 250,
    minWidth: 0,
    padding: 10,
  },
  healthCards: { flexDirection: 'row', gap: 10, marginTop: 10 },
  healthCopy: { height: 66, marginTop: 10 },
  healthIllustration: { alignSelf: 'center', height: 80, width: 140 },
  healthIllustrationNarrow: { width: 126 },
  healthSection: { marginTop: 20 },
  logout: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 15,
    flexDirection: 'row',
    gap: 14,
    height: 65,
    marginTop: 14,
    paddingHorizontal: 15,
  },
  menuDivider: { backgroundColor: colors.border, height: 0.5, marginVertical: 15, width: '100%' },
  menuIcon: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  menuLabel: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 22,
  },
  menuLeft: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  menuRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 40,
    justifyContent: 'space-between',
  },
  name: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 30,
    lineHeight: 36,
    maxWidth: 120,
  },
  primaryLabel: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 18,
  },
  profile: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 100,
    justifyContent: 'space-between',
    marginTop: 19,
  },
  profileIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 15, minWidth: 0 },
  profileText: { flexShrink: 1 },
  reportArrow: { backgroundColor: '#8B77E4' },
  reportFooter: { backgroundColor: '#F3F4FF' },
  reportLabel: { color: '#8B77E4' },
  root: { backgroundColor: colors.surface, flex: 1 },
  screenTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    letterSpacing: 1.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  scrollView: { flex: 1 },
  sectionTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    lineHeight: 24,
  },
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: 15,
    marginTop: 10,
    padding: 15,
  },
  settingsSection: { marginTop: 14 },
  tierBadge: {
    alignItems: 'center',
    borderRadius: 20,
    height: 23,
    justifyContent: 'center',
    marginTop: -1,
    overflow: 'hidden',
    width: 76,
  },
  tierBlock: { alignItems: 'center', width: 90 },
  tierImage: { height: 61, width: 90 },
  tierText: {
    color: colors.primary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 22,
  },
  version: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 16,
    lineHeight: 20,
  },
});
