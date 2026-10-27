import { useEffect, useId, useState, type ComponentType } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Mask, Rect, type SvgProps } from 'react-native-svg';

import ClockIcon from '@/assets/icons/input/Clock.svg';
import CheckCircleIcon from '@/assets/icons/system/CheckCircle.svg';
import WarningCircleIcon from '@/assets/icons/system/WarningCircle.svg';
import { Text } from '@/src/components/common';
import { colors, fontFamilies } from '@/src/theme';

const adjustmentBackground = require('@/assets/images/backgrounds/8_Adjusting.png');
const adjustmentIllustration = require('@/assets/images/illustrations/exercise/circles/Adjusting.png');

const referenceWidth = 412;
const referenceHeight = 917;
const compactHeight = 740;
const progressSize = 250;
const progressStrokeWidth = 10;
const progressRadius = (progressSize - progressStrokeWidth) / 2;
const progressCircumference = 2 * Math.PI * progressRadius;
const processingDotCount = 12;

type AdjustmentStageStatus = 'completed' | 'pending' | 'processing';

type AdjustmentStage = {
  completedLabel: string;
  label: string;
  status: AdjustmentStageStatus;
};

function getAdjustmentStages(progress: number): AdjustmentStage[] {
  const firstCompleted = progress >= 0.33;
  const secondCompleted = progress >= 0.66;
  const allCompleted = progress >= 1;

  return [
    {
      completedLabel: '불편 상태 분석 완료',
      label: '불편 상태 분석중',
      status: firstCompleted ? 'completed' : 'processing',
    },
    {
      completedLabel: '운동 강도 및 구성 조정 완료',
      label: '운동 강도 및 구성 조정중',
      status: secondCompleted ? 'completed' : firstCompleted ? 'processing' : 'pending',
    },
    {
      completedLabel: '남은 운동 재구성 완료',
      label: '남은 운동 재구성중',
      status: allCompleted ? 'completed' : secondCompleted ? 'processing' : 'pending',
    },
  ];
}

export function AdjustmentIndicatorView({ progress }: { progress: number }) {
  const { height, width } = useWindowDimensions();
  const widthScale = Math.min(1, width / referenceWidth);
  const canvasHeight = Math.min(referenceHeight, height / Math.max(widthScale, 0.01));
  const heightProgress = Math.max(
    0,
    Math.min(1, (canvasHeight - compactHeight) / (referenceHeight - compactHeight)),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;
  const canvasTop = (height - canvasHeight * widthScale) / 2;
  const canvasLeft = (width - referenceWidth * widthScale) / 2;
  const titleToProgressGap = verticalValue(24, 10);
  const contentStackHeight = 610 + titleToProgressGap;
  const titleTopPadding = Math.max(
    0,
    Math.min(verticalValue(129, 70), canvasHeight - 18 - contentStackHeight),
  );
  const safeProgress = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(safeProgress * 100);
  const stages = getAdjustmentStages(safeProgress);
  const progressOffset = progressCircumference * (1 - safeProgress);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.canvas,
          {
            height: canvasHeight,
            left: canvasLeft,
            top: canvasTop,
            transform: [{ scale: widthScale }],
          },
        ]}
      >
        <Image
          resizeMode="stretch"
          source={adjustmentBackground}
          style={[styles.backgroundCard, { height: Math.max(0, canvasHeight - 37) }]}
        />

        <View style={[styles.content, { paddingTop: titleTopPadding }]}>
          <View style={styles.titleSection}>
            <Text style={styles.title}>
              남은 운동을{`\n`}
              <Text style={styles.titleAccent}>조정하고 있어요</Text>
            </Text>
            <Text style={styles.description}>
              입력하신 상태를 바탕으로{`\n`}안전하게 운동을 맞춤 조정 중입니다.
            </Text>
          </View>

          <View style={{ height: titleToProgressGap }} />

          <View style={styles.progressVisual}>
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={adjustmentIllustration}
              style={styles.adjustmentIllustration}
            />
            <Svg height={progressSize} style={styles.progressSvg} width={progressSize}>
              <Circle
                cx={progressSize / 2}
                cy={progressSize / 2}
                fill="none"
                r={progressRadius}
                stroke={colors.primaryLight}
                strokeWidth={progressStrokeWidth}
              />
              <Circle
                cx={progressSize / 2}
                cy={progressSize / 2}
                fill="none"
                r={progressRadius}
                rotation="-90"
                origin={`${progressSize / 2}, ${progressSize / 2}`}
                stroke={colors.primary}
                strokeDasharray={`${progressCircumference} ${progressCircumference}`}
                strokeDashoffset={progressOffset}
                strokeLinecap="round"
                strokeWidth={progressStrokeWidth}
              />
            </Svg>
          </View>

          <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.percentage}>
            {percentage}%
          </Text>

          <View style={styles.stageCard}>
            {stages.map((stage) => (
              <AdjustmentStageRow key={stage.label} stage={stage} />
            ))}
          </View>

          <View style={styles.waitNotice}>
            <WarningCircleIcon color={colors.primaryDark} height={20} width={20} />
            <Text style={styles.waitNoticeText}>
              조정 과정은 시간이 조금 소요됩니다.{`\n`}잠시만 기다려주세요.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function AdjustmentStageRow({ stage }: { stage: AdjustmentStage }) {
  const isCompleted = stage.status === 'completed';
  const isProcessing = stage.status === 'processing';
  const color = isProcessing
    ? colors.primaryDark
    : isCompleted
      ? colors.textSecondary
      : colors.textDisabled;

  return (
    <View style={styles.stageRow}>
      {isCompleted ? (
        <TintedIcon color={colors.primaryDark} Icon={CheckCircleIcon} size={23} />
      ) : isProcessing ? (
        <ProcessingDots />
      ) : (
        <TintedIcon color={colors.textDisabled} Icon={ClockIcon} size={23} />
      )}
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.stageText, { color }]}>
        {isCompleted ? stage.completedLabel : stage.label}
      </Text>
    </View>
  );
}

