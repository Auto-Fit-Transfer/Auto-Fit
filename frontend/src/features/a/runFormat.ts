// How renewal A writes a run's numbers: 2.31 (km), 15:24 or 1:08:00 (time), 6'40" (time for one km).

export const runKm = (meters: number | string | null | undefined) => ((Number(meters) || 0) / 1000).toFixed(2);

export function runClock(seconds: number | string | null | undefined) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${String(minutes).padStart(2, '0')}:${rest}`;
}

// Before there is a pace to show (nothing run yet), the places of the digits stay as dashes.
export function runPace(secondsPerKm: number | string | null | undefined) {
  const value = Number(secondsPerKm);
  if (!secondsPerKm || !Number.isFinite(value) || value <= 0) return `-'--"`;
  const rounded = Math.round(value);
  return `${Math.floor(rounded / 60)}'${String(rounded % 60).padStart(2, '0')}"`;
}

// How far along a course a run is, 0 to 1, and what is left of it in metres.
export function runProgress(distanceMeters: number | string, targetMeters: number | string | null | undefined) {
  const target = Number(targetMeters) || 0;
  const done = Number(distanceMeters) || 0;
  if (target <= 0) return null;
  return { ratio: Math.min(1, Math.max(0, done / target)), left: Math.max(0, target - done), finished: done >= target };
}
