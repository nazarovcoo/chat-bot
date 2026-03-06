(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function isIos() {
    var ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua);
  }

  function isTelegramMiniApp() {
    try {
      return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
    } catch (_) {
      return false;
    }
  }

  function getWebApp() {
    try { return window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null; } catch (_) { return null; }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function logMiniMetric(name, payload) {
    try {
      var db = window.firebase && window.firebase.firestore ? window.firebase.firestore() : null;
      if (!db) return;
      var uid = window.resolvedUid || null;
      var coll = uid ? ("users/" + uid + "/client_metrics") : "public_client_metrics";
      db.collection(coll).add({
        type: "miniapp_ios_fix",
        name: String(name || "event"),
        payload: payload || {},
        buildVersion: window.BUILD_VERSION || "dev",
        platform: "telegram_ios",
        userAgent: (navigator.userAgent || "").slice(0, 220),
        createdAtIso: nowIso(),
        timestamp: window.firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(function () { });
    } catch (_) { }
  }

  var tg = isTelegramMiniApp();
  var ios = isIos();

  // ── Haptic feedback ──────────────────────────────────────────────────────────
  function haptic(type) {
    try {
      var wa = getWebApp();
      if (!wa || !wa.HapticFeedback) return;
      if (type === "impact") wa.HapticFeedback.impactOccurred("light");
      else if (type === "success") wa.HapticFeedback.notificationOccurred("success");
      else if (type === "error") wa.HapticFeedback.notificationOccurred("error");
      else if (type === "select") wa.HapticFeedback.selectionChanged();
    } catch (_) { }
  }

  // ── Apply Telegram theme colors ──────────────────────────────────────────────
  function applyTmaTheme() {
    var wa = getWebApp();
    if (!wa || !wa.themeParams) return;
    var tp = wa.themeParams;
    var root = document.documentElement;
    if (tp.bg_color) root.style.setProperty("--tma-bg", tp.bg_color);
    if (tp.secondary_bg_color) root.style.setProperty("--tma-bg2", tp.secondary_bg_color);
    if (tp.text_color) root.style.setProperty("--tma-text", tp.text_color);
    if (tp.hint_color) root.style.setProperty("--tma-hint", tp.hint_color);
    if (tp.link_color) root.style.setProperty("--tma-link", tp.link_color);
    if (tp.button_color) root.style.setProperty("--tma-btn", tp.button_color);
    if (tp.button_text_color) root.style.setProperty("--tma-btn-text", tp.button_text_color);
    if (tp.section_bg_color) root.style.setProperty("--tma-section-bg", tp.section_bg_color);
    if (tp.section_separator_color) root.style.setProperty("--tma-separator", tp.section_separator_color);

    // Dark theme detection
    var isDark = tp.bg_color && parseInt(tp.bg_color.slice(1), 16) < 0x888888;
    if (isDark) {
      document.documentElement.classList.add("tma-dark");
      try { if (wa.setHeaderColor) wa.setHeaderColor(tp.bg_color); } catch (_) { }
      try { if (wa.setBackgroundColor) wa.setBackgroundColor(tp.bg_color); } catch (_) { }
    } else {
      document.documentElement.classList.remove("tma-dark");
      try { if (wa.setHeaderColor) wa.setHeaderColor("#ffffff"); } catch (_) { }
      try { if (wa.setBackgroundColor) wa.setBackgroundColor("#f9f9fb"); } catch (_) { }
    }
  }

  // ── Apply Safe Area Insets (API 7.7+ / 8.0+) ────────────────────────────────
  function applySafeAreas() {
    var wa = getWebApp();
    if (!wa) return;
    var root = document.documentElement;
    var sa = wa.contentSafeAreaInset || wa.safeAreaInset || null;
    if (sa) {
      if (typeof sa.top === "number") root.style.setProperty("--tg-safe-top", sa.top + "px");
      if (typeof sa.bottom === "number") root.style.setProperty("--tg-safe-bottom", sa.bottom + "px");
      if (typeof sa.left === "number") root.style.setProperty("--tg-safe-left", sa.left + "px");
      if (typeof sa.right === "number") root.style.setProperty("--tg-safe-right", sa.right + "px");
    }
  }

  // ── Expand to full screen ────────────────────────────────────────────────────
  function expandApp() {
    var wa = getWebApp();
    if (!wa) return;
    try { if (typeof wa.ready === "function") wa.ready(); } catch (_) { }
    try { if (typeof wa.expand === "function") wa.expand(); } catch (_) { }
    try { if (typeof wa.disableVerticalSwipes === "function") wa.disableVerticalSwipes(); } catch (_) { }
    try { if (typeof wa.setHeaderColor === "function") wa.setHeaderColor("#ffffff"); } catch (_) { }
    try { if (typeof wa.setBackgroundColor === "function") wa.setBackgroundColor("#f9f9fb"); } catch (_) { }
  }

  // ── Viewport height fix ──────────────────────────────────────────────────────
  function setAppHeight() {
    try {
      var wa = getWebApp();
      var h = 0;
      if (wa) h = Number(wa.viewportStableHeight || wa.viewportHeight || 0);
      if (!h || !Number.isFinite(h)) h = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!h) return;
      document.documentElement.style.setProperty("--app-height", h + "px");
    } catch (_) { }
  }

  var _resizeRaf = 0;
  function scheduleSetAppHeight() {
    if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
    _resizeRaf = requestAnimationFrame(setAppHeight);
  }

  // ── Bottom tab bar ───────────────────────────────────────────────────────────
  var TAB_ITEMS = [
    { id: "bot-overview", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><circle cx="17.5" cy="17.5" r="3.5"/></svg>', label: "Обзор" },
    { id: "chats",       icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>', label: "Чаты" },
    { id: "topics",      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>', label: "База знаний" },
    { id: "analytics",   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', label: "Аналитика" },
    { id: "_settings",   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', label: "Настройки" },
  ];

  function injectTabBar() {
    if (document.getElementById("tma-tab-bar")) return;
    var bar = document.createElement("nav");
    bar.id = "tma-tab-bar";
    bar.className = "tma-tab-bar";
    TAB_ITEMS.forEach(function (tab) {
      var item = document.createElement("div");
      item.className = "tma-tab-item";
      item.dataset.tab = tab.id;
      item.innerHTML = tab.icon + '<span>' + tab.label + '</span>';
      item.addEventListener("click", function () {
        haptic("select");
        if (tab.id === "_settings") {
          if (typeof openSettings === "function") openSettings("account");
        } else {
          if (typeof goAgentScreen === "function") goAgentScreen(tab.id);
        }
      });
      bar.appendChild(item);
    });
    document.body.appendChild(bar);
  }

  function updateTabBar(screenId) {
    var bar = document.getElementById("tma-tab-bar");
    if (!bar) return;
    bar.querySelectorAll(".tma-tab-item").forEach(function (el) {
      el.classList.toggle("active", el.dataset.tab === screenId);
    });
  }

  // ── Hook into goAgentScreen for tab sync & BackButton ───────────────────────
  var _navHistory = [];

  function hookNavigation() {
    var wa = getWebApp();
    var orig = window.goAgentScreen;
    if (!orig) return;

    window.goAgentScreen = function (id) {
      // Track history for BackButton
      var current = (window.STATE && window.STATE.currentAgentScreen) || null;
      if (current && current !== id) {
        _navHistory.push(current);
        if (_navHistory.length > 20) _navHistory.shift();
      }
      orig.call(this, id);
      updateTabBar(id);
      updateBackButton(id);
    };
  }

  // ── Telegram BackButton ──────────────────────────────────────────────────────
  function updateBackButton(screenId) {
    var wa = getWebApp();
    if (!wa || !wa.BackButton) return;
    var canGoBack = screenId !== "bot-overview" && screenId !== "home";
    if (canGoBack) {
      wa.BackButton.show();
    } else {
      wa.BackButton.hide();
      _navHistory = [];
    }
  }

  function setupBackButton() {
    var wa = getWebApp();
    if (!wa || !wa.BackButton) return;
    wa.BackButton.onClick(function () {
      haptic("impact");
      var prev = _navHistory.pop();
      if (prev) {
        var orig = window._origGoAgentScreen || window.goAgentScreen;
        if (orig) {
          var current = (window.STATE && window.STATE.currentAgentScreen) || null;
          orig.call(window, prev);
          updateTabBar(prev);
          updateBackButton(prev);
        }
      } else {
        if (typeof goAgentScreen === "function") goAgentScreen("bot-overview");
      }
    });
  }

  // ── Haptic on all interactive elements ──────────────────────────────────────
  function setupHaptic() {
    document.addEventListener("click", function (e) {
      var el = e.target && e.target.closest("button, .nav-item, .tma-tab-item, .cp-mob-proj-item, .bot-nav-item, .settings-nav-item, .acc-item");
      if (el) haptic("impact");
    }, { passive: true, capture: true });
  }

  // ── Telegram MainButton ──────────────────────────────────────────────────────
  var _mainBtnHandler = null;

  function setMainButton(text, handler, color) {
    var wa = getWebApp();
    if (!wa || !wa.MainButton) return;
    if (_mainBtnHandler) {
      try { wa.MainButton.offClick(_mainBtnHandler); } catch (_) { }
    }
    if (!text) {
      wa.MainButton.hide();
      _mainBtnHandler = null;
      return;
    }
    _mainBtnHandler = function () { haptic("success"); handler(); };
    wa.MainButton.setText(text);
    wa.MainButton.color = color || (wa.themeParams && wa.themeParams.button_color) || "#3e7bfa";
    wa.MainButton.onClick(_mainBtnHandler);
    wa.MainButton.show();
  }

  window.tmaMainButton = { set: setMainButton, hide: function () { setMainButton(null); } };

  // ── Pull-to-refresh ──────────────────────────────────────────────────────────
  function setupPullToRefresh() {
    var ptr = document.createElement("div");
    ptr.id = "tma-ptr";
    ptr.className = "tma-ptr";
    ptr.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    document.body.appendChild(ptr);

    var startY = 0;
    var pulling = false;
    var triggered = false;
    var THRESHOLD = 70;

    document.addEventListener("touchstart", function (e) {
      var scrollEl = e.target && e.target.closest(".cp-content, .screen.active, .main-scroll");
      var atTop = !scrollEl || scrollEl.scrollTop <= 2;
      if (atTop) { startY = e.touches[0].clientY; pulling = true; triggered = false; }
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      if (!pulling) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 10 && dy < THRESHOLD + 30) {
        ptr.classList.add("ptr-visible");
        ptr.style.opacity = Math.min(dy / THRESHOLD, 1);
      }
      if (dy >= THRESHOLD && !triggered) {
        triggered = true;
        haptic("impact");
        ptr.classList.add("ptr-loading");
      }
    }, { passive: true });

    document.addEventListener("touchend", function () {
      if (!pulling) return;
      pulling = false;
      if (triggered) {
        setTimeout(function () {
          ptr.classList.remove("ptr-visible", "ptr-loading");
          ptr.style.opacity = "";
          // Reload current screen data
          var screen = window.STATE && window.STATE.currentAgentScreen;
          if (screen === "analytics" && typeof renderAnalytics === "function") { renderAnalytics(); renderAiUsage(); }
          else if (screen === "chats" && typeof renderChats === "function") renderChats();
          else if (screen === "topics" && typeof renderKb === "function") renderKb();
          else if (screen === "bot-overview" && typeof renderBotOverview === "function") renderBotOverview();
          else if (typeof goAgentScreen === "function" && screen) goAgentScreen(screen);
        }, 600);
      } else {
        ptr.classList.remove("ptr-visible");
        ptr.style.opacity = "";
      }
      triggered = false;
    }, { passive: true });
  }

  // ── Skeleton loader helpers ──────────────────────────────────────────────────
  window.tmaShowSkeleton = function (containerId, rows) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var html = "";
    for (var i = 0; i < (rows || 4); i++) {
      html += '<div class="skeleton" style="height:' + (16 + Math.random() * 8 | 0) + 'px;margin-bottom:10px;width:' + (60 + Math.random() * 35 | 0) + '%"></div>';
    }
    el.innerHTML = html;
  };

  // ── Main init ────────────────────────────────────────────────────────────────
  function init() {
    if (!tg) return;

    expandApp();
    applyTmaTheme();
    applySafeAreas();

    var wa = getWebApp();

    try {
      if (wa && typeof wa.onEvent === "function") {
        wa.onEvent("themeChanged", applyTmaTheme);
        wa.onEvent("viewportChanged", scheduleSetAppHeight);
        wa.onEvent("safeAreaChanged", applySafeAreas);
        wa.onEvent("contentSafeAreaChanged", applySafeAreas);
      }
    } catch (_) { }

    // Add TMA body class
    document.documentElement.classList.add("in-tma");
    if (document.body) document.body.classList.add("in-tma");

    // iOS-specific fixes
    var enabled = !!window.MINIAPP_IOS_FIX;
    var active = enabled && ios;

    if (active) {
      document.documentElement.classList.add("miniapp-ios-fix");
      if (document.body) document.body.classList.add("miniapp-ios-fix");
      setAppHeight();
      window.addEventListener("resize", scheduleSetAppHeight, { passive: true });
      window.addEventListener("orientationchange", scheduleSetAppHeight, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", scheduleSetAppHeight, { passive: true });
        window.visualViewport.addEventListener("scroll", scheduleSetAppHeight, { passive: true });
      }
      document.addEventListener("focusout", function () { setTimeout(scheduleSetAppHeight, 60); }, true);
      document.addEventListener("touchmove", function (e) {
        if (e.target === document.body || e.target === document.documentElement) e.preventDefault();
      }, { passive: false });
      logMiniMetric("ios_fix_enabled", { viewportHeight: window.innerHeight, tgViewportHeight: wa ? wa.viewportHeight : null, tgStableHeight: wa ? wa.viewportStableHeight : null });
    }

    // Init TMA features after app JS is ready
    var _initDelay = 300;
    setTimeout(function () {
      injectTabBar();
      setupHaptic();
      setupBackButton();
      setupPullToRefresh();

      // Hook navigation after app is loaded
      var _hookAttempts = 0;
      var _hookInterval = setInterval(function () {
        _hookAttempts++;
        if (typeof window.goAgentScreen === "function") {
          clearInterval(_hookInterval);
          hookNavigation();
          // Set initial active tab
          var initScreen = (window.STATE && window.STATE.currentAgentScreen) || "bot-overview";
          updateTabBar(initScreen);
        }
        if (_hookAttempts > 30) clearInterval(_hookInterval);
      }, 200);
    }, _initDelay);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
