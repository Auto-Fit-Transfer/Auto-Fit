import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { WeeklyDietContent } from '@/src/components/diet/WeeklyDietContent';
import { useThemedStyles, type AppTheme } from '@/src/theme';

export default function WeeklyDietScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={() => router.back()} title="7일 식단" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 40 }]}>
        <WeeklyDietContent />
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
