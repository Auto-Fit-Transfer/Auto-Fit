import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Headline, type HeadlinePart } from '@/src/components/b/Headline';

import { AuthCard, AuthPage } from './AuthRedesign';

export interface PasswordAuthScreenLayoutProps {
  title: string;
  description: ReactNode;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
  // renewal B (11/27): the lilac-marked headline under the bar's name, the button right under the form
  headline?: HeadlinePart[][];
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
  headline,
}: PasswordAuthScreenLayoutProps) {
  return (
    <AuthPage
      description={typeof description === 'string' ? description : undefined}
      footer={footer}
      barTitle={headline ? title : undefined}
      heading={title}
      headline={headline ? <Headline lines={headline} /> : undefined}
      inlineFooter={Boolean(headline)}
      mode="password"
      onBack={onBack}
    >
      {children}
    </AuthPage>
  );
}
