// Same split as the AI chat contract: mild feelings can lower the remaining workout, the rest end it with no replacement.
export const discomfortFeelings = [
  { key: 'stiff', label: '뻐근해요', stops: false, symptomType: 'fatigue', severity: 3 },
  { key: 'tingling', label: '찌릿해요', stops: false, symptomType: 'pain', severity: 5 },
  { key: 'pain', label: '아파요', stops: true },
  { key: 'dizzy', label: '어지러워요', stops: true },
  { key: 'breathing', label: '숨쉬기 힘들어요', stops: true },
] as const;
