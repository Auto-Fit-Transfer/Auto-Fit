import { Stack } from 'expo-router';

import { SignupProvider } from '@/src/features/signup/SignupContext';

// Renewal B: the first screen (login.tsx) hears the one sentence into the same sign-up draft the signup
// steps read, so the draft wraps every screen of this group, not only signup/.
export default function AuthLayout() {
  return (
    <SignupProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SignupProvider>
  );
}
