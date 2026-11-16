import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AUTH_CALLBACK_PATH, callbackSummary, getAuthCallbackParams, isPasswordRecoveryUrl, isRecoveryAttempt } from '../src/features/auth/authCallback.ts';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;

test('plan A has its own link and app ids, so it installs next to the test app (autofit / com.gogosi.autofit.test)', () => {
  assert.equal(app.scheme, 'autofit-a');
  assert.equal(`${app.scheme}://${AUTH_CALLBACK_PATH}`, 'autofit-a://auth/callback', 'the one URL registered in Supabase');
  assert.equal(app.ios.bundleIdentifier, 'com.gogosi.autofit.a');
  assert.equal(app.android.package, 'com.gogosi.autofit.a');
});

test('the callback reads Supabase results from the query and from the hash', () => {
  const p = getAuthCallbackParams('autofit-a://auth/callback?code=abc');
  assert.equal(p.get('code'), 'abc');
  const h = getAuthCallbackParams('autofit-a://auth/callback#access_token=a&refresh_token=r&type=recovery');
  assert.equal(h.get('access_token'), 'a');
  assert.equal(h.get('refresh_token'), 'r');
});

test('only the reset mail link goes on to the new-password screen', () => {
  assert.equal(isPasswordRecoveryUrl('autofit-a://auth/callback#access_token=a&refresh_token=r&type=recovery'), true);
  assert.equal(isPasswordRecoveryUrl('autofit-a://auth/callback#access_token=a&refresh_token=r'), false, 'social login');
  assert.equal(isPasswordRecoveryUrl('autofit-a://auth/callback?code=abc'), false);
});

test('plan A builds into its own EAS project and App Store Connect app', () => {
  assert.equal(app.extra.eas.projectId, 'f65ef9cd-deea-4887-850b-0e12928b9e95');
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  assert.equal(eas.submit.production.ios.ascAppId, '6835331420');
});

test('a failed link is described by names and error code only, never by its values', () => {
  const ok = 'autofit-a://auth/callback#access_token=SECRET1&refresh_token=SECRET2&expires_in=3600&type=recovery';
  assert.equal(callbackSummary(ok), 'access_token,refresh_token,type=recovery');
  assert.equal(callbackSummary('autofit-a://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'), 'error,error_code=otp_expired');
  assert.equal(callbackSummary('autofit-a://auth/callback?code=SECRET3'), 'code');
  assert.equal(callbackSummary(null), 'no_url');
  assert.equal(callbackSummary('autofit-a://auth/callback'), 'no_params');
  assert.equal(callbackSummary('autofit-a://auth/callback#type=<b>x</b>'), 'type=bxb', 'only letters, digits and _ are shown');
  for (const text of [ok, 'autofit-a://auth/callback?code=SECRET3'].map(callbackSummary)) assert.doesNotMatch(text, /SECRET/);
});

test('a failed reset link leads to the reset guidance, a failed social login to the login screen', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  assert.equal(isRecoveryAttempt('autofit-a://auth/callback#access_token=a&refresh_token=r&type=recovery', null, now), true);
  assert.equal(isRecoveryAttempt('autofit-a://auth/callback#error=access_denied&error_code=otp_expired', null, now), true, 'Supabase does not say type for an expired link');
  assert.equal(isRecoveryAttempt(null, now - 5 * 60 * 1000, now), true, 'no link arrived, but a reset mail was asked for 5 minutes ago');
  assert.equal(isRecoveryAttempt(null, now - 2 * 60 * 60 * 1000, now), false, 'an old request does not count');
  assert.equal(isRecoveryAttempt('autofit-a://auth/callback#access_token=a&refresh_token=r', null, now), false, 'social login');
  assert.equal(isRecoveryAttempt('autofit-a://auth/callback?error=access_denied&error_code=bad_oauth_state', null, now), false);
});
