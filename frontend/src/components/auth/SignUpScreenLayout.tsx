import type { ReactNode } from 'react';

import { AuthButton, AuthPage } from './AuthRedesign';

// Headings from the Figma sign-up screens (A3 · A5 · A6 · A7).
const copy = {
  basic: ['기본 정보를 알려 주세요', '로그인과 맞춤 추천에 써요.'],
  verify: ['메일로 받은 6자리를\n입력해 주세요', ''],
  allergy: ['피해야 하는 음식이 있나요?', '식단을 추천할 때 빼 드려요. 여러 개 고를 수 있어요.'],
  goal: ['가장 이루고 싶은 목표는\n무엇인가요?', ''],
} as const;

export interface SignUpScreenLayoutProps {
  currentStep: 1 | 2 | 3 | 4;
  totalSteps?: 3 | 4;
  ctaLabel: string;
  onBack: () => void;
  onContinue: () => void;
  children: ReactNode;
  contentOffsetY?: number;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
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
      totalSteps={totalSteps}
    >
      {children}
    </AuthPage>
  );
}
