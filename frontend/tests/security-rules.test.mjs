import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { isAllowedApiOrigin } from '../src/api/apiOrigin.ts';
import { isMapPageUrl } from '../src/features/running/kakaoMap.ts';
import { isHttpsUrl } from '../src/lib/externalUrl.ts';

const API = 'https://211-233-206-193.sslip.io';

test('tokens only go to the known API server', () => {
  assert.equal(isAllowedApiOrigin(API, false), true);
  for (const bad of [
    'http://211-233-206-193.sslip.io',
    'https://211-233-206-193.sslip.io.evil.com',
    'https://evil.com',
    'https://user:pass@211-233-206-193.sslip.io',
    'https://211-233-206-193.sslip.io:8443',
    `${API}/other`,
    'not a url',
    '',
  ]) assert.equal(isAllowedApiOrigin(bad, false), false, bad);
});

test('plain HTTP is for a local development server only', () => {
  assert.equal(isAllowedApiOrigin('http://localhost:8000', true), true);
  assert.equal(isAllowedApiOrigin('http://192.168.0.10:8000', true), true);
  assert.equal(isAllowedApiOrigin('http://localhost:8000', false), false);
  assert.equal(isAllowedApiOrigin('http://evil.com', true), false);
});

test('the map page cannot navigate to a look-alike address', () => {
  assert.equal(isMapPageUrl('about:blank'), true);
  assert.equal(isMapPageUrl(`${API}/`), true);
  assert.equal(isMapPageUrl(`${API}.evil.com/`), false);
  assert.equal(isMapPageUrl('https://evil.com/'), false);
  assert.equal(isMapPageUrl('intent://open'), false);
});

test('server links open only as web pages', () => {
  assert.equal(isHttpsUrl('https://example.com/a'), true);
  for (const bad of ['http://example.com', 'tel:01000000000', 'javascript:alert(1)', 'autofit://login', 'nonsense']) {
    assert.equal(isHttpsUrl(bad), false, bad);
  }
});

test('the build check really runs and fails on a bad key', () => {
  const script = fileURLToPath(new URL('../scripts/check-preview-env.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      EXPO_PUBLIC_API_BASE_URL: API,
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fake',
    },
  });
  assert.equal(result.status, 1);
});

test('a reset drops the old person chat and any reply still on its way', async () => {
  const api = {
    getChats: async () => ({ chats: [{ chat_id: 'chat-a' }] }),
    getChatMessages: async () => ({ has_more: false, messages: [{ message_id: 'a1' }], next_cursor: null }),
  };
  globalThis.__chatApi = api;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === '@/src/api/chat') {
        const source = 'export const getChats = (...a) => globalThis.__chatApi.getChats(...a); export const getChatMessages = (...a) => globalThis.__chatApi.getChatMessages(...a);';
        return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` };
      }
      return next(specifier, context);
    },
  });
  const cache = await import('../src/features/chat/chatSessionCache.ts');

  await cache.prefetchActiveChat();
  assert.equal(cache.getChatSessionSnapshot().messages.length, 1);
  cache.resetChatSessionCache();
  assert.equal(cache.getChatSessionSnapshot().messages.length, 0);
  assert.equal(cache.getChatSessionSnapshot().status, 'idle');

  let finish;
  api.getChats = () => new Promise((resolve) => { finish = resolve; });
  const late = cache.prefetchActiveChat();
  cache.resetChatSessionCache();
  finish({ chats: [{ chat_id: 'chat-a' }] });
  await late;
  assert.equal(cache.getChatSessionSnapshot().chatId, null, 'a late reply must not refill the cache');
  assert.equal(cache.getChatSessionSnapshot().messages.length, 0);

  api.getChats = async () => ({ chats: [] });
  const next = await cache.prefetchActiveChat();
  assert.equal(next.status, 'ready');
  assert.equal(next.chatId, null);
});
