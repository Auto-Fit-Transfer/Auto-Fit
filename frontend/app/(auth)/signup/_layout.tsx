import { Stack } from 'expo-router';

// The sign-up draft (SignupProvider) is one level up, in app/(auth)/_layout.tsx.
export default function SignupLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
