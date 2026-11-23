// Renewal B's one-sentence sign-up (b-start.html): what one sentence about me says, read by word rules on
// the phone (user, 11/23: no AI call, nothing paid). Whatever a rule did not hear stays null and is asked
// next, never guessed. marks are where in the sentence each heard thing was, for the lilac under the words.
// shortcut: word rules hear the common ways to say it; move to the AI server if people say it otherwise.

export type HeardSex = 'male' | 'female';
export type HeardGoal = 'fat-loss' | 'muscle-gain' | 'stamina' | 'conditioning';
export type HeardLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Heard {
  age: number | null;
  sex: HeardSex | null;
  allergens: string[]; // the sign-up's allergen ids (signup/step3.tsx)
  noAllergy: boolean; // said there is nothing they cannot eat
  goal: HeardGoal | null;
  level: HeardLevel | null;
  height: number | null; // cm
  weight: number | null; // kg
}

const TENS: Record<string, number> = { 스무: 20, 스물: 20, 서른: 30, 마흔: 40, 쉰: 50, 예순: 60 };
const ONES: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 };
const FOODS: [string, RegExp][] = [
  ['milk', /우유|유제품/],
  ['egg', /계란|달걀/],
  ['peanut', /땅콩/],
  ['nuts', /견과류?|호두|아몬드/],
  ['wheat', /밀가루|글루텐|밀(?=[은이을도랑과,\s]|$)/],
  ['soybean', /대두|(?<!땅)콩(?!나물)/],
  ['buckwheat', /메밀/],
  ['crab', /갑각류|새우|꽃게|(?<=^|\s)게(?=[는도랑,\s])|랍스터/], // a lone 게 only: not the 게 of 몸무게
  ['shellfish', /조개|굴(?=[은이을도랑,\s]|$)/],
  ['fish', /생선/],
  ['peach', /복숭아/],
  ['sesame', /참깨/],
];
const GOALS: [HeardGoal, RegExp][] = [
  ['fat-loss', /살을?\s*(?:좀\s*)?빼|감량|다이어트|체지방/],
  ['muscle-gain', /근육|벌크/],
  ['stamina', /체력|지구력/],
  ['conditioning', /재활|회복|컨디션/],
];
const LEVELS: [HeardLevel, RegExp][] = [
  ['beginner', /처음|초보|안\s?해\s?봤|해 본 적(?:이)? 없/],
  ['intermediate', /중급|가끔|[12]\s?년/],
  ['advanced', /고급|오래|매일/],
];

export function hear(text: string): { got: Heard; marks: [number, number][] } {
  const got: Heard = { age: null, sex: null, allergens: [], noAllergy: false, goal: null, level: null, height: null, weight: null };
  const marks: [number, number][] = [];
  const take = (re: RegExp, keep: (m: RegExpExecArray) => boolean | void) => {
    const m = re.exec(text);
    if (m && keep(m) !== false) marks.push([m.index, m.index + m[0].length]);
    return Boolean(m);
  };

  take(/(\d{2})\s*(?:살|세)/, (m) => { got.age = Number(m[1]); }) ||
    take(new RegExp(`(${Object.keys(TENS).join('|')})\\s*(${Object.keys(ONES).join('|')})?\\s*살`), (m) => {
      got.age = TENS[m[1]] + (m[2] ? ONES[m[2]] : 0);
    });
  take(/여자|여성/, () => { got.sex = 'female'; }) || take(/남자|남성/, () => { got.sex = 'male'; });
  for (const [id, re] of FOODS) take(re, () => { got.allergens.push(id); });
  if (!got.allergens.length) take(/가리는\s?(?:거|것|음식)\s*없|다\s?(?:잘\s?)?먹|알레르기\s*(?:는\s*)?없/, () => { got.noAllergy = true; });
  GOALS.some(([goal, re]) => take(re, () => { got.goal = goal; }));
  LEVELS.some(([level, re]) => take(re, () => { got.level = level; }));
  // height: "키 160" or "160cm"; weight: "55kg" / "55킬로" / "몸무게 55". Out of range is not heard.
  take(/키\s*(?:는|가)?\s*(\d{3}(?:\.\d)?)|(\d{3}(?:\.\d)?)\s*(?:cm|센티|센치)/i, (m) => {
    const cm = Number(m[1] ?? m[2]);
    if (cm < 100 || cm > 250) return false;
    got.height = cm;
  });
  take(/몸무게\s*(?:는|가)?\s*(\d{2,3}(?:\.\d)?)|(\d{2,3}(?:\.\d)?)\s*(?:kg|킬로|키로)/i, (m) => {
    const kg = Number(m[1] ?? m[2]);
    if (kg < 20 || kg > 500) return false;
    got.weight = kg;
  });
  return { got, marks: marks.sort((a, b) => a[0] - b[0]) };
}

// The sign-up is for adults (user, 11/19: meal targets start at 19).
export const tooYoung = (age: number | null) => age !== null && age < 19;
