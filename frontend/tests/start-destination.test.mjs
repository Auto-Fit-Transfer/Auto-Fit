import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { startDestination } from '../src/features/auth/startDestination.ts';

const signedIn = async () => ({ data: { session: { access_token: 'token' } }, error: null });
const signedOut = async () => ({ data: { session: null }, error: null });
const failWith = (status) => async () => { throw Object.assign(new Error('failed'), { status }); };

test('a signed-out user goes to login without asking the server', async () => {
  let asked = false;
  const destination = await startDestination(signedOut, async () => { asked = true; return '/home'; }, 50);
  assert.equal(destination, '/login');
  assert.equal(asked, false);
});

test('a signed-in user goes where login would have sent them', async () => {
  assert.equal(await startDestination(signedIn, async () => '/home', 50), '/home');
  const onboarding = { pathname: '/signup/step1', params: { flow: 'post-login' } };
  assert.equal(await startDestination(signedIn, async () => onboarding, 50), onboarding);
});

test('only a 401 sends a signed-in user back to login', async () => {
  assert.equal(await startDestination(signedIn, failWith(401), 50), '/login');
  assert.equal(await startDestination(signedIn, failWith(0), 50), '/home');
  assert.equal(await startDestination(signedIn, failWith(503), 50), '/home');
});

test('a stuck server does not hold the splash screen', async () => {
  assert.equal(await startDestination(signedIn, () => new Promise(() => {}), 20), '/home');
});

test('an expired token offline keeps the user signed in, a rejected one does not', async () => {
  const offline = async () => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) });
  const rejected = async () => ({ data: { session: null }, error: new Error('Invalid Refresh Token') });
  assert.equal(await startDestination(offline, async () => '/home', 50), '/home');
  assert.equal(await startDestination(rejected, async () => '/home', 50), '/login');
});

test('a broken client setup goes to login', async () => {
  const broken = async () => { throw new Error('missing env'); };
  assert.equal(await startDestination(broken, async () => '/home', 50), '/login');
});
