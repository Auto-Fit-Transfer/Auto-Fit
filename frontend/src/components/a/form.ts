import { fontFamilies, type AppTheme } from '@/src/theme';

// The form pieces renewal A's screens share (sign-up, passwords, sheets, lists), given renewal B's look in this
// app: no outlines or ledges, light grey fields and chips, black pills for what is pressed and chosen,
// Pretendard letters. A screen not given its own B look yet still reads as B through these; the keys stay
// renewal A's, so every screen that uses them keeps working.
export function aForm(colors: AppTheme['colors']) {
  const p12 = { fontFamily: fontFamilies.pretendardMedium, fontSize: 12.5, lineHeight: 18 } as const;
  const p15 = { fontFamily: fontFamilies.pretendardRegular, fontSize: 15, lineHeight: 22 } as const;
  const box = {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  } as const;
  return {
    p12,
    p15,
    // A question's small name above its answer, and a quiet line of help below one.
    q: { ...p12, color: colors.textSecondary, marginBottom: 8 },
    note: { ...p12, color: colors.textSecondary },
    // A choice among many (chip), and one of two or three (seg).
    chip: { ...box, borderRadius: 999, height: 42, paddingHorizontal: 12 },
    chipText: { ...p12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, textAlign: 'center' },
    seg: { ...box, borderRadius: 999, flex: 1, height: 46 },
    segOn: { backgroundColor: colors.primary },
    segText: { ...p15, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    on: { backgroundColor: colors.primary },
    onText: { color: colors.onPrimary },
    field: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 16,
      flexDirection: 'row',
      height: 50,
      paddingHorizontal: 16,
    },
    input: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardRegular, fontSize: 15 },
    mini: { ...box, borderRadius: 999, height: 34, paddingHorizontal: 14 },
    miniText: { ...p12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    link: { ...p12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    // A tick box: light until it is ticked.
    tick: { ...box, borderRadius: 9, height: 28, width: 28 },
    // A card, the screen's main button (ghost = the light one beside it), and the points a button earns.
    card: { backgroundColor: colors.surface, borderRadius: 28 },
    go: {
      ...box,
      backgroundColor: colors.primary,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 8,
      height: 56,
    },
    goGhost: { backgroundColor: colors.surfaceMuted },
    goPressed: { opacity: 0.85 },
    goOff: { backgroundColor: colors.surfaceMuted },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
    reward: {
      ...p12,
      backgroundColor: colors.lilac,
      borderRadius: 99,
      color: colors.lilacInk,
      fontFamily: fontFamilies.pretendardBold,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 1,
    },
  } as const;
}
