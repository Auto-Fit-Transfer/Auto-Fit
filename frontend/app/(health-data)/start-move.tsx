import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import LeftShade from '@/assets/figma/main/e760c.svg';
import RightShade from '@/assets/figma/main/e3de7.svg';
import Arc from '@/assets/figma/main/b54c8.svg';
import Glow from '@/assets/figma/main/45599.svg';
import Star from '@/assets/figma/main/32213.svg';
import Arrow from '@/assets/figma/main/ff5ff.svg';
import House from '@/assets/figma/main/40b15.svg';
import Chevron from '@/assets/figma/main/e010e.svg';
import Shield from '@/assets/figma/main/bd3a5.svg';
import { MainGradient, MainScreen } from '@/src/components/main/MainSurface';
import { colors, fontFamilies } from '@/src/theme';

export default function StartMoveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const compact = useWindowDimensions().width < 370;
  const extra = Math.max(0, insets.top - 28);
  const open = (path: '/diet' | '/exercise' | '/home') => {
    router.dismissAll();
    router.replace(path);
  };
  return (
    <MainScreen tabs={false}>
      <StatusBar style="light" />
      <View style={[s.hero, { height: 330 + extra }]}>
        <MainGradient top="#25284d" bottom="#42417e" />
        <View pointerEvents="none" style={{ position: 'absolute', left: -166, top: -79 }}>
          <LeftShade />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', right: -208, top: 42 }}>
          <RightShade />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: -54, top: 165 }}>
          <Arc />
        </View>
        <Text style={[s.screenTitle, { top: 38 + extra }]}>종합 건강 분석</Text>
        <View pointerEvents="none" style={[s.glow, { top: 63 + extra }]}>
          <Glow />
        </View>
        <Image
          source={require('@/assets/figma/main/d8fc7.png')}
          resizeMode="contain"
          style={[s.heroImage, { top: 52 + extra }]}
        />
        <Text style={[s.headline, { top: 224 + extra, fontSize: compact ? 20 : 24 }]}>
          나에게 맞는 <Text style={{ color: colors.primaryMedium }}>관리</Text>를 시작해볼까요?
        </Text>
        <Text style={[s.heroDescription, { top: 267 + extra }]}>
          분석된 건강 정보를 바탕으로{'\n'}원하는 관리 방법을 선택해 주세요.
        </Text>
      </View>
      <View style={s.body}>
        <View style={s.guide}>
          <View style={s.line} />
          <Star />
          <Text style={[s.guideText, compact && { fontSize: 16 }]}>어떤 관리부터 시작할까요?</Text>
          <Star />
          <View style={s.line} />
        </View>
        {(
          [
            {
              path: '/diet',
              title: '맞춤 식단 관리',
              description: '내 건강 상태에 맞는\n식단을 추천받아 보세요.',
              image: require('@/assets/figma/main/9a297.png'),
            },
            {
              path: '/exercise',
              title: '맞춤 운동 관리',
              description: '현재 목표에 맞는 운동\n프로그램을 추천받아 보세요.',
              image: require('@/assets/figma/main/0b372.png'),
            },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.path}
            accessibilityRole="button"
            onPress={() => open(item.path)}
            style={s.card}
          >
            <View style={[s.picture, compact && { width: 88, height: 98 }]}>
              <MainGradient top="#FBFAFF" bottom="#DFDAFF" />
              <Image
                source={item.image}
                resizeMode="contain"
                style={{ width: '100%', height: '100%' }}
              />
            </View>
            <View style={s.copy}>
              <Text style={[s.title, compact && { fontSize: 17 }]}>{item.title}</Text>
              <Text style={[s.description, compact && { fontSize: 13 }]}>{item.description}</Text>
            </View>
            <View style={s.arrow}>
              <Arrow />
            </View>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => open('/home')}
          style={[s.card, s.later]}
        >
          <View style={s.house}>
            <House />
          </View>
          <View style={s.copy}>
            <Text style={[s.title, { fontSize: 18 }]}>나중에 할게요</Text>
            <Text style={[s.description, { fontSize: 14 }]}>
              홈으로 이동하여 나중에 시작할 수 있어요.
            </Text>
          </View>
          <Chevron />
        </Pressable>
        <View style={s.info}>
          <View style={s.shield}>
            <MainGradient top={colors.primaryMedium} bottom={colors.primary} />
            <View>
              <Shield />
            </View>
          </View>
          <Text style={[s.description, { flex: 1, fontSize: 13 }]}>
            추천 내용은 입력한 건강 데이터를 기반으로 생성되며, 언제든지 설정에서 정보를 수정할 수
            있어요.
          </Text>
        </View>
      </View>
    </MainScreen>
  );
}
const s = StyleSheet.create({
  hero: { overflow: 'hidden', borderBottomLeftRadius: 50, borderBottomRightRadius: 50 },
  screenTitle: {
    position: 'absolute',
    left: 16,
    right: 16,
    textAlign: 'center',
    fontFamily: fontFamilies.pretendardBold,
    color: colors.textWhite,
    fontSize: 15,
    letterSpacing: 1.5,
  },
  glow: { position: 'absolute', alignSelf: 'center' },
  heroImage: { position: 'absolute', alignSelf: 'center', width: 304, height: 180 },
  headline: {
    position: 'absolute',
    left: 10,
    right: 10,
    textAlign: 'center',
    fontFamily: fontFamilies.pretendardBold,
    color: '#FFFFFF',
    lineHeight: 31,
  },
  heroDescription: {
    position: 'absolute',
    left: 16,
    right: 16,
    textAlign: 'center',
    color: colors.textWhite,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  body: { paddingHorizontal: 16, paddingTop: 15, gap: 13 },
  guide: { flexDirection: 'row', gap: 8, alignItems: 'center', height: 40 },
  line: { height: 1, backgroundColor: colors.primaryMedium, flex: 1 },
  guideText: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 18, color: colors.textBody },
  card: {
    minHeight: 138,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0px 0px 5px rgba(0,0,0,0.12)',
  },
  picture: { width: 130, height: 110, borderRadius: 18, overflow: 'hidden' },
  copy: { flex: 1, gap: 10 },
  title: { fontFamily: fontFamilies.pretendardBold, fontSize: 20, color: colors.textBody },
  description: {
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  later: { minHeight: 88, paddingHorizontal: 14 },
  house: { width: 48, alignItems: 'center' },
  info: {
    minHeight: 75,
    padding: 10,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  shield: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
