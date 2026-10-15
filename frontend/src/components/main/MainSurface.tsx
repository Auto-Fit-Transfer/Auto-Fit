import { useId, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import Back from '@/assets/figma/main/9c31a.svg';
import { colors, fontFamilies } from '@/src/theme';

export function MainGradient({
  top = colors.darkSoft,
  bottom = colors.dark,
  radius = 0,
}: {
  top?: string;
  bottom?: string;
  radius?: number;
}) {
  const id = `main-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0.03" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" rx={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

export function MainHeader({
  title,
  children,
  height = 270,
  back,
  topColor,
  style,
}: {
  title: string;
  children?: ReactNode;
  height?: number;
  back?: () => void;
  topColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const extra = Math.max(0, insets.top - 28);
  return (
    <View style={[styles.header, { height: height + extra }, style]}>
      <StatusBar style="light" />
      <MainGradient top={topColor} />
      <View style={[styles.titleRow, { top: 32 + extra }]}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            hitSlop={12}
            onPress={back}
            style={styles.back}
          >
            <Back />
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={[styles.headerContent, { top: 75 + extra }]}>{children}</View>
    </View>
  );
}

export function MainScreen({ children, tabs = true }: { children: ReactNode; tabs?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: (tabs ? 94 : 24) + insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export const mainStyles = StyleSheet.create({
  content: { marginHorizontal: 21, marginTop: 25, gap: 22 },
  sectionTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
    lineHeight: 26,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 15,
    boxShadow: '0px 0px 5px rgba(0,0,0,0.08)',
  },
  text: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 14,
    lineHeight: 21,
  },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  emptyTitle: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 17 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    minHeight: 44,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundPurple },
  header: {
    overflow: 'hidden',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    backgroundColor: colors.dark,
  },
  titleRow: {
    position: 'absolute',
    left: 22,
    right: 22,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textWhite,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    letterSpacing: 1.5,
  },
  back: { position: 'absolute', left: 0, top: -4 },
  backText: { color: colors.textWhite, fontSize: 34, lineHeight: 30 },
  headerContent: { position: 'absolute', left: 30, right: 30, bottom: 25 },
});
