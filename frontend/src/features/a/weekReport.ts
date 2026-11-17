// Renewal A's report: one week, counted from what the app already knows. The screen fills a row for each
// day (workouts and meals from the server; water, stretching and steps from this phone) and everything the
// two report screens say comes out of those rows here, so the title, the road and the sheets always agree.
// Nothing in this file asks the server or the phone: it can be tested with plain rows.

export type DayState = 'past' | 'today' | 'later';
export type WeekDay = {
  key: string; // 2026-11-12
  label: string; // 목
  state: DayState;
  minutes: number | null; // a finished workout's minutes; null = none that day
  exercises: string[]; // the exercises finished that day, by name
  kcal: number | null; // eaten as recorded; null = no answer
  kcalGoal: number | null;
  protein: number | null;
  proteinGoal: number | null;
  steps: number | null; // null = this phone did not count that day
  water: number | null; // glasses; null = nothing kept on this phone
  stretch: boolean;
};

const LABELS = ['월', '화', '수', '목', '금', '토', '일'];
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Monday to Sunday of the week `now` is in, each day empty.
export function weekFrame(now: Date): WeekDay[] {
  const today = dayKey(now);
  return LABELS.map((label, index) => {
    const key = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + index));
    const state: DayState = key === today ? 'today' : key < today ? 'past' : 'later';
    return { key, label, state, minutes: null, exercises: [], kcal: null, kcalGoal: null, protein: null, proteinGoal: null, steps: null, water: null, stretch: false };
  });
}

// Which part of the body an exercise trains, read from its name: the server keeps no part on an exercise.
// The words are the backend chat's own table (backend/app/chat_exercise_info.py TOPICS); the `none` words
// are exercises that train no single part (warm-up, cardio).
// shortcut: a name with none of these words is unknown and the report then says nothing about a missing
// part; ask the server for a part on each exercise when that matters.
export type Part = 'up' | 'core' | 'low';
export const PARTS: Part[] = ['up', 'core', 'low'];
export const PART_NAMES: Record<Part, string> = { up: '상체', core: '코어', low: '하체' };
const WORDS: Record<Part | 'none', string[]> = {
  low: ['하체', '스쿼트', '런지', '레그', '카프'],
  up: ['상체', '푸시업', '풀업', '벤치', '로우'],
  core: ['코어', '복근', '플랭크', '크런치'],
  none: ['유산소', '걷기', '달리기', '자전거', '수영', '스트레칭', '워밍업', '요가'],
};
export function partOf(name: string): Part | 'none' | null {
  const text = name.replace(/\s/g, '');
  const found = (['low', 'up', 'core', 'none'] as const).find((part) => WORDS[part].some((word) => text.includes(word)));
  return found ?? null;
}

export type QuestKey = 'walk' | 'water' | 'stretch' | 'meal' | 'workout';
export type StoryRow = {
  kind: 'done' | 'bonus' | 'next';
  title: string;
  note: string;
  go?: 'diet' | 'exercise'; // the tab its button opens
  reward?: number; // tier points the server gives for it
};

