import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BackHandler,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BarbellIcon from '@/assets/icons/deco/Barbell.svg';
import FireIcon from '@/assets/icons/deco/Fire.svg';
import BigSmileyIcon from '@/assets/icons/face/BigSmiley.svg';
import SmileyIcon from '@/assets/icons/face/Smiley.svg';
import SmileyMehIcon from '@/assets/icons/face/SmileyMeh.svg';
import SmileySadIcon from '@/assets/icons/face/SmileySad.svg';
import SmileyXEyesIcon from '@/assets/icons/face/SmileyXEyes.svg';
import ClockIcon from '@/assets/icons/input/Clock.svg';
import CheckBoldIcon from '@/assets/icons/system/Check_Bold.svg';
import CheckCircleIcon from '@/assets/icons/system/CheckCircle.svg';
import LightbulbIcon from '@/assets/icons/system/Lightbulb.svg';
import { BackButton } from '@/src/components/common/BackButton';
import {
  getExerciseApiErrorMessage,
  saveExerciseSessionFeedback,
} from '@/src/api/exercise';
import {
  createInitialExerciseResultRecord,
  exerciseDiscomfortAreas,
  exercisePostStates,
  type ExerciseDifficulty,
  type ExerciseDiscomfortArea,
  type ExercisePostState,
} from '@/src/features/exercise/exerciseResultMocks';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { colors, fontFamilies } from '@/src/theme';

const referenceWidth = 412;
const referenceHeight = 917;
const compactHeight = 740;
// BigSmiley's visible circle occupies 75% of its 40px viewBox, while the other
// face assets occupy about 81% of their 32px viewBoxes. This keeps visual bounds equal.
const veryGoodFaceIconSize = 44;

const faceIcons = {
  'very-good': BigSmileyIcon,
  good: SmileyIcon,
  neutral: SmileyMehIcon,
  tired: SmileySadIcon,
  'very-tired': SmileyXEyesIcon,
} satisfies Record<ExercisePostState, typeof SmileyIcon>;

const postConditionValues = {
  'very-good': 'very_good',
  good: 'good',
  neutral: 'normal',
  tired: 'bad',
  'very-tired': 'very_bad',
} as const;

function formatDuration(durationMinutes: number | null | undefined) {
  if (durationMinutes === null || durationMinutes === undefined) return '35:28';
  return `${String(durationMinutes).padStart(2, '0')}:00`;
}

