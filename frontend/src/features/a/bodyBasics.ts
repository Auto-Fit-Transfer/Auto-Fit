import AsyncStorage from '@react-native-async-storage/async-storage';

import { updateProfile } from '@/src/api/home';

// Height and current weight from sign-up, for each person's daily calorie goal (user, 11/19: with the age from
// the birthday and the sex already asked). The profile API does not take these two yet (back-end to add
// height_cm · weight_kg), so they wait on this phone and are sent once the server takes them; sign-up never
// fails for it.
const KEY = 'auto-fit.a.body-basics.v1';
type Basics = { height_cm: number; weight_kg: number; sent: boolean };

export function bodyBasicsError(height: string, weight: string) {
  const h = Number(height.trim());
  const w = Number(weight.trim());
  if (!height.trim() || !Number.isFinite(h) || h < 100 || h > 250) return '키는 100~250cm로 적어 주세요.';
  if (!weight.trim() || !Number.isFinite(w) || w < 20 || w > 500) return '몸무게는 20~500kg으로 적어 주세요.';
  return null;
}

async function send(basics: Basics) {
  try {
    await updateProfile({ height_cm: basics.height_cm, weight_kg: basics.weight_kg });
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...basics, sent: true }));
  } catch {
    // an older server refuses the two fields: they stay here and go next time
  }
}

export async function saveBodyBasics(height: string, weight: string) {
  const basics: Basics = { height_cm: Number(height.trim()), weight_kg: Number(weight.trim()), sent: false };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(basics));
  } catch {
    // nothing to keep them in: still try the server once
  }
  await send(basics);
}

// Called when the app comes back: sends what is still waiting.
export async function flushBodyBasics() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const basics = raw ? (JSON.parse(raw) as Basics) : null;
    if (basics && !basics.sent && basics.height_cm && basics.weight_kg) await send(basics);
  } catch {
    // try again next time
  }
}
