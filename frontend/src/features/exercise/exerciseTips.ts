// The AI owner's three lines per move (how to do it, what to watch, where to feel it), by catalog key, in
// exerciseTips.json (scripts/build-exercise-tips.mjs). Said once each at the start of a set, so a line is
// never cut by the count: the how on the first set, the watch-out on the second, the feel on the third.
// A one-set move says the first two together, and its feel line halfway through the set (halfTip): every AI
// move came as one timed set with no sets (11/26, 127 of 127), so without it the feel line was never said.
// No set count counts as one set, as the session runs it. Nothing for a move the file did not describe.
import type { ExerciseItem, VoiceGuideStatus } from './exerciseData';

export type TipLines = readonly string[]; // how, watch-out, feel

// v4 (11/27, docs/exercise-voice-guide-v4-contract-20261127.md): the server says, for the GIF it chose, which
// lines may be said. ready: its own three lines. legacy: the bundled lines, if the bundle has the key.
// blocked_audio, unavailable, an unknown or missing verdict (an older server): nothing, and never the
// recommendation's instruction or a name-alike in their place.
const STATUSES: readonly VoiceGuideStatus[] = ['ready', 'blocked_audio', 'unavailable', 'legacy'];

export function readVoiceGuideStatus(item: Record<string, unknown>): VoiceGuideStatus | null {
  const value = item.voice_guide_status;
  return STATUSES.includes(value as VoiceGuideStatus) ? (value as VoiceGuideStatus) : null;
}

export function readVoiceGuide(item: Record<string, unknown>): ExerciseItem['voiceGuide'] {
  const guide = item.voice_guide;
  if (!guide || typeof guide !== 'object') return null;
  const { method, caution, focus } = guide as Record<string, unknown>;
  const ok = [method, caution, focus].every((line) => typeof line === 'string' && line.trim());
  return ok ? { caution: (caution as string).trim(), focus: (focus as string).trim(), method: (method as string).trim() } : null;
}

export function guideLines(
  item: Pick<ExerciseItem, 'exerciseKey' | 'voiceGuideStatus' | 'voiceGuide'>,
  bundle: Record<string, TipLines>,
): TipLines | undefined {
  if (item.voiceGuideStatus === 'ready') return item.voiceGuide ? [item.voiceGuide.method, item.voiceGuide.caution, item.voiceGuide.focus] : undefined;
  if (item.voiceGuideStatus === 'legacy' && item.exerciseKey) return bundle[item.exerciseKey];
  return undefined;
}

export function setTip(lines: TipLines | undefined, set: number, sets: number | null): string | null {
  if (!lines) return null;
  if (set === 1) return (sets ?? 1) === 1 ? `${lines[0]} ${lines[1]}` : lines[0];
  return set === 2 || set === 3 ? lines[set - 1] : null;
}

export function halfTip(lines: TipLines | undefined, sets: number | null): string | null {
  return lines && (sets ?? 1) === 1 ? lines[2] : null;
}
