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
      }).catch(function () {});
    } catch (_) {}
  }

  var enabled = !!window.MINIAPP_IOS_FIX;
  var tg = isTelegramMiniApp();
  var ios = isIos();
  var active = enabled && tg && ios;

  if (!active) return;

  function setAppHeight() {
    try {
      var wa = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      var h = 0;
      if (wa) {
        h = Number(wa.viewportStableHeight || wa.viewportHeight || 0);
      }
      if (!h || !Number.isFinite(h)) h = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!h) return;
      document.documentElement.style.setProperty("--app-height", h + "px");
    } catch (_) {}
  }

  var _resizeRaf = 0;
  function scheduleSetAppHeight() {
    if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
    _resizeRaf = requestAnimationFrame(setAppHeight);
  }

  function bindTelegramViewportEvents() {
    try {
      var wa = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (!wa) return;
      if (typeof wa.ready === "function") wa.ready();
      if (typeof wa.expand === "function") wa.expand();
      if (typeof wa.onEvent === "function") {
        wa.onEvent("viewportChanged", function () {
          scheduleSetAppHeight();
        });
      }
    } catch (_) {}
  }

  function bindKeyboardMetrics() {
    var lastFocusAt = 0;
    var beforeFocusHeight = 0;
    var beforeFocusScroll = 0;

    document.addEventListener("focusin", function (e) {
      var t = e && e.target;
      if (!t) return;
      var tag = String(t.tagName || "").toLowerCase();
      if (tag !== "input" && tag !== "textarea" && tag !== "select") return;
      lastFocusAt = Date.now();
      beforeFocusHeight = window.innerHeight;
      beforeFocusScroll = window.scrollY;

      setTimeout(function () {
        var afterHeight = window.innerHeight;
        var afterScroll = window.scrollY;
        var shifted = Math.abs(afterScroll - beforeFocusScroll) > 8;
        var keyboardDelta = Math.abs(beforeFocusHeight - afterHeight);
        if (shifted || keyboardDelta > 80) {
          logMiniMetric("input_focus_layout_change", {
            tag: tag,
            keyboardDelta: keyboardDelta,
            shifted: shifted,
            beforeFocusHeight: beforeFocusHeight,
            afterHeight: afterHeight,
            beforeFocusScroll: beforeFocusScroll,
            afterScroll: afterScroll,
          });
        }
      }, 420);
    }, true);

    document.addEventListener("focusout", function () {
      if (!lastFocusAt) return;
      setTimeout(scheduleSetAppHeight, 60);
    }, true);
  }

  function init() {
    document.documentElement.classList.add("miniapp-ios-fix");
    if (document.body) document.body.classList.add("miniapp-ios-fix");

    bindTelegramViewportEvents();
    setAppHeight();
    bindKeyboardMetrics();

    window.addEventListener("resize", scheduleSetAppHeight, { passive: true });
    window.addEventListener("orientationchange", scheduleSetAppHeight, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleSetAppHeight, { passive: true });
      window.visualViewport.addEventListener("scroll", scheduleSetAppHeight, { passive: true });
    }

    logMiniMetric("ios_fix_enabled", {
      viewportHeight: window.innerHeight,
      tgViewportHeight: window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.viewportHeight : null,
      tgStableHeight: window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.viewportStableHeight : null,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
