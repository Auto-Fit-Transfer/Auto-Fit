import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MainHeader, MainScreen, mainStyles } from '@/src/components/main/MainSurface';
import { colors, fontFamilies } from '@/src/theme';
import DietIcon from '@/assets/figma/main/8f046.svg';
import ExerciseIcon from '@/assets/figma/main/3a625.svg';
import DataIcon from '@/assets/figma/main/baa81.svg';
import CoreIcon from '@/assets/figma/main/6a991.svg';
import BalanceIcon from '@/assets/figma/main/e036c.svg';
import ActiveIcon from '@/assets/figma/main/6ebab.svg';
import FitIcon from '@/assets/figma/main/2ad06.svg';
import PeakIcon from '@/assets/figma/main/5ef63.svg';

const roadmap = [
  { name: 'CORE', description: '건강관리\n기반 형성', Icon: CoreIcon },
  { name: 'BALANCE', description: '건강의 균형\n잡아가기', Icon: BalanceIcon },
  { name: 'ACTIVE', description: '꾸준한\n실천', Icon: ActiveIcon },
  { name: 'FIT', description: '나에게 맞는\n건강관리\n안정화', Icon: FitIcon },
  { name: 'PEAK', description: '최상의\n건강흐름\n유지', Icon: PeakIcon },
];

export default function TierScreen() {
  const router = useRouter();
  return (
    <MainScreen tabs={false}>
      <MainHeader
        title="내 건강 티어"
        height={280}
        back={() => router.back()}
        style={{ borderBottomLeftRadius: 100, borderBottomRightRadius: 100 }}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>건강 티어</Text>
          <Image
            source={require('@/assets/figma/main/e03a2.png')}
            resizeMode="contain"
            style={{ width: 150, height: 103, marginTop: 5 }}
          />
          <Text style={styles.unavailable}>티어 산정 기능을 준비하고 있어요</Text>
        </View>
      </MainHeader>
      <View style={mainStyles.content}>
        <View style={[mainStyles.card, { gap: 24 }]}>
          <Text style={mainStyles.sectionTitle}>이번 주 이렇게 관리해보세요!</Text>
          {[
            {
              title: '식단 관리',
              text: '추천 식단 또는 목표에 맞는 식사 기록하기',
              Icon: DietIcon,
            },
            { title: '운동 관리', text: '추천 운동을 꾸준히 완료하기', Icon: ExerciseIcon },
            { title: '건강 데이터', text: '최신 측정값을 유지하고 관리하기', Icon: DataIcon },
          ].map(({ title, text, Icon }) => (
            <View key={title} style={styles.row}>
              <View style={styles.icon}>
                <Icon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{title}</Text>
                <Text style={mainStyles.text}>{text}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={[mainStyles.card, { gap: 26 }]}>
          <Text style={mainStyles.sectionTitle}>건강 티어 로드맵</Text>
          <View style={styles.roadmap}>
            {roadmap.map(({ name, description, Icon }) => (
              <View key={name} style={styles.stage}>
                <View style={styles.stageIcon}>
                  <Icon />
                </View>
                <Text style={styles.stageTitle}>{name}</Text>
                <View style={styles.dot} />
                <Text style={styles.stageText}>{description}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </MainScreen>
  );
}
const styles = StyleSheet.create({
  title: { fontFamily: fontFamilies.pretendardBold, fontSize: 34, color: colors.primaryMedium },
  unavailable: { color: colors.textWhiteSecondary, fontSize: 14, marginTop: 14 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    color: colors.textBody,
    fontSize: 16,
    fontFamily: fontFamilies.pretendardSemiBold,
    marginBottom: 5,
  },
  roadmap: { flexDirection: 'row', justifyContent: 'space-between' },
  stage: { flex: 1, alignItems: 'center', gap: 12 },
  stageIcon: { height: 44, justifyContent: 'center', alignItems: 'center' },
  stageTitle: { fontSize: 11, fontFamily: fontFamilies.pretendardSemiBold, color: colors.textBody },
  stageText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryMedium },
});
