import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard, Pressable, TextInput, View } from 'react-native';

import EyeSlashIcon from '@/assets/icons/auth-redesign/5facc.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import { AuthButton, AuthPage, AuthTextField } from '@/src/components/auth/AuthRedesign';
import { Text } from '@/src/components/common';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// The four rules shown under the fields; each turns dark with a check once it is met.
// The mix rule follows the Supabase setting (lower and upper case, digits, symbols).
function passwordChecks(password: string, confirmation: string) {
  return [
    { label: '8자 이상', met: password.length >= 8 },
    {
      label: '영문 대문자 · 소문자 · 숫자 · 특수문자 섞기',
      met:
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /\d/.test(password) &&
        /[^A-Za-z0-9]/.test(password),
    },
    { label: '두 칸이 같아요', met: password.length > 0 && password === confirmation },
    {
      label: '같은 글자를 3번 넘게 잇지 않기',
      met: password.length > 0 && !/(.)\1{3,}/.test(password),
    },
  ];
}

// Figma A9.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const confirmationRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const checks = passwordChecks(password, confirmation);
  const ready = checks.every((check) => check.met);
  const completeReset = () => {
    Keyboard.dismiss();
    if (ready) router.replace('/login');
  };

  return (
    <AuthPage
      footer={<AuthButton disabled={!ready} onPress={completeReset} title="비밀번호 바꾸기" />}
      heading="새 비밀번호를 정해 주세요"
      mode="password"
      onBack={() => router.back()}
    >
      <AuthTextField
        accessibilityLabel="새 비밀번호"
        autoCapitalize="none"
        autoComplete="new-password"
        label="새 비밀번호"
        onChangeText={setPassword}
        onSubmitEditing={() => confirmationRef.current?.focus()}
        placeholder="새 비밀번호"
        returnKeyType="next"
        rightElement={
          <VisibilityButton
            onPress={() => setPasswordVisible(!passwordVisible)}
            visible={passwordVisible}
          />
        }
        secureTextEntry={!passwordVisible}
        textContentType="newPassword"
        value={password}
      />
      <AuthTextField
        ref={confirmationRef}
        accessibilityLabel="새 비밀번호 한 번 더 입력"
        autoCapitalize="none"
        autoComplete="new-password"
        label="한 번 더 입력"
        onChangeText={setConfirmation}
        onSubmitEditing={completeReset}
        placeholder="새 비밀번호"
        returnKeyType="done"
        rightElement={
          <VisibilityButton
            onPress={() => setConfirmationVisible(!confirmationVisible)}
            visible={confirmationVisible}
          />
        }
        secureTextEntry={!confirmationVisible}
        textContentType="newPassword"
        value={confirmation}
      />
      <View style={styles.checks}>
        {checks.map((check) => (
          <View key={check.label} style={styles.checkRow}>
            <CheckIcon
              color={check.met ? colors.success : colors.textDisabled}
              height={18}
              width={18}
            />
            <Text style={check.met ? styles.checkMet : styles.checkLeft}>{check.label}</Text>
          </View>
        ))}
      </View>
    </AuthPage>
  );
}

function VisibilityButton({ onPress, visible }: { onPress: () => void; visible: boolean }) {
  return (
    <Pressable
      accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
    >
      {visible ? <EyeIcon height={20} width={20} /> : <EyeSlashIcon height={20} width={20} />}
    </Pressable>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    checks: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      gap: 10,
      padding: 16,
    },
    checkRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    checkMet: { ...text.body2, color: colors.textPrimary, flex: 1 },
    checkLeft: { ...text.body2, color: colors.textSecondary, flex: 1 },
  } as const;
}