export function countWeek(days: WeekDay[], goals: { steps: number; water: number }) {
  const lived = days.filter((day) => day.state !== 'later');
  const cleared = (day: WeekDay): Record<QuestKey, boolean> => ({
    walk: day.steps !== null && day.steps >= goals.steps,
    water: (day.water ?? 0) >= goals.water,
    stretch: day.stretch,
    meal: (day.kcal ?? 0) > 0,
    workout: day.minutes !== null,
  });
  const counted = lived.some((day) => day.steps !== null); // the walking quest exists only where steps are counted
  const keys = (['walk', 'water', 'stretch', 'meal', 'workout'] as const).filter((key) => key !== 'walk' || counted);
  const loot = keys.map((key) => ({ key, count: lived.filter((day) => cleared(day)[key]).length }));
  const workoutDays = lived.filter((day) => day.minutes !== null);

  const parts = Object.fromEntries(PARTS.map((part) => [part, { times: 0, days: [] as string[], names: {} as Record<string, number> }])) as Record<
    Part,
    { times: number; days: string[]; names: Record<string, number> }
  >;
  let sure = true;
  for (const day of workoutDays) {
    const trained = new Set<Part>();
    for (const name of new Set(day.exercises)) {
      const part = partOf(name);
      if (part === null) sure = false;
      else if (part !== 'none') {
        trained.add(part);
        parts[part].names[name] = (parts[part].names[name] ?? 0) + 1;
      }
    }
    for (const part of trained) {
      parts[part].times += 1;
      parts[part].days.push(day.label);
    }
  }

  // Food is judged on finished days only: today is still being recorded.
  const eaten = days.filter((day) => day.state === 'past' && (day.kcal ?? 0) > 0);
  const withProtein = eaten.filter((day) => day.protein !== null && day.proteinGoal !== null && day.proteinGoal > 0);
  const protein = withProtein.length
    ? {
        average: Math.round(withProtein.reduce((sum, day) => sum + (day.protein ?? 0), 0) / withProtein.length),
        goal: Math.round(withProtein[withProtein.length - 1].proteinGoal ?? 0),
      }
    : null;
  const judged = eaten.filter((day) => day.kcalGoal !== null && day.kcalGoal > 0);
  const kept = judged.length ? { days: judged.filter((day) => (day.kcal ?? 0) <= (day.kcalGoal ?? 0)).length, of: judged.length } : null;

  const questTotal = loot.reduce((sum, item) => sum + item.count, 0);
  const full = PARTS.find((part) => parts[part].times >= 2);
  const empty = sure && workoutDays.length > 0 ? PARTS.find((part) => parts[part].times === 0) : undefined;
  const dayNames = (labels: string[]) => labels.map((label) => `${label}요일`).join(' · ');

  const say =
    full && empty
      ? `${PART_NAMES[full]}는 충분하고 ${PART_NAMES[empty]}가 비어 있어요`
      : workoutDays.length
        ? `이번 주 ${workoutDays.length}일 운동했어요`
        : questTotal
          ? '이번 주 첫 운동을 기다리고 있어요'
          : '기록이 쌓이면 여기에 모여요';

  const story: StoryRow[] = [];
  if (full) story.push({ kind: 'done', title: `${PART_NAMES[full]}를 ${parts[full].times}번 채웠어요`, note: dayNames(parts[full].days) });
  else if (workoutDays.length) story.push({ kind: 'done', title: `이번 주 ${workoutDays.length}일 운동했어요`, note: dayNames(workoutDays.map((day) => day.label)) });
  if (protein && protein.average < protein.goal) {
    story.push({ kind: 'bonus', title: '단백질 채우기', note: `하루 평균 ${protein.goal - protein.average}g이 모자라요`, go: 'diet' });
  }
  // +5 is the server's tier rule for finishing the recommended workout (the home quest shows the same).
  if (empty) story.push({ kind: 'next', title: `다음은 ${PART_NAMES[empty]}부터`, note: '이번 주에 아직 안 했어요', go: 'exercise', reward: 5 });
  else if (!workoutDays.length) story.push({ kind: 'next', title: '이번 주 첫 운동', note: '오늘의 운동부터 시작해요', go: 'exercise', reward: 5 });

  return {
    days: days.map((day) => ({ ...day, workout: day.minutes !== null, cleared: day.state === 'later' ? 0 : keys.filter((key) => cleared(day)[key]).length })),
    workoutDays: workoutDays.length,
    questTotal,
    loot,
    parts,
    protein,
    kept,
    say,
    story,
  };
}
export type WeekCount = ReturnType<typeof countWeek>;

// The weight line: the last five measurements, oldest first.
export function weightLine(rows: { date: string; kg: number | string | null }[]) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const kg = Number(row.kg);
    if (row.date && Number.isFinite(kg) && kg > 0) seen.set(row.date.slice(0, 10), kg);
  }
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-5).map(([date, kg]) => ({ date, kg }));
}