export default function ExerciseResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { latestSession, markResultRecordCompleted } = useExerciseRoutine();
  const { clearSession } = useExerciseSession();
  const [record, setRecord] = useState(createInitialExerciseResultRecord);
  const [isSaving, setIsSaving] = useState(false);
  const widthScale = Math.min(1, windowWidth / referenceWidth);
  const logicalHeight = windowHeight / Math.max(widthScale, 0.01);
  const homeResponsiveHeight =
    Platform.OS === 'android' ? Dimensions.get('screen').height : windowHeight;
  const homeHeaderHeightProgress = Math.max(
    0,
    Math.min(1, (homeResponsiveHeight - compactHeight) / (referenceHeight - compactHeight)),
  );
  const homeHeaderVerticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * homeHeaderHeightProgress;
  const availableWidth = windowWidth - insets.left - insets.right;
  const homeHeaderWidthScale = Math.min(1, availableWidth / referenceWidth);
  const homeHeaderCanvasTop = Math.max(0, insets.top + 8 - 38 * homeHeaderWidthScale);
  const headerTop =
    (homeHeaderCanvasTop + homeHeaderVerticalValue(38, 30) * homeHeaderWidthScale) /
    Math.max(widthScale, 0.01);
  const heightProgress = Math.max(
    0,
    Math.min(1, (logicalHeight - compactHeight) / (referenceHeight - compactHeight)),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;
  const cardGap = verticalValue(15, 10);
  const difficultyHeight = verticalValue(150, 128);
  const stateHeight = verticalValue(150, 128);
  const discomfortHeight = verticalValue(150, 133);
  const summaryHeight = verticalValue(150, 128);
  const difficultyTop = verticalValue(175, 126);
  const stateTop = difficultyTop + difficultyHeight + cardGap;
  const discomfortTop = stateTop + stateHeight + cardGap;
  const summaryTop = discomfortTop + discomfortHeight + cardGap;
  // Shared with the AI report so both post-workout CTAs sit on the same baseline.
  const ctaTop = verticalValue(850, 683);
  const layout = {
    // Match the exercise Home title's Safe Area-aware header baseline.
    backTop: headerTop - 14,
    cardGap: verticalValue(18, 9),
    ctaTop,
    difficultyHeight,
    difficultyTop,
    discomfortHeight,
    discomfortTop,
    headerTop,
    introTop: verticalValue(89, 57),
    stateHeight,
    stateTop,
    summaryHeight,
    summaryTop,
  };
  const resultSummary = useMemo(
    () => [
      { Icon: ClockIcon, label: '총 운동 시간', value: formatDuration(latestSession?.durationMinutes) },
      { Icon: BarbellIcon, label: '운동 개수', value: `${latestSession?.itemCount ?? 5}개` },
      { Icon: FireIcon, label: '소모 칼로리', value: `${latestSession?.calories ?? 236} kcal` },
    ],
    [latestSession],
  );

  const handleBack = useCallback(() => {
    if (source === 'completion') {
      router.back();
      return;
    }
    router.dismissTo('/exercise');
  }, [router, source]);
  const selectDifficulty = (difficulty: ExerciseDifficulty) =>
    setRecord((current) => ({ ...current, difficulty }));
  const selectPostState = (postState: ExercisePostState) =>
    setRecord((current) => ({ ...current, postState }));
  const toggleDiscomfortArea = (area: ExerciseDiscomfortArea) => {
    setRecord((current) => {
      if (area === 'none') return { ...current, discomfortAreas: ['none'] };

      const selectedAreas = current.discomfortAreas.filter((selected) => selected !== 'none');
      const isSelected = selectedAreas.includes(area);
      return {
        ...current,
        discomfortAreas: isSelected
          ? selectedAreas.filter((selected) => selected !== area)
          : [...selectedAreas, area],
      };
    });
  };
  const saveRecord = async () => {
    if (isSaving) return;
    const sessionId = latestSession?.sessionId;
    if (!sessionId) {
      Alert.alert('기록 저장 실패', '완료된 운동 세션 정보를 찾지 못했어요.');
      return;
    }

    setIsSaving(true);
    try {
      await saveExerciseSessionFeedback(sessionId, {
        note: null,
        perceivedDifficulty: record.difficulty,
        postCondition: postConditionValues[record.postState],
        uncomfortableAreas: record.discomfortAreas.filter((area) => area !== 'none'),
      });
      markResultRecordCompleted();
      clearSession();
      requestAnimationFrame(() =>
        router.replace({
          pathname: '/exercise/ai-report',
          params: {
            resultSource: source === 'completion' ? 'completion' : 'home',
            source: 'record',
          },
        }),
      );
    } catch (error) {
      console.error('Exercise feedback save failed:', error);
      Alert.alert('기록 저장 실패', getExerciseApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.canvas,
          {
            height: logicalHeight,
            left: (windowWidth - referenceWidth * widthScale) / 2,
            transform: [{ scale: widthScale }],
          },
        ]}
      >
        <BackButton onPress={handleBack} style={[styles.back, { top: layout.backTop }]} />
        <Text pointerEvents="none" style={[styles.headerTitle, { top: layout.headerTop }]}>
          운동 결과 기록
        </Text>

        <View style={[styles.intro, { top: layout.introTop }]}>
          <Text style={styles.introTitle}>오늘 운동은 어떠셨나요?</Text>
          <Text style={styles.introDescription}>솔직한 기록이 더 좋은 루틴으로 이어져요.</Text>
        </View>

        <View style={[styles.card, { gap: layout.cardGap, height: layout.difficultyHeight, top: layout.difficultyTop }]}>
          <SectionHeading title="운동 난이도" />
          <DifficultyProgress difficulty={record.difficulty} onChange={selectDifficulty} />
        </View>

        <View style={[styles.card, { gap: verticalValue(15, 8), height: layout.stateHeight, top: layout.stateTop }]}>
          <SectionHeading title="운동 후 상태" />
          <View style={styles.stateRow}>
            {exercisePostStates.map(({ key, label }) => {
              const Icon = faceIcons[key];
              const selected = record.postState === key;
              const iconSize = key === 'very-good' ? veryGoodFaceIconSize : 40;
              return (
                <Pressable key={key} onPress={() => selectPostState(key)} style={styles.stateItem}>
                  <View
                    style={[
                      styles.faceIconWrapper,
                      selected && styles.faceIconWrapperSelected,
                    ]}
                  >
                    <Icon
                      color={selected ? colors.primary : colors.textDisabled}
                      height={iconSize}
                      width={iconSize}
                    />
                  </View>
                  <Text style={[styles.stateLabel, selected && styles.stateLabelSelected]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { height: layout.discomfortHeight, top: layout.discomfortTop }]}>
          <View
            style={[
              styles.discomfortContent,
              { height: layout.discomfortHeight - verticalValue(24, 16) },
            ]}
          >
            <View style={styles.discomfortHeading}>
              <CheckCircleIcon color={colors.primary} height={25} width={25} />
              <Text style={styles.cardTitle}>불편했던 부위가 있었나요?</Text>
              <Text style={styles.headingHelper}>(복수 선택 가능)</Text>
            </View>
            <View style={styles.discomfortRow}>
              {exerciseDiscomfortAreas.map(({ key, label }) => {
                const selected = record.discomfortAreas.includes(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleDiscomfortArea(key)}
                    style={[styles.discomfortChip, selected && styles.discomfortChipSelected]}
                  >
                    <Text style={[styles.discomfortLabel, selected && styles.discomfortLabelSelected]}>
                      {label}
                    </Text>
                    {selected ? (
                      <CheckBoldIcon
                        color={colors.primaryDark}
                        height={16}
                        style={styles.chipCheck}
                        width={16}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.infoBanner}>
              <View style={styles.infoIcon}>
                <LightbulbIcon color={colors.primaryDark} height={14} width={14} />
              </View>
              <Text style={styles.infoText}>통증이나 불편함이 지속되면 전문가와 상담해보세요.</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { gap: verticalValue(18, 8), height: layout.summaryHeight, top: layout.summaryTop }]}>
          <SectionHeading title="완료 요약" />
          <View style={styles.summaryRow}>
            {resultSummary.map(({ Icon, label, value }, index) => (
              <View key={label} style={styles.summaryItem}>
                {index > 0 ? <View style={styles.summaryDivider} /> : null}
                <Icon color={colors.primary} fill={colors.primary} height={27} width={27} />
                <Text style={styles.summaryLabel}>{label}</Text>
                <Text style={styles.summaryValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void saveRecord()}
          style={[styles.saveCta, { top: layout.ctaTop }]}
        >
          <Text style={styles.saveCtaLabel}>기록 완료</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <View style={styles.cardHeading}>
      <CheckCircleIcon color={colors.primary} height={25} width={25} />
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
  );
}

function DifficultyProgress({
  difficulty,
  onChange,
}: {
  difficulty: ExerciseDifficulty;
  onChange: (difficulty: ExerciseDifficulty) => void;
}) {
  const selectedIndex = difficulty - 1;
  const activeLineWidth = selectedIndex * 76;
  return (
    <View style={styles.difficultyControl}>
      <View style={styles.difficultyLineBack} />
      <View style={[styles.difficultyLineActive, { width: activeLineWidth }]} />
      {[1, 2, 3, 4, 5].map((value, index) => {
        const selected = index === selectedIndex;
        const complete = index < selectedIndex;
        const diameter = selected ? 40 : 25;
        const centerX = 12.5 + index * 76;
        return (
          <Pressable
            key={value}
            accessibilityLabel={`${value}단계 난이도`}
            onPress={() => onChange(value as ExerciseDifficulty)}
            style={[
              styles.difficultyDot,
              {
                backgroundColor: complete || selected ? colors.primary : colors.textDisabled,
                height: diameter,
                left: centerX - diameter / 2,
                top: selected ? 0 : 8,
                width: diameter,
              },
            ]}
          >
            <Text style={styles.difficultyDotText}>{value}</Text>
          </Pressable>
        );
      })}
      <Text style={[styles.difficultyScaleLabel, styles.difficultyScaleStart]}>쉬움</Text>
      <Text style={styles.difficultyScaleCurrent}>보통</Text>
      <Text style={[styles.difficultyScaleLabel, styles.difficultyScaleEnd]}>어려움</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { left: 10, position: 'absolute', zIndex: 1 },
  canvas: { position: 'absolute', top: 0, transformOrigin: 'top left', width: referenceWidth },
  card: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    left: 21,
    paddingHorizontal: 15,
    position: 'absolute',
    width: 370,
  },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: 5, height: 25 },
  cardTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 18,
    letterSpacing: 0.9,
    lineHeight: 25,
  },
  chipCheck: { position: 'absolute', right: -1, top: -1 },
  difficultyControl: { height: 59, position: 'relative', width: 330 },
  difficultyDot: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    position: 'absolute',
  },
  difficultyDotText: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    letterSpacing: 0.75,
    lineHeight: 20,
  },
  difficultyLineActive: {
    backgroundColor: colors.primary,
    height: 5,
    left: 13,
    position: 'absolute',
    top: 18,
  },
  difficultyLineBack: {
    backgroundColor: colors.border,
    height: 5,
    left: 13,
    position: 'absolute',
    top: 18,
    width: 304,
  },
  difficultyScaleCurrent: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 11,
    left: 152,
    letterSpacing: 0.55,
    lineHeight: 15,
    position: 'absolute',
    textAlign: 'center',
    top: 44,
    width: 26,
  },
  difficultyScaleEnd: { right: 1 },
  difficultyScaleLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 11,
    letterSpacing: 0.55,
    lineHeight: 15,
    position: 'absolute',
    top: 44,
  },
  difficultyScaleStart: { left: 3 },
  discomfortChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    position: 'relative',
    width: 60,
  },
  discomfortChipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primaryDark },
  discomfortContent: { justifyContent: 'space-between', width: 330 },
  discomfortHeading: { alignItems: 'center', flexDirection: 'row', gap: 5, height: 25, width: 330 },
  discomfortLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 21,
  },
  discomfortLabelSelected: { color: colors.primaryDark },
  discomfortRow: { flexDirection: 'row', justifyContent: 'space-between', width: 330 },
  faceIconWrapper: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: colors.transparent,
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 40,
  },
  faceIconWrapperSelected: { backgroundColor: colors.primaryLight },
  headerTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    left: 0,
    letterSpacing: 1.5,
    lineHeight: 21,
    position: 'absolute',
    textAlign: 'center',
    width: 412,
  },
  headingHelper: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
    letterSpacing: 0.65,
    lineHeight: 18,
  },
  infoBanner: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    height: 35,
    paddingHorizontal: 10,
    width: 330,
  },
  infoIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(73, 205, 177, 0.25)',
    borderRadius: 999,
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  infoText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  intro: { alignItems: 'center', left: 0, position: 'absolute', width: 412 },
  introDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    letterSpacing: 0.75,
    lineHeight: 21,
    marginTop: 10,
  },
  introTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 22,
    letterSpacing: 1.1,
    lineHeight: 30,
  },
  root: { backgroundColor: colors.background, flex: 1, overflow: 'hidden' },
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
  stateItem: { alignItems: 'center', gap: 5, height: 65, justifyContent: 'center', width: 60 },
  stateLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    width: 60,
  },
  stateLabelSelected: { color: colors.primaryDark },
  stateRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    width: 330,
  },
  summaryDivider: { backgroundColor: colors.border, height: 50, left: 0, position: 'absolute', top: 10, width: 1 },
  summaryItem: { alignItems: 'center', flex: 1, gap: 4, height: 70, justifyContent: 'center' },
  summaryLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 21,
  },
  summaryRow: { alignItems: 'center', flexDirection: 'row', height: 70, width: 340 },
  summaryValue: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    lineHeight: 28,
  },
});
