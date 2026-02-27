(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppApi = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  async function postJSON(url, payload) {
    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });

    var data = {};
    try {
      data = await resp.json();
    } catch (_) {}

    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: data.error || ('Request failed (' + resp.status + ')'),
        data: data,
      };
    }

    return { ok: true, status: resp.status, data: data };
  }

  function registerTelegramWebhook(uid, botId, token, remove) {
    return postJSON('/api/register-webhook', { uid: uid, botId: botId, token: token, remove: remove });
  }

  function verifyProviderKey(provider, key) {
    return postJSON('/api/verify-provider-key', { provider: provider, key: key });
  }

  function verifyTelegramToken(token) {
    return postJSON('/api/verify-telegram-token', { token: token });
  }

  function aiChat(payload) {
    return postJSON('/api/ai-chat', payload);
  }

  return {
    postJSON: postJSON,
    registerTelegramWebhook: registerTelegramWebhook,
    verifyProviderKey: verifyProviderKey,
    verifyTelegramToken: verifyTelegramToken,
    aiChat: aiChat,
  };
});
