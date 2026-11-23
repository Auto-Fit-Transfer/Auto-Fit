import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';

import AutofitWordmark from '@/assets/icons/autofit-wordmark.svg';
import { useThemedStyles, type AppTheme } from '@/src/theme';

const TRACK = 120;

// Renewal B's wait (b-loading.html): the name of the app and a lilac line that slides. Nothing else, on
// purpose. It fills the room it is given, for a whole screen or for a wait inside one. `children` go under
// the line: why it is waiting and a way to try again, when the connection is lost.
export function ALoading({ label = '불러오는 중', children }: { label?: string; children?: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  const [at] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(at, { duration: 1100, easing: Easing.inOut(Easing.ease), toValue: 1, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [at]);
  // the bar is 40% of the track: from just before its left edge to past its right edge
  const translateX = at.interpolate({ inputRange: [0, 1], outputRange: [-TRACK * 0.4, TRACK] });
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" accessible={!children} style={styles.root}>
      <AutofitWordmark accessibilityLabel="autofit" height={34} width={124} />
      <View style={styles.track}>
        <Animated.View style={[styles.bar, { transform: [{ translateX }] }]} />
      </View>
      {children}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { alignItems: 'center', flex: 1, gap: 22, justifyContent: 'center' },
    track: { backgroundColor: colors.surfaceMuted, borderRadius: 2, height: 4, overflow: 'hidden', width: TRACK },
    bar: { backgroundColor: colors.lilac, borderRadius: 2, height: '100%', width: TRACK * 0.4 },
  } as const;
}
