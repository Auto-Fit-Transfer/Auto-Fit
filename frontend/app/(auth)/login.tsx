import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { LoginPanel } from '@/src/components/auth/LoginPanel';
import { HelloView, type HelloLine, type HelloLineKey } from '@/src/components/b/HelloView';
import { AppBottomSheet, Text, TextInput } from '@/src/components/common';
import { bodyBasicsError } from '@/src/features/a/bodyBasics';
import { hear, tooYoung, type Heard } from '@/src/features/b/hear';
import { useSignup } from '@/src/features/signup/SignupContext';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal B's first screen: the one-sentence sign-up (src/components/b/HelloView.tsx). '로그인' opens the
// e-mail and social login on the same screen; a link back from a failed social login or a reset opens it at once.
// What is heard goes into the sign-up draft; the account is made after it (signup/step1, flow b) and the rest
// is saved once the account exists (signup/b-save).
const EXAMPLE = '서른 살 여자예요. 땅콩이랑 새우는 못 먹고, 살을 빼고 싶은데 운동은 처음이에요. 키 162에 몸무게 60kg이에요.';
const FOODS: [string, string][] = [
  ['milk', '우유'], ['egg', '계란'], ['peanut', '땅콩'], ['nuts', '견과류'], ['wheat', '밀(글루텐)'], ['soybean', '콩(대두)'],
  ['buckwheat', '메밀'], ['crab', '갑각류'], ['shellfish', '조개'], ['fish', '생선'], ['peach', '복숭아'], ['sesame', '참깨'],
];
const GOALS: [NonNullable<Heard['goal']>, string][] = [['fat-loss', '체지방 감량'], ['muscle-gain', '근육량 증가'], ['stamina', '체력 향상'], ['conditioning', '컨디셔닝 · 기능 회복']];
const LEVELS: [NonNullable<Heard['level']>, string][] = [['beginner', '초보'], ['intermediate', '중급'], ['advanced', '고급']];
const label = <T extends string>(list: [T, string][], key: T | null) => list.find(([id]) => id === key)?.[1] ?? '';
const empty = (): Heard => hear('').got;

