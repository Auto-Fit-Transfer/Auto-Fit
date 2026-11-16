import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AUTH_CALLBACK_PATH, getAuthCallbackParams, isPasswordRecoveryUrl } from '../src/features/auth/authCallback.ts';

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
