import { fontFamilies, type AppTheme } from '@/src/theme';

// Renewal A's form pieces, for the screens that ask something (sign-up, passwords): one dark outline on
// every piece, a ledge under what is pressed like a button, violet for what is chosen, pixel letters.
export function aForm(colors: AppTheme['colors']) {
  const p12 = { fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 } as const;
  const p15 = { fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  const box = {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.ink,
    borderWidth: 2,
    justifyContent: 'center',
  } as const;
  return {
    p12,
    p15,
    // A question's small name above its answer, and a quiet line of help below one.
    q: { ...p12, color: colors.textSecondary, marginBottom: 8 },
    note: { ...p12, color: colors.textSecondary },
    // A flat choice among many (chip), and one of two or three (seg: it stands on a ledge).
    chip: { ...box, borderRadius: 12, height: 42, paddingHorizontal: 2 },
    chipText: { ...p12, color: colors.ink, textAlign: 'center' },
    seg: { ...box, borderRadius: 14, boxShadow: '0 4px 0 rgba(32, 35, 63, 0.3)', flex: 1, height: 46 },
    segOn: { backgroundColor: colors.primary, boxShadow: `0 4px 0 ${colors.ink}` },
    segText: { ...p15, color: colors.ink },
    on: { backgroundColor: colors.primary },
    onText: { color: colors.onPrimary },
    field: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 12,
      borderWidth: 2,
      flexDirection: 'row',
      height: 48,
      paddingHorizontal: 12,
    },
    input: { color: colors.ink, fontFamily: fontFamilies.galmuri14, fontSize: 15 },
    mini: { ...box, borderRadius: 10, boxShadow: '0 3px 0 rgba(32, 35, 63, 0.3)', height: 32, paddingHorizontal: 10 },
    miniText: { ...p12, color: colors.ink },
    link: { ...p12, color: colors.textSecondary, textDecorationLine: 'underline' },
    // A tick box: white until it is ticked.
    tick: { ...box, borderRadius: 9, height: 30, width: 30 },
    // A card, the screen's main button on its ledge (ghost = the white one beside it), and the gold
    // points a button earns.
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 18,
      borderWidth: 2,
      boxShadow: '0 4px 0 rgba(32, 35, 63, 0.3)',
    },
    go: {
      ...box,
      backgroundColor: colors.primary,
      borderRadius: 14,
      boxShadow: `0 4px 0 ${colors.ink}`,
      flexDirection: 'row',
      gap: 8,
      height: 56,
    },
    goGhost: { backgroundColor: colors.surface },
    goPressed: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 4 }] },
    goOff: { backgroundColor: colors.surfaceMuted },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    reward: {
      ...p12,
      backgroundColor: colors.gold,
      borderColor: colors.ink,
      borderRadius: 99,
      borderWidth: 2,
      color: '#2B2000',
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 1,
    },
  } as const;
}
