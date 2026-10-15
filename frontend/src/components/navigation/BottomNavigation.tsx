import { useCallback, useRef, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeIcon from '@/assets/figma/main/b6ef6.svg';
import HomeActiveIcon from '@/assets/figma/main/18f80.svg';
import DietIcon from '@/assets/figma/main/36b63.svg';
import DietActiveIcon from '@/assets/figma/main/5c76f.svg';
import ExerciseIcon from '@/assets/figma/main/bb536.svg';
import ExerciseActiveIcon from '@/assets/figma/main/6a102.svg';
import CommunityIcon from '@/assets/figma/main/73de7.svg';
import CommunityActiveIcon from '@/assets/figma/main/3846e.svg';
import MyIcon from '@/assets/figma/main/792cf.svg';
import MyActiveIcon from '@/assets/figma/main/86e3d.svg';
import { MainGradient } from '@/src/components/main/MainSurface';
import { colors, fontFamilies, shadows, spacing } from '@/src/theme';

export const BOTTOM_NAVIGATION_VISUAL_HEIGHT = 70;
export const BOTTOM_NAVIGATION_MIN_BOTTOM_GAP = spacing.sm;
const minimumBottomNavigationVisualHeight = 64;
const referenceScreenHeight = 917;
const visualHeightReductionRatio = 0.04;

export function getBottomNavigationVisualHeight(windowHeight: number) {
  return Math.max(
    minimumBottomNavigationVisualHeight,
    BOTTOM_NAVIGATION_VISUAL_HEIGHT -
      Math.max(0, referenceScreenHeight - windowHeight) * visualHeightReductionRatio,
  );
}

const bottomNavigationShadow: ViewStyle = Platform.OS === 'android' ? {} : shadows.card;

const tabMeta = {
  home: { label: '홈', Icon: HomeIcon, ActiveIcon: HomeActiveIcon },
  diet: { label: '식단', Icon: DietIcon, ActiveIcon: DietActiveIcon },
  exercise: { label: '운동', Icon: ExerciseIcon, ActiveIcon: ExerciseActiveIcon },
  community: { label: '커뮤니티', Icon: CommunityIcon, ActiveIcon: CommunityActiveIcon },
  my: { label: '마이', Icon: MyIcon, ActiveIcon: MyActiveIcon },
} as const;

type TabsProps = ComponentProps<typeof Tabs>;
type NativeTabsProps = Parameters<NonNullable<TabsProps['tabBar']>>[0];

export interface BottomNavigationLayout {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface BottomNavigationProps extends NativeTabsProps {
  onNavigationLayout?: (layout: BottomNavigationLayout) => void;
}

export function BottomNavigation({
  state,
  descriptors,
  navigation,
  onNavigationLayout,
}: BottomNavigationProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const navigationRef = useRef<View>(null);
  const visualHeight = getBottomNavigationVisualHeight(windowHeight);
  const itemHeight = visualHeight - 10;
  const isDiet = state.routes[state.index]?.name === 'diet';
  const measureNavigation = useCallback(() => {
    navigationRef.current?.measureInWindow((x, y, width, height) => {
      onNavigationLayout?.({ height, width, x, y });
    });
  }, [onNavigationLayout]);

  return (
    <View
      ref={navigationRef}
      onLayout={measureNavigation}
      style={[
        styles.safeArea,
        {
          paddingBottom: Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP),
          paddingLeft: 6 + insets.left,
          paddingRight: 6 + insets.right,
        },
      ]}
    >
      {isDiet ? (
        <View
          pointerEvents="none"
          style={[
            styles.dietLowerMask,
            Platform.OS === 'web' && styles.webDietLowerMask,
            { top: visualHeight / 2 },
          ]}
        />
      ) : null}
      {Platform.OS === 'android' ? (
        <View pointerEvents="none" style={[styles.androidShadowLayer, { height: visualHeight }]} />
      ) : null}
      <View style={[styles.bar, bottomNavigationShadow, { height: visualHeight }]}>
        <MainGradient radius={50} />
        {state.routes.map((route, index) => {
          const meta = tabMeta[route.name as keyof typeof tabMeta];
          if (!meta) return null;
          const isFocused = state.index === index;
          const color = isFocused ? colors.primaryMedium : colors.textWhite;
          const Icon = isFocused ? meta.ActiveIcon : meta.Icon;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented)
              navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={
                descriptors[route.key].options.tabBarAccessibilityLabel ?? meta.label
              }
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              onPress={onPress}
              style={({ pressed }) => [
                styles.item,
                { height: itemHeight },
                isFocused && styles.itemActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon />
              <Text style={[styles.label, { color }]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.transparent,
    bottom: 0,
    left: 0,
    paddingHorizontal: 6,
    pointerEvents: 'box-none',
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  bar: {
    backgroundColor: colors.dark,
    borderRadius: 30,
    flexDirection: 'row',
    padding: 5,
    zIndex: 1,
  },
  androidShadowLayer: {
    backgroundColor: colors.dark,
    borderRadius: 30,
    boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.10)',
    elevation: 0,
    left: 6,
    position: 'absolute',
    right: 6,
  },
  dietLowerMask: {
    backgroundColor: colors.background,
    bottom: 0,
    left: -6,
    position: 'absolute',
    right: -6,
    zIndex: 0,
  },
  webDietLowerMask: { left: 0, right: 0 },
  item: {
    alignItems: 'center',
    borderRadius: 30,
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minWidth: 0,
  },
  itemActive: { backgroundColor: 'rgba(120,102,244,0.3)' },
  label: {
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    includeFontPadding: false,
    lineHeight: 15,
  },
  pressed: { opacity: 0.7 },
});
