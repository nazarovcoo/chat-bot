(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppState = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var PROVIDERS = ['openai', 'gemini', 'claude'];

  function createInitialState(storage) {
    var ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var theme = 'light';
    try {
      if (ls) theme = ls.getItem('theme') || 'light';
    } catch (_) {}

    return {
      theme: theme,
      bots: [],
      currentBotId: null,
      kbItems: [],
      kbQA: [],
      kbJobs: [],
      kbSources: [],
      chatHistory: [],
      chats: [],
      selectedChatId: null,
      unanswered: [],
      topics: [],
      agentActive: true,
      rules: '',
      analyticsPeriod: 90,
      currentTab: 'auto',
      currentAgentScreen: 'analytics',
      kbTab: 'topics',
      aiUsage: [],
      aiUsagePeriod: 7,
      pendingFiles: [],
      unsubs: [],
      plan: null,
      autoReplies: [],
      flows: [],
      botPhotos: {},
    };
  }

  return {
    PROVIDERS: PROVIDERS,
    createInitialState: createInitialState,
  };
});