export default function LoginRoute() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { oauthError, login } = useLocalSearchParams<{ oauthError?: string; login?: string }>();
  const { draft, updateDraft } = useSignup();
  const [showLogin, setShowLogin] = useState(Boolean(oauthError || login));
  const [phase, setPhase] = useState<'open' | 'heard' | 'keep'>('open');
  const [input, setInput] = useState('');
  const [said, setSaid] = useState<{ text: string; marks: [number, number][] } | null>(null);
  const [got, setGot] = useState<Heard>(empty);
  const [other, setOther] = useState('');
  const [asking, setAsking] = useState<HelloLineKey | null>(null);
  const [error, setError] = useState('');
  // the sheet's own copy, kept until 확인
  const [form, setForm] = useState({ age: '', sex: null as Heard['sex'], foods: [] as string[], none: false, other: '', goal: null as Heard['goal'], level: null as Heard['level'], height: '', weight: '' });

  if (showLogin) return <LoginPanel onJoin={() => setShowLogin(false)} />;

  const say = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const heard = hear(trimmed);
    setSaid({ text: trimmed, marks: heard.marks });
    setGot(heard.got);
    setOther('');
    setPhase('heard');
  };
  const foodsDone = got.allergens.length > 0 || got.noAllergy || other.trim().length > 0;
  const lines: HelloLine[] = [
    { key: 'who', done: got.age !== null && got.sex && !tooYoung(got.age) ? `${got.age}세 ${got.sex === 'female' ? '여성' : '남성'}으로 기억했어요` : null, missing: tooYoung(got.age) ? '만 19세 이상부터 가입할 수 있어요' : '나이와 성별을 못 들었어요' },
    { key: 'food', done: foodsDone ? (got.noAllergy && !other ? '가리는 음식 없이 식단을 짤게요' : `${[...got.allergens.map((id) => label(FOODS, id)), ...(other ? [other] : [])].join(' · ')} 빼고 식단을 짤게요`) : null, missing: '못 먹는 음식을 못 들었어요' },
    { key: 'plan', done: got.goal && got.level ? `${label(GOALS, got.goal)} · ${label(LEVELS, got.level)} 루틴을 짜 둘게요` : null, missing: got.goal ? '운동 경험을 못 들었어요' : '목표를 못 들었어요' },
    { key: 'body', done: got.height && got.weight ? `키 ${got.height}cm · ${got.weight}kg으로 하루 목표를 맞출게요` : null, missing: '키와 몸무게를 못 들었어요' },
  ];

  const ask = (key: HelloLineKey) => {
    setForm({ age: got.age ? String(got.age) : '', sex: got.sex, foods: got.allergens, none: got.noAllergy, other, goal: got.goal, level: got.level, height: got.height ? String(got.height) : '', weight: got.weight ? String(got.weight) : '' });
    setError('');
    setAsking(key);
  };
  const confirm = () => {
    if (asking === 'who') {
      const age = Number(form.age);
      if (!form.sex) return setError('성별을 골라 주세요.');
      if (!Number.isInteger(age) || age < 1 || age > 120) return setError('나이를 숫자로 적어 주세요.');
      if (tooYoung(age)) return setError('만 19세 이상부터 가입할 수 있어요.');
      setGot((current) => ({ ...current, age, sex: form.sex }));
    }
    if (asking === 'food') {
      if (!form.none && !form.foods.length && !form.other.trim()) return setError('못 먹는 음식을 고르거나 "없어요"를 골라 주세요.');
      setGot((current) => ({ ...current, allergens: form.none ? [] : form.foods, noAllergy: form.none }));
      setOther(form.none ? '' : form.other.trim());
    }
    if (asking === 'plan') {
      if (!form.goal) return setError('운동 목표를 골라 주세요.');
      if (!form.level) return setError('운동 경험을 골라 주세요.');
      setGot((current) => ({ ...current, goal: form.goal, level: form.level }));
    }
    if (asking === 'body') {
      const problem = bodyBasicsError(form.height, form.weight);
      if (problem) return setError(problem);
      setGot((current) => ({ ...current, height: Number(form.height), weight: Number(form.weight) }));
    }
    setAsking(null);
  };
  const keep = () => {
    updateDraft({
      gender: got.sex ?? undefined,
      selectedAllergens: got.allergens,
      otherAllergy: other,
      exerciseGoal: got.goal ?? draft.exerciseGoal,
      exerciseExperience: got.level ?? draft.exerciseExperience,
      height: got.height ? String(got.height) : '',
      weight: got.weight ? String(got.weight) : '',
    });
    setPhase('keep');
  };

  const chip = (on: boolean, text: string, onPress: () => void) => (
    <Pressable hitSlop={{ bottom: 2, top: 2 }} key={text} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipOnText]}>{text}</Text>
    </Pressable>
  );

  return (
    <>
      <HelloView
        example={EXAMPLE}
        input={input}
        lines={lines}
        onAccount={() => router.push({ pathname: '/signup/step1', params: { flow: 'b' } })}
        onAgain={() => { setInput(''); setPhase('open'); }}
        onAsk={ask}
        onBack={() => setPhase('heard')}
        onExample={() => { setInput(EXAMPLE); say(EXAMPLE); }}
        onGo={keep}
        onInput={setInput}
        onLogin={() => setShowLogin(true)}
        onPick={() => { setSaid(null); setGot(empty()); setOther(''); setPhase('heard'); }}
        onSay={() => say(input)}
        phase={phase}
        said={said}
      />
      <AppBottomSheet
        onClose={() => setAsking(null)}
        title={asking === 'who' ? '나이와 성별' : asking === 'food' ? '못 먹는 음식' : asking === 'plan' ? '목표와 운동 경험' : '키와 몸무게'}
        visible={asking !== null}
      >
        <View style={styles.sheet}>
          {asking === 'who' ? (
            <>
              <View style={styles.row}>
                {chip(form.sex === 'female', '여성', () => setForm({ ...form, sex: 'female' }))}
                {chip(form.sex === 'male', '남성', () => setForm({ ...form, sex: 'male' }))}
              </View>
              <TextInput accessibilityLabel="나이" keyboardType="number-pad" maxLength={3} onChangeText={(age) => setForm({ ...form, age })} placeholder="나이 (만 나이)" style={styles.field} value={form.age} />
            </>
          ) : null}
          {asking === 'food' ? (
            <>
              <View style={styles.wrap}>
                {chip(form.none, '없어요', () => setForm({ ...form, none: !form.none, foods: [], other: '' }))}
                {FOODS.map(([id, name]) => chip(form.foods.includes(id), name, () => setForm({ ...form, none: false, foods: form.foods.includes(id) ? form.foods.filter((food) => food !== id) : [...form.foods, id] })))}
              </View>
              <TextInput accessibilityLabel="그 밖의 알레르기, 선택" maxLength={50} onChangeText={(text) => setForm({ ...form, none: false, other: text })} placeholder="그 밖의 알레르기 (예: 키위, 토마토)" style={styles.field} value={form.other} />
              <Text style={styles.small}>참고용 정보예요. 음식을 먹기 전에는 성분표를 꼭 확인해 주세요.</Text>
            </>
          ) : null}
          {asking === 'plan' ? (
            <>
              <View style={styles.wrap}>{GOALS.map(([id, name]) => chip(form.goal === id, name, () => setForm({ ...form, goal: id })))}</View>
              <Text style={styles.small}>운동 경험 · 초보 6개월 미만 · 중급 2년까지 · 고급 그 이상</Text>
              <View style={styles.row}>{LEVELS.map(([id, name]) => chip(form.level === id, name, () => setForm({ ...form, level: id })))}</View>
            </>
          ) : null}
          {asking === 'body' ? (
            <View style={styles.row}>
              <TextInput accessibilityLabel="키" keyboardType="decimal-pad" maxLength={5} onChangeText={(height) => setForm({ ...form, height })} placeholder="키 (cm)" style={[styles.field, styles.grow]} value={form.height} />
              <TextInput accessibilityLabel="몸무게" keyboardType="decimal-pad" maxLength={5} onChangeText={(weight) => setForm({ ...form, weight })} placeholder="몸무게 (kg)" style={[styles.field, styles.grow]} value={form.weight} />
            </View>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" onPress={confirm} style={styles.go}>
            <Text style={styles.goText}>확인</Text>
          </Pressable>
        </View>
      </AppBottomSheet>
    </>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    sheet: { gap: 14, paddingBottom: 8 },
    row: { flexDirection: 'row', gap: 8 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    grow: { flex: 1 },
    chip: { backgroundColor: colors.surfaceMuted, borderRadius: 999, justifyContent: 'center', minHeight: 40, paddingHorizontal: 16 },
    chipOn: { backgroundColor: colors.primary },
    chipText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 },
    chipOnText: { color: colors.onPrimary },
    field: { backgroundColor: colors.surfaceMuted, borderRadius: 16, color: colors.textPrimary, fontSize: 15, minHeight: 50, paddingHorizontal: 16 },
    small: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    error: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 20 },
    go: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, justifyContent: 'center', minHeight: 52 },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
  } as const;
}
