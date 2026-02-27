const test = require('node:test');
const assert = require('node:assert/strict');

const AppUI = require('../../js/ui.js');
const AppApi = require('../../js/api.js');
const AppState = require('../../js/state.js');

test('state: creates expected initial shape', () => {
  const state = AppState.createInitialState({ getItem: () => null });
  assert.equal(state.theme, 'light');
  assert.deepEqual(state.bots, []);
  assert.equal(state.currentAgentScreen, 'analytics');
  assert.deepEqual(AppState.PROVIDERS, ['openai', 'gemini', 'claude']);
});

test('kb add flow: all panel templates contain valid tag syntax', () => {
  const steps = ['kb-choose', 'kb-file', 'kb-link', 'kb-text'];
  for (const step of steps) {
    const html = AppUI.kbPanelMarkup(step);
    assert.ok(html.length > 0, `template is empty for ${step}`);
    assert.equal(/<\s+(div|input|textarea|button|span|ul|li)/.test(html), false, `broken tag found for ${step}`);
  }
});

test('auto-replies: renderer escapes unsafe text', () => {
  const html = AppUI.renderAutoRepliesHtml([
    {
      keyword: '<img src=x onerror=alert(1)>',
      response: '<script>alert(1)</script>',
      matchType: 'contains',
      enabled: true,
    },
  ]);

  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.equal(html.includes('<script>alert(1)</script>'), false);
});

test('api: aiChat posts to backend proxy endpoint', async () => {
  const originalFetch = global.fetch;
  let called = null;
  global.fetch = async (url, opts) => {
    called = { url, opts };
    return {
      ok: true,
      status: 200,
      json: async () => ({ answer: 'ok' }),
    };
  };

  try {
    const res = await AppApi.aiChat({ question: 'hi' });
    assert.equal(res.ok, true);
    assert.equal(called.url, '/api/ai-chat');
    assert.equal(called.opts.method, 'POST');
  } finally {
    global.fetch = originalFetch;
  }
});

test('api: provider/telegram checks use backend proxy endpoints', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };

  try {
    await AppApi.verifyProviderKey('openai', 'k');
    await AppApi.verifyTelegramToken('123:abc');
    assert.deepEqual(calls, ['/api/verify-provider-key', '/api/verify-telegram-token']);
  } finally {
    global.fetch = originalFetch;
  }
});
