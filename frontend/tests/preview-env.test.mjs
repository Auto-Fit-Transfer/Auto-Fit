import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { validatePreviewEnv } from '../scripts/check-preview-env.mjs';

const valid = {
  EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com',
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

test('accepts HTTPS public endpoints and a publishable key', () => {
  assert.deepEqual(validatePreviewEnv(valid), []);
});
test('rejects missing configuration and local or insecure endpoints', () => {
  assert.ok(validatePreviewEnv({}).length);
  for (const url of [
    'http://api.example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://user:password@example.com',
  ]) {
    assert.ok(validatePreviewEnv({ ...valid, EXPO_PUBLIC_API_BASE_URL: url }).length);
  }
});
test('rejects server keys, including legacy service role JWTs', () => {
  const secretJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  for (const key of ['sb_secret_test', secretJwt, 'YOUR_SUPABASE_PUBLISHABLE_KEY']) {
    assert.ok(validatePreviewEnv({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }).length);
  }
});
