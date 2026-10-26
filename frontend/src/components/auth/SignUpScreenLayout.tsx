import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AuthButton, AuthCard, AuthPage } from './AuthRedesign';

const copy = {
  basic: ['기본 정보를 알려주세요', '건강한 변화를 위한 첫걸음, 함께 시작해요!'],
  verify: ['이메일을 인증해 주세요', '이메일 인증으로 계정을 안전하게 보호해요.'],
  allergy: ['알레르기를 알려주세요', '더 정확한 맞춤 식단을 위한 정보예요.'],
  goal: ['목표에 맞춰 시작해요', '나에게 맞는 운동을 위해 마지막으로 알려주세요.'],
} as const;

export interface SignUpScreenLayoutProps {
  currentStep: 1 | 2 | 3 | 4;
  totalSteps?: 3 | 4;
  ctaLabel: string;
  onBack: () => void;
  onContinue: () => void;
  children: ReactNode;
  contentOffsetY?: number;
  ctaTop?: number;
  alignStepCta?: boolean;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
}

export interface SignUpSectionProps {
  top: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  card?: boolean;
}

export function SignUpSection({ children, style, innerStyle, card = true }: SignUpSectionProps) {
  const content = <View style={innerStyle}>{children}</View>;
  return card ? <AuthCard style={style}>{content}</AuthCard> : <View style={style}>{content}</View>;
}

export function SignUpScreenLayout({
  currentStep,
  totalSteps = 4,
  ctaLabel,
  onBack,
  onContinue,
  children,
  contentOffsetY = 0,
  ctaDisabled = false,
  ctaLoading = false,
}: SignUpScreenLayoutProps) {
  const key =
    totalSteps === 3
      ? (['basic', 'allergy', 'goal'] as const)[currentStep - 1]
      : (['basic', 'verify', 'allergy', 'goal'] as const)[currentStep - 1];
  const [heading, description] = copy[key];
  return (
    <AuthPage
      contentOffsetY={contentOffsetY}
      description={description}
      footer={
        <AuthButton
          disabled={ctaDisabled}
          loading={ctaLoading}
          onPress={onContinue}
          title={ctaLabel}
        />
      }
      heading={heading}
      mode="signup"
      onBack={onBack}
      step={currentStep}
      title="회원가입"
      totalSteps={totalSteps}
    >
      {children}
    </AuthPage>
  );
}
