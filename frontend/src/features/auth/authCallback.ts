// The one app link this app registers in Supabase: autofit-a://auth/callback in a build (scheme in app.json).
// Social login and the password reset mail both come back through it, so no second link has to be allowed.
export const AUTH_CALLBACK_PATH = 'auth/callback';

// Supabase puts the result in the query (?code=, ?error=) or, for the implicit flow, in the hash (#access_token=…&type=…).
export function getAuthCallbackParams(url: string) {
  const [urlWithoutHash, hash = ''] = url.split('#', 2);
  const query = urlWithoutHash.includes('?') ? urlWithoutHash.split('?').slice(1).join('?') : '';
  const params = new URLSearchParams(query);

  new URLSearchParams(hash).forEach((value, key) => params.set(key, value));
  return params;
}

// The reset mail's link signs the user in and says type=recovery; that sign-in goes on to the new-password screen.
export function isPasswordRecoveryUrl(url: string) {
  return getAuthCallbackParams(url).get('type') === 'recovery';
}

// forgot.tsx keeps when this phone last asked for a reset mail.
export const RESET_ASKED_KEY = 'auth:password-reset-asked-at';
const RESET_WINDOW_MS = 60 * 60 * 1000;
const clean = (value: string | null) => (value ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);

// What the link carried, as names only (never the values), with Supabase's error code: safe to show and to log.
export function callbackSummary(url: string | null) {
  if (!url) return 'no_url';
  const params = getAuthCallbackParams(url);
  const parts = ['code', 'access_token', 'refresh_token', 'error'].filter((key) => params.has(key));
  if (params.has('type')) parts.push(`type=${clean(params.get('type'))}`);
  if (params.has('error_code')) parts.push(`error_code=${clean(params.get('error_code'))}`);
  return parts.join(',') || 'no_params';
}

// A failed link is a password reset when it says so, when Supabase says an email link expired, or when this
// phone asked for a reset mail within the last hour (a link that never arrived says nothing about itself).
export function isRecoveryAttempt(url: string | null, resetAskedAt: number | null, now: number) {
  const params = url ? getAuthCallbackParams(url) : null;
  if (params?.get('type') === 'recovery' || params?.get('error_code') === 'otp_expired') return true;
  return resetAskedAt !== null && now >= resetAskedAt && now - resetAskedAt < RESET_WINDOW_MS;
}
