import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Keyboard, Pressable, TextInput, View } from 'react-native';

import CheckIcon from '@/assets/icons/system/Check.svg';
import EyeSlashIcon from '@/assets/icons/auth-redesign/5facc.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import { AuthButton, AuthTextField } from '@/src/components/auth/AuthRedesign';
import { PasswordAuthScreenLayout } from '@/src/components/auth';
import { getSupabaseClient } from '@/src/lib/supabase';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

export default function ResetPasswordScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const confirmationRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const conditions = [
    { label: '8자 이상', met: password.length >= 8 },
    {
      label: '영문 · 숫자 · 특수문자를 모두 섞기',
      met: /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password),
    },
    { label: '두 칸이 같아요', met: password.length > 0 && password === confirmation },
    { label: '같은 글자를 3번 넘게 잇지 않기', met: password.length > 0 && !/(.)\1{3}/.test(password) },
  ];
  const ready = conditions.every((condition) => condition.met);

  const completeReset = async () => {
    Keyboard.dismiss();
    if (!ready || saving) return;
    setSaving(true);
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password });
      if (error) throw error;
      router.replace('/login');
    } catch (error) {
      console.error('비밀번호 변경 실패:', error);
      Alert.alert('비밀번호를 바꾸지 못했습니다', '메일의 링크를 다시 눌러 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PasswordAuthScreenLayout
      description=""
      footer={<AuthButton disabled={!ready} loading={saving} onPress={() => void completeReset()} title="비밀번호 바꾸기" />}
      onBack={() => router.back()}
      title="새 비밀번호를 정해 주세요"
    >
      <AuthTextField
        accessibilityLabel="새 비밀번호"
        autoCapitalize="none"
        autoComplete="new-password"
        label="새 비밀번호"
        onChangeText={setPassword}
        onSubmitEditing={() => confirmationRef.current?.focus()}
        placeholder="새 비밀번호를 입력해 주세요"
        returnKeyType="next"
        rightElement={
          <VisibilityButton onPress={() => setPasswordVisible(!passwordVisible)} visible={passwordVisible} />
        }
        secureTextEntry={!passwordVisible}
        textContentType="newPassword"
        value={password}
      />
      <AuthTextField
        ref={confirmationRef}
        accessibilityLabel="한 번 더 입력"
        autoCapitalize="none"
        autoComplete="new-password"
        label="한 번 더 입력"
        onChangeText={setConfirmation}
        onSubmitEditing={() => void completeReset()}
        placeholder="새 비밀번호를 다시 입력해 주세요"
        returnKeyType="done"
        rightElement={
          <VisibilityButton onPress={() => setConfirmationVisible(!confirmationVisible)} visible={confirmationVisible} />
        }
        secureTextEntry={!confirmationVisible}
        textContentType="newPassword"
        value={confirmation}
      />
      <View style={styles.conditions}>
        {conditions.map((condition) => (
          <View key={condition.label} style={styles.conditionRow}>
            <CheckIcon color={condition.met ? colors.success : colors.textDisabled} height={18} width={18} />
            <Text style={[styles.conditionText, condition.met && styles.conditionMet]}>{condition.label}</Text>
          </View>
        ))}
      </View>
    </PasswordAuthScreenLayout>
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
      {visible ? <EyeSlashIcon height={22} width={22} /> : <EyeIcon height={22} width={22} />}
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    conditions: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 10,
      padding: 16,
    },
    conditionRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 21 },
    conditionText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 21 },
    conditionMet: { color: colors.textPrimary },
  } as const;
}
