import { useCallback, useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CloseIcon from '@/assets/icons/common/X.svg';
import { colors, radius, shadows, spacing, typography } from '@/src/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

export interface AppBottomSheetProps extends PropsWithChildren {
  visible: boolean;
  onClose: () => void;
  title?: string;
  showHandle?: boolean;
  scrollable?: boolean | 'when-overflow';
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
  overlayStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
  separateAnimations?: boolean;
  animationDistance?: number;
  sheetOffset?: Animated.Value;
  lockBackgroundScroll?: boolean;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  minimumTopGap?: number;
  preserveViewportHeightWhileVisible?: boolean;
}

export function AppBottomSheet({
  visible,
  onClose,
  title,
  showHandle = true,
  scrollable = false,
  footer,
  children,
  contentStyle,
  handleStyle,
  overlayStyle,
  sheetStyle,
  separateAnimations = false,
  animationDistance = 420,
  sheetOffset,
  lockBackgroundScroll = false,
  keyboardShouldPersistTaps,
  minimumTopGap,
  preserveViewportHeightWhileVisible = false,
}: AppBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(visible);
  const [dimOpacity] = useState(() => new Animated.Value(0));
  const [sheetTranslateY] = useState(() => new Animated.Value(420));
  const [sheetHeight, setSheetHeight] = useState(0);
  const [contentTop, setContentTop] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [lockedViewportHeight] = useState(windowHeight);

  const layoutViewportHeight = preserveViewportHeightWhileVisible
    ? lockedViewportHeight
    : windowHeight;

  const updateMeasurement = useCallback(
    (setter: (value: number) => void, previous: number, next: number) => {
      if (Math.abs(previous - next) > 0.5) setter(next);
    },
    [],
  );

  useEffect(() => {
    if (!separateAnimations) return;

    const useNativeDriver = Platform.OS !== 'web';

    if (visible) {
      let animationFrame: number | undefined;
      const mountFrame = requestAnimationFrame(() => {
        setIsMounted(true);
        dimOpacity.setValue(0);
        sheetTranslateY.setValue(animationDistance);

        animationFrame = requestAnimationFrame(() => {
          Animated.parallel([
            Animated.timing(dimOpacity, {
              duration: 260,
              easing: Easing.out(Easing.cubic),
              toValue: 1,
              useNativeDriver,
            }),
            Animated.timing(sheetTranslateY, {
              duration: 280,
              easing: Easing.out(Easing.cubic),
              toValue: 0,
              useNativeDriver,
            }),
          ]).start();
        });
      });

      return () => {
        cancelAnimationFrame(mountFrame);
        if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      };
    }

    Animated.parallel([
      Animated.timing(dimOpacity, {
        duration: 220,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 240,
        easing: Easing.in(Easing.cubic),
        toValue: animationDistance,
        useNativeDriver,
      }),
    ]).start(({ finished }) => {
      if (finished) setIsMounted(false);
    });
  }, [animationDistance, dimOpacity, separateAnimations, sheetTranslateY, visible]);

  const modalVisible = separateAnimations ? isMounted : visible;

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      !lockBackgroundScroll ||
      !modalVisible ||
      typeof document === 'undefined'
    ) {
      return;
    }

    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscrollBehavior = root.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscrollBehavior;
    };
  }, [lockBackgroundScroll, modalVisible]);

  const sheetBottomPadding = Math.max(insets.bottom, spacing.lg);
  const availableContentHeight = Math.max(
    0,
    sheetHeight - contentTop - footerHeight - sheetBottomPadding,
  );
  const scrollsOnlyWhenOverflowing = scrollable === 'when-overflow';
  const contentOverflows =
    scrollsOnlyWhenOverflowing &&
    availableContentHeight > 0 &&
    contentHeight > availableContentHeight + 0.5;

  const handleStaticContentLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number; y: number } } }) => {
      const { height, y } = event.nativeEvent.layout;
      updateMeasurement(setContentTop, contentTop, y);
      updateMeasurement(setContentHeight, contentHeight, height);
    },
    [contentHeight, contentTop, updateMeasurement],
  );

  const handleScrollLayout = useCallback(
    (event: { nativeEvent: { layout: { y: number } } }) => {
      updateMeasurement(setContentTop, contentTop, event.nativeEvent.layout.y);
    },
    [contentTop, updateMeasurement],
  );

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      updateMeasurement(setContentHeight, contentHeight, height);
    },
    [contentHeight, updateMeasurement],
  );

  const content =
    scrollable === true || contentOverflows ? (
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        onContentSizeChange={scrollsOnlyWhenOverflowing ? handleContentSizeChange : undefined}
        onLayout={scrollsOnlyWhenOverflowing ? handleScrollLayout : undefined}
        scrollEnabled={scrollable === true || contentOverflows}
        showsVerticalScrollIndicator={false}
        style={scrollsOnlyWhenOverflowing ? styles.overflowScroll : undefined}
      >
        {children}
      </ScrollView>
    ) : (
      <View
        onLayout={scrollsOnlyWhenOverflowing ? handleStaticContentLayout : undefined}
        style={[styles.content, contentStyle]}
      >
        {children}
      </View>
    );
  const sheetContent = (
    <>
      {showHandle ? <View style={[styles.handle, handleStyle]} /> : null}
      {title ? (
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <IconButton
            accessibilityLabel="닫기"
            icon={<CloseIcon color={colors.textBody} height={24} width={24} />}
            onPress={onClose}
          />
        </View>
      ) : null}
      {content}
      {footer ? (
        <View
          onLayout={
            scrollsOnlyWhenOverflowing
              ? (event) =>
                  updateMeasurement(setFooterHeight, footerHeight, event.nativeEvent.layout.height)
              : undefined
          }
          style={styles.footer}
        >
          {footer}
        </View>
      ) : null}
    </>
  );
  const sheetStyles = [
    styles.sheet,
    shadows.bottomSheet,
    minimumTopGap !== undefined && {
      maxHeight: Math.max(0, layoutViewportHeight - Math.max(minimumTopGap, insets.top + spacing.sm)),
    },
    { paddingBottom: sheetBottomPadding },
    sheetStyle,
  ];

  const animatedTranslateY = sheetOffset
    ? Animated.subtract(sheetTranslateY, sheetOffset)
    : sheetTranslateY;
  const animatedSheet = (
    <Animated.View
      accessibilityViewIsModal
      onLayout={
        scrollsOnlyWhenOverflowing
          ? (event) =>
              updateMeasurement(setSheetHeight, sheetHeight, event.nativeEvent.layout.height)
          : undefined
      }
      style={[sheetStyles, { transform: [{ translateY: animatedTranslateY }] }]}
    >
      {sheetContent}
    </Animated.View>
  );
  const staticSheet = (
    <View
      accessibilityViewIsModal
      onLayout={
        scrollsOnlyWhenOverflowing
          ? (event) =>
              updateMeasurement(setSheetHeight, sheetHeight, event.nativeEvent.layout.height)
          : undefined
      }
      style={sheetStyles}
    >
      {sheetContent}
    </View>
  );
  const renderedSheet = separateAnimations ? animatedSheet : staticSheet;

  return (
    <Modal
      animationType={separateAnimations ? 'none' : 'slide'}
      onRequestClose={onClose}
      transparent
      visible={modalVisible}
    >
      <View
        style={[
          styles.overlay,
          Platform.OS === 'web' && styles.webOverlay,
          separateAnimations && styles.separateOverlay,
          !separateAnimations && overlayStyle,
        ]}
      >
        {separateAnimations ? (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.dimLayer,
              overlayStyle,
              { opacity: dimOpacity },
            ]}
          />
        ) : null}
        <Pressable
          accessibilityLabel="바텀시트 닫기"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        {renderedSheet}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' },
  webOverlay: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  separateOverlay: { backgroundColor: colors.transparent },
  dimLayer: { backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.round,
    height: 5,
    marginTop: spacing.sm,
    width: 42,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
  },
  title: { ...typography.title, color: colors.textPrimary, flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  overflowScroll: { flexGrow: 0, flexShrink: 1 },
  footer: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
});
