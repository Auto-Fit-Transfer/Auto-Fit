import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AuthCard, AuthPage } from './AuthRedesign';

export interface PasswordAuthScreenLayoutProps {
  title: string;
  description: ReactNode;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export interface PasswordAuthSectionProps {
  top: number;
  children: ReactNode;
  innerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  card?: boolean;
}

export function PasswordAuthSection({
  children,
  innerStyle,
  style,
  card = true,
}: PasswordAuthSectionProps) {
  const content = <View style={innerStyle}>{children}</View>;
  return card ? <AuthCard style={style}>{content}</AuthCard> : <View style={style}>{content}</View>;
}

export function PasswordAuthScreenLayout({
  title,
  description,
  onBack,
  children,
  footer,
}: PasswordAuthScreenLayoutProps) {
  return (
    <AuthPage
      description={typeof description === 'string' ? description : undefined}
      footer={footer}
      heading={title === '비밀번호 찾기' ? '비밀번호를 잊으셨나요?' : '새 비밀번호를 정해 주세요'}
      mode="password"
      onBack={onBack}
    >
      {children}
    </AuthPage>
  );
}
