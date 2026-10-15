import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

import BloodPressureFillIcon from '@/assets/figma/main/92e66.svg';
import StarTopIcon from '@/assets/figma/main/06a58.svg';
import StarBottomIcon from '@/assets/figma/main/9da88.svg';
import TierArrow from '@/assets/figma/main/be565.svg';
import { colors, fontFamilies, radius } from '@/src/theme';
import { getScoreRatio } from './scoreRatio';

const graphSize = 350;
const graphCenter = graphSize / 2;
const graphRadius = 163.5;
const graphCircumference = 2 * Math.PI * graphRadius;

interface HealthScoreProps {
  score: number | null;
  totalScore: number | null;
  status: string | null;
  onTierPress?: () => void;
  onScorePress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function HealthScore({
  score,
  totalScore,
  status,
  style,
  onTierPress,
  onScorePress,
}: HealthScoreProps) {
  const scoreArcRatio = getScoreRatio(score, totalScore);
  const scoreText = score === null ? '-' : String(score);
  const totalScoreText = totalScore === null ? '-' : String(totalScore);
  const statusText = status ?? '-';

  return (
    <View
      accessibilityLabel={`건강 점수 ${scoreText}점, ${statusText}`}
      style={[styles.container, style]}
    >
      <Svg height={graphSize} style={styles.graph} viewBox="0 0 350 350" width={graphSize}>
        <Defs>
          <LinearGradient
            gradientUnits="userSpaceOnUse"
            id="score-ring-gradient"
            x1="261"
            x2="78"
            y1="24.5"
            y2="317"
          >
            <Stop offset="0.2" stopColor="#7866F4" stopOpacity={1} />
            <Stop offset="0.499892" stopColor="#BAB1FF" stopOpacity={1} />
            <Stop offset="0.8" stopColor="#7866F4" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={graphCenter}
          cy={graphCenter}
          fill="none"
          r={graphRadius}
          stroke="#E3E3FD"
          strokeWidth={23}
        />
        {score !== null ? (
          <Circle
            cx={graphCenter}
            cy={graphCenter}
            fill="none"
            r={graphRadius}
            stroke="url(#score-ring-gradient)"
            strokeDasharray={`${graphCircumference * scoreArcRatio} ${graphCircumference}`}
            strokeLinecap="round"
            strokeWidth={23}
            transform={`rotate(-90 ${graphCenter} ${graphCenter})`}
          />
        ) : null}
      </Svg>

      <View style={styles.healthIconCircle}>
        <BloodPressureFillIcon />
      </View>

      <Text style={styles.title}>건강 점수</Text>

      <View style={styles.scoreRow}>
        <Svg height={70} viewBox="0 0 94 70" width={94}>
          <Defs>
            <LinearGradient id="score-text-gradient" x1="74" x2="18" y1="5" y2="68">
              <Stop offset="0.2" stopColor="#7866F4" />
              <Stop offset="0.5" stopColor="#BAB1FF" />
              <Stop offset="0.8" stopColor="#7866F4" />
            </LinearGradient>
          </Defs>
          <SvgText
            fill="url(#score-text-gradient)"
            fontFamily={fontFamilies.pretendardBold}
            fontSize={70}
            x={0}
            y={65}
          >
            {scoreText}
          </SvgText>
        </Svg>
        <Text style={styles.totalScore}>/ {totalScoreText}</Text>
      </View>

      <Image
        source={require('@/assets/figma/main/e03a2.png')}
        resizeMode="contain"
        style={{ position: 'absolute', left: 115, top: 230, width: 120, height: 82 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="종합 건강 분석 보기"
        onPress={onScorePress}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 310 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="건강 티어 안내"
        onPress={(event) => {
          event.stopPropagation();
          onTierPress?.();
        }}
        style={styles.tierLink}
      >
        <Text style={styles.tierLinkText}>{status ?? '내 건강 티어 알아보기'}</Text>
        <TierArrow />
      </Pressable>

      <View style={styles.starTop}>
        <StarTopIcon />
      </View>
      <View style={styles.starBottom}>
        <StarBottomIcon />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tierLink: {
    position: 'absolute',
    top: 317,
    left: 45,
    width: 260,
    height: 35,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    boxShadow: '0px 0px 5px rgba(0,0,0,0.08)',
  },
  tierLinkText: {
    color: colors.primary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
  },
  container: {
    height: graphSize,
    width: graphSize,
  },
  graph: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  healthIconCircle: {
    alignItems: 'center',
    backgroundColor: '#E3E3FD',
    borderRadius: radius.round,
    height: 60,
    justifyContent: 'center',
    left: 145,
    position: 'absolute',
    top: 49,
    width: 60,
  },
  title: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 18,
    includeFontPadding: false,
    left: 0,
    lineHeight: 22,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
    top: 116,
  },
  scoreRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    height: 70,
    justifyContent: 'center',
    left: 86,
    position: 'absolute',
    top: 156,
    width: 178,
  },
  totalScore: {
    color: '#BAB1FF',
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 25,
    includeFontPadding: false,
    lineHeight: 31,
    marginBottom: 5,
  },
  statusBadge: {
    alignItems: 'center',
    backgroundColor: '#E3E3FD',
    borderRadius: radius.round,
    height: 40,
    justifyContent: 'center',
    left: 138,
    position: 'absolute',
    top: 249,
    width: 75,
  },
  statusText: {
    color: colors.primary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
    includeFontPadding: false,
    lineHeight: 24,
  },
  starTop: {
    left: 7,
    position: 'absolute',
    top: 37,
  },
  starBottom: {
    left: 315,
    position: 'absolute',
    top: 311,
  },
});
