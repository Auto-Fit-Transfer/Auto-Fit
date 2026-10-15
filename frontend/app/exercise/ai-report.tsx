import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SmileyIcon from '@/assets/icons/face/Smiley.svg';
import SparkleIcon from '@/assets/icons/deco/Sparkle.svg';
import TargetIcon from '@/assets/icons/deco/Target.svg';
import ChartBarIcon from '@/assets/icons/graph/ChartBar.svg';
import UserIcon from '@/assets/icons/input/User.svg';
import ArrowsClockwiseIcon from '@/assets/icons/system/ArrowsClockwise.svg';
import CheckCircleIcon from '@/assets/icons/system/CheckCircle.svg';
import CheckCircleOutIcon from '@/assets/icons/system/CheckCircleOut.svg';
import { BackButton } from '@/src/components/common/BackButton';
import { ExerciseScreenFrame } from '@/src/components/exercise/ExerciseScreenFrame';
import { getExerciseApiErrorMessage, getExerciseSessionAnalysis } from '@/src/api/exercise';
import { mapExerciseAnalysis } from '@/src/features/exercise/exerciseAnalysis';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { colors, fontFamilies } from '@/src/theme';

const referenceHeight = 917;
const compactHeight = 740;
const aiImage = require('@/assets/images/illustrations/exercise/AI.png');
const upImage = require('@/assets/images/illustrations/exercise/Up.png');
const metricIcons = [TargetIcon, ChartBarIcon, SmileyIcon, UserIcon];

