import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Dimensions, Keyboard, Platform, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import EyeCloseIcon from '@/assets/icons/input/EyeClose.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import PasswordIcon from '@/assets/icons/input/Password.svg';
import CheckCircleIcon from '@/assets/icons/system/CheckCircle.svg';
import { PasswordAuthScreenLayout, PasswordAuthSection } from '@/src/components/auth';
import { AppButton, AppTextField, IconButton } from '@/src/components/common';
import { colors, fontFamilies, radius, typography } from '@/src/theme';

const passwordConditions = [
  '8자 이상 입력해주세요.',
  '영문, 숫자, 특수문자를 포함해주세요.',
  '연속되거나 반복되는 문자 사용은 피해주세요.',
] as const;

const minimumScreenHeight = 740;
const maximumScreenHeight = 917;
const passwordHeaderVisualHeight = 183;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const confirmationRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const passwordsMatch = confirmation.length === 0 || password === confirmation;
  const screenHeight = Dimensions.get('screen').height;
  const responsiveHeight = Platform.OS === 'android' ? screenHeight : windowHeight;
  const heightProgress = Math.max(
    0,
    Math.min(1, (responsiveHeight - minimumScreenHeight) / (maximumScreenHeight - minimumScreenHeight)),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;
  const passwordHeaderBottom = verticalValue(69, 54) + passwordHeaderVisualHeight;
  const passwordContentTop = Math.max(
    verticalValue(316, 220),
    passwordHeaderBottom + 20,
  );
  const conditionCardTop = Math.max(
    verticalValue(462, 385),
    passwordContentTop + 122 + 20,
  );
  const changeButtonTop = Math.max(
    verticalValue(700, 610),
    conditionCardTop + 120 + 25,
  );

  const completeReset = () => {
    Keyboard.dismiss();
    if (passwordsMatch) {
      router.replace('/login');
    }
  };

  return (
    <PasswordAuthScreenLayout
      description={
        <>새로운 비밀번호를 설정해주세요.{`\n`}안전한 비밀번호는 계정 보호에 도움이 됩니다.</>
      }
      onBack={() => router.back()}
      title="비밀번호 재설정"
    >
      <PasswordAuthSection innerStyle={styles.passwordContent} top={passwordContentTop}>
        <AppTextField
          accessibilityLabel="새 비밀번호"
          autoCapitalize="none"
          autoComplete="new-password"
          leftElement={<PasswordFieldIcon />}
          onChangeText={setPassword}
          onSubmitEditing={() => confirmationRef.current?.focus()}
          placeholder="새 비밀번호를 입력해주세요"
          returnKeyType="next"
          rightElement={
            <IconButton
              accessibilityLabel={passwordVisible ? '새 비밀번호 숨기기' : '새 비밀번호 보기'}
              icon={
                passwordVisible ? (
                  <EyeIcon color={colors.textNavigator} height={18} width={18} />
                ) : (
                  <EyeCloseIcon color={colors.textNavigator} height={18} width={18} />
                )
              }
              onPress={() => setPasswordVisible((visible) => !visible)}
              size={44}
              style={styles.eyeButton}
            />
          }
          secureTextEntry={!passwordVisible}
          textContentType="newPassword"
          value={password}
        />
        <AppTextField
          ref={confirmationRef}
          accessibilityLabel="새 비밀번호 확인"
          autoCapitalize="none"
          autoComplete="new-password"
          leftElement={<PasswordFieldIcon />}
          onChangeText={setConfirmation}
          onSubmitEditing={completeReset}
          placeholder="새 비밀번호를 다시 입력해주세요"
          returnKeyType="done"
          rightElement={
            <IconButton
              accessibilityLabel={
                confirmationVisible ? '비밀번호 확인 숨기기' : '비밀번호 확인 보기'
              }
              icon={
                confirmationVisible ? (
                  <EyeIcon color={colors.textNavigator} height={18} width={18} />
                ) : (
                  <EyeCloseIcon color={colors.textNavigator} height={18} width={18} />
                )
              }
              onPress={() => setConfirmationVisible((visible) => !visible)}
              size={44}
              style={styles.eyeButton}
            />
          }
          secureTextEntry={!confirmationVisible}
          textContentType="newPassword"
          value={confirmation}
        />
      </PasswordAuthSection>

      <PasswordAuthSection innerStyle={styles.conditionCard} top={conditionCardTop}>
        <Text style={styles.conditionTitle}>비밀번호 조건</Text>
        {passwordConditions.map((condition) => (
          <View key={condition} style={styles.conditionRow}>
            <CheckCircleIcon color={colors.primary} height={17} width={17} />
            <Text style={styles.conditionText}>{condition}</Text>
          </View>
        ))}
      </PasswordAuthSection>

      <PasswordAuthSection top={changeButtonTop}>
        <AppButton disabled={!passwordsMatch} onPress={completeReset} title="비밀번호 변경" />
      </PasswordAuthSection>
    </PasswordAuthScreenLayout>
  );
}

function PasswordFieldIcon() {
  return (
    <View style={styles.inputIconSlot}>
      <PasswordIcon color={colors.textNavigator} height={18} width={18} />
    </View>
  );
}

const styles = StyleSheet.create({
  passwordContent: {
    gap: 10,
  },
  inputIconSlot: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  eyeButton: {
    marginRight: -11,
  },
  conditionCard: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.xl,
    gap: 7,
    minHeight: 120,
    paddingBottom: 10,
    paddingHorizontal: 15,
    paddingTop: 15,
    width: '100%',
  },
  conditionTitle: {
    ...typography.bodySmall,
    color: '#373737',
    fontFamily: fontFamilies.pretendardSemiBold,
    includeFontPadding: false,
    lineHeight: 16,
  },
  conditionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 17,
  },
  conditionText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    flexShrink: 1,
    includeFontPadding: false,
    lineHeight: 13,
  },
});
