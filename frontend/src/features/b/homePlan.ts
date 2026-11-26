// Renewal B's home headline: the app says what it set for today, as a proposal - never an allowance
// such as "N kcal more is fine" (11/26: some people diet hard; a proposal they can take, meet halfway,
// or replace). Built only from what the server gave: today's routine and the next meal not recorded yet.
type Part = { text: string; mark?: boolean };
type Meal = { id: string; title: string; kcal: number | null };

const ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

// the last letter's final consonant (받침); "kcal" is read 칼로리, so it has none
const final = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 ? code % 28 : 0;
};
const withJosa = (word: string, [after, plain]: [string, string]) => `${final(word) ? after : plain}`;
// 으로 / 로: no final consonant or ㄹ (8) takes 로
const ro = (word: string) => (final(word) === 0 || final(word) === 8 ? '로' : '으로');

// The first meal of the day not recorded yet, in the order of the day.
export function nextMeal<T extends Meal>(meals: T[], recorded: Iterable<string>): T | null {
  const done = new Set(recorded);
  return [...meals].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)).find((meal) => !done.has(meal.id)) ?? null;
}

export function mealLabel(meal: Meal) {
  return meal.kcal === null ? meal.title : `${meal.title} ${Math.round(meal.kcal).toLocaleString('ko-KR')}kcal`;
}

export function homeHeadline(name: string, routine: string | null, exercisedToday: boolean, meal: Meal | null): Part[][] {
  const hello = { text: `${name} 님, 오늘은` };
  const food = meal ? mealLabel(meal) : null;
  if (routine && !exercisedToday && food) {
    return [[hello], [{ text: routine, mark: true }, { text: withJosa(routine, ['과', '와']) }], [{ text: food, mark: true }, { text: `${ro(food)} 맞춰 뒀어요` }]];
  }
  if (routine && !exercisedToday) return [[hello], [{ text: routine, mark: true }, { text: ro(routine) }], [{ text: '맞춰 뒀어요' }]];
  if (exercisedToday && food) return [[{ text: `${name} 님, 오늘 운동은` }], [{ text: '끝냈어요. 다음은' }], [{ text: food, mark: true }, { text: `${ro(food)} 맞춰 뒀어요` }]];
  if (exercisedToday) return [[{ text: `${name} 님, 오늘 운동은` }], [{ text: '끝냈어요' }]];
  if (food) return [[hello], [{ text: food, mark: true }, { text: ro(food) }], [{ text: '맞춰 뒀어요' }]];
  return [[{ text: `${name} 님,` }], [{ text: '오늘을 같이 시작해요' }]];
}
