import { useState, type ReactNode } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/src/components/common';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { Hero, pixelated, street, STREET, type Who } from './sprites';
import { useKeptWho } from './useKeptWho';

const names: Record<Who, string> = {
  'worker-f': '직장인 여성',
  'worker-m': '직장인 남성',
  'student-f': '학생 여성',
  'student-m': '학생 남성',
};

// Joining is making my character: the street with the character on it, above what each step asks.
// `who` is given while it is being chosen (the first step); later steps show the one kept on this phone.
// `pair` shows it as it starts next to what it can become (the lowest and the highest tier).
// The login screen uses it too, without the frame and with the name of the game over it (children).
export function JoinScene({
  who: chosen,
  pair = false,
  tier = 0,
  bigFrom = 290,
  style,
  children,
}: {
  who?: Who;
  pair?: boolean;
  tier?: number;
  // The height from which the character is drawn at its full size.
  bigFrom?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  const kept = useKeptWho(chosen !== undefined);
  const [height, setHeight] = useState(0);
  const who = chosen ?? kept;
  // The character at its full size where there is room, half of it on a short screen or above a long form.
  const zoom = height >= bigFrom ? 2 : 1;
  const k = zoom / 2;
  return (
    <View
      accessibilityLabel={pair ? `${names[who]} 캐릭터, 지금 모습과 PEAK 모습` : `${names[who]} 캐릭터`}
      accessibilityRole="image"
      accessible
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={[styles.scene, style]}
    >
      <Image
        resizeMode="stretch"
        source={street}
        style={[
          { bottom: -130 * k, height: STREET.height * k, left: -120 * k, position: 'absolute', width: STREET.width * k },
          pixelated,
        ]}
      />
      {height === 0 ? null : pair ? (
        <View style={[styles.pair, { paddingBottom: 16 * k }]}>
          {([0, 4] as const).map((tier) => (
            <View key={tier} style={styles.cell}>
              <Text style={styles.label}>{tier ? 'PEAK' : '지금'}</Text>
              <Hero exact tier={tier} who={who} zoom={zoom} />
            </View>
          ))}
          <View pointerEvents="none" style={[styles.arrowAt, { bottom: 16 * k + 62 * zoom }]}>
            <View style={[styles.arrow, styles.arrowShade]} />
            <View style={styles.arrow} />
          </View>
        </View>
      ) : (
        <View style={[styles.one, { bottom: 16 * k }]}>
          <Hero exact tier={tier} who={who} zoom={zoom} />
        </View>
      )}
      {children}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    scene: {
      backgroundColor: '#6A6E7E',
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      flex: 1,
      minHeight: 190,
      overflow: 'hidden',
    },
    one: { alignItems: 'center', left: 0, position: 'absolute', right: 0 },
    pair: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 12 },
    cell: { alignItems: 'center', justifyContent: 'space-between' },
    label: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 99,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: fontFamilies.galmuri11,
      fontSize: 12,
      lineHeight: 17,
      overflow: 'hidden',
      paddingVertical: 2,
      textAlign: 'center',
      width: 64,
    },
    // "It becomes this": a white arrowhead between the two, with a dark one a little below it as its edge.
    arrowAt: { alignItems: 'center', left: 0, position: 'absolute', right: 0 },
    arrow: {
      borderColor: '#FFFFFF',
      borderRightWidth: 4,
      borderTopWidth: 4,
      height: 12,
      transform: [{ rotate: '45deg' }],
      width: 12,
    },
    arrowShade: { borderColor: colors.border, position: 'absolute', top: 2 },
  } as const;
}
