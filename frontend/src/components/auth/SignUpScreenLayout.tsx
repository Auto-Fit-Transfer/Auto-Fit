import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AuthButton, AuthCard, AuthPage } from './AuthRedesign';

const copy = {
  basic: ['기본 정보를 알려 주세요', '건강한 변화를 위한 첫걸음, 함께 시작해요.'],
  verify: ['메일로 받은 6자리를 입력해 주세요', '입력한 이메일로 인증 코드를 보냈어요.'],
  allergy: ['피해야 하는 음식이 있나요?', '알레르기가 있다면 선택해 주세요.'],
  goal: ['어떤 목표를 가지고 있나요?', '지금 가장 중요한 목표를 알려 주세요.'],
  detail: ['목표를 조금 더 자세히 알려 주세요', '나에게 맞는 운동 계획을 준비할게요.'],
} as const;

export interface SignUpScreenLayoutProps {
  currentStep: 1 | 2 | 3 | 4 | 5;
  totalSteps?: 3 | 4 | 5;
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
  totalSteps = 5,
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
      : totalSteps === 4
        ? (['basic', 'allergy', 'goal', 'detail'] as const)[currentStep - 1]
        : (['basic', 'verify', 'allergy', 'goal', 'detail'] as const)[currentStep - 1];
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
