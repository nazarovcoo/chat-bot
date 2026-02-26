    window.BUILD_VERSION = "2026-02-26.1";
    // GLOBAL ERROR HANDLING
    function logClientError(msg, source, lineno, colno, error, type = "Error") {
      try {
        if (!firebase || !firebase.firestore) return;
        const uid = window.resolvedUid || null;
        const targetColl = uid ? `users/${uid}/client_errors` : 'public_client_errors';
        firebase.firestore().collection(targetColl).add({
          buildVersion: window.BUILD_VERSION,
          type: type,
          message: msg,
          source: source,
          line: lineno,
          col: colno,
          stack: error && error.stack ? error.stack : null,
          url: window.location.href,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(e => console.error("Failed to log to Firestore", e));

        // Show friendly toast to user
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#ff3b30;color:#fff;padding:12px 20px;border-radius:8px;z-index:999999;font-weight:600;box-shadow:0 10px 30px rgba(255,59,48,0.3);text-align:center;animation:slideUp 0.3s ease-out;";
        toast.innerHTML = `Ошибка интерфейса. <br><button onclick="window.location.reload()" style="margin-top:8px;background:#fff;color:#ff3b30;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:bold;">Обновить страницу</button>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 10000);
      } catch (e) {
        console.error("Critical error in error logger:", e);
      }
    }
    window.onerror = function (msg, source, lineno, colno, error) {
      logClientError(msg, source, lineno, colno, error, "Uncaught Exception");
      return false; // let browser log it as well
    };
    window.addEventListener('unhandledrejection', function (event) {
      logClientError(event.reason ? (typeof event.reason === 'string' ? event.reason : event.reason.message) : "Promise rejected", null, 0, 0, event.reason, "Unhandled Rejection");
    });
    /* ══ FIREBASE ══ */
    const firebaseConfig = {
      apiKey: "AIzaSyBnQBiGjMGbIkeM31rZnxisiZUr-AsAqSU",
      authDomain: "chatbot-acd16.firebaseapp.com",
      projectId: "chatbot-acd16",
      storageBucket: "chatbot-acd16.firebasestorage.app",
      messagingSenderId: "236507228929",
      appId: "1:236507228929:web:4124a3c257e4edb3e4c900",
      measurementId: "G-EBTMN07KYF"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    let currentUser = null;

    /* ══ STATE ══ */
    const STATE = {
      theme: localStorage.getItem('theme') || 'light',
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
      botPhotos: {},
    };

    /* ── Firestore helpers ── */
    function col(name) {
      return db.collection('users').doc(currentUser.uid).collection(name);
    }

    async function fsAdd(colName, data) {
      return col(colName).add({ ...data, _ts: firebase.firestore.FieldValue.serverTimestamp() });
    }

    async function fsDel(colName, id) {
      await col(colName).doc(id).delete();
    }

    async function fsUpdate(colName, id, data) {
      await col(colName).doc(id).update(data);
    }

    function listen(colName, cb) {
      const unsub = col(colName).orderBy('_ts', 'asc').onSnapshot(snap => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      STATE.unsubs.push(unsub);
    }

    function listenChats(cb) {
      const unsub = db.collection('users').doc(currentUser.uid).collection('chats')
        .onSnapshot(snap => {
          cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => { });
      STATE.unsubs.push(unsub);
    }

    function stopListeners() {
      STATE.unsubs.forEach(u => u());
      STATE.unsubs = [];
    }

    function save() {
      localStorage.setItem('theme', STATE.theme);
    }

    /* ══ ONBOARDING GUIDE ══ */
    function dismissGuide(id) {
      const el = document.getElementById('guide-' + id);
      if (el) el.style.display = 'none';
      const dismissed = JSON.parse(localStorage.getItem('guideDismissed') || '{}');
      dismissed[id] = true;
      localStorage.setItem('guideDismissed', JSON.stringify(dismissed));
    }
    function initGuides() {
      const dismissed = JSON.parse(localStorage.getItem('guideDismissed') || '{}');
      Object.keys(dismissed).forEach(id => {
        const el = document.getElementById('guide-' + id);
        if (el) el.style.display = 'none';
      });
    }
    initGuides();

    /* ══ THEME ══ */
    function applyTheme() {
      document.documentElement.setAttribute('data-theme', STATE.theme);
      document.getElementById('theme-icon').textContent = STATE.theme === 'dark' ? '🌙' : '☀️';
    }
    function toggleTheme() {
      STATE.theme = STATE.theme === 'dark' ? 'light' : 'dark';
      applyTheme(); save();
    }

    /* ══ TABS (unified — single sidebar) ══ */
    function switchTab(tab) {
      // Unified layout: no separate tabs. Always in agent mode.
      STATE.currentTab = 'agent';
      if (tab === 'auto') goAgentScreen('automations');
      else goAgentScreen(STATE.currentAgentScreen || 'analytics');
    }

    function showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const el = document.getElementById('screen-' + id);
      if (el) el.classList.add('active');
    }

    function goAgentScreen(id) {
      // Redirect aliases
      if (id === 'knowledge') id = 'topics';
      if (id === 'ai-usage') id = 'analytics'; // merged into analytics
      let kbTabTarget = null;
      if (id === 'unanswered') { id = 'topics'; kbTabTarget = 'unanswered'; }

      STATE.currentAgentScreen = id;
      STATE.currentTab = 'agent';
      localStorage.setItem('lastScreen', 'agent:' + id);
      showScreen(id);

      // Close mobile sidebar on navigation
      closeMobileSidebar();

      // Topbar: home/bot-overview hide switcher; automations shows count; others show bot-switcher
      if (id === 'home') {
        document.getElementById('topbar-title').style.display = '';
        document.getElementById('topbar-title').textContent = 'BotPanel';
        document.getElementById('topbar-count').textContent = '';
        document.getElementById('bot-switcher').style.display = 'none';
      } else if (id === 'bot-overview') {
        document.getElementById('topbar-title').style.display = 'none';
        document.getElementById('topbar-count').textContent = '';
        renderBotSwitcher();
        renderBotOverview();
        // Restore last active step tab
        const savedStep = localStorage.getItem('activeStep');
        if (savedStep && STEP_SCREENS.includes(savedStep)) {
          setTimeout(() => goStep(savedStep), 50);
        }
      } else if (id === 'automations') {
        document.getElementById('topbar-title').style.display = '';
        document.getElementById('topbar-title').textContent = 'Боты';
        document.getElementById('topbar-count').textContent = STATE.bots.length > 0 ? STATE.bots.length : '';
        document.getElementById('bot-switcher').style.display = 'none';
      } else {
        document.getElementById('topbar-title').style.display = 'none';
        document.getElementById('topbar-count').textContent = '';
        renderBotSwitcher();
      }

      // Highlight active nav items
      document.querySelectorAll('#nav-agent .nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-overview')?.classList.toggle('active', id === 'bot-overview');
      document.getElementById('nav-testing-btn')?.classList.toggle('active', id === 'testing');
      document.getElementById('kb-nav-hd')?.classList.toggle('active', id === 'topics');
      document.getElementById('nav-analytics')?.classList.toggle('active', id === 'analytics');
      document.getElementById('nav-automations')?.classList.toggle('active', id === 'automations');

      // Open advanced nav when navigating to advanced screens
      const advancedScreens = ['analytics', 'chats', 'topics', 'automations', 'ai-settings', 'launch', 'rules', 'autoreplies'];
      if (advancedScreens.includes(id)) {
        toggleAdvancedNav(true);
      }

      // Switch internal KB tab if needed
      if (id === 'topics') switchKbTab(kbTabTarget || STATE.kbTab || 'topics');

      if (id === 'rules') renderRulesScreen();
      if (id === 'analytics') { renderAnalytics(); renderAiUsage(); }
      if (id === 'ai-settings') { PROVIDERS.forEach(p => applyProviderUI(p)); }
      if (id === 'launch') renderLaunchScreen();
    }

    /* ═══ STEP NAVIGATION (SPA) ═══ */
    const STEP_SCREENS = ['rules', 'topics', 'testing', 'launch', 'autoreplies', 'chats', 'analytics'];
    let _stepOrigParent = {}; // track original parent for cleanup

    function goStep(step) {
      // Save to localStorage
      localStorage.setItem('activeStep', step);

      // Update active tab styling
      document.querySelectorAll('.step-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.step === step);
      });

      const contentArea = document.getElementById('step-content-area');
      const testWrap = document.getElementById('ov-test-wrap');

      // Return previously moved screen to its original parent
      STEP_SCREENS.forEach(s => {
        const screen = document.getElementById('screen-' + s);
        if (screen && _stepOrigParent[s] && screen.parentElement === contentArea) {
          _stepOrigParent[s].appendChild(screen);
          screen.classList.remove('active');
          screen.style.display = '';
        }
      });

      // Clear content area
      contentArea.innerHTML = '';
      if (testWrap) testWrap.style.display = 'none';

      // Ensure overview stays visible
      showScreen('bot-overview');

      if (step === 'testing') {
        // Show inline test chat
        if (testWrap) testWrap.style.display = '';
      } else {
        // Move target screen into content area
        const targetScreen = document.getElementById('screen-' + step);
        if (targetScreen) {
          if (!_stepOrigParent[step]) _stepOrigParent[step] = targetScreen.parentElement;
          contentArea.appendChild(targetScreen);
          targetScreen.classList.add('active');
          targetScreen.style.display = '';
        }
      }

      // Trigger render for the step
      if (step === 'rules') renderRulesScreen();
      if (step === 'analytics') { renderAnalytics(); renderAiUsage(); }
      if (step === 'launch') renderLaunchScreen();
      if (step === 'topics') switchKbTab(STATE.kbTab || 'topics');
      if (step === 'chats') { if (typeof renderChatList === 'function') renderChatList(); }

      // Keep overview highlighted in sidebar
      document.querySelectorAll('#nav-agent .nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-overview')?.classList.add('active');

      // Scroll content to top
      document.querySelector('.main-content')?.scrollTo(0, 0);
    }

    function switchKbTab(tab) {
      STATE.kbTab = tab;
      document.getElementById('kb-tab-topics')?.classList.toggle('active', tab === 'topics');
      document.getElementById('kb-tab-unans')?.classList.toggle('active', tab === 'unanswered');
      const topicsDiv = document.getElementById('kb-content-topics');
      const unansDiv = document.getElementById('kb-content-unans');
      if (topicsDiv) topicsDiv.style.display = tab === 'topics' ? '' : 'none';
      if (unansDiv) unansDiv.style.display = tab === 'unanswered' ? '' : 'none';
      // action buttons always visible — no layout shift on tab switch
    }

    function setTab(el) {
      el.closest('.tab-row').querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      const txt = el.textContent.trim();
      if (txt === '7 дней') STATE.analyticsPeriod = 7;
      else if (txt === '30 дней') STATE.analyticsPeriod = 30;
      else STATE.analyticsPeriod = 90;
      renderAnalytics();
    }

    /* ══ AUTOMATIONS ══ */
    const BOT_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444'];

    function renderBots() {
      const grid = document.getElementById('auto-grid');
      // clear all except promo card
      while (grid.children.length > 0) grid.removeChild(grid.lastChild);

      STATE.bots.forEach((bot, i) => {
        const color = BOT_COLORS[i % BOT_COLORS.length];
        const initial = (bot.name || '?').charAt(0).toUpperCase();
        const card = document.createElement('div');
        card.className = 'auto-card';
        card.innerHTML = `
        <div class="auto-card-head">
          <div class="auto-name-row">
            <span class="auto-logo" style="color:${color};">⬡</span>
            <span class="auto-name">${esc(bot.name)}</span>
          </div>
          <span class="auto-more" onclick="removeBot('${bot.id}','${esc(bot.name)}',event)">···</span>
        </div>
        <div class="auto-stats">
          <div><div class="auto-stat-label">Контакты</div><div class="auto-stat-val">${bot.contacts || 0}</div></div>
          <div><div class="auto-stat-label">Конверсия</div><div class="auto-stat-val">${bot.contacts ? Math.round((bot.converted || 0) / bot.contacts * 100) : 0}%</div></div>
        </div>
        <div class="auto-account">
          <div class="auto-acc-av" style="background:${color};">${initial}</div>
          <span>${esc(bot.username || bot.name)}</span>
        </div>`;
        card.addEventListener('click', () => setActiveBot(bot.id));
        grid.appendChild(card);
      });

      updateAccList();
      updateAutoCount();
      renderBotSwitcher();
      renderBotNavList();
      updateBotContextNav();
    }

    function updateAutoCount() {
      const n = STATE.bots.length;
      // Update topbar count when on automations screen
      if (STATE.currentAgentScreen === 'automations') {
        document.getElementById('topbar-count').textContent = n > 0 ? n : '';
      }
      // Update sidebar badge
      const badge = document.getElementById('auto-count-badge');
      if (badge) badge.textContent = n > 0 ? n : '';
    }

    /* ── Bot switcher ── */
    function setActiveBot(id) {
      STATE.currentBotId = id;
      renderBotSwitcher();
      renderBotNavList();
      updateBotContextNav();
      goAgentScreen('bot-overview');
    }

    async function fetchBotPhoto(bot) {
      if (!bot.token) return null;
      if (STATE.botPhotos[bot.id] !== undefined) return STATE.botPhotos[bot.id];
      STATE.botPhotos[bot.id] = null; // mark as in-progress
      try {
        const me = await fetch(`https://api.telegram.org/bot${bot.token}/getMe`).then(r => r.json());
        if (!me.ok) return null;
        const photos = await fetch(`https://api.telegram.org/bot${bot.token}/getUserProfilePhotos?user_id=${me.result.id}&limit=1`).then(r => r.json());
        if (!photos.ok || !photos.result.photos.length) return null;
        const fileId = photos.result.photos[0][0].file_id;
        const file = await fetch(`https://api.telegram.org/bot${bot.token}/getFile?file_id=${fileId}`).then(r => r.json());
        if (!file.ok) return null;
        const url = `https://api.telegram.org/file/bot${bot.token}/${file.result.file_path}`;
        STATE.botPhotos[bot.id] = url;
        return url;
      } catch { return null; }
    }

    function renderBotNavList() {
      const list = document.getElementById('bot-nav-list');
      if (!list) return;
      if (STATE.bots.length === 0) {
        list.innerHTML = '<div style="padding:8px 10px;font-size:0.72rem;color:var(--text-dim);">Нет ботов</div>';
        return;
      }
      list.innerHTML = '';
      STATE.bots.forEach((bot, i) => {
        const color = BOT_COLORS[i % BOT_COLORS.length];
        const initial = (bot.name || '?').charAt(0).toUpperCase();
        const displayName = bot.username ? '@' + bot.username.replace(/^@/, '') : bot.name;
        const isActive = bot.id === STATE.currentBotId;
        const photoUrl = STATE.botPhotos[bot.id];
        const item = document.createElement('div');
        item.className = 'bot-nav-item' + (isActive ? ' active' : '');
        const avInner = photoUrl ? `<img src="${photoUrl}" alt="">` : initial;
        item.innerHTML = `<div class="bot-nav-av" style="background:${photoUrl ? 'transparent' : color};">${avInner}</div><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(displayName)}</span>`;
        item.onclick = () => setActiveBot(bot.id);
        list.appendChild(item);
      });
    }

    function updateBotContextNav() {
      const nav = document.getElementById('bot-context-nav');
      const hasBots = !!(STATE.currentBotId && STATE.bots.length > 0);
      if (nav) nav.style.display = hasBots ? '' : 'none';
      // Always show all features expanded when a bot is selected
      if (hasBots) toggleAdvancedNav(true);
    }

    function renderBotSwitcher() {
      const switcher = document.getElementById('bot-switcher');
      if (!switcher) return;

      const bot = STATE.bots.find(b => b.id === STATE.currentBotId) || STATE.bots[0];
      if (!bot) { switcher.style.display = 'none'; return; }

      // Auto-set currentBotId if not set
      if (!STATE.currentBotId) STATE.currentBotId = bot.id;

      const i = STATE.bots.indexOf(bot);
      const color = BOT_COLORS[i % BOT_COLORS.length];
      const initial = (bot.name || '?').charAt(0).toUpperCase();
      const name = bot.username ? '@' + bot.username.replace(/^@/, '') : bot.name;

      document.getElementById('sw-av').style.background = color;
      document.getElementById('sw-av').textContent = initial;
      document.getElementById('sw-name').textContent = name;
      switcher.style.display = 'block';

      // Render dropdown list
      const dropdown = document.getElementById('sw-dropdown');
      dropdown.innerHTML = STATE.bots.map((b, idx) => {
        const c = BOT_COLORS[idx % BOT_COLORS.length];
        const ini = (b.name || '?').charAt(0).toUpperCase();
        const bname = b.username ? '@' + b.username.replace(/^@/, '') : b.name;
        const isCurrent = b.id === STATE.currentBotId;
        return `<div class="bot-sw-item ${isCurrent ? 'current' : ''}" onclick="setActiveBot('${b.id}');closeBotDropdown();">
        <div class="bot-sw-av" style="background:${c};width:28px;height:28px;font-size:12px;">${ini}</div>
        <span>${escH(bname)}</span>
      </div>`;
      }).join('');
    }

    /* ══ MOBILE SIDEBAR ══ */
    function toggleMobileSidebar() {
      const sidebar = document.querySelector('.sidebar');
      const overlay = document.getElementById('mob-overlay');
      const isOpen = sidebar.classList.toggle('mob-open');
      overlay.classList.toggle('open', isOpen);
    }
    function closeMobileSidebar() {
      document.querySelector('.sidebar')?.classList.remove('mob-open');
      document.getElementById('mob-overlay')?.classList.remove('open');
    }

    function toggleBotDropdown(e) {
      e.stopPropagation();
      const dd = document.getElementById('sw-dropdown');
      const arrow = document.getElementById('sw-arrow');
      const isOpen = dd.classList.contains('visible');
      dd.classList.toggle('visible', !isOpen);
      arrow.classList.toggle('open', !isOpen);
      if (!isOpen) {
        setTimeout(() => document.addEventListener('click', closeBotDropdown, { once: true }), 0);
      }
    }

    function closeBotDropdown() {
      document.getElementById('sw-dropdown')?.classList.remove('visible');
      document.getElementById('sw-arrow')?.classList.remove('open');
    }

    function updateAccList() {
      const list = document.getElementById('acc-list');
      if (STATE.bots.length === 0) {
        list.innerHTML = `<div class="empty-state" style="padding:20px 10px;"><div class="empty-icon" style="font-size:24px;">📡</div><div class="empty-sub" style="font-size:0.7rem;">Добавьте бота через API</div></div>`;
        return;
      }
      list.innerHTML = '';
      STATE.bots.forEach((bot, i) => {
        const color = BOT_COLORS[i % BOT_COLORS.length];
        const initial = (bot.name || '?').charAt(0).toUpperCase();
        const item = document.createElement('div');
        item.className = 'acc-item';
        item.innerHTML = `<div class="acc-av" style="background:${color};">${initial}</div><span class="acc-name">${esc(bot.username || bot.name)}</span>`;
        list.appendChild(item);
      });
      renderTariff();
    }

    function removeBot(id, name, e) {
      e.stopPropagation();
      showConfirm({
        icon: '🗑',
        title: 'Удалить бота?',
        desc: `Бот «${name}» будет удалён. Это действие нельзя отменить.`,
        action: 'Удалить',
        danger: true,
        onOk: () => fsDel('bots', id),
      });
    }

    /* ══ MODAL ADD BOT ══ */
    function openModal() {
      document.getElementById('modal-add').classList.add('open');
      setTimeout(() => document.getElementById('bot-name').focus(), 100);
    }
    function closeModal() {
      document.getElementById('modal-add').classList.remove('open');
      ['bot-name', 'bot-token', 'bot-username'].forEach(id => document.getElementById(id).value = '');
    }
    document.getElementById('modal-add').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

    async function addBot() {
      const name = document.getElementById('bot-name').value.trim();
      const token = document.getElementById('bot-token').value.trim();
      const username = document.getElementById('bot-username').value.trim();
      if (!name) { document.getElementById('bot-name').focus(); return; }
      if (!token) { alert('Введите Telegram Bot API токен'); document.getElementById('bot-token').focus(); return; }
      const btn = document.getElementById('add-bot-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Подключаю...'; }
      try {
        const ref = await fsAdd('bots', { name, token, username: username || '@' + name.toLowerCase().replace(/\s+/g, ''), contacts: 0, conversion: 0 });
        if (STATE.agentActive && currentUser) {
          registerTelegramWebhook(currentUser.uid, ref.id, token, false);
        }
        closeModal();
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Подключить'; }
      }
    }

    async function registerTelegramWebhook(uid, botId, token, remove) {
      try {
        const r = await fetch('/api/register-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, botId, token, remove }),
        });
        return await r.json();
      } catch (e) { console.warn('registerWebhook error:', e); return null; }
    }

    async function activateAllBots() {
      if (!currentUser) return;
      const btn = document.getElementById('btn-activate-bots');
      const msg = document.getElementById('webhook-status-msg');
      btn.disabled = true;
      btn.textContent = '⏳ Подключаю...';
      msg.textContent = '';
      const botsSnap = await db.collection('users').doc(currentUser.uid).collection('bots').get();
      if (botsSnap.empty) {
        msg.textContent = '⚠️ Сначала добавьте бота в разделе Автоматизации';
        btn.disabled = false; btn.textContent = '⚡ Активировать бота';
        return;
      }
      let ok = 0, fail = 0;
      for (const doc of botsSnap.docs) {
        const { token } = doc.data();
        if (!token) continue;
        const result = await registerTelegramWebhook(currentUser.uid, doc.id, token, false);
        if (result && result.ok) ok++; else fail++;
      }
      await db.collection('users').doc(currentUser.uid).collection('settings').doc('agent')
        .set({ active: true }, { merge: true });
      STATE.agentActive = true;
      applyAgentStatus();
      renderWebhookBots();
      btn.disabled = false;
      btn.textContent = '⚡ Активировать бота';
      if (fail === 0) msg.textContent = `✅ Бот подключён! Теперь он будет отвечать в Telegram.`;
      else msg.textContent = `⚠️ Подключено: ${ok}, ошибок: ${fail}. Проверьте токен бота.`;
    }

    async function renderWebhookBots() {
      const el = document.getElementById('webhook-bots-list');
      if (!el || !currentUser) return;
      const botsSnap = await db.collection('users').doc(currentUser.uid).collection('bots').get();
      if (botsSnap.empty) {
        el.innerHTML = '<div style="font-size:0.8rem;color:var(--text-sec);">Нет добавленных ботов</div>';
        return;
      }
      el.innerHTML = botsSnap.docs.map(doc => {
        const d = doc.data();
        const active = STATE.agentActive;
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:0.85rem;">
        <span>🤖 ${d.name || d.username || 'Бот'}</span>
        <span style="color:${active ? '#22c55e' : 'var(--text-sec)'};">${active ? '● Активен' : '○ Не активен'}</span>
      </div>`;
      }).join('');
    }

    /* ══ KB MODAL ══ */
    function showKbModal(type) {
      document.getElementById('kb-modal-title').textContent = type === 'file' ? 'Загрузить файл' : 'Добавить текст';
      document.getElementById('modal-kb').classList.add('open');
      setTimeout(() => document.getElementById('kb-title').focus(), 100);
    }
    function closeKbModal() {
      document.getElementById('modal-kb').classList.remove('open');
      document.getElementById('kb-title').value = '';
      document.getElementById('kb-content').value = '';
    }
    document.getElementById('modal-kb').addEventListener('click', e => { if (e.target === e.currentTarget) closeKbModal(); });

    async function saveKb() {
      const title = document.getElementById('kb-title').value.trim();
      const rawText = document.getElementById('kb-content').value.trim();
      if (!title || !rawText) { alert('Заполните все поля'); return; }
      const sourceRef = await col('kbSources').add({
        title, rawText, type: 'text', status: 'queued',
        _ts: firebase.firestore.FieldValue.serverTimestamp(),
      });
      const jobRef = await col('jobs').add({
        sourceId: sourceRef.id, type: 'knowledge_ingest',
        status: 'queued', step: 'parse', progress: 0,
        _ts: firebase.firestore.FieldValue.serverTimestamp(),
      });
      startKnowledgeProcessing(sourceRef.id, jobRef.id);
      showToast('⏳ Текст принят — генерирую Q&A…');
      closeKbModal();
    }

    /* ══ EDIT ANSWER MODAL ══ */
    let _eaState = { id: null, question: '', answer: '', mode: 'replace', source: 'kb' };

    function openEditAnswer(id, question, answer, source = 'kb') {
      _eaState = { id, question, answer: answer || '', mode: 'replace', source };
      document.getElementById('ea-question').textContent = question;
      const curWrap = document.getElementById('ea-current-wrap');
      const curAnswer = document.getElementById('ea-current-answer');
      if (answer) {
        curWrap.style.display = '';
        curAnswer.textContent = answer;
      } else {
        curWrap.style.display = 'none';
      }
      document.getElementById('ea-textarea').value = '';
      document.getElementById('ea-textarea').placeholder = 'Новые данные для ответа на вопрос';
      document.getElementById('ea-confidence').style.display = 'none';
      document.getElementById('ea-admin-note').style.display = 'none';
      document.getElementById('ea-insert-btn').style.display = answer ? '' : 'none';

      // Set title
      const title = source === 'unanswered' ? 'Добавить ответ' : 'Редактирование ответа';
      document.getElementById('ea-modal-title').textContent = title;

      // Hide tabs for unanswered (only draft mode)
      document.getElementById('ea-tabs').style.display = source === 'unanswered' ? 'none' : '';
      document.getElementById('ea-hint').style.display = source === 'unanswered' ? 'none' : '';

      switchEaTab('replace');
      document.getElementById('modal-edit-answer').classList.add('open');
    }

    function switchEaTab(tab) {
      _eaState.mode = tab;
      document.getElementById('ea-tab-replace')?.classList.toggle('active', tab === 'replace');
      document.getElementById('ea-tab-append')?.classList.toggle('active', tab === 'append');
      const hintText = document.getElementById('ea-hint-text');
      if (tab === 'replace') {
        hintText.textContent = 'Замена ответа позволяет изменить информацию, которую ИИ-агент использует отвечая на вопрос';
        document.getElementById('ea-textarea').placeholder = 'Новые данные для ответа на вопрос';
      } else {
        hintText.textContent = 'Дайте особые указания по поведению, условиям и стилю ответа на вопрос';
        document.getElementById('ea-textarea').placeholder = 'Как дополнить существующие данные для ответа?';
      }
    }

    async function generateAIAnswer() {
      const btn = document.getElementById('ea-ai-btn');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ Генерирую…';

      const mode = _eaState.source === 'unanswered' ? 'UNANSWERED_DRAFT'
        : _eaState.mode === 'replace' ? 'KB_EDIT_REPLACE' : 'KB_EDIT_APPEND';

      // Gather bot rules
      const botDoc = STATE.bots.find(b => b.id === STATE.currentBotId);
      const rules = botDoc?.rules || '';
      const provider = botDoc?.provider || 'openai';
      const model = botDoc?.model || 'gpt-4o-mini';

      // Gather kb_matches from similar KB items
      const kbMatches = STATE.kbQA
        .filter(qa => qa.id !== _eaState.id && qa.answer)
        .slice(0, 5)
        .map(qa => `Q: ${qa.question}\nA: ${qa.answer}`);

      try {
        const resp = await fetch('/api/generate-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: _eaState.question,
            mode,
            existing_answer: _eaState.answer,
            kb_matches: kbMatches,
            bot_rules: rules,
            provider,
            model,
          }),
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        document.getElementById('ea-textarea').value = data.answer_text || '';

        if (data.confidence != null) {
          const pct = Math.round(data.confidence * 100);
          document.getElementById('ea-confidence').style.display = '';
          document.getElementById('ea-confidence-val').textContent = `${pct}%`;
        }
        if (data.admin_note) {
          document.getElementById('ea-admin-note').style.display = '';
          document.getElementById('ea-admin-note').textContent = '💡 ' + data.admin_note;
        }
      } catch (err) {
        showToast('❌ Ошибка: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    }

    function insertCurrentAnswer() {
      const ta = document.getElementById('ea-textarea');
      ta.value = _eaState.answer;
      ta.focus();
    }

    async function saveEditAnswer() {
      const text = document.getElementById('ea-textarea').value.trim();
      if (!text) { showToast('⚠️ Введите текст ответа'); return; }

      const saveBtn = document.getElementById('ea-save-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохраняю…';

      try {
        if (_eaState.source === 'unanswered') {
          // Save as new KB entry: create kbQA doc
          await col('kbQA').add({
            question: _eaState.question,
            answer: text,
            asked: 1,
            _ts: firebase.firestore.FieldValue.serverTimestamp(),
          });
          // Remove from unanswered
          if (_eaState.id) fsDel('unanswered', _eaState.id);
          showToast('✅ Ответ добавлен в базу знаний');
        } else {
          // Update existing kbQA doc
          let newAnswer;
          if (_eaState.mode === 'append') {
            newAnswer = (_eaState.answer ? _eaState.answer + '\n\n' : '') + text;
          } else {
            newAnswer = text;
          }
          await col('kbQA').doc(_eaState.id).update({
            answer: newAnswer,
            _ts: firebase.firestore.FieldValue.serverTimestamp(),
          });
          showToast('✅ Ответ обновлён');
        }
        closeEditAnswer();
      } catch (err) {
        showToast('❌ Ошибка сохранения: ' + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить';
      }
    }

    function closeEditAnswer() {
      document.getElementById('modal-edit-answer').classList.remove('open');
      _eaState = { id: null, question: '', answer: '', mode: 'replace', source: 'kb' };
    }
    document.getElementById('modal-edit-answer').addEventListener('click', e => { if (e.target === e.currentTarget) closeEditAnswer(); });

    function renderKb() {
      const el = document.getElementById('kb-items');
      el.innerHTML = '';

      const STEP_LABELS = { parse: 'Читаю файл…', chunk: 'Разбиваю на части…', qa_generate: 'Генерирую вопросы и ответы…', dedupe: 'Проверяю дубликаты…', save: 'Сохраняю…', done: 'Готово!' };

      // Active/queued jobs — progress bars
      STATE.kbJobs.filter(j => j.status === 'running' || j.status === 'queued').forEach(job => {
        const div = document.createElement('div');
        div.className = 'auto-card';
        div.style.cssText = 'cursor:default;border-color:var(--primary-brd);';
        const prog = job.progress || 0;
        const label = STEP_LABELS[job.step] || 'Обрабатываю…';
        const meta = job.meta || {};
        div.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:0.82rem;font-weight:700;">⏳ ${label}</span>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:0.75rem;color:var(--indigo);font-weight:700;">${prog}%</span>
            <button onclick="cancelJob('${job.id}','${job.sourceId || ''}')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:2px 9px;font-size:0.68rem;cursor:pointer;color:var(--text-sec);">✕ Отменить</button>
          </div>
        </div>
        <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div class="pb-fill" style="width:${prog}%;"></div>
        </div>
        ${meta.chunks ? `<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Чанков: ${meta.chunksDone || 0}/${meta.chunks} · Q&A: ${meta.qaGenerated || 0}</div>` : ''}`;
        el.appendChild(div);
      });

      // Succeeded jobs — result summary
      STATE.kbJobs.filter(j => j.status === 'succeeded').forEach(job => {
        const div = document.createElement('div');
        div.className = 'auto-card';
        div.style.cssText = 'cursor:default;border-color:#22c55e55;';
        const m = job.meta || {};
        div.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:0.8rem;font-weight:700;color:#22c55e;">✅ Обработка завершена</span>
          <button onclick="fsDel('jobs','${job.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:12px;">✕</button>
        </div>
        <div style="font-size:0.75rem;color:var(--text-sec);margin-top:4px;">
          Добавлено: <b style="color:var(--text);">${m.added || 0}</b> пар Q&A &nbsp;·&nbsp; Пропущено дубликатов: <b>${m.skipped || 0}</b>
        </div>`;
        el.appendChild(div);
      });

      // Failed jobs
      STATE.kbJobs.filter(j => j.status === 'failed').forEach(job => {
        const div = document.createElement('div');
        div.className = 'auto-card';
        div.style.cssText = 'cursor:default;border-color:#ef444455;';
        div.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:0.8rem;font-weight:700;color:#ef4444;">❌ Ошибка обработки</span>
          <button onclick="fsDel('jobs','${job.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:12px;">✕</button>
        </div>
        <div style="font-size:0.72rem;color:var(--text-sec);margin-top:4px;">${esc(job.errorMessage || 'Неизвестная ошибка')}</div>`;
        el.appendChild(div);
      });

      // Cancelled jobs
      STATE.kbJobs.filter(j => j.status === 'cancelled').forEach(job => {
        const div = document.createElement('div');
        div.className = 'auto-card';
        div.style.cssText = 'cursor:default;border-color:#f9731655;';
        div.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:0.8rem;font-weight:700;color:#f97316;">⛔ Загрузка отменена</span>
          <button onclick="fsDel('jobs','${job.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:12px;">✕</button>
        </div>
        <div style="font-size:0.72rem;color:var(--text-sec);margin-top:4px;">Обработка была остановлена пользователем.</div>`;
        el.appendChild(div);
      });

      // Q&A pairs header
      if (STATE.kbQA.length > 0) {
        const hdr = document.createElement('div');
        hdr.style.cssText = 'font-size:0.7rem;font-weight:700;color:var(--text-dim);letter-spacing:0.08em;text-transform:uppercase;margin:14px 0 6px;';
        hdr.textContent = `База знаний · ${STATE.kbQA.length} пар Q&A`;
        el.appendChild(hdr);

        STATE.kbQA.forEach(qa => {
          const div = document.createElement('div');
          div.className = 'auto-card';
          div.style.cursor = 'default';
          div.innerHTML = `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="font-size:0.8rem;font-weight:700;color:var(--text);line-height:1.4;">❓ ${esc(qa.question)}</div>
            <button onclick="fsDel('kbQA','${qa.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:13px;flex-shrink:0;">✕</button>
          </div>
          <div style="font-size:0.75rem;color:var(--text-sec);margin-top:5px;line-height:1.5;">💬 ${esc(qa.answer).slice(0, 160)}${qa.answer.length > 160 ? '…' : ''}</div>
          ${qa.topic ? `<div style="font-size:0.65rem;color:var(--text-dim);margin-top:4px;">📂 ${esc(qa.topic)}</div>` : ''}`;
          el.appendChild(div);
        });

      } else if (STATE.kbItems.length > 0) {
        // Legacy fallback
        STATE.kbItems.forEach(item => {
          const div = document.createElement('div');
          div.className = 'auto-card';
          div.style.cursor = 'default';
          div.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:0.82rem;font-weight:700;">${esc(item.title)}</span>
            <button onclick="fsDel('kbItems','${item.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:13px;">✕</button>
          </div>
          <div style="font-size:0.75rem;color:var(--text-sec);margin-top:6px;line-height:1.5;">${esc(item.content).slice(0, 120)}${item.content.length > 120 ? '…' : ''}</div>`;
          el.appendChild(div);
        });
      }

      // Transcripts section
      const transcripts = (STATE.kbSources || []).filter(s => s.type === 'transcript');
      if (transcripts.length > 0) {
        const hdr = document.createElement('div');
        hdr.style.cssText = 'font-size:0.7rem;font-weight:700;color:var(--text-dim);letter-spacing:0.08em;text-transform:uppercase;margin:18px 0 6px;';
        hdr.textContent = `🎬 Транскрипции · ${transcripts.length}`;
        el.appendChild(hdr);
        transcripts.forEach(src => {
          const div = document.createElement('div');
          div.className = 'auto-card';
          div.style.cssText = 'cursor:default;border-color:#f9731630;';
          const statusBadge = src.status === 'transcribed'
            ? `<span style="background:#fef3c7;color:#d97706;font-size:0.62rem;font-weight:700;padding:2px 7px;border-radius:20px;">Ожидает обработки</span>`
            : src.status === 'done'
              ? `<span style="background:#dcfce7;color:#16a34a;font-size:0.62rem;font-weight:700;padding:2px 7px;border-radius:20px;">В базе знаний</span>`
              : `<span style="background:var(--bg);color:var(--text-dim);font-size:0.62rem;font-weight:700;padding:2px 7px;border-radius:20px;">${src.status}</span>`;
          div.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🎬 ${esc(src.title || src.videoId || 'YouTube')}</div>
              <div style="font-size:0.68rem;color:var(--text-dim);margin-top:3px;">${(src.chars || 0).toLocaleString()} символов${src.url ? ` · <a href="${esc(src.url)}" target="_blank" style="color:var(--indigo);">открыть</a>` : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
              ${statusBadge}
              ${src.status === 'transcribed' ? `<button onclick="addSourceToKb('${src.id}')" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:0.68rem;font-weight:700;cursor:pointer;">➕ В базу</button>` : ''}
              <button onclick="fsDel('kbSources','${src.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:13px;">✕</button>
            </div>
          </div>`;
          el.appendChild(div);
        });
      }

      renderSuggestions();
    }

    async function addSourceToKb(sourceId) {
      if (!currentUser) return;
      const jobRef = await col('jobs').add({
        sourceId,
        status: 'queued', step: 'parse', progress: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await startKnowledgeProcessing(sourceId, jobRef.id);
      showToast('🚀 Обработка транскрипции запущена!');
    }

    /* ══ SUGGESTIONS from KB ══ */
    function renderSuggestions() {
      const list = document.getElementById('sug-list');
      const hasData = STATE.kbQA.length > 0 || STATE.kbItems.length > 0;
      if (!hasData) {
        list.innerHTML = `<div class="empty-state" style="padding:20px;text-align:center;"><div class="empty-sub">Добавьте информацию в базу знаний</div></div>`;
        return;
      }
      list.innerHTML = '';
      // Prefer kbQA questions as suggestions
      const items = STATE.kbQA.length > 0
        ? STATE.kbQA.slice(0, 6).map(qa => ({ label: qa.question, query: qa.question }))
        : STATE.kbItems.slice(0, 6).map(it => ({ label: `Расскажи про: ${it.title}`, query: `Расскажи про ${it.title}` }));
      items.forEach(({ label, query }) => {
        const div = document.createElement('div');
        div.className = 'sug-item';
        div.innerHTML = `<span class="sug-ico">💡</span>${esc(label)}`;
        div.onclick = () => { document.getElementById('chat-input').value = query; sendChat(); };
        list.appendChild(div);
      });
    }

    /* ══ CHAT ══ */
    function sendChat(inputId, msgsId) {
      const _inp = inputId || 'chat-input';
      const _msgs = msgsId || 'chat-msgs';
      const input = document.getElementById(_inp);
      const msgs = document.getElementById(_msgs);
      const text = input.value.trim();
      if (!text) return;

      if (!STATE.agentActive) {
        showToast('⚠️ Агент неактивен. Включите его в боковом меню.');
        return;
      }

      const time = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
      const typingId = _msgs + '-typing';

      const uRow = document.createElement('div');
      uRow.className = 'msg-row user';
      uRow.innerHTML = `<div class="bubble user">${esc(text)}</div><div class="msg-time">${time}</div>`;
      msgs.appendChild(uRow);
      input.value = '';
      msgs.scrollTop = msgs.scrollHeight;

      // show typing indicator
      const typingRow = document.createElement('div');
      typingRow.className = 'msg-row';
      typingRow.id = typingId;
      typingRow.innerHTML = `<div class="bubble" style="color:var(--text-dim);font-style:italic;">печатает...</div>`;
      msgs.appendChild(typingRow);
      msgs.scrollTop = msgs.scrollHeight;

      // Вызываем реальный AI через Firebase Function
      (async () => {
        try {
          // Определяем провайдера и модель из настроек
          const providersCfg = STATE.aiProviders || {};
          let provider = 'claude', model = '';
          for (const p of ['openai', 'gemini', 'claude']) {
            if (providersCfg[p]?.enabled) { provider = p; model = providersCfg[p].model || ''; break; }
          }

          const resp = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: text,
              history: STATE.chatHistory.slice(-10),
              kbItems: STATE.kbQA.length > 0
                ? STATE.kbQA.map(qa => ({ title: qa.question, content: qa.answer }))
                : STATE.kbItems,
              rules: STATE.rules,
              provider,
              model,
            }),
          });

          document.getElementById(typingId)?.remove();

          let reply;
          if (resp.ok) {
            const data = await resp.json();
            reply = data.answer || 'Пустой ответ от AI.';
          } else {
            reply = '⚠️ Ошибка AI. Проверьте настройки провайдера.';
          }

          // Save to conversation history
          STATE.chatHistory.push({ role: 'user', content: text });
          STATE.chatHistory.push({ role: 'assistant', content: reply });
          if (STATE.chatHistory.length > 20) STATE.chatHistory = STATE.chatHistory.slice(-20);

          const bRow = document.createElement('div');
          bRow.className = 'msg-row';
          bRow.innerHTML = `<div class="bubble">${esc(reply)}</div><div class="msg-time">${time} <span style="color:var(--text-dim);font-size:0.58rem;">• тест</span></div>`;
          msgs.appendChild(bRow);
          msgs.scrollTop = msgs.scrollHeight;

        } catch (e) {
          document.getElementById(typingId)?.remove();
          const bRow = document.createElement('div');
          bRow.className = 'msg-row';
          bRow.innerHTML = `<div class="bubble" style="color:var(--red);">⚠️ Не удалось подключиться к AI. ${e.message}</div><div class="msg-time">${time}</div>`;
          msgs.appendChild(bRow);
          msgs.scrollTop = msgs.scrollHeight;
        }
      })();
    }

    function clearChat(msgsId) {
      STATE.chatHistory = [];
      const msgs = document.getElementById(msgsId || 'chat-msgs');
      msgs.innerHTML = `<div class="date-sep">Сегодня</div>
      <div class="msg-row">
        <div class="bubble">👋 Привет! Я ваш ИИ-агент. Здесь можно проверить как я отвечаю клентам. Напишите любой вопрос.</div>
        <div class="msg-time">${new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>`;
      showToast('🗑 Диалог очищен');
    }

    function restartAgent() {
      clearChat();
      renderSuggestions();
      showToast('↺ Агент перезапущен — промпт и база знаний обновлены');
    }

    function toggleOvTest() {
      const wrap = document.getElementById('ov-test-wrap');
      const btn = document.getElementById('ov-test-btn');
      const open = wrap.style.display !== 'none';
      wrap.style.display = open ? 'none' : 'block';
      if (btn) btn.textContent = open ? '▷ Тестировать' : '▲ Закрыть тест';
      if (!open) setTimeout(() => document.getElementById('ov-chat-input')?.focus(), 80);
    }

    /* ══ UNANSWERED ══ */
    function renderUnanswered() {
      const grid = document.getElementById('unans-grid');
      const badge = document.getElementById('unans-badge');
      const tabCount = document.getElementById('unans-count-tab');
      const n = STATE.unanswered.length;
      if (badge) { badge.textContent = n; badge.style.display = n > 0 ? '' : 'none'; }
      if (tabCount) tabCount.textContent = n > 0 ? `(${n})` : '';

      if (n === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Отлично!</div><div class="empty-sub">Все вопросы получили ответ</div></div></div>`;
        return;
      }
      grid.innerHTML = '';
      STATE.unanswered.forEach(q => {
        const card = document.createElement('div');
        card.className = 'unans-card';
        card.innerHTML = `
        <div class="unans-text">${esc(q.text)}</div>
        <div class="unans-foot">
          <span class="q-count">▐ 1 запрос</span>
          <div style="display:flex;gap:5px;">
            <button style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 9px;font-size:0.68rem;color:var(--text-sec);cursor:pointer;" onclick="rejectUnans('${q.id}')">✕ Отклонить</button>
            <button class="btn-add" onclick="answerUnans('${q.id}')">✅ Одобрить</button>
          </div>
        </div>`;
        grid.appendChild(card);
      });
    }

    function rejectUnans(id) {
      fsDel('unanswered', id);
      showToast('✕ Вопрос отклонён');
    }

    function answerUnans(id) {
      const item = STATE.unanswered.find(q => q.id === id);
      if (!item) return;
      openEditAnswer(id, item.text, '', 'unanswered');
    }

    /* ══ JOBS INLINE (for topics screen) ══ */
    function renderJobsInline() {
      const el = document.getElementById('kb-jobs-inline');
      if (!el) return;
      const STEP_LABELS = { parse: 'Читаю файл…', chunk: 'Разбиваю на части…', qa_generate: 'Генерирую вопросы и ответы…', dedupe: 'Проверяю дубликаты…', save: 'Сохраняю…', done: 'Готово!' };
      const active = STATE.kbJobs.filter(j => j.status === 'running' || j.status === 'queued');
      el.style.display = active.length > 0 ? '' : 'none';
      el.innerHTML = '';
      active.forEach(job => {
        const prog = job.progress || 0;
        const label = STEP_LABELS[job.step] || 'Обрабатываю…';
        const div = document.createElement('div');
        div.style.cssText = 'background:var(--surface);border:1px solid var(--primary-brd);border-radius:10px;padding:12px 14px;';
        div.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
          <span style="font-size:0.8rem;font-weight:700;">⏳ ${label}</span>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:0.72rem;color:var(--indigo);font-weight:700;">${prog}%</span>
            <button onclick="cancelJob('${job.id}','${job.sourceId || ''}')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:2px 9px;font-size:0.65rem;cursor:pointer;color:var(--text-sec);">✕ Отменить</button>
          </div>
        </div>
        <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
          <div class="pb-fill" style="width:${prog}%;"></div>
        </div>`;
        el.appendChild(div);
      });
    }

    /* ══ AI USAGE STATS ══ */

    function fmtNum(n) {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
      return String(n);
    }

    // ── Model pricing (USD per 1M tokens) ────────────────────────────────────
    const MODEL_PRICING = {
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      'gemini-1.5-flash': { input: 0.075, output: 0.30 },
      'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
      'gemini-1.5-pro': { input: 1.25, output: 5.00 },
      'gemini-2.0-flash': { input: 0.10, output: 0.40 },
      'gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
      'claude-haiku-4-5': { input: 0.80, output: 4.00 },
      'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
      'claude-opus-4': { input: 15.00, output: 75.00 },
      'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
      'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
      'gpt-4.1': { input: 2.00, output: 8.00 },
    };
    const CURRENCIES = {
      USD: { symbol: '$', rate: 1, label: 'USD' },
      EUR: { symbol: '€', rate: 0.92, label: 'EUR' },
      RUB: { symbol: '₽', rate: 90, label: 'RUB' },
      UZS: { symbol: "so'm", rate: 12850, label: 'UZS' },
    };
    if (!STATE.aiCurrency) STATE.aiCurrency = 'USD';

    function calcCostUSD(inputTokens, outputTokens, model) {
      const price = MODEL_PRICING[model];
      if (!price) return 0;
      return (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output;
    }

    function fmtCost(usd) {
      const cur = CURRENCIES[STATE.aiCurrency] || CURRENCIES.USD;
      const val = usd * cur.rate;
      const code = STATE.aiCurrency;

      if (code === 'UZS') {
        // Symbol after number, whole numbers with thousands separator
        if (val === 0) return `0 so'm`;
        if (val < 1) return `${val.toFixed(1)} so'm`;
        return `${Math.round(val).toLocaleString('ru-RU')} so'm`;
      }
      if (code === 'RUB') {
        if (val === 0) return `0 ₽`;
        if (val < 1) return `${val.toFixed(2)} ₽`;
        if (val < 1000) return `${val.toFixed(1)} ₽`;
        return `${Math.round(val).toLocaleString('ru-RU')} ₽`;
      }
      // USD / EUR — symbol before
      if (val === 0) return `${cur.symbol}0`;
      if (val < 0.001) return `${cur.symbol}${val.toFixed(5)}`;
      if (val < 0.01) return `${cur.symbol}${val.toFixed(4)}`;
      if (val < 1) return `${cur.symbol}${val.toFixed(3)}`;
      if (val < 1000) return `${cur.symbol}${val.toFixed(2)}`;
      return `${cur.symbol}${Math.round(val).toLocaleString()}`;
    }

    function setAiCurrency(code) {
      STATE.aiCurrency = code;
      Object.keys(CURRENCIES).forEach(c => {
        document.getElementById(`cur-btn-${c}`)?.classList.toggle('active', c === code);
      });
      renderAiUsage();
    }

    function getAiUsageFiltered() {
      const now = Date.now();
      const cutoffMs = STATE.aiUsagePeriod === 1
        ? now - 24 * 60 * 60 * 1000
        : now - STATE.aiUsagePeriod * 24 * 60 * 60 * 1000;
      return STATE.aiUsage.filter(e => {
        const ts = e.createdAt?.seconds
          ? e.createdAt.seconds * 1000
          : (e.createdAt?.toMillis ? e.createdAt.toMillis() : 0);
        return ts >= cutoffMs;
      });
    }

    function setAiUsagePeriod(days) {
      STATE.aiUsagePeriod = days;
      [1, 7, 30].forEach(d => {
        document.getElementById(`aiu-tab-${d}`)?.classList.toggle('active', d === days);
      });
      renderAiUsage();
    }

    const EMPTY_MSG = (cols) =>
      `<tr><td colspan="${cols}" style="text-align:center;color:var(--text-dim);padding:24px;font-size:0.75rem;">
      Данные появятся после следующего диалога с ботом в Telegram
    </td></tr>`;

    function renderAiUsage() {
      const events = getAiUsageFiltered();
      const allEvents = STATE.aiUsage;
      const totalTokens = events.reduce((s, e) => s + (e.totalTokens || 0), 0);
      const totalInput = events.reduce((s, e) => s + (e.inputTokens || 0), 0);
      const totalOutput = events.reduce((s, e) => s + (e.outputTokens || 0), 0);
      const totalCostUSD = events.reduce((s, e) => s + calcCostUSD(e.inputTokens || 0, e.outputTokens || 0, e.model || ''), 0);
      const requests = events.length;
      const errors = events.filter(e => e.status === 'error').length;
      const avg = requests > 0 ? Math.round(totalTokens / requests) : 0;

      const hasAny = allEvents.length > 0;
      document.getElementById('aiu-total-tokens').textContent = hasAny ? fmtNum(totalTokens) : '—';
      document.getElementById('aiu-token-sub').textContent = hasAny
        ? `↑ ${fmtNum(totalInput)} / ↓ ${fmtNum(totalOutput)}`
        : 'данные появятся после диалогов';
      document.getElementById('aiu-requests').textContent = hasAny ? fmtNum(requests) : '—';
      document.getElementById('aiu-avg').textContent = avg > 0 ? fmtNum(avg) : '—';
      document.getElementById('aiu-cost').textContent = hasAny ? fmtCost(totalCostUSD) : '—';
      document.getElementById('aiu-cost-sub').textContent = CURRENCIES[STATE.aiCurrency]?.label || 'USD';
      document.getElementById('aiu-errors').textContent = errors > 0 ? errors : '—';

      // ── Providers table ─────────────────────────────────────────────────────
      const provMap = {};
      events.forEach(e => {
        const p = e.provider || 'unknown';
        if (!provMap[p]) provMap[p] = { requests: 0, input: 0, output: 0, total: 0, costUSD: 0 };
        provMap[p].requests++;
        provMap[p].input += e.inputTokens || 0;
        provMap[p].output += e.outputTokens || 0;
        provMap[p].total += e.totalTokens || 0;
        provMap[p].costUSD += calcCostUSD(e.inputTokens || 0, e.outputTokens || 0, e.model || '');
      });
      const provBody = document.getElementById('aiu-providers-body');
      if (Object.keys(provMap).length === 0) {
        provBody.innerHTML = EMPTY_MSG(6);
      } else {
        provBody.innerHTML = Object.entries(provMap)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([p, d]) => `<tr>
          <td style="font-weight:600;">${esc(p)}</td>
          <td>${fmtNum(d.requests)}</td>
          <td style="color:var(--text-sec);">${fmtNum(d.input)}</td>
          <td style="color:var(--text-sec);">${fmtNum(d.output)}</td>
          <td style="font-weight:700;color:var(--indigo);">${fmtNum(d.total)}</td>
          <td style="font-weight:700;color:#f59e0b;">${fmtCost(d.costUSD)}</td>
        </tr>`).join('');
      }

      // ── Models table ────────────────────────────────────────────────────────
      const modMap = {};
      events.forEach(e => {
        const key = e.model || 'unknown';
        if (!modMap[key]) modMap[key] = { requests: 0, total: 0, input: 0, output: 0, costUSD: 0 };
        modMap[key].requests++;
        modMap[key].total += e.totalTokens || 0;
        modMap[key].input += e.inputTokens || 0;
        modMap[key].output += e.outputTokens || 0;
        modMap[key].costUSD += calcCostUSD(e.inputTokens || 0, e.outputTokens || 0, key);
      });
      const modBody = document.getElementById('aiu-models-body');
      if (Object.keys(modMap).length === 0) {
        modBody.innerHTML = EMPTY_MSG(5);
      } else {
        modBody.innerHTML = Object.entries(modMap)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([m, d]) => {
            const avgTok = d.requests > 0 ? Math.round(d.total / d.requests) : 0;
            return `<tr>
            <td style="font-weight:600;font-size:0.75rem;">${esc(m)}</td>
            <td>${fmtNum(d.requests)}</td>
            <td style="font-weight:700;color:var(--indigo);">${fmtNum(d.total)}</td>
            <td style="color:var(--text-sec);">${fmtNum(avgTok)}</td>
            <td style="font-weight:700;color:#f59e0b;">${fmtCost(d.costUSD)}</td>
          </tr>`;
          }).join('');
      }

      // ── Top chats table ─────────────────────────────────────────────────────
      const chatMap = {};
      events.forEach(e => {
        const cid = e.chatId || 'unknown';
        if (!chatMap[cid]) chatMap[cid] = { name: e.chatName || cid, channel: e.channel || '—', requests: 0, input: 0, output: 0, total: 0, costUSD: 0, latSum: 0, latCnt: 0 };
        chatMap[cid].requests++;
        chatMap[cid].input += e.inputTokens || 0;
        chatMap[cid].output += e.outputTokens || 0;
        chatMap[cid].total += e.totalTokens || 0;
        chatMap[cid].costUSD += calcCostUSD(e.inputTokens || 0, e.outputTokens || 0, e.model || '');
        if (e.latencyMs) { chatMap[cid].latSum += e.latencyMs; chatMap[cid].latCnt++; }
      });
      const chatBody = document.getElementById('aiu-chats-body');
      const chatEntries = Object.values(chatMap).sort((a, b) => b.total - a.total).slice(0, 15);
      if (chatEntries.length === 0) {
        chatBody.innerHTML = EMPTY_MSG(8);
      } else {
        const CHAN_ICON = { telegram: '✈', web: '🌐', api: '⚡' };
        chatBody.innerHTML = chatEntries.map(c => {
          const avgLat = c.latCnt > 0 ? Math.round(c.latSum / c.latCnt) : null;
          const latStr = avgLat ? `${avgLat} ms` : '—';
          const chanIco = CHAN_ICON[c.channel] || '—';
          return `<tr>
          <td style="font-weight:600;">${esc(c.name)}</td>
          <td style="color:var(--text-sec);">${chanIco} ${esc(c.channel)}</td>
          <td>${fmtNum(c.requests)}</td>
          <td style="color:var(--text-sec);">${fmtNum(c.input)}</td>
          <td style="color:var(--text-sec);">${fmtNum(c.output)}</td>
          <td style="font-weight:700;color:var(--indigo);">${fmtNum(c.total)}</td>
          <td style="font-weight:700;color:#f59e0b;">${fmtCost(c.costUSD)}</td>
          <td style="color:var(--text-dim);font-size:0.72rem;">${latStr}</td>
        </tr>`;
        }).join('');
      }
    }

    function exportAiUsageCsv() {
      const events = getAiUsageFiltered();
      if (events.length === 0) { showToast('Нет данных для экспорта'); return; }
      const cur = CURRENCIES[STATE.aiCurrency] || CURRENCIES.USD;
      const rows = [
        ['Дата', 'Чат', 'Канал', 'Провайдер', 'Модель', 'Input токены', 'Output токены', 'Всего токенов', `Стоимость (${cur.label})`, 'Латентность (ms)', 'Статус'],
        ...events.map(e => {
          const ts = e.createdAt?.seconds ? new Date(e.createdAt.seconds * 1000).toISOString() : '';
          const costUSD = calcCostUSD(e.inputTokens || 0, e.outputTokens || 0, e.model || '');
          const costVal = (costUSD * cur.rate).toFixed(6);
          return [ts, e.chatName || e.chatId || '', e.channel || '', e.provider || '', e.model || '',
            e.inputTokens || 0, e.outputTokens || 0, e.totalTokens || 0, costVal, e.latencyMs || '', e.status || 'ok'];
        })
      ];
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `ai-usage-${STATE.aiUsagePeriod}d.csv`; a.click();
      URL.revokeObjectURL(url);
      showToast('✅ CSV экспортирован');
    }

    /* ══ TOPICS ══ */
    const _topicExpanded = new Set();

    function toggleTopicExpand(id) {
      if (_topicExpanded.has(id)) _topicExpanded.delete(id);
      else _topicExpanded.add(id);
      renderTopics();
    }

    function renderTopics() {
      const tbody = document.getElementById('topics-body');
      const search = (document.getElementById('topic-search')?.value || '').toLowerCase();
      const count = document.getElementById('topics-count');

      // "Все темы" = only KB knowledge entries (upload / manual / YouTube)
      // Chat-originated questions from STATE.topics are NOT shown here
      const all = STATE.kbQA
        .filter(qa => qa.question)
        .map(qa => ({ id: qa.id, name: qa.question, answer: qa.answer, chats: qa.asked || 0, source: 'kb' }))
        .sort((a, b) => b.chats - a.chats);

      const filtered = all.filter(t => t.name.toLowerCase().includes(search));
      if (count) count.textContent = all.length;

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:30px;"><div class="empty-icon" style="font-size:28px;">📋</div><div class="empty-sub">Тем пока нет. Добавьте информацию в базу знаний.</div></div></td></tr>`;
        return;
      }
      tbody.innerHTML = '';
      filtered.forEach(t => {
        const isExpanded = _topicExpanded.has(t.id);
        const hasAnswer = !!t.answer;
        const icon = `<span style="font-size:13px;margin-right:6px;">📚</span>`;
        const countBadge = t.chats > 0
          ? `<span style="background:var(--primary-brd);color:var(--indigo);border-radius:20px;padding:2px 9px;font-size:0.7rem;font-weight:700;">${t.chats}×</span>`
          : `<span style="color:var(--text-dim);font-size:0.72rem;">—</span>`;
        const chevron = hasAnswer
          ? `<span style="color:var(--text-dim);font-size:11px;transition:transform 0.2s;display:inline-block;transform:rotate(${isExpanded ? 90 : 0}deg);">▶</span>`
          : '';

        const menuId = `topic-menu-${t.id}`;
        const menuBtn = `<div style="position:relative;display:inline-block;">
          <span style="color:var(--text-dim);cursor:pointer;font-size:18px;letter-spacing:1px;" onclick="event.stopPropagation();toggleTopicMenu('${menuId}')">···</span>
          <div id="${menuId}" class="topic-dropdown" style="display:none;">
            <button onclick="event.stopPropagation();editKbItem('${t.id}');closeAllTopicMenus()">✏️ Редактировать ответ</button>
            <button onclick="event.stopPropagation();fsDel('kbQA','${t.id}');closeAllTopicMenus()" style="color:var(--red);">🗑 Удалить</button>
          </div>
        </div>`;

        const tr = document.createElement('tr');
        tr.style.cursor = hasAnswer ? 'pointer' : '';
        if (hasAnswer) tr.onclick = () => toggleTopicExpand(t.id);
        tr.innerHTML = `
        <td><div class="td-name" style="gap:6px;">${icon}<span style="flex:1;">${esc(t.name)}</span>${chevron}</div></td>
        <td>${countBadge}</td>
        <td class="td-muted">📚 База знаний</td>
        <td onclick="event.stopPropagation()">${menuBtn}</td>`;
        tbody.appendChild(tr);

        // Expanded answer row
        if (isExpanded && hasAnswer) {
          const expandTr = document.createElement('tr');
          expandTr.innerHTML = `
          <td colspan="4" style="padding:0;">
            <div style="background:var(--bg);border-top:1px solid var(--border);padding:12px 16px 14px 42px;font-size:0.78rem;color:var(--text-sec);line-height:1.6;white-space:pre-wrap;">${esc(t.answer)}
              <div style="margin-top:8px;"><button class="btn-secondary" style="font-size:0.68rem;padding:3px 10px;" onclick="event.stopPropagation();editKbItem('${t.id}')">✏️ Редактировать</button></div>
            </div>
          </td>`;
          tbody.appendChild(expandTr);
        }
      });
    }

    function toggleTopicMenu(id) {
      closeAllTopicMenus();
      const el = document.getElementById(id);
      if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
    function closeAllTopicMenus() {
      document.querySelectorAll('.topic-dropdown').forEach(d => d.style.display = 'none');
    }
    document.addEventListener('click', closeAllTopicMenus);

    function editKbItem(id) {
      const item = STATE.kbQA.find(q => q.id === id);
      if (!item) { showToast('⚠️ Элемент не найден'); return; }
      openEditAnswer(id, item.question || '', item.answer || '', 'kb');
    }

    function removeTopic(id) {
      fsDel('topics', id);
    }

    /* ══ CHATS ══ */
    let _chatViewUnsub = null;
    let _handoffTimerInterval = null;

    function updateHandoffStatus(mode, handoffAtSeconds) {
      const badge = document.getElementById('chat-mode-badge');
      const timerEl = document.getElementById('handoff-timer');
      const resumeBtn = document.getElementById('resume-ai-btn');
      if (!badge) return;

      if (_handoffTimerInterval) { clearInterval(_handoffTimerInterval); _handoffTimerInterval = null; }
      if (timerEl) timerEl.style.display = 'none';

      if (mode === 'human') {
        badge.className = 'mode-badge human';
        badge.textContent = '🧑‍💼 Оператор отвечает';
        if (resumeBtn) resumeBtn.style.display = '';
        const HANDOFF_SEC = 5 * 60;
        const tick = () => {
          const elapsed = Date.now() / 1000 - handoffAtSeconds;
          const remaining = HANDOFF_SEC - elapsed;
          if (remaining <= 0) {
            clearInterval(_handoffTimerInterval); _handoffTimerInterval = null;
            badge.className = 'mode-badge ai'; badge.textContent = '🤖 ИИ отвечает';
            if (timerEl) timerEl.style.display = 'none';
            if (resumeBtn) resumeBtn.style.display = 'none';
            return;
          }
          const m = Math.floor(remaining / 60), s = Math.floor(remaining % 60);
          if (timerEl) { timerEl.style.display = ''; timerEl.textContent = `ИИ вернётся через ${m}:${String(s).padStart(2, '0')}`; }
        };
        tick();
        _handoffTimerInterval = setInterval(tick, 1000);
      } else {
        badge.className = 'mode-badge ai';
        badge.textContent = '🤖 ИИ отвечает';
        if (resumeBtn) resumeBtn.style.display = 'none';
        if (timerEl) timerEl.style.display = 'none';
      }
    }

    async function resumeAI() {
      if (!STATE.selectedChatId || !currentUser) return;
      const btn = document.getElementById('resume-ai-btn');
      if (btn) btn.disabled = true;
      try {
        await db.collection('users').doc(currentUser.uid).collection('chats').doc(STATE.selectedChatId).update({
          mode: 'ai',
          handoffAt: firebase.firestore.FieldValue.delete(),
        });
        updateHandoffStatus('ai', null);
        showToast('🤖 ИИ возобновил общение');
      } catch (e) {
        showToast('⚠️ Ошибка: ' + e.message);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function sendAdminMessage() {
      const input = document.getElementById('admin-reply-input');
      const text = input?.value.trim();
      if (!text || !STATE.selectedChatId || !currentUser) return;

      const chat = STATE.chats.find(c => c.id === STATE.selectedChatId);
      if (!chat?.botId) { showToast('⚠️ Не найден бот для этого чата'); return; }

      input.value = '';
      input.style.height = '';

      try {
        const resp = await fetch('/api/admin-send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.uid, chatId: STATE.selectedChatId, botId: chat.botId, text }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          showToast('⚠️ ' + (err.error || 'Ошибка отправки'));
        }
      } catch (e) {
        showToast('⚠️ Сетевая ошибка');
      }
    }

    function renderChats() {
      const el = document.getElementById('chat-list-panel');
      const countEl = document.getElementById('chats-count');
      if (countEl) countEl.textContent = STATE.chats.length;
      if (!el) return;

      if (STATE.chats.length === 0) {
        el.innerHTML = `<div class="empty-state" style="padding:30px 16px;"><div class="empty-icon" style="font-size:28px;">💬</div><div class="empty-sub" style="font-size:0.72rem;">Сообщений пока нет. Напишите боту в Telegram.</div></div>`;
        return;
      }

      const sorted = [...STATE.chats].sort((a, b) => {
        const ta = a.lastTs?.seconds || 0, tb = b.lastTs?.seconds || 0;
        return tb - ta;
      });

      el.innerHTML = '';
      sorted.forEach(chat => {
        const initial = (chat.name || '?').charAt(0).toUpperCase();
        const ts = chat.lastTs?.seconds;
        const time = ts ? new Date(ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : '';
        const isHuman = (chat.mode || 'ai') === 'human';
        const div = document.createElement('div');
        div.className = 'chat-list-item' + (STATE.selectedChatId === chat.id ? ' active' : '');
        div.onclick = () => openChatView(chat);
        div.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="chat-list-av">${esc(initial)}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
              <div class="chat-list-name">${esc(chat.name || 'Пользователь')}</div>
              <div style="display:flex;align-items:center;gap:4px;">
                ${isHuman ? '<span style="font-size:9px;background:rgba(34,197,94,0.2);color:var(--green);border-radius:20px;padding:1px 5px;font-weight:700;">ОП</span>' : ''}
                <div class="chat-list-time">${time}</div>
              </div>
            </div>
            <div class="chat-list-preview">${esc(chat.lastMessage || '')}</div>
          </div>
        </div>`;
        el.appendChild(div);
      });

      // Refresh mode indicator if selected chat's mode changed
      if (STATE.selectedChatId) {
        const selChat = STATE.chats.find(c => c.id === STATE.selectedChatId);
        if (selChat) updateHandoffStatus(selChat.mode || 'ai', selChat.handoffAt?.seconds || 0);
      }
    }

    function renderChatMessages(messages, chat) {
      const msgsEl = document.getElementById('chat-view-messages');
      if (!msgsEl) return;
      if (messages.length === 0) {
        msgsEl.innerHTML = `<div class="empty-state" style="margin:auto;"><div class="empty-sub">Нет сообщений</div></div>`;
        return;
      }
      const wasAtBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 60;
      msgsEl.innerHTML = '';
      const initial = (chat.name || '?').charAt(0).toUpperCase();
      messages.forEach(msg => {
        const isUser = msg.role === 'user';
        const isAdmin = msg.sentByAdmin === true;
        const cleanContent = (msg.content || '').replace(/\*\*(.+?)\*\*/gs, '$1').replace(/\*(.+?)\*/gs, '$1');
        const wrap = document.createElement('div');
        wrap.style.cssText = `display:flex;align-items:flex-end;gap:8px;${isUser ? 'flex-direction:row-reverse;' : ''}`;
        const av = isUser
          ? `<div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;flex-shrink:0;">${esc(initial)}</div>`
          : isAdmin
            ? `<div style="width:28px;height:28px;border-radius:50%;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🧑‍💼</div>`
            : `<div style="width:28px;height:28px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🤖</div>`;
        const bubbleClass = isUser ? 'msg-bubble-user' : 'msg-bubble-bot';
        const adminLabel = isAdmin ? `<div style="font-size:0.6rem;color:var(--green);margin-bottom:2px;font-weight:700;">Оператор</div>` : '';
        const bubble = `<div style="display:flex;flex-direction:column;max-width:68%;">${adminLabel}<div class="${bubbleClass}">${esc(cleanContent)}</div></div>`;
        wrap.innerHTML = `${av}${bubble}`;
        msgsEl.appendChild(wrap);
      });
      if (wasAtBottom || true) msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function openChatView(chat) {
      STATE.selectedChatId = chat.id;
      renderChats();

      const header = document.getElementById('chat-view-header');
      const nameEl = document.getElementById('chat-view-name');
      const usernameEl = document.getElementById('chat-view-username');
      const msgsEl = document.getElementById('chat-view-messages');
      const replyArea = document.getElementById('admin-reply-area');

      // User card
      nameEl.textContent = chat.name || 'Пользователь';
      const uname = chat.username ? chat.username.replace(/^@/, '') : '';
      usernameEl.textContent = uname ? `@${uname}` : '';
      usernameEl.href = uname ? `https://t.me/${uname}` : '#';
      usernameEl.style.display = uname ? '' : 'none';

      // Avatar
      const avEl = document.getElementById('chat-card-av');
      if (avEl) {
        const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];
        avEl.style.background = colors[(chat.name || '').charCodeAt(0) % colors.length];
        avEl.textContent = (chat.name || '?').charAt(0).toUpperCase();
      }

      // Meta: date + message count
      const dateEl = document.getElementById('chat-card-date');
      if (dateEl) {
        const ts = chat._ts?.seconds || chat.lastTs?.seconds;
        dateEl.textContent = ts ? new Date(ts * 1000).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      }
      const msgsCountEl = document.getElementById('chat-card-msgs');
      if (msgsCountEl) msgsCountEl.textContent = chat.msgCount || 1;

      // Notes
      const notesEl = document.getElementById('chat-notes-input');
      if (notesEl) { notesEl.value = chat.notes || ''; notesEl.style.height = 'auto'; }

      header.style.display = 'block';
      if (replyArea) replyArea.style.display = '';
      msgsEl.innerHTML = `<div style="text-align:center;color:var(--text-dim);font-size:0.75rem;padding:20px;">Загружаю...</div>`;

      // Set initial mode indicator
      updateHandoffStatus(chat.mode || 'ai', chat.handoffAt?.seconds || 0);

      // Unsubscribe from previous chat
      if (_chatViewUnsub) { _chatViewUnsub(); _chatViewUnsub = null; }

      // Real-time listener for this chat's history
      _chatViewUnsub = db.collection('users').doc(currentUser.uid)
        .collection('chatHistory').doc(chat.id)
        .onSnapshot(snap => {
          const messages = snap.exists ? (snap.data().messages || []) : [];
          renderChatMessages(messages, chat);
        }, () => {
          msgsEl.innerHTML = `<div class="empty-state" style="margin:auto;"><div class="empty-sub">Ошибка загрузки</div></div>`;
        });
    }

    function saveNotes(text) {
      if (!STATE.selectedChatId || !currentUser) return;
      col('chats').doc(STATE.selectedChatId).set({ notes: text }, { merge: true }).catch(() => { });
    }

    /* ══ BROADCAST ══ */
    function _broadcastCounts() {
      const bot = STATE.bots.find(b => b.id === STATE.currentBotId);
      if (!bot) return { all: 0, month: 0, week: 0 };
      const now = Date.now();
      const chats = STATE.chats.filter(c => c.botId === bot.id);
      return {
        all: chats.length,
        month: chats.filter(c => (c.lastTs?.seconds || 0) * 1000 >= now - 30 * 864e5).length,
        week: chats.filter(c => (c.lastTs?.seconds || 0) * 1000 >= now - 7 * 864e5).length,
      };
    }

    function updateBroadcastCount() {
      const counts = _broadcastCounts();
      document.getElementById('bc-cnt-all').textContent = counts.all;
      document.getElementById('bc-cnt-month').textContent = counts.month;
      document.getElementById('bc-cnt-week').textContent = counts.week;
      const filter = document.querySelector('input[name="bc-filter"]:checked')?.value || 'all';
      const n = counts[filter] || 0;
      document.getElementById('bc-send-btn').textContent = `Отправить (${n})`;
    }

    function openBroadcastModal() {
      document.getElementById('bc-text').value = '';
      document.getElementById('bc-status').textContent = '';
      document.getElementById('modal-broadcast').classList.add('open');
      updateBroadcastCount();
    }

    function closeBroadcastModal() {
      document.getElementById('modal-broadcast').classList.remove('open');
    }
    document.getElementById('modal-broadcast').addEventListener('click', e => { if (e.target === e.currentTarget) closeBroadcastModal(); });

    async function sendBroadcast() {
      const text = document.getElementById('bc-text').value.trim();
      if (!text) { document.getElementById('bc-status').textContent = '⚠️ Введите текст сообщения'; return; }
      const bot = STATE.bots.find(b => b.id === STATE.currentBotId);
      if (!bot) { document.getElementById('bc-status').textContent = '⚠️ Выберите бота'; return; }
      const filter = document.querySelector('input[name="bc-filter"]:checked')?.value || 'all';

      const btn = document.getElementById('bc-send-btn');
      btn.disabled = true;
      document.getElementById('bc-status').textContent = '⏳ Отправляю...';

      try {
        const resp = await fetch('/api/broadcast-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.uid, botId: bot.id, text, filter }),
        });
        const data = await resp.json();
        if (data.ok) {
          document.getElementById('bc-status').textContent = `✅ Отправлено: ${data.sent}, ошибок: ${data.failed}`;
          btn.disabled = false;
          setTimeout(closeBroadcastModal, 2000);
        } else {
          document.getElementById('bc-status').textContent = '⚠️ ' + (data.error || 'Ошибка');
          btn.disabled = false;
        }
      } catch {
        document.getElementById('bc-status').textContent = '⚠️ Сетевая ошибка';
        btn.disabled = false;
      }
    }

    /* ══ SEARCH ══ */
    function onSearch() {
      const q = document.getElementById('global-search').value.toLowerCase();
      if (STATE.currentTab === 'auto') {
        document.querySelectorAll('.auto-card').forEach(c => {
          const name = c.querySelector('.auto-name')?.textContent?.toLowerCase() || '';
          c.style.display = name.includes(q) || q === '' ? '' : 'none';
        });
      }
    }

    /* ══ AGENT STATUS TOGGLE ══ */
    async function toggleAgentStatus() {
      STATE.agentActive = !STATE.agentActive;
      applyAgentStatus();
      if (currentUser) {
        await db.collection('users').doc(currentUser.uid).collection('settings').doc('agent')
          .set({ active: STATE.agentActive }, { merge: true });
        // Регистрируем или удаляем webhooks для всех ботов
        const botsSnap = await db.collection('users').doc(currentUser.uid).collection('bots').get();
        botsSnap.forEach(doc => {
          const { token } = doc.data();
          if (token) registerTelegramWebhook(currentUser.uid, doc.id, token, !STATE.agentActive);
        });
      }
      showToast(STATE.agentActive ? '✅ Агент активирован' : '⏸ Агент остановлен');
    }

    function applyAgentStatus() {
      const sw = document.getElementById('status-sw');
      const lbl = document.getElementById('status-lbl');
      const chatStatus = document.getElementById('chat-head-status');
      // Also sync overview status toggles
      const ovSw = document.getElementById('ov-status-sw');
      const ovLbl = document.getElementById('ov-status-lbl');
      if (STATE.agentActive) {
        sw?.classList.add('on');
        ovSw?.classList.add('on');
        if (lbl) { lbl.textContent = 'Активен'; lbl.className = 'toggle-text on'; }
        if (ovLbl) { ovLbl.textContent = 'Активен'; ovLbl.className = 'toggle-text on'; }
        if (chatStatus) { chatStatus.textContent = '● онлайн'; chatStatus.style.color = 'var(--green)'; }
      } else {
        sw?.classList.remove('on');
        ovSw?.classList.remove('on');
        if (lbl) { lbl.textContent = 'Неактивен'; lbl.className = 'toggle-text off'; }
        if (ovLbl) { ovLbl.textContent = 'Неактивен'; ovLbl.className = 'toggle-text off'; }
        if (chatStatus) { chatStatus.textContent = '○ остановлен'; chatStatus.style.color = 'var(--text-dim)'; }
      }
    }

    /* ══ RULES ══ */
    function renderRulesScreen() {
      const ta = document.getElementById('rules-ta');
      if (ta) ta.value = STATE.rules;
      const warn = document.getElementById('rules-no-rules-warn');
      if (warn) warn.style.display = STATE.rules.trim() ? 'none' : 'flex';
    }

    async function saveRules() {
      const text = document.getElementById('rules-ta')?.value.trim() || '';
      STATE.rules = text;
      if (currentUser) {
        await db.collection('users').doc(currentUser.uid).collection('settings').doc('rules')
          .set({ text }, { merge: true });
      }
      document.getElementById('rules-no-rules-warn').style.display = text ? 'none' : 'flex';
      showToast('💾 Правила сохранены');
    }

    async function autoGenerateRules() {
      const allKb = [...STATE.kbItems, ...STATE.kbQA];
      if (allKb.length === 0) {
        showToast('⚠️ Сначала добавьте информацию в базу знаний');
        return;
      }

      const btn = document.querySelector('[onclick="autoGenerateRules()"]');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Генерирую...'; }

      // Build KB summary (max 30 items, truncated)
      const kbSummary = allKb.slice(0, 30).map(i => {
        const q = (i.title || i.question || '').slice(0, 100);
        const a = (i.content || i.answer || '').slice(0, 200);
        return `Q: ${q}\nA: ${a}`;
      }).join('\n\n');

      try {
        const resp = await fetch('/api/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: `Проанализируй базу знаний ниже и создай идеальный системный промпт для ИИ-ассистента.

ТРЕБОВАНИЯ К ПРОМПТУ:
1. Определи тематику бизнеса по содержанию базы знаний (ресторан, магазин, обучение и т.д.)
2. Опиши роль бота (кто он, для кого работает)
3. Задай тон общения (дружелюбный, профессиональный и т.д.)
4. Укажи правила: как отвечать на приветствия, на вопросы по теме, на вопросы не по теме
5. Укажи запреты: не придумывать цены/условия, не давать медицинских/юридических советов если не по теме
6. Укажи что делать если нет ответа (предложить связаться с модератором через https://t.me/ваш_линк)
7. Язык: отвечать на языке пользователя

НЕ ПЕРЕЧИСЛЯЙ вопросы из базы знаний! Создай именно ПРАВИЛА ПОВЕДЕНИЯ бота.
Промпт должен быть 10-15 строк, лаконичный и чёткий.

БАЗА ЗНАНИЙ:
${kbSummary}`,
            provider: STATE.aiProvider || 'openai',
            model: STATE.aiModel || 'gpt-4o-mini'
          })
        });
        const data = await resp.json();
        if (data.answer) {
          document.getElementById('rules-ta').value = data.answer;
          showToast('✨ Системный промпт сгенерирован! Проверьте и сохраните.');
        } else {
          showToast('⚠️ Ошибка генерации');
        }
      } catch (e) {
        console.error(e);
        showToast('⚠️ Ошибка: ' + e.message);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✨ Сгенерировать из базы знаний'; }
      }
    }

    /* ══ ANALYTICS ══ */
    function renderAnalytics() {
      const days = STATE.analyticsPeriod;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      // Use chats collection for dialog count (has lastTs, one doc per user)
      const filteredChats = STATE.chats.filter(c => {
        if (!c.lastTs) return true;
        const ts = c.lastTs.toDate ? c.lastTs.toDate() : new Date(c.lastTs.seconds * 1000);
        return ts >= cutoff;
      });

      // Topics from Telegram (each is one user message event)
      const filteredTopics = STATE.topics.filter(t => {
        const rawTs = t._ts || t.ts;
        if (!rawTs) return true;
        const ts = rawTs.toDate ? rawTs.toDate() : new Date(rawTs.seconds * 1000);
        return ts >= cutoff;
      });
      const filteredUnans = STATE.unanswered.filter(u => {
        if (!u._ts) return true;
        const ts = u._ts.toDate ? u._ts.toDate() : new Date(u._ts);
        return ts >= cutoff;
      });

      const totalAI = filteredChats.length;
      const totalUnans = filteredUnans.length;
      const totalDialogs = totalAI + totalUnans;
      const pct = totalDialogs > 0 ? Math.round(totalAI / totalDialogs * 100) : 0;

      const anPct = document.getElementById('an-pct');
      const anAI = document.getElementById('an-ai');
      const anManual = document.getElementById('an-manual');
      const anDialogs = document.getElementById('an-dialogs');
      const anMins = document.getElementById('an-mins');
      const anLeads = document.getElementById('an-leads');

      if (anPct) anPct.textContent = pct + '%';
      if (anAI) anAI.textContent = totalAI;
      if (anManual) anManual.textContent = totalUnans;
      if (anDialogs) anDialogs.textContent = totalDialogs;
      if (anMins) anMins.textContent = Math.round(totalAI * 2.5);
      if (anLeads) anLeads.textContent = Math.round(totalAI * 0.12);

      // Donut chart
      const circle = document.querySelector('#screen-analytics circle:last-child');
      if (circle) {
        const circumference = 2 * Math.PI * 44;
        const offset = circumference * (1 - pct / 100);
        circle.setAttribute('stroke-dashoffset', offset);
      }

      // Unanswered preview
      const unansCount = document.getElementById('an-unans-count');
      if (unansCount) unansCount.textContent = totalUnans > 0 ? `(${totalUnans})` : '';
      const unansPreview = document.getElementById('an-unans-preview');
      if (unansPreview) {
        if (filteredUnans.length === 0) {
          unansPreview.innerHTML = `<div class="q-card" style="grid-column:1/-1;"><div class="empty-state" style="padding:20px;"><div class="empty-sub">Пока нет вопросов без ответа</div></div></div>`;
        } else {
          unansPreview.innerHTML = '';
          filteredUnans.slice(0, 3).forEach(q => {
            const card = document.createElement('div');
            card.className = 'q-card';
            card.innerHTML = `<div class="q-text">${esc(q.text)}</div><div class="q-foot"><span class="q-count">1 запрос</span><button class="btn-sm" onclick="answerUnans('${q.id}','${esc(q.text)}')">+ Добавить</button></div>`;
            unansPreview.appendChild(card);
          });
        }
      }

      // Topics preview
      const topicsCount = document.getElementById('an-topics-count');
      if (topicsCount) topicsCount.textContent = filteredTopics.length > 0 ? `(${filteredTopics.length})` : '';
      const topicsPreview = document.getElementById('an-topics-preview');
      if (topicsPreview) {
        if (filteredTopics.length === 0) {
          topicsPreview.innerHTML = `<div class="q-card" style="grid-column:1/-1;"><div class="empty-state" style="padding:20px;"><div class="empty-sub">Тем пока нет</div></div></div>`;
        } else {
          topicsPreview.innerHTML = '';
          filteredTopics.slice(0, 3).forEach(t => {
            const card = document.createElement('div');
            card.className = 'q-card';
            card.innerHTML = `<div class="q-text">${esc(t.name)}</div><div class="q-foot"><span class="q-count">${t.chats || 1} чат</span><button class="btn-sm">Подробнее</button></div>`;
            topicsPreview.appendChild(card);
          });
        }
      }
    }

    /* ══ FILE UPLOAD ══ */
    function openFileUpload() {
      STATE.pendingFiles = [];
      document.getElementById('file-list').innerHTML = '';
      document.getElementById('modal-file').classList.add('open');
    }

    function closeFileModal() {
      document.getElementById('modal-file').classList.remove('open');
      STATE.pendingFiles = [];
    }

    /* ══ TRANSCRIBE MODAL ══ */
    let _transcribeSourceId = null;

    function openTranscribeModal() {
      _transcribeSourceId = null;
      document.getElementById('tr-url').value = '';
      document.getElementById('tr-error').style.display = 'none';
      document.getElementById('tr-input-wrap').style.display = '';
      document.getElementById('tr-loading-wrap').style.display = 'none';
      document.getElementById('tr-result-wrap').style.display = 'none';
      document.getElementById('tr-footer-input').style.display = '';
      document.getElementById('tr-footer-result').style.display = 'none';
      document.getElementById('modal-transcribe').classList.add('open');
    }

    function closeTranscribeModal() {
      document.getElementById('modal-transcribe').classList.remove('open');
    }

    async function runTranscribe() {
      const url = document.getElementById('tr-url').value.trim();
      if (!url || !currentUser) return;

      document.getElementById('tr-error').style.display = 'none';
      document.getElementById('tr-input-wrap').style.display = 'none';
      document.getElementById('tr-loading-wrap').style.display = '';
      document.getElementById('tr-footer-input').style.display = 'none';

      try {
        const resp = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, uid: currentUser.uid }),
        });
        const data = await resp.json();

        document.getElementById('tr-loading-wrap').style.display = 'none';

        if (!resp.ok || !data.ok) {
          document.getElementById('tr-input-wrap').style.display = '';
          document.getElementById('tr-footer-input').style.display = '';
          document.getElementById('tr-error').style.display = '';
          document.getElementById('tr-error').textContent = data.error || 'Ошибка транскрибации';
          return;
        }

        _transcribeSourceId = data.sourceId;
        document.getElementById('tr-title').textContent = data.title;
        document.getElementById('tr-chars').textContent = `${data.chars.toLocaleString()} символов транскрипции`;
        document.getElementById('tr-preview').textContent = data.preview + (data.chars > 500 ? '…' : '');
        document.getElementById('tr-result-wrap').style.display = '';
        document.getElementById('tr-footer-result').style.display = '';
        showToast('✅ Транскрипция готова!');
      } catch (e) {
        document.getElementById('tr-loading-wrap').style.display = 'none';
        document.getElementById('tr-input-wrap').style.display = '';
        document.getElementById('tr-footer-input').style.display = '';
        document.getElementById('tr-error').style.display = '';
        document.getElementById('tr-error').textContent = 'Сетевая ошибка. Попробуйте ещё раз.';
      }
    }

    async function addTranscriptToKb() {
      if (!_transcribeSourceId || !currentUser) return;
      const btn = document.querySelector('#tr-footer-result .btn-modal-ok');
      btn.disabled = true; btn.textContent = 'Запускаю обработку...';

      try {
        const jobRef = await col('jobs').add({
          sourceId: _transcribeSourceId,
          status: 'queued', step: 'parse', progress: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await startKnowledgeProcessing(_transcribeSourceId, jobRef.id);
        closeTranscribeModal();
        showToast('🚀 Обработка запущена!');
      } catch (e) {
        btn.disabled = false; btn.textContent = '➕ Добавить в базу знаний';
        showToast('⚠️ Ошибка запуска обработки');
      }
    }

    document.getElementById('modal-transcribe').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeTranscribeModal();
    });
    document.getElementById('tr-url').addEventListener('keydown', e => {
      if (e.key === 'Enter') runTranscribe();
    });

    document.getElementById('modal-file').addEventListener('click', e => { if (e.target === e.currentTarget) closeFileModal(); });

    const dz = document.getElementById('drop-zone');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag-over'); handleFileDrop(e); });

    function handleFileSelect(e) { addFiles(Array.from(e.target.files)); e.target.value = ''; }
    function handleFileDrop(e) { addFiles(Array.from(e.dataTransfer.files)); }

    function addFiles(files) {
      const allowed = ['.pdf', '.docx', '.txt', '.md', '.csv'];
      for (const f of files) {
        if (STATE.pendingFiles.length >= 3) { showToast('⚠️ Максимум 3 файла за раз'); break; }
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        if (!allowed.includes(ext)) { showToast(`⚠️ Формат ${ext} не поддерживается. PDF, DOCX, TXT, MD, CSV`); continue; }
        if (!STATE.pendingFiles.find(pf => pf.name === f.name)) STATE.pendingFiles.push(f);
      }
      renderFileList();
    }

    async function extractTextFromFile(file) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (ext === '.pdf') {
        return extractPDF(file);
      } else if (ext === '.docx') {
        return extractDOCX(file);
      } else {
        return file.text();
      }
    }

    async function extractPDF(file) {
      if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js не загружен');
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n';
      }
      return text.trim();
    }

    async function extractDOCX(file) {
      if (typeof mammoth === 'undefined') throw new Error('Mammoth.js не загружен');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value.trim();
    }

    function renderFileList() {
      const list = document.getElementById('file-list');
      list.innerHTML = '';
      STATE.pendingFiles.forEach((f, i) => {
        const size = f.size < 1024 ? f.size + ' B' : Math.round(f.size / 1024) + ' KB';
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `<span>📄</span><span class="file-item-name">${esc(f.name)}</span><span class="file-item-size">${size}</span><button class="file-item-rm" onclick="removeFile(${i})">✕</button>`;
        list.appendChild(item);
      });
    }

    function removeFile(i) { STATE.pendingFiles.splice(i, 1); renderFileList(); }

    async function uploadFiles() {
      if (STATE.pendingFiles.length === 0) { showToast('⚠️ Выберите файлы'); return; }
      for (const f of STATE.pendingFiles) {
        let rawText;
        try {
          rawText = await extractTextFromFile(f);
        } catch (e) {
          showToast(`⚠️ Не удалось прочитать ${f.name}: ${e.message}`);
          continue;
        }
        if (!rawText || rawText.length < 10) { showToast(`⚠️ Файл ${f.name} пустой или нечитаемый`); continue; }
        const title = f.name.replace(/\.[^.]+$/, '');
        // Create source document
        const sourceRef = await col('kbSources').add({
          title, rawText, type: 'file', fileName: f.name, status: 'queued',
          _ts: firebase.firestore.FieldValue.serverTimestamp(),
        });
        // Create job document
        const jobRef = await col('jobs').add({
          sourceId: sourceRef.id, type: 'knowledge_ingest',
          status: 'queued', step: 'parse', progress: 0,
          _ts: firebase.firestore.FieldValue.serverTimestamp(),
        });
        // Fire-and-forget processing
        startKnowledgeProcessing(sourceRef.id, jobRef.id);
      }
      if (!STATE.rules.trim()) { autoGenerateRules(); await saveRules(); }
      showToast(`⏳ Обрабатываю ${STATE.pendingFiles.length} файл(а)… Следите за прогрессом в базе знаний`);
      closeFileModal();
    }

    async function startKnowledgeProcessing(sourceId, jobId) {
      try {
        await fetch('/api/process-knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.uid, jobId, sourceId }),
        });
      } catch (e) { console.warn('processKnowledge error:', e); }
    }

    async function cancelJob(jobId, sourceId) {
      if (!currentUser) return;
      const uid = currentUser.uid;
      await col('jobs').doc(jobId).set({ status: 'cancelled', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      if (sourceId) await col('kbSources').doc(sourceId).set({ status: 'cancelled' }, { merge: true });
      showToast('⛔ Загрузка отменена');
    }

    /* ══ AI SETTINGS (multi-provider) ══ */
    const PROVIDERS = ['openai', 'gemini', 'claude'];

    function toggleVis(id) {
      const inp = document.getElementById(id);
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
    }

    function toggleProviderEnabled(p) {
      if (!STATE.aiProviders) STATE.aiProviders = {};
      const cur = STATE.aiProviders[p]?.enabled || false;
      if (!STATE.aiProviders[p]) STATE.aiProviders[p] = {};
      STATE.aiProviders[p].enabled = !cur;
      applyProviderUI(p);
    }

    function applyProviderUI(p) {
      const enabled = STATE.aiProviders?.[p]?.enabled || false;
      const sw = document.getElementById(p + '-sw');
      const lbl = document.getElementById(p + '-lbl');
      const fields = document.getElementById(p + '-fields');
      if (sw) { sw.classList.toggle('on', enabled); }
      if (lbl) { lbl.textContent = enabled ? 'Вкл' : 'Выкл'; lbl.className = 'toggle-text ' + (enabled ? 'on' : 'off'); }
      if (fields) fields.style.display = enabled ? 'block' : 'none';
    }

    async function testProvider(p) {
      const key = document.getElementById(p + '-key')?.value.trim();
      const span = document.getElementById(p + '-test');
      if (!key) { if (span) span.textContent = '⚠️ Введите ключ'; return; }
      if (span) span.textContent = '⏳...';
      try {
        if (p === 'openai') {
          const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + key } });
          span.textContent = r.ok ? '✅ Подключён' : '❌ Неверный ключ';
          span.style.color = r.ok ? 'var(--green)' : 'var(--red)';
        } else if (p === 'gemini') {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          span.textContent = r.ok ? '✅ Подключён' : '❌ Неверный ключ';
          span.style.color = r.ok ? 'var(--green)' : 'var(--red)';
        } else {
          span.textContent = '⚠️ Проверка при запуске бота';
          span.style.color = 'var(--yellow)';
        }
      } catch (e) { span.textContent = '❌ Ошибка'; span.style.color = 'var(--red)'; }
    }

    async function saveAllProviders() {
      if (!currentUser) return;
      if (!STATE.aiProviders) STATE.aiProviders = {};
      PROVIDERS.forEach(p => {
        if (!STATE.aiProviders[p]) STATE.aiProviders[p] = {};
        STATE.aiProviders[p].model = document.getElementById(p + '-model')?.value || '';
      });
      await db.collection('users').doc(currentUser.uid).collection('settings').doc('ai')
        .set({ providers: STATE.aiProviders }, { merge: true });
      showToast('✅ Настройки сохранены');
      renderLaunchConfig();
    }

    // ── Plan helpers ────────────────────────────────────────────────────────────
    const PLAN_LIMITS = { trial: 2000, starter: 5000, pro: 20000, business: 100000 };
    const PLAN_LABELS = { trial: 'Trial (бесплатно)', starter: 'Starter', pro: 'Pro', business: 'Business' };

    function getPlanMonthlyLimit(plan) {
      if (!plan) return 0;
      return plan.monthlyLimit || PLAN_LIMITS[plan.type] || 0;
    }

    function isPlanActive(plan) {
      if (!plan) return false;
      const now = Date.now();
      if (plan.type === 'trial') {
        const te = plan.trialEnds?.seconds ? plan.trialEnds.seconds * 1000 : (plan.trialEnds?.toMillis?.() || 0);
        return te > now;
      }
      if (plan.type === 'starter' || plan.type === 'pro' || plan.type === 'business' || plan.type === 'premium') {
        const pu = plan.paidUntil?.seconds ? plan.paidUntil.seconds * 1000 : (plan.paidUntil?.toMillis?.() || 0);
        return pu > now;
      }
      return false;
    }

    function getMonthUsage() {
      const now = new Date();
      const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      return STATE.aiUsage.filter(e => {
        const ts = e.createdAt?.seconds
          ? e.createdAt.seconds * 1000
          : (e.createdAt?.toMillis ? e.createdAt.toMillis() : 0);
        const d = new Date(ts);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length;
    }

    function renderTariff() {
      const plan = STATE.plan;
      const active = isPlanActive(plan);
      const limit = getPlanMonthlyLimit(plan);
      const used = getMonthUsage();
      const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
      const remaining = Math.max(0, limit - used);

      // Plan name & desc
      const typeName = plan ? (PLAN_LABELS[plan.type] || plan.type) : '—';
      const el = id => document.getElementById(id);
      if (el('plan-name-lbl')) el('plan-name-lbl').textContent = typeName;

      if (el('plan-desc-lbl')) {
        if (!plan) {
          el('plan-desc-lbl').textContent = 'Загрузка...';
        } else if (plan.type === 'trial') {
          const te = plan.trialEnds?.seconds ? new Date(plan.trialEnds.seconds * 1000) : null;
          const daysLeft = te ? Math.max(0, Math.ceil((te - Date.now()) / 86400000)) : 0;
          el('plan-desc-lbl').textContent = active
            ? `14 дней бесплатно · осталось ${daysLeft} дн.`
            : 'Пробный период завершён';
        } else {
          el('plan-desc-lbl').textContent = `${limit.toLocaleString()} AI-запросов в месяц`;
        }
      }

      // Status badge
      if (el('plan-status-badge')) {
        el('plan-status-badge').textContent = active ? 'Активен' : 'Истёк';
        el('plan-status-badge').style.color = active ? 'var(--indigo)' : '#ef4444';
        el('plan-status-badge').style.borderColor = active ? 'var(--primary-brd)' : '#ef444440';
      }

      // Usage bar
      if (el('ai-count-used')) el('ai-count-used').textContent = used.toLocaleString('ru');
      if (el('ai-count-limit')) el('ai-count-limit').textContent = limit.toLocaleString('ru');
      if (el('ai-usage-bar')) el('ai-usage-bar').style.width = pct + '%';

      // Sidebar counter
      if (el('ai-count')) el('ai-count').textContent = remaining.toLocaleString('ru');
      if (el('ai-bar')) el('ai-bar').style.width = Math.min(pct, 100) + '%';
    }

    async function initUserPlan(uid) {
      const planRef = db.collection('users').doc(uid).collection('settings').doc('plan');
      try {
        const snap = await planRef.get();
        if (!snap.exists) {
          // First login — create 14-day Pro trial
          const trialEnds = new firebase.firestore.Timestamp(
            Math.floor(Date.now() / 1000) + 14 * 24 * 3600, 0
          );
          const newPlan = {
            type: 'trial',
            trialEnds,
            monthlyLimit: 2000,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          };
          await planRef.set(newPlan);
          STATE.plan = { type: 'trial', trialEnds, monthlyLimit: 2000 };
        } else {
          STATE.plan = snap.data();
        }
      } catch (e) {
        console.warn('Plan load failed:', e);
      }
      renderTariff();
      // Re-render when aiUsage updates (usage counter changes)
      const origListen = STATE._aiUsageRenderHook;
      STATE._aiUsageRenderHook = true;
    }

    function loadAiSettings() {
      if (!currentUser) return;
      db.collection('users').doc(currentUser.uid).collection('settings').doc('ai').get().then(d => {
        let providers = {};
        if (!d.exists) {
          // If no settings exist (new user), set default OpenAI gpt-4o-mini and save to DB
          providers = {
            'openai': { enabled: true, model: 'gpt-4o-mini' }
          };
          db.collection('users').doc(currentUser.uid).collection('settings').doc('ai').set({ providers }, { merge: true });
        } else {
          providers = d.data().providers || {};
        }

        STATE.aiProviders = providers;
        PROVIDERS.forEach(p => {
          const cfg = STATE.aiProviders[p] || {};
          applyProviderUI(p);
          const modelEl = document.getElementById(p + '-model');
          if (modelEl && cfg.model) modelEl.value = cfg.model;
        });
        renderLaunchConfig();
      });
    }

    // совместимость со старым кодом
    function selectProvider(p) { /* no-op: use applyProviderUI instead */ }
    function toggleKeyVisibility() { toggleVis('openai-key'); }

    /* ── Tariff billing toggle ── */
    const TARIFF_PRICES = {
      starter: { year: { price: '$15', old: '$19', note: 'при оплате за год' }, month: { price: '$19', old: '', note: 'при оплате помесячно' } },
      pro: { year: { price: '$39', old: '$49', note: 'при оплате за год' }, month: { price: '$49', old: '', note: 'при оплате помесячно' } },
      business: { year: { price: '$119', old: '$149', note: 'при оплате за год' }, month: { price: '$149', old: '', note: 'при оплате помесячно' } },
    };
    function setTariffBilling(val) {
      document.getElementById('tbtn-year')?.classList.toggle('active', val === 'year');
      document.getElementById('tbtn-month')?.classList.toggle('active', val === 'month');
      ['starter', 'pro', 'business'].forEach(key => {
        const p = TARIFF_PRICES[key][val];
        const priceEl = document.getElementById(`${key}-price-t`);
        if (priceEl) {
          priceEl.innerHTML = `${p.price} <span style="font-size:0.8rem;font-weight:400;opacity:0.7;">/ в месяц</span>`;
          const oldEl = document.getElementById(`${key}-old-t`);
          const noteEl = document.getElementById(`${key}-note-t`);
          if (oldEl) oldEl.textContent = p.old;
          if (noteEl) noteEl.textContent = p.note;
        }
      });
    }

    /* ══ LAUNCH SCREEN ══ */
    function renderLaunchScreen() {
      const uid = currentUser?.uid || '—';
      const el = document.getElementById('launch-uid');
      if (el) el.textContent = uid;
      renderWebhookBots();
      renderLaunchConfig();
    }

    function renderLaunchConfig() {
      const el = document.getElementById('launch-config');
      if (!el) return;
      const botCount = STATE.bots.length;
      const kbCount = STATE.kbItems.length;
      const hasRules = STATE.rules.trim() ? '✅ Заданы' : '⚠️ Не заданы';
      const status = STATE.agentActive ? '✅ Активен' : '⏸ Неактивен';
      const pCfg = STATE.aiProviders || {};
      const providerRows = ['openai', 'gemini', 'claude'].map(p => {
        const cfg = pCfg[p] || {};
        const ico = p === 'openai' ? '🟢' : p === 'gemini' ? '🔵' : '🟠';
        const name = p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : 'Claude';
        const on = cfg.enabled ? '<span style="color:var(--green);">✅ Вкл</span>' : '<span style="color:var(--text-dim);">⭕ Выкл</span>';
        const model = cfg.model ? `<span style="color:var(--text-dim);font-size:0.7rem;">${cfg.model}</span>` : '';
        return `<div style="display:flex;justify-content:space-between;font-size:0.78rem;">${ico} ${name}<span style="display:flex;gap:10px;align-items:center;">${model}${on}</span></div>`;
      }).join('');

      el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;">
          <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Ботов</div>
          <div style="font-size:1.2rem;font-weight:800;color:var(--cyan);">${botCount}</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;">
          <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Записей в KB</div>
          <div style="font-size:1.2rem;font-weight:800;color:var(--green);">${kbCount}</div>
        </div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:7px;">
        ${providerRows}
        <div style="border-top:1px solid var(--border2);padding-top:6px;display:flex;justify-content:space-between;font-size:0.78rem;"><span>Правила общения</span><b>${hasRules}</b></div>
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;"><span>Статус агента</span><b>${status}</b></div>
      </div>`;
    }

    function copyUID() {
      const uid = currentUser?.uid || '';
      navigator.clipboard.writeText(uid).then(() => showToast('✅ UID скопирован'));
    }

    function copyRunCmd() {
      const cmd = document.getElementById('run-cmd')?.textContent || '';
      navigator.clipboard.writeText(cmd).then(() => showToast('✅ Команда скопирована'));
    }

    function copyText(text) {
      navigator.clipboard.writeText(text).then(() => showToast('✅ Скопировано: ' + text));
    }

    /* ══ TOAST ══ */
    let toastTimer = null;
    /* ── Paste helper (for Telegram WebView where long-press doesn't work) ── */
    async function pasteToInput(inputId) {
      const input = document.getElementById(inputId);
      if (!input) return;
      try {
        const text = await navigator.clipboard.readText();
        input.value = text;
        input.focus();
        input.dispatchEvent(new Event('input'));
        showToast('📋 Вставлено');
      } catch (e) {
        // Fallback: prompt user to paste manually
        input.focus();
        document.execCommand('paste');
      }
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
    }

    /* ══ CONFIRM MODAL ══ */
    let _confirmCallback = null;

    function showConfirm({ title, desc, action = 'Подтвердить', cancel = 'Отмена', icon = '', danger = false, onOk }) {
      _confirmCallback = onOk || null;
      const iconEl = document.getElementById('modal-confirm-icon');
      const titleEl = document.getElementById('modal-confirm-title');
      const descEl = document.getElementById('modal-confirm-desc');
      const okBtn = document.getElementById('modal-confirm-ok-btn');
      const cancelBtn = document.getElementById('modal-confirm-cancel-btn');
      if (iconEl) iconEl.textContent = icon;
      if (iconEl) iconEl.style.display = icon ? '' : 'none';
      if (titleEl) titleEl.textContent = title;
      if (descEl) descEl.textContent = desc;
      if (okBtn) {
        okBtn.textContent = action;
        okBtn.style.background = danger ? 'var(--red)' : 'var(--primary)';
      }
      if (cancelBtn) cancelBtn.textContent = cancel;
      document.getElementById('modal-confirm')?.classList.add('open');
      // Keyboard: Esc closes
      document.addEventListener('keydown', _confirmEscHandler);
    }

    function _confirmCancel() {
      _confirmCallback = null;
      document.getElementById('modal-confirm')?.classList.remove('open');
      document.removeEventListener('keydown', _confirmEscHandler);
    }

    function _confirmOk() {
      const cb = _confirmCallback;
      _confirmCancel();
      if (cb) cb();
    }

    function _confirmEscHandler(e) {
      if (e.key === 'Escape') _confirmCancel();
    }

    /* ══ UTILS ══ */
    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ══ AUTH FUNCTIONS ══ */
    let authMode = 'login';

    function setAuthTab(mode, el) {
      authMode = mode;
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('auth-name-wrap').style.display = mode === 'register' ? 'block' : 'none';
      document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт';
      document.getElementById('auth-error').classList.remove('show');
    }

    function showAuthError(msg) {
      const el = document.getElementById('auth-error');
      el.textContent = msg;
      el.classList.add('show');
    }

    async function authSubmit() {
      const email = document.getElementById('auth-email').value.trim();
      const pass = document.getElementById('auth-password').value;
      if (!email || !pass) { showAuthError('Заполните email и пароль'); return; }
      try {
        if (authMode === 'login') {
          await auth.signInWithEmailAndPassword(email, pass);
        } else {
          const name = document.getElementById('auth-name').value.trim();
          const cred = await auth.createUserWithEmailAndPassword(email, pass);
          if (name) await cred.user.updateProfile({ displayName: name });
        }
      } catch (e) {
        const msgs = {
          'auth/user-not-found': 'Пользователь не найден',
          'auth/wrong-password': 'Неверный пароль',
          'auth/email-already-in-use': 'Email уже используется',
          'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов)',
          'auth/invalid-email': 'Неверный формат email',
          'auth/invalid-credential': 'Неверный email или пароль',
        };
        showAuthError(msgs[e.code] || e.message);
      }
    }

    async function signInGoogle() {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await auth.signInWithPopup(provider);
      } catch (e) {
        // If popup blocked or storage unavailable — fall back to redirect
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' ||
          e.message?.includes('sessionStorage') || e.message?.includes('storage')) {
          try { await auth.signInWithRedirect(provider); } catch (e2) { showAuthError(e2.message); }
        } else if (e.code !== 'auth/cancelled-popup-request') {
          showAuthError('Ошибка входа через Google: ' + e.message);
        }
      }
    }

    async function signOut() {
      showConfirm({
        icon: '🚪',
        title: 'Выйти из аккаунта?',
        desc: 'Вы будете перенаправлены на страницу входа.',
        action: 'Выйти',
        onOk: async () => {
          stopListeners();
          await auth.signOut();
        },
      });
    }

    function onUserLogin(user) {
      currentUser = user;
      document.getElementById('auth-overlay').classList.add('hidden');
      document.getElementById('auth-overlay').classList.remove('has-landing');
      document.getElementById('auth-spinner-wrap').style.display = 'none';
      document.getElementById('auth-box').style.display = 'none';
      const lp = document.getElementById('landing-page');
      if (lp) lp.style.display = 'none';
      document.getElementById('user-pill').style.display = 'flex';
      const initial = (user.displayName || user.email || '?').charAt(0).toUpperCase();
      document.getElementById('user-av').textContent = initial;
      document.getElementById('user-email-lbl').textContent = user.displayName || user.email;
      const avName = document.getElementById('av-dd-name');
      const avEmail = document.getElementById('av-dd-email');
      if (avName) avName.textContent = user.displayName || user.email || '—';
      if (avEmail) avEmail.textContent = user.email || '';
      // Detect platform
      const isTg = !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
      const ua = navigator.userAgent || '';
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
      const platform = isTg ? 'telegram' : (isMobile ? 'mobile' : 'desktop');

      // Extract Telegram username if available
      const tgUser = window._tgUser || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user) || {};
      const tgUsername = tgUser.username || '';

      // Write user-level doc for super-admin discoverability
      db.collection('users').doc(user.uid).set({
        email: user.email || '',
        displayName: user.displayName || '',
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        platform: platform,
        userAgent: ua.substring(0, 200),
        ...(tgUsername && { tgUsername })
      }, { merge: true }).catch(() => { });

      // Check if TG user needs phone verification
      if (isTg) {
        db.collection('users').doc(user.uid).get().then(doc => {
          if (!doc.exists || !doc.data().phone) {
            document.getElementById('modal-phone-verify').classList.add('open');
          }
        });
      }

      window.saveTgPhone = async function () {
        const input = document.getElementById('tg-phone-input');
        const phone = input.value.trim();
        if (phone.length < 9) {
          showToast('❌ Пожалуйста, введите корректный номер');
          input.focus();
          return;
        }
        try {
          await db.collection('users').doc(currentUser.uid).set({ phone }, { merge: true });
          document.getElementById('modal-phone-verify').classList.remove('open');
          showToast('✅ Номер подтверждён. Спасибо!');
        } catch (e) {
          showToast('❌ Ошибка сохранения: ' + e.message);
        }
      };

      // Launch Chat Onboarding if needed
      db.collection('users').doc(user.uid).collection('bots').get().then(botsSnap => {
        initChatOnboarding(user.uid, botsSnap.size);
      }).catch(() => {
        initChatOnboarding(user.uid, 0);
      });

      db.collection('users').doc(user.uid).collection('settings').doc('agent').get().then(d => {
        if (d.exists) { STATE.agentActive = d.data().active !== false; applyAgentStatus(); }
      });
      db.collection('users').doc(user.uid).collection('settings').doc('rules').get().then(d => {
        if (d.exists) { STATE.rules = d.data().text || ''; renderRulesScreen(); }
      });
      loadAiSettings();

      // Init plan (creates 14-day trial for new users)
      initUserPlan(user.uid);

      // Load user language preference
      db.collection('users').doc(user.uid).collection('settings').doc('profile').get().then(snap => {
        if (snap.exists && snap.data().lang) {
          LANG = snap.data().lang;
          localStorage.setItem('ui_lang', LANG);
          applyLang(LANG);
        }
      });

      // Load auto-reply rules and notification settings
      db.doc(`users/${user.uid}/settings/autoReplies`).get().then(snap => {
        STATE.autoReplies = snap.exists ? (snap.data().rules || []) : [];
        renderAutoReplies();
      });
      loadNotifSettings();

      // Start Firestore real-time listeners
      listen('bots', data => {
        STATE.bots = data;
        // Auto-select first bot if none set
        if (data.length > 0 && !STATE.currentBotId) {
          STATE.currentBotId = data[0].id;
        }
        try { renderBots(); } catch (e) { console.error('renderBots:', e); }
        renderBotNavList();
        updateBotContextNav();
        // Fetch bot photos in background and re-render when ready
        data.forEach(bot => {
          if (STATE.botPhotos[bot.id] === undefined) {
            fetchBotPhoto(bot).then(url => {
              if (url) { renderBotNavList(); renderBotOverview(); }
            });
          }
        });
        // If on home screen and bots exist, navigate to bot overview
        if (STATE.currentAgentScreen === 'home' && data.length > 0) {
          goAgentScreen('bot-overview');
        }
        // Show wizard for new users after bots loaded
        setTimeout(checkOnboarding, 800);
      });
      listen('kbItems', data => { STATE.kbItems = data; renderKb(); renderAnalytics(); });
      listen('kbQA', data => { STATE.kbQA = data; renderKb(); renderSuggestions(); renderAnalytics(); renderTopics(); });
      listen('jobs', data => { STATE.kbJobs = data; renderKb(); renderJobsInline(); });
      listen('kbSources', data => { STATE.kbSources = data; renderKb(); });
      listen('unanswered', data => { STATE.unanswered = data; renderUnanswered(); renderAnalytics(); });
      listen('topics', data => { STATE.topics = data; renderTopics(); renderAnalytics(); });
      listenChats(data => { STATE.chats = data; renderChats(); });
      listen('aiUsage', data => { STATE.aiUsage = data; renderTariff(); if (STATE.currentAgentScreen === 'ai-usage') renderAiUsage(); });

      // Restore last visited screen
      const lastScreen = localStorage.getItem('lastScreen');
      if (lastScreen && lastScreen.startsWith('agent:')) {
        goAgentScreen(lastScreen.replace('agent:', ''));
      } else {
        goAgentScreen('home');
      }
    }

    function onUserLogout() {
      currentUser = null;
      STATE.bots = []; STATE.kbItems = []; STATE.unanswered = []; STATE.topics = [];
      document.getElementById('auth-overlay').classList.remove('hidden');
      document.getElementById('user-pill').style.display = 'none';
      // In Telegram Mini App: keep spinner visible while auto-auth is in progress
      if (typeof _isTelegramApp !== 'undefined' && _isTelegramApp) {
        // Don't show email/Google form — auto-auth is still running
      } else {
        document.getElementById('auth-spinner-wrap').style.display = 'none';
        document.getElementById('auth-box').style.display = 'block';
        // Show landing page for browser users
        document.getElementById('landing-page').style.display = 'block';
        document.getElementById('auth-overlay').classList.add('has-landing');
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
        }, { threshold: 0.15 });
        document.querySelectorAll('.lp-reveal').forEach(el => observer.observe(el));
      }
      renderBots(); renderKb(); renderUnanswered(); renderTopics();
    }

    /* ══ INIT ══ */
    applyTheme();
    document.getElementById('bot-first-time').textContent = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

    // Handle Google redirect result (Safari / popup-blocked fallback)
    auth.getRedirectResult().catch(() => { });

    // ── Telegram Mini App auto-auth ──────────────────────────────────────────
    const _twa = window.Telegram?.WebApp;
    const _isTelegramApp = !!_twa?.initData;

    function _showTgError() {
      document.getElementById('auth-spinner-wrap').style.display = 'none';
      document.getElementById('auth-tg-error').style.display = 'block';
    }
    function _showLoginForm() {
      document.getElementById('auth-spinner-wrap').style.display = 'none';
      document.getElementById('auth-box').style.display = 'block';
      // Show landing page in browser (not Telegram)
      if (!_isTelegramApp) {
        document.getElementById('landing-page').style.display = 'block';
        document.getElementById('auth-overlay').classList.add('has-landing');
        // Scroll reveal for sections
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
        }, { threshold: 0.15 });
        document.querySelectorAll('.lp-reveal').forEach(el => observer.observe(el));
      }
    }

    if (_isTelegramApp) {
      _twa.expand();
      _twa.ready();
      // Show "Входим через Telegram..." status
      document.getElementById('auth-tg-status').textContent = 'Входим через Telegram…';
      fetch('/api/telegram-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: _twa.initData })
      })
        .then(r => r.json())
        .then(d => { if (d.ok) auth.signInWithCustomToken(d.token); else _showTgError(); })
        .catch(() => _showTgError());
    }

    // Fallback: show login form (or Telegram error) if auth doesn't resolve in time
    let _authResolved = false;
    setTimeout(() => {
      if (!_authResolved) {
        if (_isTelegramApp) _showTgError(); else _showLoginForm();
      }
    }, _isTelegramApp ? 15000 : 3000);

    auth.onAuthStateChanged(user => {
      _authResolved = true;
      authReady = true;
      if (user) {
        resolvedUid = user.uid;
        onUserLogin(user);
      } else {
        resolvedUid = null;
        onUserLogout(); // onUserLogout handles Telegram context internally
      }
    });

    /* ══ AVATAR DROPDOWN ══ */
    function toggleAvDropdown(e) {
      e.stopPropagation();
      document.getElementById('av-dropdown').classList.toggle('open');
    }
    function closeAvDropdown() {
      document.getElementById('av-dropdown').classList.remove('open');
    }
    document.addEventListener('click', () => closeAvDropdown());

    /* ══ SETTINGS ══ */
    const SETTINGS_SECTIONS = {
      account: 'ss-account',
      general: 'ss-general',
      billing: 'ss-billing',
      limits: 'ss-limits',
      bonuses: 'ss-bonuses',
      notifications: 'ss-notifications',
      partner: 'ss-partner-main',
      'partner-main': 'ss-partner-main',
      'partner-clients': 'ss-partner-clients',
    };
    const SETTINGS_NAV_MAP = {
      account: 'snav-account',
      general: 'snav-general',
      billing: 'snav-billing',
      limits: 'snav-limits',
      bonuses: 'snav-bonuses',
      notifications: 'snav-notifications',
      partner: 'snav-partner',
      'partner-clients': 'snav-partner-clients',
    };

    let _currentSettingsSection = 'account';

    function openSettings(section) {
      document.getElementById('settings-overlay').classList.add('open');
      goSettings(section || 'account');
      renderSettingsData();
      loadCard();
      loadActiveBonuses();
      loadNotifSettings();
    }

    function closeSettings() {
      document.getElementById('settings-overlay').classList.remove('open');
    }

    function goSettings(section) {
      _currentSettingsSection = section;
      // Hide all sections
      Object.values(SETTINGS_SECTIONS).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
      });
      // Show selected
      const targetId = SETTINGS_SECTIONS[section];
      if (targetId) document.getElementById(targetId)?.classList.add('active');
      // Update nav
      Object.values(SETTINGS_NAV_MAP).forEach(id => {
        document.getElementById(id)?.classList.remove('active');
      });
      const navId = SETTINGS_NAV_MAP[section];
      if (navId) document.getElementById(navId)?.classList.add('active');
      // Partner sub-items expand
      const isPartner = section === 'partner' || section === 'partner-clients';
      document.getElementById('snav-partner')?.classList.toggle('active', isPartner);
    }

    function renderSettingsData() {
      if (!currentUser) return;
      const plan = STATE.plan;
      const used = getMonthUsage();
      const limit = getPlanMonthlyLimit(plan);
      const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
      const active = isPlanActive(plan);
      const typeName = plan ? (PLAN_LABELS[plan.type] || plan.type) : '—';

      // Account section
      const initial = (currentUser.displayName || currentUser.email || '?').charAt(0).toUpperCase();
      const el = id => document.getElementById(id);
      if (el('s-av-big')) el('s-av-big').textContent = initial;
      if (el('s-profile-name')) el('s-profile-name').textContent = currentUser.displayName || '—';
      if (el('s-profile-email')) el('s-profile-email').textContent = currentUser.email || '—';
      if (el('s-plan-badge')) el('s-plan-badge').textContent = typeName + (active ? ' · Активен' : ' · Истёк');
      if (el('s-plan-name')) el('s-plan-name').textContent = typeName;
      if (el('s-plan-info')) {
        if (plan?.type === 'trial') {
          const te = plan.trialEnds?.seconds ? new Date(plan.trialEnds.seconds * 1000) : null;
          const days = te ? Math.max(0, Math.ceil((te - Date.now()) / 86400000)) : 0;
          el('s-plan-info').textContent = active ? `Триал · осталось ${days} дн.` : 'Пробный период завершён';
        } else {
          el('s-plan-info').textContent = active ? `Активна до следующего платёжа` : 'Подписка неактивна';
        }
      }
      if (el('s-used')) el('s-used').textContent = used.toLocaleString('ru');
      if (el('s-limit')) el('s-limit').textContent = limit.toLocaleString('ru');
      if (el('s-prog')) el('s-prog').style.width = pct + '%';

      // Billing section
      if (el('sb-plan-name')) el('sb-plan-name').textContent = typeName;
      if (el('sb-plan-desc')) {
        if (plan?.type === 'trial') {
          const te = plan.trialEnds?.seconds ? new Date(plan.trialEnds.seconds * 1000) : null;
          const days = te ? Math.max(0, Math.ceil((te - Date.now()) / 86400000)) : 0;
          el('sb-plan-desc').textContent = active ? `14 дней бесплатно · осталось ${days} дн.` : 'Пробный период завершён';
        } else {
          el('sb-plan-desc').textContent = active ? `${limit.toLocaleString()} запросов / мес` : 'Неактивна';
        }
      }
      if (el('sb-used')) el('sb-used').textContent = used.toLocaleString('ru');
      if (el('sb-limit')) el('sb-limit').textContent = limit.toLocaleString('ru');
      if (el('sb-prog')) el('sb-prog').style.width = pct + '%';

      // Limits section
      const isPremium = plan?.type === 'premium';
      if (el('sl-plan-title')) el('sl-plan-title').textContent = typeName;
      if (el('sl-ai-req')) el('sl-ai-req').textContent = (limit || 0).toLocaleString('ru');
      if (el('sl-bots')) el('sl-bots').textContent = isPremium ? '∞' : '1';
      if (el('sl-kb')) el('sl-kb').textContent = isPremium ? '∞' : '100 записей';
      if (el('sl-models')) el('sl-models').textContent = isPremium ? 'Все модели' : 'GPT / Gemini';

      // General section
      if (el('s-company-email')) el('s-company-email').value = currentUser.email || '';
      if (el('av-dd-name')) el('av-dd-name').textContent = currentUser.displayName || currentUser.email || '—';
      if (el('av-dd-email')) el('av-dd-email').textContent = currentUser.email || '';

      // Partner section
      const refLink = `https://createbotaiagent.com?ref=${currentUser.uid.slice(0, 8)}`;
      if (el('sp-ref-link')) el('sp-ref-link').value = refLink;
    }

    function saveGeneralSettings() {
      if (!currentUser) return;
      const name = document.getElementById('s-company-name')?.value?.trim();
      const newsletter = document.getElementById('s-newsletter')?.checked;
      db.collection('users').doc(currentUser.uid).collection('settings').doc('profile')
        .set({ companyName: name || '', newsletter: !!newsletter }, { merge: true })
        .then(() => showToast('✅ Настройки сохранены'))
        .catch(() => showToast('Ошибка сохранения'));
    }

    function changePassword() {
      const oldPass = document.getElementById('s-old-pass')?.value;
      const newPass = document.getElementById('s-new-pass')?.value;
      if (!oldPass) { showToast('Введите старый пароль'); return; }
      if (!newPass || newPass.length < 6) { showToast('Новый пароль должен быть не менее 6 символов'); return; }
      const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, oldPass);
      currentUser.reauthenticateWithCredential(credential)
        .then(() => currentUser.updatePassword(newPass))
        .then(() => { showToast('✅ Пароль изменён'); document.getElementById('s-old-pass').value = ''; document.getElementById('s-new-pass').value = ''; })
        .catch(e => showToast('Ошибка: ' + (e.code === 'auth/wrong-password' ? 'Неверный старый пароль' : e.message)));
    }

    // ── Card management ───────────────────────────────────────────────────────
    function loadCard() {
      if (!currentUser) return;
      db.collection('users').doc(currentUser.uid).collection('settings').doc('payment').get().then(snap => {
        if (snap.exists && snap.data().last4) {
          const d = snap.data();
          document.getElementById('card-last4').textContent = d.last4;
          document.getElementById('card-holder').textContent = d.holder || '';
          const logo = document.getElementById('card-logo');
          if (logo) { logo.textContent = d.type || 'CARD'; logo.style.background = d.type === 'MASTERCARD' ? '#eb001b' : '#1a1a6e'; }
          document.getElementById('card-exists').style.display = 'flex';
          document.getElementById('card-empty').style.display = 'none';
          document.getElementById('card-form').style.display = 'none';
        } else {
          document.getElementById('card-exists').style.display = 'none';
          document.getElementById('card-empty').style.display = 'flex';
          document.getElementById('card-form').style.display = 'none';
        }
      });
    }

    function showAddCard() {
      document.getElementById('card-empty').style.display = 'none';
      document.getElementById('card-form').style.display = 'flex';
    }

    function cancelAddCard() {
      document.getElementById('card-form').style.display = 'none';
      document.getElementById('card-empty').style.display = 'flex';
    }

    function formatCardNumber(input) {
      let v = input.value.replace(/\D/g, '').slice(0, 16);
      input.value = v.replace(/(.{4})/g, '$1 ').trim();
    }

    function formatExpiry(input) {
      let v = input.value.replace(/\D/g, '').slice(0, 4);
      if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
      input.value = v;
    }

    function saveCard() {
      const raw = document.getElementById('card-number-input')?.value.replace(/\s/g, '');
      const expiry = document.getElementById('card-expiry-input')?.value;
      const holder = document.getElementById('card-name-input')?.value?.trim().toUpperCase();
      if (!raw || raw.length < 13) { showToast('Введите корректный номер карты'); return; }
      if (!expiry || expiry.length < 5) { showToast('Введите срок действия'); return; }
      const last4 = raw.slice(-4);
      const type = raw.startsWith('4') ? 'VISA' : raw.startsWith('5') ? 'MASTERCARD' : 'CARD';
      db.collection('users').doc(currentUser.uid).collection('settings').doc('payment')
        .set({ last4, type, holder: holder || '', expiry, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => { showToast('✅ Карта сохранена'); loadCard(); })
        .catch(() => showToast('Ошибка сохранения'));
    }

    function deleteCard() {
      showConfirm({
        icon: '💳',
        title: 'Удалить карту?',
        desc: 'Привязанная карта будет удалена. Вы сможете добавить новую в любое время.',
        action: 'Удалить',
        danger: true,
        onOk: () => {
          db.collection('users').doc(currentUser.uid).collection('settings').doc('payment')
            .delete()
            .then(() => { showToast('Карта удалена'); loadCard(); })
            .catch(() => showToast('Ошибка удаления'));
        },
      });
    }

    // ── Promo codes ───────────────────────────────────────────────────────────
    const PROMO_BENEFITS = {
      extra_requests: v => `+${v} AI-запросов`,
      trial_extension: v => `+${v} дней триала`,
      upgrade_pro: () => 'Апгрейд до Pro на 1 месяц',
    };

    async function activatePromo() {
      const code = document.getElementById('s-promo-input')?.value?.trim().toUpperCase();
      const result = document.getElementById('s-promo-result');
      const btn = document.getElementById('s-promo-btn');
      if (!code) { showToast('Введите промокод'); return; }
      if (!currentUser) return;

      result.style.color = 'var(--text-dim)'; result.textContent = '⏳ Проверяем код...';
      btn.disabled = true;

      try {
        const snap = await db.collection('promoCodes').doc(code).get();
        if (!snap.exists) { result.style.color = 'var(--red)'; result.textContent = '❌ Промокод не найден'; btn.disabled = false; return; }
        const promo = snap.data();
        if (!promo.active) { result.style.color = 'var(--red)'; result.textContent = '❌ Промокод неактивен'; btn.disabled = false; return; }
        if (promo.usedCount >= (promo.maxUses || 9999)) { result.style.color = 'var(--red)'; result.textContent = '❌ Промокод исчерпан'; btn.disabled = false; return; }
        if ((promo.usedBy || []).includes(currentUser.uid)) { result.style.color = 'var(--red)'; result.textContent = '❌ Вы уже использовали этот промокод'; btn.disabled = false; return; }

        // Apply benefit
        const planRef = db.collection('users').doc(currentUser.uid).collection('settings').doc('plan');
        const planSnap = await planRef.get();
        const plan = planSnap.exists ? planSnap.data() : { type: 'trial', monthlyLimit: 2000 };

        if (promo.type === 'extra_requests') {
          await planRef.set({ monthlyLimit: (plan.monthlyLimit || 2000) + promo.value }, { merge: true });
        } else if (promo.type === 'trial_extension' && plan.type === 'trial') {
          const curEnds = plan.trialEnds?.seconds ? plan.trialEnds.seconds : Math.floor(Date.now() / 1000);
          const newEnds = new firebase.firestore.Timestamp(curEnds + promo.value * 86400, 0);
          await planRef.set({ trialEnds: newEnds }, { merge: true });
        } else if (promo.type === 'upgrade_pro') {
          const paidUntil = new firebase.firestore.Timestamp(Math.floor(Date.now() / 1000) + 30 * 86400, 0);
          await planRef.set({ type: 'pro', paidUntil, monthlyLimit: 2000 }, { merge: true });
        }

        // Mark code as used
        await db.collection('promoCodes').doc(code).update({
          usedCount: firebase.firestore.FieldValue.increment(1),
          usedBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
        });

        const benefitText = PROMO_BENEFITS[promo.type]?.(promo.value) || 'Бонус применён';
        result.style.color = 'var(--green)'; result.textContent = `✅ Промокод активирован: ${benefitText}`;
        document.getElementById('s-promo-input').value = '';

        // Reload plan
        const newPlanSnap = await planRef.get();
        STATE.plan = newPlanSnap.data();
        renderTariff();
        renderSettingsData();
        loadActiveBonuses();
      } catch (e) {
        result.style.color = 'var(--red)'; result.textContent = '❌ Ошибка: ' + e.message;
      }
      btn.disabled = false;
    }

    async function loadActiveBonuses() {
      if (!currentUser) return;
      // Show bonuses from usedPromoCodes in user's plan
      const planSnap = await db.collection('users').doc(currentUser.uid).collection('settings').doc('plan').get();
      if (!planSnap.exists) return;
      const plan = planSnap.data();
      const container = document.getElementById('s-active-bonuses');
      if (!container) return;
      const items = [];
      if (plan.monthlyLimit > 2000) {
        items.push(`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2);font-size:0.8rem;"><span style="font-size:18px;">⚡</span><div><div style="font-weight:700;color:var(--text);">Расширенный лимит запросов</div><div style="color:var(--text-dim);font-size:0.72rem;">${plan.monthlyLimit.toLocaleString()} AI-запросов в месяц</div></div></div>`);
      }
      if (plan.type === 'trial' && plan.trialEnds) {
        const days = Math.max(0, Math.ceil((plan.trialEnds.seconds * 1000 - Date.now()) / 86400000));
        items.push(`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;font-size:0.8rem;"><span style="font-size:18px;">🎁</span><div><div style="font-weight:700;color:var(--text);">Pro триал</div><div style="color:var(--text-dim);font-size:0.72rem;">Осталось ${days} дн.</div></div></div>`);
      }
      container.innerHTML = items.length ? items.join('') : '<div style="text-align:center;color:var(--text-dim);font-size:0.78rem;padding:16px;">Нет активных бонусов</div>';
    }

    // ══ ADVANCED NAV TOGGLE ════════════════════════════════════════════════════
    // Restore saved state: default closed, persists across refreshes
    let _advOpen = localStorage.getItem('nav_open') === '1';

    function _applyAdvancedNavUI() {
      const list = document.getElementById('advanced-nav-list');
      const arrow = document.getElementById('adv-arrow');
      const btn = document.getElementById('adv-toggle-btn');
      if (list) list.style.display = _advOpen ? '' : 'none';
      if (arrow) arrow.style.transform = _advOpen ? 'rotate(180deg)' : '';
      if (btn) btn.classList.toggle('active', _advOpen);
    }

    // Apply saved state immediately on load
    _applyAdvancedNavUI();

    function toggleAdvancedNav(forceOpen) {
      // Respect user's explicit choice to keep nav closed
      if (forceOpen === true && localStorage.getItem('nav_open') === '0') return;
      if (forceOpen === true && _advOpen) return; // already open, skip
      _advOpen = forceOpen !== undefined ? forceOpen : !_advOpen;
      localStorage.setItem('nav_open', _advOpen ? '1' : '0');
      _applyAdvancedNavUI();
    }

    // ══ BOT OVERVIEW ═══════════════════════════════════════════════════════════
    function renderBotOverview() {
      const bot = STATE.bots.find(b => b.id === STATE.currentBotId) || STATE.bots[0];
      if (!bot) return;
      const i = STATE.bots.indexOf(bot);
      const color = BOT_COLORS[i % BOT_COLORS.length];
      const initial = (bot.name || '?').charAt(0).toUpperCase();
      const displayName = bot.username ? '@' + bot.username.replace(/^@/, '') : bot.name;

      const avEl = document.getElementById('ov-bot-av');
      if (avEl) {
        const photoUrl = STATE.botPhotos[bot.id];
        if (photoUrl) {
          avEl.style.background = 'transparent';
          avEl.innerHTML = `<img src="${photoUrl}" alt="">`;
        } else {
          avEl.style.background = color;
          avEl.textContent = initial;
        }
      }
      const nameEl = document.getElementById('ov-bot-name');
      if (nameEl) nameEl.textContent = bot.name || '—';
      const usrEl = document.getElementById('ov-bot-username');
      if (usrEl) usrEl.textContent = displayName;

      // Update overview status to match agent status
      const ovSw = document.getElementById('ov-status-sw');
      const ovLbl = document.getElementById('ov-status-lbl');
      if (ovSw) ovSw.classList.toggle('on', STATE.agentActive);
      if (ovLbl) ovLbl.textContent = STATE.agentActive ? 'Активен' : 'Неактивен';

      // Quick stats
      const usage = getMonthUsage();
      const plan = STATE.plan;
      const limit = plan ? (plan.monthlyLimit || 0) : 0;
      const el_ch = document.getElementById('ov-chats');
      const el_rq = document.getElementById('ov-requests');
      const el_kb = document.getElementById('ov-kb');
      const el_sub = document.getElementById('ov-req-sub');
      if (el_ch) el_ch.textContent = STATE.chats ? STATE.chats.length : 0;
      if (el_rq) el_rq.textContent = usage;
      if (el_sub) el_sub.textContent = limit > 0 ? `из ${limit}` : '';
      if (el_kb) el_kb.textContent = (STATE.kbQA || []).length;
    }

    // ══ ONBOARDING ════════════════════════════════════════════════════════════
    function checkOnboarding() {
      if (localStorage.getItem('ob_done')) return;
      if (STATE.bots && STATE.bots.length > 0) return;
      startCreateWizard();
    }

    // Legacy compat stubs
    function obNext(step) { wzGoStep(step); }
    function closeOnboarding() { closeCreateWizard(); }

    // ══ CREATE WIZARD ═════════════════════════════════════════════════════════
    let _wzStep = 1;
    let _wzSelectedTemplate = null;

    function startCreateWizard() {
      _wzSelectedTemplate = null;
      _wzStep = 1;
      const nameEl = document.getElementById('wz-name');
      const tokenEl = document.getElementById('wz-token');
      const userEl = document.getElementById('wz-username');
      if (nameEl) nameEl.value = '';
      if (tokenEl) tokenEl.value = '';
      if (userEl) userEl.value = '';
      document.getElementById('wz-error').style.display = 'none';
      document.querySelectorAll('.wz-tpl-card').forEach(c => c.classList.remove('selected'));
      wzGoStep(1);
      document.getElementById('modal-create-wizard')?.classList.add('open');
    }

    function closeCreateWizard() {
      localStorage.setItem('ob_done', '1');
      document.getElementById('modal-create-wizard')?.classList.remove('open');
    }

    function wzGoStep(step) {
      _wzStep = step;
      [1, 2, 3, 4].forEach(i => {
        const el = document.getElementById('wz-step-' + i);
        if (el) el.style.display = i === step ? '' : 'none';
        const dot = document.getElementById('wz-dot-' + i);
        if (dot) dot.style.background = i < step ? 'var(--primary)' : i === step ? 'var(--indigo)' : 'var(--border)';
      });
      const pct = step === 1 ? 25 : step === 2 ? 50 : step === 3 ? 75 : 100;
      const prog = document.getElementById('wz-progress');
      if (prog) prog.style.width = pct + '%';
    }

    async function wzStep1Next() {
      const name = document.getElementById('wz-name').value.trim();
      const token = document.getElementById('wz-token').value.trim();
      const err = document.getElementById('wz-error');
      if (!name) { err.textContent = 'Введите название бота'; err.style.display = ''; return; }
      if (!token) { err.textContent = 'Введите Telegram Bot API токен'; err.style.display = ''; return; }
      err.style.display = 'none';
      const btn = document.getElementById('wz-step1-btn');
      btn.disabled = true; btn.textContent = '⏳ Подключаю...';
      try {
        const username = document.getElementById('wz-username').value.trim();
        const ref = await fsAdd('bots', {
          name, token,
          username: username || '@' + name.toLowerCase().replace(/\s+/g, ''),
          contacts: 0, conversion: 0,
        });
        if (STATE.agentActive && currentUser) {
          registerTelegramWebhook(currentUser.uid, ref.id, token, false);
        }
        wzGoStep(2);
      } catch (e) {
        err.textContent = 'Ошибка: ' + (e.message || 'попробуйте ещё раз');
        err.style.display = '';
      }
      btn.disabled = false; btn.textContent = 'Далее →';
    }

    function wzSelectTemplate(key) {
      _wzSelectedTemplate = key;
      document.querySelectorAll('.wz-tpl-card').forEach(c => c.classList.remove('selected'));
      document.getElementById('wz-tpl-' + key)?.classList.add('selected');
    }

    async function wzStep2Next() {
      if (_wzSelectedTemplate && _wzSelectedTemplate !== 'custom' && RULE_TEMPLATES[_wzSelectedTemplate]) {
        if (currentUser) {
          try {
            await db.collection('users').doc(currentUser.uid).collection('settings').doc('agent')
              .set({ rules: RULE_TEMPLATES[_wzSelectedTemplate] }, { merge: true });
          } catch (e) { }
        }
      }
      wzGoStep(3);
    }

    // ══ RULE TEMPLATES ════════════════════════════════════════════════════════
    const RULE_TEMPLATES = {
      shop: `Ты — вежливый ассистент интернет-магазина. Отвечай только на основе базы знаний о товарах, ценах и доставке.\n\nРоль: помощник по продажам\nАудитория: покупатели, ищущие товары\nТон: дружелюбный, конкретный\n\nЕсли не знаешь ответа — напиши: «Уточните у менеджера, он свяжется с вами в течение 5 минут.»\nНе придумывай цены и характеристики товаров.`,
      restaurant: `Ты — приветливый ассистент ресторана. Рассказывай о меню, акциях, режиме работы и принимай информацию для бронирования столиков.\n\nРоль: администратор ресторана\nАудитория: гости, желающие сделать заказ или забронировать стол\nТон: гостеприимный, тёплый\n\nЕсли нет информации — напиши: «Для уточнения позвоните нам по телефону.»\nНе принимай жалобы на качество еды — перенаправляй на менеджера.`,
      corporate: `Ты — профессиональный корпоративный ассистент. Отвечай на вопросы о компании, услугах и контактах строго на основе предоставленной информации.\n\nРоль: корпоративный помощник\nАудитория: клиенты и партнёры компании\nТон: деловой, профессиональный\n\nЕсли не можешь ответить — напиши: «Наш специалист свяжется с вами в рабочее время.»\nНе раскрывай конфиденциальную информацию.`,
      medical: `Ты — информационный ассистент медицинского учреждения. Отвечай на вопросы о записи к врачу, режиме работы и услугах клиники.\n\nРоль: администратор клиники\nАудитория: пациенты и их родственники\nТон: внимательный, заботливый\n\nВАЖНО: Никогда не давай медицинских советов или диагнозов. При любых вопросах о симптомах перенаправляй к врачу.\nЕсли не знаешь ответа — напиши: «Уточните у регистратуры.»`,
      education: `Ты — помощник образовательного учреждения. Отвечай на вопросы об учебных программах, расписании, стоимости и поступлении.\n\nРоль: консультант по образованию\nАудитория: студенты, родители и абитуриенты\nТон: доброжелательный, поддерживающий\n\nЕсли нет точной информации — напиши: «Свяжитесь с приёмной комиссией для получения актуальных данных.»\nНе обещай гарантированного поступления.`,
    };

    function applyRuleTemplate(key) {
      const ta = document.getElementById('rules-ta');
      if (!ta || !RULE_TEMPLATES[key]) return;
      const doApply = () => {
        ta.value = RULE_TEMPLATES[key];
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 400) + 'px';
        showToast('✅ Шаблон применён — не забудьте сохранить');
      };
      if (ta.value && ta.value.trim()) {
        showConfirm({
          icon: '☰',
          title: 'Заменить текущий промпт?',
          desc: 'Текущий системный промпт будет заменён выбранным шаблоном. Вы сможете изменить его позже.',
          action: 'Заменить',
          onOk: doApply,
        });
      } else {
        doApply();
      }
    }

    // ══ AUTO-REPLY ════════════════════════════════════════════════════════════
    let _arEditIndex = null;

    function showAddAutoReply(idx = null) {
      _arEditIndex = idx;
      const form = document.getElementById('ar-form');
      if (!form) return;
      form.style.display = '';
      document.getElementById('ar-form-title').textContent = idx === null ? 'Новое правило' : 'Редактировать правило';
      if (idx !== null && STATE.autoReplies) {
        const r = STATE.autoReplies[idx];
        document.getElementById('ar-keyword').value = r.keyword || '';
        document.getElementById('ar-response').value = r.response || '';
        document.querySelectorAll('input[name="ar-match"]').forEach(el => { el.checked = el.value === (r.matchType || 'contains'); });
      } else {
        document.getElementById('ar-keyword').value = '';
        document.getElementById('ar-response').value = '';
        document.querySelectorAll('input[name="ar-match"]').forEach(el => { el.checked = el.value === 'contains'; });
      }
      document.getElementById('ar-keyword').focus();
    }

    function cancelAutoReply() {
      document.getElementById('ar-form').style.display = 'none';
      _arEditIndex = null;
    }

    async function saveAutoReply() {
      if (!currentUser) return;
      const keyword = document.getElementById('ar-keyword').value.trim();
      const response = document.getElementById('ar-response').value.trim();
      if (!keyword) { showToast('Введите ключевое слово'); return; }
      if (!response) { showToast('Введите текст ответа'); return; }
      const matchType = document.querySelector('input[name="ar-match"]:checked')?.value || 'contains';
      const rules = [...(STATE.autoReplies || [])];
      const rule = { keyword, response, matchType, enabled: true };
      if (_arEditIndex !== null) rules[_arEditIndex] = rule; else rules.push(rule);
      await db.doc(`users/${currentUser.uid}/settings/autoReplies`).set({ rules });
      STATE.autoReplies = rules;
      cancelAutoReply();
      renderAutoReplies();
      showToast('✅ Правило сохранено');
    }

    async function toggleAutoReply(idx) {
      if (!currentUser) return;
      const rules = [...(STATE.autoReplies || [])];
      rules[idx] = { ...rules[idx], enabled: !rules[idx].enabled };
      await db.doc(`users/${currentUser.uid}/settings/autoReplies`).set({ rules });
      STATE.autoReplies = rules;
      renderAutoReplies();
    }

    async function deleteAutoReply(idx) {
      if (!currentUser) return;
      showConfirm({
        icon: '⚡',
        title: 'Удалить правило?',
        desc: 'Правило автоответа будет удалено. Бот перестанет реагировать на это ключевое слово.',
        action: 'Удалить',
        danger: true,
        onOk: async () => {
          const rules = (STATE.autoReplies || []).filter((_, i) => i !== idx);
          await db.doc(`users/${currentUser.uid}/settings/autoReplies`).set({ rules });
          STATE.autoReplies = rules;
          renderAutoReplies();
          showToast('Правило удалено');
        },
      });
    }

    function renderAutoReplies() {
      const list = document.getElementById('ar-list');
      if (!list) return;
      const rules = STATE.autoReplies || [];
      if (!rules.length) {
        list.innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-icon">⚡</div><div class="empty-sub">Нет правил. Добавьте первое правило выше.</div></div>';
        return;
      }
      list.innerHTML = rules.map((r, i) => `
      <div class="rules-card" style="padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:0.78rem;font-weight:700;color:var(--text);">${r.keyword}</span>
            <span style="font-size:0.6rem;background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:1px 6px;color:var(--text-dim);">${r.matchType === 'exact' ? 'точное' : 'содержит'}</span>
            ${!r.enabled ? '<span style="font-size:0.6rem;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:1px 6px;color:#ef4444;">выкл</span>' : ''}
          </div>
          <div style="font-size:0.75rem;color:var(--text-sec);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.response}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="chat-ctrl-btn" onclick="toggleAutoReply(${i})">${r.enabled ? 'Выкл' : 'Вкл'}</button>
          <button class="chat-ctrl-btn" onclick="showAddAutoReply(${i})">✏️</button>
          <button class="chat-ctrl-btn" style="color:var(--red);" onclick="deleteAutoReply(${i})">🗑️</button>
        </div>
      </div>
    `).join('');
    }

    // ══ NOTIFICATIONS SETTINGS ════════════════════════════════════════════════
    let _notifSettings = { notifyNewUser: true, notify80: true, notify100: true, ownerChatId: '' };

    async function loadNotifSettings() {
      if (!currentUser) return;
      const snap = await db.doc(`users/${currentUser.uid}/settings/notifications`).get();
      if (snap.exists) _notifSettings = { ..._notifSettings, ...snap.data() };
      const el = id => document.getElementById(id);
      if (el('notif-owner-id')) el('notif-owner-id').value = _notifSettings.ownerChatId || '';
      updateNotifToggle('new-user', _notifSettings.notifyNewUser !== false);
      updateNotifToggle('80', _notifSettings.notify80 !== false);
      updateNotifToggle('100', _notifSettings.notify100 !== false);
    }

    function updateNotifToggle(key, on) {
      const lbl = document.getElementById(`notif-${key}-lbl`);
      const sw = document.getElementById(`notif-${key}-sw`);
      if (lbl) lbl.textContent = on ? 'Вкл' : 'Выкл';
      if (lbl) lbl.className = `toggle-text ${on ? 'on' : 'off'}`;
      if (sw) sw.className = `toggle-sw ${on ? 'on' : 'off'}`;
    }

    function toggleNotif(wrapEl, key) {
      const keyMap = { notifyNewUser: 'new-user', notify80: '80', notify100: '100' };
      _notifSettings[key] = !(_notifSettings[key] !== false);
      updateNotifToggle(keyMap[key], _notifSettings[key]);
    }

    async function saveNotifSettings() {
      if (!currentUser) return;
      _notifSettings.ownerChatId = document.getElementById('notif-owner-id')?.value?.trim() || '';
      await db.doc(`users/${currentUser.uid}/settings/notifications`).set(_notifSettings);
      showToast('✅ Настройки уведомлений сохранены');
    }

    function copyRefLink() {
      const val = document.getElementById('sp-ref-link')?.value;
      if (!val) return;
      navigator.clipboard.writeText(val).then(() => showToast(T[LANG]['toast.copied'] || '✅ Ссылка скопирована'));
    }

    // ══ i18n ════════════════════════════════════════════════════════════════════
    let LANG = localStorage.getItem('ui_lang') || 'ru';

    const T = {
      ru: {
        // Sidebar nav
        'status.label': 'Статус агента',
        'status.active': 'Активен',
        'status.inactive': 'Неактивен',
        'nav.analytics': 'Аналитика',
        'nav.ai_stats': 'Статистика ИИ',
        'nav.chats': 'Чаты',
        'nav.testing': 'Тестирование',
        'nav.knowledge': 'База знаний',
        'nav.automations': 'Автоматизации',
        'nav.bots': 'Боты',
        'nav.accounts': 'Аккаунты',
        'nav.add_bot': 'Добавьте бота через API',
        'nav.config': 'Конфигурация',
        'nav.ai_provider': 'Провайдер ИИ',
        'nav.launch': 'Запуск бота',
        'nav.rules': 'Правила общения',
        'nav.tariff': 'Тариф',
        'nav.my_account': 'Мой аккаунт',
        'nav.billing': 'Оплата и тарифы',
        'nav.partner': 'Кабинет партнёра',
        'nav.language': 'Язык',
        'nav.help': 'Помощь',
        'nav.signout': 'Выйти',
        // Footer
        'footer.ai_requests': 'ИИ-запросы ⓘ',
        'footer.remaining': 'Осталось',
        // Settings overlay
        'settings.title': 'Настройки',
        'settings.group.account': 'Аккаунт',
        'settings.group.billing': 'Биллинг',
        'settings.group.partner': 'Партнёрам',
        'settings.my_account': 'Мой аккаунт',
        'settings.general': 'Общие настройки',
        'settings.general.sub': 'Настройки проекта и уведомлений',
        'settings.billing': 'Оплата и тарифы',
        'settings.limits': 'Лимиты',
        'settings.bonuses': 'Бонусы',
        'settings.company.title': 'Данные компании',
        'lang.card.title': 'Язык интерфейса',
        // Toast
        'toast.copied': '✅ Ссылка скопирована',
        'help.soon': 'Справочный центр в разработке',
      },
      en: {
        'status.label': 'Agent Status',
        'status.active': 'Active',
        'status.inactive': 'Inactive',
        'nav.analytics': 'Analytics',
        'nav.ai_stats': 'AI Statistics',
        'nav.chats': 'Chats',
        'nav.testing': 'Testing',
        'nav.knowledge': 'Knowledge Base',
        'nav.automations': 'Automations',
        'nav.bots': 'Bots',
        'nav.accounts': 'Accounts',
        'nav.add_bot': 'Add a bot via API',
        'nav.config': 'Configuration',
        'nav.ai_provider': 'AI Provider',
        'nav.launch': 'Bot Launch',
        'nav.rules': 'Communication Rules',
        'nav.tariff': 'Plan',
        'nav.my_account': 'My Account',
        'nav.billing': 'Billing',
        'nav.partner': 'Partner Cabinet',
        'nav.language': 'Language',
        'nav.help': 'Help',
        'nav.signout': 'Sign Out',
        'footer.ai_requests': 'AI Requests ⓘ',
        'footer.remaining': 'Remaining',
        'settings.title': 'Settings',
        'settings.group.account': 'Account',
        'settings.group.billing': 'Billing',
        'settings.group.partner': 'Partners',
        'settings.my_account': 'My Account',
        'settings.general': 'General Settings',
        'settings.general.sub': 'Project and notification settings',
        'settings.billing': 'Billing',
        'settings.limits': 'Limits',
        'settings.bonuses': 'Bonuses',
        'settings.company.title': 'Company Info',
        'lang.card.title': 'Interface Language',
        'toast.copied': '✅ Link copied',
        'help.soon': 'Help center coming soon',
      },
      uz: {
        'status.label': 'Agent holati',
        'status.active': 'Faol',
        'status.inactive': 'Nofaol',
        'nav.analytics': 'Tahlil',
        'nav.ai_stats': 'AI Statistikasi',
        'nav.chats': 'Chatlar',
        'nav.testing': 'Sinov',
        'nav.knowledge': 'Bilimlar bazasi',
        'nav.automations': 'Avtomatlashtirish',
        'nav.bots': 'Botlar',
        'nav.accounts': 'Hisoblar',
        'nav.add_bot': 'API orqali bot qo\'shing',
        'nav.config': 'Konfiguratsiya',
        'nav.ai_provider': 'AI Provayder',
        'nav.launch': 'Botni ishga tushirish',
        'nav.rules': 'Muloqot qoidalari',
        'nav.tariff': 'Tarif',
        'nav.my_account': 'Mening hisobim',
        'nav.billing': 'To\'lov va tariflar',
        'nav.partner': 'Hamkor kabineti',
        'nav.language': 'Til',
        'nav.help': 'Yordam',
        'nav.signout': 'Chiqish',
        'footer.ai_requests': 'AI So\'rovlari ⓘ',
        'footer.remaining': 'Qoldi',
        'settings.title': 'Sozlamalar',
        'settings.group.account': 'Hisob',
        'settings.group.billing': 'To\'lov',
        'settings.group.partner': 'Hamkorlar',
        'settings.my_account': 'Mening hisobim',
        'settings.general': 'Umumiy sozlamalar',
        'settings.general.sub': 'Loyiha va bildirishnoma sozlamalari',
        'settings.billing': 'To\'lov va tariflar',
        'settings.limits': 'Limitlar',
        'settings.bonuses': 'Bonuslar',
        'settings.company.title': 'Kompaniya ma\'lumotlari',
        'lang.card.title': 'Interfeys tili',
        'toast.copied': '✅ Havola nusxalandi',
        'help.soon': 'Yordam markazi tez orada',
      },
    };

    function applyLang(code) {
      const dict = T[code] || T['ru'];
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (dict[key] !== undefined) el.textContent = dict[key];
      });
      // Update lang buttons active state
      ['ru', 'en', 'uz'].forEach(l => {
        const btn = document.getElementById('lang-btn-' + l);
        if (btn) {
          btn.style.borderColor = l === code ? 'var(--primary)' : 'var(--border)';
          btn.style.background = l === code ? 'var(--primary-dim)' : 'var(--surface2)';
          btn.style.color = l === code ? 'var(--indigo)' : 'var(--text)';
        }
      });
    }

    function setLang(code) {
      LANG = code;
      localStorage.setItem('ui_lang', code);
      applyLang(code);
      // Save to Firestore if logged in
      if (currentUser) {
        db.collection('users').doc(currentUser.uid).collection('settings').doc('profile')
          .set({ lang: code }, { merge: true });
      }
      showToast(code === 'ru' ? '🇷🇺 Русский' : code === 'en' ? '🇬🇧 English' : '🇺🇿 O\'zbekcha');
    }

    // Apply on page load
    applyLang(LANG);

    // ── Plan change modal ──────────────────────────────────────────────────────
    function openChangePlanModal() {
      const plan = STATE.plan;
      const currentType = plan?.type || 'trial';
      const billing = document.getElementById('tbtn-year')?.classList.contains('active') ? 'year' : 'month';
      // Prices
      const proPrice = billing === 'year' ? '$16' : '$20';
      const premPrice = billing === 'year' ? '$40' : '$50';
      const proNote = billing === 'year' ? 'при оплате за год' : 'помесячная оплата';
      const premNote = billing === 'year' ? 'при оплате за год' : 'помесячная оплата';
      document.getElementById('cp-pro-price').innerHTML = `${proPrice} <span style="font-size:0.75rem;font-weight:400;opacity:0.7;">/мес</span>`;
      document.getElementById('cp-prem-price').innerHTML = `${premPrice} <span style="font-size:0.75rem;font-weight:400;opacity:0.7;">/мес</span>`;
      document.getElementById('cp-pro-note').textContent = proNote;
      document.getElementById('cp-prem-note').textContent = premNote;
      // Buttons state
      const proBtn = document.getElementById('cp-pro-btn');
      const premBtn = document.getElementById('cp-prem-btn');
      if (currentType === 'premium') {
        proBtn.textContent = 'Перейти на Pro'; proBtn.style.cssText = 'width:100%;padding:9px;border-radius:8px;border:none;font-size:0.8rem;font-weight:700;cursor:pointer;background:rgba(99,102,241,0.15);color:#818cf8;';
        premBtn.textContent = 'Текущий план'; premBtn.style.cssText = 'width:100%;padding:9px;border-radius:8px;border:none;font-size:0.8rem;font-weight:700;cursor:default;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4);';
      } else {
        proBtn.textContent = 'Текущий план'; proBtn.style.cssText = 'width:100%;padding:9px;border-radius:8px;border:none;font-size:0.8rem;font-weight:700;cursor:default;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4);';
        premBtn.textContent = 'Перейти на Premium'; premBtn.style.cssText = 'width:100%;padding:9px;border-radius:8px;border:none;font-size:0.8rem;font-weight:700;cursor:pointer;background:#fff;color:#1a1a2e;';
      }
      document.getElementById('modal-change-plan').classList.add('open');
    }

    function selectPlan(type) {
      const plan = STATE.plan;
      const currentType = plan?.type || 'trial';
      if (type === currentType || (currentType === 'trial' && type === 'pro')) {
        showToast('Это ваш текущий план'); return;
      }
      closeBillingModal('modal-change-plan');
      window.open('https://t.me/createbotaiagent', '_blank');
      showToast('Переходим в Telegram для оформления');
    }

    // ── Buy requests modal ─────────────────────────────────────────────────────
    function openBuyRequestsModal() {
      const plan = STATE.plan;
      const isPremium = plan?.type === 'premium';
      const pricePerK = isPremium ? 10 : 15;
      const packs = [
        { count: 1000, label: '1 000 запросов', price: pricePerK },
        { count: 5000, label: '5 000 запросов', price: Math.round(pricePerK * 5 * 0.9) },
        { count: 10000, label: '10 000 запросов', price: Math.round(pricePerK * 10 * 0.8) },
      ];
      const container = document.getElementById('buy-req-packs');
      container.innerHTML = packs.map(p => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
        <div>
          <div style="font-size:0.88rem;font-weight:700;color:var(--text);">⚡ ${p.label}</div>
          <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px;">Добавляются к текущему месяцу</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-size:1rem;font-weight:800;color:var(--indigo);">$${p.price}</div>
          <button class="s-btn s-btn-primary" style="padding:6px 14px;font-size:0.75rem;" onclick="buyRequests(${p.count}, ${p.price})">Купить</button>
        </div>
      </div>
    `).join('');
      document.getElementById('modal-buy-requests').classList.add('open');
    }

    function buyRequests(count, price) {
      closeBillingModal('modal-buy-requests');
      window.open(`https://t.me/createbotaiagent?start=buy_${count}`, '_blank');
      showToast(`Запрос на ${count.toLocaleString()} запросов отправлен`);
    }

    function closeBillingModal(id) {
      document.getElementById(id)?.classList.remove('open');
    }

    function confirmCancelSub() {
      closeBillingModal('modal-cancel-sub');
      window.open('https://t.me/createbotaiagent?start=cancel_sub', '_blank');
      showToast('Переходим в Telegram для отмены');
    }

    /* ═══ CHAT OS LOGIC ═══ */
    const FILE_UPLOAD_ENABLED = true; // Feature flag for Phase 7 Telegram-style upload

    let authReady = false;
    let chatOsInitDone = false;
    window.resolvedUid = null; // Also bound to window for error logger

    let chatOsHistory = [];
    let isWaitingForAI = false;

    /* ══ CHAT-OS ATTACHMENT LOGIC ══ */
    let pendingChatAttachment = null;
    const CHAT_FILE_CAPABILITY = window.Telegram?.WebApp?.platform !== 'unknown'; // Optional checks for telegram mini app limitations

    function initAttachmentListeners() {
      const attachBtn = document.getElementById('chat-ob-attach-btn');
      const fileInput = document.getElementById('chat-ob-file-input');

      if (!FILE_UPLOAD_ENABLED) {
        if (attachBtn) attachBtn.style.display = 'none';
        return; // Disable attachment UI completely if flag is off
      }

      if (attachBtn && fileInput) {
        attachBtn.addEventListener('click', () => {
          if (!CHAT_OS.inputEl.disabled) {
            fileInput.click();
          }
        });

        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) {
            e.target.value = ''; // Clear the input even if no file was selected
            return;
          }

          // Limit to 20MB
          if (file.size > 20 * 1024 * 1024) {
            showToast("Файл слишком большой. Максимум 20MB.");
            e.target.value = '';
            return;
          }

          const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv', 'text/markdown', 'image/jpeg', 'image/png'];
          if (!allowedTypes.includes(file.type) && !file.name.endsWith('.md') && !file.name.endsWith('.csv')) {
            showToast("Неподдерживаемый формат. PDF, DOCX, TXT, CSV, JPG, PNG.");
            e.target.value = '';
            return;
          }
          pendingChatAttachment = file;
          document.getElementById('chat-ob-attachment-name').textContent = file.name;
          document.getElementById('chat-ob-attachment-size').textContent = `(${(file.size / 1024 / 1024).toFixed(1)} MB)`;
          document.getElementById('chat-ob-attachment-pill').style.display = 'flex';
          e.target.value = '';
        });
      }
    }

    // Call initialization safely
    document.addEventListener('DOMContentLoaded', initAttachmentListeners);

    function clearChatAttachment() {
      pendingChatAttachment = null;
      document.getElementById('chat-ob-attachment-pill').style.display = 'none';
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
      });
    }

    const CHAT_OS = {
      container: document.getElementById('onboarding-chat-overlay'),
      messagesEl: document.getElementById('chat-ob-messages'),
      chipsEl: document.getElementById('chat-ob-chips'),
      inputEl: document.getElementById('chat-ob-input'),
      sendBtn: document.getElementById('chat-ob-send')
    };

    // Modified to always stay open for all users and fetch history from backend
    async function initChatOnboarding(uid, botsCount) {
      if (!uid) return;
      try {
        CHAT_OS.container.style.display = 'flex';

        // Hide standard UI elements globally
        const mainContent = document.getElementById('main-content');
        const sidebar = document.querySelector('.sidebar');
        if (mainContent) mainContent.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';

        // Load visual history from Backend Session
        CHAT_OS.messagesEl.innerHTML = '<div id="chat-os-typing" class="msg-bot">...загрузка сессии...</div>';

        try {
          const res = await fetch('https://us-central1-chatbot-acd16.cloudfunctions.net/chatOsHandler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: uid, action: 'init' })
          });
          const data = await res.json();
          removeTypingIndicator();
          chatOsInitDone = true;

          chatOsHistory = data.history || [];
          if (chatOsHistory.length === 0) {
            addChatOsMsg('bot', 'Привет. Я помогу создать и управлять чат-ботами. Просто скажи, что ты хочешь сделать.');
          } else {
            renderChatOsHistory();
          }

          // Enable UI after valid backend response
          CHAT_OS.inputEl.disabled = false;
          CHAT_OS.inputEl.placeholder = "Напишите ответ...";
          document.getElementById('chat-ob-attach-btn').disabled = false;
        } catch (e) {
          removeTypingIndicator();
          addChatOsMsg('bot', 'Привет. Ошибка загрузки истории, но я готов к работе.');
          // Still enable UI on fallback so user isn't permanently locked out
          chatOsInitDone = true;
          CHAT_OS.inputEl.disabled = false;
          CHAT_OS.inputEl.placeholder = "Напишите ответ...";
          document.getElementById('chat-ob-attach-btn').disabled = false;
        }

        CHAT_OS.inputEl.focus();
      } catch (e) {
        console.error('Chat OS init error:', e);
      }
    }

    function renderChatOsHistory() {
      CHAT_OS.messagesEl.innerHTML = '';
      chatOsHistory.forEach(msg => {
        const div = document.createElement('div');
        div.className = msg.role === 'bot' ? 'msg-bot' : 'msg-user';
        // Strip markdown roughly for basic html display if needed
        let safeTxt = esc(msg.content).replace(/\\n/g, '<br>');
        div.innerHTML = safeTxt;
        CHAT_OS.messagesEl.appendChild(div);
      });
      scrollToBottomChatOs();
    }

    function addChatOsMsg(role, content) {
      chatOsHistory.push({ role, content });
      const div = document.createElement('div');
      div.className = role === 'bot' ? 'msg-bot' : 'msg-user';
      div.innerHTML = esc(content).replace(/\\n/g, '<br>');
      if (role === 'bot' && content === '...') {
        div.id = 'chat-os-typing';
        // Do not save typing indicator to history array to prevent duplicate renders
        chatOsHistory.pop();
      }
      CHAT_OS.messagesEl.appendChild(div);
      scrollToBottomChatOs();
    }

    function removeTypingIndicator() {
      const el = document.getElementById('chat-os-typing');
      if (el) el.remove();
      chatOsHistory = chatOsHistory.filter(m => m.content !== '...');
    }

    function scrollToBottomChatOs() {
      setTimeout(() => { CHAT_OS.messagesEl.scrollTop = CHAT_OS.messagesEl.scrollHeight; }, 50);
    }

    async function handleChatObSend(overrideText) {
      if (!authReady || !chatOsInitDone || !window.resolvedUid) {
        showToast("Идёт загрузка профиля, подождите 1–2 сек...");
        return;
      }
      if (isWaitingForAI) return;
      const text = overrideText || CHAT_OS.inputEl.value.trim();

      // If flag is off, ensure we don't accidentally process attachments
      if (!FILE_UPLOAD_ENABLED && pendingChatAttachment) clearChatAttachment();

      if (!text && !pendingChatAttachment) return;

      CHAT_OS.inputEl.value = '';
      CHAT_OS.inputEl.disabled = true;
      CHAT_OS.sendBtn.disabled = true;
      document.getElementById('chat-ob-attach-btn').disabled = true;
      isWaitingForAI = true;

      if (text) addChatOsMsg('user', text);

      let attachmentMeta = null;
      let uploadBubble = null;

      if (pendingChatAttachment) {
        // Create the Telegram-style visual upload bubble instantly
        uploadBubble = document.createElement('div');
        uploadBubble.className = 'msg-user';
        uploadBubble.innerHTML = `📎 ${esc(pendingChatAttachment.name)} <br><span style="font-size:0.8em; color:#ffffff99;">Загрузка... 0%</span>`;
        CHAT_OS.messagesEl.appendChild(uploadBubble);
        scrollToBottomChatOs();

        const file = pendingChatAttachment;
        clearChatAttachment(); // remove pill from UI immediately 

        try {
          // 1) Get Signed URL Config 
          const urlRes = await fetch('https://us-central1-chatbot-acd16.cloudfunctions.net/getUploadUrl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: window.resolvedUid,
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              botId: 'default', // handler will parse
              rid: Date.now().toString()
            })
          });
          if (!urlRes.ok) throw new Error("Failed to get upload URL");
          const { uploadUrl, storagePath, publicUrl } = await urlRes.json();

          // 2) Upload directly to Storage using XMLHttpRequest to track progress
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl, true);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                uploadBubble.innerHTML = `📎 ${esc(file.name)} <br><span style="font-size:0.8em; color:#ffffff99;">Загрузка... ${percent}%</span>`;
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`Storage PUT failed: ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error("Network error during upload"));
            xhr.send(file);
          });

          // 3) Complete Phase 7 Metadata packaging
          uploadBubble.innerHTML = `📎 ${esc(file.name)} <br><span style="font-size:0.8em; color:#ffffffcc;">Загружен ✔</span>`;
          attachmentMeta = {
            type: 'file',
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            storagePath: storagePath,
            downloadURL: publicUrl
          };

        } catch (uploadErr) {
          console.error("Upload process failed:", uploadErr);
          uploadBubble.innerHTML = `📎 ${esc(file.name)} <br><span style="font-size:0.8em; color:#ffb3b0;">Ошибка загрузки.</span>`;
          isWaitingForAI = false;
          CHAT_OS.inputEl.disabled = false;
          CHAT_OS.sendBtn.disabled = false;
          if (FILE_UPLOAD_ENABLED) document.getElementById('chat-ob-attach-btn').disabled = false;
          return; // Abort LLM call since file didn't make it
        }
      }

      // 4) Main LLM Request handling
      addChatOsMsg('bot', '...'); // typing indicator

      try {
        const response = await fetch('https://us-central1-chatbot-acd16.cloudfunctions.net/chatOsHandler', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: window.resolvedUid,
            action: 'message',
            text: text,
            attachment: attachmentMeta,
            capabilities: {
              fileUpload: FILE_UPLOAD_ENABLED,
              textPaste: true,
              urlInput: true
            }
          })
        });

        const data = await response.json();
        removeTypingIndicator();

        if (data.reply) {
          addChatOsMsg('bot', data.reply);
        } else {
          addChatOsMsg('bot', 'Произошла ошибка (пустой ответ).');
        }

      } catch (err) {
        removeTypingIndicator();
        clearChatAttachment();
        addChatOsMsg('bot', 'Ошибка сети. Попробуйте еще раз. Если файл большой, используйте текст/ссылку.');
        console.error(err);
      } finally {
        CHAT_OS.inputEl.disabled = false;
        CHAT_OS.sendBtn.disabled = false;
        document.getElementById('chat-ob-attach-btn').disabled = false;
        isWaitingForAI = false;
        CHAT_OS.inputEl.focus();
      }
    }

    function handleChatObChipClick(chip) {
      // Optional: We can leave this empty or remove it,
      // since Chat OS doesn't use hardcoded chips anymore.
    }

    CHAT_OS.sendBtn.addEventListener('click', () => handleChatObSend());
    CHAT_OS.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleChatObSend();
    });
    CHAT_OS.inputEl.addEventListener('input', () => {
      CHAT_OS.sendBtn.disabled = !CHAT_OS.inputEl.value.trim();
    });

    // We no longer need finishChatOnboarding because it's a persistent OS
