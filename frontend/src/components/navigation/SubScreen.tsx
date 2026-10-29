import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/src/components/common';
import { useThemedStyles, type AppTheme } from '@/src/theme';

export interface SubScreenProps extends PropsWithChildren {
  title?: string;
  onBack: () => void;
  // Right side of the top bar, such as the home button on long input screens.
  right?: ReactNode;
  // Buttons kept at the bottom while the body scrolls.
  footer?: ReactNode;
  gap?: number;
}

// Frame of the screens opened from a tab (Figma B · D · E · F · G sub screens):
// top bar with back · title, a scrolling body, and an optional fixed footer.
export function SubScreen({
  title = '',
  onBack,
  right,
  footer,
  gap = 20,
  children,
}: SubScreenProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      <AppHeader onBackPress={onBack} rightAction={right} title={title} />
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { gap, paddingBottom: footer ? 24 : Math.max(insets.bottom, 12) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    screen: { backgroundColor: colors.background, flex: 1 },
    body: { paddingHorizontal: 20, paddingTop: 8 },
    footer: {
      backgroundColor: colors.background,
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
  } as const;
}
