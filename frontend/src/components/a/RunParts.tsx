import { useCallback, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import BackIcon from '@/assets/icons/common/chevrons/Left.svg';
import type { RunningCoordinate } from '@/src/api/running';
import { Text, TextInput } from '@/src/components/common';
import { KakaoRouteMap } from '@/src/components/exercise/KakaoRouteMap';
import { routePolyline } from '@/src/features/running/courseRoute';
import { KAKAO_MAP_JS_KEY } from '@/src/features/running/kakaoMap';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';

// The pieces the running screens share, in renewal B's way.

// The top of the three kinds of exercise (오늘의 운동 · 러닝 · 자세 분석): the way back, the name of the
// one I am on, and the three side by side, as on the exercise tab.
export function KindsBar({
  title,
  kinds,
  onBack,
}: {
  title: string;
  kinds: { label: string; selected?: boolean; onPress: () => void }[];
  onBack: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <>
      <View style={styles.bar}>
        <Pressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <BackIcon color={colors.textPrimary} height={22} width={22} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.heading}>
          {title}
        </Text>
      </View>
      <View style={styles.kinds}>
        {kinds.map((kind) => (
          <Pressable hitSlop={{ bottom: 2, top: 2 }}
            key={kind.label}
            accessibilityRole="button"
            accessibilityState={{ selected: Boolean(kind.selected) }}
            onPress={kind.onPress}
            style={[styles.seg, kind.selected && styles.segOn]}
          >
            <Text style={[styles.segText, kind.selected && styles.onText]}>{kind.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

export type RunCondition = 'good' | 'normal' | 'tired';
export type RunIntensity = 'light' | 'moderate' | 'hard';

// What is asked before a run: how I feel, how hard, for how long. On a tired day the lighter run is
// set for me, and I only look it over.
export function RunSetup({
  condition,
  intensity,
  minutes,
  onCondition,
  onIntensity,
  onMinutes,
}: {
  condition: RunCondition;
  intensity: RunIntensity;
  minutes: string;
  onCondition: (value: RunCondition) => void;
  onIntensity: (value: RunIntensity) => void;
  onMinutes: (value: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [eased, setEased] = useState(false);
  const pickCondition = (value: RunCondition) => {
    onCondition(value);
    const ease = value === 'tired' && intensity !== 'light';
    if (ease) onIntensity('light');
    setEased(ease);
  };
  return (
    <View style={styles.setup}>
      <View>
        <Text style={styles.q}>오늘 컨디션은 어때요?</Text>
        <View style={styles.segRow}>
          {(
            [
              ['good', '좋아요'],
              ['normal', '보통'],
              ['tired', '피곤해요'],
            ] as const
          ).map(([value, label]) => (
            <Pressable hitSlop={{ bottom: 2, top: 2 }}
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: condition === value }}
              onPress={() => pickCondition(value)}
              style={[styles.seg, condition === value && styles.segOn]}
            >
              <Text style={[styles.segText, condition === value && styles.onText]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View>
        <Text style={styles.q}>강도</Text>
        <View style={styles.segRow}>
          {(
            [
              ['light', '가볍게'],
              ['moderate', '보통'],
              ['hard', '강하게'],
            ] as const
          ).map(([value, label]) => (
            <Pressable hitSlop={{ bottom: 2, top: 2 }}
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: intensity === value }}
              onPress={() => {
                onIntensity(value);
                setEased(false);
              }}
              style={[styles.seg, intensity === value && styles.segOn]}
            >
              <Text style={[styles.segText, intensity === value && styles.onText]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {eased ? <Text style={styles.eased}>강도를 가볍게로 맞춰 뒀어요</Text> : null}
      </View>
      <View>
        <Text style={styles.q}>목표 시간</Text>
        <View style={styles.numRow}>
          <TextInput
            accessibilityLabel="목표 러닝 시간(분)"
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={(text) => onMinutes(text.replace(/[^0-9]/g, ''))}
            style={styles.num}
            value={minutes}
          />
          <Text style={styles.unit}>분</Text>
        </View>
      </View>
    </View>
  );
}

// A route as a picture: the real map when it can be shown, or the line alone on a grid.
export function RoutePicture({
  points,
  style,
  label,
}: {
  points: RunningCoordinate[];
  style?: StyleProp<ViewStyle>;
  label: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [mapFailed, setMapFailed] = useState(false);
  const failMap = useCallback(() => setMapFailed(true), []);
  if (KAKAO_MAP_JS_KEY && points.length >= 2 && !mapFailed) {
    return (
      <View style={[styles.picture, style]}>
        <KakaoRouteMap onFailure={failMap} points={points} />
      </View>
    );
  }
  const line = routePolyline(points, 320, 220);
  const ends = line.split(' ');
  const end = (at: string | undefined, index: number) => Number(at?.split(',')[index]);
  return (
    <View style={[styles.picture, style]}>
      <Svg accessibilityLabel={label} height="100%" preserveAspectRatio="xMidYMid meet" viewBox="0 0 320 220" width="100%">
        {Array.from({ length: 9 }, (_, index) => (
          <Line key={`h${index}`} stroke={colors.surfaceMuted} strokeWidth="1" x1="0" x2="320" y1={index * 26} y2={index * 26} />
        ))}
        {Array.from({ length: 13 }, (_, index) => (
          <Line key={`v${index}`} stroke={colors.surfaceMuted} strokeWidth="1" x1={index * 27} x2={index * 27} y1="0" y2="220" />
        ))}
        {line ? (
          <>
            {/* The dark line under the violet one is its outline. */}
            <Polyline fill="none" points={line} stroke={colors.textPrimary} strokeLinecap="round" strokeLinejoin="round" strokeWidth="9" />
            <Polyline fill="none" points={line} stroke={colors.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            <Circle cx={end(ends[0], 0)} cy={end(ends[0], 1)} fill="#FFFFFF" r="6" stroke={colors.textPrimary} strokeWidth="3" />
            <Circle cx={end(ends.at(-1), 0)} cy={end(ends.at(-1), 1)} fill={colors.primary} r="6" stroke={colors.textPrimary} strokeWidth="3" />
          </>
        ) : null}
      </Svg>
      {!line ? (
        <View style={styles.pictureEmpty}>
          <Text style={styles.note}>제공된 경로 좌표가 없어요</Text>
        </View>
      ) : (
        <Text style={styles.pictureTag}>경로 도식 · 실제 지도가 아니에요</Text>
      )}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    bar: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 48 },
    back: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 22,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    backPressed: { opacity: 0.85 },
    heading: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 30, letterSpacing: -0.6, lineHeight: 38 },
    // the three kinds as one light segment
    kinds: { backgroundColor: colors.surface, borderRadius: 999, flexDirection: 'row', marginTop: 14, padding: 4 },
    segRow: { flexDirection: 'row', gap: 6, paddingBottom: 4 },
    seg: { alignItems: 'center', borderRadius: 999, flex: 1, height: 40, justifyContent: 'center' },
    segOn: a.on,
    segText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 19 },
    onText: a.onText,
    setup: { gap: 14 },
    q: a.q,
    eased: { ...a.note, marginTop: 6 },
    numRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    num: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardExtraBold,
      fontSize: 24,
      height: 46,
      padding: 0,
      textAlign: 'center',
      width: 96,
    },
    unit: { ...a.p15, color: colors.textPrimary },
    note: a.note,
    picture: { backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
    pictureEmpty: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
    pictureTag: {
      ...a.p12,
      backgroundColor: colors.surface,
      borderRadius: 99,
      color: colors.textPrimary,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 1,
      position: 'absolute',
      right: 8,
      top: 8,
    },
  } as const;
}
