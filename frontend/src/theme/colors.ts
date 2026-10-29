import { lightPalette as palette } from './palette';

// Fixed light colors for screens that are not redesigned yet. The old names are kept so those
// screens pick up the new palette; redesigned code reads colors from useAppTheme() instead.
export const colors = {
  primary: palette.primary,
  primaryMedium: palette.primary,
  primaryLight: palette.primaryLight,
  primaryDark: palette.primaryPressed,
  background: palette.background,
  backgroundPurple: palette.background,
  dark: palette.textPrimary,
  darkSoft: palette.textBody,
  textWhite: '#F3F4F6',
  textWhiteSecondary: '#A3A7AF',
  primaryBack: palette.primaryLight,
  surface: palette.elevated,
  surfaceSoft: palette.surfaceMuted,
  card: palette.surface,
  border: palette.border,
  textPrimary: palette.textPrimary,
  textBody: palette.textBody,
  textSecondary: palette.textSecondary,
  textDisabled: palette.textDisabled,
  textNavigator: palette.textDisabled,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  dangerLight: palette.dangerLight,
  info: palette.primaryText,
  overlay: palette.overlay,
  transparent: palette.transparent,
} as const;
