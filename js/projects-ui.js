(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./projects-api.js"));
  } else {
    root.ProjectsUI = factory(root.ProjectsApi);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (ProjectsApi) {
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureStyles() {
    if (document.getElementById("projects-ui-styles")) return;
    var s = document.createElement("style");
    s.id = "projects-ui-styles";
    s.textContent = [
      // ── Reset & base ───────────────────────────────────────────────────────
      "*{box-sizing:border-box}",
      ":root{--ds-primary:#1E5CFB;--ds-primary-50:#EEF4FF;--ds-primary-100:#DCE8FF;--ds-neutral-0:#FFFFFF;--ds-neutral-50:#F7F7F8;--ds-neutral-100:#F5F5F5;--ds-neutral-200:#ECECEC;--ds-neutral-300:#D9D9D9;--ds-neutral-500:#949497;--ds-neutral-700:#4A4A4A;--ds-neutral-900:#090909;--ds-success:#34C759;--ds-danger:#FF3B30;}",
      // ── App shell ──────────────────────────────────────────────────────────
      ".projects-app{display:flex;height:100dvh;font-family:'Inter',sans-serif;background:#f9f9fb;color:#000;overflow:hidden}",
      // ── Narrow navigation (73px) ───────────────────────────────────────────
      ".cp-narrow-nav{width:73px;min-width:73px;height:100vh;background:#fff;border-right:1px solid #f2f2f7;display:flex;flex-direction:column;align-items:center;padding:20px 0;position:fixed;left:0;top:0;z-index:100;gap:0}",
      ".cp-nav-workspace{width:40px;height:40px;border-radius:6px;background:#9fc6ff;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;cursor:pointer;margin-bottom:4px}",
      ".cp-nav-items{display:flex;flex-direction:column;align-items:center;gap:2px;margin-top:8px;width:100%;padding:0 16px}",
      ".cp-nav-item{width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;border:none;color:rgba(60,60,67,0.72);transition:background .15s;flex-shrink:0}",
      ".cp-nav-item:hover{background:#f2f2f7}",
      ".cp-nav-item.active{background:#f2f2f7;color:#1e5cfb}",
      ".cp-nav-bottom{margin-top:auto;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 16px}",
      // ── Agent sidebar (248px) ──────────────────────────────────────────────
      ".cp-agent-sidebar{width:248px;min-width:248px;height:100vh;background:#fff;border-right:1px solid #f2f2f7;display:flex;flex-direction:column;position:fixed;left:73px;top:0;z-index:99;overflow-y:auto;overflow-x:hidden}",
      ".cp-sidebar-header{padding:16px 12px 8px;flex-shrink:0}",
      ".cp-sidebar-title{font-size:22px;font-weight:700;color:#000;margin:0 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.27}",
      ".cp-status-row{display:flex;align-items:center;gap:6px}",
      ".cp-status-dot{width:8px;height:8px;border-radius:50%;background:#34c759;flex-shrink:0}",
      ".cp-status-dot.offline{background:#ff3b30}",
      ".cp-status-label{font-size:16px;color:#000;line-height:1}",
      ".cp-stop-btn{width:calc(100% - 24px);height:32px;background:transparent;border:1px solid #1e5cfb;border-radius:8px;font-size:16px;font-weight:400;color:#000;cursor:pointer;margin:4px 12px 4px;font-family:'Inter',sans-serif;transition:background .15s;flex-shrink:0}",
      ".cp-stop-btn:hover{background:rgba(30,92,251,0.06)}",
      // Sub-nav (tabs) inside sidebar
      ".cp-subnav{padding:4px 8px;display:flex;flex-direction:column;gap:2px;flex-shrink:0}",
      ".projects-tab{display:flex;align-items:center;gap:10px;padding:0 8px;height:36px;border-radius:8px;cursor:pointer;font-size:16px;font-weight:400;color:rgba(60,60,67,0.72);background:transparent;border:none;width:100%;text-align:left;font-family:'Inter',sans-serif;transition:background .15s,color .15s;white-space:nowrap}",
      ".projects-tab:hover{background:#f2f2f7;color:#000}",
      ".projects-tab.active{background:#f2f2f7;color:#000;font-weight:500}",
      ".cp-tab-icon{flex-shrink:0;color:inherit;opacity:.75}",
      ".projects-tab.active .cp-tab-icon{opacity:1}",
      ".cp-tab-badge{margin-left:auto;background:#ff3b30;color:#fff;border-radius:9999px;min-width:20px;height:20px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;padding:0 5px}",
      // Sidebar section / projects list
      ".cp-section-title{font-size:18px;font-weight:700;color:#000;padding:14px 12px 6px;flex-shrink:0}",
      ".cp-action-item{display:flex;align-items:center;gap:8px;padding:0 8px;height:36px;border-radius:8px;font-size:15px;font-weight:400;color:#000;background:transparent;border:none;cursor:pointer;width:calc(100% - 16px);margin:0 8px;font-family:'Inter',sans-serif;flex-shrink:0;transition:background .15s}",
      ".cp-action-item:hover{background:#f2f2f7}",
      ".cp-action-icon{color:#1e5cfb;flex-shrink:0;display:flex;align-items:center}",
      ".projects-list{display:flex;flex-direction:column;overflow-y:auto;max-height:220px;padding:0 8px 4px}",
      ".cp-sidebar-divider{height:1px;background:#f2f2f7;margin:8px 0;flex-shrink:0}",
      ".project-row{display:flex;align-items:center;gap:8px;padding:0 8px;height:36px;border-radius:10px;cursor:pointer;font-size:15px;font-weight:400;color:rgba(60,60,67,0.6);background:transparent;border:none;width:100%;text-align:left;font-family:'Inter',sans-serif;transition:background .15s,color .15s;position:relative}",
      ".project-row:hover{background:#f2f2f7;color:#000}",
      ".project-row.active{background:#fff;color:#000;box-shadow:0 1px 4px rgba(0,0,0,0.10)}",
      ".project-row.active svg{opacity:1!important}",
      ".proj-switcher-dd{position:fixed;z-index:100001;background:#fff;border:1px solid #e5e5ea;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.12);padding:6px;min-width:220px;display:flex;flex-direction:column;gap:2px}",
      ".proj-switcher-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:15px;color:#000;background:transparent;border:none;width:100%;text-align:left;font-family:inherit;transition:background .15s}",
      ".proj-switcher-item:hover{background:#f2f2f7}",
      ".proj-switcher-item.active{background:#f0f4ff;color:#1e5cfb;font-weight:600}",
      ".proj-switcher-item.active .proj-check{opacity:1}",
      ".proj-check{margin-left:auto;color:#1e5cfb;opacity:0;font-size:14px}",
      ".proj-switcher-new{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:15px;color:#1e5cfb;font-weight:600;background:transparent;border:none;width:100%;text-align:left;font-family:inherit;transition:background .15s;border-top:1px solid #f2f2f7;margin-top:4px}",
      ".proj-switcher-new:hover{background:#f2f2f7}",
      ".cp-topbar-left{cursor:pointer;padding:4px 8px;border-radius:8px;transition:background .15s;margin-left:-8px}",
      ".cp-topbar-left:hover{background:rgba(0,0,0,0.04)}",
      ".project-name{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}",
      ".proj-menu-btn{background:none;border:none;cursor:pointer;padding:2px 5px;border-radius:6px;color:#737378;font-size:13px;letter-spacing:1px;line-height:1;opacity:0;flex-shrink:0;font-family:inherit}",
      ".project-row:hover .proj-menu-btn,.project-row.active .proj-menu-btn{opacity:1}",
      ".proj-menu-btn:hover{background:rgba(0,0,0,.06)}",
      // Sidebar footer — pushed to bottom
      ".cp-sidebar-footer{padding:12px 16px;border-top:1px solid #f2f2f7;flex-shrink:0;margin-top:auto}",
      ".cp-ai-counter{margin-bottom:4px;cursor:pointer}",
      ".cp-ai-counter-title{display:flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:#000;margin-bottom:6px}",
      ".cp-ai-counter-title-ico{width:16px;height:16px;border-radius:50%;border:1.5px solid #c7c7cc;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#8e8e93;font-weight:700;line-height:1;flex-shrink:0}",
      ".cp-ai-counter-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}",
      ".cp-ai-counter-val{font-size:20px;font-weight:600;color:#000;line-height:1.1}",
      ".cp-ai-counter-arrow{color:#1e5cfb;display:flex;align-items:center}",
      ".cp-progress-track{background:#e5e5ea;height:6px;border-radius:100px;overflow:hidden}",
      ".cp-progress-fill{background:#13cd25;border-radius:100px;height:100%;transition:width .6s}",
      ".cp-ai-trial-badge{display:inline-block;font-size:11px;color:#737378;margin-top:6px}",
      // ── Main content ───────────────────────────────────────────────────────
      ".cp-main{margin-left:321px;flex:1;min-height:100vh;display:flex;flex-direction:column;background:#f9f9fb;overflow:hidden}",
      ".cp-topbar{height:68px;background:transparent;display:flex;align-items:center;justify-content:space-between;padding:0 24px;flex-shrink:0;gap:12px}",
      ".cp-topbar-left{display:flex;align-items:center;gap:8px;min-width:0}",
      ".cp-topbar-title{font-size:16px;font-weight:500;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".cp-topbar-meta{font-size:16px;color:rgba(60,60,67,0.72)}",
      ".cp-topbar-right{display:flex;align-items:center;gap:8px;flex-shrink:0}",
      ".cp-content{flex:1;overflow-y:auto;padding:0 24px 24px}",
      // ── Desktop project/bot switcher ───────────────────────────────────────
      ".cp-desk-switcher{display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 12px 6px 6px;border-radius:12px;border:none;background:none;font-family:inherit;transition:background .15s;-webkit-tap-highlight-color:transparent;}",
      ".cp-desk-switcher:hover{background:rgba(0,0,0,0.05)}",
      ".cp-desk-sw-av{width:42px;height:42px;border-radius:50%;background:#a5b4fc;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0;box-shadow:0 2px 8px rgba(99,102,241,0.25)}",
      ".cp-desk-sw-name{font-size:1.15rem;font-weight:700;color:#1e5cfb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px}",
      ".cp-desk-sw-arrow{font-size:14px;color:#8e8e93;flex-shrink:0;transition:transform 0.2s;margin-left:2px}",
      ".cp-desk-sw-arrow.open{transform:rotate(180deg)}",
      // ── Cards ─────────────────────────────────────────────────────────────
      ".projects-card{background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:16px}",
      ".cardHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:12px;border-bottom:1px solid #e5e5ea;margin-bottom:16px}",
      ".cardHead h2{margin:0;font-size:16px;font-weight:500;color:#000}",
      ".muted{color:#737378;font-size:14px}",
      // ── Buttons ───────────────────────────────────────────────────────────
      ".projects-btn{border:1px solid #e5e5ea;background:#fff;border-radius:8px;padding:0 12px;font-size:16px;font-weight:400;cursor:pointer;height:32px;font-family:'Inter',sans-serif;display:inline-flex;align-items:center;gap:6px;transition:background .15s,border-color .15s;color:#000;white-space:nowrap}",
      ".projects-btn:hover{background:#f2f2f7}",
      ".projects-btn.primary{background:#1e5cfb;color:#fff;border-color:#1e5cfb;font-weight:500}",
      ".projects-btn.primary:hover{background:#1448d4;border-color:#1448d4}",
      ".projects-btn:disabled{opacity:.55;cursor:not-allowed}",
      ".projects-danger{border:1px solid #e5e5ea;background:#fff;color:#ff3b30;font-family:'Inter',sans-serif}",
      ".projects-danger:hover{background:#fff1f0;border-color:#fecaca}",
      // ── Forms ─────────────────────────────────────────────────────────────
      ".projects-form{display:grid;gap:12px;max-width:760px}",
      ".projects-form label{font-size:14px;color:#737378;font-weight:400;display:block;margin-bottom:4px}",
      ".projects-form input,.projects-form textarea,.projects-form select{width:100%;border:1px solid #e5e5ea;border-radius:8px;padding:8px 12px;font-size:16px;font-family:'Inter',sans-serif;color:#000;outline:none;background:#fff;transition:border-color .15s}",
      ".projects-form input:focus,.projects-form textarea:focus{border-color:#1e5cfb}",
      ".projects-form textarea{min-height:120px;resize:vertical}",
      // ── Search / select ───────────────────────────────────────────────────
      ".search{height:32px;border-radius:8px;border:1px solid #e5e5ea;background:transparent;padding:0 12px;color:#000;outline:none;font-size:16px;font-family:'Inter',sans-serif;transition:border-color .15s}",
      ".search:focus{border-color:#1e5cfb}",
      ".select{height:32px;border-radius:8px;border:1px solid #e5e5ea;background:#fff;padding:0 10px;color:#000;outline:none;font-size:16px;font-family:'Inter',sans-serif}",
      // ── Tools row ─────────────────────────────────────────────────────────
      ".projects-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}",
      ".projects-top-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      // ── Virtual list ──────────────────────────────────────────────────────
      ".projects-virtual{position:relative;height:520px;overflow:auto;border:1px solid #e5e5ea;border-radius:12px;background:#fff}",
      ".projects-virtual-spacer{position:relative;width:100%}",
      ".projects-load-more{margin-top:12px;display:flex;justify-content:center}",
      // ── Chat/source grids ─────────────────────────────────────────────────
      ".projects-chat-grid{display:grid;grid-template-columns:1fr 320px;gap:16px}",
      ".projects-status-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      ".projects-kpi{border:1px solid #e5e5ea;border-radius:12px;background:#f9f9fb;padding:12px;min-height:72px;display:flex;flex-direction:column;justify-content:space-between}",
      ".projects-kpi-k{font-size:14px;color:#737378;font-weight:400}",
      ".projects-kpi-v{font-size:22px;font-weight:700;color:#000}",
      ".projects-hint{padding-top:12px;margin-top:12px;border-top:1px solid #e5e5ea;color:#737378;font-size:14px;line-height:1.5}",
      ".projects-grid{display:grid;gap:12px}",
      ".projects-list-items{display:flex;flex-direction:column;gap:10px;margin-top:12px}",
      ".projects-item{border:1px solid #e5e5ea;border-radius:12px;padding:12px;display:flex;justify-content:space-between;gap:12px;background:#fff}",
      ".projects-item h4{margin:0;font-size:16px;font-weight:500;color:#000}",
      ".projects-item p{margin:4px 0 0;font-size:14px;color:#737378}",
      ".projects-status{border:1px solid #e5e5ea;border-radius:9999px;padding:4px 10px;font-size:12px;background:#f9f9fb;color:#737378}",
      ".projects-bottom-bar{position:sticky;bottom:0;margin-top:12px;padding:10px;background:rgba(249,249,251,.9);backdrop-filter:blur(8px);border:1px solid #e5e5ea;border-radius:16px;display:none;gap:10px}",
      ".projects-bottom-bar .projects-btn{flex:1;justify-content:center}",
      // ── Empty state ───────────────────────────────────────────────────────
      ".projects-empty{border:1.5px dashed #d1d1d6;border-radius:16px;min-height:300px;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:#fff}",
      ".projects-empty h3{margin:0 0 8px;font-size:22px;font-weight:700;color:#000}",
      ".projects-empty p{margin:0;color:#737378;font-size:16px;line-height:1.5}",
      // ── Confirm dialog ────────────────────────────────────────────────────
      ".del-confirm-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:999999;padding:20px}",
      ".del-confirm-modal{background:#fff;border-radius:16px;padding:24px;width:min(380px,100%);box-shadow:0 8px 24px rgba(0,0,0,.12)}",
      ".del-confirm-title{font-size:18px;font-weight:700;margin:0 0 10px;color:#000}",
      ".del-confirm-body{font-size:16px;color:rgba(60,60,67,0.72);line-height:1.5;margin:0 0 20px}",
      ".del-confirm-btns{display:flex;justify-content:flex-end;gap:8px}",
      ".del-cancel-btn{background:#fff;border:1px solid #e5e5ea;border-radius:8px;padding:0 16px;height:32px;font-size:16px;cursor:pointer;font-weight:400;font-family:'Inter',sans-serif;display:inline-flex;align-items:center}",
      ".del-cancel-btn:hover{background:#f2f2f7}",
      ".del-ok-btn{background:#ff3b30;color:#fff;border:none;border-radius:8px;padding:0 16px;height:32px;font-size:16px;cursor:pointer;font-weight:500;font-family:'Inter',sans-serif;display:inline-flex;align-items:center}",
      ".del-ok-btn:hover{background:#d70015}",
      ".del-ok-btn-primary{background:#1e5cfb;color:#fff;border:none;border-radius:8px;padding:0 16px;height:32px;font-size:16px;cursor:pointer;font-weight:500;font-family:'Inter',sans-serif;display:inline-flex;align-items:center}",
      ".del-ok-btn-primary:hover{background:#1448d4}",
      ".del-confirm-input{width:100%;box-sizing:border-box;border:1px solid #e5e5ea;border-radius:8px;padding:8px 12px;font-size:16px;font-family:'Inter',sans-serif;margin-bottom:16px;outline:none}",
      ".del-confirm-input:focus{border-color:#1e5cfb}",
      // ── Training banner ────────────────────────────────────────────────────
      ".cp-training-banner{display:flex;align-items:center;gap:10px;background:#eef2ff;border-radius:14px;padding:14px 18px;margin-bottom:16px;font-size:15px;font-weight:500;color:#1e5cfb}",
      ".cp-training-spinner{width:20px;height:20px;border:2.5px solid rgba(30,92,251,.25);border-top-color:#1e5cfb;border-radius:50%;animation:cp-spin .7s linear infinite;flex-shrink:0}",
      "@keyframes cp-spin{to{transform:rotate(360deg)}}",
      // ── Processing view (3 steps) ──────────────────────────────────────────
      ".cp-proc-view{max-width:560px;padding:8px 0 24px}",
      ".cp-proc-title{font-size:24px;font-weight:700;color:#000;letter-spacing:-.03em;margin-bottom:20px}",
      ".cp-proc-step{background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:20px;margin-bottom:12px}",
      ".cp-proc-step-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}",
      ".cp-proc-icon{width:44px;height:44px;background:#f2f2f7;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}",
      ".cp-proc-step-name{font-size:17px;font-weight:600;color:#000;margin-bottom:4px;line-height:1.2}",
      ".cp-proc-step-desc{font-size:14px;color:rgba(60,60,67,.72);line-height:1.4}",
      ".cp-proc-track{height:6px;background:#e5e5ea;border-radius:3px;overflow:hidden}",
      ".cp-proc-fill{height:100%;border-radius:3px;width:0;transition:width .4s ease}",
      ".cp-proc-fill-green{background:#34c759}",
      ".cp-proc-fill-blue{background:#1e5cfb}",
      ".cp-proc-fill-gray{background:#8e8e93;width:8px;border-radius:50%}",
      // ── Status badges ─────────────────────────────────────────────────────
      ".src-status-ready{background:#dcfce7!important;color:#16a34a!important;border-color:#bbf7d0!important}",
      ".src-status-failed{background:#ffe5e5!important;color:#ff3b30!important;border-color:#fecaca!important}",
      ".src-status-processing{background:#fffbeb!important;color:#b45309!important;border-color:#fde68a!important}",
      ".src-status-pending{background:#f2f2f7!important;color:#737378!important;border-color:#e5e5ea!important}",
      ".src-preview-btn{padding:4px 10px!important;font-size:14px!important}",
      ".src-retry-btn{padding:4px 10px!important;font-size:14px!important;white-space:nowrap}",
      ".src-preview-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px}",
      ".src-preview-box{background:#fff;border-radius:16px;padding:24px;max-width:680px;width:100%;max-height:80vh;display:flex;flex-direction:column;gap:12px;box-shadow:0 8px 24px rgba(0,0,0,.12)}",
      ".src-preview-title{font-size:16px;font-weight:700;margin:0;color:#000}",
      ".src-preview-body{overflow-y:auto;flex:1;font-size:14px;line-height:1.6;color:rgba(60,60,67,0.72);white-space:pre-wrap;border:1px solid #e5e5ea;border-radius:8px;padding:12px;background:#f9f9fb}",
      ".src-preview-footer{display:flex;justify-content:flex-end;gap:8px}",
      // ── Source / create modals ─────────────────────────────────────────────
      ".projects-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center;z-index:100001;padding:18px}",
      ".projects-modal-bg.open{display:flex}",
      ".projects-modal{width:min(640px,100%);border:1px solid #e5e5ea;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.12);display:flex;flex-direction:column;max-height:92dvh}",
      ".projects-modal-h{padding:16px;border-bottom:1px solid #e5e5ea;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}",
      ".projects-modal-b{padding:16px;overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1}",
      ".projects-modal-f{padding:12px 16px;border-top:1px solid #e5e5ea;background:#f9f9fb;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0}",
      ".src-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center;z-index:100001;padding:18px}",
      ".src-modal-bg.open{display:flex}",
      ".src-modal{width:min(560px,100%);border:1px solid #e5e5ea;border-radius:20px;background:#fff;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.16);display:flex;flex-direction:column;max-height:82dvh}",
      ".src-modal-h{padding:12px 14px;display:flex;align-items:center;gap:8px}",
      ".src-back-btn{background:none;border:none;cursor:pointer;font-size:18px;color:#737378;padding:4px 8px;border-radius:8px;line-height:1}",
      ".src-back-btn:hover{background:#f2f2f7}",
      ".src-modal-title{font-size:16px;font-weight:700;flex:1;color:#000}",
      ".src-close-btn{background:#f2f2f7;border:none;cursor:pointer;font-size:18px;color:#9ca3af;width:32px;height:32px;border-radius:999px;line-height:1;display:inline-flex;align-items:center;justify-content:center}",
      ".src-close-btn:hover{background:#e5e7eb;color:#6b7280}",
      ".src-modal-b{padding:0 14px 14px;display:flex;flex-direction:column;gap:8px;overflow:auto}",
      ".src-modal-f{padding:12px 16px;border-top:1px solid #e5e5ea;display:flex;justify-content:flex-end;gap:8px}",
      ".src-main-title{font-size:40px;line-height:1.08;font-weight:700;color:#000;margin:0 0 2px}",
      ".src-drop-zone-main{border:1.5px dashed #d1d1d6;border-radius:18px;min-height:176px;background:#f9f9fb;gap:8px;padding:12px}",
      ".src-drop-zone-main:hover,.src-drop-zone-main.drag-over{background:#f6f8ff}",
      ".src-drop-plus{width:38px;height:38px;border-radius:10px;background:#eef0f5;color:#111;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:300;line-height:1}",
      ".src-drop-main{font-size:15px;line-height:1.24;font-weight:600;color:#111;text-align:center;max-width:520px}",
      ".src-drop-main-accent{color:#2563eb}",
      ".src-drop-sub{font-size:10px;line-height:1.28;color:#6b7280;text-align:center;max-width:520px}",
      ".src-main-actions{display:none}",
      ".src-main-action{height:34px;padding:0 14px;border:1px solid #dbe4ff;border-radius:999px;background:#eef2ff;color:#1d4ed8;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif}",
      ".src-main-action:hover{background:#e1e9ff}",
      // ── Chat Viewer Modal ──────────────────────────────────────────
      ".chat-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center;z-index:100001;padding:18px}",
      ".chat-modal-bg.open{display:flex}",
      ".chat-modal{width:min(640px,100%);height:auto;max-height:90vh;display:flex;flex-direction:column;border:1px solid #e5e5ea;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.12)}",
      ".chat-modal-h{padding:16px;border-bottom:1px solid #e5e5ea;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}",
      ".chat-modal-title{font-size:16px;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:400px}",
      ".chat-modal-title-sub{font-size:12px;color:#8e8e93;font-weight:400;margin-top:2px}",
      ".chat-modal-actions{display:flex;align-items:center;gap:4px}",
      ".chat-modal-icon-btn{background:none;border:none;color:#8e8e93;cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .15s}",
      ".chat-modal-icon-btn:hover{background:#f2f2f7;color:#000}",
      ".chat-modal-b{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;background:#f2f2f7}",
      ".chat-msg{display:flex;flex-direction:column;max-width:85%}",
      ".chat-msg.bot{align-self:flex-start}",
      ".chat-msg.user{align-self:flex-end}",
      ".chat-msg-bubble{padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.4;word-wrap:break-word;white-space:pre-wrap}",
      ".chat-msg.bot .chat-msg-bubble{background:#fff;color:#000;border:1px solid #e5e5ea;border-bottom-left-radius:4px}",
      ".chat-msg.user .chat-msg-bubble{background:#1e5cfb;color:#fff;border-bottom-right-radius:4px}",
      ".chat-msg-time{font-size:10px;color:#8e8e93;margin-top:4px;padding:0 4px}",
      ".chat-msg.user .chat-msg-time{text-align:right}",
      "@media (max-width: 680px) {",
      "  .chat-modal-bg{align-items:flex-end;padding:0!important}",
      "  .chat-modal{width:100%;height:94dvh;max-height:94dvh;border-radius:20px 20px 0 0!important}",
      "}",
      ".src-drop-zone{border:1.5px dashed #d1d1d6;border-radius:12px;min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;transition:border-color .15s,background .15s;user-select:none}",
      ".src-drop-zone:hover,.src-drop-zone.drag-over{border-color:#1e5cfb;background:#e8effe}",
      ".src-drop-icon{display:flex;align-items:center;justify-content:center;margin-bottom:2px}",
      ".src-drop-text{font-size:14px;color:rgba(60,60,67,0.4);text-align:center;padding:0 16px}",
      ".src-type-btns{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}",
      ".src-type-btn{border:1px solid #e5e5ea;border-radius:12px;padding:16px 10px;text-align:center;cursor:pointer;background:#f9f9fb;transition:border-color .15s,background .15s}",
      ".src-type-btn:hover{border-color:#1e5cfb;background:#fff}",
      ".src-type-icon{display:flex;align-items:center;justify-content:center;margin-bottom:8px}",
      ".src-type-label{font-size:14px;font-weight:500;color:#000}",
      // ── Telegram Modal ────────────────────────────────────────────────────
      ".tg-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center;z-index:100001;padding:18px}",
      ".tg-modal-bg.open{display:flex}",
      ".tg-modal{width:min(500px,100%);max-height:90vh;display:flex;flex-direction:column;border:1px solid #e5e5ea;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.12)}",
      ".tg-modal-h{padding:20px 24px 16px;display:flex;justify-content:space-between;align-items:flex-start}",
      ".tg-modal-title{font-size:20px;font-weight:700;color:#000;line-height:1.2;margin:0}",
      ".tg-modal-close{background:none;border:none;color:#8e8e93;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .15s;margin-top:-4px;margin-right:-8px}",
      ".tg-modal-close:hover{background:#f2f2f7;color:#000}",
      ".tg-modal-b{flex:1;overflow-y:auto;padding:0 24px 24px;display:flex;flex-direction:column;gap:20px}",
      ".tg-tabs{display:flex;background:#f2f2f7;border-radius:10px;padding:3px;margin-bottom:4px}",
      ".tg-tab{flex:1;text-align:center;padding:8px 0;font-size:14px;font-weight:500;color:#8e8e93;cursor:pointer;border-radius:8px;transition:all .2s ease}",
      ".tg-tab.active{background:#fff;color:#000;box-shadow:0 1px 3px rgba(0,0,0,0.1)}",
      ".tg-step-list{display:flex;flex-direction:column;gap:16px}",
      ".tg-step{display:flex;gap:12px}",
      ".tg-step-num{flex-shrink:0;width:28px;height:28px;border-radius:50%;background:#f2f2f7;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#000}",
      ".tg-step-text{font-size:15px;line-height:1.4;color:#000;margin-top:3px}",
      ".tg-step-text a{color:#1e5cfb;text-decoration:none}",
      ".tg-step-text a:hover{text-decoration:underline}",
      ".tg-step-text b{font-weight:600}",
      ".tg-input-wrap{margin-top:8px}",
      ".tg-input{width:100%;border:1px solid #e5e5ea;border-radius:12px;padding:14px 16px;font-size:15px;outline:none;transition:border-color .2s}",
      ".tg-input:focus{border-color:#1e5cfb}",
      ".tg-btn{width:100%;background:#1e5cfb;color:#fff;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s}",
      ".tg-btn:hover{background:#154be0}",
      ".tg-btn:disabled{opacity:0.6;cursor:not-allowed}",
      // ── Source table view ─────────────────────────────────────────────────
      ".cp-src-stats{display:flex;gap:12px;margin-bottom:20px}",
      ".cp-src-stat{flex:1;background:#fff;border:1px solid #e5e5ea;border-radius:12px;padding:16px 20px}",
      ".cp-src-stat-val{font-size:24px;font-weight:700;color:#000;letter-spacing:-0.03em;line-height:1}",
      ".cp-src-stat-label{font-size:12px;color:#737378;margin-top:4px;font-weight:500}",
      ".cp-src-table-wrap{background:#fff;border:1px solid #e5e5ea;border-radius:16px;overflow:hidden;margin-bottom:8px}",
      ".cp-src-thead{display:grid;grid-template-columns:44px 1fr 120px 100px 44px;padding:0 16px;background:#f9f9fb;border-bottom:1px solid #e5e5ea}",
      ".cp-src-thead-cell{padding:10px 8px;font-size:11px;font-weight:600;color:#737378;text-transform:uppercase;letter-spacing:0.06em}",
      ".cp-src-tbody{max-height:560px;overflow-y:auto}",
      ".cp-src-trow{display:grid;grid-template-columns:44px 1fr 120px 100px 44px;padding:0 16px;border-bottom:1px solid #f2f2f7;align-items:center;transition:background .1s}",
      ".cp-src-trow:last-child{border-bottom:none}",
      ".cp-src-trow:hover{background:#f9f9fb}",
      ".cp-src-cell{padding:13px 8px;font-size:14px}",
      ".cp-src-idx{color:#9e9eb0;font-size:12px;font-family:monospace}",
      ".cp-src-title-text{font-weight:500;color:#000;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}",
      ".cp-src-sub-text{font-size:12px;color:#737378;margin-top:2px}",
      ".cp-src-date-text{font-size:13px;color:#737378}",
      ".cp-src-actions-cell{display:flex;justify-content:flex-end;align-items:center}",
      ".cp-src-more-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:8px;cursor:pointer;color:#737378;transition:all .15s;flex-shrink:0}",
      ".cp-src-more-btn:hover{background:#f2f2f7;color:#000}",
      ".cp-src-dd{position:fixed;background:#fff;border:1px solid #e5e5ea;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.10);min-width:200px;padding:4px;z-index:99999}",
      ".cp-src-dd-item{display:flex;align-items:center;gap:10px;padding:9px 12px;font-size:14px;font-weight:500;color:#000;border:none;background:none;width:100%;text-align:left;cursor:pointer;border-radius:6px;font-family:'Inter',sans-serif;transition:background .1s}",
      ".cp-src-dd-item:hover{background:#f2f2f7}",
      ".cp-src-dd-danger{color:#ff3b30!important}",
      ".cp-src-dd-danger:hover{background:#fff1f0!important}",
      ".cp-src-dd-sep{height:1px;background:#e5e5ea;margin:4px 0}",
      // ── KB topics view (editable Q&A) ───────────────────────────────────
      ".cp-kb-topics-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}",
      ".cp-kb-title{font-size:20px;font-weight:700;color:var(--ds-neutral-900);line-height:1.25;letter-spacing:-0.01em;display:flex;align-items:baseline;gap:8px}",
      ".cp-kb-title-count{font-size:16px;font-weight:500;color:var(--ds-neutral-500);line-height:1}",
      ".cp-kb-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".cp-kb-toolbar .projects-btn{height:44px;border-radius:14px;padding:0 16px;font-size:14px;font-weight:500}",
      ".cp-kb-toolbar .projects-btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(30,92,251,.18)}",
      ".cp-kb-search-wrap{height:44px;min-width:280px;border-radius:14px;border:1px solid var(--ds-neutral-200);background:var(--ds-neutral-0);display:flex;align-items:center;gap:10px;padding:0 12px}",
      ".cp-kb-search-wrap:focus-within{border-color:var(--ds-primary);box-shadow:0 0 0 3px rgba(30,92,251,.14)}",
      ".cp-kb-search-ico{color:var(--ds-neutral-700);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}",
      ".cp-kb-search{height:100%;min-width:0;flex:1;border:none;background:transparent;padding:0;color:var(--ds-neutral-900);outline:none;font-size:14px;font-family:'Inter',sans-serif}",
      ".cp-kb-search::placeholder{color:var(--ds-neutral-400)}",
      ".cp-kb-sort-wrap{display:flex;align-items:center;gap:8px}",
      ".cp-kb-sort-switch{height:44px;border-radius:14px;border:1px solid var(--ds-neutral-200);background:var(--ds-neutral-100);display:flex;align-items:center;padding:4px;gap:4px}",
      ".cp-kb-sort-btn{width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:var(--ds-neutral-500);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .15s ease}",
      ".cp-kb-sort-btn:hover{background:var(--ds-neutral-0);color:var(--ds-neutral-700)}",
      ".cp-kb-sort-btn.active{background:var(--ds-neutral-0);color:var(--ds-neutral-700);box-shadow:0 1px 2px rgba(0,0,0,.04)}",
      ".cp-kb-sort-label{font-size:16px;font-weight:500;color:var(--ds-neutral-700)}",
      ".cp-kb-table-wrap{background:var(--ds-neutral-0);border:1px solid var(--ds-neutral-200);border-radius:14px;overflow:hidden}",
      ".cp-kb-headrow{display:grid;grid-template-columns:minmax(0,1fr) 140px 160px 44px;padding:0 16px;background:var(--ds-neutral-0);border-bottom:1px solid var(--ds-neutral-200)}",
      ".cp-kb-headcell{padding:10px 8px;font-size:14px;font-weight:500;color:var(--ds-neutral-500)}",
      ".kb-head-title{text-align:left}",
      ".kb-head-chats,.kb-head-last,.kb-head-menu{text-align:right;justify-self:end;white-space:nowrap}",
      ".cp-kb-body{max-height:66dvh;overflow:auto}",
      ".cp-kb-row{display:grid;grid-template-columns:minmax(0,1fr) 140px 160px 44px;padding:0 16px;border-bottom:1px solid var(--ds-neutral-100);align-items:center;transition:background .15s ease;min-height:52px;gap:12px}",
      ".cp-kb-row:last-child{border-bottom:none}",
      ".cp-kb-row:hover{background:var(--ds-neutral-50)}",
      ".cp-kb-cell{padding:10px 8px;font-size:14px;color:var(--ds-neutral-900)}",
      ".cp-kb-topic{min-width:0;display:flex;align-items:center;gap:10px}",
      ".kb-topic-ico{color:var(--ds-neutral-300);flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}",
      ".kb-topic-title{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;line-height:1.5;font-weight:600;color:var(--ds-neutral-900)}",
      ".cp-kb-chats,.cp-kb-last{justify-self:end;white-space:nowrap}",
      ".cp-kb-chats{font-size:12px;color:var(--ds-neutral-400);display:flex;align-items:center;gap:6px}",
      ".cp-kb-last{font-size:12px;color:var(--ds-neutral-400)}",
      ".cp-kb-more-btn{width:36px;height:36px;display:grid;place-items:center;border:none;background:transparent;border-radius:10px;cursor:pointer;color:var(--ds-neutral-900);transition:all .15s;flex-shrink:0;justify-self:end}",
      ".cp-kb-more-btn:hover{background:var(--ds-neutral-100)}",
      ".cp-kb-empty{background:var(--ds-neutral-0);border:1px solid var(--ds-neutral-200);border-radius:14px;padding:30px 24px;text-align:center;color:var(--ds-neutral-500)}",
      ".cp-kb-empty h3{margin:0 0 8px;font-size:20px;color:var(--ds-neutral-900)}",
      ".cp-kb-empty p{margin:0;font-size:14px;line-height:1.5}",
      "@media (max-width: 640px){.cp-kb-headrow{grid-template-columns:minmax(0,1fr) 92px 44px;padding:0 8px}.cp-kb-row{grid-template-columns:minmax(0,1fr) 92px 44px;padding:0 8px;gap:8px}.kb-head-last,.cp-kb-last{display:none}}",
      // ── KB edit modal ────────────────────────────────────────────────────
      ".kb-edit-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:100005;padding:20px}",
      ".kb-edit-card{width:min(1200px,100%);max-height:94dvh;display:flex;flex-direction:column;background:#fff;border:1px solid #e5e5ea;border-radius:24px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.2)}",
      ".kb-edit-head{padding:20px 26px 4px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0}",
      ".kb-edit-title{margin:0;font-size:56px;line-height:1.02;font-weight:700;color:#000;letter-spacing:-0.03em}",
      ".kb-edit-close{background:#f2f2f7;border:none;cursor:pointer;font-size:34px;color:#9ca3af;width:50px;height:50px;border-radius:999px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}",
      ".kb-edit-close:hover{background:#e5e7eb;color:#6b7280}",
      ".kb-edit-body{padding:8px 26px 24px;display:flex;flex-direction:column;gap:16px;overflow:auto}",
      ".kb-edit-qa{display:flex;flex-direction:column;gap:12px}",
      ".kb-edit-qrow,.kb-edit-arow{display:flex;align-items:flex-start;gap:12px}",
      ".kb-edit-icon,.kb-edit-avatar{width:40px;height:40px;border-radius:50%;background:#f2f2f7;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:18px;flex-shrink:0}",
      ".kb-edit-qtxt{font-size:20px;font-weight:500;color:#8e8e93;line-height:1.22;word-break:break-word}",
      ".kb-edit-atxt{font-size:20px;font-weight:500;color:#111;line-height:1.25;word-break:break-word}",
      ".kb-edit-tabs{display:flex;gap:10px}",
      ".kb-edit-tab{height:56px;padding:0 28px;border:none;border-radius:28px;background:transparent;color:#8e8e93;font-size:20px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;line-height:1}",
      ".kb-edit-tab.active{background:#f2f2f7;color:#000}",
      ".kb-edit-hint{display:flex;align-items:flex-start;gap:12px;background:#e8efff;border-radius:16px;padding:14px 16px}",
      ".kb-edit-hint-ico{width:34px;height:34px;border-radius:999px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;flex-shrink:0}",
      ".kb-edit-hint-text{font-size:16px;color:#111;line-height:1.3;word-break:break-word}",
      ".kb-edit-area-wrap{position:relative}",
      ".kb-edit-area{width:100%;min-height:190px;border:1px solid #e5e5ea;border-radius:16px;padding:18px 20px 54px;font-size:18px;line-height:1.4;font-family:'Inter',sans-serif;color:#111;outline:none;resize:vertical;background:#fff}",
      ".kb-edit-area:focus{border-color:#1e5cfb}",
      ".kb-edit-mic{position:absolute;right:14px;bottom:14px;width:44px;height:44px;border-radius:12px;border:none;background:#f2f2f7;color:#6b7280;font-size:28px;line-height:1;display:flex;align-items:center;justify-content:center;pointer-events:none}",
      ".kb-edit-foot{display:flex;align-items:center;justify-content:space-between;gap:12px}",
      ".kb-edit-insert{border:none;background:none;color:#1e5cfb;font-size:16px;cursor:pointer;padding:0;font-family:'Inter',sans-serif}",
      ".kb-edit-save{height:56px;min-width:180px;border:none;border-radius:16px;background:#1e5cfb;color:#fff;font-size:20px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;padding:0 24px}",
      ".kb-edit-save:disabled{background:#e5e7eb;color:#a1a1aa;cursor:not-allowed}",
      // ── Dropdown ──────────────────────────────────────────────────────────
      ".proj-dropdown{position:fixed;min-width:210px;background:#fff;border:1px solid #e5e5ea;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.10);padding:4px;z-index:100001}",
      ".proj-dd-item{display:flex;align-items:center;gap:8px;padding:0 8px;height:36px;border-radius:6px;font-size:16px;cursor:pointer;color:#000;white-space:nowrap}",
      ".proj-dd-item:hover{background:#f2f2f7}",
      ".proj-dd-sep{height:1px;background:#e5e5ea;margin:4px 0}",
      ".proj-dd-danger{color:#ff3b30}",
      ".proj-dd-danger:hover{background:#fff1f0}",
      // ── Analytics ─────────────────────────────────────────────────────────
      ".cp-period-bar{display:flex;gap:4px;margin-bottom:20px}",
      ".cp-period-btn{background:none;border:none;cursor:pointer;padding:4px 10px;border-radius:20px;font-size:14px;font-weight:400;color:#737378;font-family:'Inter',sans-serif;transition:all .15s}",
      ".cp-period-btn:hover{background:#f2f2f7;color:#000}",
      ".cp-period-btn.active{color:#1e5cfb;font-weight:600;background:transparent}",
      ".cp-analytics-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}",
      ".cp-analytics-kpi{background:#fff;border:1px solid #e5e5ea;border-radius:12px;padding:16px}",
      ".cp-analytics-kpi-label{font-size:13px;color:#737378;margin-bottom:8px}",
      ".cp-analytics-kpi-value{font-size:28px;font-weight:700;color:#000;line-height:1}",
      ".cp-analytics-kpi-sub{font-size:12px;color:#737378;margin-top:4px}",
      ".cp-gauge-card{background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:20px;display:grid;grid-template-columns:220px 1fr;gap:24px;align-items:center;margin-bottom:20px}",
      ".cp-gauge-svg{display:block;margin:0 auto}",
      ".cp-gauge-stats{display:flex;flex-direction:column;gap:12px}",
      ".cp-gauge-pct{font-size:40px;font-weight:800;color:#000;line-height:1}",
      ".cp-gauge-desc{font-size:14px;color:#737378;margin-top:2px}",
      ".cp-gauge-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px}",
      ".cp-gauge-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}",
      ".cp-gauge-row-label{flex:1;color:rgba(60,60,67,0.72)}",
      ".cp-gauge-row-val{font-weight:600;color:#000}",
      ".cp-questions-section{background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:20px;margin-bottom:16px}",
      ".cp-questions-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}",
      ".cp-questions-title{font-size:18px;font-weight:700;color:#000}",
      ".cp-questions-count{font-size:18px;font-weight:700;color:#000;margin-left:8px}",
      ".cp-questions-link{font-size:14px;color:#1e5cfb;cursor:pointer;text-decoration:none}",
      ".cp-question-card{border:1px solid #e5e5ea;border-radius:12px;padding:14px;margin-bottom:10px}",
      ".cp-question-card-text{font-size:14px;font-weight:500;color:#000;margin-bottom:8px;line-height:1.4}",
      ".cp-question-card-footer{display:flex;align-items:center;justify-content:space-between}",
      ".cp-question-card-count{font-size:13px;color:#737378;display:flex;align-items:center;gap:5px}",
      ".cp-question-add-btn{background:transparent;border:1px solid #1e5cfb;color:#1e5cfb;border-radius:20px;padding:4px 12px;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif;transition:background .15s}",
      ".cp-question-add-btn:hover{background:#e8effe}",
      // ── Testing ───────────────────────────────────────────────────────────
      ".cp-test-wrap{display:grid;grid-template-columns:1fr 300px;gap:16px;height:calc(100vh - 140px)}",
      ".cp-test-chat{background:#fff;border:1px solid #e5e5ea;border-radius:16px;display:flex;flex-direction:column;overflow:hidden}",
      ".cp-test-chat-header{padding:16px;border-bottom:1px solid #e5e5ea;font-size:15px;font-weight:600;color:#000}",
      ".cp-test-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}",
      ".cp-test-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5}",
      ".cp-test-msg-bot{background:#f2f2f7;color:#000;align-self:flex-start;border-radius:4px 12px 12px 12px}",
      ".cp-test-msg-user{background:#1e5cfb;color:#fff;align-self:flex-end;border-radius:12px 4px 12px 12px}",
      ".cp-test-msg-time{font-size:11px;opacity:.55;margin-top:4px;text-align:right}",
      ".cp-test-input-row{padding:12px;border-top:1px solid #e5e5ea;display:flex;gap:8px;align-items:flex-end}",
      ".cp-test-inp{flex:1;border:1px solid #e5e5ea;border-radius:10px;padding:8px 12px;font-size:14px;font-family:'Inter',sans-serif;outline:none;resize:none;min-height:38px;max-height:120px;line-height:1.4;transition:border-color .15s}",
      ".cp-test-inp:focus{border-color:#1e5cfb}",
      ".cp-test-send{width:36px;height:36px;background:#1e5cfb;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}",
      ".cp-test-send:hover{background:#1448d4}",
      ".cp-test-send:disabled{background:#d1d1d6;cursor:not-allowed}",
      ".cp-test-hints{background:#fff;border:1px solid #e5e5ea;border-radius:16px;overflow:hidden;display:flex;flex-direction:column}",
      ".cp-test-hints-title{padding:14px 16px;font-size:14px;font-weight:600;color:#000;border-bottom:1px solid #e5e5ea;flex-shrink:0}",
      ".cp-test-hints-list{overflow-y:auto;flex:1}",
      ".cp-test-hint-item{padding:12px 16px;border-bottom:1px solid #f2f2f7;font-size:13px;color:#000;cursor:pointer;display:flex;align-items:center;gap:10px;transition:background .15s;line-height:1.3}",
      ".cp-test-hint-item:hover{background:#f2f2f7}",
      ".cp-test-hint-item:last-child{border-bottom:none}",
      ".cp-test-typing{display:flex;align-items:center;gap:5px;padding:8px 14px;background:#f2f2f7;border-radius:4px 12px 12px 12px;align-self:flex-start}",
      ".cp-test-typing span{width:6px;height:6px;border-radius:50%;background:#737378;animation:cp-bounce .8s infinite}",
      ".cp-test-typing span:nth-child(2){animation-delay:.15s}",
      ".cp-test-typing span:nth-child(3){animation-delay:.3s}",
      "@keyframes cp-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}",
      // ── Finance view ───────────────────────────────────────────────────────
      ".cp-finance{padding:0}",
      ".cp-finance-title{font-size:22px;font-weight:700;color:#000;margin-bottom:20px;letter-spacing:-.02em}",
      ".cp-fin-kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px}",
      ".cp-fin-kpi{background:#fff;border:1px solid #e5e5ea;border-radius:14px;padding:16px 18px}",
      ".cp-fin-kpi-label{font-size:12px;color:#737378;font-weight:500;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}",
      ".cp-fin-kpi-val{font-size:26px;font-weight:700;color:#000;letter-spacing:-.03em;line-height:1}",
      ".cp-fin-kpi-sub{font-size:12px;color:#737378;margin-top:4px}",
      ".cp-fin-kpi.danger .cp-fin-kpi-val{color:#ff3b30}",
      ".cp-fin-kpi.warning .cp-fin-kpi-val{color:#ffb800}",
      ".cp-fin-chart-card{background:#fff;border:1px solid #e5e5ea;border-radius:14px;padding:20px;margin-bottom:16px}",
      ".cp-fin-chart-title{font-size:14px;font-weight:600;color:#000;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between}",
      ".cp-fin-bars{display:flex;align-items:flex-end;gap:3px;height:100px}",
      ".cp-fin-bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px}",
      ".cp-fin-bar{width:100%;background:#1e5cfb;border-radius:3px 3px 0 0;min-height:2px;transition:height .3s ease}",
      ".cp-fin-bar-lbl{font-size:9px;color:#737378;white-space:nowrap}",
      ".cp-fin-today-bar{background:#34c759}",
      ".cp-fin-table-card{background:#fff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden;margin-bottom:16px}",
      ".cp-fin-table-head{display:grid;grid-template-columns:110px 1fr 1fr 1fr;padding:10px 16px;background:#f9f9fb;border-bottom:1px solid #e5e5ea;font-size:11px;font-weight:600;color:#737378;text-transform:uppercase;letter-spacing:.04em}",
      ".cp-fin-table-row{display:grid;grid-template-columns:110px 1fr 1fr 1fr;padding:10px 16px;border-bottom:1px solid #f2f2f7;font-size:13px;color:#000}",
      ".cp-fin-table-row:last-child{border-bottom:none}",
      ".cp-fin-table-row.today{background:#f0f5ff;font-weight:600}",
      ".cp-fin-openai-row{display:flex;gap:12px;margin-bottom:16px}",
      ".cp-fin-openai-card{flex:1;background:#fff;border:1px solid #e5e5ea;border-radius:14px;padding:16px 18px}",
      // ── Settings sub-tabs ─────────────────────────────────────────────────
      ".cp-settings-subtabs{display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid #e5e5ea}",
      ".cp-settings-subtab{background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-1px;padding:8px 16px;font-size:14px;font-weight:500;color:#737378;cursor:pointer;font-family:'Inter',sans-serif;transition:color .15s,border-color .15s}",
      ".cp-settings-subtab:hover{color:#000}",
      ".cp-settings-subtab.active{color:#1e5cfb;border-bottom-color:#1e5cfb}",
      // ── Toggle switch ─────────────────────────────────────────────────────
      ".cp-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid #f2f2f7}",
      ".cp-toggle-row:last-child{border-bottom:none}",
      ".cp-toggle-info{flex:1;min-width:0}",
      ".cp-toggle-name{font-size:15px;font-weight:500;color:#000;margin-bottom:2px}",
      ".cp-toggle-desc{font-size:13px;color:#737378;line-height:1.4}",
      ".cp-toggle{width:44px;height:26px;border-radius:100px;background:#e5e5ea;border:none;cursor:pointer;position:relative;flex-shrink:0;transition:background .2s;padding:0}",
      ".cp-toggle::after{content:'';position:absolute;width:22px;height:22px;border-radius:50%;background:#fff;top:2px;left:2px;transition:left .2s,box-shadow .2s;box-shadow:0 1px 4px rgba(0,0,0,.2)}",
      ".cp-toggle.on{background:#34c759}",
      ".cp-toggle.on::after{left:20px}",
      ".cp-delay-row{display:flex;align-items:center;gap:10px;margin-top:8px}",
      ".cp-delay-row label{font-size:13px;color:#737378;white-space:nowrap}",
      ".cp-delay-inp{width:70px;border:1px solid #e5e5ea;border-radius:8px;padding:5px 10px;font-size:14px;font-family:'Inter',sans-serif;outline:none;color:#000;transition:border-color .15s}",
      ".cp-delay-inp:focus{border-color:#1e5cfb}",
      // ── Mobile bottom navigation ─────────────────────────────────────────
      ".cp-mobile-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e5ea;z-index:200;padding-bottom:env(safe-area-inset-bottom,0px);height:calc(56px + env(safe-area-inset-bottom,0px))}",
      ".cp-mobile-nav-inner{display:flex;height:56px;align-items:stretch}",
      ".cp-mobile-nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:none;border:none;cursor:pointer;font-size:10px;font-weight:400;color:#8e8e93;padding:4px 2px;font-family:'Inter',sans-serif;transition:color .15s;-webkit-tap-highlight-color:transparent;min-height:44px}",
      ".cp-mobile-nav-item svg{stroke:#8e8e93;transition:stroke .15s}",
      ".cp-mobile-nav-item.active{color:#1e5cfb}",
      ".cp-mobile-nav-item.active svg{stroke:#1e5cfb}",
      ".cp-mob-proj-label{font-size:10px;font-weight:400;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}",
      // ── Mobile project drawer ─────────────────────────────────────────────
      ".cp-mobile-drawer-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;align-items:flex-end;-webkit-tap-highlight-color:transparent}",
      ".cp-mobile-drawer-bg.open{display:flex}",
      ".cp-mobile-drawer{width:100%;background:#fff;border-radius:20px 20px 0 0;padding-bottom:env(safe-area-inset-bottom,0px);max-height:82vh;display:flex;flex-direction:column;animation:cp-drawer-in .22s cubic-bezier(.32,.72,0,1)}",
      "@keyframes cp-drawer-in{from{transform:translateY(100%)}to{transform:translateY(0)}}",
      ".cp-mob-drawer-handle-row{display:flex;justify-content:center;padding:10px 0 4px}",
      ".cp-mob-drawer-handle{width:36px;height:4px;background:#d1d1d6;border-radius:2px}",
      ".cp-mob-drawer-header{display:flex;align-items:center;justify-content:space-between;padding:4px 16px 8px}",
      ".cp-mob-drawer-hdr-title{font-size:17px;font-weight:700;color:#000}",
      ".cp-mob-drawer-close{background:none;border:none;cursor:pointer;font-size:20px;color:#8e8e93;padding:4px;line-height:1;-webkit-tap-highlight-color:transparent}",
      ".cp-mob-drawer-body{overflow-y:auto;flex:1;padding:0 8px 12px;-webkit-overflow-scrolling:touch}",
      ".cp-mob-drawer-add{display:flex;align-items:center;gap:10px;padding:12px 10px;border-radius:12px;background:none;border:none;border-bottom:1px solid #f2f2f7;width:100%;text-align:left;font-size:15px;font-weight:500;color:#1e5cfb;font-family:'Inter',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent;margin-bottom:6px}",
      ".cp-mob-drawer-add:active{background:#f0f5ff}",
      ".cp-mob-proj-item{display:flex;align-items:center;gap:12px;padding:13px 10px;border-radius:12px;background:none;border:none;width:100%;text-align:left;font-size:16px;color:#000;font-family:'Inter',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .1s}",
      ".cp-mob-proj-item:active{background:#f2f2f7}",
      ".cp-mob-proj-item.active{background:#eef2ff}",
      ".cp-mob-proj-name{flex:1;font-size:15px;font-weight:400;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".cp-mob-proj-item.active .cp-mob-proj-name{color:#1e5cfb;font-weight:500}",
      ".cp-mob-proj-dot{width:8px;height:8px;border-radius:50%;background:#d1d1d6;flex-shrink:0}",
      ".cp-mob-proj-item.active .cp-mob-proj-dot{background:#1e5cfb}",
      ".cp-mob-proj-badge{background:#34c759;color:#fff;border-radius:9999px;font-size:10px;font-weight:600;padding:2px 6px;flex-shrink:0}",
      // ── Mobile topbar ────────────────────────────────────────────────────
      ".cp-mob-topbar-proj{display:none;align-items:center;gap:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:6px 10px;border-radius:8px;border:1px solid #e5e5ea;background:#fff;font-family:'Inter',sans-serif;max-width:200px}",
      ".cp-mob-topbar-proj:active{background:#f2f2f7}",
      ".cp-mob-topbar-proj-name{font-size:14px;font-weight:500;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px}",
      ".cp-mob-topbar-chev{color:#8e8e93;flex-shrink:0;font-size:12px}",
      // ── Responsive: Tablet ───────────────────────────────────────────────
      "@media(max-width:980px){.cp-narrow-nav{display:none}.cp-agent-sidebar{left:0;z-index:99}.cp-main{margin-left:248px}.projects-chat-grid{grid-template-columns:1fr}.projects-bottom-bar{display:flex}.cp-analytics-grid{grid-template-columns:1fr 1fr}.cp-gauge-card{grid-template-columns:1fr}.cp-test-wrap{grid-template-columns:1fr}}",
      "@media(max-width:980px){.cp-fin-kpi-row{grid-template-columns:repeat(3,1fr)}}",
      // ── Responsive: Mobile ───────────────────────────────────────────────
      "@media(max-width:680px){" +
      ".cp-narrow-nav,.cp-agent-sidebar{display:none!important}" +
      ".cp-mobile-nav{display:block}" +
      ".cp-mob-topbar-proj{display:inline-flex}" +
      ".cp-topbar-meta{display:none}" +
      ".cp-main{margin-left:0!important;padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))}" +
      ".cp-topbar{padding:0 12px;height:52px;background:#fff;border-bottom:1px solid #f2f2f7;position:sticky;top:0;z-index:10}" +
      ".cp-content{padding:0 12px 20px}" +
      // Chat grid: single column, hide status sidebar on mobile
      ".projects-chat-grid{grid-template-columns:1fr}" +
      ".projects-chat-grid>.projects-card:nth-child(2){display:none}" +
      // Virtual scroll: dynamic height instead of fixed 520px
      ".projects-virtual{height:auto!important;min-height:0!important;max-height:none!important}" +
      ".projects-virtual-spacer{position:static!important}" +
      // Chat search: full width
      ".projects-chat-grid .cardHead{flex-direction:column;align-items:stretch;gap:8px}" +
      ".projects-chat-grid .cardHead>div:last-child{display:flex;gap:6px}" +
      "#projects-chat-q{width:100%!important}" +
      // Bottom bar: above mobile nav
      ".projects-bottom-bar{display:flex;position:sticky;bottom:0;background:#fff;border-top:1px solid #e5e5ea;border-radius:0;margin:0 -12px;padding:10px 12px;z-index:10}" +
      ".cp-analytics-grid{grid-template-columns:1fr 1fr}" +
      ".cp-analytics-kpi{padding:12px}" +
      ".cp-analytics-kpi-value{font-size:22px}" +
      ".cp-gauge-card{grid-template-columns:1fr;padding:14px;gap:12px}" +
      ".cp-fin-kpi-row{grid-template-columns:1fr 1fr}" +
      ".cp-fin-openai-row{flex-direction:column}" +
      ".cp-fin-chart-card{padding:14px}" +
      ".cp-fin-table-head{grid-template-columns:80px 1fr 1fr}" +
      ".cp-fin-table-row{grid-template-columns:80px 1fr 1fr}" +
      ".cp-src-thead{grid-template-columns:1fr 80px 44px!important;padding:0 8px}" +
      ".cp-src-trow{grid-template-columns:1fr 80px 44px!important;padding:0 8px}" +
      ".cp-src-thead-cell:nth-child(2),.cp-src-cell:nth-child(2){display:none}" +
      ".cp-src-thead-cell:nth-child(4),.cp-src-cell:nth-child(4){display:none}" +
      ".cp-src-stats{gap:8px}" +
      ".cp-src-stat{padding:12px 14px}" +
      ".cp-src-stat-val{font-size:20px}" +
      ".cp-test-wrap{grid-template-columns:1fr;height:calc(100dvh - 120px)}" +
      ".cp-test-hints{display:none}" +
      ".cp-test-chat{min-height:300px}" +
      ".projects-modal{border-radius:20px 20px 0 0!important;max-height:94dvh}" +
      ".projects-modal-bg{align-items:flex-end!important;padding:0!important}" +
      ".src-modal{border-radius:20px 20px 0 0!important;max-height:94dvh}" +
      ".src-modal-bg{align-items:flex-end!important;padding:0!important}" +
      ".src-main-title{font-size:24px}" +
      ".src-drop-zone-main{min-height:170px;border-radius:16px;padding:12px 10px}" +
      ".src-drop-plus{width:42px;height:42px;border-radius:10px;font-size:28px}" +
      ".src-drop-main{font-size:14px}" +
      ".src-drop-sub{font-size:11px}" +
      ".src-main-actions{flex-direction:column}" +
      ".src-main-action{width:100%}" +
      ".cp-kb-topics-head{flex-direction:column;align-items:stretch}" +
      ".cp-kb-title{font-size:28px}" +
      ".cp-kb-title-count{font-size:22px}" +
      ".cp-kb-toolbar{width:100%}" +
      ".cp-kb-search{min-width:0;width:100%}" +
      ".cp-kb-headrow{grid-template-columns:minmax(0,1fr) 92px 44px;padding:0 8px}" +
      ".cp-kb-row{grid-template-columns:minmax(0,1fr) 92px 44px;padding:0 8px;gap:8px}" +
      ".kb-head-last,.cp-kb-last{display:none}" +
      ".kb-topic-title{font-size:15px}" +
      ".cp-kb-chats{font-size:13px}" +
      ".kb-edit-bg{padding:0}" +
      ".kb-edit-card{width:100%;height:100dvh;max-height:100dvh;border-radius:20px 20px 0 0}" +
      ".kb-edit-title{font-size:34px}" +
      ".kb-edit-close{width:40px;height:40px;font-size:30px}" +
      ".kb-edit-qtxt{font-size:24px}" +
      ".kb-edit-atxt{font-size:22px}" +
      ".kb-edit-tab{height:46px;font-size:18px;padding:0 14px;border-radius:23px}" +
      ".kb-edit-hint-text{font-size:14px}" +
      ".kb-edit-area{font-size:16px;min-height:140px}" +
      ".kb-edit-insert{font-size:14px}" +
      ".kb-edit-save{font-size:18px;height:52px;min-width:150px}" +
      ".projects-card{border-radius:12px}" +
      ".cp-settings-subtabs{overflow-x:auto;-webkit-overflow-scrolling:touch;flex-wrap:nowrap}" +
      ".cp-settings-subtab{white-space:nowrap}" +
      ".projects-form{gap:10px}" +
      ".cp-questions-section{padding:14px}" +
      ".cp-period-bar{flex-wrap:wrap}" +
      ".cardHead{flex-wrap:wrap;gap:8px}" +
      "}",
      // ── Account menu popup ─────────────────────────────────────────────────
      ".cp-account-menu{position:fixed;bottom:72px;left:16px;width:264px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.15),0 2px 8px rgba(0,0,0,0.06);z-index:2000;display:none;overflow:hidden;border:1px solid #e5e5ea;animation:cpMenuIn .14s ease}",
      "@keyframes cpMenuIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
      ".cp-account-menu.open{display:block}",
      ".cp-acct-menu-hdr{display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid #f2f2f7}",
      ".cp-acct-menu-av{width:40px;height:40px;border-radius:50%;background:#1e5cfb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0}",
      ".cp-acct-menu-info{min-width:0;flex:1}",
      ".cp-acct-menu-name{font-size:14px;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".cp-acct-menu-email{font-size:12px;color:#737378;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}",
      ".cp-acct-menu-body{padding:6px 0}",
      ".cp-acct-menu-item{display:flex;align-items:center;gap:12px;padding:11px 16px;font-size:14px;color:#000;cursor:pointer;border:none;background:none;width:100%;text-align:left;font-family:inherit;transition:background .12s;line-height:1}",
      ".cp-acct-menu-item:hover{background:#f9f9fb}",
      ".cp-acct-menu-item svg{color:#8e8e93;flex-shrink:0}",
      ".cp-acct-menu-item-label{flex:1}",
      ".cp-acct-menu-item-chev{color:#c7c7cc;font-size:14px;font-weight:400}",
      ".cp-acct-menu-sep{height:1px;background:#f2f2f7;margin:4px 0}",
      ".cp-acct-menu-item.danger{color:#ff3b30}",
      ".cp-acct-menu-item.danger svg{color:#ff3b30}",
      // ── Account full page modal ────────────────────────────────────────────
      ".cp-acct-pg-bg{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:3000;display:none;align-items:center;justify-content:center;padding:20px}",
      ".cp-acct-pg-bg.open{display:flex}",
      ".cp-acct-pg{background:#fff;border-radius:20px;width:900px;max-width:100%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.18)}",
      ".cp-acct-pg-hdr{display:flex;align-items:center;justify-content:space-between;padding:20px 28px;border-bottom:1px solid #f2f2f7;flex-shrink:0}",
      ".cp-acct-pg-title{font-size:20px;font-weight:700;color:#000}",
      ".cp-acct-pg-close{width:32px;height:32px;border-radius:8px;border:none;background:#f2f2f7;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;color:#737378;line-height:1;transition:background .12s}",
      ".cp-acct-pg-close:hover{background:#e5e5ea}",
      ".cp-acct-pg-body{display:flex;flex:1;overflow:hidden;min-height:0}",
      ".cp-acct-pg-nav{width:220px;min-width:220px;padding:16px 12px;border-right:1px solid #f2f2f7;display:flex;flex-direction:column;gap:2px;overflow-y:auto}",
      ".cp-acct-pg-nav-item{display:flex;align-items:center;padding:10px 12px;border-radius:10px;font-size:14px;color:rgba(60,60,67,0.72);cursor:pointer;border:none;background:none;text-align:left;font-family:inherit;width:100%;transition:background .12s,color .12s}",
      ".cp-acct-pg-nav-item:hover{background:#f9f9fb;color:#000}",
      ".cp-acct-pg-nav-item.active{background:#f2f2f7;color:#000;font-weight:500}",
      ".cp-acct-pg-content{flex:1;overflow-y:auto;padding:32px}",
      ".cp-acct-section-title{font-size:22px;font-weight:700;color:#000;margin:0 0 24px}",
      ".cp-acct-block{margin-bottom:32px}",
      ".cp-acct-block-title{font-size:18px;font-weight:700;color:#000;margin:0 0 16px}",
      ".cp-acct-field{margin-bottom:14px}",
      ".cp-acct-field label{display:block;font-size:13px;color:#737378;margin-bottom:6px;font-weight:500}",
      ".cp-acct-input{width:100%;box-sizing:border-box;height:44px;border:1px solid #e5e5ea;border-radius:10px;padding:0 14px;font-size:15px;font-family:inherit;color:#000;background:#fff;outline:none;transition:border .15s}",
      ".cp-acct-input:focus{border-color:#1e5cfb}",
      ".cp-acct-input:read-only{background:#f9f9fb;color:#737378;cursor:default}",
      ".cp-acct-input-wrap{position:relative}",
      ".cp-acct-input-icon{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:#c7c7cc;cursor:pointer;background:none;border:none;padding:4px}",
      ".cp-acct-checkbox-row{display:flex;align-items:center;gap:10px;margin-bottom:16px;font-size:14px;color:#000;cursor:pointer}",
      ".cp-acct-checkbox-row input{width:18px;height:18px;cursor:pointer;accent-color:#1e5cfb}",
      ".cp-acct-btn{height:44px;padding:0 24px;border-radius:10px;border:none;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .15s}",
      ".cp-acct-btn.primary{background:#1e5cfb;color:#fff}",
      ".cp-acct-btn.primary:hover{background:#1448d4}",
      ".cp-acct-btn.secondary{background:#f2f2f7;color:#000}",
      ".cp-acct-btn.secondary:hover{background:#e5e5ea}",
      ".cp-acct-divider{height:1px;background:#f2f2f7;margin:28px 0}",
      ".cp-acct-coming{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;gap:12px}",
      ".cp-acct-coming-icon{font-size:40px}",
      ".cp-acct-coming-title{font-size:18px;font-weight:700;color:#000}",
      ".cp-acct-coming-sub{font-size:14px;color:#737378}",
      ".cp-acct-promo-row{display:flex;gap:10px;max-width:480px}",
      ".cp-acct-promo-row .cp-acct-input{flex:1}",
      // Mobile
      "@media(max-width:680px){.cp-acct-pg{border-radius:20px 20px 0 0;max-height:95dvh;width:100%}.cp-acct-pg-bg{align-items:flex-end;padding:0}.cp-acct-pg-nav{display:none}.cp-acct-pg-content{padding:20px}}",
      // ── Billing panel ─────────────────────────────────────────────────────
      ".cp-bill-plan-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}",
      ".cp-bill-plan-name{font-size:18px;font-weight:700;color:#000}",
      ".cp-bill-plan-price{font-size:18px;font-weight:700;color:#000}",
      ".cp-bill-plan-sub{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}",
      ".cp-bill-plan-date{font-size:13px;color:#737378}",
      ".cp-bill-cancel-btn{font-size:13px;color:#c7c7cc;cursor:pointer;border:none;background:none;font-family:inherit;padding:0}",
      ".cp-bill-change-btn{display:inline-flex;align-items:center;gap:6px;color:#1e5cfb;font-size:14px;font-weight:500;cursor:pointer;border:none;background:none;font-family:inherit;padding:0;margin-bottom:20px}",
      ".cp-bill-change-btn:hover{text-decoration:underline}",
      ".cp-bill-divider{height:1px;background:#f2f2f7;margin:20px 0}",
      ".cp-bill-card-row{display:flex;align-items:center;justify-content:space-between;padding:4px 0}",
      ".cp-bill-card-info{display:flex;align-items:center;gap:8px;font-size:14px;color:#000}",
      ".cp-bill-visa{background:#1a1f71;color:#fff;font-size:9px;font-weight:900;padding:3px 6px;border-radius:3px;letter-spacing:0.5px}",
      ".cp-bill-delete-btn{width:32px;height:32px;border-radius:8px;border:none;background:none;cursor:pointer;color:#c7c7cc;display:flex;align-items:center;justify-content:center;transition:background .12s}",
      ".cp-bill-delete-btn:hover{background:#fff5f5;color:#ff3b30}",
      ".cp-bill-add-btn{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:1.5px dashed #e5e5ea;border-radius:10px;background:none;color:#1e5cfb;font-size:14px;font-weight:500;font-family:inherit;cursor:pointer;transition:background .12s,border-color .12s}",
      ".cp-bill-add-btn:hover{background:#f0f4ff;border-color:#1e5cfb}",
      ".cp-bill-no-card{font-size:13px;color:#737378;padding:8px 0 12px}",
      ".cp-add-card-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:5000;display:flex;align-items:center;justify-content:center}",
      ".cp-add-card-box{background:#fff;border-radius:16px;width:380px;max-width:calc(100vw - 32px);padding:28px 24px 24px;position:relative}",
      ".cp-add-card-title{font-size:18px;font-weight:700;color:#000;margin-bottom:20px}",
      ".cp-add-card-close{position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:8px;border:none;background:none;cursor:pointer;color:#737378;display:flex;align-items:center;justify-content:center;transition:background .12s}",
      ".cp-add-card-close:hover{background:#f2f2f7}",
      ".cp-add-card-field{margin-bottom:14px}",
      ".cp-add-card-lbl{font-size:12px;font-weight:600;color:#737378;margin-bottom:6px;display:block;text-transform:uppercase;letter-spacing:.4px}",
      ".cp-add-card-input{width:100%;box-sizing:border-box;height:40px;border:1.5px solid #e5e5ea;border-radius:8px;padding:0 12px;font-size:15px;font-family:inherit;color:#000;outline:none;transition:border-color .15s}",
      ".cp-add-card-input:focus{border-color:#1e5cfb}",
      ".cp-add-card-row{display:flex;gap:12px}",
      ".cp-add-card-row .cp-add-card-field{flex:1}",
      ".cp-add-card-save{width:100%;height:44px;border-radius:10px;background:#1e5cfb;color:#fff;border:none;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;margin-top:4px;transition:background .15s}",
      ".cp-add-card-save:hover{background:#1448d4}",
      ".cp-bill-progress-wrap{margin:0 0 4px}",
      ".cp-bill-progress-track{height:8px;background:#f2f2f7;border-radius:4px;overflow:hidden}",
      ".cp-bill-progress-fill{height:100%;background:#34c759;border-radius:4px;transition:width .4s}",
      ".cp-bill-progress-label{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:13px}",
      ".cp-bill-buy-more{color:#1e5cfb;font-size:13px;font-weight:500;cursor:pointer;border:none;background:none;font-family:inherit;padding:0}",
      ".cp-bill-history-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}",
      ".cp-bill-history-title{font-size:16px;font-weight:700;color:#000}",
      ".cp-bill-history-help{font-size:13px;color:#737378;cursor:pointer;border:none;background:none;font-family:inherit}",
      ".cp-bill-row{display:flex;align-items:center;padding:13px 0;border-bottom:1px solid #f2f2f7}",
      ".cp-bill-row-name{flex:1;font-size:14px;color:#000}",
      ".cp-bill-row-amt{font-size:14px;font-weight:600;color:#000;min-width:56px;text-align:right}",
      ".cp-bill-row-date{font-size:13px;color:#737378;min-width:120px;text-align:right;padding-left:16px}",
      ".cp-bill-row-icon{color:#c7c7cc;padding-left:8px;display:flex;align-items:center}",
      // ── Pricing modal ──────────────────────────────────────────────────────
      ".cp-pricing-bg{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:4000;display:none;overflow-y:auto}",
      ".cp-pricing-bg.open{display:block}",
      ".cp-pricing-wrap{min-height:100%;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px}",
      ".cp-pricing-box{background:#fff;border-radius:20px;width:960px;max-width:100%;padding:40px;position:relative}",
      ".cp-pricing-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}",
      ".cp-pricing-title{font-size:28px;font-weight:800;color:#000;margin:0}",
      ".cp-pricing-sub{font-size:14px;color:#737378;margin-top:6px}",
      ".cp-pricing-close-btn{width:36px;height:36px;border-radius:10px;border:none;background:#f2f2f7;cursor:pointer;font-size:18px;color:#737378;transition:background .12s;flex-shrink:0}",
      ".cp-pricing-close-btn:hover{background:#e5e5ea}",
      ".cp-pricing-periods{display:flex;flex-direction:column;gap:10px;margin-bottom:28px}",
      ".cp-period-opt{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:15px;color:#000}",
      ".cp-period-radio{width:20px;height:20px;border-radius:50%;border:2px solid #e5e5ea;display:flex;align-items:center;justify-content:center;transition:border .15s;flex-shrink:0}",
      ".cp-period-opt.active .cp-period-radio{border-color:#1e5cfb}",
      ".cp-period-radio-dot{width:10px;height:10px;border-radius:50%;background:#1e5cfb;display:none}",
      ".cp-period-opt.active .cp-period-radio-dot{display:block}",
      ".cp-period-badge{background:#1e5cfb;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px}",
      ".cp-period-current{background:#f2f2f7;color:#737378;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px}",
      ".cp-pricing-cards{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:0}",
      ".cp-plan-card{border-radius:16px;padding:28px;position:relative;overflow:hidden}",
      ".cp-plan-card.pro{background:#2d1448}",
      ".cp-plan-card.premium{background:#16213e}",
      ".cp-plan-badge{position:absolute;top:20px;right:20px;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px}",
      ".cp-plan-badge.green{background:#34c759;color:#fff}",
      ".cp-plan-badge.blue{background:#0a84ff;color:#fff}",
      ".cp-plan-name{font-size:22px;font-weight:800;color:#fff;margin:0 0 8px}",
      ".cp-plan-desc{font-size:13px;color:rgba(255,255,255,0.65);margin:0 0 20px;line-height:1.5}",
      ".cp-plan-price-old{font-size:14px;color:rgba(255,255,255,0.5);text-decoration:line-through;margin-bottom:2px}",
      ".cp-plan-price-row{display:flex;align-items:baseline;gap:4px;margin-bottom:4px}",
      ".cp-plan-price-val{font-size:36px;font-weight:800;color:#fff}",
      ".cp-plan-price-per{font-size:14px;color:rgba(255,255,255,0.65)}",
      ".cp-plan-price-note{font-size:12px;color:rgba(255,255,255,0.45);margin-bottom:20px}",
      ".cp-plan-cta{width:100%;height:44px;border-radius:10px;border:none;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .15s}",
      ".cp-plan-cta.active{background:#fff;color:#000}",
      ".cp-plan-cta.active:hover{background:#f2f2f7}",
      ".cp-plan-cta.disabled{background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.4);cursor:default}",
      ".cp-plan-features{padding:0;margin:0;list-style:none}",
      ".cp-plan-feat-row{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #f2f2f7;font-size:14px}",
      ".cp-plan-feat-row:last-child{border-bottom:none}",
      ".cp-plan-feat-icon{color:#8e8e93;flex-shrink:0}",
      ".cp-plan-feat-name{flex:1;color:#000}",
      ".cp-plan-feat-val{font-size:13px;color:#737378;font-weight:500}",
      ".cp-plan-feat-val.accent{color:#1e5cfb}",
      "@media(max-width:700px){.cp-pricing-cards{grid-template-columns:1fr}.cp-pricing-box{padding:24px}.cp-pricing-wrap{padding:16px 0}.cp-pricing-box{border-radius:20px 20px 0 0}}",
      // ── AI Agent sidebar section ────────────────────────────────────────────
      ".cp-agent-section{padding:12px 8px 0;flex-shrink:0}",
      ".cp-agent-section-hdr{font-size:11px;font-weight:700;color:#8e8e93;text-transform:uppercase;letter-spacing:.06em;padding:0 8px;margin-bottom:6px}",
      ".cp-agent-nav-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;background:none;border:none;width:100%;text-align:left;font-size:14px;font-weight:400;color:#3c3c43;font-family:'Inter',sans-serif;cursor:pointer;transition:background .12s,color .12s;-webkit-tap-highlight-color:transparent;position:relative}",
      ".cp-agent-nav-item:hover{background:#f2f2f7;color:#000}",
      ".cp-agent-nav-item.active{background:#eef2ff;color:#1e5cfb;font-weight:500}",
      ".cp-agent-nav-item svg{flex-shrink:0;opacity:.7}",
      ".cp-agent-nav-item.active svg{opacity:1}",
      ".cp-agent-nav-badge{margin-left:auto;background:#ff3b30;color:#fff;border-radius:20px;font-size:11px;font-weight:700;padding:2px 7px;min-width:20px;text-align:center;flex-shrink:0}",
      ".cp-agent-nav-badge.blue{background:#1e5cfb}",
      ".cp-agent-divider{height:1px;background:#f2f2f7;margin:10px 8px 4px}",
      ".cp-agent-quick-hdr{font-size:12px;font-weight:700;color:#000;padding:6px 10px 4px;letter-spacing:-.01em}",
      ".cp-agent-quick-btn{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;background:none;border:none;width:100%;text-align:left;font-size:14px;color:#1e5cfb;font-family:'Inter',sans-serif;cursor:pointer;transition:background .12s;-webkit-tap-highlight-color:transparent;pointer-events:auto;position:relative;z-index:2}",
      ".cp-agent-quick-btn:hover{background:#eef2ff}",
      ".cp-agent-quick-btn svg{flex-shrink:0}",

    ].join("");
    document.head.appendChild(s);
  }

  function _lsGet(k) { try { return localStorage.getItem(k) || null; } catch (_) { return null; } }
  function _lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { } }

  function createState() {
    return {
      projects: [],
      activeProjectId: _lsGet("cp_proj"),
      tab: _lsGet("cp_tab") || "analytics",
      chats: [],
      chatsCursor: null,
      chatsHasMore: false,
      chatsQuery: "",
      chatsRequestSeq: 0,
      chatsLoadedProjectId: null,
      sources: [],
      sourcesCursor: null,
      sourcesHasMore: false,
      sourcesQuery: "",
      sourcesRequestSeq: 0,
      sourcesLoadedProjectId: null,
      kbTopics: [],
      kbTopicsLoading: false,
      kbTopicsQuery: "",
      kbTopicsSort: "popular",
      kbTopicsLoadedProjectId: null,
      sort: "newest",
      sourcesType: "",
      createRequestId: null,
      createInFlight: false,
      analyticsPeriod: 30,
      testHistory: [],
      unanswered: [],
    };
  }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, wait || 250);
    };
  }

  function isTelegramToken(value) {
    var v = String(value || "").trim();
    return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(v);
  }

  function makeRequestId() {
    return "prj-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function notify(msg, isError) {
    if (typeof showToast === "function") {
      showToast((isError ? "❌ " : "✅ ") + msg);
      return;
    }
    if (isError) alert(msg);
    else console.log(msg);
  }

  async function postJSON(url, payload) {
    var resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    var data = {};
    try { data = await resp.json(); } catch (_) { }
    return { ok: resp.ok, status: resp.status, data: data || {} };
  }

  function mount(root, opts) {
    if (!ProjectsApi) throw new Error("ProjectsApi is required");
    ensureStyles();
    var state = createState();
    var options = opts || {};

    // SVG icon helpers (must be defined before layout() is called)
    var _ic = {
      dashboard: "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='7' height='7' rx='1'/><rect x='14' y='3' width='7' height='7' rx='1'/><rect x='3' y='14' width='7' height='7' rx='1'/><rect x='14' y='14' width='7' height='7' rx='1'/></svg>",
      bots: "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='11' width='18' height='10' rx='2'/><circle cx='12' cy='5' r='2'/><line x1='12' y1='7' x2='12' y2='11'/><line x1='8' y1='15' x2='8' y2='17'/><line x1='16' y1='15' x2='16' y2='17'/></svg>",
      analytics: "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='20' x2='18' y2='10'/><line x1='12' y1='20' x2='12' y2='4'/><line x1='6' y1='20' x2='6' y2='14'/></svg>",
      finance: "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><line x1='12' y1='1' x2='12' y2='23'/><path d='M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'/></svg>",
      kb: "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>",
      settings: "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>",
      chat: "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/></svg>",
      book: "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>",
      gear: "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>",
      plus: "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg>",
      ext: "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/><polyline points='15 3 21 3 21 9'/><line x1='10' y1='14' x2='21' y2='3'/></svg>",
      chevron: "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><polyline points='6 9 12 15 18 9'/></svg>",
      test: "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><polygon points='5 3 19 12 5 21 5 3'/></svg>",
      send: "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='22' y1='2' x2='11' y2='13'/><polygon points='22 2 15 22 11 13 2 9 22 2'/></svg>",
    };

    root.innerHTML = layout();

    var nodes = {
      list: root.querySelector("#projects-list"),
      title: root.querySelector("#projects-active-title"),
      meta: root.querySelector("#projects-active-meta"),
      tabs: root.querySelector("#projects-tabs"),
      content: root.querySelector("#projects-content"),
      btnNew: root.querySelector("#projects-new"),
      btnNew2: root.querySelector("#projects-new-empty"),
      btnTopChats: root.querySelector("#projects-top-open-chats"),
      modal: root.querySelector("#projects-create-modal"),
      modalClose: root.querySelector("#projects-create-close"),
      modalCancel: root.querySelector("#projects-create-cancel"),
      modalCreate: root.querySelector("#projects-create-submit"),
      createName: root.querySelector("#projects-create-name"),
      createHost: root.querySelector("#projects-create-host"),
      createKB: root.querySelector("#projects-create-kb"),
      createKBFileWrap: root.querySelector("#projects-create-kb-file-wrap"),
      createKBTextWrap: root.querySelector("#projects-create-kb-text-wrap"),
      createKBDropZone: root.querySelector("#projects-create-drop-zone"),
      createKBDropText: root.querySelector("#projects-create-drop-text"),
      createKBFileInput: root.querySelector("#projects-create-file-input"),
      createKBText: root.querySelector("#projects-create-kb-text"),
      // Source modal
      srcModal: root.querySelector("#projects-source-modal"),
      // Chat viewer modal
      chatModalBg: root.querySelector("#projects-chat-modal-bg"),
      chatModal: root.querySelector("#projects-chat-modal-wrap"),
      chatModalBody: root.querySelector("#projects-chat-modal-body"),
      chatModalTitle: root.querySelector("#projects-chat-modal-title"),
      chatModalSub: root.querySelector("#projects-chat-modal-sub"),
      chatModalClose: root.querySelector("#projects-chat-modal-close"),
      chatModalExpand: root.querySelector("#projects-chat-modal-expand"),
      // Telegram modal
      tgModalBg: root.querySelector("#tg-connect-modal"),
      tgModalClose: root.querySelector("#tg-connect-close"),
      tgTabNew: root.querySelector("#tg-tab-new"),
      tgTabExisting: root.querySelector("#tg-tab-existing"),
      tgStepsNew: root.querySelector("#tg-steps-new"),
      tgStepsExisting: root.querySelector("#tg-steps-existing"),
      tgInputToken: root.querySelector("#tg-connect-token"),
      tgBtnConnect: root.querySelector("#tg-connect-btn"),
      tgErrorMsg: root.querySelector("#tg-connect-error"),
      srcClose: root.querySelector("#src-close"),
      srcBack: root.querySelector("#src-back"),
      srcTitle: root.querySelector("#src-title"),
      srcViewMain: root.querySelector("#src-view-main"),
      srcViewText: root.querySelector("#src-view-text"),
      srcViewUrl: root.querySelector("#src-view-url"),
      srcViewFile: root.querySelector("#src-view-file"),
      srcDropZone: root.querySelector("#src-drop-zone"),
      srcPickFile: root.querySelector("#src-pick-file"),
      srcPickText: root.querySelector("#src-pick-text"),
      srcPickUrl: root.querySelector("#src-pick-url"),
      srcTextTitle: root.querySelector("#src-text-title"),
      srcTextBody: root.querySelector("#src-text-body"),
      srcTextOk: root.querySelector("#src-text-ok"),
      srcTextCancel: root.querySelector("#src-text-cancel"),
      srcUrlTitle: root.querySelector("#src-url-title"),
      srcUrlHref: root.querySelector("#src-url-href"),
      srcUrlOk: root.querySelector("#src-url-ok"),
      srcUrlCancel: root.querySelector("#src-url-cancel"),
      srcFileZone: root.querySelector("#src-file-zone"),
      srcFileInp: root.querySelector("#src-file-inp"),
      srcFileLbl: root.querySelector("#src-file-lbl"),
      srcFileOk: root.querySelector("#src-file-ok"),
      srcFileCancel: root.querySelector("#src-file-cancel"),
    };

    var _srcFile = null;
    _bindKbTopicEllipsisResize();

    // ── Mobile nav & drawer wiring ──────────────────────────────────────────
    (function initMobileNav() {
      var mobileNav = root.querySelector("#cp-mobile-nav");
      var drawerBg = root.querySelector("#cp-mobile-drawer-bg");
      var drawerClose = root.querySelector("#cp-mob-drawer-close");
      var mobProjBtn = root.querySelector("#cp-mob-proj-btn");
      var mobProjList = root.querySelector("#cp-mob-proj-list");
      var mobNewProj = root.querySelector("#cp-mob-new-proj");
      var mobTopbarProj = root.querySelector("#cp-mob-topbar-proj");
      var mobProjNavLbl = root.querySelector("#cp-mob-nav-proj-lbl");
      var mobTopbarProjName = root.querySelector("#cp-mob-proj-name");

      function openDrawer() {
        if (!drawerBg) return;
        _renderMobProjList();
        drawerBg.classList.add("open");
        document.body.style.overflow = "hidden";
      }
      function closeDrawer() {
        if (!drawerBg) return;
        drawerBg.classList.remove("open");
        document.body.style.overflow = "";
      }

      function _renderMobProjList() {
        if (!mobProjList) return;
        mobProjList.innerHTML = "";
        state.projects.forEach(function (p) {
          var btn = document.createElement("button");
          btn.className = "cp-mob-proj-item" + (p.id === state.activeProjectId ? " active" : "");
          var isOnline = !!(p.telegramConnected && p.botHost && p.botHost.startsWith("@"));
          btn.innerHTML = "<span class='cp-mob-proj-dot'></span>" +
            "<span class='cp-mob-proj-name'>" + esc(p.name) + "</span>" +
            (isOnline ? "<span class='cp-mob-proj-badge'>●</span>" : "");
          btn.addEventListener("click", function () {
            state.activeProjectId = p.id;
            _lsSet("cp_proj", p.id);
            state.chats = []; state.sources = []; state.kbTopics = [];
            state.chatsCursor = null; state.sourcesCursor = null;
            state.chatsQuery = ""; state.sourcesQuery = ""; state.kbTopicsQuery = "";
            state.sort = "newest"; state.sourcesType = "";
            state.kbTopicsSort = "popular";
            state.chatsLoadedProjectId = null; state.sourcesLoadedProjectId = null; state.kbTopicsLoadedProjectId = null;
            closeDrawer();
            renderSidebar();
            renderHeader();
            syncMobileNav();
            renderTab();
          });
          mobProjList.appendChild(btn);
        });
      }

      // Sync mobile nav active state and project label
      function syncMobileNav() {
        if (!mobileNav) return;
        mobileNav.querySelectorAll(".cp-mobile-nav-item[data-mnav]").forEach(function (btn) {
          btn.classList.toggle("active", btn.dataset.mnav === state.tab);
        });
        var activeP = state.projects.find(function (p) { return p.id === state.activeProjectId; });
        var projName = activeP ? activeP.name : "Проекты";
        if (mobProjNavLbl) mobProjNavLbl.textContent = projName.length > 10 ? projName.slice(0, 9) + "…" : projName;
        if (mobTopbarProjName) mobTopbarProjName.textContent = projName;
      }

      // Expose so renderSidebar/setTab can call it
      root._syncMobileNav = syncMobileNav;
      root._openMobileDrawer = openDrawer;

      // Mobile nav tab buttons
      if (mobileNav) {
        mobileNav.querySelectorAll(".cp-mobile-nav-item[data-mnav]").forEach(function (btn) {
          btn.addEventListener("click", function () { setTab(btn.dataset.mnav); });
        });
      }
      // Projects button → open drawer
      if (mobProjBtn) mobProjBtn.addEventListener("click", openDrawer);
      // Topbar project selector → open drawer
      if (mobTopbarProj) mobTopbarProj.addEventListener("click", openDrawer);
      // Close drawer
      if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
      if (drawerBg) drawerBg.addEventListener("click", function (e) { if (e.target === drawerBg) closeDrawer(); });
      // New project from drawer
      if (mobNewProj) mobNewProj.addEventListener("click", function () { closeDrawer(); window.openTelegramConnectModal("new"); });

      syncMobileNav();
    })();

    // ── AI Agent sidebar section wiring ──────────────────────────────────────
    (function initAgentSection() {
      var agentSection = root.querySelector("#cp-agent-section");
      var unansweredBadge = root.querySelector("#cp-unanswered-badge");
      var quickUploadBtn = root.querySelector("#cp-agent-upload-btn");
      var quickTextBtn = root.querySelector("#cp-agent-text-btn");
      var quickRulesBtn = root.querySelector("#cp-agent-rules-btn");
      var newProjectBtn = root.querySelector("#cp-new-project-btn");
      if (newProjectBtn) newProjectBtn.addEventListener("click", function () { window.openTelegramConnectModal("new"); });
      var _lastQuickActionAt = 0;
      var _lastQuickActionKey = "";

      function _runQuickAction(action) {
        var now = Date.now();
        var key = String(action || "");
        if (_lastQuickActionKey === key && now - _lastQuickActionAt < 300) return;
        _lastQuickActionKey = key;
        _lastQuickActionAt = now;
        if (key === "upload") { openQuickSource("file"); return; }
        if (key === "text") { openQuickSource("text"); return; }
        if (key === "rules") { openQuickRules(); return; }
      }

      function openQuickSource(view) {
        if (!state.activeProjectId) {
          notify("Сначала выберите проект", true);
          return;
        }
        setTab("sources");
        setTimeout(function () {
          try {
            openSourceModalSafe(view);
          } catch (err) {
            console.error("[ProjectsUI] Quick source open failed:", err);
            notify("Не удалось открыть окно добавления источника", true);
          }
        }, 80);
      }

      function openQuickRules() {
        setTab("settings");
        // Settings can render async; retry focus a few times so user sees jump target.
        var tries = 0;
        function focusInst() {
          var inst = root.querySelector("#projects-set-inst");
          if (inst) {
            try { inst.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (_) { }
            try { inst.focus(); } catch (_) { }
            return;
          }
          tries += 1;
          if (tries < 8) setTimeout(focusInst, 90);
        }
        setTimeout(focusInst, 80);
      }

      // Click on agent nav items → switch tab
      if (agentSection) {
        agentSection.addEventListener("click", function (e) {
          var target = e && e.target
            ? (e.target.nodeType === 1 ? e.target : e.target.parentElement)
            : null;
          if (!target || !target.closest) return;

          var item = target.closest("[data-agent-tab]");
          if (item) {
            var tab = item.getAttribute("data-agent-tab");
            setTab(tab);
            // Sync active state
            agentSection.querySelectorAll(".cp-agent-nav-item").forEach(function (b) {
              b.classList.toggle("active", b.getAttribute("data-agent-tab") === tab);
            });
            return;
          }
          // Quick action: Upload file
          if (target.closest("#cp-agent-upload-btn")) {
            _runQuickAction("upload");
            return;
          }
          // Quick action: Write text
          if (target.closest("#cp-agent-text-btn")) {
            _runQuickAction("text");
            return;
          }
          // Quick action: Rules (open settings)
          if (target.closest("#cp-agent-rules-btn")) {
            _runQuickAction("rules");
            return;
          }
        });
      }

      // Direct handlers as fallback (for environments where delegation can be swallowed).
      if (quickUploadBtn) {
        quickUploadBtn.addEventListener("click", function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          _runQuickAction("upload");
        });
      }
      if (quickTextBtn) {
        quickTextBtn.addEventListener("click", function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          _runQuickAction("text");
        });
      }
      if (quickRulesBtn) {
        quickRulesBtn.addEventListener("click", function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          _runQuickAction("rules");
        });
      }

      // Global capture fallback for environments where nested handlers are swallowed.
      ["pointerup", "touchend", "click"].forEach(function (evtName) {
        document.addEventListener(evtName, function (e) {
          var t = e && e.target ? (e.target.nodeType === 1 ? e.target : e.target.parentElement) : null;
          if (!t || !t.closest) return;
          var b = t.closest("#cp-agent-upload-btn, #cp-agent-text-btn, #cp-agent-rules-btn");
          if (!b) return;
          if (!root.contains(b)) return;
          if (b.id === "cp-agent-upload-btn") { _runQuickAction("upload"); return; }
          if (b.id === "cp-agent-text-btn") { _runQuickAction("text"); return; }
          if (b.id === "cp-agent-rules-btn") { _runQuickAction("rules"); return; }
        }, true);
      });

      // Sync active nav highlight when tab changes
      root._syncAgentNav = function (tab) {
        if (!agentSection) return;
        agentSection.querySelectorAll(".cp-agent-nav-item").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-agent-tab") === tab);
        });
      };

      // Load unanswered questions count from Firestore
      root._loadUnansweredCount = async function () {
        if (!unansweredBadge) return;
        try {
          if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) return;
          var user = firebase.auth().currentUser;
          if (!user || !state.activeProjectId) return;
          var p = getActiveProject();
          if (!p || !p.telegramBotId) {
            unansweredBadge.style.display = "none";
            return;
          }
          var q = firebase.firestore()
            .collection("users").doc(user.uid)
            .collection("unanswered");
          q = q.where("botId", "==", p.telegramBotId);
          var snap = await q.limit(300).get();
          var cnt = snap ? snap.size : 0;
          if (cnt > 0) {
            unansweredBadge.textContent = cnt >= 300 ? "300+" : (cnt > 99 ? "99+" : String(cnt));
            unansweredBadge.style.display = "";
          } else {
            unansweredBadge.style.display = "none";
          }
        } catch (_) { unansweredBadge.style.display = "none"; }
      };
    })();

    // Close source dropdowns on outside click
    document.addEventListener("click", _closeSrcDropdowns);

    // User profile + account menu
    (function initUserProfile() {
      var avEl = root.querySelector("#proj-user-av");
      var nameEl = root.querySelector("#proj-user-name");
      var signoutBtn = root.querySelector("#proj-signout-btn");
      var menu = root.querySelector("#cp-account-menu");
      var menuAv = root.querySelector("#cp-menu-av");
      var menuName = root.querySelector("#cp-menu-name");
      var menuEmail = root.querySelector("#cp-menu-email");

      function doSignOut() {
        if (typeof showConfirm === "function") {
          showConfirm({
            icon: "🚪",
            title: "Выйти из аккаунта?",
            desc: "Вы будете перенаправлены на страницу входа.",
            action: "Выйти",
            onOk: function () {
              try { if (typeof firebase !== "undefined") firebase.auth().signOut(); } catch (_) { }
            }
          });
        } else {
          if (confirm("Выйти из аккаунта?")) {
            try { if (typeof firebase !== "undefined") firebase.auth().signOut(); } catch (_) { }
          }
        }
      }

      function showToast(msg) {
        var t = document.createElement("div");
        t.textContent = msg;
        t.style.cssText = "position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;z-index:9999;pointer-events:none;white-space:nowrap;";
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 2200);
      }

      function openMenu() {
        if (menu) menu.classList.add("open");
      }
      function closeMenu() {
        if (menu) menu.classList.remove("open");
      }
      function toggleMenu() {
        if (menu && menu.classList.contains("open")) { closeMenu(); } else { openMenu(); }
      }

      function updateUserUI() {
        try {
          if (typeof firebase !== "undefined" && firebase.auth) {
            var u = firebase.auth().currentUser;
            if (u) {
              var displayName = u.displayName || "";
              var email = u.email || "";
              var label = displayName || email || "Аккаунт";
              var initial = label.charAt(0).toUpperCase();
              if (avEl) avEl.textContent = initial;
              if (nameEl) nameEl.textContent = label;
              if (menuAv) menuAv.textContent = initial;
              if (menuName) menuName.textContent = displayName || label;
              if (menuEmail) menuEmail.textContent = email || "—";
              return;
            }
          }
        } catch (_) { }
        if (avEl) avEl.textContent = "?";
        if (nameEl) nameEl.textContent = "—";
        if (menuAv) menuAv.textContent = "?";
        if (menuName) menuName.textContent = "—";
        if (menuEmail) menuEmail.textContent = "—";
      }

      // ── AI usage counter ────────────────────────────────────────────────
      var aiValEl = root.querySelector("#cp-ai-val");
      var aiBarEl = root.querySelector("#cp-ai-bar");
      var aiTrialLbl = root.querySelector("#cp-ai-trial-lbl");
      var aiWidget = root.querySelector("#cp-ai-counter-widget");

      async function loadAiUsage(user) {
        if (!user || typeof firebase === "undefined" || !firebase.firestore) return;
        try {
          var db = firebase.firestore();
          var planRef = db.doc("users/" + user.uid + "/settings/plan");
          var planSnap = await planRef.get();
          var now = new Date();
          var monthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

          if (!planSnap.exists) {
            // New user — create 14-day trial with 1000 requests
            var trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            await planRef.set({
              type: "trial",
              monthlyLimit: 1000,
              trialEnds: firebase.firestore.Timestamp.fromDate(trialEnds),
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            planSnap = await planRef.get();
          }

          var pd = planSnap.data();
          var limit = pd.monthlyLimit || 0;

          // Check if trial/plan still active
          var active = false;
          var daysLeft = null;
          if (pd.type === "trial") {
            var te = pd.trialEnds && pd.trialEnds.toDate ? pd.trialEnds.toDate() : null;
            if (te && te > now) {
              active = true;
              daysLeft = Math.ceil((te - now) / 86400000);
            }
          } else if (["starter", "pro", "business", "premium"].includes(pd.type)) {
            var pu = pd.paidUntil && pd.paidUntil.toDate ? pd.paidUntil.toDate() : null;
            if (pu && pu > now) active = true;
          }

          var usageSnap = await db.doc("users/" + user.uid + "/usage/" + monthKey).get();
          var used = usageSnap.exists ? (usageSnap.data().aiRequests || 0) : 0;
          var remaining = Math.max(0, limit - used);

          if (aiValEl) aiValEl.textContent = remaining.toLocaleString("ru-RU");
          var pct = limit > 0 ? Math.min(100, Math.round((remaining / limit) * 100)) : 0;
          if (aiBarEl) {
            aiBarEl.style.width = pct + "%";
            aiBarEl.style.background = pct > 30 ? "#13cd25" : pct > 10 ? "#ffb800" : "#ff3b30";
          }
          if (aiTrialLbl) {
            if (pd.type === "trial" && daysLeft !== null) {
              aiTrialLbl.textContent = "Пробный период · ещё " + daysLeft + " дн.";
            } else if (!active && limit > 0) {
              aiTrialLbl.textContent = "Период завершён — обновите тариф";
              aiTrialLbl.style.color = "#ff3b30";
            } else {
              aiTrialLbl.textContent = "";
            }
          }
        } catch (e) {
          if (aiValEl) aiValEl.textContent = "—";
        }
      }

      updateUserUI();
      if (typeof firebase !== "undefined" && firebase.auth) {
        try {
          firebase.auth().onAuthStateChanged(function (user) {
            updateUserUI();
            if (user) loadAiUsage(user);
          });
        } catch (_) { }
      }

      // Click on widget → open billing tab
      if (aiWidget) {
        aiWidget.addEventListener("click", function () {
          openAcctModal("billing");
        });
      }

      // Toggle menu on avatar click
      if (signoutBtn) {
        signoutBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleMenu();
        });
      }

      // Close on click outside
      document.addEventListener("click", function (e) {
        if (!menu || !menu.classList.contains("open")) return;
        if (!menu.contains(e.target) && e.target !== signoutBtn && !signoutBtn.contains(e.target)) {
          closeMenu();
        }
      });

      // Menu item handlers
      var btnAccount = root.querySelector("#cp-menu-account");
      var btnBilling = root.querySelector("#cp-menu-billing");
      var btnPartner = root.querySelector("#cp-menu-partner");
      var btnLang = root.querySelector("#cp-menu-lang");
      var btnHelp = root.querySelector("#cp-menu-help");
      var btnSignout = root.querySelector("#cp-menu-signout");

      // ── Account page modal ──────────────────────────────────────────────
      var acctBg = root.querySelector("#cp-acct-pg-bg");
      var acctClose = root.querySelector("#cp-acct-pg-close");

      function openAcctModal(tab) {
        if (!acctBg) return;
        // Fill fields from Firebase
        try {
          var u = firebase.auth().currentUser;
          if (u) {
            var nameInp = root.querySelector("#cp-acct-name");
            var emailInp = root.querySelector("#cp-acct-email");
            if (nameInp) nameInp.value = u.displayName || "";
            if (emailInp) emailInp.value = u.email || "";
          }
        } catch (_) { }
        switchAcctTab(tab || "general");
        acctBg.classList.add("open");
      }
      function closeAcctModal() {
        if (acctBg) acctBg.classList.remove("open");
      }

      function switchAcctTab(tab) {
        var panels = ["general", "billing", "limits", "bonuses"];
        panels.forEach(function (p) {
          var el = root.querySelector("#cp-acct-panel-" + p);
          if (el) el.style.display = (p === tab) ? "" : "none";
        });
        root.querySelectorAll(".cp-acct-pg-nav-item").forEach(function (btn) {
          btn.classList.toggle("active", btn.getAttribute("data-acct") === tab);
        });
      }

      // Nav item clicks
      root.querySelectorAll(".cp-acct-pg-nav-item").forEach(function (btn) {
        btn.addEventListener("click", function () {
          switchAcctTab(btn.getAttribute("data-acct"));
        });
      });

      // Close button + backdrop click
      if (acctClose) acctClose.addEventListener("click", closeAcctModal);
      if (acctBg) acctBg.addEventListener("click", function (e) {
        if (e.target === acctBg) closeAcctModal();
      });

      // Password eye toggles
      function makeEyeToggle(eyeId, inputId) {
        var eye = root.querySelector(eyeId);
        var inp = root.querySelector(inputId);
        if (!eye || !inp) return;
        eye.addEventListener("click", function () {
          inp.type = inp.type === "password" ? "text" : "password";
        });
      }
      makeEyeToggle("#cp-acct-old-pw-eye", "#cp-acct-old-pw");
      makeEyeToggle("#cp-acct-new-pw-eye", "#cp-acct-new-pw");

      // Save general settings (display name)
      var btnSaveGeneral = root.querySelector("#cp-acct-save-general");
      if (btnSaveGeneral) btnSaveGeneral.addEventListener("click", async function () {
        try {
          var u = firebase.auth().currentUser;
          if (!u) return;
          var newName = (root.querySelector("#cp-acct-name").value || "").trim();
          btnSaveGeneral.disabled = true;
          btnSaveGeneral.textContent = "Сохраняю…";
          await u.updateProfile({ displayName: newName });
          updateUserUI();
          btnSaveGeneral.textContent = "Обновить";
          btnSaveGeneral.disabled = false;
          showToast("Имя обновлено");
        } catch (e) {
          btnSaveGeneral.textContent = "Обновить";
          btnSaveGeneral.disabled = false;
          showToast("Ошибка: " + (e.message || "не удалось сохранить"));
        }
      });

      // Change password
      var btnSavePw = root.querySelector("#cp-acct-save-pw");
      var pwMsg = root.querySelector("#cp-acct-pw-msg");
      if (btnSavePw) btnSavePw.addEventListener("click", async function () {
        var oldPw = root.querySelector("#cp-acct-old-pw").value;
        var newPw = root.querySelector("#cp-acct-new-pw").value;
        if (!oldPw || !newPw) { if (pwMsg) { pwMsg.style.color = "#ff3b30"; pwMsg.textContent = "Заполните оба поля"; } return; }
        if (newPw.length < 6) { if (pwMsg) { pwMsg.style.color = "#ff3b30"; pwMsg.textContent = "Новый пароль должен быть не менее 6 символов"; } return; }
        try {
          btnSavePw.disabled = true; btnSavePw.textContent = "Меняю…";
          var u = firebase.auth().currentUser;
          var cred = firebase.auth.EmailAuthProvider.credential(u.email, oldPw);
          await u.reauthenticateWithCredential(cred);
          await u.updatePassword(newPw);
          root.querySelector("#cp-acct-old-pw").value = "";
          root.querySelector("#cp-acct-new-pw").value = "";
          if (pwMsg) { pwMsg.style.color = "#34c759"; pwMsg.textContent = "Пароль успешно изменён"; }
        } catch (e) {
          var msg = e.code === "auth/wrong-password" ? "Неверный старый пароль" :
            e.code === "auth/weak-password" ? "Слишком простой пароль" :
              e.message || "Ошибка";
          if (pwMsg) { pwMsg.style.color = "#ff3b30"; pwMsg.textContent = msg; }
        } finally {
          btnSavePw.disabled = false; btnSavePw.textContent = "Изменить пароль";
        }
      });

      // Promo code
      var btnPromo = root.querySelector("#cp-acct-promo-apply");
      var promoMsg = root.querySelector("#cp-acct-promo-msg");
      if (btnPromo) btnPromo.addEventListener("click", async function () {
        var code = (root.querySelector("#cp-acct-promo").value || "").trim().toUpperCase();
        if (!code) return;
        if (promoMsg) { promoMsg.style.color = "#737378"; promoMsg.textContent = "Проверяю промокод…"; }
        btnPromo.disabled = true;
        try {
          var user = firebase.auth().currentUser;
          if (!user) { if (promoMsg) { promoMsg.style.color = "#ff3b30"; promoMsg.textContent = "Войдите в аккаунт"; } return; }
          var idToken = await user.getIdToken();
          var resp = await fetch("/api/activate-promo", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
            body: JSON.stringify({ code: code }),
          });
          var data = await resp.json();
          if (!resp.ok || !data.ok) {
            if (promoMsg) { promoMsg.style.color = "#ff3b30"; promoMsg.textContent = data.error || "Промокод не найден или уже использован"; }
            return;
          }
          // Show success message
          var msg = "";
          if (data.type === "requests") msg = "✓ Промокод активирован! Добавлено " + data.value + " ИИ-запросов";
          else if (data.type === "upgrade_pro") msg = "✓ Активирован тариф Pro на " + (data.value || 30) + " дней";
          else msg = "✓ Промокод активирован!";
          if (promoMsg) { promoMsg.style.color = "#34c759"; promoMsg.textContent = msg; }
          var inp = root.querySelector("#cp-acct-promo");
          if (inp) inp.value = "";
          showToast("Промокод активирован!");
        } catch (e) {
          if (promoMsg) { promoMsg.style.color = "#ff3b30"; promoMsg.textContent = "Ошибка: " + (e.message || "попробуйте ещё раз"); }
        } finally {
          btnPromo.disabled = false;
        }
      });

      // ── Pricing modal ────────────────────────────────────────────────────
      var pricingBg = root.querySelector("#cp-pricing-bg");
      var pricingClose = root.querySelector("#cp-pricing-close");
      var periodYear = root.querySelector("#cp-period-year");
      var periodMonth = root.querySelector("#cp-period-month");

      function openPricingModal() {
        if (pricingBg) pricingBg.classList.add("open");
      }
      function closePricingModal() {
        if (pricingBg) pricingBg.classList.remove("open");
      }

      // Period prices
      var prices = {
        year: { pro: "$16", proOld: "$20", proNote: "при оплате за год", prem: "$200", premOld: "$250", premNote: "при оплате за год" },
        month: { pro: "$20", proOld: "", proNote: "", prem: "$250", premOld: "", premNote: "" },
      };
      function setPeriod(p) {
        var d = prices[p];
        var proPrice = root.querySelector("#cp-pro-price");
        var proOld = root.querySelector("#cp-pro-price-old");
        var proNote = root.querySelector("#cp-pro-note");
        var premPrice = root.querySelector("#cp-prem-price");
        var premOld = root.querySelector("#cp-prem-price-old");
        var premNote = root.querySelector("#cp-prem-note");
        if (proPrice) proPrice.textContent = d.pro;
        if (proOld) { proOld.textContent = d.proOld; proOld.style.display = d.proOld ? "" : "none"; }
        if (proNote) proNote.textContent = d.proNote;
        if (premPrice) premPrice.textContent = d.prem;
        if (premOld) { premOld.textContent = d.premOld; premOld.style.display = d.premOld ? "" : "none"; }
        if (premNote) premNote.textContent = d.premNote;
        if (periodYear) periodYear.classList.toggle("active", p === "year");
        if (periodMonth) periodMonth.classList.toggle("active", p === "month");
        // Update "Текущий план" badge: current plan is monthly Premium
        var curLbl = root.querySelector("#cp-period-current-lbl");
        if (curLbl) curLbl.style.display = p === "month" ? "" : "none";
      }

      if (periodYear) periodYear.addEventListener("click", function () { setPeriod("year"); });
      if (periodMonth) periodMonth.addEventListener("click", function () { setPeriod("month"); });
      if (pricingClose) pricingClose.addEventListener("click", closePricingModal);
      if (pricingBg) pricingBg.addEventListener("click", function (e) { if (e.target === pricingBg) closePricingModal(); });

      // "Изменить тариф" button inside billing panel
      var btnChangePlan = root.querySelector("#cp-bill-change-plan");
      if (btnChangePlan) btnChangePlan.addEventListener("click", openPricingModal);

      // ── Card management ────────────────────────────────────────────────────
      var cardSection = root.querySelector("#cp-bill-card-section");
      var noCardSection = root.querySelector("#cp-bill-no-card");
      var btnDeleteCard = root.querySelector("#cp-bill-delete-card");
      var btnAddCard = root.querySelector("#cp-bill-add-card");
      var addCardBg = root.querySelector("#cp-add-card-bg");
      var addCardClose = root.querySelector("#cp-add-card-close");
      var addCardSave = root.querySelector("#cp-add-card-save");
      var inputCardNum = root.querySelector("#cp-card-number");
      var inputCardExp = root.querySelector("#cp-card-expiry");
      var inputCardCvv = root.querySelector("#cp-card-cvv");

      function openAddCardModal() {
        if (addCardBg) {
          if (inputCardNum) inputCardNum.value = "";
          if (inputCardExp) inputCardExp.value = "";
          if (inputCardCvv) inputCardCvv.value = "";
          addCardBg.style.display = "flex";
          if (inputCardNum) setTimeout(function () { inputCardNum.focus(); }, 60);
        }
      }
      function closeAddCardModal() {
        if (addCardBg) addCardBg.style.display = "none";
      }

      // Auto-format card number (spaces every 4 digits)
      if (inputCardNum) {
        inputCardNum.addEventListener("input", function () {
          var v = this.value.replace(/\D/g, "").slice(0, 16);
          this.value = v.match(/.{1,4}/g) ? v.match(/.{1,4}/g).join(" ") : v;
        });
      }
      // Auto-format expiry MM / YY
      if (inputCardExp) {
        inputCardExp.addEventListener("input", function () {
          var v = this.value.replace(/\D/g, "").slice(0, 4);
          if (v.length > 2) v = v.slice(0, 2) + " / " + v.slice(2);
          this.value = v;
        });
      }
      // Only digits for CVV
      if (inputCardCvv) {
        inputCardCvv.addEventListener("input", function () {
          this.value = this.value.replace(/\D/g, "").slice(0, 3);
        });
      }

      if (btnDeleteCard) {
        btnDeleteCard.addEventListener("click", async function () {
          var confirmed = await showInlineConfirm("Удалить карту?", "Visa, *9891 будет отвязана от вашего аккаунта.", "Удалить");
          if (!confirmed) return;
          if (cardSection) cardSection.style.display = "none";
          if (noCardSection) noCardSection.style.display = "";
          showToast("Карта удалена");
          // Rebind add card button after DOM is shown
          var btn = root.querySelector("#cp-bill-add-card");
          if (btn) btn.addEventListener("click", openAddCardModal);
        });
      }
      if (btnAddCard) {
        btnAddCard.addEventListener("click", openAddCardModal);
      }
      if (addCardClose) {
        addCardClose.addEventListener("click", closeAddCardModal);
      }
      if (addCardBg) {
        addCardBg.addEventListener("click", function (e) {
          if (e.target === addCardBg) closeAddCardModal();
        });
      }
      if (addCardSave) {
        addCardSave.addEventListener("click", function () {
          var num = (inputCardNum ? inputCardNum.value.replace(/\s/g, "") : "");
          var exp = (inputCardExp ? inputCardExp.value.trim() : "");
          var cvv = (inputCardCvv ? inputCardCvv.value.trim() : "");
          if (num.length < 16) { showToast("Введите номер карты"); return; }
          if (exp.replace(/\s/g, "").replace("/", "").length < 4) { showToast("Введите срок действия"); return; }
          if (cvv.length < 3) { showToast("Введите CVV"); return; }
          var last4 = num.slice(-4);
          // Update card section display
          if (cardSection) {
            var cardInfo = cardSection.querySelector(".cp-bill-card-info span:last-child");
            if (cardInfo) cardInfo.textContent = "Visa, *" + last4;
            cardSection.style.display = "";
          }
          if (noCardSection) noCardSection.style.display = "none";
          closeAddCardModal();
          showToast("Карта *" + last4 + " успешно добавлена");
        });
      }

      if (btnAccount) btnAccount.addEventListener("click", function () {
        closeMenu();
        openAcctModal("general");
      });
      if (btnBilling) btnBilling.addEventListener("click", function () {
        closeMenu();
        openAcctModal("billing");
      });
      if (btnPartner) btnPartner.addEventListener("click", function () {
        closeMenu();
        showToast("Кабинет партнера — скоро доступно");
      });
      if (btnLang) btnLang.addEventListener("click", function () {
        closeMenu();
        showToast("Выбор языка — скоро доступно");
      });
      if (btnHelp) btnHelp.addEventListener("click", function () {
        closeMenu();
        showToast("Помощь — скоро доступно");
      });
      if (btnSignout) btnSignout.addEventListener("click", function () {
        closeMenu();
        if (window.confirm("Выйти из аккаунта?")) {
          try {
            if (typeof firebase !== "undefined" && firebase.auth) {
              firebase.auth().signOut();
            }
          } catch (_) { }
        }
      });
    })();

    // "Остановить" — disconnect Telegram from current project
    var cpStopBtn = root.querySelector("#cp-stop-btn");
    if (cpStopBtn) {
      cpStopBtn.addEventListener("click", async function () {
        var p = getActiveProject();
        if (!p) return;
        var confirmed = await showInlineConfirm(
          "Остановить бота?",
          "Бот " + (p.botHost || "") + " перестанет отвечать. Переподключить можно в Настройках.",
          "Остановить"
        );
        if (!confirmed) return;
        cpStopBtn.disabled = true;
        cpStopBtn.textContent = "Останавливаю…";
        try {
          if (typeof firebase !== "undefined" && firebase.auth && firebase.firestore) {
            var user = firebase.auth().currentUser;
            if (user && p.telegramBotId) {
              var botRef = firebase.firestore().collection("users").doc(user.uid).collection("bots").doc(p.telegramBotId);
              var botSnap = await botRef.get();
              if (botSnap.exists && botSnap.data().token) {
                await postJSON("/api/register-webhook", { uid: user.uid, botId: p.telegramBotId, token: botSnap.data().token, remove: true }).catch(function () { });
              }
            }
            await ProjectsApi.updateProject(p.id, { telegramConnected: false });
          }
          notify("Бот остановлен");
          await refreshProjects();
        } catch (e) {
          notify(e.message || "Ошибка при остановке", true);
          cpStopBtn.disabled = false;
          cpStopBtn.textContent = "Остановить";
        }
      });
    }

    // Narrow nav clicks → switch tab
    var cpNavItems = root.querySelector("#cp-nav-items");
    if (cpNavItems) {
      cpNavItems.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-nav]");
        if (!btn) return;
        var tab = btn.getAttribute("data-nav");
        if (tab === "finance") {
          state.tab = "finance";
          syncNavActive("finance");
          renderFinanceView();
          return;
        }
        if (state.activeProjectId) setTab(tab);
        // syncNavActive is already called inside setTab
      });
    }

    var _tgMode = "connect"; // "new" = create project, "connect" = link token to existing project

    window.openTelegramConnectModal = function (mode) {
      _tgMode = mode || "connect";
      if (nodes.tgModalBg) nodes.tgModalBg.classList.add("open");
      if (nodes.tgInputToken) {
        nodes.tgInputToken.value = "";
        setTimeout(function () { nodes.tgInputToken.focus(); }, 100);
      }
      if (nodes.tgBtnConnect) {
        nodes.tgBtnConnect.textContent = "Подключить";
        nodes.tgBtnConnect.disabled = false;
      }
      if (nodes.tgErrorMsg) nodes.tgErrorMsg.textContent = "";
      // Reset tabs to "Новый" for new mode, keep default otherwise
      if (_tgMode === "new" && nodes.tgTabNew && nodes.tgTabExisting) {
        nodes.tgTabNew.classList.add("active");
        nodes.tgTabExisting.classList.remove("active");
        if (nodes.tgStepsNew) nodes.tgStepsNew.style.display = "flex";
        if (nodes.tgStepsExisting) nodes.tgStepsExisting.style.display = "none";
      }
    };

    function closeTelegramConnectModal() {
      if (nodes.tgModalBg) nodes.tgModalBg.classList.remove("open");
    }

    if (nodes.tgModalClose) nodes.tgModalClose.addEventListener("click", closeTelegramConnectModal);
    if (nodes.tgModalBg) nodes.tgModalBg.addEventListener("click", function (e) {
      if (e.target === nodes.tgModalBg) closeTelegramConnectModal();
    });

    if (nodes.tgTabNew && nodes.tgTabExisting) {
      nodes.tgTabNew.addEventListener("click", function () {
        _tgMode = "new";
        nodes.tgTabNew.classList.add("active");
        nodes.tgTabExisting.classList.remove("active");
        if (nodes.tgStepsNew) nodes.tgStepsNew.style.display = "flex";
        if (nodes.tgStepsExisting) nodes.tgStepsExisting.style.display = "none";
      });
      nodes.tgTabExisting.addEventListener("click", function () {
        _tgMode = "connect";
        nodes.tgTabExisting.classList.add("active");
        nodes.tgTabNew.classList.remove("active");
        if (nodes.tgStepsExisting) nodes.tgStepsExisting.style.display = "flex";
        if (nodes.tgStepsNew) nodes.tgStepsNew.style.display = "none";
      });
    }

    if (nodes.tgInputToken) {
      nodes.tgInputToken.addEventListener("input", function () {
        if (nodes.tgErrorMsg) nodes.tgErrorMsg.textContent = "";
        if (nodes.tgBtnConnect) nodes.tgBtnConnect.disabled = !nodes.tgInputToken.value.trim();
      });
    }

    if (nodes.tgBtnConnect) {
      nodes.tgBtnConnect.addEventListener("click", async function () {
        var token = (nodes.tgInputToken.value || "").trim();
        if (!token) {
          if (nodes.tgErrorMsg) nodes.tgErrorMsg.textContent = "Пожалуйста, введите токен.";
          nodes.tgInputToken.focus();
          return;
        }

        nodes.tgBtnConnect.disabled = true;
        nodes.tgBtnConnect.textContent = "Подключение...";
        if (nodes.tgErrorMsg) nodes.tgErrorMsg.textContent = "";

        try {
          if (_tgMode === "new") {
            // Step 1: validate token and get bot info
            nodes.tgBtnConnect.textContent = "Проверяем токен...";
            var verify = await postJSON("/api/verify-telegram-token", { token: token });
            if (!verify.ok || !verify.data || !verify.data.ok) {
              throw new Error((verify.data && (verify.data.error || verify.data.description)) || I18n.t('invalidToken'));
            }
            var tg = verify.data.result || {};
            var usernameClean = String(tg.username || "").replace(/^@/, "");
            var username = usernameClean ? ("@" + usernameClean) : "@pending";
            var botName = tg.first_name || usernameClean || "Мой бот";

            // Step 2: create project
            nodes.tgBtnConnect.textContent = "Создаём проект...";
            var created = await ProjectsApi.createProject({
              name: botName,
              botHost: username,
              requestId: makeRequestId(),
            });

            // Step 3: connect token (registers webhook, saves bot to Firestore)
            nodes.tgBtnConnect.textContent = "Подключаем бота...";
            await connectTelegramToken(token, created.project.id, botName);

            // Step 4: switch to new project
            state.activeProjectId = created.project.id;
            _lsSet("cp_proj", created.project.id);
            closeTelegramConnectModal();
            notify("Бот @" + usernameClean + " подключён!");
            await refreshProjects();
            state.tab = "analytics";
            renderHeader();
            renderSidebar();
            await renderTab();
          } else {
            // Connect token to existing active project
            var p = getActiveProject();
            if (!p) { throw new Error("Нет активного проекта"); }
            nodes.tgBtnConnect.textContent = "Подключаем...";
            await connectTelegramToken(token, p.id, p.name);
            closeTelegramConnectModal();
            notify("Telegram бот подключён!");
            await refreshProjects();
            renderHeader();
          }
        } catch (e) {
          if (nodes.tgErrorMsg) nodes.tgErrorMsg.textContent = e.message || "Ошибка подключения. Проверьте токен.";
          nodes.tgBtnConnect.disabled = false;
          nodes.tgBtnConnect.textContent = "Подключить";
        }
      });
    }

    if (nodes.btnNew) nodes.btnNew.addEventListener("click", function () { window.openTelegramConnectModal("new"); });
    if (nodes.btnNew2) nodes.btnNew2.addEventListener("click", function () { window.openTelegramConnectModal("new"); });
    if (nodes.modalClose) nodes.modalClose.addEventListener("click", closeCreateModal);
    if (nodes.modalCancel) nodes.modalCancel.addEventListener("click", closeCreateModal);
    if (nodes.modal) nodes.modal.addEventListener("click", function (e) {
      if (e.target === nodes.modal) closeCreateModal();
    });
    if (nodes.modalCreate) nodes.modalCreate.addEventListener("click", createProject);

    // Chat modal events
    if (nodes.chatModalClose) nodes.chatModalClose.addEventListener("click", closeChatModal);
    if (nodes.chatModalBg) nodes.chatModalBg.addEventListener("click", function (e) {
      if (e.target === nodes.chatModalBg) closeChatModal();
    });
    if (nodes.chatModalExpand) {
      nodes.chatModalExpand.addEventListener("click", function () {
        if (!nodes.chatModal) return;
        var isExpanded = nodes.chatModal.hasAttribute("data-expanded");
        if (isExpanded) {
          nodes.chatModal.removeAttribute("data-expanded");
          nodes.chatModal.style.width = "";
          nodes.chatModal.style.height = "";
          nodes.chatModal.style.maxHeight = "";
          nodes.chatModal.style.borderRadius = "";
        } else {
          nodes.chatModal.setAttribute("data-expanded", "true");
          nodes.chatModal.style.width = "100%";
          nodes.chatModal.style.height = "100dvh";
          nodes.chatModal.style.maxHeight = "100dvh";
          nodes.chatModal.style.borderRadius = "0";
        }
      });
    }
    if (nodes.btnTopChats) nodes.btnTopChats.addEventListener("click", function () {
      var p = getActiveProject();
      var host = String((p && p.botHost) || "").trim();
      if (host.startsWith("@")) {
        window.open("https://t.me/" + encodeURIComponent(host.replace(/^@/, "")), "_blank");
      } else {
        setTab("chats");
      }
    });
    if (nodes.tabs) nodes.tabs.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      setTab(btn.getAttribute("data-tab"));
    });

    // Create modal KB events
    var _createKbFile = null;
    nodes.createKB.addEventListener("change", function () {
      var val = nodes.createKB.value;
      nodes.createKBFileWrap.style.display = val === "file" ? "block" : "none";
      nodes.createKBTextWrap.style.display = val === "text" ? "block" : "none";
    });
    nodes.createKBDropZone.addEventListener("click", function () { nodes.createKBFileInput.click(); });
    nodes.createKBDropZone.addEventListener("dragover", function (e) { e.preventDefault(); nodes.createKBDropZone.classList.add("drag-over"); });
    nodes.createKBDropZone.addEventListener("dragleave", function () { nodes.createKBDropZone.classList.remove("drag-over"); });
    nodes.createKBDropZone.addEventListener("drop", function (e) {
      e.preventDefault();
      nodes.createKBDropZone.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        _createKbFile = e.dataTransfer.files[0];
        nodes.createKBDropText.textContent = _createKbFile.name;
      }
    });
    nodes.createKBFileInput.addEventListener("change", function () {
      if (nodes.createKBFileInput.files && nodes.createKBFileInput.files[0]) {
        _createKbFile = nodes.createKBFileInput.files[0];
        nodes.createKBDropText.textContent = _createKbFile.name;
      }
    });


    var _lastSourceModalOpenAt = 0;
    var _sourceModalWarned = false;

    function _ensureSourceModalPortal() {
      if (!nodes || !nodes.srcModal || !document.body) return false;
      try {
        if (nodes.srcModal.parentNode !== document.body) {
          document.body.appendChild(nodes.srcModal);
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    function _isSourceModalVisible() {
      if (!nodes || !nodes.srcModal) return false;
      try {
        var bg = nodes.srcModal;
        var cs = window.getComputedStyle(bg);
        if (!cs || cs.display === "none" || cs.visibility === "hidden") return false;
        var bgRect = bg.getBoundingClientRect();
        if (!bgRect || bgRect.width < 40 || bgRect.height < 40) return false;
        var card = bg.querySelector(".src-modal");
        if (!card) return false;
        var cardRect = card.getBoundingClientRect();
        if (!cardRect || cardRect.width < 120 || cardRect.height < 80) return false;
        return true;
      } catch (_) {
        return false;
      }
    }

    function _forceSourceModalVisible(preferredView) {
      if (!nodes || !nodes.srcModal) return false;
      try {
        _ensureSourceModalPortal();
        nodes.srcModal.classList.add("open");
        nodes.srcModal.style.display = "flex";
        nodes.srcModal.style.position = "fixed";
        nodes.srcModal.style.inset = "0";
        nodes.srcModal.style.zIndex = "2147483000";
        nodes.srcModal.style.background = "rgba(0,0,0,0.4)";
        nodes.srcModal.style.justifyContent = "center";
        if (window.innerWidth <= 680) {
          nodes.srcModal.style.alignItems = "flex-end";
          nodes.srcModal.style.padding = "0";
        } else {
          nodes.srcModal.style.alignItems = "center";
          nodes.srcModal.style.padding = "18px";
        }
        if (preferredView && preferredView !== "main") showSrcView(preferredView);
        return _isSourceModalVisible();
      } catch (_) {
        return false;
      }
    }

    function openSourceModalSafe(preferredView) {
      var now = Date.now();
      if (now - _lastSourceModalOpenAt < 250) return;
      _lastSourceModalOpenAt = now;
      try {
        openSourceModal();
        if (preferredView && preferredView !== "main") showSrcView(preferredView);
      } catch (err) {
        console.error("[ProjectsUI] openSourceModal failed:", err);
        if (!_forceSourceModalVisible(preferredView || "main")) {
          notify("Не удалось открыть окно добавления источника", true);
        }
        return;
      }
      setTimeout(function () {
        if (_isSourceModalVisible()) return;
        if (_forceSourceModalVisible(preferredView || "main")) return;
        if (!_sourceModalWarned) {
          _sourceModalWarned = true;
          notify("Не удалось открыть окно добавления источника", true);
        }
      }, 120);
    }
    // Global fallback hook for inline onclick in dynamic markup.
    try {
      window.__projectsOpenSourceModal = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        openSourceModalSafe("main");
        return false;
      };
    } catch (_) { }

    // Source modal events
    nodes.srcClose.addEventListener("click", closeSourceModal);
    nodes.srcModal.addEventListener("click", function (e) {
      if (e.target === nodes.srcModal) closeSourceModal();
    });
    nodes.srcBack.addEventListener("click", function () { showSrcView("main"); });

    nodes.srcPickText.addEventListener("click", function () { showSrcView("text"); nodes.srcTextTitle.focus(); });
    nodes.srcPickUrl.addEventListener("click", function () { showSrcView("url"); nodes.srcUrlHref.focus(); });
    nodes.srcPickFile.addEventListener("click", function () { showSrcView("file"); });

    nodes.srcTextCancel.addEventListener("click", closeSourceModal);
    nodes.srcUrlCancel.addEventListener("click", closeSourceModal);
    nodes.srcFileCancel.addEventListener("click", closeSourceModal);

    // Global fallback for source add buttons in case local listeners are swallowed.
    ["pointerup", "touchend", "click"].forEach(function (evtName) {
      document.addEventListener(evtName, function (e) {
        var t = e && e.target ? (e.target.nodeType === 1 ? e.target : e.target.parentElement) : null;
        if (!t || !t.closest) return;
        var b = t.closest("#projects-add-source, #projects-add-source-empty");
        if (!b) return;
        if (!root.contains(b)) return;
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        openSourceModalSafe();
      }, true);
    });

    // Main drop zone → go to file view
    nodes.srcDropZone.addEventListener("click", function () {
      showSrcView("file");
      try { nodes.srcFileInp.click(); } catch (_) { }
    });
    nodes.srcDropZone.addEventListener("dragover", function (e) {
      e.preventDefault();
      nodes.srcDropZone.classList.add("drag-over");
    });
    nodes.srcDropZone.addEventListener("dragleave", function () {
      nodes.srcDropZone.classList.remove("drag-over");
    });
    nodes.srcDropZone.addEventListener("drop", function (e) {
      e.preventDefault();
      nodes.srcDropZone.classList.remove("drag-over");
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) { setPickedFile(file); showSrcView("file"); }
    });

    // File sub-zone click → open file picker
    nodes.srcFileZone.addEventListener("click", function () { nodes.srcFileInp.click(); });
    nodes.srcFileZone.addEventListener("dragover", function (e) {
      e.preventDefault();
      nodes.srcFileZone.classList.add("drag-over");
    });
    nodes.srcFileZone.addEventListener("dragleave", function () {
      nodes.srcFileZone.classList.remove("drag-over");
    });
    nodes.srcFileZone.addEventListener("drop", function (e) {
      e.preventDefault();
      nodes.srcFileZone.classList.remove("drag-over");
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) setPickedFile(file);
    });
    nodes.srcFileInp.addEventListener("change", function () {
      if (!(nodes.srcFileInp.files && nodes.srcFileInp.files[0])) return;
      setPickedFile(nodes.srcFileInp.files[0]);
    });

    function setPickedFile(file) {
      _srcFile = file;
      nodes.srcFileLbl.textContent = file.name;
    }

    nodes.srcTextOk.addEventListener("click", async function () {
      var title = nodes.srcTextTitle.value.trim();
      var body = nodes.srcTextBody.value.trim();
      if (!title) { nodes.srcTextTitle.focus(); return; }
      if (!body) { nodes.srcTextBody.focus(); return; }
      nodes.srcTextOk.disabled = true;
      nodes.srcTextOk.textContent = I18n.t('add') + "…";
      try {
        var textResult = await ProjectsApi.addSource(state.activeProjectId, { type: "text", title: title, contentRef: body });
        closeSourceModal();
        await loadSources(false);
        await loadKbTopics({ silent: true });
        await refreshProjects();
        if (textResult && textResult.source && textResult.source.id) startSourcePolling(textResult.source.id);
      } catch (e) {
        alert(I18n.t('error') + ": " + (e.message || e));
      } finally {
        nodes.srcTextOk.disabled = false;
        nodes.srcTextOk.textContent = I18n.t('add');
      }
    });

    nodes.srcUrlOk.addEventListener("click", async function () {
      var title = nodes.srcUrlTitle.value.trim();
      var href = nodes.srcUrlHref.value.trim();
      if (!href) { nodes.srcUrlHref.focus(); return; }
      if (!title) title = href;
      nodes.srcUrlOk.disabled = true;
      nodes.srcUrlOk.textContent = I18n.t('add') + "…";
      try {
        await ProjectsApi.addSource(state.activeProjectId, { type: "url", title: title, contentRef: href });
        closeSourceModal();
        await loadSources(false);
        await loadKbTopics({ silent: true });
        await refreshProjects();
      } catch (e) {
        alert(I18n.t('error') + ": " + (e.message || e));
      } finally {
        nodes.srcUrlOk.disabled = false;
        nodes.srcUrlOk.textContent = I18n.t('add');
      }
    });

    async function submitPickedFile() {
      if (!_srcFile) { nodes.srcFileInp.click(); return; }
      nodes.srcFileOk.disabled = true;
      nodes.srcFileOk.textContent = "Извлечение текста…";
      try {
        var text = await readFileAsText(_srcFile);
        if (text && text.length > 200000) {
          text = text.slice(0, 200000);
          notify("Файл большой: загружена первая часть (200000 символов)", true);
        }
        nodes.srcFileOk.textContent = "Загрузка…";
        var result = await ProjectsApi.addSource(state.activeProjectId, { type: "file", title: _srcFile.name, contentRef: text });
        if (nodes.srcModal && nodes.srcModal.classList.contains("open")) closeSourceModal();
        await loadSources(false);
        await loadKbTopics({ silent: true });
        await refreshProjects();
        // Start polling for KB pipeline completion
        if (result && result.source && result.source.id) {
          startSourcePolling(result.source.id);
        }
      } catch (e) {
        var em = String((e && (e.message || (e.data && e.data.error))) || e || "");
        if ((e && e.status === 413) || /payload|too large|entity too large/i.test(em)) {
          alert("Файл слишком большой для загрузки. Попробуйте TXT или уменьшите размер файла.");
        } else {
          alert(I18n.t('error') + ": " + em);
        }
      } finally {
        nodes.srcFileOk.disabled = false;
        nodes.srcFileOk.textContent = I18n.t('uploadFile');
      }
    }
    nodes.srcFileOk.addEventListener("click", submitPickedFile);

    function _loadScript(url) {
      return new Promise(function (resolve, reject) {
        var existing = document.querySelector('script[src="' + url + '"]');
        if (existing) {
          if (existing.dataset && existing.dataset.loaded === "1") { resolve(); return; }
          if (existing.dataset && existing.dataset.failed === "1") {
            reject(new Error("Failed to load script: " + url));
            return;
          }
          existing.addEventListener("load", function () { resolve(); }, { once: true });
          existing.addEventListener("error", function () { reject(new Error("Failed to load script: " + url)); }, { once: true });
          return;
        }
        var s = document.createElement("script");
        s.src = url;
        s.onload = function () {
          try { s.dataset.loaded = "1"; } catch (_) { }
          resolve();
        };
        s.onerror = function () {
          try { s.dataset.failed = "1"; } catch (_) { }
          reject(new Error("Failed to load script: " + url));
        };
        document.head.appendChild(s);
      });
    }

    async function _extractPDF(file) {
      await _loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      var ab = await file.arrayBuffer();
      var pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
      var text = "";
      for (var i = 1; i <= pdf.numPages; i++) {
        var page = await pdf.getPage(i);
        var content = await page.getTextContent();
        text += content.items.map(function (it) { return it.str; }).join(" ") + "\n";
      }
      return text.trim();
    }

    async function _extractDOCX(file) {
      await _loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
      var ab = await file.arrayBuffer();
      var result = await window.mammoth.extractRawText({ arrayBuffer: ab });
      return (result.value || "").trim();
    }

    async function _extractPPTX(file) {
      await _loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
      var ab = await file.arrayBuffer();
      var zip = await window.JSZip.loadAsync(ab);
      var slideKeys = Object.keys(zip.files)
        .filter(function (n) { return /ppt\/slides\/slide\d+\.xml$/.test(n); })
        .sort(function (a, b) {
          return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
        });
      var text = "";
      for (var i = 0; i < slideKeys.length; i++) {
        var xml = await zip.files[slideKeys[i]].async("string");
        var matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
        text += matches.map(function (m) { return m.replace(/<[^>]+>/g, ""); }).join(" ") + "\n";
      }
      return text.trim();
    }

    async function readFileAsText(file) {
      var ext = file.name.split(".").pop().toLowerCase();
      if (ext === "pdf") return _extractPDF(file);
      if (ext === "docx" || ext === "doc") return _extractDOCX(file);
      if (ext === "pptx" || ext === "ppt") return _extractPPTX(file);
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) { resolve(e.target.result || ""); };
        reader.onerror = function () { reject(new Error(I18n.t('errorLoading'))); };
        reader.readAsText(file);
      });
    }

    function openSourceModal() {
      if (!nodes.srcModal || !nodes.srcTextTitle || !nodes.srcViewMain) {
        throw new Error("Source modal nodes not initialized");
      }
      _ensureSourceModalPortal();
      _srcFile = null;
      nodes.srcTextTitle.value = "";
      nodes.srcTextBody.value = "";
      nodes.srcUrlTitle.value = "";
      nodes.srcUrlHref.value = "";
      nodes.srcFileInp.value = "";
      nodes.srcFileLbl.textContent = I18n.t('uploadFileHint');
      showSrcView("main");
      nodes.srcModal.classList.add("open");
      // Hard fallback: force modal visible even if external CSS conflicts exist.
      nodes.srcModal.style.display = "flex";
      nodes.srcModal.style.position = "fixed";
      nodes.srcModal.style.inset = "0";
      nodes.srcModal.style.zIndex = "2147483000";
      nodes.srcModal.style.background = "rgba(0,0,0,0.4)";
      nodes.srcModal.style.justifyContent = "center";
      if (window.innerWidth <= 680) {
        nodes.srcModal.style.alignItems = "flex-end";
        nodes.srcModal.style.padding = "0";
      } else {
        nodes.srcModal.style.alignItems = "center";
        nodes.srcModal.style.padding = "18px";
      }
    }

    function closeSourceModal() {
      nodes.srcModal.classList.remove("open");
      nodes.srcModal.style.display = "";
      nodes.srcModal.style.position = "";
      nodes.srcModal.style.inset = "";
      nodes.srcModal.style.zIndex = "";
      nodes.srcModal.style.background = "";
      nodes.srcModal.style.justifyContent = "";
      nodes.srcModal.style.alignItems = "";
      nodes.srcModal.style.padding = "";
    }

    function showSrcView(view) {
      nodes.srcViewMain.style.display = view === "main" ? "" : "none";
      nodes.srcViewText.style.display = view === "text" ? "" : "none";
      nodes.srcViewUrl.style.display = view === "url" ? "" : "none";
      nodes.srcViewFile.style.display = view === "file" ? "" : "none";
      nodes.srcBack.style.display = view === "main" ? "none" : "";
      nodes.srcTitle.textContent =
        view === "main" ? "" :
          view === "text" ? I18n.t('addManually') :
            view === "url" ? I18n.t('addByUrl') : I18n.t('uploadFile');
    }

    async function openChatModal(chatId, chatName, chatDate) {
      if (nodes.chatModalTitle) nodes.chatModalTitle.textContent = chatName || "Диалог";
      if (nodes.chatModalSub) nodes.chatModalSub.textContent = chatDate || "";
      if (nodes.chatModalBody) nodes.chatModalBody.innerHTML = "<div style='text-align:center;padding:40px;color:#8e8e93'>Загрузка сообщений…</div>";
      if (nodes.chatModalBg) nodes.chatModalBg.classList.add("open");

      try {
        var res = await ProjectsApi.listMessages(chatId);
        var msgs = res.messages || [];
        if (!msgs.length) {
          if (nodes.chatModalBody) nodes.chatModalBody.innerHTML = "<div style='text-align:center;padding:40px;color:#8e8e93'>Сообщений пока нет</div>";
          return;
        }
        var html = msgs.map(function (m) {
          var isBot = String(m.role).toLowerCase() === "bot" || String(m.role).toLowerCase() === "assistant";
          var cls = isBot ? "bot" : "user";
          var time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString("ru-RU", { hour: '2-digit', minute: '2-digit' }) : "";
          return "<div class='chat-msg " + cls + "'>" +
            "<div class='chat-msg-bubble'>" + esc(m.text || m.content || "") + "</div>" +
            (time ? "<div class='chat-msg-time'>" + time + "</div>" : "") +
            "</div>";
        }).join("");
        if (nodes.chatModalBody) {
          nodes.chatModalBody.innerHTML = html;
          setTimeout(function () {
            nodes.chatModalBody.scrollTop = nodes.chatModalBody.scrollHeight;
          }, 20);
        }
      } catch (e) {
        if (nodes.chatModalBody) nodes.chatModalBody.innerHTML = "<div style='text-align:center;padding:40px;color:#ff3b30'>Ошибка при загрузке: " + esc(e.message) + "</div>";
      }
    }

    function closeChatModal() {
      if (nodes.chatModalBg) nodes.chatModalBg.classList.remove("open");
      if (nodes.chatModal) {
        nodes.chatModal.removeAttribute("data-expanded");
        nodes.chatModal.style.width = "";
        nodes.chatModal.style.height = "";
        nodes.chatModal.style.maxHeight = "";
        nodes.chatModal.style.borderRadius = "";
      }
    }

    async function refreshProjects() {
      var data = await ProjectsApi.listProjects();
      state.projects = data.projects || [];
      if (!state.activeProjectId && state.projects.length > 0) { state.activeProjectId = state.projects[0].id; _lsSet("cp_proj", state.activeProjectId); }
      if (state.activeProjectId && !state.projects.some(function (p) { return p.id === state.activeProjectId; })) {
        state.activeProjectId = state.projects[0] ? state.projects[0].id : null;
        if (state.activeProjectId) _lsSet("cp_proj", state.activeProjectId);
      }
      renderSidebar();
      renderHeader();
      await renderTab();
    }

    async function connectTelegramToken(token, projectId, projectName) {
      if (!token || !isTelegramToken(token)) return null;
      if (!(typeof firebase !== "undefined" && firebase.auth && firebase.firestore)) {
        throw new Error("Firebase client unavailable");
      }
      var user = firebase.auth().currentUser;
      if (!user || !user.uid) throw new Error(I18n.t('unauthorized'));
      var uid = user.uid;

      var verify = await postJSON("/api/verify-telegram-token", { token: token });
      if (!verify.ok || !verify.data || !verify.data.ok) {
        throw new Error((verify.data && verify.data.error) || I18n.t('invalidToken'));
      }
      var tg = verify.data.result || {};
      var usernameClean = String(tg.username || "").replace(/^@/, "");
      var username = usernameClean ? ("@" + usernameClean) : "";

      var botsCol = firebase.firestore().collection("users").doc(uid).collection("bots");
      var byToken = await botsCol.where("token", "==", token).limit(1).get();
      var botRef = byToken.empty ? botsCol.doc() : byToken.docs[0].ref;
      await botRef.set({
        name: projectName || tg.first_name || username || "Bot",
        token: token,
        username: username || (projectName || "bot"),
        telegram: {
          status: "waiting_first_update",
          botId: tg.id || null,
          botUsername: username || null,
          connectedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      var webhook = await postJSON("/api/register-webhook", { uid: uid, botId: botRef.id, token: token, remove: false });
      if (!webhook.ok || !webhook.data || !webhook.data.ok) {
        throw new Error((webhook.data && (webhook.data.description || webhook.data.error)) || "Webhook registration failed");
      }

      var projectPatch = {
        telegramBotId: botRef.id,
        telegramConnected: true,
        telegramUsername: username || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (username) projectPatch.botHost = username;
      await firebase.firestore().doc("users/" + uid + "/projects/" + projectId).set(projectPatch, { merge: true });

      // Ensure the agent is active when a bot is connected
      await firebase.firestore().doc("users/" + uid + "/settings/agent").set({ active: true }, { merge: true });

      return { botId: botRef.id, username: username };
    }

    async function reactivateTelegram(projectId) {
      if (!(typeof firebase !== "undefined" && firebase.auth && firebase.firestore)) {
        throw new Error("Firebase client unavailable");
      }
      var user = firebase.auth().currentUser;
      if (!user) throw new Error(I18n.t('unauthorized'));

      var p = state.projects.find(function (x) { return x.id === projectId; });
      if (!p || !p.telegramBotId) throw new Error("Bot ID not found in project");

      var botSnap = await firebase.firestore().collection("users").doc(user.uid).collection("bots").doc(p.telegramBotId).get();
      if (!botSnap.exists || !botSnap.data().token) {
        throw new Error("Токен не найден. Введите его заново.");
      }
      var token = botSnap.data().token;

      var webhook = await postJSON("/api/register-webhook", { uid: user.uid, botId: p.telegramBotId, token: token, remove: false });
      if (!webhook.ok || !webhook.data || !webhook.data.ok) {
        throw new Error((webhook.data && (webhook.data.description || webhook.data.error)) || "Ошибка при регистрации вебхука");
      }

      await ProjectsApi.updateProject(projectId, {
        telegramConnected: true
      });

      // Ensure the agent is active
      await firebase.firestore().doc("users/" + user.uid + "/settings/agent").set({ active: true }, { merge: true });

      return true;
    }

    function getActiveProject() {
      return state.projects.find(function (p) { return p.id === state.activeProjectId; }) || null;
    }

    var _icFolder = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0;opacity:.55'><path d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'/></svg>";

    var _ddEl = null;

    function closeProjectMenu() {
      if (_ddEl) { _ddEl.remove(); _ddEl = null; }
    }

    function openProjectMenu(projectId, btnEl) {
      closeProjectMenu();
      var p = state.projects.find(function (pr) { return pr.id === projectId; });
      if (!p) return;
      var dd = document.createElement("div");
      dd.className = "proj-dropdown";
      dd.innerHTML =
        "<div class='proj-dd-item' data-act='share'><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'/><polyline points='16 6 12 2 8 6'/><line x1='12' y1='2' x2='12' y2='15'/></svg>Поделиться</div>" +
        "<div class='proj-dd-item' data-act='rename'><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M12 20h9'/><path d='M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'/></svg>Переименовать проект</div>" +
        "<div class='proj-dd-sep'></div>" +
        "<div class='proj-dd-item proj-dd-danger' data-act='delete'><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'/></svg>Удалить проект</div>";

      var rect = btnEl.getBoundingClientRect();
      dd.style.top = (rect.bottom + 4) + "px";
      dd.style.left = Math.max(8, rect.right - 220) + "px";
      root.appendChild(dd);
      _ddEl = dd;

      dd.addEventListener("click", async function (e) {
        var item = e.target.closest("[data-act]");
        if (!item) return;
        var act = item.getAttribute("data-act");
        closeProjectMenu();
        if (act === "share") await doShareProject(p);
        if (act === "rename") await doRenameProject(p);
        if (act === "delete") await doDeleteProject(p);
      });

      setTimeout(function () {
        document.addEventListener("click", function _h(e) {
          document.removeEventListener("click", _h);
          if (_ddEl && !_ddEl.contains(e.target)) closeProjectMenu();
        });
      }, 0);
    }

    async function doShareProject(p) {
      var host = p.botHost || "";
      var link = host.startsWith("@") ? ("https://t.me/" + host.slice(1)) : host || p.name;
      try {
        await navigator.clipboard.writeText(link);
        notify(I18n.t('copied') + link);
      } catch (_) {
        notify(I18n.t('refLink') + ": " + link);
      }
    }

    async function doRenameProject(p) {
      var newName = await showInlinePrompt('Переименовать проект:', p.name);
      if (!newName || newName === p.name) return;
      await ProjectsApi.updateProject(p.id, { name: newName.trim() });
      notify(I18n.t('saved'));
      await refreshProjects();
    }

    function showDeleteConfirm(projectName) {
      return new Promise(function (resolve) {
        var overlay = document.createElement("div");
        overlay.className = "del-confirm-bg";
        overlay.innerHTML =
          "<div class='del-confirm-modal'>" +
          "<div class='del-confirm-title'>Удалить проект?</div>" +
          "<div class='del-confirm-body'><strong>Это приведёт к безвозвратному удалению всех источников и чатов проекта «" + esc(projectName) + "».</strong> Это действие нельзя отменить.</div>" +
          "<div class='del-confirm-btns'><button class='del-cancel-btn'>Отменить</button><button class='del-ok-btn'>Удалить</button></div>" +
          "</div>";
        document.body.appendChild(overlay);
        overlay.querySelector(".del-cancel-btn").addEventListener("click", function () { overlay.remove(); resolve(false); });
        overlay.querySelector(".del-ok-btn").addEventListener("click", function () { overlay.remove(); resolve(true); });
        overlay.addEventListener("click", function (e) { if (e.target === overlay) { overlay.remove(); resolve(false); } });
      });
    }

    function showInlineConfirm(title, body, okLabel) {
      return new Promise(function (resolve) {
        var overlay = document.createElement("div");
        overlay.className = "del-confirm-bg";
        overlay.innerHTML =
          "<div class='del-confirm-modal'>" +
          "<div class='del-confirm-title'>" + esc(title) + "</div>" +
          (body ? "<div class='del-confirm-body'>" + esc(body) + "</div>" : "") +
          "<div class='del-confirm-btns'><button class='del-cancel-btn'>Отменить</button><button class='del-ok-btn'>" + esc(okLabel || "Удалить") + "</button></div>" +
          "</div>";
        document.getElementById("projects-ui-root").appendChild(overlay);
        overlay.querySelector(".del-cancel-btn").addEventListener("click", function () { overlay.remove(); resolve(false); });
        overlay.querySelector(".del-ok-btn").addEventListener("click", function () { overlay.remove(); resolve(true); });
        overlay.addEventListener("click", function (e) { if (e.target === overlay) { overlay.remove(); resolve(false); } });
      });
    }

    function showInlinePrompt(title, defaultValue) {
      return new Promise(function (resolve) {
        var overlay = document.createElement("div");
        overlay.className = "del-confirm-bg";
        overlay.innerHTML =
          "<div class='del-confirm-modal'>" +
          "<div class='del-confirm-title'>" + esc(title) + "</div>" +
          "<input class='del-confirm-input' value='" + esc(defaultValue || '') + "'>" +
          "<div class='del-confirm-btns'><button class='del-cancel-btn'>Отменить</button><button class='del-ok-btn-primary'>OK</button></div>" +
          "</div>";
        var input = overlay.querySelector(".del-confirm-input");
        document.getElementById("projects-ui-root").appendChild(overlay);
        input.focus();
        input.select();
        overlay.querySelector(".del-cancel-btn").addEventListener("click", function () { overlay.remove(); resolve(null); });
        overlay.querySelector(".del-ok-btn-primary").addEventListener("click", function () { var v = input.value.trim(); overlay.remove(); resolve(v || null); });
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { var v = input.value.trim(); overlay.remove(); resolve(v || null); }
          if (e.key === "Escape") { overlay.remove(); resolve(null); }
        });
        overlay.addEventListener("click", function (e) { if (e.target === overlay) { overlay.remove(); resolve(null); } });
      });
    }

    async function doDeleteProject(p) {
      var confirmed = await showDeleteConfirm(p.name);
      if (!confirmed) return;
      await ProjectsApi.deleteProject(p.id);
      if (p.id === state.activeProjectId) state.activeProjectId = null;
      await refreshProjects();
    }

    function renderSidebar() {
      // Sidebar project list removed - consolidated to header switcher
      if (root._syncMobileNav) root._syncMobileNav();
    }

    function openProjectSwitcher(anchorEl) {
      var switcherNodes = anchorEl || root.querySelector(".cp-topbar-left");
      if (!switcherNodes) return;

      // Toggle: close if already open
      var existingDd = root.querySelector(".proj-switcher-dd");
      if (existingDd) { existingDd.remove(); return; }

      var dd = document.createElement("div");
      dd.className = "proj-switcher-dd";

      // Track whether we've already handled close to avoid double-calls
      var _closed = false;
      function _closeDd() {
        if (_closed) return;
        _closed = true;
        if (dd.parentNode) dd.remove();
        var arrow = root.querySelector("#cp-desk-sw-arrow");
        if (arrow) arrow.classList.remove("open");
        document.removeEventListener("click", _outsideClick);
      }

      // Project list
      var html = "";
      state.projects.forEach(function (p) {
        var isActive = p.id === state.activeProjectId;
        html += "<div class='proj-switcher-item " + (isActive ? "active" : "") + "' data-id='" + p.id + "'>" +
          _icFolder +
          "<span class='project-name'>" + esc(p.name) + "</span>" +
          "<span class='proj-check'>✓</span></div>";
      });
      dd.innerHTML = html;

      dd.querySelectorAll(".proj-switcher-item").forEach(function (item) {
        item.addEventListener("click", function () {
          var pid = item.getAttribute("data-id");
          _closeDd();
          if (pid !== state.activeProjectId) {
            state.activeProjectId = pid;
            _lsSet("cp_proj", pid);
            state.chats = [];
            state.sources = [];
            state.kbTopics = [];
            state.chatsLoadedProjectId = null;
            state.sourcesLoadedProjectId = null;
            state.kbTopicsLoadedProjectId = null;
            state.kbTopicsQuery = "";
            state.kbTopicsSort = "popular";
            renderHeader();
            renderSidebar();
            renderTab();
          }
        });
      });

      // "+ Добавить проект" button
      var newProjBtn = document.createElement("button");
      newProjBtn.type = "button";
      newProjBtn.className = "proj-switcher-new";
      newProjBtn.innerHTML = "<svg style='pointer-events:none' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg> Добавить проект";
      newProjBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        _closeDd();
        // Open modal directly — dropdown is inside root so nodes are accessible
        var tgBg = root.querySelector("#tg-connect-modal");
        if (tgBg) {
          var tokenInput = root.querySelector("#tg-connect-token");
          var errorDiv = root.querySelector("#tg-connect-error");
          var connectBtn = root.querySelector("#tg-connect-btn");
          var tabNew = root.querySelector("#tg-tab-new");
          var tabExisting = root.querySelector("#tg-tab-existing");
          var stepsNew = root.querySelector("#tg-steps-new");
          var stepsExisting = root.querySelector("#tg-steps-existing");
          if (tokenInput) tokenInput.value = "";
          if (errorDiv) errorDiv.textContent = "";
          if (connectBtn) { connectBtn.disabled = false; connectBtn.textContent = "Подключить"; }
          if (tabNew) tabNew.classList.add("active");
          if (tabExisting) tabExisting.classList.remove("active");
          if (stepsNew) stepsNew.style.display = "flex";
          if (stepsExisting) stepsExisting.style.display = "none";
          tgBg.classList.add("open");
          if (typeof _tgMode !== "undefined") { try { _tgMode = "new"; } catch(_) {} }
          setTimeout(function () { if (tokenInput) tokenInput.focus(); }, 100);
        } else if (window.openTelegramConnectModal) {
          window.openTelegramConnectModal("new");
        }
      });
      dd.appendChild(newProjBtn);

      // Mount inside root (same stacking context as modal, avoids z-index conflicts)
      root.appendChild(dd);
      var rect = switcherNodes.getBoundingClientRect();
      dd.style.top = (rect.bottom + 6) + "px";
      dd.style.left = rect.left + "px";
      var ddWidth = dd.offsetWidth || 220;
      if (rect.left + ddWidth > window.innerWidth - 8) {
        dd.style.left = (window.innerWidth - ddWidth - 8) + "px";
      }

      // Outside-click closes dropdown
      function _outsideClick(e) {
        if (!dd.contains(e.target) && !switcherNodes.contains(e.target)) {
          _closeDd();
        }
      }
      setTimeout(function () {
        document.addEventListener("click", _outsideClick);
      }, 0);
    }

    function renderHeader() {
      var p = getActiveProject();

      // Wire sidebar header click → openProjectSwitcher
      var sidebarSwitcher = root.querySelector("#cp-sidebar-switcher");
      if (sidebarSwitcher && !sidebarSwitcher._wired) {
        sidebarSwitcher._wired = true;
        sidebarSwitcher.addEventListener("click", function (e) {
          openProjectSwitcher(sidebarSwitcher);
        });
      }

      // Wire desktop topbar switcher
      var deskSwitcher = root.querySelector("#cp-desk-switcher");
      if (deskSwitcher && !deskSwitcher._wired) {
        deskSwitcher._wired = true;
        deskSwitcher.addEventListener("click", function (e) {
          e.stopPropagation();
          var arrow = root.querySelector("#cp-desk-sw-arrow");
          openProjectSwitcher(deskSwitcher);
          if (arrow) arrow.classList.toggle("open");
          // Remove open class when dropdown closes
          setTimeout(function () {
            if (!document.querySelector(".proj-switcher-dd")) {
              if (arrow) arrow.classList.remove("open");
            }
          }, 50);
        });
      }

      // Update desktop switcher avatar + name
      var deskAv = root.querySelector("#cp-desk-sw-av");
      var deskName = root.querySelector("#cp-desk-sw-name");
      if (p) {
        var colours = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"];
        var ci = state.projects.indexOf(p) % colours.length;
        var col = colours[ci < 0 ? 0 : ci];
        var initial = (p.name || "?").charAt(0).toUpperCase();
        // Use botHost (@username) as display name if available
        var displayName = (p.telegramConnected && p.botHost && p.botHost.startsWith("@")) ? p.botHost : p.name;
        if (deskAv) { deskAv.style.background = col; deskAv.textContent = initial; }
        if (deskName) deskName.textContent = displayName;
      } else {
        if (deskAv) { deskAv.style.background = "#a5b4fc"; deskAv.textContent = "?"; }
        if (deskName) deskName.textContent = "Выберите проект";
      }

      // Update sidebar avatar
      var swAv = root.querySelector("#cp-sw-av");
      if (swAv) {
        if (p) {
          var colours2 = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"];
          var ci2 = state.projects.indexOf(p) % colours2.length;
          swAv.style.background = colours2[ci2 < 0 ? 0 : ci2];
          swAv.textContent = (p.name || "?").charAt(0).toUpperCase();
        } else {
          swAv.style.background = "#6366f1";
          swAv.textContent = "?";
        }
      }


      var statusDot = root.querySelector("#cp-status-dot");
      var statusLabel = root.querySelector("#cp-status-label");
      var stopBtn = root.querySelector("#cp-stop-btn");
      var agentSection = root.querySelector("#cp-agent-section");
      if (!p) {
        nodes.title.textContent = "Выберите проект";
        if (nodes.meta) nodes.meta.textContent = "";
        if (nodes.tabs) nodes.tabs.style.display = "none";
        if (nodes.btnTopChats) nodes.btnTopChats.style.display = "none";
        if (statusDot) { statusDot.className = "cp-status-dot offline"; }
        if (statusLabel) statusLabel.textContent = "Не активен";
        if (stopBtn) stopBtn.style.display = "none";
        if (agentSection) agentSection.style.display = "none";
        return;
      }
      nodes.title.textContent = "ИИ АГЕНТ";
      var isTgConnected = (p.telegramConnected === true || p.telegramConnected === "true") && !!p.botHost && p.botHost.startsWith("@");
      if (statusDot) statusDot.className = "cp-status-dot" + (isTgConnected ? "" : " offline");
      if (statusLabel) statusLabel.textContent = isTgConnected ? "Активен" : "Не активен";
      if (stopBtn) stopBtn.style.display = isTgConnected ? "" : "none";
      var meta = [];
      if (p.sourcesCount) meta.push("Источников: " + p.sourcesCount);
      if (p.chatsCount) meta.push("Чатов: " + p.chatsCount);
      if (nodes.meta) nodes.meta.textContent = meta.join(" · ");
      if (nodes.tabs) nodes.tabs.style.display = "none";
      if (nodes.btnTopChats) nodes.btnTopChats.style.display = isTgConnected ? "inline-flex" : "none";
      var topTab = state.tab === "unanswered" ? "settings" : state.tab;
      if (nodes.tabs) nodes.tabs.querySelectorAll(".projects-tab").forEach(function (t) {
        t.classList.toggle("active", t.getAttribute("data-tab") === topTab);
      });
      syncNavActive(state.tab);
      // Show AI-agent section and sync its state
      if (agentSection) agentSection.style.display = "";
      if (root._syncAgentNav) root._syncAgentNav(state.tab);
      if (root._loadUnansweredCount) root._loadUnansweredCount();
    }

    // Map tab → which nav icon to highlight
    var _tabToNav = { analytics: "analytics", chats: "chats", testing: "chats", sources: "sources", unanswered: "sources", settings: "settings", finance: "finance" };

    function syncNavActive(tab) {
      var navTarget = _tabToNav[tab] || tab;
      var cpNavItems = root.querySelector("#cp-nav-items");
      if (!cpNavItems) return;
      cpNavItems.querySelectorAll(".cp-nav-item").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-nav") === navTarget);
      });
    }

    function setTab(tab) {
      state.tab = tab;
      _lsSet("cp_tab", tab);
      syncNavActive(tab);
      renderHeader();
      if (root._syncMobileNav) root._syncMobileNav();
      renderTab();
    }

    async function renderTab() {
      if (state.tab === "finance") { renderFinanceView(); return; }
      if (!state.activeProjectId) {
        nodes.content.innerHTML = emptyHtml();
        var b = root.querySelector("#projects-new-empty");
        if (b) b.addEventListener("click", function () { window.openTelegramConnectModal("new"); });
        return;
      }
      if (state.tab === "analytics") { renderAnalyticsView(); return; }
      if (state.tab === "testing") { renderTestingView(); return; }
      if (state.tab === "chats") {
        renderChatsView();
        loadChats(false, { silent: true });
        return;
      }
      if (state.tab === "sources") {
        renderSourcesView();
        loadSources(false, { silent: true });
        loadKbTopics({ silent: true });
        return;
      }
      if (state.tab === "unanswered") {
        renderUnansweredView();
        loadUnanswered();
        return;
      }
      await loadSettings();
    }

    function renderChatsView() {
      var p = getActiveProject() || {};
      var chatsCount = Number(p.chatsCount || state.chats.length || 0);
      var sourcesCount = Number(p.sourcesCount || 0);
      if (!state.chats.length) {
        nodes.content.innerHTML = "<div class='projects-empty'><div><h3>Чатов пока нет</h3><p>Здесь будут реальные диалоги клиентов проекта.</p></div></div>";
        return;
      }
      var isTg = !!(p.telegramConnected && p.botHost && p.botHost.startsWith("@"));
      var isMobile = window.innerWidth <= 680;
      nodes.content.innerHTML = "" +
        "<div class='projects-chat-grid'>" +
        "<div class='projects-card'>" +
        "<div class='cardHead'><h2>Диалоги <span style='font-weight:400;color:#737378;font-size:14px;margin-left:4px;'>" + chatsCount + "</span></h2>" +
        "<div style='display:flex;gap:8px;flex:1;'>" +
        "<input id='projects-chat-q' placeholder='Поиск чатов…' class='search' style='flex:1;min-width:0;'>" +
        "<select id='projects-chat-sort' class='select'><option value='newest'>Новые</option><option value='oldest'>Старые</option></select>" +
        "</div></div>" +
        "<div id='projects-chat-virtual' class='projects-virtual'><div id='projects-chat-list' class='projects-virtual-spacer'></div></div>" +
        "<div class='projects-load-more'><button class='projects-btn' id='projects-chat-more' " + (state.chatsHasMore ? "" : "style='display:none'") + ">Показать ещё</button></div>" +
        "</div>" +
        "<div class='projects-card'>" +
        "<div class='cardHead'><h2>Статус</h2></div>" +
        "<div class='projects-status-grid'>" +
        "<div class='projects-kpi'><div class='projects-kpi-k'>Чаты</div><div class='projects-kpi-v'>" + chatsCount + "</div></div>" +
        "<div class='projects-kpi'><div class='projects-kpi-k'>Источники</div><div class='projects-kpi-v'>" + sourcesCount + "</div></div>" +
        "<div class='projects-kpi'><div class='projects-kpi-k'>База знаний</div><div class='projects-kpi-v' style='font-size:16px;'>" + (sourcesCount > 0 ? "<span style='color:#34c759'>Готова</span>" : "<span style='color:#737378'>Пусто</span>") + "</div></div>" +
        "<div class='projects-kpi'><div class='projects-kpi-k'>Telegram</div><div class='projects-kpi-v' style='font-size:16px;'>" + (isTg ? "<span style='color:#34c759'>Подключён</span>" : "<span style='color:#ff3b30'>Не подключён</span>") + "</div></div>" +
        "</div>" +
        "<div class='projects-hint'>Загрузите базу знаний → откройте бота → напишите /start.</div>" +
        "</div>" +
        "</div>" +
        "<div class='projects-bottom-bar' style='display:flex;'><button class='projects-btn primary' id='projects-bottom-add'>+ База знаний</button><button class='projects-btn' id='projects-bottom-open'>Открыть бота</button></div>";
      var qInp = root.querySelector("#projects-chat-q");
      var sSel = root.querySelector("#projects-chat-sort");
      var list = root.querySelector("#projects-chat-list");
      var vbox = root.querySelector("#projects-chat-virtual");
      var more = root.querySelector("#projects-chat-more");
      var bAdd = root.querySelector("#projects-bottom-add");
      var bOpen = root.querySelector("#projects-bottom-open");
      qInp.value = state.chatsQuery;
      sSel.value = state.sort;
      var debouncedChatsSearch = debounce(function () {
        state.chatsCursor = null;
        state.chatsLoadedProjectId = null;
        loadChats(false);
      }, 260);
      qInp.addEventListener("input", function () {
        state.chatsQuery = qInp.value.trim();
        debouncedChatsSearch();
      });
      sSel.addEventListener("change", function () {
        state.sort = sSel.value;
        state.chatsCursor = null;
        state.chatsLoadedProjectId = null;
        loadChats(false);
      });
      if (more) more.addEventListener("click", function () { loadChats(true); });
      if (bAdd) bAdd.addEventListener("click", function () { setTab("sources"); });
      if (bOpen) bOpen.addEventListener("click", function () {
        var uname = String(p.botHost || "").replace(/^@/, "").trim();
        if (!uname) return;
        window.open("https://t.me/" + encodeURIComponent(uname), "_blank");
      });
      renderVirtualRows(vbox, list, state.chats, function (c) {
        var when = c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString("ru-RU") : "—";
        var title = esc(c.name || c.userExternalId || c.id);
        return "<div class='projects-item chat-item-row' style='cursor:pointer' data-chat-id='" + esc(c.id) + "' data-chat-title='" + title + "' data-chat-date='" + esc(when) + "'><div><h4>" + title +
          "</h4><p>Последнее: " + esc(c.lastMessage || "") + "</p></div><div style='text-align:right'><div class='projects-status'>" +
          esc(when) + "</div></div></div>";
      }, 88);

      if (list) {
        list.onclick = function (e) {
          var row = e.target.closest('.chat-item-row');
          if (row) {
            openChatModal(row.getAttribute('data-chat-id'), row.getAttribute('data-chat-title'), row.getAttribute('data-chat-date'));
          }
        };
      }
    }

    async function loadChats(append, options) {
      var opts = options || {};
      var requestedProjectId = state.activeProjectId;
      var reqId = ++state.chatsRequestSeq;
      var data = await ProjectsApi.listChats(state.activeProjectId, {
        q: state.chatsQuery,
        sort: state.sort,
        limit: 30,
        cursor: append ? state.chatsCursor : "",
      });
      if (reqId !== state.chatsRequestSeq) return;
      if (state.activeProjectId !== requestedProjectId) return;
      state.chats = append ? state.chats.concat(data.chats || []) : (data.chats || []);
      state.chatsCursor = data.nextCursor || null;
      state.chatsHasMore = !!data.hasMore;
      state.chatsLoadedProjectId = requestedProjectId;
      if (state.tab === "chats" && !opts.silent) renderChatsView();
      if (state.tab === "chats" && opts.silent) renderChatsView();
    }

    function renderSourcesView() {
      var p = getActiveProject() || {};
      var totalSrc = state.sources.length;
      var processingCount = state.sources.filter(function (s) { return s.status === "processing" || s.status === "pending"; }).length;

      // If all sources are processing (first add), show the processing steps view.
      if (processingCount > 0 && processingCount === totalSrc && totalSrc > 0) {
        var _icAnalyze = "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z'/></svg>";
        var _icLayers = "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><polygon points='12 2 2 7 12 12 22 7 12 2'/><polyline points='2 17 12 22 22 17'/><polyline points='2 12 12 17 22 12'/></svg>";
        var _icBrain = "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83'/></svg>";
        nodes.content.innerHTML =
          "<div class='cp-proc-view'>" +
          "<div class='cp-proc-title'>Обработка данных</div>" +
          "<div class='cp-proc-step'><div class='cp-proc-step-head'>" +
          "<div class='cp-proc-icon'>" + _icAnalyze + "</div>" +
          "<div><div class='cp-proc-step-name'>Анализ текста</div>" +
          "<div class='cp-proc-step-desc'>Анализируем содержимое файлов на наличие ошибок и опечаток</div></div></div>" +
          "<div class='cp-proc-track'><div class='cp-proc-fill cp-proc-fill-green' id='cp-proc-bar-1'></div></div></div>" +
          "<div class='cp-proc-step'><div class='cp-proc-step-head'>" +
          "<div class='cp-proc-icon'>" + _icLayers + "</div>" +
          "<div><div class='cp-proc-step-name'>Создание базы знаний</div>" +
          "<div class='cp-proc-step-desc'>Разбиваем данные на смысловые блоки и составляем базу вопросов</div></div></div>" +
          "<div class='cp-proc-track'><div class='cp-proc-fill cp-proc-fill-blue' id='cp-proc-bar-2'></div></div></div>" +
          "<div class='cp-proc-step'><div class='cp-proc-step-head'>" +
          "<div class='cp-proc-icon'>" + _icBrain + "</div>" +
          "<div><div class='cp-proc-step-name'>Обучение ИИ-агента</div>" +
          "<div class='cp-proc-step-desc'>Готовим скрипты и настройки, подбираем оптимальный тон и стиль</div></div></div>" +
          "<div class='cp-proc-track'><div class='cp-proc-fill cp-proc-fill-gray' id='cp-proc-bar-3' style='width:0;background:#8e8e93;border-radius:3px'></div></div></div>" +
          "</div>";
        // Animate progress bars sequentially
        var _b1 = root.querySelector("#cp-proc-bar-1");
        var _b2 = root.querySelector("#cp-proc-bar-2");
        var _b3 = root.querySelector("#cp-proc-bar-3");
        if (_b1) setTimeout(function () { _b1.style.width = "100%"; }, 80);
        if (_b2) setTimeout(function () { _b2.style.width = "65%"; }, 1200);
        if (_b3) setTimeout(function () { _b3.style.width = "20%"; }, 3500);
        return;
      }

      var allTopics = Array.isArray(state.kbTopics) ? state.kbTopics.slice() : [];
      var q = String(state.kbTopicsQuery || "").trim().toLowerCase();
      var sortMode = state.kbTopicsSort || "popular";
      if (q) {
        allTopics = allTopics.filter(function (t) {
          return String(t.question || "").toLowerCase().indexOf(q) !== -1 ||
            String(t.answer || "").toLowerCase().indexOf(q) !== -1;
        });
      }
      allTopics.sort(function (a, b) {
        var aAsked = Number(a.asked || 0);
        var bAsked = Number(b.asked || 0);
        var aTs = _asTsMs(a.updatedAt || a.createdAt);
        var bTs = _asTsMs(b.updatedAt || b.createdAt);
        if (sortMode === "recent") return bTs - aTs || bAsked - aAsked;
        return bAsked - aAsked || bTs - aTs;
      });

      var headHtml =
        "<div class='cp-kb-topics-head'>" +
        "<div class='cp-kb-title'>Все темы <span class='cp-kb-title-count'>" + (state.kbTopics || []).length + "</span></div>" +
        "<div class='cp-kb-toolbar'>" +
        "<button type='button' class='projects-btn primary' id='projects-add-source' onclick='return window.__projectsOpenSourceModal && window.__projectsOpenSourceModal(event)'>+ Добавить источник</button>" +
        "<div class='cp-kb-search-wrap'><span class='cp-kb-search-ico'>" +
        "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'></circle><line x1='21' y1='21' x2='16.65' y2='16.65'></line></svg>" +
        "</span><input id='projects-kb-q' class='cp-kb-search' placeholder='Поиск по названию'></div>" +
        "<div class='cp-kb-sort-wrap'>" +
        "<div class='cp-kb-sort-switch' id='projects-kb-sort-switch'>" +
        "<button type='button' class='cp-kb-sort-btn' data-kb-sort='popular' aria-label='Популярность'>" +
        "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='20' x2='18' y2='10'></line><line x1='12' y1='20' x2='12' y2='4'></line><line x1='6' y1='20' x2='6' y2='14'></line></svg>" +
        "</button>" +
        "<button type='button' class='cp-kb-sort-btn' data-kb-sort='recent' aria-label='Новые'>" +
        "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'></circle><polyline points='12 7 12 12 15 14'></polyline></svg>" +
        "</button>" +
        "</div>" +
        "<span class='cp-kb-sort-label' id='projects-kb-sort-label'>Популярность</span>" +
        "</div>" +
        "</div></div>" +
        (state.kbTopicsLoading ? "<div class='cp-training-banner'><div class='cp-training-spinner'></div>Загружаем базу знаний…</div>" : "") +
        (processingCount > 0 ? "<div class='cp-training-banner'><div class='cp-training-spinner'></div>Идет обучение ИИ-агента</div>" : "");

      if (!(state.kbTopics || []).length) {
        nodes.content.innerHTML = headHtml +
          "<div class='cp-kb-empty'><h3>База знаний пока пуста</h3><p>Загрузите файл или добавьте текст. После обработки появятся темы, которые можно редактировать.</p></div>";
      } else if (!allTopics.length) {
        nodes.content.innerHTML = headHtml +
          "<div class='cp-kb-empty'><h3>Ничего не найдено</h3><p>Попробуйте изменить поисковый запрос.</p></div>";
      } else {
        var rowsHtml = allTopics.map(function (topic) {
          var asked = Number(topic.asked || 0);
          var lastTs = _asTsMs(topic.updatedAt || topic.createdAt);
          var lastLabel = lastTs ? new Date(lastTs).toLocaleDateString("ru-RU") : "—";
          return "<div class='cp-kb-row kb-topics-row' data-kb-id='" + esc(topic.id) + "'>" +
            "<div class='cp-kb-cell' style='min-width:0'>" +
            "<div class='cp-kb-topic'>" +
            "<span class='kb-topic-ico'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='20' x2='18' y2='10'/><line x1='12' y1='20' x2='12' y2='4'/><line x1='6' y1='20' x2='6' y2='14'/></svg></span>" +
            "<span class='kb-topic-title'>" + esc(topic.question || "—") + "</span>" +
            "</div>" +
            "</div>" +
            "<div class='cp-kb-cell cp-kb-chats kb-topic-chats'>" + asked + " запросов <span style='font-size:14px;color:#c4c4cc'>›</span></div>" +
            "<div class='cp-kb-cell cp-kb-last kb-topic-last'>" + esc(lastLabel) + "</div>" +
            "<div class='cp-kb-cell'>" +
            "<button class='cp-kb-more-btn kb-topic-menu' data-kb-menu='" + esc(topic.id) + "'>" +
            "<svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'><circle cx='12' cy='5' r='2'/><circle cx='12' cy='12' r='2'/><circle cx='12' cy='19' r='2'/></svg>" +
            "</button>" +
            "</div>" +
            "</div>";
        }).join("");

        nodes.content.innerHTML = headHtml +
          "<div class='cp-kb-table-wrap'>" +
          "<div class='cp-kb-headrow'>" +
          "<div class='cp-kb-headcell kb-head-title'>Тема</div>" +
          "<div class='cp-kb-headcell kb-head-chats'>Запросов</div>" +
          "<div class='cp-kb-headcell kb-head-last'>Последний ответ</div>" +
          "<div class='cp-kb-headcell kb-head-menu'></div>" +
          "</div>" +
          "<div class='cp-kb-body' id='cp-kb-body'>" + rowsHtml + "</div>" +
          "</div>";
      }

      var addBtn = root.querySelector("#projects-add-source");
      if (addBtn) addBtn.addEventListener("click", openSourceModalSafe);
      var qInp = root.querySelector("#projects-kb-q");
      var sortSwitch = root.querySelector("#projects-kb-sort-switch");
      var sortLabel = root.querySelector("#projects-kb-sort-label");
      if (qInp) {
        qInp.value = state.kbTopicsQuery || "";
        qInp.addEventListener("input", function () {
          state.kbTopicsQuery = qInp.value.trim();
          renderSourcesView();
        });
      }
      if (sortSwitch) {
        var activeSort = state.kbTopicsSort || "popular";
        sortSwitch.querySelectorAll(".cp-kb-sort-btn").forEach(function (btn) {
          var mode = btn.getAttribute("data-kb-sort");
          btn.classList.toggle("active", mode === activeSort);
          btn.addEventListener("click", function () {
            state.kbTopicsSort = mode || "popular";
            renderSourcesView();
          });
        });
      }
      if (sortLabel) {
        sortLabel.textContent = (state.kbTopicsSort || "popular") === "recent" ? "Новые" : "Популярность";
      }

      var _applyKbTips = function () { applyKbTopicEllipsisTooltips(nodes.content); };
      _applyKbTips();
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(_applyKbTips);

      var tbody = root.querySelector("#cp-kb-body");
      if (!tbody) return;
      tbody.addEventListener("click", function (evt) {
        var menuBtn = evt.target && evt.target.closest ? evt.target.closest("[data-kb-menu]") : null;
        if (!menuBtn) return;
        evt.stopPropagation();
        _closeSrcDropdowns();
        var topicId = menuBtn.getAttribute("data-kb-menu");
        var topic = state.kbTopics.find(function (t) { return t.id === topicId; });
        if (!topic) return;
        var rect = menuBtn.getBoundingClientRect();
        var dd = document.createElement("div");
        dd.className = "cp-src-dd";
        dd.style.top = (rect.bottom + 4) + "px";
        dd.style.right = (window.innerWidth - rect.right) + "px";
        dd.innerHTML =
          "<button class='cp-src-dd-item' data-action='edit' data-kid='" + esc(topicId) + "'>Редактировать ответ</button>" +
          "<button class='cp-src-dd-item' data-action='chats' data-kid='" + esc(topicId) + "'>Перейти к чатам</button>" +
          "<div class='cp-src-dd-sep'></div>" +
          "<button class='cp-src-dd-item cp-src-dd-danger' data-action='delete' data-kid='" + esc(topicId) + "'>Удалить</button>";
        document.body.appendChild(dd);
        dd.addEventListener("click", async function (e) {
          var item = e.target.closest ? e.target.closest("[data-action]") : null;
          if (!item) return;
          var action = item.getAttribute("data-action");
          var kid = item.getAttribute("data-kid");
          _closeSrcDropdowns();
          if (action === "edit") {
            openKbAnswerEditor(kid);
            return;
          }
          if (action === "chats") {
            setTab("chats");
            return;
          }
          if (action === "delete") {
            if (!(await showInlineConfirm("Удалить тему?", "Запись будет удалена из базы знаний.", "Удалить"))) return;
            await deleteKbTopic(kid);
          }
        });
      });
    }

    function _closeSrcDropdowns() {
      document.querySelectorAll(".cp-src-dd").forEach(function (d) { d.remove(); });
    }

    function _isTextTruncated(el) {
      if (!el) return false;
      return el.scrollWidth > (el.clientWidth + 1);
    }

    function applyKbTopicEllipsisTooltips(scope) {
      var rootScope = scope || root;
      var titles = rootScope.querySelectorAll ? rootScope.querySelectorAll(".kb-topic-title") : [];
      titles.forEach(function (el) {
        var full = String(el.textContent || "").trim();
        el.removeAttribute("title");
        if (!full) return;
        if (_isTextTruncated(el)) el.setAttribute("title", full);
      });
    }

    var _kbEllipsisResizeBound = false;
    var _kbEllipsisObserver = null;
    function _bindKbTopicEllipsisResize() {
      if (_kbEllipsisResizeBound) return;
      _kbEllipsisResizeBound = true;
      var timer = null;
      window.addEventListener("resize", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { applyKbTopicEllipsisTooltips(root); }, 120);
      });
      try {
        window.initKbTopicEllipsis = function (containerSelector) {
          if (!containerSelector) { applyKbTopicEllipsisTooltips(root); return; }
          var target = root.querySelector(containerSelector) || document.querySelector(containerSelector);
          applyKbTopicEllipsisTooltips(target || root);
        };
      } catch (_) { }
      try {
        var obsTarget = root.querySelector("#projects-content") || root;
        if (window.MutationObserver && obsTarget) {
          _kbEllipsisObserver = new MutationObserver(function () {
            applyKbTopicEllipsisTooltips(obsTarget);
          });
          _kbEllipsisObserver.observe(obsTarget, { childList: true, subtree: true });
        }
      } catch (_) { }
    }

    var _kbEditState = { id: null, question: "", answer: "", mode: "replace", root: null };

    function _kbCloseEditor() {
      if (_kbEditState.root && _kbEditState.root.parentNode) _kbEditState.root.parentNode.removeChild(_kbEditState.root);
      _kbEditState = { id: null, question: "", answer: "", mode: "replace", root: null };
    }

    function _kbSwitchMode(mode) {
      if (!_kbEditState.root) return;
      _kbEditState.mode = mode === "append" ? "append" : "replace";
      var tabReplace = _kbEditState.root.querySelector("#kb-edit-tab-replace");
      var tabAppend = _kbEditState.root.querySelector("#kb-edit-tab-append");
      if (tabReplace) tabReplace.classList.toggle("active", _kbEditState.mode === "replace");
      if (tabAppend) tabAppend.classList.toggle("active", _kbEditState.mode === "append");
      var hint = _kbEditState.root.querySelector("#kb-edit-hint-text");
      var area = _kbEditState.root.querySelector("#kb-edit-area");
      var insertBtn = _kbEditState.root.querySelector("#kb-edit-insert");
      if (_kbEditState.mode === "replace") {
        if (hint) hint.textContent = "Замена ответа позволяет изменить информацию, которую ИИ-агент использует, отвечая на вопрос";
        if (area) area.placeholder = "Новые данные для ответа на вопрос";
        if (insertBtn) insertBtn.style.display = _kbEditState.answer ? "" : "none";
      } else {
        if (hint) hint.textContent = "Дайте особые указания по поведению, условиям и стилю ответа на вопрос";
        if (area) area.placeholder = "Как дополнить существующие данные для ответа?";
        if (insertBtn) insertBtn.style.display = "none";
      }
    }

    function _kbSyncSaveState() {
      if (!_kbEditState.root) return;
      var area = _kbEditState.root.querySelector("#kb-edit-area");
      var save = _kbEditState.root.querySelector("#kb-edit-save");
      if (!area || !save) return;
      save.disabled = !String(area.value || "").trim();
    }

    async function _kbSaveEditor() {
      if (!_kbEditState.root || !_kbEditState.id) return;
      var area = _kbEditState.root.querySelector("#kb-edit-area");
      var save = _kbEditState.root.querySelector("#kb-edit-save");
      var extra = String((area && area.value) || "").trim();
      if (!extra) return;
      if (!save) return;
      save.disabled = true;
      save.textContent = "Сохраняю…";
      try {
        if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) {
          throw new Error("Firebase недоступен");
        }
        var user = firebase.auth().currentUser;
        if (!user || !user.uid) throw new Error("Пользователь не авторизован");
        var nextAnswer = _kbEditState.mode === "append" && _kbEditState.answer
          ? (String(_kbEditState.answer).trim() + "\n\n" + extra)
          : extra;
        await firebase.firestore().doc("users/" + user.uid + "/kbQA/" + _kbEditState.id).set({
          answer: nextAnswer,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        state.kbTopics = state.kbTopics.map(function (t) {
          if (t.id !== _kbEditState.id) return t;
          return Object.assign({}, t, { answer: nextAnswer, updatedAt: Date.now() });
        });
        renderSourcesView();
        _kbCloseEditor();
        notify("Ответ сохранён");
      } catch (e) {
        notify(e.message || "Ошибка сохранения", true);
        save.disabled = false;
        save.textContent = "Сохранить";
      }
    }

    function openKbAnswerEditor(topicId) {
      var topic = (state.kbTopics || []).find(function (x) { return x.id === topicId; });
      if (!topic) {
        notify("Тема не найдена", true);
        return;
      }
      _kbCloseEditor();
      _kbEditState = {
        id: topic.id,
        question: String(topic.question || ""),
        answer: String(topic.answer || ""),
        mode: "replace",
        root: null,
      };
      var overlay = document.createElement("div");
      overlay.className = "kb-edit-bg";
      overlay.innerHTML =
        "<div class='kb-edit-card'>" +
        "<div class='kb-edit-head'>" +
        "<h3 class='kb-edit-title'>Редактирование ответа</h3>" +
        "<button class='kb-edit-close' id='kb-edit-close'>✕</button>" +
        "</div>" +
        "<div class='kb-edit-body'>" +
        "<div class='kb-edit-qa'>" +
        "<div class='kb-edit-qrow'><div class='kb-edit-icon'>◌</div><div class='kb-edit-qtxt'>" + esc(_kbEditState.question || "—") + "</div></div>" +
        (_kbEditState.answer ? "<div class='kb-edit-arow'><div class='kb-edit-avatar'>•</div><div class='kb-edit-atxt'>" + esc(_kbEditState.answer) + "</div></div>" : "") +
        "</div>" +
        "<div class='kb-edit-tabs'>" +
        "<button class='kb-edit-tab active' id='kb-edit-tab-replace'>Заменить ответ</button>" +
        "<button class='kb-edit-tab' id='kb-edit-tab-append'>Дополнить ответ</button>" +
        "</div>" +
        "<div class='kb-edit-hint'><div class='kb-edit-hint-ico'>i</div><div class='kb-edit-hint-text' id='kb-edit-hint-text'></div></div>" +
        "<div class='kb-edit-area-wrap'>" +
        "<textarea class='kb-edit-area' id='kb-edit-area'></textarea>" +
        "<div class='kb-edit-mic'>◉</div>" +
        "</div>" +
        "<div class='kb-edit-foot'>" +
        "<button class='kb-edit-insert' id='kb-edit-insert'>Вставить текущий ответ</button>" +
        "<button class='kb-edit-save' id='kb-edit-save' disabled>Сохранить</button>" +
        "</div>" +
        "</div>" +
        "</div>";
      document.getElementById("projects-ui-root").appendChild(overlay);
      _kbEditState.root = overlay;
      _kbSwitchMode("replace");

      var closeBtn = overlay.querySelector("#kb-edit-close");
      var tabReplace = overlay.querySelector("#kb-edit-tab-replace");
      var tabAppend = overlay.querySelector("#kb-edit-tab-append");
      var insertBtn = overlay.querySelector("#kb-edit-insert");
      var area = overlay.querySelector("#kb-edit-area");
      var saveBtn = overlay.querySelector("#kb-edit-save");

      if (closeBtn) closeBtn.addEventListener("click", _kbCloseEditor);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) _kbCloseEditor(); });
      if (tabReplace) tabReplace.addEventListener("click", function () { _kbSwitchMode("replace"); });
      if (tabAppend) tabAppend.addEventListener("click", function () { _kbSwitchMode("append"); });
      if (insertBtn) insertBtn.addEventListener("click", function () {
        if (!area) return;
        area.value = _kbEditState.answer || "";
        area.focus();
        _kbSyncSaveState();
      });
      if (area) area.addEventListener("input", _kbSyncSaveState);
      if (saveBtn) saveBtn.addEventListener("click", _kbSaveEditor);
    }

    async function deleteKbTopic(topicId) {
      try {
        if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) {
          throw new Error("Firebase недоступен");
        }
        var user = firebase.auth().currentUser;
        if (!user || !user.uid) throw new Error("Пользователь не авторизован");
        await firebase.firestore().doc("users/" + user.uid + "/kbQA/" + topicId).delete();
        state.kbTopics = (state.kbTopics || []).filter(function (t) { return t.id !== topicId; });
        renderSourcesView();
        notify("Тема удалена");
      } catch (e) {
        notify(e.message || "Ошибка удаления", true);
      }
    }

    async function _waitFirebaseUser(timeoutMs) {
      return new Promise(function (resolve) {
        var done = false;
        var t = setTimeout(function () {
          if (done) return;
          done = true;
          resolve(null);
        }, timeoutMs || 8000);
        try {
          if (typeof firebase === "undefined" || !firebase.auth) {
            clearTimeout(t);
            resolve(null);
            return;
          }
          var current = firebase.auth().currentUser;
          if (current) {
            done = true;
            clearTimeout(t);
            resolve(current);
            return;
          }
          var unsub = firebase.auth().onAuthStateChanged(function (u) {
            if (done || !u) return;
            done = true;
            clearTimeout(t);
            try { unsub && unsub(); } catch (_) { }
            resolve(u);
          });
        } catch (_) {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve(null);
        }
      });
    }

    async function loadKbTopics(options) {
      var opts = options || {};
      var requestedProjectId = state.activeProjectId;
      state.kbTopicsLoading = true;
      if (state.tab === "sources" && !opts.silent) renderSourcesView();
      try {
        if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore || !requestedProjectId) {
          state.kbTopics = [];
          state.kbTopicsLoadedProjectId = requestedProjectId || null;
          return;
        }
        var user = firebase.auth().currentUser || await _waitFirebaseUser(6000);
        if (!user || !user.uid) {
          state.kbTopics = [];
          state.kbTopicsLoadedProjectId = requestedProjectId;
          return;
        }
        var baseRef = firebase.firestore().collection("users").doc(user.uid).collection("kbQA");
        var snap = await baseRef.where("projectId", "==", requestedProjectId).limit(1000).get();
        var items = snap.docs.map(function (doc) {
          var d = doc.data() || {};
          return {
            id: doc.id,
            question: d.question || "",
            answer: d.answer || "",
            asked: Number(d.asked || 0),
            updatedAt: d.updatedAt || d._ts || d.createdAt || null,
            createdAt: d.createdAt || d._ts || null,
            projectId: d.projectId || null,
          };
        }).filter(function (x) { return !!x.question; });
        if (!items.length && (state.projects || []).length <= 1) {
          // Legacy fallback for single-project users with old KB records without projectId.
          var legacySnap = await baseRef.limit(1000).get();
          items = legacySnap.docs.map(function (doc) {
            var d = doc.data() || {};
            return {
              id: doc.id,
              question: d.question || "",
              answer: d.answer || "",
              asked: Number(d.asked || 0),
              updatedAt: d.updatedAt || d._ts || d.createdAt || null,
              createdAt: d.createdAt || d._ts || null,
              projectId: d.projectId || null,
            };
          }).filter(function (x) { return !!x.question; });
        }
        if (state.activeProjectId !== requestedProjectId) return;
        state.kbTopics = items;
        state.kbTopicsLoadedProjectId = requestedProjectId;
      } catch (e) {
        state.kbTopics = [];
        if (!opts.silent) notify("Ошибка загрузки базы знаний", true);
      } finally {
        state.kbTopicsLoading = false;
        if (state.tab === "sources") renderSourcesView();
      }
    }

    // ── Source Preview Modal ───────────────────────────────────────────────────
    function openSourcePreview(sourceId) {
      var src = state.sources.find(function (s) { return s.id === sourceId; });
      if (!src) return;
      var overlay = document.createElement("div");
      overlay.className = "src-preview-modal";
      var bodyText = (src.contentRef || "").trim();
      var MAX_PREVIEW = 6000;
      var truncated = bodyText.length > MAX_PREVIEW;
      var previewText = truncated ? bodyText.slice(0, MAX_PREVIEW) : bodyText;
      overlay.innerHTML =
        "<div class='src-preview-box'>" +
        "<div class='src-preview-title'>" + esc(src.title) + "</div>" +
        "<div class='src-preview-body' id='src-preview-body-text'>" + esc(previewText) + (truncated ? "\n\n… (текст обрезан до 6000 символов из " + bodyText.length + ")" : "") + "</div>" +
        "<div class='src-preview-footer'><button class='projects-btn' id='src-preview-close'>Закрыть</button></div>" +
        "</div>";
      document.getElementById("projects-ui-root").appendChild(overlay);
      overlay.querySelector("#src-preview-close").addEventListener("click", function () { overlay.remove(); });
      overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
    }

    // ── Source Status Polling ──────────────────────────────────────────────────
    var _srcPollingTimers = {};
    function startSourcePolling(sourceId) {
      if (_srcPollingTimers[sourceId]) return; // Already polling
      var attempts = 0;
      var maxAttempts = 30; // 30 * 3s = 90s max
      function poll() {
        attempts++;
        if (attempts > maxAttempts) { clearPolling(); return; }
        ProjectsApi.getSource(sourceId).then(function (data) {
          var s = data && data.source;
          if (!s) { clearPolling(); return; }
          if (s.status === "processing" || s.status === "pending") {
            _srcPollingTimers[sourceId] = setTimeout(poll, 3000);
          } else {
            // Status changed — update state and re-render
            clearPolling();
            state.sources = state.sources.map(function (x) { return x.id === sourceId ? Object.assign({}, x, s) : x; });
            if (state.tab === "sources") renderSourcesView();
            if (s.status === "ready") {
              notify("Источник \"" + (s.title || sourceId) + "\" готов (" + (s.kbQaCount || 0) + " пар)");
              loadKbTopics({ silent: true });
            }
            else if (s.status === "failed") notify("Ошибка обработки источника: " + (s.errorMessage || "неизвестная ошибка"), true);
          }
        }).catch(function () { clearPolling(); });
      }
      function clearPolling() { clearTimeout(_srcPollingTimers[sourceId]); delete _srcPollingTimers[sourceId]; }
      _srcPollingTimers[sourceId] = setTimeout(poll, 3000);
    }

    async function loadSources(append, options) {
      var opts = options || {};
      var requestedProjectId = state.activeProjectId;
      var reqId = ++state.sourcesRequestSeq;
      var data = await ProjectsApi.listSources(state.activeProjectId, {
        q: state.sourcesQuery,
        type: state.sourcesType,
        limit: 30,
        cursor: append ? state.sourcesCursor : "",
      });
      if (reqId !== state.sourcesRequestSeq) return;
      if (state.activeProjectId !== requestedProjectId) return;
      state.sources = append ? state.sources.concat(data.sources || []) : (data.sources || []);
      state.sourcesCursor = data.nextCursor || null;
      state.sourcesHasMore = !!data.hasMore;
      state.sourcesLoadedProjectId = requestedProjectId;
      if (state.tab === "sources" && !opts.silent) renderSourcesView();
      if (state.tab === "sources" && opts.silent) renderSourcesView();
    }

    function _asTsMs(v) {
      try {
        if (!v) return 0;
        if (typeof v.toMillis === "function") return v.toMillis();
        if (typeof v.toDate === "function") return v.toDate().getTime();
        var n = Number(v);
        if (!isNaN(n)) return n;
        var d = new Date(v);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      } catch (_) { return 0; }
    }

    function _fmtDateTime(v) {
      var ms = _asTsMs(v);
      if (!ms) return "—";
      return new Date(ms).toLocaleString("ru-RU");
    }

    function renderUnansweredView() {
      nodes.content.innerHTML =
        "<div class='projects-card'>" +
        "<div class='cardHead'><h2>Без ответов</h2><div class='muted'>Вопросы, на которые бот не нашел ответ в KB</div></div>" +
        "<div id='cp-unans-list'>" +
        "<div style='padding:26px 10px;text-align:center;color:#8e8e93'>Загрузка…</div>" +
        "</div>" +
        "</div>";
    }

    function renderUnansweredList() {
      var list = root.querySelector("#cp-unans-list");
      if (!list) return;
      var rows = state.unanswered || [];
      if (!rows.length) {
        list.innerHTML =
          "<div class='projects-empty' style='border:none;padding:20px 0'>" +
          "<div><h3>Пока нет вопросов без ответа</h3>" +
          "<p>Когда бот не сможет ответить клиенту, вопрос появится здесь.</p></div></div>";
        return;
      }
      list.innerHTML = rows.map(function (u) {
        var q = String(u.text || "").trim();
        var a = String(u.aiAnswer || "").trim();
        var qShort = q.length > 180 ? q.slice(0, 180) + "…" : q;
        var aShort = a.length > 220 ? a.slice(0, 220) + "…" : a;
        var chatLine = (u.chatName || u.chatId) ? ("Чат: " + esc(u.chatName || u.chatId)) : "Чат: —";
        return "<div class='projects-item' style='align-items:flex-start'>" +
          "<div style='min-width:0;flex:1'>" +
          "<h4 style='white-space:normal;line-height:1.45'>" + esc(qShort || "—") + "</h4>" +
          "<p>" + esc(chatLine) + " • " + esc(_fmtDateTime(u._ts || u.createdAt)) + "</p>" +
          (aShort ? "<div style='margin-top:8px;padding:10px 12px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb;color:#4b5563;font-size:13px;line-height:1.45'><b>AI ответ:</b> " + esc(aShort) + "</div>" : "") +
          "</div>" +
          "<div style='display:flex;flex-direction:column;gap:8px;align-items:flex-end;flex-shrink:0'>" +
          "<button class='projects-btn' data-unans-add='" + esc(u.id) + "'>Добавить в KB</button>" +
          "<button class='projects-btn' data-unans-del='" + esc(u.id) + "'>Удалить</button>" +
          "</div>" +
          "</div>";
      }).join("");

      list.querySelectorAll("[data-unans-add]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = btn.getAttribute("data-unans-add");
          var item = state.unanswered.find(function (x) { return x.id === id; });
          if (!item || !state.activeProjectId) return;
          btn.disabled = true;
          var oldText = btn.textContent;
          btn.textContent = "Добавляю…";
          try {
            var sourceTitle = "Без ответа: " + String(item.text || "").slice(0, 70);
            var sourceBody = "Вопрос клиента:\n" + String(item.text || "") +
              (item.aiAnswer ? ("\n\nЧерновой AI-ответ:\n" + String(item.aiAnswer || "")) : "");
            await ProjectsApi.addSource(state.activeProjectId, {
              type: "text",
              title: sourceTitle,
              contentRef: sourceBody
            });
            notify("Добавлено в базу знаний");
            setTab("sources");
            if (typeof firebase !== "undefined" && firebase.auth && firebase.firestore) {
              var user = firebase.auth().currentUser;
              if (user) {
                await firebase.firestore().doc("users/" + user.uid + "/unanswered/" + id).delete().catch(function () { });
              }
            }
          } catch (e) {
            notify(e.message || "Ошибка добавления", true);
            btn.disabled = false;
            btn.textContent = oldText;
          }
        });
      });

      list.querySelectorAll("[data-unans-del]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = btn.getAttribute("data-unans-del");
          if (!id) return;
          var ok = await showInlineConfirm("Удалить вопрос?", "Он исчезнет из списка «Без ответов».");
          if (!ok) return;
          btn.disabled = true;
          try {
            if (typeof firebase !== "undefined" && firebase.auth && firebase.firestore) {
              var user = firebase.auth().currentUser;
              if (user) {
                await firebase.firestore().doc("users/" + user.uid + "/unanswered/" + id).delete();
              }
            }
            state.unanswered = state.unanswered.filter(function (x) { return x.id !== id; });
            renderUnansweredList();
            if (root._loadUnansweredCount) root._loadUnansweredCount();
          } catch (e) {
            notify(e.message || "Ошибка удаления", true);
            btn.disabled = false;
          }
        });
      });
    }

    async function loadUnanswered() {
      if (state.tab !== "unanswered") return;
      var list = root.querySelector("#cp-unans-list");
      if (!list) return;
      try {
        if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) {
          list.innerHTML = "<div style='padding:24px;text-align:center;color:#ff3b30'>Firebase недоступен</div>";
          return;
        }
        var user = firebase.auth().currentUser;
        if (!user || !state.activeProjectId) {
          list.innerHTML = "<div style='padding:24px;text-align:center;color:#8e8e93'>Авторизуйтесь, чтобы увидеть список</div>";
          return;
        }
        var p = getActiveProject();
        if (!p || !p.telegramBotId) {
          list.innerHTML = "<div style='padding:24px;text-align:center;color:#8e8e93'>Подключите Telegram-бота, чтобы собирать вопросы без ответа</div>";
          return;
        }
        var q = firebase.firestore().collection("users").doc(user.uid).collection("unanswered");
        q = q.where("botId", "==", p.telegramBotId);
        var snap = await q.limit(200).get();
        var items = (snap && snap.docs ? snap.docs : []).map(function (d) {
          var v = d.data() || {};
          return {
            id: d.id,
            text: v.text || "",
            aiAnswer: v.aiAnswer || "",
            chatId: v.chatId || "",
            chatName: v.chatName || "",
            botId: v.botId || "",
            _ts: v._ts || null,
            createdAt: v.createdAt || null,
          };
        });
        items.sort(function (a, b) { return _asTsMs(b._ts || b.createdAt) - _asTsMs(a._ts || a.createdAt); });
        state.unanswered = items;
        if (state.tab === "unanswered") renderUnansweredList();
        if (root._loadUnansweredCount) root._loadUnansweredCount();
      } catch (e) {
        list.innerHTML = "<div style='padding:24px;text-align:center;color:#ff3b30'>Ошибка загрузки: " + esc(e.message || "не удалось загрузить") + "</div>";
      }
    }

    function renderVirtualRows(viewport, spacer, rows, rowRenderer, rowHeight) {
      if (!viewport || !spacer) return;
      var h = rowHeight || 90;
      // On mobile: render all rows as a flat list (no virtual scroll needed)
      if (window.innerWidth <= 680) {
        spacer.style.height = "";
        spacer.style.position = "";
        spacer.innerHTML = rows.map(function (row, i) {
          return "<div style='margin-bottom:8px;'>" + rowRenderer(row, i) + "</div>";
        }).join("");
        return;
      }
      var overscan = 8;
      function paint() {
        var top = viewport.scrollTop;
        var vh = viewport.clientHeight || 560;
        var start = Math.max(0, Math.floor(top / h) - overscan);
        var end = Math.min(rows.length, Math.ceil((top + vh) / h) + overscan);
        var html = "";
        for (var i = start; i < end; i++) {
          html += "<div style='position:absolute;left:0;right:0;top:" + (i * h) + "px;height:" + h + "px;padding:6px 8px'>" +
            rowRenderer(rows[i], i) + "</div>";
        }
        spacer.style.height = (rows.length * h) + "px";
        spacer.innerHTML = html;
      }
      var _rafPending = false;
      viewport.onscroll = function () {
        if (!_rafPending) {
          _rafPending = true;
          requestAnimationFrame(function () { _rafPending = false; paint(); });
        }
      };
      paint();
    }

    async function loadSettings() {
      var p = getActiveProject();
      var behavior = p.behavior || {};
      var logic = p.logic || {};
      var isTgConnected = !!(p.telegramConnected && p.botHost && p.botHost.startsWith("@"));
      var tgStatusHtml = isTgConnected
        ? "<span style='display:inline-flex;align-items:center;gap:5px;background:#dcfce7;color:#16a34a;border-radius:9999px;padding:3px 10px;font-size:12px;font-weight:500;'>✓ Подключён: " + esc(p.botHost) + "</span>"
        : "<span style='display:inline-flex;align-items:center;gap:5px;background:#fffbeb;color:#b45309;border-radius:9999px;padding:3px 10px;font-size:12px;font-weight:500;'>⚠ Не подключён</span>";

      function togHtml(id, val) {
        return "<button class='cp-toggle" + (val ? " on" : "") + "' id='" + id + "'></button>";
      }

      nodes.content.innerHTML =
        "<div style='max-width:720px;'>" +
        // ── Sub-tab bar ─────────────────────────────────────────────────────
        "<div class='cp-settings-subtabs'>" +
        "<button class='cp-settings-subtab active' data-stab='main'>Основные</button>" +
        "<button class='cp-settings-subtab' data-stab='behavior'>Поведение</button>" +
        "<button class='cp-settings-subtab' data-stab='logic'>Логика</button>" +
        "</div>" +
        // ── Main settings panel ─────────────────────────────────────────────
        "<div class='cp-stab-panel' data-panel='main'>" +
        "<div style='display:flex;flex-direction:column;gap:16px;'>" +
        "<div class='projects-card'>" +
        "<div class='cardHead'><h2>Основные настройки</h2></div>" +
        "<div class='projects-form'>" +
        "<div><label>Название проекта</label><input id='projects-set-name' value='" + esc(p.name) + "'></div>" +
        "<div><label>Инструкции для бота <span style='color:rgba(60,60,67,0.4);'>(системный промпт)</span></label><textarea id='projects-set-inst' placeholder='Например: Ты вежливый ассистент компании...'>" + esc(p.instructions || "") + "</textarea></div>" +
        "<div style='display:flex;gap:10px;flex-wrap:wrap'><button class='projects-btn primary' id='projects-save'>Сохранить</button>" +
        "<button class='projects-btn projects-danger' id='projects-del'>Удалить проект</button></div>" +
        "</div></div>" +
        "<div class='projects-card'>" +
        "<div class='cardHead'><h2>Telegram</h2><div>" + tgStatusHtml + "</div></div>" +
        "<div class='projects-form'>" +
        "<div><label>Telegram Bot Token <span style='color:rgba(60,60,67,0.4);'>— токен от @BotFather</span></label>" +
        (p.telegramBotId && !isTgConnected ?
          "<div style='margin-bottom:12px;padding:12px;background:rgba(30,92,251,0.08);border-radius:10px;border:1px dashed #1e5cfb;'>" +
          "<div style='font-size:14px;font-weight:600;margin-bottom:8px;'>Бот " + (p.botHost || "") + " готов к запуску</div>" +
          "<button class='projects-btn primary' id='projects-tg-reactivate' style='width:100%'>🚀 Запустить бота</button>" +
          "<div style='text-align:center;margin-top:8px;font-size:12px;color:#737378;'>или введите новый токен ниже:</div>" +
          "</div>" : "") +
        "<div style='display:flex;gap:8px;'>" +
        "<input id='projects-set-token' placeholder='123456789:AAFxxxxxx' style='flex:1;' " + (isTgConnected ? "value=''" : "") + ">" +
        "<button class='projects-btn primary' id='projects-tg-connect'>⚡ " + (isTgConnected ? "Обновить" : "Подключить") + "</button>" +
        "</div></div>" +
        (isTgConnected ? "" : "<div style='font-size:14px;color:#737378;background:#f2f2f7;border-radius:8px;padding:10px 12px;line-height:1.5;'>💡 Получите токен у <b><a href=\"https://t.me/BotFather\" target=\"_blank\" style=\"color:#1e5cfb;\">@BotFather</a></b> командой /newbot</div>") +
        "</div></div>" +
        "</div></div>" +
        // ── Behavior settings panel ─────────────────────────────────────────
        "<div class='cp-stab-panel' data-panel='behavior' style='display:none;'>" +
        "<div class='projects-card'>" +
        "<div class='cardHead'><h2>Поведение бота</h2></div>" +
        "<div class='cp-toggle-row'>" +
        "<div class='cp-toggle-info'><div class='cp-toggle-name'>Предлагать варианты вопросов</div>" +
        "<div class='cp-toggle-desc'>После каждого ответа бот предложит 2–3 кнопки с возможными вопросами</div></div>" +
        togHtml('tog-suggestButtons', behavior.suggestButtons) +
        "</div>" +
        "<div class='cp-toggle-row'>" +
        "<div class='cp-toggle-info'><div class='cp-toggle-name'>Обучаться на ответах оператора</div>" +
        "<div class='cp-toggle-desc'>Когда оператор отвечает клиенту, ответ автоматически сохраняется в базу знаний</div></div>" +
        togHtml('tog-learnFromReplies', behavior.learnFromReplies) +
        "</div>" +
        "<div class='cp-toggle-row'>" +
        "<div class='cp-toggle-info'><div class='cp-toggle-name'>Реактивировать неактивных клиентов</div>" +
        "<div class='cp-toggle-desc'>Бот автоматически напишет клиентам, которые не отвечали более 3 дней</div></div>" +
        togHtml('tog-reactivateClients', behavior.reactivateClients) +
        "</div>" +
        "<div class='cp-toggle-row'>" +
        "<div class='cp-toggle-info'><div class='cp-toggle-name'>Не беспокоить клиентов с тегами</div>" +
        "<div class='cp-toggle-desc'>Клиенты, отмеченные тегом «не беспокоить», не получат автоматических сообщений</div></div>" +
        togHtml('tog-excludeTaggedClients', behavior.excludeTaggedClients) +
        "</div>" +
        "</div></div>" +
        // ── Logic settings panel ────────────────────────────────────────────
        "<div class='cp-stab-panel' data-panel='logic' style='display:none;'>" +
        "<div class='projects-card'>" +
        "<div class='cardHead'><h2>Логика обработки</h2></div>" +
        "<div class='cp-toggle-row'>" +
        "<div class='cp-toggle-info'><div class='cp-toggle-name'>Пауза при ответе оператора</div>" +
        "<div class='cp-toggle-desc'>Бот не отвечает 30 минут после того, как оператор написал клиенту вручную</div></div>" +
        togHtml('tog-pauseOnAdminReply', logic.pauseOnAdminReply) +
        "</div>" +
        "<div class='cp-toggle-row'>" +
        "<div class='cp-toggle-info'><div class='cp-toggle-name'>Приостанавливать автоматизации</div>" +
        "<div class='cp-toggle-desc'>Автоматические триггеры и потоки не срабатывают, пока оператор ведёт диалог</div></div>" +
        togHtml('tog-pauseAutomations', logic.pauseAutomations) +
        "</div>" +
        "<div class='cp-toggle-row'>" +
        "<div class='cp-toggle-info'><div class='cp-toggle-name'>Задержка перед ответом</div>" +
        "<div class='cp-toggle-desc'>Бот подождёт несколько секунд перед ответом — это выглядит естественнее и позволяет собрать несколько сообщений подряд" +
        "<div class='cp-delay-row' id='delay-row-wrap' style='display:" + (logic.delayBeforeReply ? "flex" : "none") + ";margin-top:8px'>" +
        "<label>Секунд:</label>" +
        "<input class='cp-delay-inp' type='number' id='inp-delaySeconds' min='1' max='30' value='" + (logic.delaySeconds || 3) + "'>" +
        "</div>" +
        "</div></div>" +
        togHtml('tog-delayBeforeReply', logic.delayBeforeReply) +
        "</div>" +
        "</div></div>" +
        "</div>";

      // ── Sub-tab switching ────────────────────────────────────────────────
      root.querySelectorAll(".cp-settings-subtab").forEach(function (btn) {
        btn.addEventListener("click", function () {
          root.querySelectorAll(".cp-settings-subtab").forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          root.querySelectorAll(".cp-stab-panel").forEach(function (panel) { panel.style.display = "none"; });
          root.querySelector(".cp-stab-panel[data-panel='" + btn.dataset.stab + "']").style.display = "";
        });
      });

      // ── Main settings events ─────────────────────────────────────────────
      root.querySelector("#projects-save").addEventListener("click", async function () {
        var btn = root.querySelector("#projects-save");
        btn.disabled = true; btn.textContent = "Сохраняю…";
        try {
          await ProjectsApi.updateProject(state.activeProjectId, {
            name: root.querySelector("#projects-set-name").value.trim(),
            botHost: p.botHost || "@pending",
            instructions: root.querySelector("#projects-set-inst").value,
          });
          notify(I18n.t('saved'));
          await refreshProjects();
        } catch (e) {
          notify(e.message || I18n.t('error'), true);
        } finally {
          btn.disabled = false; btn.textContent = "💾 Сохранить";
        }
      });

      root.querySelector("#projects-tg-connect").addEventListener("click", async function () {
        var tokenInput = root.querySelector("#projects-set-token");
        var tokenVal = tokenInput.value.trim();
        if (!tokenVal) { tokenInput.focus(); return; }
        if (!isTelegramToken(tokenVal)) {
          notify("Введите корректный Telegram Bot Token (формат: 123456789:AAFxxxxxx)", true);
          tokenInput.focus(); return;
        }
        var btn = root.querySelector("#projects-tg-connect");
        btn.disabled = true; btn.textContent = "Подключаю…";
        try {
          var linked = await connectTelegramToken(tokenVal, state.activeProjectId, p.name);
          var username = linked && linked.username ? linked.username : null;
          if (username) {
            await ProjectsApi.updateProject(state.activeProjectId, { botHost: username, name: p.name, instructions: root.querySelector("#projects-set-inst").value });
          }
          notify("Telegram подключён" + (username ? (": " + username) : "") + " ✅");
          tokenInput.value = "";
          await refreshProjects();
          await loadSettings();
        } catch (e) {
          notify(e.message || I18n.t('error') + ": не удалось подключить Telegram", true);
          btn.disabled = false; btn.textContent = "⚡ Подключить";
        }
      });

      var btnReactivate = root.querySelector("#projects-tg-reactivate");
      if (btnReactivate) {
        btnReactivate.addEventListener("click", async function () {
          btnReactivate.disabled = true;
          btnReactivate.textContent = "Запускаю…";
          try {
            await reactivateTelegram(state.activeProjectId);
            notify("Бот успешно запущен! 🚀");
            await refreshProjects();
            await loadSettings();
          } catch (e) {
            notify(e.message || "Ошибка при запуске бота", true);
            btnReactivate.disabled = false;
            btnReactivate.textContent = "🚀 Запустить бота";
          }
        });
      }

      root.querySelector("#projects-del").addEventListener("click", async function () {
        var confirmed = await showDeleteConfirm(p.name);
        if (!confirmed) return;
        await ProjectsApi.deleteProject(state.activeProjectId);
        state.activeProjectId = null;
        await refreshProjects();
      });

      // Helper: sync updated project data into state.projects without re-render
      function _syncProjectState() {
        var idx = state.projects.findIndex(function (x) { return x.id === state.activeProjectId; });
        if (idx !== -1) {
          state.projects[idx] = Object.assign({}, state.projects[idx], { behavior: Object.assign({}, behavior), logic: Object.assign({}, logic) });
        }
      }

      // ── Behavior toggles ─────────────────────────────────────────────────
      var behaviorKeys = { 'tog-suggestButtons': 'suggestButtons', 'tog-learnFromReplies': 'learnFromReplies', 'tog-reactivateClients': 'reactivateClients', 'tog-excludeTaggedClients': 'excludeTaggedClients' };
      Object.keys(behaviorKeys).forEach(function (id) {
        var btn = root.querySelector("#" + id);
        if (!btn) return;
        btn.addEventListener("click", async function () {
          var key = behaviorKeys[id];
          var newVal = !behavior[key];
          behavior[key] = newVal;
          btn.classList.toggle("on", newVal);
          try {
            await ProjectsApi.updateProject(state.activeProjectId, { behavior: behavior });
            _syncProjectState();
            notify("Сохранено ✓");
          } catch (e) {
            behavior[key] = !newVal;
            btn.classList.toggle("on", !newVal);
            notify(e.message || I18n.t('error'), true);
          }
        });
      });

      // ── Logic toggles ────────────────────────────────────────────────────
      var logicSimpleKeys = { 'tog-pauseOnAdminReply': 'pauseOnAdminReply', 'tog-pauseAutomations': 'pauseAutomations' };
      Object.keys(logicSimpleKeys).forEach(function (id) {
        var btn = root.querySelector("#" + id);
        if (!btn) return;
        btn.addEventListener("click", async function () {
          var key = logicSimpleKeys[id];
          var newVal = !logic[key];
          logic[key] = newVal;
          btn.classList.toggle("on", newVal);
          try {
            await ProjectsApi.updateProject(state.activeProjectId, { logic: logic });
            _syncProjectState();
            notify("Сохранено ✓");
          } catch (e) {
            logic[key] = !newVal;
            btn.classList.toggle("on", !newVal);
            notify(e.message || I18n.t('error'), true);
          }
        });
      });

      // ── delayBeforeReply toggle (with seconds input) ──────────────────────
      var delayTogBtn = root.querySelector("#tog-delayBeforeReply");
      var delayRow = root.querySelector("#delay-row-wrap");
      var delayInp = root.querySelector("#inp-delaySeconds");
      if (delayTogBtn) {
        delayTogBtn.addEventListener("click", async function () {
          var newVal = !logic.delayBeforeReply;
          logic.delayBeforeReply = newVal;
          delayTogBtn.classList.toggle("on", newVal);
          delayRow.style.display = newVal ? "flex" : "none";
          try {
            await ProjectsApi.updateProject(state.activeProjectId, { logic: logic });
            _syncProjectState();
            notify("Сохранено ✓");
          } catch (e) {
            logic.delayBeforeReply = !newVal;
            delayTogBtn.classList.toggle("on", !newVal);
            delayRow.style.display = !newVal ? "flex" : "none";
            notify(e.message || I18n.t('error'), true);
          }
        });
      }
      if (delayInp) {
        var _delayTimer;
        delayInp.addEventListener("input", function () {
          clearTimeout(_delayTimer);
          _delayTimer = setTimeout(async function () {
            var sec = Math.min(30, Math.max(1, parseInt(delayInp.value, 10) || 3));
            logic.delaySeconds = sec;
            try {
              await ProjectsApi.updateProject(state.activeProjectId, { logic: logic });
              _syncProjectState();
              notify("Сохранено ✓");
            } catch (e) {
              notify(e.message || I18n.t('error'), true);
            }
          }, 800);
        });
      }
    }

    function openCreateModal() {
      nodes.modal.classList.add("open");
      nodes.createName.value = "";
      nodes.createHost.value = "";
      nodes.createKB.value = "skip";
      nodes.createKBFileWrap.style.display = "none";
      nodes.createKBTextWrap.style.display = "none";
      nodes.createKBDropText.textContent = "Выберите или перетащите файл";
      nodes.createKBFileInput.value = "";
      nodes.createKBText.value = "";
      _createKbFile = null;

      state.createRequestId = makeRequestId();
      state.createInFlight = false;
      nodes.modalCreate.disabled = false;
      nodes.modalCreate.textContent = I18n.t('createProject');
      // Skip auto-focus in Telegram Mini App to prevent keyboard from shifting the modal
      if (!document.documentElement.classList.contains("in-tma")) {
        nodes.createName.focus();
      }
    }

    function closeCreateModal() {
      nodes.modal.classList.remove("open");
      state.createInFlight = false;
      nodes.modalCreate.disabled = false;
      nodes.modalCreate.textContent = I18n.t('createProject');
      state.createRequestId = null;
    }

    async function createProject() {
      if (state.createInFlight) return;
      var name = nodes.createName.value.trim();
      var botHost = nodes.createHost.value.trim() || "@pending";
      if (name.length < 2) { alert("Введите название проекта (минимум 2 символа)"); return; }

      var kbMode = nodes.createKB.value;
      var kbContent = null;
      var kbTitle = null;
      var kbType = null; // 'text' or 'file'

      if (kbMode === 'file') {
        if (!_createKbFile) { alert("Выберите файл для загрузки в базу знаний!"); return; }
        nodes.modalCreate.textContent = "Извлечение текста...";
        try {
          kbContent = await readFileAsText(_createKbFile);
          kbTitle = _createKbFile.name;
          kbType = 'file';
        } catch (e) {
          alert("Ошибка чтения файла: " + e.message);
          return;
        }
        if (!kbContent || kbContent.length < 10) { alert("Файл пустой или не читается"); return; }
      } else if (kbMode === 'text') {
        kbContent = nodes.createKBText.value.trim();
        if (kbContent.length < 10) { alert("Введите хотя бы 10 символов для базы знаний!"); return; }
        kbTitle = name + " - База знаний";
        kbType = 'text';
      }

      if (!state.createRequestId) state.createRequestId = makeRequestId();
      state.createInFlight = true;
      nodes.modalCreate.disabled = true;
      nodes.modalCreate.textContent = I18n.t('creatingProject');
      try {
        var hostLooksLikeToken = isTelegramToken(botHost);
        var created = await ProjectsApi.createProject({
          name: name,
          botHost: hostLooksLikeToken ? "@pending_connect" : botHost,
          requestId: state.createRequestId,
        });
        state.activeProjectId = created.project.id;

        // Add initial knowledge base if provided
        if (kbMode === 'file' || kbMode === 'text') {
          await ProjectsApi.addSource(created.project.id, {
            type: kbType,
            title: kbTitle,
            contentRef: kbContent
          });
        }

        if (hostLooksLikeToken) {
          nodes.modalCreate.textContent = "Подключаю Telegram…";
          try {
            var linked = await connectTelegramToken(botHost, created.project.id, name);
            if (linked && linked.username) {
              await ProjectsApi.updateProject(created.project.id, { botHost: linked.username });
            }
            notify("Telegram подключён" + (linked && linked.username ? (": " + linked.username) : ""));
          } catch (e) {
            notify(I18n.t('projectCreated') + ", " + I18n.t('connectTelegram') + ": " + (e.message || I18n.t('error').toLowerCase()), true);
          }
        }
        closeCreateModal();
        await refreshProjects();
        if (kbMode === 'file' || kbMode === 'text') {
          state.tab = "sources";
          await renderTab();
        } else {
          state.tab = "settings";
          await renderTab();
        }
      } catch (e) {
        notify(e.message || I18n.t('error') + " " + I18n.t('createProject') + ". " + I18n.t('tryAgain') + ".", true);
      } finally {
        state.createInFlight = false;
        if (nodes.modal.classList.contains("open")) {
          nodes.modalCreate.disabled = false;
          nodes.modalCreate.textContent = I18n.t('createProject');
        }
      }
    }

    function layout() {
      return "" +
        "<div class='projects-app'>" +
        // ── Narrow navigation ──────────────────────────────────────────────
        "<nav class='cp-narrow-nav'>" +
        "<div class='cp-nav-workspace'>C</div>" +
        "<div id='cp-nav-items' class='cp-nav-items'>" +
        "<button class='cp-nav-item active' data-nav='analytics' title='Аналитика'>" + _ic.analytics + "</button>" +
        "<button class='cp-nav-item' data-nav='chats' title='Чаты'>" + _ic.chat + "</button>" +
        "<button class='cp-nav-item' data-nav='sources' title='База знаний'>" + _ic.book + "</button>" +
        "<button class='cp-nav-item' data-nav='settings' title='Настройки'>" + _ic.gear + "</button>" +
        "</div>" +
        "<div class='cp-nav-bottom'>" +
        "<button id='proj-signout-btn' title='Аккаунт' style='background:none;border:none;cursor:pointer;padding:0;line-height:0;'>" +
        "<div id='proj-user-av' style='width:32px;height:32px;border-radius:50%;background:#1e5cfb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;'>?</div>" +
        "</button>" +
        "</div>" +
        "</nav>" +
        // ── Agent sidebar ──────────────────────────────────────────────────
        "<aside class='cp-agent-sidebar'>" +
        "<div class='cp-sidebar-header' id='cp-sidebar-switcher' style='cursor:pointer;padding:12px;border-bottom:1px solid #f2f2f7;flex-shrink:0;display:flex;align-items:center;gap:10px;transition:background .15s;border-radius:0;' onmouseenter=\"this.style.background='rgba(0,0,0,0.03)'\" onmouseleave=\"this.style.background='transparent'\">" +
        "<div id='cp-sw-av' style='width:36px;height:36px;border-radius:50%;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0;'>?</div>" +
        "<div style='flex:1;min-width:0;'>" +
        "<div id='projects-active-title' style='font-size:0.9rem;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>Выберите проект</div>" +
        "<div class='cp-status-row' id='cp-status-row' style='margin-top:2px;'>" +
        "<div class='cp-status-dot offline' id='cp-status-dot'></div>" +
        "<span class='cp-status-label' id='cp-status-label' style='font-size:0.72rem;'>Не активен</span>" +
        "</div>" +
        "</div>" +
        "<span id='cp-sw-arrow' style='font-size:11px;color:#8e8e93;flex-shrink:0;transition:transform 0.2s;'>▾</span>" +
        "</div>" +
        "<button class='cp-stop-btn' id='cp-stop-btn' style='display:none'>Остановить</button>" +
        // Sub-navigation (tabs)
        "<div class='cp-subnav' id='projects-tabs' style='display:none'>" +
        "<button class='projects-tab active' data-tab='analytics'><span class='cp-tab-icon'>" + _ic.analytics + "</span>Аналитика</button>" +
        "<button class='projects-tab' data-tab='testing'><span class='cp-tab-icon'>" + _ic.test + "</span>Тестирование</button>" +
        "<button class='projects-tab' data-tab='chats'><span class='cp-tab-icon'>" + _ic.chat + "</span>Чаты</button>" +
        "<button class='projects-tab' data-tab='sources'><span class='cp-tab-icon'>" + _ic.book + "</span>База знаний</button>" +
        "<button class='projects-tab' data-tab='settings'><span class='cp-tab-icon'>" + _ic.gear + "</span>Настройки</button>" +
        "</div>" +

        // ── AI-Agent section ────────────────────────────────────────────────
        "<div class='cp-agent-section' id='cp-agent-section' style='display:none'>" +
        // Nav items
        "<button class='cp-agent-nav-item' data-agent-tab='analytics'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='20' x2='18' y2='10'/><line x1='12' y1='20' x2='12' y2='4'/><line x1='6' y1='20' x2='6' y2='14'/></svg>" +
        "Аналитика</button>" +
        "<button class='cp-agent-nav-item' data-agent-tab='testing'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><polygon points='5 3 19 12 5 21 5 3'/></svg>" +
        "Тестирование</button>" +
        "<button class='cp-agent-nav-item' data-agent-tab='chats'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/></svg>" +
        "Чаты</button>" +
        "<button class='cp-agent-nav-item' data-agent-tab='sources'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>" +
        "База знаний</button>" +
        "<button class='cp-agent-nav-item' data-agent-tab='unanswered'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>" +
        "Без ответов<span class='cp-agent-nav-badge' id='cp-unanswered-badge' style='display:none'>0</span></button>" +
        "<button class='cp-agent-nav-item' data-agent-tab='settings'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>" +
        "Настройки</button>" +
        // Divider + New project + Quick actions
        "<div class='cp-agent-divider'></div>" +
        "<button type='button' class='cp-agent-quick-btn' id='cp-new-project-btn' style='color:#1e5cfb;font-weight:600;'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#1e5cfb' stroke-width='2.2' stroke-linecap='round'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg>" +
        "Добавить проект</button>" +
        "<div class='cp-agent-divider'></div>" +
        "<div class='cp-agent-quick-hdr'>Добавить информацию</div>" +
        "<button type='button' class='cp-agent-quick-btn' id='cp-agent-upload-btn'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' y1='3' x2='12' y2='15'/></svg>" +
        "Загрузить файлы</button>" +
        "<button type='button' class='cp-agent-quick-btn' id='cp-agent-text-btn'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 20h9'/><path d='M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'/></svg>" +
        "Написать вручную</button>" +
        "<button type='button' class='cp-agent-quick-btn' id='cp-agent-rules-btn'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='8' y1='6' x2='21' y2='6'/><line x1='8' y1='12' x2='21' y2='12'/><line x1='8' y1='18' x2='21' y2='18'/><line x1='3' y1='6' x2='3.01' y2='6'/><line x1='3' y1='12' x2='3.01' y2='12'/><line x1='3' y1='18' x2='3.01' y2='18'/></svg>" +
        "Правила общения</button>" +
        "</div>" +

        "<div class='cp-sidebar-footer'>" +
        "<div class='cp-ai-counter' id='cp-ai-counter-widget' title='Открыть оплату и тарифы'>" +
        "<div class='cp-ai-counter-title'>ИИ-запросы <span class='cp-ai-counter-title-ico'>?</span></div>" +
        "<div class='cp-ai-counter-row'>" +
        "<span class='cp-ai-counter-val'>Осталось <span id='cp-ai-val'>…</span></span>" +
        "<span class='cp-ai-counter-arrow'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 18 15 12 9 6'/></svg></span>" +
        "</div>" +
        "<div class='cp-progress-track'><div class='cp-progress-fill' id='cp-ai-bar' style='width:0%'></div></div>" +
        "<span class='cp-ai-trial-badge' id='cp-ai-trial-lbl'></span>" +
        "</div>" +
        "<div id='proj-user-name' style='font-size:13px;color:rgba(60,60,67,0.72);margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'></div>" +
        "</div>" +
        "</aside>" +
        // ── Main content ───────────────────────────────────────────────────
        "<main class='cp-main'>" +
        "<div class='cp-topbar'>" +
        "<div class='cp-topbar-left'>" +
        // Desktop bot switcher (hidden on mobile)
        "<button class='cp-desk-switcher' id='cp-desk-switcher' style='display:flex;'>" +
        "<div class='cp-desk-sw-av' id='cp-desk-sw-av'>?</div>" +
        "<span class='cp-desk-sw-name' id='cp-desk-sw-name'>Выберите проект</span>" +
        "<span class='cp-desk-sw-arrow' id='cp-desk-sw-arrow'>∧</span>" +
        "</button>" +
        // Mobile button (shown on mobile only)
        "<button class='cp-mob-topbar-proj' id='cp-mob-topbar-proj'>" +
        "<span class='cp-mob-topbar-proj-name' id='cp-mob-proj-name'>Проект</span>" +
        "<span class='cp-mob-topbar-chev'>▾</span>" +
        "</button>" +
        "<div class='cp-topbar-meta' id='projects-active-meta'></div>" +
        "</div>" +

        "<div class='cp-topbar-right'>" +
        "<button class='projects-btn primary' id='projects-top-open-chats' style='display:none'>" + _ic.ext + " Открыть бота</button>" +
        "</div>" +
        "</div>" +
        "<div class='cp-content' id='projects-content'></div>" +
        "</main>" +
        // ── Mobile bottom navigation ──────────────────────────────────────
        "<nav class='cp-mobile-nav' id='cp-mobile-nav'>" +
        "<div class='cp-mobile-nav-inner'>" +
        "<button class='cp-mobile-nav-item' data-mnav='analytics'>" +
        "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='20' x2='18' y2='10'/><line x1='12' y1='20' x2='12' y2='4'/><line x1='6' y1='20' x2='6' y2='14'/></svg>" +
        "<span>Аналитика</span></button>" +
        "<button class='cp-mobile-nav-item' data-mnav='chats'>" +
        "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/></svg>" +
        "<span>Чаты</span></button>" +
        "<button class='cp-mobile-nav-item' data-mnav='sources'>" +
        "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>" +
        "<span>База знаний</span></button>" +
        "<button class='cp-mobile-nav-item' data-mnav='settings'>" +
        "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>" +
        "<span>Настройки</span></button>" +
        "<button class='cp-mobile-nav-item' id='cp-mob-proj-btn'>" +
        "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'/></svg>" +
        "<span class='cp-mob-proj-label' id='cp-mob-nav-proj-lbl'>Проекты</span></button>" +
        "</div>" +
        "</nav>" +
        // ── Mobile project drawer ─────────────────────────────────────────
        "<div class='cp-mobile-drawer-bg' id='cp-mobile-drawer-bg'>" +
        "<div class='cp-mobile-drawer'>" +
        "<div class='cp-mob-drawer-handle-row'><div class='cp-mob-drawer-handle'></div></div>" +
        "<div class='cp-mob-drawer-header'>" +
        "<span class='cp-mob-drawer-hdr-title'>Проекты</span>" +
        "<button class='cp-mob-drawer-close' id='cp-mob-drawer-close'>✕</button>" +
        "</div>" +
        "<div class='cp-mob-drawer-body'>" +
        "<button class='cp-mob-drawer-add' id='cp-mob-new-proj'>" +
        "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='#1e5cfb' stroke-width='2' stroke-linecap='round'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg>" +
        "Новый проект</button>" +
        "<div id='cp-mob-proj-list'></div>" +
        "</div>" +
        "</div>" +
        "</div>" +
        "</div>" +
        // ── Account full-page modal ────────────────────────────────────────
        "<div id='cp-acct-pg-bg' class='cp-acct-pg-bg'>" +
        "<div class='cp-acct-pg'>" +
        "<div class='cp-acct-pg-hdr'>" +
        "<span class='cp-acct-pg-title'>Мой аккаунт</span>" +
        "<button class='cp-acct-pg-close' id='cp-acct-pg-close'>✕</button>" +
        "</div>" +
        "<div class='cp-acct-pg-body'>" +
        // Left nav
        "<nav class='cp-acct-pg-nav'>" +
        "<button class='cp-acct-pg-nav-item active' data-acct='general'>Общие настройки</button>" +
        "<button class='cp-acct-pg-nav-item' data-acct='billing'>Оплата и тарифы</button>" +
        "<button class='cp-acct-pg-nav-item' data-acct='limits'>Лимиты</button>" +
        "<button class='cp-acct-pg-nav-item' data-acct='bonuses'>Бонусы</button>" +
        "</nav>" +
        // Content panels
        "<div class='cp-acct-pg-content'>" +
        // ── General settings panel ──────────────────────────────────────────
        "<div id='cp-acct-panel-general'>" +
        "<div class='cp-acct-section-title'>Общие настройки</div>" +
        "<div class='cp-acct-field'><input class='cp-acct-input' id='cp-acct-name' placeholder='Ваше имя'></div>" +
        "<div class='cp-acct-field'><div class='cp-acct-input-wrap'><input class='cp-acct-input' id='cp-acct-email' readonly><button class='cp-acct-input-icon' title='Email нельзя изменить'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12.01' y2='16'/></svg></button></div></div>" +
        "<label class='cp-acct-checkbox-row'><input type='checkbox' id='cp-acct-newsletter' checked><span>Получать новостные рассылки</span></label>" +
        "<button class='cp-acct-btn primary' id='cp-acct-save-general'>Обновить</button>" +
        "<div class='cp-acct-divider'></div>" +
        "<div class='cp-acct-block-title'>Пароль</div>" +
        "<div class='cp-acct-field'><div class='cp-acct-input-wrap'><input class='cp-acct-input' id='cp-acct-old-pw' type='password' placeholder='Старый пароль'><button class='cp-acct-input-icon' id='cp-acct-old-pw-eye' type='button'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg></button></div></div>" +
        "<div class='cp-acct-field'><div class='cp-acct-input-wrap'><input class='cp-acct-input' id='cp-acct-new-pw' type='password' placeholder='Новый пароль'><button class='cp-acct-input-icon' id='cp-acct-new-pw-eye' type='button'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg></button></div></div>" +
        "<button class='cp-acct-btn primary' id='cp-acct-save-pw'>Изменить пароль</button>" +
        "<div id='cp-acct-pw-msg' style='margin-top:10px;font-size:13px;'></div>" +
        "</div>" +
        // ── Billing panel ───────────────────────────────────────────────────
        "<div id='cp-acct-panel-billing' style='display:none'>" +
        // Plan info row
        "<div class='cp-bill-plan-row'><span class='cp-bill-plan-name'>Тариф Premium</span><span class='cp-bill-plan-price'>$250.00</span></div>" +
        "<div class='cp-bill-plan-sub'><span class='cp-bill-plan-date'>Следующий платёж 6 марта 2026 г.</span><button class='cp-bill-cancel-btn'>Отменить подписку</button></div>" +
        "<button class='cp-bill-change-btn' id='cp-bill-change-plan'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='17 1 21 5 17 9'/><path d='M3 11V9a4 4 0 0 1 4-4h14'/><polyline points='7 23 3 19 7 15'/><path d='M21 13v2a4 4 0 0 1-4 4H3'/></svg>Изменить тариф</button>" +
        "<div class='cp-bill-divider'></div>" +
        // Card section
        "<div id='cp-bill-card-section'>" +
        "<div class='cp-bill-card-row'><div class='cp-bill-card-info'><span class='cp-bill-visa'>VISA</span><span>Visa, *9891</span></div><button class='cp-bill-delete-btn' id='cp-bill-delete-card' title='Удалить карту'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/></svg></button></div>" +
        "</div>" +
        "<div id='cp-bill-no-card' style='display:none'><p class='cp-bill-no-card'>Карта не привязана</p><button class='cp-bill-add-btn' id='cp-bill-add-card'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg>Добавить карту</button></div>" +
        "<div class='cp-bill-divider'></div>" +
        // AI requests
        "<div class='cp-bill-progress-wrap'><div class='cp-bill-progress-track'><div class='cp-bill-progress-fill' style='width:75%'></div></div><div class='cp-bill-progress-label'><span>ИИ-запросов: 15 169 из 20 000</span><button class='cp-bill-buy-more'>Купить ещё</button></div></div>" +
        "<div class='cp-bill-divider'></div>" +
        // History
        "<div class='cp-bill-history-hdr'><span class='cp-bill-history-title'>История операций</span><button class='cp-bill-history-help'>Как это считается?</button></div>" +
        "<div class='cp-bill-row'><span class='cp-bill-row-name'>ChatPlace ИИ</span><span class='cp-bill-row-amt'>$15.57</span><span class='cp-bill-row-date'>4 дек. 2025 г.</span><span class='cp-bill-row-icon'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/></svg></span></div>" +
        "<div class='cp-bill-row'><span class='cp-bill-row-name'>Аккаунты</span><span class='cp-bill-row-amt'>$12.47</span><span class='cp-bill-row-date'>4 дек. 2025 г.</span><span class='cp-bill-row-icon'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/></svg></span></div>" +
        "<div class='cp-bill-row'><span class='cp-bill-row-name'>Pro</span><span class='cp-bill-row-amt'>$20.00</span><span class='cp-bill-row-date'>23 нояб. 2025 г.</span><span class='cp-bill-row-icon'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/></svg></span></div>" +
        "</div>" +
        // ── Limits panel ────────────────────────────────────────────────────
        "<div id='cp-acct-panel-limits' style='display:none'>" +
        "<div class='cp-acct-section-title'>Лимиты</div>" +
        "<div class='cp-acct-coming'><div class='cp-acct-coming-icon'>📊</div><div class='cp-acct-coming-title'>Скоро</div><div class='cp-acct-coming-sub'>Информация о лимитах и использовании будет доступна в ближайшее время</div></div>" +
        "</div>" +
        // ── Bonuses panel ───────────────────────────────────────────────────
        "<div id='cp-acct-panel-bonuses' style='display:none'>" +
        "<div class='cp-acct-section-title'>Бонусы</div>" +
        "<div style='font-size:14px;color:#737378;margin-bottom:20px;'>Введите промокод, чтобы получить бонус</div>" +
        "<div class='cp-acct-promo-row'>" +
        "<input class='cp-acct-input' id='cp-acct-promo' placeholder='Введите промокод'>" +
        "<button class='cp-acct-btn primary' id='cp-acct-promo-apply'>Активировать</button>" +
        "</div>" +
        "</div></div>" + // cp-acct-pg + cp-acct-pg-bg
        // ── Telegram Connect Modal ─────────────────────────────────────────────
        "<div class='tg-modal-bg' id='tg-connect-modal'>" +
        "<div class='tg-modal'>" +
        "<div class='tg-modal-h'>" +
        "<h3 class='tg-modal-title'>Шаги для подключения Telegram бота</h3>" +
        "<button class='tg-modal-close' id='tg-connect-close'><svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg></button>" +
        "</div>" +
        "<div class='tg-modal-b'>" +
        "<div class='tg-tabs'>" +
        "<div class='tg-tab active' id='tg-tab-new'>Новый</div>" +
        "<div class='tg-tab' id='tg-tab-existing'>Существующий</div>" +
        "</div>" +
        "<!-- Steps (New Bot) -->" +
        "<div class='tg-step-list' id='tg-steps-new'>" +
        "<div class='tg-step'><div class='tg-step-num'>1</div><div class='tg-step-text'>Откройте <a href='https://t.me/BotFather' target='_blank'>@BotFather</a> в Telegram и нажмите <b>/start</b></div></div>" +
        "<div class='tg-step'><div class='tg-step-num'>2</div><div class='tg-step-text'>Отправьте команду <b>/newbot</b> и следуйте инструкциям</div></div>" +
        "<div class='tg-step'><div class='tg-step-num'>3</div><div class='tg-step-text'>После создания бота, вы получите сообщение с токеном. Скопируйте токен и вставьте сюда.</div></div>" +
        "</div>" +
        "<!-- Steps (Existing Bot) -->" +
        "<div class='tg-step-list' id='tg-steps-existing' style='display:none'>" +
        "<div class='tg-step'><div class='tg-step-num'>1</div><div class='tg-step-text'>Откройте <a href='https://t.me/BotFather' target='_blank'>@BotFather</a> в Telegram и нажмите <b>/start</b></div></div>" +
        "<div class='tg-step'><div class='tg-step-num'>2</div><div class='tg-step-text'>Отправьте команду <b>/mybots</b> и выберите из списка бота, которого хотите подключить</div></div>" +
        "<div class='tg-step'><div class='tg-step-num'>3</div><div class='tg-step-text'>Скопируйте API токен и вставьте сюда</div></div>" +
        "</div>" +
        "<div class='tg-input-wrap'><input type='text' id='tg-connect-token' class='tg-input' placeholder='Введите токен'></div>" +
        "<div id='tg-connect-error' style='color:#ef4444;font-size:13px;min-height:18px;margin:4px 0 8px;'></div>" +
        "<button class='tg-btn' id='tg-connect-btn'>Подключить</button>" +
        "</div>" + // b
        "</div>" + // modal
        "</div>" + // bg

        // ── Chat Viewer Modal ────────────────────────────────────────────────
        "<div class='chat-modal-bg' id='projects-chat-modal-bg'>" +
        "<div class='chat-modal' id='projects-chat-modal-wrap'>" +
        "<div class='chat-modal-h'>" +
        "<div>" +
        "<div class='chat-modal-title' id='projects-chat-modal-title'>Диалог</div>" +
        "<div class='chat-modal-title-sub' id='projects-chat-modal-sub'></div>" +
        "</div>" +
        "<div class='chat-modal-actions'>" +
        "<button class='chat-modal-icon-btn' id='projects-chat-modal-expand' title='Развернуть'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M15 3h6v6'/><path d='M9 21H3v-6'/><path d='M21 3l-7 7'/><path d='M3 21l7-7'/></svg></button>" +
        "<button class='chat-modal-icon-btn' id='projects-chat-modal-close' title='Закрыть'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg></button>" +
        "</div>" +
        "</div>" +
        "<div class='chat-modal-b' id='projects-chat-modal-body'></div>" +
        "</div>" +
        "</div>" +

        // ── Pricing modal ──────────────────────────────────────────────────
        "<div id='cp-pricing-bg' class='cp-pricing-bg'>" +
        "<div class='cp-pricing-wrap'><div class='cp-pricing-box'>" +
        "<div class='cp-pricing-hdr'>" +
        "<div><div class='cp-pricing-title'>Выберите тариф</div><div class='cp-pricing-sub'>Вы всегда сможете его изменить</div></div>" +
        "<button class='cp-pricing-close-btn' id='cp-pricing-close'>✕</button>" +
        "</div>" +
        // Period toggle
        "<div class='cp-pricing-periods'>" +
        "<label class='cp-period-opt active' id='cp-period-year'><div class='cp-period-radio'><div class='cp-period-radio-dot'></div></div><span>На год</span><span class='cp-period-badge'>-20%</span></label>" +
        "<label class='cp-period-opt' id='cp-period-month'><div class='cp-period-radio'><div class='cp-period-radio-dot'></div></div><span>Помесячно</span><span class='cp-period-current' id='cp-period-current-lbl'>Текущий план</span></label>" +
        "</div>" +
        // Plan cards grid
        "<div class='cp-pricing-cards'>" +
        // Pro card
        "<div class='cp-plan-card pro'>" +
        "<span class='cp-plan-badge green'>Часто выбирают</span>" +
        "<div class='cp-plan-name'>Pro</div>" +
        "<div class='cp-plan-desc'>Лучший выбор для индивидуальной работы и небольших команд</div>" +
        "<div class='cp-plan-price-old' id='cp-pro-price-old'>$20</div>" +
        "<div class='cp-plan-price-row'><span class='cp-plan-price-val' id='cp-pro-price'>$16</span><span class='cp-plan-price-per'>/ в месяц</span></div>" +
        "<div class='cp-plan-price-note' id='cp-pro-note'>при оплате за год</div>" +
        "<button class='cp-plan-cta disabled' id='cp-pro-cta'>Подключить сейчас</button>" +
        "</div>" +
        // Premium card
        "<div class='cp-plan-card premium'>" +
        "<span class='cp-plan-badge blue'>ИИ Boost</span>" +
        "<div class='cp-plan-name'>Premium</div>" +
        "<div class='cp-plan-desc'>Для тех, кто хочет использовать ИИ-функции на максимум</div>" +
        "<div class='cp-plan-price-old' id='cp-prem-price-old'>$250</div>" +
        "<div class='cp-plan-price-row'><span class='cp-plan-price-val' id='cp-prem-price'>$200</span><span class='cp-plan-price-per'>/ в месяц</span></div>" +
        "<div class='cp-plan-price-note' id='cp-prem-note'>при оплате за год</div>" +
        "<button class='cp-plan-cta active' id='cp-prem-cta'>Подключить сейчас</button>" +
        "</div>" +
        "</div>" + // cp-pricing-cards
        // Features table
        "<div style='margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:0 20px'>" +
        "<ul class='cp-plan-features'>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/></svg><span class='cp-plan-feat-name'>Контакты</span><span class='cp-plan-feat-val'>∞</span></li>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg><span class='cp-plan-feat-name'>Доп. аккаунт</span><span class='cp-plan-feat-val accent'>$16/мес</span></li>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg><span class='cp-plan-feat-name'>ИИ-функции</span><span class='cp-plan-feat-val accent'>$20/мес</span></li>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2'/></svg><span class='cp-plan-feat-name'>ИИ-запросов в тарифе</span><span class='cp-plan-feat-val'>2 000</span></li>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg><span class='cp-plan-feat-name'>+1000 ИИ-запросов</span><span class='cp-plan-feat-val'>$15</span></li>" +
        "</ul>" +
        "<ul class='cp-plan-features'>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/></svg><span class='cp-plan-feat-name'>Контакты</span><span class='cp-plan-feat-val'>∞</span></li>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg><span class='cp-plan-feat-name'>Доп. аккаунт</span><span class='cp-plan-feat-val'>∞</span></li>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg><span class='cp-plan-feat-name'>ИИ-функции</span><span class='cp-plan-feat-val'>✓</span></li>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2'/></svg><span class='cp-plan-feat-name'>ИИ-запросов в тарифе</span><span class='cp-plan-feat-val'>20 000</span></li>" +
        "<li class='cp-plan-feat-row'><svg class='cp-plan-feat-icon' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg><span class='cp-plan-feat-name'>+1000 ИИ-запросов</span><span class='cp-plan-feat-val'>$10</span></li>" +
        "</ul>" +
        "</div>" +
        "</div></div></div>" + // cp-pricing-box, cp-pricing-wrap, cp-pricing-bg

        // ── Chat Viewer Modal ──────────────────────────────────────────
        "<div class='chat-modal-bg' id='projects-chat-modal-bg'>" +
        "<div class='chat-modal' id='projects-chat-modal-wrap'>" +
        "<div class='chat-modal-h'>" +
        "<div style='min-width:0;'>" +
        "<div class='chat-modal-title' id='projects-chat-modal-title'></div>" +
        "<div class='chat-modal-title-sub' id='projects-chat-modal-sub'></div>" +
        "</div>" +
        "<div class='chat-modal-actions'>" +
        "<button class='chat-modal-icon-btn' id='projects-chat-modal-expand' title='Развернуть/свернуть'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='15 3 21 3 21 9'/><polyline points='9 21 3 21 3 15'/><line x1='21' y1='3' x2='14' y2='10'/><line x1='3' y1='21' x2='10' y2='14'/></svg></button>" +
        "<button class='chat-modal-icon-btn' id='projects-chat-modal-close' title='Закрыть'><svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg></button>" +
        "</div>" +
        "</div>" +
        "<div class='chat-modal-b' id='projects-chat-modal-body'></div>" +
        "</div>" +
        "</div>" +
        // ── Add card modal ─────────────────────────────────────────────────
        "<div id='cp-add-card-bg' class='cp-add-card-bg' style='display:none'>" +
        "<div class='cp-add-card-box'>" +
        "<div class='cp-add-card-title'>Добавить карту</div>" +
        "<button class='cp-add-card-close' id='cp-add-card-close'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg></button>" +
        "<div class='cp-add-card-field'><label class='cp-add-card-lbl' for='cp-card-number'>Номер карты</label><input class='cp-add-card-input' id='cp-card-number' placeholder='0000 0000 0000 0000' maxlength='19' inputmode='numeric'></div>" +
        "<div class='cp-add-card-row'>" +
        "<div class='cp-add-card-field'><label class='cp-add-card-lbl' for='cp-card-expiry'>Срок действия</label><input class='cp-add-card-input' id='cp-card-expiry' placeholder='ММ / ГГ' maxlength='7' inputmode='numeric'></div>" +
        "<div class='cp-add-card-field'><label class='cp-add-card-lbl' for='cp-card-cvv'>CVV</label><input class='cp-add-card-input' id='cp-card-cvv' placeholder='•••' maxlength='3' inputmode='numeric'></div>" +
        "</div>" +
        "<button class='cp-add-card-save' id='cp-add-card-save'>Сохранить карту</button>" +
        "</div></div>" +
        // ── Account menu popup ─────────────────────────────────────────────
        "<div id='cp-account-menu' class='cp-account-menu'>" +
        "<div class='cp-acct-menu-hdr'>" +
        "<div class='cp-acct-menu-av' id='cp-menu-av'>?</div>" +
        "<div class='cp-acct-menu-info'>" +
        "<div class='cp-acct-menu-name' id='cp-menu-name'>—</div>" +
        "<div class='cp-acct-menu-email' id='cp-menu-email'>—</div>" +
        "</div></div>" +
        "<div class='cp-acct-menu-body'>" +
        "<button class='cp-acct-menu-item' id='cp-menu-account'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg><span class='cp-acct-menu-item-label'>Мой аккаунт</span></button>" +
        "<button class='cp-acct-menu-item' id='cp-menu-billing'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='1' y='4' width='22' height='16' rx='2' ry='2'/><line x1='1' y1='10' x2='23' y2='10'/></svg><span class='cp-acct-menu-item-label'>Оплата и тарифы</span></button>" +
        "<button class='cp-acct-menu-item' id='cp-menu-partner'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M23 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/></svg><span class='cp-acct-menu-item-label'>Кабинет партнера</span></button>" +
        "<div class='cp-acct-menu-sep'></div>" +
        "<button class='cp-acct-menu-item' id='cp-menu-lang'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='2' y1='12' x2='22' y2='12'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/></svg><span class='cp-acct-menu-item-label'>Язык</span><span class='cp-acct-menu-item-chev'>›</span></button>" +
        "<button class='cp-acct-menu-item' id='cp-menu-help'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg><span class='cp-acct-menu-item-label'>Помощь</span></button>" +
        "<div class='cp-acct-menu-sep'></div>" +
        "<button class='cp-acct-menu-item danger' id='cp-menu-signout'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'/><polyline points='16 17 21 12 16 7'/><line x1='21' y1='12' x2='9' y2='12'/></svg><span class='cp-acct-menu-item-label'>Выйти</span></button>" +
        "</div></div>" +
        // Create project modal
        "<div class='projects-modal-bg' id='projects-create-modal'><div class='projects-modal'>" +
        "<div class='projects-modal-h'><div style='font-size:16px;font-weight:900'>Новый проект</div><button class='projects-btn' id='projects-create-close'>✕</button></div>" +
        "<div class='projects-modal-b'><div class='projects-form'>" +
        "<div><label>" + I18n.t('projectName') + "</label><input id='projects-create-name' placeholder='Например: Мой магазин'></div>" +
        "<div><label>Telegram Bot Token <span style='font-weight:400;color:#6b7280;font-size:11px;'>— введите токен от @BotFather для автоподключения</span></label><input id='projects-create-host' placeholder='123456789:AAFxxxxxx или @mybot'></div>" +
        "<div style='font-size:12px;color:#6b7280;background:#f1f5f9;border-radius:8px;padding:8px 10px;line-height:1.5;'>💡 Получите токен у <b><a href=\"https://t.me/BotFather\" target=\"_blank\" style=\"color:#0b0f19;\">@BotFather</a></b> → /newbot → скопируйте токен и вставьте выше. Если у вас нет бота — введите любой текст, подключить Telegram можно позже в Настройках.</div>" +
        "<div><label>База знаний</label><select id='projects-create-kb'><option value='skip'>Пропустить (добавить потом)</option><option value='file'>Загрузить файл (PDF, DOCX, TXT)</option><option value='text'>Ввести текст вручную</option></select></div>" +
        "<div id='projects-create-kb-file-wrap' style='display:none;'><div class='src-drop-zone' id='projects-create-drop-zone' style='min-height:120px;'><div class='src-drop-icon'><svg width='30' height='30' viewBox='0 0 24 24' fill='none' stroke='#9ca3af' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='12' y1='11' x2='12' y2='17'/><line x1='9' y1='14' x2='15' y2='14'/></svg></div><div class='src-drop-text' id='projects-create-drop-text'>Выберите или перетащите файл</div></div><input type='file' id='projects-create-file-input' style='display:none;' accept='.pdf,.docx,.txt,.md,.csv,.json'></div>" +
        "<div id='projects-create-kb-text-wrap' style='display:none;'><textarea id='projects-create-kb-text' placeholder='Вставьте сюда информацию о компании, товарах или услугах (от 10 символов)...' rows='5' style='width:100%;'></textarea></div>" +
        "</div></div><div class='projects-modal-f'><button class='projects-btn' id='projects-create-cancel'>Отмена</button>" +
        "<button class='projects-btn primary' id='projects-create-submit'>Создать проект</button></div></div></div>" +
        // Add source modal
        "<div class='src-modal-bg' id='projects-source-modal'>" +
        "<div class='src-modal'>" +
        "<div class='src-modal-h'>" +
        "<button class='src-back-btn' id='src-back' style='display:none'>←</button>" +
        "<div class='src-modal-title' id='src-title'>Добавить источник</div>" +
        "<button class='src-close-btn' id='src-close'>✕</button>" +
        "</div>" +
        // Main view
        "<div id='src-view-main' class='src-modal-b'>" +
        "<div class='src-main-title'>Что хотите добавить?</div>" +
        "<div class='src-drop-zone src-drop-zone-main' id='src-drop-zone'>" +
        "<div class='src-drop-plus'>+</div>" +
        "<div class='src-drop-main'><span class='src-drop-main-accent'>Загрузите</span> или перетащите файлы в эту область.</div>" +
        "<div class='src-drop-sub'>DOCX, XLS или PDF, не больше 30МБ</div>" +
        "</div>" +
        "<div class='src-main-actions'>" +
        "<button type='button' class='src-main-action' id='src-pick-file'>Загрузить файлы</button>" +
        "<button type='button' class='src-main-action' id='src-pick-text'>Написать вручную</button>" +
        "<button type='button' class='src-main-action' id='src-pick-url'>Добавить ссылку</button>" +
        "</div>" +
        "</div>" +
        // Text sub-view
        "<div id='src-view-text' style='display:none'>" +
        "<div class='src-modal-b'><div class='projects-form'>" +
        "<div><label>" + I18n.t('sourceTitle') + "</label><input id='src-text-title' placeholder='" + I18n.t('sourceTitlePlaceholder') + "'></div>" +
        "<div><label>" + I18n.t('sourceText') + "</label><textarea id='src-text-body' placeholder='" + I18n.t('sourceTextPlaceholder') + "' style='min-height:140px'></textarea></div>" +
        "</div></div>" +
        "<div class='src-modal-f'><button class='projects-btn' id='src-text-cancel'>Отмена</button><button class='projects-btn primary' id='src-text-ok'>Добавить</button></div>" +
        "</div>" +
        // URL sub-view
        "<div id='src-view-url' style='display:none'>" +
        "<div class='src-modal-b'><div class='projects-form'>" +
        "<div><label>" + I18n.t('sourceTitle') + "</label><input id='src-url-title' placeholder='" + I18n.t('sourceUrlPlaceholder') + "'></div>" +
        "<div><label>URL</label><input id='src-url-href' placeholder='https://...' type='url'></div>" +
        "</div></div>" +
        "<div class='src-modal-f'><button class='projects-btn' id='src-url-cancel'>Отмена</button><button class='projects-btn primary' id='src-url-ok'>Добавить</button></div>" +
        "</div>" +
        // File sub-view
        "<div id='src-view-file' style='display:none'>" +
        "<div class='src-modal-b'>" +
        "<div class='src-drop-zone' id='src-file-zone'>" +
        "<div class='src-drop-icon'><svg width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='#9ca3af' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' y1='3' x2='12' y2='15'/></svg></div>" +
        "<div class='src-drop-text' id='src-file-lbl'>Выберите или перетащите файл (.txt, .md, .csv, .pdf, .docx, .pptx)</div>" +
        "<input type='file' id='src-file-inp' accept='.txt,.md,.csv,.pdf,.doc,.docx,.ppt,.pptx' style='display:none'>" +
        "</div>" +
        "</div>" +
        "<div class='src-modal-f'><button class='projects-btn' id='src-file-cancel'>Отмена</button><button class='projects-btn primary' id='src-file-ok'>Загрузить</button></div>" +
        "</div>" +
        "</div></div>";
    }

    // ── Finance View (Super Admin) ──────────────────────────────────────────
    function renderFinanceView() {
      nodes.content.innerHTML =
        "<div class='cp-finance'>" +
        "<div class='cp-finance-title'>AI Financial Monitor</div>" +
        "<div id='cp-fin-body'>" +
        "<div style='display:flex;align-items:center;gap:10px;color:#737378;padding:40px 0'>" +
        "<div class='cp-training-spinner'></div>Загружаем данные…</div>" +
        "</div></div>";

      var finBody = root.querySelector("#cp-fin-body");

      fetch("https://us-central1-chatbot-acd16.cloudfunctions.net/getAIBillingStats")
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok || !finBody) return;
          var today = new Date().toISOString().slice(0, 10);
          var fmt$ = function (v) { return "$" + (Number(v) || 0).toFixed(4); };
          var fmtInt = function (v) { return Number(v || 0).toLocaleString("ru-RU"); };

          // KPI cards
          var daysLeft = d.estimatedDaysRemaining;
          var daysClass = daysLeft !== null && daysLeft < 7 ? "danger" : daysLeft !== null && daysLeft < 14 ? "warning" : "";
          var kpiHtml =
            "<div class='cp-fin-kpi-row'>" +
            "<div class='cp-fin-kpi'><div class='cp-fin-kpi-label'>Потрачено сегодня</div><div class='cp-fin-kpi-val'>" + fmt$(d.todaySpent) + "</div><div class='cp-fin-kpi-sub'>" + fmtInt(d.todayRequests) + " запросов</div></div>" +
            "<div class='cp-fin-kpi'><div class='cp-fin-kpi-label'>За 30 дней</div><div class='cp-fin-kpi-val'>" + fmt$(d.last30DaysSpent) + "</div><div class='cp-fin-kpi-sub'>Всего: " + fmt$(d.totalSpent) + "</div></div>" +
            "<div class='cp-fin-kpi'><div class='cp-fin-kpi-label'>Средний день</div><div class='cp-fin-kpi-val'>" + fmt$(d.avgDailyCost) + "</div><div class='cp-fin-kpi-sub'>" + fmtInt(d.totalRequests) + " всего запросов</div></div>" +
            "<div class='cp-fin-kpi'><div class='cp-fin-kpi-label'>Баланс OpenAI</div><div class='cp-fin-kpi-val'>" + (d.openaiBalance !== null ? "$" + d.openaiBalance.toFixed(2) : "—") + "</div><div class='cp-fin-kpi-sub'>" + (d.openaiMonthUsed !== null ? "Этот месяц: $" + d.openaiMonthUsed.toFixed(2) : "Legacy API") + "</div></div>" +
            "<div class='cp-fin-kpi " + daysClass + "'><div class='cp-fin-kpi-label'>Хватит на</div><div class='cp-fin-kpi-val'>" + (daysLeft !== null ? daysLeft + " дн." : "—") + "</div><div class='cp-fin-kpi-sub'>" + (daysLeft !== null && daysLeft < 7 ? "⚠️ Пополните баланс!" : "При текущем темпе") + "</div></div>" +
            "</div>";

          // Bar chart (last 14 days)
          var last14 = (d.dailyBreakdown || []).slice(-14);
          var maxCost = Math.max.apply(null, last14.map(function (x) { return x.costUSD; })) || 0.001;
          var barsHtml = last14.map(function (day) {
            var pct = Math.round((day.costUSD / maxCost) * 100);
            var isToday = day.date === today;
            var label = day.date.slice(5); // MM-DD
            return "<div class='cp-fin-bar-wrap'>" +
              "<div class='cp-fin-bar " + (isToday ? "cp-fin-today-bar" : "") + "' style='height:" + Math.max(pct, 2) + "px' title='" + fmt$(day.costUSD) + " · " + day.requests + " req'></div>" +
              "<div class='cp-fin-bar-lbl'>" + label + "</div>" +
              "</div>";
          }).join("");

          var chartHtml =
            "<div class='cp-fin-chart-card'>" +
            "<div class='cp-fin-chart-title'><span>Расходы по дням</span><span style='font-size:12px;color:#737378;font-weight:400'><span style='display:inline-block;width:8px;height:8px;border-radius:2px;background:#34c759;margin-right:4px'></span>Сегодня</span></div>" +
            "<div class='cp-fin-bars'>" + barsHtml + "</div>" +
            "</div>";

          // Recent days table (last 10)
          var last10 = (d.dailyBreakdown || []).filter(function (x) { return x.requests > 0; }).slice(-10).reverse();
          var rowsHtml = last10.map(function (day) {
            var isToday = day.date === today;
            return "<div class='cp-fin-table-row" + (isToday ? " today" : "") + "'>" +
              "<div>" + day.date + (isToday ? " 🟢" : "") + "</div>" +
              "<div>" + fmt$(day.costUSD) + "</div>" +
              "<div>" + fmtInt(day.requests) + "</div>" +
              "<div>" + fmtInt(day.inputTokens + day.outputTokens) + "</div>" +
              "</div>";
          }).join("");
          var tableHtml =
            "<div class='cp-fin-table-card'>" +
            "<div class='cp-fin-table-head'><div>Дата</div><div>Стоимость</div><div>Запросов</div><div>Токенов</div></div>" +
            (rowsHtml || "<div style='padding:20px 16px;color:#737378;font-size:13px'>Данных пока нет. Они появятся после первых AI-запросов.</div>") +
            "</div>";

          if (finBody) finBody.innerHTML = kpiHtml + chartHtml + tableHtml;
        })
        .catch(function () {
          if (finBody) finBody.innerHTML = "<div style='color:#ff3b30;padding:20px 0'>Ошибка загрузки данных. Попробуйте позже.</div>";
        });
    }

    // ── Analytics View ─────────────────────────────────────────────────────
    function renderAnalyticsView() {
      var p = getActiveProject();
      if (!p) return;

      var period = state.analyticsPeriod || 30;
      var totalChats = Number(p.chatsCount || 0);
      var aiAnswered = totalChats;
      var aiPct = totalChats > 0 ? 100 : 0;
      var minutesSaved = Math.round(totalChats * 1.5);
      var sourcesCount = Number(p.sourcesCount || 0);

      // SVG gauge (semicircle)
      var gaugeCirc = Math.PI * 80;
      var gaugeFill = gaugeCirc * aiPct / 100;
      var gaugeHtml = "<svg class='cp-gauge-svg' width='220' height='110' viewBox='0 0 220 110'>" +
        "<path d='M 30 100 A 80 80 0 0 1 190 100' fill='none' stroke='#f2f2f7' stroke-width='16' stroke-linecap='round'/>" +
        "<path d='M 30 100 A 80 80 0 0 1 190 100' fill='none' stroke='#9fc6ff' stroke-width='16' stroke-linecap='round'" +
        " stroke-dasharray='" + gaugeFill.toFixed(1) + " " + gaugeCirc.toFixed(1) + "'/>" +
        "</svg>";

      var periodBtns = [7, 30, 90].map(function (d) {
        return "<button class='cp-period-btn" + (state.analyticsPeriod === d ? " active" : "") + "' data-period='" + d + "'>" + d + " дней</button>";
      }).join("");

      // Render immediately — no await
      nodes.content.innerHTML =
        "<div class='cp-period-bar'>" + periodBtns + "</div>" +
        "<div class='cp-gauge-card'>" +
        gaugeHtml +
        "<div class='cp-gauge-stats'>" +
        "<div>" +
        "<div class='cp-gauge-pct'>" + aiPct + "%</div>" +
        "<div class='cp-gauge-desc'>сообщений обработал ИИ-агент</div>" +
        "</div>" +
        "<div class='cp-gauge-row'><div class='cp-gauge-dot' style='background:#9fc6ff'></div><span class='cp-gauge-row-label'>Ответил ИИ-агент</span><span class='cp-gauge-row-val'>" + aiAnswered + "</span></div>" +
        "<div class='cp-gauge-row'><div class='cp-gauge-dot' style='background:#e5e5ea'></div><span class='cp-gauge-row-label'>Вручную</span><span class='cp-gauge-row-val'>0</span></div>" +
        "</div>" +
        "</div>" +
        "<div class='cp-analytics-grid'>" +
        "<div class='cp-analytics-kpi'><div class='cp-analytics-kpi-label'>Диалоги</div><div class='cp-analytics-kpi-value'>" + totalChats + "</div><div class='cp-analytics-kpi-sub'>за " + period + " дней</div></div>" +
        "<div class='cp-analytics-kpi'><div class='cp-analytics-kpi-label'>Минут сэкономлено</div><div class='cp-analytics-kpi-value'>" + minutesSaved + "</div><div class='cp-analytics-kpi-sub'>за " + period + " дней</div></div>" +
        "<div class='cp-analytics-kpi'><div class='cp-analytics-kpi-label'>Источники базы знаний</div><div class='cp-analytics-kpi-value'>" + sourcesCount + "</div><div class='cp-analytics-kpi-sub'>документов загружено</div></div>" +
        "</div>" +
        "<div id='cp-questions-placeholder'></div>" +
        (sourcesCount === 0 ? (
          "<div class='projects-empty'><div><h3>Загрузите базу знаний</h3><p>Добавьте источники, чтобы бот мог отвечать на вопросы.</p><div style='margin-top:16px'><button class='projects-btn primary' id='cp-analytics-add-src'>+ Добавить источник</button></div></div></div>"
        ) : "");

      // Period buttons
      nodes.content.querySelectorAll("[data-period]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.analyticsPeriod = Number(btn.getAttribute("data-period"));
          renderAnalyticsView();
        });
      });
      // Add source shortcut
      var addSrcBtn = root.querySelector("#cp-analytics-add-src");
      if (addSrcBtn) addSrcBtn.addEventListener("click", function () { setTab("sources"); });

      // Load recent questions from Firestore in background
      var renderedProjectId = state.activeProjectId;
      var renderedPeriod = period;
      (function () {
        if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) return;
        var user = firebase.auth().currentUser;
        if (!user) return;
        var cutoffMs = Date.now() - renderedPeriod * 24 * 60 * 60 * 1000;
        firebase.firestore()
          .collection("users/" + user.uid + "/project_chats")
          .where("projectId", "==", renderedProjectId)
          .where("lastMessageAtMs", ">=", cutoffMs)
          .orderBy("lastMessageAtMs", "desc")
          .limit(100)
          .get()
          .then(function (snap) {
            // Abort if user switched project/tab
            if (state.activeProjectId !== renderedProjectId || state.tab !== "analytics") return;
            var recentQuestions = [];
            snap.forEach(function (d) {
              var msg = d.data().lastMessage || "";
              if (msg) recentQuestions.push(msg);
            });
            recentQuestions = recentQuestions.slice(0, 9);
            var placeholder = root.querySelector("#cp-questions-placeholder");
            if (!placeholder || !recentQuestions.length) return;
            placeholder.innerHTML =
              "<div class='cp-questions-section'>" +
              "<div class='cp-questions-header'>" +
              "<div><span class='cp-questions-title'>Последние диалоги</span></div>" +
              "<span class='cp-questions-link' id='cp-to-chats-link'>Все чаты →</span>" +
              "</div>" +
              recentQuestions.map(function (q) {
                return "<div class='cp-question-card'>" +
                  "<div class='cp-question-card-text'>" + esc(q.slice(0, 120)) + (q.length > 120 ? "…" : "") + "</div>" +
                  "<div class='cp-question-card-footer'>" +
                  "<span class='cp-question-card-count'>" +
                  "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/></svg>" +
                  "1 запрос</span>" +
                  "<button class='cp-question-add-btn' data-q='" + esc(q.slice(0, 100)) + "'>Добавить в KB</button>" +
                  "</div>" +
                  "</div>";
              }).join("") +
              "</div>";
            var toChatsLink = root.querySelector("#cp-to-chats-link");
            if (toChatsLink) toChatsLink.addEventListener("click", function () { setTab("chats"); });
            placeholder.querySelectorAll("[data-q]").forEach(function (btn) {
              btn.addEventListener("click", function () {
                setTab("sources");
                setTimeout(function () { openSourceModal(); }, 100);
              });
            });
          })
          .catch(function () { });
      }());
    }

    // ── Testing View ───────────────────────────────────────────────────────
    function renderTestingView() {
      var p = getActiveProject();
      if (!p) return;
      state.testHistory = [];

      var hintItems = state.sources.slice(0, 10).map(function (s) {
        return "<div class='cp-test-hint-item' data-hint='" + esc(s.title) + "'>" +
          "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#9ca3af' stroke-width='1.8'><circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>" +
          esc(s.title) + "</div>";
      }).join("");

      if (!hintItems) {
        hintItems = "<div class='cp-test-hint-item' style='color:#737378;cursor:default'>Загрузите базу знаний,<br>чтобы появились подсказки</div>";
      }

      nodes.content.innerHTML =
        "<div class='cp-test-wrap'>" +
        "<div class='cp-test-chat'>" +
        "<div class='cp-test-chat-header'>" + esc(p.name || "Бот") + " · Тестирование</div>" +
        "<div class='cp-test-messages' id='cp-test-msgs'>" +
        "<div class='cp-test-msg cp-test-msg-bot'>👋 Привет! Я — ваш ИИ-агент. Здесь можно проверить как я отвечаю клиентам. Просто напишите вопрос в чат.</div>" +
        "</div>" +
        "<div class='cp-test-input-row'>" +
        "<textarea id='cp-test-inp' class='cp-test-inp' placeholder='Напишите сообщение…' rows='1'></textarea>" +
        "<button id='cp-test-send' class='cp-test-send'>" +
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='22' y1='2' x2='11' y2='13'/><polygon points='22 2 15 22 11 13 2 9 22 2'/></svg>" +
        "</button>" +
        "</div>" +
        "</div>" +
        "<div class='cp-test-hints'>" +
        "<div class='cp-test-hints-title'>Можете начать с этих вопросов</div>" +
        "<div class='cp-test-hints-list'>" + hintItems + "</div>" +
        "</div>" +
        "</div>";

      var inp = root.querySelector("#cp-test-inp");
      var sendBtn = root.querySelector("#cp-test-send");
      var msgList = root.querySelector("#cp-test-msgs");

      function scrollBottom() {
        msgList.scrollTop = msgList.scrollHeight;
      }

      function addMsg(text, role) {
        var div = document.createElement("div");
        div.className = "cp-test-msg " + (role === "user" ? "cp-test-msg-user" : "cp-test-msg-bot");
        div.textContent = text;
        msgList.appendChild(div);
        scrollBottom();
        return div;
      }

      function showTyping() {
        var div = document.createElement("div");
        div.className = "cp-test-typing";
        div.id = "cp-test-typing";
        div.innerHTML = "<span></span><span></span><span></span>";
        msgList.appendChild(div);
        scrollBottom();
      }

      function hideTyping() {
        var t = root.querySelector("#cp-test-typing");
        if (t) t.remove();
      }

      async function sendMessage(text) {
        var q = (text || "").trim();
        if (!q) return;
        inp.value = "";
        inp.style.height = "";
        sendBtn.disabled = true;
        addMsg(q, "user");
        showTyping();
        try {
          var resp = await postJSON("/api/ai-chat", {
            question: q,
            rules: p.instructions || "",
            history: state.testHistory.slice(-10),
          });
          hideTyping();
          var answer = (resp.data && resp.data.answer) || "Не удалось получить ответ.";
          addMsg(answer, "bot");
          state.testHistory.push({ role: "user", content: q });
          state.testHistory.push({ role: "assistant", content: answer });
        } catch (e) {
          hideTyping();
          addMsg("Ошибка: " + (e.message || "не удалось подключиться к AI"), "bot");
        } finally {
          sendBtn.disabled = false;
          inp.focus();
        }
      }

      sendBtn.addEventListener("click", function () { sendMessage(inp.value); });
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(inp.value); }
      });
      inp.addEventListener("input", function () {
        inp.style.height = "";
        inp.style.height = Math.min(inp.scrollHeight, 120) + "px";
      });

      // Hint items click
      nodes.content.querySelectorAll("[data-hint]").forEach(function (item) {
        item.addEventListener("click", function () {
          sendMessage(item.getAttribute("data-hint"));
        });
      });
    }

    function emptyHtml() {
      return "<div class='projects-empty'><div>" +
        "<h3>Нет активного проекта</h3>" +
        "<p>Выберите проект из списка слева или создайте новый.</p>" +
        "<div style='margin-top:16px'><button class='projects-btn primary' id='projects-new-empty'>" + _ic.plus + " Создать проект</button></div>" +
        "</div></div>";
    }

    refreshProjects().catch(function (e) {
      nodes.content.innerHTML = "<div class='projects-card'>Ошибка загрузки Projects UI: " + esc(e.message || e) + "</div>";
    });

    return {
      refresh: refreshProjects,
      setTab: setTab,
      openCreateModal: openCreateModal,
    };
  }

  return {
    mount: mount,
  };
});
