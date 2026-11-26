// The AI owner's three lines per move (how to do it, what to watch, where to feel it), by catalog key, in
// exerciseTips.json (scripts/build-exercise-tips.mjs). Said once each at the start of a set, so a line is
// never cut by the count: the how on the first set, the watch-out on the second, the feel on the third.
// A one-set move says the first two together, and its feel line halfway through the set (halfTip): every AI
// move came as one timed set with no sets (11/26, 127 of 127), so without it the feel line was never said.
// No set count counts as one set, as the session runs it. Nothing for a move the file did not describe.
export type TipLines = readonly string[]; // how, watch-out, feel

export function setTip(lines: TipLines | undefined, set: number, sets: number | null): string | null {
  if (!lines) return null;
  if (set === 1) return (sets ?? 1) === 1 ? `${lines[0]} ${lines[1]}` : lines[0];
  return set === 2 || set === 3 ? lines[set - 1] : null;
}

export function halfTip(lines: TipLines | undefined, sets: number | null): string | null {
  return lines && (sets ?? 1) === 1 ? lines[2] : null;
}
