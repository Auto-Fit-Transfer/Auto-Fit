import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AUTH_CALLBACK_PATH, getAuthCallbackParams, isPasswordRecoveryUrl } from '../src/features/auth/authCallback.ts';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;

test('social login and the reset mail both come back to the one registered link, autofit://auth/callback', () => {
  assert.equal(`${app.scheme}://${AUTH_CALLBACK_PATH}`, 'autofit://auth/callback');
});

test('the callback reads Supabase results from the query and from the hash', () => {
  assert.equal(getAuthCallbackParams('autofit://auth/callback?code=abc').get('code'), 'abc');
  const h = getAuthCallbackParams('autofit://auth/callback#access_token=a&refresh_token=r&type=recovery');
  assert.equal(h.get('access_token'), 'a');
  assert.equal(h.get('refresh_token'), 'r');
});

test('only the reset mail link goes on to the new-password screen', () => {
  assert.equal(isPasswordRecoveryUrl('autofit://auth/callback#access_token=a&refresh_token=r&type=recovery'), true);
  assert.equal(isPasswordRecoveryUrl('autofit://auth/callback#access_token=a&refresh_token=r'), false, 'social login');
  assert.equal(isPasswordRecoveryUrl('autofit://auth/callback?code=abc'), false);
});
