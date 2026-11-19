import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { getDietNutritionSummary } from '@/src/api/diet';
import { getHome } from '@/src/api/home';
import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import { LobbyView, type LobbyQuest } from '@/src/components/a/LobbyView';
import { WHO_KEY, whoList, type Who } from '@/src/components/a/sprites';
import { NotificationBell } from '@/src/components/community/NotificationBell';
import { flushBodyBasics } from '@/src/features/a/bodyBasics';
import { useDailyQuests, WATER_GOAL } from '@/src/features/a/dailyQuests';
import { STEP_GOAL, useSteps } from '@/src/features/a/useSteps';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { localDayKey } from '@/src/features/exercise/useWeekWorkouts';
import { nutritionNumber } from '@/src/features/nutritionSummary';
import { tierLook } from '@/src/features/tier/tierLook';
import { getSupabaseClient } from '@/src/lib/supabase';

// The gold +N on a quest is the server's tier rule, as the tier screen states it (app/tier.tsx): a meal record +2, the recommended workout +5, a health paper +15.

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

// Renewal A's home: the lobby. The tier is the server's habit tier, and today's quests are the three
// things the server gives tier points for (a meal record, the recommended workout, a health paper).
// Water and stretching are kept on this phone (src/features/a/dailyQuests.ts). Not here yet: steps and the
// walking quests (they need the phone's step counter, a new native part).
export default function HomeScreen() {
  const router = useRouter();
  const [name, setName] = useState('회원');
  const [hasScore, setHasScore] = useState<boolean | null>(null);
  const [eaten, setEaten] = useState<number | null>(null);
  const [tier, setTier] = useState<HabitTierProgress | null>(null);
  const [who, setWho] = useState<Who>('worker-f');
  const { latestSession, refreshHome, routine, status } = useExerciseRoutine();
  const daily = useDailyQuests();
  const walk = useSteps();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // height · weight from sign-up that the server could not take yet
      void flushBodyBasics();
      // The character I chose is kept on this phone.
      void AsyncStorage.getItem(WHO_KEY)
        .then((saved) => {
          if (active && whoList.includes(saved as Who)) setWho(saved as Who);
        })
        .catch(() => undefined);
      void getHabitTierProgress()
        .then(({ progress }) => {
          if (active) setTier(progress);
        })
        .catch(() => undefined);
      void refreshHome();
      void getDietNutritionSummary(localDayKey(new Date()))
        .then((response) => {
          if (active) setEaten(nutritionNumber(response.summary.calories.consumed));
        })
        .catch(() => undefined);
      void getHome()
        .then(async (response) => {
          if (!active) return;
          const score = response.health_score.score;
          setHasScore(score !== null && score !== undefined);
          const resolved = response.user_name.trim() || (await getSessionName());
          if (active && resolved) setName(resolved);
        })
        .catch(async () => {
          const resolved = await getSessionName();
          if (active && resolved) setName(resolved);
        });
      return () => {
        active = false;
      };
    }, [refreshHome]),
  );

  const today = new Date();
  const latestDate = latestSession?.date ? new Date(latestSession.date) : null;
  const exercisedToday = Boolean(
    latestSession?.completed &&
      latestDate &&
      !Number.isNaN(latestDate.getTime()) &&
      latestDate.toDateString() === today.toDateString(),
  );
  const hasRoutine = status !== null && status !== 'not-created' && routine !== null;
  const minutes = routine?.totalDurationMinutes;

  const quests: LobbyQuest[] = [
    // The walking quest counts itself once the phone's step counter is allowed.
    ...(walk.state === 'on'
      ? [{
          key: 'walk',
          icon: 4,
          name: `${STEP_GOAL.toLocaleString('ko-KR')}걸음 걷기`,
          done: walk.steps >= STEP_GOAL,
          state: `${walk.steps.toLocaleString('ko-KR')} / ${STEP_GOAL.toLocaleString('ko-KR')} · 자동`,
          say: '조금만 더 걸으면 6,000걸음!',
        }]
      : walk.state === 'ask'
        ? [{
            key: 'walk',
            icon: 4,
            name: `${STEP_GOAL.toLocaleString('ko-KR')}걸음 걷기`,
            done: false,
            state: '걸음 기록을 켜면 알아서 세요',
            action: { label: '켜기', onPress: () => void walk.turnOn() },
          }]
        : []),
    {
      key: 'meal',
      icon: 0,
      points: 2,
      name: '식사 기록하기',
      done: eaten !== null && eaten > 0,
      state: '아직 기록이 없어요',
      say: '식사했다면 기록해 볼까요?',
      action: { label: '기록', onPress: () => router.push('/diet') },
    },
    {
      key: 'workout',
      icon: 1,
      points: 5,
      name: '오늘의 운동',
      done: exercisedToday,
      state: hasRoutine ? `${routine.title}${minutes ? ` ${minutes}분` : ''}` : '시간과 장소만 고르면 돼요',
      say: '오늘의 운동, 지금 해 볼까요?',
      action: { label: '시작', onPress: () => router.push('/exercise') },
    },
    {
      key: 'water',
      icon: 5,
      name: `물 ${WATER_GOAL}잔`,
      done: daily.water >= WATER_GOAL,
      state: `${daily.water} / ${WATER_GOAL}잔`,
      say: '물 한 잔 마실 시간이에요',
      action: { label: '한 잔', onPress: daily.addWater },
    },
    {
      key: 'stretch',
      icon: 6,
      name: '스트레칭 5분',
      done: daily.stretch,
      state: '몸을 풀고 나서 눌러 주세요',
      say: '5분만 몸을 풀어 볼까요?',
      action: { label: '했어요', onPress: daily.doStretch },
    },
    ...(hasScore === false
      ? [
          {
            key: 'docs',
            icon: 3,
            points: 15,
            name: '건강 서류 올리기',
            done: false,
            state: '인바디 · 건강검진표',
            say: '건강 서류를 올리면 더 잘 맞춰 드려요',
            action: { label: '올리기', onPress: () => router.push('/upload') },
          },
        ]
      : []),
  ];

  return (
    <>
      <StatusBar style="dark" />
      <LobbyView
        bell={<NotificationBell />}
        name={name}
        onAsk={() => router.push('/chat')}
        onMe={() => router.push('/my')}
        onPickWho={(next) => {
          setWho(next);
          void AsyncStorage.setItem(WHO_KEY, next).catch(() => undefined);
        }}
        onMenu={(menu) => router.push(menu === 'report' ? '/health-report' : `/${menu}`)}
        onTier={() => router.push('/tier')}
        quests={quests}
        steps={walk.state === 'on' ? { count: walk.steps } : walk.state === 'ask' ? { ask: () => void walk.turnOn() } : null}
        tier={tier ? tierLook(tier) : null}
        who={who}
      />
    </>
  );
}
