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

  // ── Apply Telegram theme colors ─────────────────────────────────────────────
  function applyTmaTheme() {
    var wa = getWebApp();
    if (!wa || !wa.themeParams) return;
    var tp = wa.themeParams;
    var root = document.documentElement;
    // Map TMA theme to our CSS vars
    if (tp.bg_color) root.style.setProperty("--tma-bg", tp.bg_color);
    if (tp.secondary_bg_color) root.style.setProperty("--tma-bg2", tp.secondary_bg_color);
    if (tp.text_color) root.style.setProperty("--tma-text", tp.text_color);
    if (tp.hint_color) root.style.setProperty("--tma-hint", tp.hint_color);
    if (tp.link_color) root.style.setProperty("--tma-link", tp.link_color);
    if (tp.button_color) root.style.setProperty("--tma-btn", tp.button_color);
    if (tp.button_text_color) root.style.setProperty("--tma-btn-text", tp.button_text_color);
    if (tp.section_bg_color) root.style.setProperty("--tma-section-bg", tp.section_bg_color);
    if (tp.section_separator_color) root.style.setProperty("--tma-separator", tp.section_separator_color);
  }

  // ── Apply Safe Area Insets (API 7.7+ / 8.0+) ────────────────────────────────
  function applySafeAreas() {
    var wa = getWebApp();
    if (!wa) return;
    var root = document.documentElement;
    // Prefer contentSafeAreaInset (API 8.0+) over safeAreaInset (API 7.7+)
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
    // We intentionally do NOT call requestFullscreen() here, so that the Mini App
    // is rendered natively BELOW the Telegram "Close" header, preventing overlap.
    // try { if (typeof wa.requestFullscreen === "function") wa.requestFullscreen(); } catch (_) {}
    // Disable vertical swipe to close
    try { if (typeof wa.disableVerticalSwipes === "function") wa.disableVerticalSwipes(); } catch (_) { }
    // Set header color to match our UI
    try { if (typeof wa.setHeaderColor === "function") wa.setHeaderColor("#ffffff"); } catch (_) { }
    try { if (typeof wa.setBackgroundColor === "function") wa.setBackgroundColor("#f9f9fb"); } catch (_) { }
  }

  // ── Viewport height fix ──────────────────────────────────────────────────────
  function setAppHeight() {
    try {
      var wa = getWebApp();
      var h = 0;
      if (wa) {
        h = Number(wa.viewportStableHeight || wa.viewportHeight || 0);
      }
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

  // ── Main init ────────────────────────────────────────────────────────────────
  function init() {
    if (!tg) return;

    // Always expand in mini app
    expandApp();
    applyTmaTheme();
    applySafeAreas();

    var wa = getWebApp();

    // Listen for theme changes
    try {
      if (wa && typeof wa.onEvent === "function") {
        wa.onEvent("themeChanged", applyTmaTheme);
        wa.onEvent("viewportChanged", scheduleSetAppHeight);
        wa.onEvent("safeAreaChanged", applySafeAreas);
        wa.onEvent("contentSafeAreaChanged", applySafeAreas);
      }
    } catch (_) { }

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

      // Keyboard fix: restore scroll after input blur
      document.addEventListener("focusout", function () {
        setTimeout(scheduleSetAppHeight, 60);
      }, true);

      // Prevent bounce scroll on body
      document.addEventListener("touchmove", function (e) {
        if (e.target === document.body || e.target === document.documentElement) {
          e.preventDefault();
        }
      }, { passive: false });

      logMiniMetric("ios_fix_enabled", {
        viewportHeight: window.innerHeight,
        tgViewportHeight: wa ? wa.viewportHeight : null,
        tgStableHeight: wa ? wa.viewportStableHeight : null,
      });
    }

    // Add TMA body class for CSS targeting
    document.documentElement.classList.add("in-tma");
    if (document.body) document.body.classList.add("in-tma");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
