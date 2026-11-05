import { useCallback, useRef, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import BarbellActiveIcon from '@/assets/icons/ui/barbell-fill.svg';
import ChatsIcon from '@/assets/icons/ui/chats-circle.svg';
import ChatsActiveIcon from '@/assets/icons/ui/chats-circle-fill.svg';
import ForkKnifeIcon from '@/assets/icons/ui/fork-knife.svg';
import ForkKnifeActiveIcon from '@/assets/icons/ui/fork-knife-fill.svg';
import HouseIcon from '@/assets/icons/ui/house.svg';
import HouseActiveIcon from '@/assets/icons/ui/house-fill.svg';
import UserIcon from '@/assets/icons/ui/user.svg';
import UserActiveIcon from '@/assets/icons/ui/user-fill.svg';
import { Text } from '@/src/components/common';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// The Figma tab bar: a floating dark pill; the open tab is a purple pill inside it.
export const BOTTOM_NAVIGATION_VISUAL_HEIGHT = 66;
export const BOTTOM_NAVIGATION_MIN_BOTTOM_GAP = 8;
const minimumBottomNavigationVisualHeight = 60;
const referenceScreenHeight = 917;
const visualHeightReductionRatio = 0.04;
const barPadding = 6;
const easyExtraHeight = 8;

export function getBottomNavigationVisualHeight(windowHeight: number) {
  return Math.max(
    minimumBottomNavigationVisualHeight,
    BOTTOM_NAVIGATION_VISUAL_HEIGHT -
      Math.max(0, referenceScreenHeight - windowHeight) * visualHeightReductionRatio,
  );
}

const tabMeta = {
  home: { label: '홈', Icon: HouseIcon, ActiveIcon: HouseActiveIcon },
  diet: { label: '식단', Icon: ForkKnifeIcon, ActiveIcon: ForkKnifeActiveIcon },
  exercise: { label: '운동', Icon: BarbellIcon, ActiveIcon: BarbellActiveIcon },
  community: { label: '커뮤니티', Icon: ChatsIcon, ActiveIcon: ChatsActiveIcon },
  my: { label: '마이', Icon: UserIcon, ActiveIcon: UserActiveIcon },
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
  emitter,
  navigateToTab,
  onNavigationLayout,
}: BottomNavigationProps) {
  const insets = useSafeAreaInsets();
  const { colors, easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { height: windowHeight } = useWindowDimensions();
  const navigationRef = useRef<View>(null);
  const visualHeight =
    getBottomNavigationVisualHeight(windowHeight) + (easyMode ? easyExtraHeight : 0);
  const itemHeight = visualHeight - barPadding * 2;
  const iconSize = easyMode ? 26 : 24;
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
          paddingLeft: 16 + insets.left,
          paddingRight: 16 + insets.right,
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
      <View style={[styles.bar, { height: visualHeight }]}>
        {state.routes.map((route, index) => {
          const meta = tabMeta[route.name as keyof typeof tabMeta];
          if (!meta) return null;
          const isFocused = state.index === index;
          const Icon = isFocused ? meta.ActiveIcon : meta.Icon;

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) navigateToTab(route.key);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={
                descriptors[route.key].options.tabBarAccessibilityLabel ?? meta.label
              }
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              onPress={onPress}
              style={({ pressed }) => [
                styles.item,
                { height: itemHeight },
                isFocused && styles.itemActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon color={colors.onPrimary} height={iconSize} width={iconSize} />
              <Text
                style={[
                  isFocused ? styles.labelActive : styles.label,
                  easyMode && styles.labelEasy,
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    safeArea: {
      backgroundColor: colors.transparent,
      bottom: 0,
      left: 0,
      pointerEvents: 'box-none',
      position: 'absolute',
      right: 0,
      zIndex: 10,
    },
    bar: {
      backgroundColor: colors.tabBar,
      borderColor: colors.tabBarBorder,
      borderRadius: 32,
      borderWidth: 1,
      elevation: 6,
      flexDirection: 'row',
      padding: barPadding - 1,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.14,
      shadowRadius: 18,
      zIndex: 1,
    },
    dietLowerMask: {
      backgroundColor: colors.background,
      bottom: 0,
      left: -16,
      position: 'absolute',
      right: -16,
      zIndex: 0,
    },
    webDietLowerMask: { left: 0, right: 0 },
    item: {
      alignItems: 'center',
      borderRadius: 26,
      flex: 1,
      gap: 3,
      justifyContent: 'center',
      minWidth: 0,
    },
    itemActive: { backgroundColor: colors.primary },
    label: { ...text.tab, color: colors.onPrimary, includeFontPadding: false },
    labelActive: { ...text.tabActive, color: colors.onPrimary, includeFontPadding: false },
    // Figma's easy tab bar uses 14px labels; Text enlarges 11px to exactly that.
    labelEasy: { fontSize: 11, lineHeight: 14 },
    pressed: { opacity: 0.75 },
  } as const;
}
