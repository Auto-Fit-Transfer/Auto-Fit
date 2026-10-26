import type { Href } from 'expo-router';

import { getOnboardingStatus } from '@/src/api/onboarding';

export type PostLoginDestination = Href;

export async function getPostLoginDestination(): Promise<PostLoginDestination> {
  const onboarding = await getOnboardingStatus();
  if (!onboarding.completed) {
    return {
      pathname: '/signup/step1',
      params: { flow: 'post-login' },
    };
  }

  return '/home';
}
