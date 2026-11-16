import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

// Straight from its file: common's connection-error part shows this look, and the index would loop back here.
import { Text } from '@/src/components/common/Text';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { Hero } from './sprites';
import { useKeptWho } from './useKeptWho';

// Eight squares on a circle (76 wide, each 14): the bright one goes round and the ones behind it fade.
const ring = Array.from({ length: 8 }, (_, k) => ({
  left: 31 + 31 * Math.sin((k * Math.PI) / 4),
  top: 31 - 31 * Math.cos((k * Math.PI) / 4),
}));

// Renewal A's loading look, the one chosen in the prototype (a-loading.html): a ring turning, my
// character walking under it, and the word LOADING... Nothing else, on purpose. It fills the room it
// is given, for a whole screen or for a wait inside one (a health paper being read). `children` go
// under the word: why it is waiting and a way to try again, when the connection is lost.
export function ALoading({ label = '불러오는 중', children }: { label?: string; children?: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  const who = useKeptWho();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((value) => value + 1), 100);
    return () => clearInterval(timer);
  }, []);
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" accessible={!children} style={styles.root}>
      <View style={styles.spin}>
        {ring.map((at, k) => (
          <View key={k} style={[styles.dot, at, { opacity: 1 - (((step - k) % 8 + 8) % 8) * 0.11 }]} />
        ))}
      </View>
      <View style={styles.walk}>
        {/* The two frames of the walk, about as fast as on the home screen. */}
        <Hero frame={(Math.floor(step / 4) % 2) as 0 | 1} tier={0} who={who} />
        <View style={styles.shadow} />
      </View>
      <View style={styles.wordRow}>
        <Text style={styles.word}>LOADING</Text>
        <Text style={[styles.word, styles.dots]}>{'.'.repeat((Math.floor(step / 4) % 3) + 1)}</Text>
      </View>
      {children}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { alignItems: 'center', flex: 1, gap: 26, justifyContent: 'center' },
    spin: { height: 76, width: 76 },
    dot: {
      backgroundColor: colors.primary,
      borderColor: colors.ink,
      borderWidth: 2,
      height: 14,
      position: 'absolute',
      width: 14,
    },
    walk: { alignItems: 'center' },
    shadow: { backgroundColor: 'rgba(32, 35, 63, 0.16)', height: 10, marginTop: -4, width: 104 },
    wordRow: { flexDirection: 'row' },
    word: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, letterSpacing: 2, lineHeight: 28 },
    // A fixed width, so the word does not move as the dots come and go.
    dots: { letterSpacing: 0, width: 40 },
  } as const;
}
