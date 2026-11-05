import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WeeklyDietContent } from '@/src/components/diet/WeeklyDietContent';
import { useThemedStyles, type AppTheme } from '@/src/theme';

export default function WeeklyDietScreen() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}>
        <WeeklyDietContent showHeader />
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20 },
  } as const;
}