export default function ExerciseAiReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resultSource, source } = useLocalSearchParams<{
    resultSource?: string;
    source?: string;
  }>();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { latestSession, resultRecordCompleted } = useExerciseRoutine();
  const [result, setResult] = useState<{
    key: string;
    report: ReturnType<typeof mapExerciseAnalysis> | null;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sessionId = latestSession?.sessionId;
  const requestKey = `${sessionId}:${attempt}`;
  const report = result?.key === requestKey ? result.report : null;
  const error = !sessionId
    ? '분석할 운동 기록이 없습니다. 운동을 완료한 뒤 다시 확인해 주세요.'
    : result?.key === requestKey
      ? result.error
      : null;

  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    void getExerciseSessionAnalysis(sessionId)
      .then(({ analysis }) => {
        if (active)
          setResult({ key: requestKey, report: mapExerciseAnalysis(analysis), error: null });
      })
      .catch((reason: unknown) => {
        if (active)
          setResult({ key: requestKey, report: null, error: getExerciseApiErrorMessage(reason) });
      });
    return () => {
      active = false;
    };
  }, [sessionId, requestKey]);
  const responsiveHeight =
    Platform.OS === 'android' ? Dimensions.get('screen').height : windowHeight;
  const homeHeaderHeightProgress = Math.max(
    0,
    Math.min(1, (responsiveHeight - compactHeight) / (referenceHeight - compactHeight)),
  );
  const homeHeaderVerticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * homeHeaderHeightProgress;
  const availableWidth = windowWidth - insets.left - insets.right;
  const homeHeaderWidthScale = Math.min(1, availableWidth / 412);
  const frameWidthScale = Math.min(1, windowWidth / 412);
  const homeHeaderCanvasTop = Math.max(0, insets.top + 8 - 38 * homeHeaderWidthScale);
  const headerTop =
    (homeHeaderCanvasTop + homeHeaderVerticalValue(38, 30) * homeHeaderWidthScale) /
    Math.max(frameWidthScale, 0.01);
  const widthScale = Math.min(1, windowWidth / 412);
  const logicalHeight = responsiveHeight / Math.max(widthScale, 0.01);
  const heightProgress = Math.max(
    0,
    Math.min(1, (logicalHeight - compactHeight) / (referenceHeight - compactHeight)),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;
  const heroTop = verticalValue(75, 55);
  const heroHeight = verticalValue(110, 92);
  const heroToSummaryGap = verticalValue(24, 10);
  // Figma uses a shared card rhythm: 30dp between sections, with the
  // insight-to-next gap only 1dp tighter on the 412×917 reference canvas.
  const sectionGap = verticalValue(30, 12);
  const insightToNextGap = sectionGap - verticalValue(1, 0);
  const summaryHeight = verticalValue(250, 200);
  const summaryTop = heroTop + heroHeight + heroToSummaryGap;
  const insightHeight = verticalValue(160, 145);
  const insightTop = summaryTop + summaryHeight + sectionGap;
  const nextHeight = verticalValue(140, 131);
  const nextTop = insightTop + insightHeight + insightToNextGap;
  // Shared with the result-record screen so both completion CTAs share one baseline.
  const ctaTop = verticalValue(850, 683);
  const layout = {
    // Match the exercise Home title's Safe Area-aware header baseline.
    backTop: headerTop - 14,
    contentHeight: ctaTop + 45,
    ctaTop,
    heroHeight,
    heroImageWidth: verticalValue(140, 117),
    heroTop,
    headerTop,
    insightHeight,
    insightInnerHeight: verticalValue(110, 95),
    insightTop,
    nextHeight,
    nextTop,
    summaryHeight,
    summaryMetricHeight: verticalValue(90, 70),
    summaryTop,
  };
  const returnHome = useCallback(() => router.dismissTo('/exercise'), [router]);
  const handleBack = useCallback(() => {
    if (source === 'record') {
      router.replace({
        pathname: '/exercise/result',
        params: { source: resultSource === 'completion' ? 'completion' : 'home' },
      });
      return;
    }

    returnHome();
  }, [resultSource, returnHome, router, source]);

  useEffect(() => {
    if (resultRecordCompleted) return undefined;
    const frame = requestAnimationFrame(() =>
      router.replace({ pathname: '/exercise/result', params: { source: 'home' } }),
    );
    return () => cancelAnimationFrame(frame);
  }, [resultRecordCompleted, router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  if (!resultRecordCompleted) return null;

  if (!report) {
    return (
      <ExerciseScreenFrame contentHeight={layout.contentHeight}>
        <BackButton onPress={handleBack} style={[styles.back, { top: layout.backTop }]} />
        <View style={{ padding: 24, marginTop: layout.heroTop }}>
          <Text accessibilityRole="alert">{error ?? '운동 기록을 분석하는 중이에요.'}</Text>
          {error ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAttempt((value) => value + 1)}
              style={{ paddingVertical: 20 }}
            >
              <Text>다시 시도</Text>
            </Pressable>
          ) : null}
        </View>
      </ExerciseScreenFrame>
    );
  }

  return (
    <ExerciseScreenFrame contentHeight={layout.contentHeight}>
      <BackButton onPress={handleBack} style={[styles.back, { top: layout.backTop }]} />
      <Text pointerEvents="none" style={[styles.headerTitle, { top: layout.headerTop }]}>
        운동 결과 분석
      </Text>

      <View style={[styles.hero, { height: layout.heroHeight, top: layout.heroTop }]}>
        <View style={styles.heroText}>
          <SparkleIcon
            color={colors.primaryDark}
            fill={colors.primaryDark}
            height={20}
            width={20}
          />
          <Text style={styles.heroTitle}>오늘 운동 결과 분석</Text>
          <Text style={styles.heroDescription}>
            저장된 운동과 피드백을 바탕으로{`\n`}다음 운동 방향을 확인해요.
          </Text>
        </View>
        <Image
          resizeMode="cover"
          source={aiImage}
          style={[styles.aiImage, { height: layout.heroHeight, width: layout.heroImageWidth }]}
        />
      </View>

      <View style={[styles.summaryCard, { height: layout.summaryHeight, top: layout.summaryTop }]}>
        <View style={styles.cardHeading}>
          <CheckCircleOutIcon color={colors.primaryDark} height={18} width={18} />
          <Text style={styles.cardHeadingText}>운동 요약</Text>
        </View>
        <View style={[styles.metricGrid, { marginTop: verticalValue(18, 8) }]}>
          {report.metrics.map(({ label, value }, index) => {
            const Icon = metricIcons[index];
            return (
              <View key={label} style={[styles.metricCard, { height: layout.summaryMetricHeight }]}>
                <View style={styles.metricIconCircle}>
                  <Icon
                    color={colors.primaryDark}
                    fill={colors.primaryDark}
                    height={25}
                    width={25}
                  />
                </View>
                <View style={styles.metricText}>
                  <Text numberOfLines={1} style={styles.metricLabel}>
                    {label}
                  </Text>
                  <Text numberOfLines={1} style={styles.metricValue}>
                    {value}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.insightCard, { height: layout.insightHeight, top: layout.insightTop }]}>
        <View style={styles.cardHeading}>
          <SparkleIcon
            color={colors.primaryDark}
            fill={colors.primaryDark}
            height={20}
            width={20}
          />
          <Text style={styles.cardHeadingText}>AI 인사이트</Text>
        </View>
        <View style={[styles.insightInner, { height: layout.insightInnerHeight }]}>
          <View style={styles.insightText}>
            <Text style={styles.insightTitle}>{report.insight.title}</Text>
            <Text
              style={[
                styles.insightDescription,
                { lineHeight: verticalValue(18, 15), marginTop: verticalValue(5, 3) },
              ]}
            >
              {report.insight.description}
            </Text>
          </View>
          <Image resizeMode="contain" source={upImage} style={styles.upImage} />
        </View>
      </View>

      <View style={[styles.nextCard, { height: layout.nextHeight, top: layout.nextTop }]}>
        <View style={styles.cardHeading}>
          <ArrowsClockwiseIcon color={colors.primaryDark} height={20} width={20} />
          <Text style={styles.cardHeadingText}>다음 운동에 반영</Text>
        </View>
        <View
          style={[styles.nextList, { gap: verticalValue(6, 2), marginTop: verticalValue(8, 4) }]}
        >
          {report.nextWorkout.map(({ description, title }, index) => {
            const hasDetail = index === report.nextWorkout.length - 1 && Boolean(description);
            return (
              <View key={title} style={[styles.nextItem, hasDetail && styles.nextItemDetailed]}>
                <CheckCircleIcon color={colors.primaryDark} height={20} width={20} />
                <View style={styles.nextItemText}>
                  <Text style={styles.nextItemTitle}>
                    {title}
                    {!hasDetail && description ? ` ${description}` : ''}
                  </Text>
                  {hasDetail && description ? (
                    <Text style={styles.nextItemDescription}>{description}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={returnHome}
        style={[styles.saveCta, { top: layout.ctaTop }]}
      >
        <Text style={styles.saveCtaLabel}>저장</Text>
      </Pressable>
    </ExerciseScreenFrame>
  );
}

const styles = StyleSheet.create({
  aiImage: { height: 110, position: 'absolute', right: 0, top: 0, width: 140 },
  back: { left: 10, position: 'absolute', zIndex: 1 },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 20 },
  cardHeadingText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 16,
    lineHeight: 20,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    left: 0,
    letterSpacing: 1.5,
    lineHeight: 21,
    position: 'absolute',
    textAlign: 'center',
    width: 412,
  },
  hero: { height: 110, left: 21, position: 'absolute', width: 370 },
  heroDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  heroText: { left: 0, position: 'absolute', top: 0, width: 220 },
  heroTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 22,
    lineHeight: 27,
    marginTop: 4,
  },
  insightCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    left: 21,
    padding: 12,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    width: 370,
  },
  insightDescription: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  insightInner: {
    backgroundColor: '#F0FAF9',
    borderRadius: 12,
    marginTop: 6,
    overflow: 'hidden',
    width: 344,
  },
  insightText: { left: 12, position: 'absolute', right: 78, top: 11 },
  insightTitle: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 14,
    lineHeight: 18,
  },
  metricCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 15,
    width: 170,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 18,
    width: 346,
  },
  metricIconCircle: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  metricLabel: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  metricText: { gap: 4, marginLeft: 10, width: 88 },
  metricValue: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    lineHeight: 25,
  },
  nextCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    left: 21,
    padding: 12,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    width: 370,
  },
  nextItem: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 20 },
  nextItemDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    lineHeight: 14,
    marginTop: 2,
  },
  nextItemDetailed: { alignItems: 'flex-start' },
  nextItemText: { flex: 1 },
  nextItemTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  nextList: { gap: 6, marginTop: 8 },
  saveCta: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    height: 45,
    justifyContent: 'center',
    left: 21,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 2.5,
    width: 370,
  },
  saveCtaLabel: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    left: 21,
    padding: 12,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    width: 370,
  },
  upImage: { bottom: 7, height: 70, position: 'absolute', right: 7, width: 70 },
});
