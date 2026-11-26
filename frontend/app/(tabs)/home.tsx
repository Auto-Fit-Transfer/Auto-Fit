import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { getDietNutritionSummary, getWeeklyDiet, getWeeklyDietFeedback } from '@/src/api/diet';
import { getHome } from '@/src/api/home';
import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import { HomeBoldView, type HomeProposal } from '@/src/components/b/HomeBoldView';
import { NotificationBell } from '@/src/components/community/NotificationBell';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { chatCharacters, loadChatCharacter, type ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { homeHeadline, nextMeal } from '@/src/features/b/homePlan';
import { mapWeeklyMeals, type Meal } from '@/src/features/diet/dayMeals';
import { weekStartOf, weeklyDayFor } from '@/src/features/diet/weeklyMeals';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { localDayKey, useWeekWorkouts } from '@/src/features/exercise/useWeekWorkouts';
import { nutritionNumber, type NutritionSummary } from '@/src/features/nutritionSummary';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { nextTierName } from '@/src/features/tier/tierBadges';
import { getSupabaseClient } from '@/src/lib/supabase';

type LoadState = 'loading' | 'ready' | 'error';
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const kcal = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}kcal`;

async function getSessionName() {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    const metadata = data.session?.user.user_metadata;
    const name = metadata?.full_name ?? metadata?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

// Renewal B's home (the bolder layout chosen 11/26): the app's proposal for today in the headline, each
// proposal with 이대로 / 조정 / 내 방식으로. Every line comes from the server: nothing is said about a meal,
// a routine or a tier the server did not give, and never "N kcal more is fine".
export default function HomeScreen() {
  const router = useRouter();
  const { onboardingSkip } = useLocalSearchParams<{ onboardingSkip?: string }>();
  const { isDark } = useDisplayPreferences();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [hasScore, setHasScore] = useState(false);
  const [name, setName] = useState('회원');
  const [nutrition, setNutrition] = useState<NutritionSummary | null>(null);
  const [tier, setTier] = useState<HabitTierProgress | null>(null);
  const [characterId, setCharacterId] = useState<ChatCharacterId>('quni');
  // today's meals from this week's plan, and the ones already recorded (as the diet tab reads them)
  const [meals, setMeals] = useState<{ list: Meal[]; recorded: string[] } | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const { days: workoutDays } = useWeekWorkouts();
  const { latestSession, refreshHome, routine, status } = useExerciseRoutine();
  const today = new Date();
  const todayKey = localDayKey(today);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const week = Array.from(
    { length: 7 },
    (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index),
  );

  // The face on the black card is the character chosen in the chat.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadChatCharacter().then((character) => {
        if (active) setCharacterId(character.id);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // Runs each time the tab comes back into view, and again from 다시 시도.
  const load = useCallback(() => {
      let active = true;
      setLoadState((current) => (current === 'ready' ? current : 'loading'));
      void getHabitTierProgress()
        .then(({ progress }) => {
          if (active) setTier(progress);
        })
        .catch(() => undefined);
      void refreshHome();
      const dayKey = localDayKey(new Date());
      void getWeeklyDiet(weekStartOf(dayKey))
        .then(async (plan) => {
          const list = mapWeeklyMeals(plan, dayKey);
          const day = weeklyDayFor(plan, dayKey)?.day ?? null;
          const feedback = await getWeeklyDietFeedback(plan.weekly_diet_plan_id).catch(() => null);
          const recorded = [...(feedback?.feedback ?? []), ...(feedback?.legacy_feedback ?? [])].filter((item) => item.plan_day === day).map((item) => item.meal_type);
          if (active) setMeals({ list, recorded });
        })
        .catch(() => { if (active) setMeals(null); }); // no plan this week: no meal is proposed
      void getDietNutritionSummary(dayKey)
        .then((response) => {
          if (active) setNutrition(response.summary);
        })
        .catch(() => undefined);
      void getHome()
        .then(async (response) => {
          if (!active) return;
          const score = response.health_score.score;
          setHasScore(score !== null && score !== undefined);
          const resolvedName = response.user_name.trim() || (await getSessionName()) || '회원';
          if (!active) return;
          setName(resolvedName);
          setCheckedAt(new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }));
          setLoadState('ready');
        })
        .catch(async () => {
          if (!active) return;
          const resolvedName = (await getSessionName()) || '회원';
          if (!active) return;
          setName((current) => (current === '회원' ? resolvedName : current));
          setLoadState((current) => (current === 'ready' ? current : 'error'));
        });
      return () => {
        active = false;
      };
  }, [refreshHome]);
  useFocusEffect(load);

  const consumed = nutritionNumber(nutrition?.calories.consumed);
  const latestDate = latestSession?.date ? new Date(latestSession.date) : null;
  const exercisedToday = Boolean(
    latestSession?.completed &&
      latestDate &&
      !Number.isNaN(latestDate.getTime()) &&
      latestDate.toDateString() === today.toDateString(),
  );
  const hasRoutine = status !== null && status !== 'not-created' && routine !== null;

  const minutes = routine?.totalDurationMinutes ?? null;
  const routineTitle = hasRoutine ? `${routine.title}${minutes ? ` ${minutes}분` : ''}` : '';
  const meal = meals ? nextMeal(meals.list, meals.recorded) : null;

  // The app's proposals, each with the three answers (11/26): take it, meet halfway, or my own way.
  const proposals: HomeProposal[] = [];
  if (hasRoutine && !exercisedToday) {
    proposals.push({
      key: 'routine',
      title: routine.reasons[0] ?? '오늘 운동을 짜 뒀어요',
      detail: [routine.exercises.slice(0, 3).map((move) => move.name).join(' · '), minutes ? `${minutes}분` : null].filter(Boolean).join(' · '),
      choices: [
        { label: '이대로', kind: 'accept', onPress: () => router.push('/exercise/summary') },
        { label: '가볍게 조정', kind: 'adjust', onPress: () => router.push({ pathname: '/exercise/condition', params: { source: 'summary' } }) },
        { label: '내 루틴으로', kind: 'own', onPress: () => router.push('/exercise/saved-routines') },
      ],
    });
  }
  if (meal) {
    proposals.push({
      key: `meal-${meal.id}`,
      title: `${meal.title} 메뉴를 골라 뒀어요`,
      detail: [meal.foods, meal.kcal !== null ? kcal(meal.kcal) : null].filter(Boolean).join(' · '),
      choices: [
        { label: '이대로', kind: 'accept', onPress: () => undefined }, // nothing to save: the card says it is taken
        { label: '다른 메뉴', kind: 'adjust', onPress: () => router.push('/diet') },
        { label: '먹은 걸로 기록', kind: 'own', onPress: () => router.push('/diet') },
      ],
    });
  }
  const now = exercisedToday
    ? {
        label: '오늘 할 일 끝',
        title: `오늘 운동 ${Math.round(latestSession?.durationMinutes ?? 0)}분`,
        facts: latestSession?.calories ? `약 ${kcal(latestSession.calories)}` : undefined,
        button: '기록 보기',
        onPress: () => router.push('/exercise/history'),
      }
    : hasRoutine
      ? {
          label: '지금 할 일 하나',
          title: routineTitle,
          facts: [
            routine.estimatedCalories ? `약 ${kcal(routine.estimatedCalories)}` : null,
            routine.exercises.length ? `${routine.exercises.length}가지` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          button: '시작',
          onPress: () => router.push('/exercise'),
        }
      : {
          label: '지금 할 일 하나',
          title: '오늘 운동 정하기',
          facts: '시간과 장소만 고르면 짜 드려요',
          button: '시작',
          onPress: () => router.push('/exercise/condition'),
        };

  const firstDay = onboardingSkip === '1' && loadState === 'ready' && !hasScore;
  const dayCount = workoutDays.length;
  const tierRatio =
    tier && tier.next_level_points !== null && tier.next_level_points > tier.level_start_points
      ? Math.min(
          100,
          Math.max(
            0,
            ((tier.points - tier.level_start_points) / (tier.next_level_points - tier.level_start_points)) * 100,
          ),
        )
      : tier
        ? 100
        : 0;
  const nextName = tier ? nextTierName(tier) : null;

  const character = chatCharacters.find((item) => item.id === characterId) ?? chatCharacters[0];
  const headline =
    loadState === 'loading'
      ? [[{ text: `${name} 님,` }], [{ text: '오늘을 살펴보고 있어요' }]]
      : loadState === 'error'
        ? [[{ text: '오늘 정보를' }], [{ text: '불러오지 못했어요' }]]
        : firstDay
          ? [[{ text: `반가워요, ${name} 님` }], [{ text: '오늘을 같이 시작해요' }]]
          : homeHeadline(name, hasRoutine ? routineTitle : null, exercisedToday, meal);
  const picture = hasRoutine && !exercisedToday ? (routine.exercises[0]?.demoGifUrl ?? routine.exercises[0]?.thumbnailUrl ?? null) : null;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <HomeBoldView
        by={checkedAt ? `${character.name} · ${checkedAt}에 살펴봤어요` : character.name}
        characterId={characterId}
        plan={headline}
        proposals={loadState === 'ready' ? proposals : []}
        recorded={loadState === 'ready' && consumed !== null && consumed > 0 ? { text: `오늘 ${kcal(consumed)}를 기록해 뒀어요`, action: { label: '고치기', onPress: () => router.push('/diet') } } : null}
        headerRight={
          <>
            <SimpleReadButton
              text={`${name}님, 반가워요. ${tier ? `현재 티어는 ${tier.tier_name} ${tier.sublevel}입니다.` : ''} 오늘 식단과 운동을 확인하고 기록해 보세요.`}
            />
            <NotificationBell />
          </>
        }
        name={name}
        now={{ ...now, picture: picture && /^https:[/][/]/i.test(picture) ? picture : null }}
        onAsk={() => router.push('/chat')}
        onRetry={() => {
          load();
        }}
        state={loadState}
        tier={
          tier
            ? {
                name: `${tier.tier_name} ${tier.sublevel}`,
                ratio: tierRatio,
                next: nextName
                  ? `${nextName}까지 ${Math.max(0, (tier.next_level_points ?? 0) - tier.points)}점`
                  : undefined,
                onPress: () => router.push('/tier'),
              }
            : null
        }
        week={{
          days: week.map((day) => {
            const key = localDayKey(day);
            return { key, label: weekdays[day.getDay()], done: workoutDays.includes(key), today: key === todayKey };
          }),
          summary:
            dayCount === 0 && !exercisedToday
              ? '이번 주 첫 운동을 해 봐요'
              : `${dayCount}일 운동 · ${exercisedToday ? '오늘도 했어요' : '오늘은 아직'}`,
          onPress: () => router.push('/health-report'),
        }}
      />
    </>
  );
}
