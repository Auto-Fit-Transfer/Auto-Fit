import { useCallback, useRef, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';
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

// Renewal B's tab bar: a light bar with a hairline on top; icons are black, and only the open tab
// is a black pill that also says its name.
export const BOTTOM_NAVIGATION_VISUAL_HEIGHT = 66;
export const BOTTOM_NAVIGATION_MIN_BOTTOM_GAP = 8;
const minimumBottomNavigationVisualHeight = 60;
const referenceScreenHeight = 917;
const visualHeightReductionRatio = 0.04;
const barPadding = 10;
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
  my: { label: '내 정보', Icon: UserIcon, ActiveIcon: UserActiveIcon },
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
  const measureNavigation = useCallback(() => {
    navigationRef.current?.measureInWindow((x, y, width, height) => {
      onNavigationLayout?.({ height, width, x, y });
    });
  }, [onNavigationLayout]);

  // Renewal A: the home is the lobby with its own round menus, so the tab bar is not drawn there.
  if (state.routes[state.index]?.name === 'home') return null;

  return (
    <View
      ref={navigationRef}
      onLayout={measureNavigation}
      style={[
        styles.safeArea,
        {
          paddingBottom: Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP),
          paddingLeft: 12 + insets.left,
          paddingRight: 12 + insets.right,
        },
      ]}
    >
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
                isFocused ? styles.itemActive : styles.item,
                { height: itemHeight },
                pressed && styles.pressed,
              ]}
            >
              <Icon
                color={isFocused ? colors.onPrimary : colors.textPrimary}
                height={iconSize}
                width={iconSize}
              />
              {isFocused ? (
                <Text numberOfLines={1} style={[styles.label, easyMode && styles.labelEasy]}>
                  {meta.label}
                </Text>
              ) : null}
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
      backgroundColor: colors.navBar,
      borderTopColor: colors.navBarBorder,
      borderTopWidth: 1,
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      zIndex: 10,
    },
    bar: { alignItems: 'center', flexDirection: 'row' },
    // The four closed tabs share the room the open one leaves.
    item: { alignItems: 'center', flex: 1, justifyContent: 'center', minWidth: 0 },
    itemActive: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 999,
      flexDirection: 'row',
      flexShrink: 0,
      gap: 6,
      justifyContent: 'center',
      paddingHorizontal: 18,
    },
    label: { ...text.tabActive, color: colors.onPrimary, fontSize: 13, includeFontPadding: false, lineHeight: 18 },
    labelEasy: { fontSize: 13, lineHeight: 18 },
    pressed: { opacity: 0.75 },
  } as const;
}
