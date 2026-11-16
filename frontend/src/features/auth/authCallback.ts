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
