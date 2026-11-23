import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/src/components/common';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';

// What the app reads from each kind of health paper. Shown where a paper is asked for:
// the upload screen, the box for adding one, and the list when nothing has been given yet.
const reads = [
  ['건강검진 결과표', '키 · 몸무게 · 혈압 · 공복혈당 · 콜레스테롤 · 간 수치'],
  ['인바디 결과지', '체중 · 골격근량 · 체지방률 · BMI · 기초대사량'],
] as const;

export function PaperReads({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={style}>
      <Text style={styles.q}>이런 자료를 읽어요</Text>
      <View style={styles.list}>
        {reads.map(([title, detail]) => (
          <View key={title}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.detail}>{detail}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    q: { ...a.q, fontFamily: fontFamilies.pretendardMedium },
    list: { gap: 12 },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    detail: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  } as const;
}
