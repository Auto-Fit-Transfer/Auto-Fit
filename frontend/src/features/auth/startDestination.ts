import { isAuthRetryableFetchError } from '@supabase/supabase-js';

type SessionResult = { data: { session: unknown }; error: unknown };
type SessionRead = () => Promise<SessionResult>;

// An expired token that could not be refreshed offline stays saved, so the user is still signed in.
export function hasUsableSession(result: SessionResult) {
  return Boolean(result.data.session) || isAuthRetryableFetchError(result.error);
}

async function decide<T>(readSession: SessionRead, afterLogin: () => Promise<T>) {
  let result;
  try {
    result = await readSession();
  } catch {
    return '/login' as const;
  }
  if (!hasUsableSession(result)) return '/login' as const;
  if (!result.data.session) return '/home' as const;
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

type SessionEnder = { signOut(): Promise<{ error: unknown }>; getSession: SessionRead };

// Offline the library clears the session and reports an error, except for an expired token, which it keeps.
export async function endSession(auth: SessionEnder, removeSavedSession: () => Promise<void>) {
  const { error } = await auth.signOut();
  if (error && hasUsableSession(await auth.getSession())) await removeSavedSession();
}

const PUBLIC_ROUTES = new Set(['(auth)', 'splash']);

export function isPublicRoute(segments: readonly string[]) {
  return segments.length === 0 || PUBLIC_ROUTES.has(segments[0]);
}
