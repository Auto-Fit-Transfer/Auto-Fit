import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import HouseIcon from '@/assets/icons/ui/house.svg';
import {
  getActiveExerciseGoal,
  saveExerciseGoal,
  type ExerciseGoalInput,
} from '@/src/api/exercise';
import { getApiErrorMessage } from '@/src/api/client';
import { AppButton, AppTextField, IconButton, Notice, Text } from '@/src/components/common';
import { ChoiceSection } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Figma E12 names for the server's goal types.
const options = [
  ['muscle_gain', '근력 키우기'],
  ['weight_loss', '체중 관리하기'],
  ['endurance', '체력 기르기'],
  ['maintenance', '꾸준히 운동하기'],
  ['rehabilitation', '재활 · 회복'],
] as const;
const frequencies = [1, 2, 3, 4, 5, 6, 7];

export default function Goal() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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

  const edit = (apply: () => void) => {
    apply();
    setSaved(false);
  };

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
      setError('횟수는 1~7번, 운동 시간은 1~10,080분, 기간은 1~260주로 적어 주세요.');
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
    <SubScreen
      footer={
        !loaded && !loading ? (
          <AppButton
            onPress={() => {
              setLoading(true);
              setAttempt((v) => v + 1);
            }}
            title="다시 불러오기"
            variant="secondary"
          />
        ) : (
          <AppButton
            disabled={loading || !loaded}
            loading={saving}
            onPress={() => void save()}
            title={loading ? '목표 불러오는 중' : '목표 저장하기'}
          />
        )
      }
      gap={28}
      onBack={() => router.back()}
      right={
        <IconButton
          accessibilityLabel="홈으로"
          icon={<HouseIcon color={colors.textPrimary} height={24} width={24} />}
          onPress={() => router.dismissTo('/home')}
          size={44}
        />
      }
      title="운동 목표"
    >
      <ChoiceSection title="무엇을 이루고 싶나요?">
        <View style={styles.goalGrid}>
          {options.map(([value, label]) => {
            const selected = type === value;
            return (
              <Pressable
                key={value}
                accessibilityLabel={label}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => edit(() => setType(value))}
                style={[styles.goalOption, selected && styles.goalOptionSelected]}
              >
                <Text style={selected ? styles.goalLabelSelected : styles.goalLabel}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ChoiceSection>
      <ChoiceSection title="일주일에 몇 번 할까요?">
        <View style={styles.frequencyRow}>
          {frequencies.map((value) => {
            const selected = frequency === String(value);
            return (
              <Pressable
                key={value}
                accessibilityLabel={`${value}번`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => edit(() => setFrequency(String(value)))}
                style={[styles.circle, selected && styles.circleSelected]}
              >
                <Text style={selected ? styles.circleLabelSelected : styles.circleLabel}>
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.caption}>헬스 · 홈트 · 러닝을 모두 합쳐 세요.</Text>
      </ChoiceSection>
      <AppTextField
        keyboardType="number-pad"
        label="일주일에 운동할 시간"
        onChangeText={(v) => edit(() => setMinutes(v.replace(/\D/g, '')))}
        placeholder="예) 90"
        rightElement={<Text style={styles.unit}>분</Text>}
        value={minutes}
      />
      <AppTextField
        keyboardType="number-pad"
        label="목표 기간"
        onChangeText={(v) => edit(() => setWeeks(v.replace(/\D/g, '')))}
        placeholder="예) 4"
        rightElement={<Text style={styles.unit}>주</Text>}
        value={weeks}
      />
      {error ? <Notice body={error} tone="warning" /> : null}
      {saved ? <Notice body="운동 목표를 저장했어요." /> : null}
    </SubScreen>
  );
}

function createStyles({ colors, text, easyMode }: AppTheme) {
  const circleSize = easyMode ? 44 : 40;
  return {
    goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    goalOption: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      flexBasis: '47%',
      flexGrow: 1,
      justifyContent: 'center',
      minHeight: easyMode ? 48 : 44,
      paddingHorizontal: 12,
    },
    goalOptionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    goalLabel: { ...text.body2Strong, color: colors.textBody },
    goalLabelSelected: { ...text.body2Strong, color: colors.onPrimary },
    frequencyRow: { flexDirection: 'row', justifyContent: 'space-between' },
    circle: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: circleSize / 2,
      borderWidth: 1,
      height: circleSize,
      justifyContent: 'center',
      width: circleSize,
    },
    circleSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    circleLabel: { ...text.body1Strong, color: colors.textBody },
    circleLabelSelected: { ...text.body1Strong, color: colors.onPrimary },
    caption: { ...text.caption, color: colors.textSecondary },
    unit: { ...text.body2, color: colors.textSecondary },
  } as const;
}
