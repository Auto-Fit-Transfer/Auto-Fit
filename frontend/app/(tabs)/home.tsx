import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { getDietNutritionSummary } from '@/src/api/diet';
import { getHome } from '@/src/api/home';
import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import { HomeView, type HomeDid } from '@/src/components/b/HomeView';
import { NotificationBell } from '@/src/components/community/NotificationBell';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { loadChatCharacter, type ChatCharacterId } from '@/src/features/chat/chatCharacters';
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

// Renewal B's home. Every line it shows comes from the server: nothing is said about a meal,
// a routine or a tier the server did not give.
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
      void getDietNutritionSummary(localDayKey(new Date()))
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
  const calorieTarget = nutritionNumber(nutrition?.calories.target);
  const latestDate = latestSession?.date ? new Date(latestSession.date) : null;
  const exercisedToday = Boolean(
    latestSession?.completed &&
      latestDate &&
      !Number.isNaN(latestDate.getTime()) &&
      latestDate.toDateString() === today.toDateString(),
  );
  const hasRoutine = status !== null && status !== 'not-created' && routine !== null;

  // What the app already did for me today, in the order of the day.
  const did: HomeDid[] = [];
  if (consumed !== null && consumed > 0) {
    did.push({
      key: 'eaten',
      title: '오늘 먹은 것을 더해 뒀어요',
      detail: calorieTarget ? `${kcal(consumed)} · 목표 ${kcal(calorieTarget)}` : kcal(consumed),
      // Both diet lines open the same screen, so only one carries the button.
      action: nutrition?.has_recommendation ? undefined : { label: '식단 보기', onPress: () => router.push('/diet') },
    });
  }
  if (nutrition?.has_recommendation) {
    did.push({
      key: 'diet',
      title: '오늘 식단을 골라 뒀어요',
      detail: calorieTarget ? `하루 목표 ${kcal(calorieTarget)}에 맞췄어요` : undefined,
      action: { label: '식단 보기', onPress: () => router.push('/diet') },
    });
  }
  if (hasRoutine && !exercisedToday) {
    did.push({
      key: 'routine',
      title: '오늘 운동을 짜 뒀어요',
      detail: routine.reasons[0],
    });
  }

  const minutes = routine?.totalDurationMinutes ?? null;
  const routineTitle = hasRoutine ? `${routine.title}${minutes ? ` ${minutes}분` : ''}` : '';
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

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <HomeView
        characterId={characterId}
        did={did}
        firstDay={firstDay}
        headerRight={
          <>
            <SimpleReadButton
              text={`${name}님, 반가워요. ${tier ? `현재 티어는 ${tier.tier_name} ${tier.sublevel}입니다.` : ''} 오늘 식단과 운동을 확인하고 기록해 보세요.`}
            />
            <NotificationBell />
          </>
        }
        name={name}
        now={now}
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
