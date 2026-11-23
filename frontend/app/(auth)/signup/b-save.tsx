import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import {
  completeOnboarding,
  getSignupApiErrorMessage,
  saveAllergies,
  saveExercisePreferences,
  saveProfile,
} from '@/src/api/onboarding';
import { Text } from '@/src/components/common';
import { bodyBasicsError, saveBodyBasics } from '@/src/features/a/bodyBasics';
import { useSignup } from '@/src/features/signup/SignupContext';
import { goalType } from '@/src/features/signup/goalType';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal B: the account exists now, so what the one sentence said is saved, in the order the renewal A
// sign-up saves it (profile, allergies, goal and experience, height and weight), then the health papers.
// A failure keeps everything on this phone and offers to try again; nothing is asked twice.
export default function SignUpBSaveScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { draft, resetDraft } = useSignup();
  const [error, setError] = useState('');
  const running = useRef(false);

  const save = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError('');
    try {
      if (!draft.name || !draft.birthDate || !draft.gender) throw new Error('가입 정보가 없어요. 처음부터 다시 해 주세요.');
      await saveProfile({ name: draft.name, birthDate: draft.birthDate, gender: draft.gender });
      await saveAllergies(draft.selectedAllergens, draft.otherAllergy);
      await saveExercisePreferences(goalType[draft.exerciseGoal], draft.exerciseExperience, null);
      if (!bodyBasicsError(draft.height, draft.weight)) await saveBodyBasics(draft.height, draft.weight);
      await completeOnboarding();
      resetDraft();
      router.replace({ pathname: '/upload', params: { source: 'onboarding' } });
    } catch (cause) {
      setError(getSignupApiErrorMessage(cause));
    } finally {
      running.current = false;
    }
  }, [draft, resetDraft, router]);

  useEffect(() => {
    // the state changes come after the first answer, never during this effect
    void Promise.resolve().then(save);
    // once, when the screen opens; trying again is the button's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      {error ? (
        <View style={styles.group}>
          <Text style={styles.title}>첫날 준비를 저장하지 못했어요</Text>
          <Text style={styles.body}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void save()} style={styles.go}>
            <Text style={styles.goText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.group}>
          <ActivityIndicator />
          <Text style={styles.body}>첫날을 준비하고 있어요</Text>
        </View>
      )}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    group: { alignItems: 'center', gap: 14, paddingBottom: '18%' },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 20, lineHeight: 28, textAlign: 'center' },
    body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center' },
    go: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.primary, borderRadius: 999, justifyContent: 'center', minHeight: 54 },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
  } as const;
}
