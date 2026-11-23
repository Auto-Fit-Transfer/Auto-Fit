import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { JoinScene } from '@/src/components/a/JoinScene';
import type { Who } from '@/src/components/a/sprites';

import { AuthButton, AuthCard, AuthPage } from './AuthRedesign';

// Renewal A: joining is making my character, so every step sits under the same title and the street.
const copy = {
  account: '먼저 계정을 만들어요',
  character: '어떤 모습으로 시작할까요?',
  verify: '메일로 받은 6자리를\n입력해 주세요',
  allergy: '못 먹는 음식이 있나요?',
  goal: '목표를 설정해 볼까요?',
  detail: '목표를 조금만 더 알려 주세요',
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
  // The first step of signing up with a mail address is two parts on one screen: the account, then the character.
  secondPart?: boolean;
  // The character while it is being chosen; left out, the one kept on this phone is shown.
  who?: Who;
  pair?: boolean;
  // renewal B's one-sentence sign-up: no character street, and the account is the last thing asked
  b?: boolean;
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
  secondPart = false,
  who,
  pair = false,
  b = false,
}: SignUpScreenLayoutProps) {
  // With a mail address the first screen counts as two steps, so the dots are six.
  const withMail = totalSteps === 5;
  const keys = withMail
    ? (['account', 'verify', 'allergy', 'goal', 'detail'] as const)
    : (['character', 'allergy', 'goal', 'detail'] as const);
  const key = withMail && currentStep === 1 && secondPart ? 'character' : keys[currentStep - 1];
  return (
    <AuthPage
      barTitle={b ? '거의 다 됐어요' : '캐릭터 만들기'}
      contentOffsetY={contentOffsetY}
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
      heading={headingOverride ?? (b && key === 'account' ? '계정을 만들어요' : b && key === 'character' ? '생년월일과 성별만 확인해요' : copy[key])}
      mode="signup"
      onBack={onBack}
      scene={b ? undefined : <JoinScene pair={pair} who={who} />}
      step={withMail ? currentStep + (currentStep > 1 || secondPart ? 1 : 0) : currentStep}
      totalSteps={withMail ? 6 : totalSteps}
    >
      {children}
    </AuthPage>
  );
}
