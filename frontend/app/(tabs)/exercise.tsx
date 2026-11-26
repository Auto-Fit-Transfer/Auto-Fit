import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, Pressable, View } from 'react-native';

import CheckIcon from '@/assets/icons/ui/check.svg';
import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { ExerciseView, type ExerciseViewProps } from '@/src/components/b/ExerciseView';
import { AppBottomSheet, Text } from '@/src/components/common';
import { HealthGoalSheet } from '@/src/components/my/HealthGoalSheet';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { chatCharacters, loadChatCharacter, type ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const kinds = [
  { key: 'today', title: '오늘의 운동', detail: '맞춤 운동 추천', href: null },
  { key: 'running', title: '러닝', detail: '지역과 거리에 맞는 코스', href: '/exercise/running' },
  { key: 'posture', title: '자세 분석', detail: '옆모습 영상으로 확인', href: '/exercise/posture-check' },
] as const;

// Renewal B's exercise tab. The routine, its reason and every number are the server's; the tab only
// lays them out. A plan of several days still opens the schedule screen, as before.
export default function ExerciseScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { isDark } = useDisplayPreferences();
  const {
    homeError, homeLoadState, homeMetrics, latestSession, refreshHome,
    resultRecordCompleted, routine: loadedRoutine, startRoutine, status,
  } = useExerciseRoutine();
  const { beginSession } = useExerciseSession();
  // The context keeps the last recommendation even when it was made on an earlier day.
  const routine = status === 'not-created' ? null : loadedRoutine;
  const [kindsOpen, setKindsOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  // the character chosen in 물어보기 signs the routine, as on the home
  const [characterId, setCharacterId] = useState<ChatCharacterId>('quni');

  useFocusEffect(useCallback(() => {
    let active = true;
    void refreshHome();
    void loadChatCharacter().then((character) => { if (active) setCharacterId(character.id); });
    return () => { active = false; setKindsOpen(false); };
  }, [refreshHome]));

  const selectedPlan = routine?.planSessions.find((plan) => plan.id === routine.selectedPlanSessionId);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const futurePlan = Boolean(selectedPlan && selectedPlan.scheduledDate > todayKey);
  const hasPlan = Boolean(routine?.planSessions.length);
  const loading = homeLoadState === 'loading';

  const startNow = async () => {
    if (!routine || isStarting) return;
    setIsStarting(true);
    try {
      const started = await startRoutine();
      beginSession(routine, started);
      router.push('/exercise/session' as Href);
    } catch (error) {
      Alert.alert('운동을 시작하지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setIsStarting(false);
    }
  };

  const minutes = routine?.totalDurationMinutes ?? null;
  const headline: ExerciseViewProps['headline'] =
    status === 'completed'
      ? [[{ text: '오늘 운동을' }], [{ text: '마쳤어요' }]]
      : routine
        ? [[{ text: '오늘은' }], [{ text: `${routine.title} ` }, ...(minutes ? [{ text: `${minutes}분`, mark: true }] : [])]]
        : [[{ text: '오늘 운동을' }], [{ text: '정해 볼까요' }]];

  const doneFacts = [
    latestSession?.durationMinutes ? `${Math.round(latestSession.durationMinutes)}분` : null,
    latestSession?.itemCount ? `${latestSession.itemCount}가지` : null,
    latestSession?.calories ? `${latestSession.calories}kcal` : null,
  ].filter(Boolean).join(' · ');
  const line =
    status === 'completed'
      ? doneFacts || undefined
      : routine
        ? routine.reasons[0] ?? (routine.subtitle || undefined)
        : '시간과 장소, 컨디션만 고르면 짜 드려요';

  const sets = routine?.exercises.reduce((total, exercise) => total + (exercise.sets ?? 0), 0) ?? 0;
  const facts = routine && status !== 'completed'
    ? [
        `${routine.exercises.length}가지`,
        sets ? `${sets}세트` : null,
        routine.estimatedCalories == null ? null : `약 ${routine.estimatedCalories}kcal`,
      ].filter(Boolean).join(' · ')
    : undefined;

  const main: ExerciseViewProps['card']['main'] = loading
    ? { label: '운동 정보 확인 중', onPress: () => undefined, disabled: true }
    : status === 'completed'
      ? { label: '결과 보기', onPress: () => router.push(resultRecordCompleted ? '/exercise/ai-report' : '/exercise/completion') }
      : status === 'ready' && routine
        ? hasPlan
          ? { label: futurePlan ? '운동 일정 보기' : '오늘 운동 보기', onPress: () => router.push('/exercise/summary') }
          : { label: '운동 시작하기', onPress: () => void startNow(), busy: isStarting }
        : { label: '오늘 운동 추천받기', onPress: () => router.push('/exercise/condition') };

  const latestDate = latestSession?.date ? new Date(latestSession.date) : null;
  const latestDetail = latestSession
    ? [
        latestDate && !Number.isNaN(latestDate.getTime()) ? `${latestDate.getMonth() + 1}월 ${latestDate.getDate()}일` : null,
        latestSession.durationMinutes ? `${Math.round(latestSession.durationMinutes)}분` : null,
      ].filter(Boolean).join(' · ')
    : '아직 없어요';
  const value = (number: number | null | undefined) => (number == null ? '—' : `${number}`);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ExerciseView
        by={{ characterId, text: routine && status !== 'completed' ? `${(chatCharacters.find((item) => item.id === characterId) ?? chatCharacters[0]).name}가 짜 뒀어요` : (chatCharacters.find((item) => item.id === characterId) ?? chatCharacters[0]).name }}
        card={{
          facts,
          detail: routine && status === 'ready' && !hasPlan
            ? { label: '자세히', onPress: () => router.push('/exercise/summary') }
            : undefined,
          moves: routine && status !== 'completed'
            ? routine.exercises.map((exercise) => {
                const picture = exercise.demoGifUrl ?? exercise.thumbnailUrl;
                return { key: exercise.id, name: exercise.name, detail: exercise.prescription, picture: picture && /^https:[/][/]/i.test(picture) ? picture : null };
              })
            : [],
          main,
          links: [
            ...(routine || status === 'completed' ? [{ label: '다시 추천받기', onPress: () => router.push('/exercise/condition') }] : []),
            { label: '내 루틴 불러오기', onPress: () => router.push('/exercise/saved-routines') },
          ],
        }}
        error={homeError ? { text: homeError, onRetry: () => void refreshHome() } : null}
        headerRight={
          <SimpleReadButton
            text={`오늘의 운동입니다. ${status === 'completed' ? '오늘 운동을 마쳤어요.' : routine?.title ?? '오늘의 맞춤 운동을 준비해요.'} 이번 주 운동은 ${value(homeMetrics.currentWeekWorkoutCount)}회 완료했고 목표는 ${value(homeMetrics.targetWorkoutCount)}회입니다.`}
          />
        }
        headline={headline}
        kind={{ label: '오늘의 운동', onPress: () => setKindsOpen(true) }}
        line={line}
        more={[
          { key: 'history', title: '운동 기록', detail: latestDetail, onPress: () => router.push('/exercise/history') },
          // The one goal box of 내 정보 holds the exercise numbers with the rest of the goal; the record holds the progress.
          { key: 'goal', title: '운동 목표', detail: homeMetrics.targetWorkoutCount ? `주 ${homeMetrics.targetWorkoutCount}회` : undefined, onPress: () => setGoalOpen(true) },
          { key: 'guide', title: '부위별 운동 가이드', detail: '불편한 부위의 가이드', onPress: () => router.push('/exercise/body-guide') },
        ]}
      />
      <AppBottomSheet onClose={() => setKindsOpen(false)} title="어떤 운동을 할까요?" visible={kindsOpen}>
        <View style={styles.kinds}>
          {kinds.map((kind, index) => (
            <Pressable
              key={kind.key}
              accessibilityRole="button"
              accessibilityState={{ selected: kind.href === null }}
              onPress={() => {
                setKindsOpen(false);
                if (kind.href) router.push(kind.href);
              }}
              style={[styles.kindRow, index > 0 && styles.kindLine]}
            >
              <View style={styles.kindCopy}>
                <Text style={styles.kindTitle}>{kind.title}</Text>
                <Text style={styles.kindDetail}>{kind.detail}</Text>
              </View>
              {kind.href === null ? <CheckIcon color={colors.textPrimary} height={20} width={20} /> : null}
            </Pressable>
          ))}
        </View>
      </AppBottomSheet>
      {goalOpen ? <HealthGoalSheet onClose={() => { setGoalOpen(false); void refreshHome(); }} visible /> : null}
    </>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    kinds: { paddingBottom: 8 },
    kindRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64, paddingVertical: 10 },
    kindLine: { borderTopColor: colors.border, borderTopWidth: 1 },
    kindCopy: { flex: 1, gap: 2 },
    kindTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 23 },
    kindDetail: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  } as const;
}
