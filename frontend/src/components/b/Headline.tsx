import { View } from 'react-native';

import { Text } from '@/src/components/common';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal B's big headline: two short lines, and the number in it sits on lilac.
// A line is a list of parts; a part with mark: true is the number.
export interface HeadlinePart {
  text: string;
  mark?: boolean;
}

export function Headline({ lines }: { lines: HeadlinePart[][] }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityRole="header" accessible accessibilityLabel={lines.map((line) => line.map((part) => part.text).join('')).join(' ')}>
      {lines.map((line, index) => (
        <View key={index} style={styles.line}>
          {line.map((part, at) =>
            part.mark ? (
              <View key={at} style={[styles.mark, at === 0 && styles.markFirst]}>
                <Text style={[styles.text, styles.markText]}>{part.text}</Text>
              </View>
            ) : (
              <Text key={at} style={styles.text}>
                {part.text}
              </Text>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    line: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
    text: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardExtraBold,
      fontSize: 30,
      letterSpacing: -0.6,
      lineHeight: 40,
    },
    // the lilac sticks out past the letters, so the letters line up with the line above (markFirst) and the
    // particle after it ("과", "로") sits as close as the next letter would
    mark: { backgroundColor: colors.lilac, borderRadius: 8, paddingLeft: 6, paddingRight: 2 },
    markFirst: { marginLeft: -6 },
    markText: { color: '#010101' },
  } as const;
}