function ProcessingDots() {
  const [activeDot, setActiveDot] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveDot((current) => (current + 1) % processingDotCount);
    }, 90);

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.processingDots}>
      {Array.from({ length: processingDotCount }, (_, index) => {
        const angle = (index / processingDotCount) * Math.PI * 2 - Math.PI / 2;
        const distance = (index - activeDot + processingDotCount) % processingDotCount;
        const opacity = distance === 0 ? 1 : distance === 1 ? 0.7 : distance === 2 ? 0.4 : 0.18;

        return (
          <View
            key={index}
            style={[
              styles.processingDot,
              {
                left: 10 + Math.cos(angle) * 8,
                opacity,
                top: 10 + Math.sin(angle) * 8,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function TintedIcon({
  color,
  Icon,
  size,
}: {
  color: string;
  Icon: ComponentType<SvgProps>;
  size: number;
}) {
  const maskId = `exercise-adjusting-icon-${useId().replace(/:/g, '')}`;

  return (
    <Svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <Defs>
        <Mask height={size} id={maskId} maskUnits="userSpaceOnUse" width={size} x={0} y={0}>
          <Icon height={size} width={size} />
        </Mask>
      </Defs>
      <Rect fill={color} height={size} mask={`url(#${maskId})`} width={size} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  adjustmentIllustration: { height: 270, left: 0, position: 'absolute', top: 0, width: 270 },
  backgroundCard: { left: 16, position: 'absolute', top: 19, width: 380 },
  canvas: { position: 'absolute', transformOrigin: 'top left', width: referenceWidth },
  content: { alignItems: 'center', width: referenceWidth },
  description: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  percentage: {
    color: colors.primary,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 30,
    height: 38,
    includeFontPadding: false,
    lineHeight: 38,
    marginTop: -7,
    textAlign: 'center',
    width: 90,
  },
  processingDot: {
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: 3,
    position: 'absolute',
    width: 3,
  },
  processingDots: { height: 23, position: 'relative', width: 23 },
  progressSvg: { left: 10, position: 'absolute', top: 6 },
  progressVisual: { height: 270, position: 'relative', width: 270 },
  root: { backgroundColor: colors.background, flex: 1, overflow: 'hidden' },
  stageCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    elevation: 2,
    height: 120,
    justifyContent: 'space-between',
    marginTop: 5,
    padding: 15,
    shadowColor: '#000000',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 2.5,
    width: 220,
  },
  stageRow: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 23 },
  stageText: {
    flexShrink: 1,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    lineHeight: 18,
  },
  title: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 28,
    lineHeight: 40,
    textAlign: 'center',
  },
  titleAccent: { color: colors.primaryDark },
  titleSection: { alignItems: 'center', gap: 11, width: 228 },
  waitNotice: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    marginTop: 13,
    width: 228,
  },
  waitNoticeText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    lineHeight: 17,
  },
});
