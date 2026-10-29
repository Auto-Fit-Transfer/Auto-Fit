import { View, type StyleProp, type ViewStyle } from 'react-native';

import InfoIcon from '@/assets/icons/ui/info.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

export interface NoticeProps {
  title?: string;
  body?: string;
  tone?: 'info' | 'warning';
  style?: StyleProp<ViewStyle>;
}

// The Figma "Notice": an info box (gray) or a caution box (orange) for safety notes.
export function Notice({ title, body, tone = 'info', style }: NoticeProps) {
  const { colors, easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const warning = tone === 'warning';
  const Icon = warning ? WarningIcon : InfoIcon;
  const iconColor = warning ? colors.warning : colors.textSecondary;
  const iconSize = easyMode ? 24 : 20;
  return (
    <View style={[styles.box, warning ? styles.warning : styles.info, style]}>
      <Icon color={iconColor} height={iconSize} width={iconSize} />
      <View style={styles.texts}>
        {title ? <Text style={[styles.title, warning && styles.warningText]}>{title}</Text> : null}
        {body ? <Text style={[styles.body, warning && styles.warningText]}>{body}</Text> : null}
      </View>
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    box: {
      alignItems: 'flex-start',
      borderRadius: radius.card,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    info: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
    warning: { backgroundColor: colors.warningLight },
    texts: { flex: 1, gap: 2 },
    title: { ...text.body2Strong, color: colors.textPrimary },
    body: { ...text.body2, color: colors.textSecondary },
    warningText: { color: colors.warning },
  } as const;
}
