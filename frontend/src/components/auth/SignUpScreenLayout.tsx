import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AuthButton, AuthCard, AuthPage } from './AuthRedesign';

const copy = {
  basic: ['기본 정보를 알려 주세요', '로그인과 맞춤 추천에 써요.'],
  verify: ['메일로 받은 6자리를\n입력해 주세요', ''],
  allergy: ['피해야 하는 음식이 있나요?', '식단을 추천할 때 빼 드려요. 여러 개 고를 수 있어요.'],
  goal: ['가장 이루고 싶은 목표는\n무엇인가요?', ''],
  detail: ['목표를 조금만 더 알려 주세요', '고른 내용으로 첫 식단과 운동을 맞춰 드려요.'],
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
  heading?: string;
  footerExtra?: ReactNode;
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
  heading: headingOverride,
  footerExtra,
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
        <>
          <AuthButton
            disabled={ctaDisabled}
            loading={ctaLoading}
            onPress={onContinue}
            title={ctaLabel}
          />
          {footerExtra}
        </>
      }
      heading={headingOverride ?? heading}
      mode="signup"
      onBack={onBack}
      step={currentStep}
      totalSteps={totalSteps}
    >
      {children}
    </AuthPage>
  );
}
