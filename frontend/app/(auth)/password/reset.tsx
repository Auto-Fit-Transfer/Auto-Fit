import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import LockIcon from '@/assets/icons/auth-redesign/6a5e9.svg';
import EyeSlashIcon from '@/assets/icons/auth-redesign/5facc.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import { AuthButton, AuthTextField } from '@/src/components/auth/AuthRedesign';
import { PasswordAuthScreenLayout, PasswordAuthSection } from '@/src/components/auth';
import { colors, fontFamilies } from '@/src/theme';

const passwordConditions = [
  '8자 이상 입력해 주세요.',
  '영문, 숫자, 특수문자를 포함해 주세요.',
  '연속되거나 반복되는 문자 사용은 피해 주세요.',
] as const;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const confirmationRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const passwordsMatch = confirmation.length === 0 || password === confirmation;
  const completeReset = () => {
    Keyboard.dismiss();
    if (passwordsMatch) router.replace('/login');
  };

  return (
    <PasswordAuthScreenLayout
      description="안전한 비밀번호는 계정 보호에 도움이 됩니다."
      footer={
        <AuthButton disabled={!passwordsMatch} onPress={completeReset} title="비밀번호 변경" />
      }
      onBack={() => router.back()}
      title="비밀번호 재설정"
    >
      <PasswordAuthSection top={0} innerStyle={styles.card}>
        <AuthTextField
          accessibilityLabel="새 비밀번호"
          autoCapitalize="none"
          autoComplete="new-password"
          label="새 비밀번호"
          leftElement={<LockIcon height={20} width={20} />}
          onChangeText={setPassword}
          onSubmitEditing={() => confirmationRef.current?.focus()}
          placeholder="새 비밀번호를 입력해 주세요"
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
          accessibilityLabel="새 비밀번호 확인"
          autoCapitalize="none"
          autoComplete="new-password"
          label="새 비밀번호 확인"
          leftElement={<LockIcon height={20} width={20} />}
          onChangeText={setConfirmation}
          onSubmitEditing={completeReset}
          placeholder="새 비밀번호를 다시 입력해 주세요"
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
        <View style={styles.conditions}>
          <Text style={styles.conditionsTitle}>비밀번호 조건</Text>
          {passwordConditions.map((condition) => (
            <View key={condition} style={styles.conditionRow}>
              <View style={styles.bullet} />
              <Text style={styles.conditionText}>{condition}</Text>
            </View>
          ))}
        </View>
      </PasswordAuthSection>
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
      {visible ? <EyeIcon height={20} width={20} /> : <EyeSlashIcon height={20} width={20} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 20 },
  conditions: { backgroundColor: colors.surfaceSoft, borderRadius: 12, gap: 10, padding: 16 },
  conditionsTitle: {
    color: colors.dark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  conditionRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 20 },
  bullet: { backgroundColor: colors.textSecondary, borderRadius: 2, height: 4, width: 4 },
  conditionText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    lineHeight: 20,
  },
});
