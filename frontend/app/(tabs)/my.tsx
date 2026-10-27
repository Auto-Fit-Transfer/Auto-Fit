import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Constants from 'expo-constants';
import Avatar from '@/assets/figma/main/143da.svg';
import Pencil from '@/assets/figma/main/3c25f.svg';
import Account from '@/assets/figma/main/9a48c.svg';
import Bell from '@/assets/figma/main/0ad54.svg';
import Info from '@/assets/figma/main/62626.svg';
import Arrow from '@/assets/figma/main/ff5ff.svg';
import Chevron from '@/assets/figma/main/98363.svg';
import { getProfile, getProfileName } from '@/src/api/home';
import { Text } from '@/src/components/common';
import { MainHeader, MainScreen, mainStyles } from '@/src/components/main/MainSurface';
import { colors, fontFamilies } from '@/src/theme';

export default function MyScreen() {
  const router = useRouter();
  const compact = useWindowDimensions().width < 370;
  const [name, setName] = useState('회원');
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    let live = true;
    setError(false);
    void getProfile()
      .then((r) => {
        if (live) setName(getProfileName(r) ?? '회원');
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useFocusEffect(load);
  return (
    <MainScreen>
      <MainHeader title="마이 페이지">
        <View style={s.identity}>
          <View style={[s.avatar, compact && { width: 64, height: 72 }]}>
            <View style={compact && { transform: [{ scale: 0.65 }] }}>
              <Avatar />
            </View>
            <Image
              source={require('@/assets/figma/main/5cb64.png')}
              style={[s.avatarIcon, compact && { width: 46, height: 46 }]}
            />
          </View>
          <View style={s.nameBlock}>
            <Text style={[s.name, compact && { fontSize: 24 }]} numberOfLines={1}>
              {name}님
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/profile')}
              style={[s.edit, compact && { paddingHorizontal: 7, gap: 4 }]}
            >
              <Pencil />
              <Text numberOfLines={1} style={[s.editText, compact && { fontSize: 11 }]}>
                프로필 편집
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="건강 티어 기준 보기"
            onPress={() => router.push('/tier')}
            style={s.tier}
          >
            <Image
              source={require('@/assets/figma/main/e03a2.png')}
              style={[s.medal, compact && { width: 70, height: 56 }]}
              resizeMode="contain"
            />
            <Text style={[s.tierText, compact && { fontSize: 10, paddingHorizontal: 5 }]}>
              산정 준비 중
            </Text>
          </Pressable>
        </View>
        <View style={s.mileage} accessibilityLabel="마일리지 서비스 준비 중">
          <View style={s.mileageLeft}>
            <Image source={require('@/assets/figma/main/e3817.png')} style={s.coin} />
            <Text style={s.mileageTitle}>마일리지</Text>
          </View>
          <Text style={s.mileageStatus}>준비 중</Text>
        </View>
      </MainHeader>
      <View style={mainStyles.content}>
        {error && (
          <Pressable accessibilityRole="button" onPress={load}>
            <Text style={mainStyles.text}>프로필을 불러오지 못했어요. 다시 시도</Text>
          </Pressable>
        )}
        <View style={s.section}>
          <Text style={s.heading}>내 건강</Text>
          <View style={s.healthCards}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/health-data-management')}
              style={[mainStyles.card, s.healthCard]}
            >
              <Image
                source={require('@/assets/figma/main/5c505.png')}
                style={s.illustration}
                resizeMode="contain"
              />
              <Text style={s.cardTitle}>건강 데이터 업로드</Text>
              <Text style={s.description}>새 검진표와 체성분 결과를 등록해요.</Text>
              <View style={s.footer}>
                <Text style={s.footerText}>업로드하기</Text>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Arrow />
                </View>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/total-analysis')}
              style={[mainStyles.card, s.healthCard]}
            >
              <Image
                source={require('@/assets/figma/main/dc561.png')}
                style={s.illustration}
                resizeMode="contain"
              />
              <Text style={s.cardTitle}>건강 리포트</Text>
              <Text style={s.description}>나의 건강 변화를 확인해요.</Text>
              <View style={s.footer}>
                <Text style={s.footerText}>최근 리포트</Text>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Arrow />
                </View>
              </View>
            </Pressable>
          </View>
        </View>
        <View style={s.section}>
          <Text style={s.heading}>계정 및 설정</Text>
          <View style={mainStyles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/account')}
              style={s.row}
            >
              <View style={s.icon}>
                <Account />
              </View>
              <Text style={s.rowText}>계정 관리</Text>
              <Chevron />
            </Pressable>
            <View style={s.divider} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/notifications')}
              style={s.row}
            >
              <View style={s.icon}>
                <Bell />
              </View>
              <Text style={s.rowText}>알림 설정</Text>
              <Chevron />
            </Pressable>
            <View style={s.divider} />
            <View style={s.row}>
              <View style={s.icon}>
                <Info />
              </View>
              <Text style={s.rowText}>앱 정보</Text>
              <Text style={s.description}>v.{Constants.expoConfig?.version ?? '1.0.0'}</Text>
            </View>
          </View>
        </View>
      </View>
    </MainScreen>
  );
}
const s = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  avatarIcon: { position: 'absolute', width: 70, height: 70 },
  nameBlock: { flex: 1, minWidth: 0, gap: 9 },
  name: { fontSize: 30, color: colors.primaryLight, fontFamily: fontFamilies.pretendardSemiBold },
  edit: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderColor: colors.primaryLight,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    height: 38,
  },
  editText: {
    fontSize: 14,
    color: colors.primaryLight,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  tier: { alignItems: 'center' },
  medal: { width: 100, height: 68 },
  tierText: {
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    color: colors.primary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mileage: {
    marginTop: 'auto',
    height: 47,
    borderRadius: 10,
    borderColor: colors.primaryLight,
    borderWidth: 0.5,
    backgroundColor: 'rgba(120,102,244,0.05)',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mileageLeft: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  coin: { width: 35, height: 35 },
  mileageTitle: {
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    color: colors.textWhite,
  },
  mileageStatus: { fontSize: 15, color: colors.textWhiteSecondary },
  section: { gap: 15 },
  heading: { fontFamily: fontFamilies.pretendardBold, fontSize: 22, color: colors.textBody },
  healthCards: { flexDirection: 'row', gap: 10 },
  healthCard: { flex: 1, minWidth: 0, padding: 10, gap: 5 },
  illustration: { width: '100%', height: 95 },
  cardTitle: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 17, color: colors.textBody },
  description: {
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 8,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14, color: colors.primary },
  row: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 16 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    color: colors.textBody,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
});
