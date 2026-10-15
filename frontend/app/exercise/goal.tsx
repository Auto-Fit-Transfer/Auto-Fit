import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  getActiveExerciseGoal,
  saveExerciseGoal,
  type ExerciseGoalInput,
} from '@/src/api/exercise';
import { getApiErrorMessage } from '@/src/api/client';
import { MainHeader, MainScreen, mainStyles } from '@/src/components/main/MainSurface';
import { FormField, form } from '@/src/components/main/FormControls';
const options = [
  ['maintenance', '건강 유지'],
  ['weight_loss', '체중 감량'],
  ['muscle_gain', '근력 향상'],
  ['endurance', '지구력'],
  ['rehabilitation', '재활'],
] as const;
export default function Goal() {
  const router = useRouter();
  const [type, setType] = useState<ExerciseGoalInput['goal_type']>('maintenance');
  const [frequency, setFrequency] = useState('');
  const [minutes, setMinutes] = useState('');
  const [weeks, setWeeks] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [startsOn, setStartsOn] = useState<string>();
  useEffect(() => {
    let live = true;
    void getActiveExerciseGoal()
      .then((r) => {
        if (!live) return;
        setLoaded(true);
        setError('');
        const g = r.goal as Partial<ExerciseGoalInput> | null;
        if (g) {
          setStartsOn(g.starts_on);
          if (options.some(([v]) => v === g.goal_type)) setType(g.goal_type!);
          setFrequency(String(g.weekly_frequency ?? ''));
          setMinutes(String(g.weekly_duration_minutes ?? ''));
          setWeeks(String(g.goal_period_weeks ?? ''));
        }
      })
      .catch((e) => {
        if (live) setError(getApiErrorMessage(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  const save = async () => {
    const f = Number(frequency),
      m = Number(minutes),
      w = Number(weeks);
    if (
      !Number.isInteger(f) ||
      f < 1 ||
      f > 7 ||
      !Number.isInteger(m) ||
      m < 1 ||
      m > 10080 ||
      !Number.isInteger(w) ||
      w < 1 ||
      w > 260
    ) {
      setError('주 횟수는 1~7회, 주 시간은 1~10,080분, 기간은 1~260주로 입력해 주세요.');
      return;
    }
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      await saveExerciseGoal({
        goal_type: type,
        weekly_frequency: f,
        weekly_duration_minutes: m,
        goal_period_weeks: w,
        ...(startsOn ? { starts_on: startsOn } : {}),
      });
      setSaved(true);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <MainScreen tabs={false}>
      <MainHeader title="운동 목표 설정" height={110} back={() => router.back()} />
      <View style={mainStyles.content}>
        <Text style={mainStyles.sectionTitle}>나에게 맞는 주간 목표</Text>
        <View style={form.row}>
          {options.map(([v, label]) => (
            <Pressable
              accessibilityRole="button"
              key={v}
              onPress={() => {
                setType(v);
                setSaved(false);
              }}
              style={[form.chip, type === v && form.selected]}
            >
              <Text style={mainStyles.text}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <FormField
          label="일주일 운동 횟수"
          value={frequency}
          keyboardType="number-pad"
          onChangeText={(v) => {
            setFrequency(v);
            setSaved(false);
          }}
          placeholder="1~7회"
        />
        <FormField
          label="일주일 총 운동 시간 (분)"
          value={minutes}
          keyboardType="number-pad"
          onChangeText={(v) => {
            setMinutes(v);
            setSaved(false);
          }}
        />
        <FormField
          label="목표 기간 (주)"
          value={weeks}
          keyboardType="number-pad"
          onChangeText={(v) => {
            setWeeks(v);
            setSaved(false);
          }}
        />
        {error ? <Text style={form.error}>{error}</Text> : null}
        {!loaded && !loading ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setLoading(true);
              setAttempt((v) => v + 1);
            }}
          >
            <Text style={form.label}>다시 불러오기</Text>
          </Pressable>
        ) : null}
        {saved ? <Text style={form.success}>운동 목표를 저장했어요.</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={loading || saving || !loaded}
          onPress={() => void save()}
          style={[mainStyles.button, (loading || saving || !loaded) && { opacity: 0.5 }]}
        >
          <Text style={mainStyles.buttonText}>
            {loading ? '목표 불러오는 중' : saving ? '저장 중…' : '목표 저장'}
          </Text>
        </Pressable>
      </View>
    </MainScreen>
  );
}
