import { isAuthRetryableFetchError } from '@supabase/supabase-js';

type SessionRead = () => Promise<{ data: { session: unknown }; error: unknown }>;

async function decide<T>(readSession: SessionRead, afterLogin: () => Promise<T>) {
  let result;
  try {
    result = await readSession();
  } catch {
    return '/login' as const;
  }
  if (!result.data.session) {
    // An expired token that could not be refreshed offline stays saved, so the user is still signed in.
    return isAuthRetryableFetchError(result.error) ? '/home' as const : '/login' as const;
  }
  try {
    return await afterLogin();
  } catch (error) {
    // Only the server's own 401 ends the session. A slow or broken server must not send a signed-in user to login.
    return (error as { status?: unknown } | null)?.status === 401 ? '/login' as const : '/home' as const;
  }
}

// A request has no timeout of its own, so a stuck server would otherwise hold the splash screen forever.
export function startDestination<T>(readSession: SessionRead, afterLogin: () => Promise<T>, answerWithinMs = 5000) {
  return Promise.race([
    decide(readSession, afterLogin),
    new Promise<'/home'>((resolve) => setTimeout(() => resolve('/home'), answerWithinMs)),
  ]);
}
