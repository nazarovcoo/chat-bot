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
      ".projects-app{height:var(--app-height,100dvh);display:grid;grid-template-columns:260px 1fr;background:#f6f7fb;color:#0f172a;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}",
      ".projects-side{border-right:1px solid #e5e7eb;padding:10px 8px;display:flex;flex-direction:column;gap:0}",
      ".projects-brand{display:flex;align-items:center;gap:9px;padding:8px 10px;margin-bottom:6px}",
      ".projects-logo{width:28px;height:28px;border-radius:10px;background:#0b0f19;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}",
      ".projects-sec-hdr{display:flex;align-items:center;gap:5px;padding:4px 10px 6px;font-size:13px;color:#6b7280;font-weight:500}",
      ".projects-btn{border:1px solid #e5e7eb;background:#fff;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700;cursor:pointer}",
      ".projects-btn.primary{background:#0b0f19;color:#fff;border-color:#0b0f19}",
      ".projects-new-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;font-size:14px;color:#111827;background:none;border:none;width:100%;text-align:left;font-family:inherit;margin-bottom:2px}",
      ".projects-new-row:hover{background:#f3f4f6}",
      ".projects-list{display:flex;flex-direction:column;overflow:auto}",
      ".project-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;font-size:14px;color:#111827;background:none;border:none;width:100%;text-align:left;font-family:inherit;position:relative}",
      ".project-row:hover{background:#f3f4f6}",
      ".project-row.active{background:#efefef}",
      ".project-name{font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}",
      ".proj-menu-btn{background:none;border:none;cursor:pointer;padding:2px 5px;border-radius:6px;color:#6b7280;font-size:13px;letter-spacing:1px;line-height:1;opacity:0;flex-shrink:0;font-family:inherit}",
      ".project-row:hover .proj-menu-btn,.project-row.active .proj-menu-btn{opacity:1}",
      ".proj-menu-btn:hover{background:rgba(0,0,0,.08)}",
      ".proj-dropdown{position:fixed;min-width:210px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.13);padding:6px;z-index:99999}",
      ".proj-dd-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;font-size:14px;cursor:pointer;color:#111827;white-space:nowrap}",
      ".proj-dd-item:hover{background:#f3f4f6}",
      ".proj-dd-sep{height:1px;background:#e5e7eb;margin:4px 0}",
      ".proj-dd-danger{color:#dc2626}",
      ".proj-dd-danger:hover{background:#fef2f2}",
      ".del-confirm-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:999999;padding:20px}",
      ".del-confirm-modal{background:#fff;border-radius:20px;padding:24px 20px 20px;width:min(380px,100%);box-shadow:0 12px 48px rgba(0,0,0,.22)}",
      ".del-confirm-title{font-size:19px;font-weight:700;margin:0 0 10px;color:#111827}",
      ".del-confirm-body{font-size:14px;color:#374151;line-height:1.55;margin:0 0 20px}",
      ".del-confirm-btns{display:flex;justify-content:flex-end;gap:10px}",
      ".del-cancel-btn{background:#fff;border:1px solid #e5e7eb;border-radius:999px;padding:10px 20px;font-size:14px;cursor:pointer;font-weight:600;font-family:inherit}",
      ".del-cancel-btn:hover{background:#f3f4f6}",
      ".del-ok-btn{background:#dc2626;color:#fff;border:none;border-radius:999px;padding:10px 20px;font-size:14px;cursor:pointer;font-weight:700;font-family:inherit}",
      ".del-ok-btn:hover{background:#b91c1c}",
      ".projects-main{display:flex;flex-direction:column;min-width:0;padding:14px;gap:12px;overflow:hidden}",
      ".projects-top{border:1px solid #e6e8ef;border-radius:22px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.06);padding:14px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}",
      ".projects-top h1{margin:0;font-size:16px;line-height:1.2;letter-spacing:.2px}",
      ".projects-meta{font-size:12px;color:#64748b;margin-top:4px}",
      ".projects-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:0}",
      ".projects-tab{height:44px;border:1px solid #e6e8ef;background:#fff;border-radius:999px;padding:0 14px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center}",
      ".projects-tab.active{background:#0f172a;color:#fff;border-color:transparent}",
      ".projects-content{overflow:auto;flex:1;padding:0}",
      ".projects-empty{border:1px dashed #d1d5db;border-radius:20px;min-height:320px;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center}",
      ".projects-empty h3{margin:0;font-size:26px}",
      ".projects-empty p{margin:10px 0 0;color:#6b7280;line-height:1.45}",
      ".projects-card{border:1px solid #e6e8ef;border-radius:22px;padding:14px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.06)}",
      ".cardHead{padding:0 0 12px;border-bottom:1px solid #e6e8ef;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}",
      ".cardHead h2{margin:0;font-size:14px;letter-spacing:.2px}",
      ".muted{color:#64748b;font-size:12px}",
      ".search{flex:1;min-width:200px;height:44px;border-radius:14px;border:1px solid #e6e8ef;background:transparent;padding:0 12px;color:#0f172a;outline:none;font-size:14px}",
      ".select{height:44px;border-radius:14px;border:1px solid #e6e8ef;background:transparent;padding:0 12px;color:#0f172a;outline:none;font-weight:600}",
      ".projects-grid{display:grid;gap:12px}",
      ".projects-list-items{display:flex;flex-direction:column;gap:10px;margin-top:12px}",
      ".projects-virtual{position:relative;height:560px;overflow:auto;border:1px solid #e5e7eb;border-radius:14px;background:#fff}",
      ".projects-virtual-spacer{position:relative;width:100%}",
      ".projects-load-more{margin-top:10px;display:flex;justify-content:center}",
      ".projects-item{border:1px solid #e6e8ef;border-radius:18px;padding:12px;display:flex;justify-content:space-between;gap:12px}",
      ".projects-item h4{margin:0;font-size:14px}",
      ".projects-item p{margin:4px 0 0;font-size:12px;color:#6b7280}",
      ".projects-status{border:1px solid #e5e7eb;border-radius:999px;padding:5px 9px;font-size:11px;background:#f9fafb}",
      ".projects-form{display:grid;gap:10px;max-width:760px}",
      ".projects-form label{font-size:12px;color:#6b7280;font-weight:700}",
      ".projects-form input,.projects-form textarea,.projects-form select{width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:11px 12px;font-size:14px}",
      ".projects-form textarea{min-height:160px;resize:vertical}",
      ".projects-modal-bg{position:fixed;inset:0;background:rgba(17,24,39,.45);display:none;align-items:center;justify-content:center;z-index:9999;padding:18px}",
      ".projects-modal-bg.open{display:flex}",
      ".projects-modal{width:min(640px,100%);border:1px solid #e5e7eb;border-radius:18px;background:#fff;overflow:hidden}",
      ".projects-modal-h{padding:14px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}",
      ".projects-modal-b{padding:16px}",
      ".projects-modal-f{padding:14px 16px;border-top:1px solid #e5e7eb;background:#f9fafb;display:flex;justify-content:flex-end;gap:10px}",
      ".projects-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px}",
      ".projects-top-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
      ".projects-chat-grid{display:grid;grid-template-columns:1fr 340px;gap:14px}",
      ".projects-status-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      ".projects-kpi{border:1px solid #e6e8ef;border-radius:16px;background:#f1f5f9;padding:10px;min-height:72px;display:flex;flex-direction:column;justify-content:space-between}",
      ".projects-kpi-k{font-size:12px;color:#64748b;font-weight:700}",
      ".projects-kpi-v{font-size:18px;font-weight:900}",
      ".projects-hint{padding-top:12px;margin-top:12px;border-top:1px solid #e6e8ef;color:#64748b;font-size:13px;line-height:1.35}",
      ".projects-bottom-bar{position:sticky;bottom:0;margin-top:12px;padding:10px;background:rgba(246,247,251,.92);backdrop-filter:blur(8px);border:1px solid #e6e8ef;border-radius:18px;display:none;gap:10px}",
      ".projects-bottom-bar .projects-btn{flex:1;justify-content:center}",
      ".projects-danger{border:1px solid #fecaca;background:#fff;color:#b91c1c}",
      // Source modal styles
      ".src-modal-bg{position:fixed;inset:0;background:rgba(17,24,39,.45);display:none;align-items:center;justify-content:center;z-index:9999;padding:18px}",
      ".src-modal-bg.open{display:flex}",
      ".src-modal{width:min(540px,100%);border:1px solid #e5e7eb;border-radius:18px;background:#fff;overflow:hidden}",
      ".src-modal-h{padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:8px}",
      ".src-back-btn{background:none;border:none;cursor:pointer;font-size:18px;color:#6b7280;padding:4px 8px;border-radius:8px;line-height:1}",
      ".src-back-btn:hover{background:#f3f4f6}",
      ".src-modal-title{font-size:16px;font-weight:900;flex:1}",
      ".src-close-btn{background:none;border:none;cursor:pointer;font-size:18px;color:#6b7280;padding:4px 8px;border-radius:8px;line-height:1}",
      ".src-close-btn:hover{background:#f3f4f6}",
      ".src-modal-b{padding:18px;display:flex;flex-direction:column;gap:14px}",
      ".src-modal-f{padding:14px 18px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:10px}",
      ".src-drop-zone{border:1.5px dashed #d1d5db;border-radius:14px;min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;transition:border-color .15s,background .15s;user-select:none}",
      ".src-drop-zone:hover,.src-drop-zone.drag-over{border-color:#0b0f19;background:#f8fafc}",
      ".src-drop-icon{display:flex;align-items:center;justify-content:center;margin-bottom:2px}",
      ".src-drop-text{font-size:14px;color:#9ca3af;text-align:center;padding:0 16px}",
      ".src-type-btns{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}",
      ".src-type-btn{border:1px solid #e5e7eb;border-radius:14px;padding:16px 10px;text-align:center;cursor:pointer;background:#f9fafb;transition:border-color .15s,background .15s}",
      ".src-type-btn:hover{border-color:#0b0f19;background:#fff}",
      ".src-type-icon{display:flex;align-items:center;justify-content:center;margin-bottom:8px}",
      ".src-type-label{font-size:13px;font-weight:700;color:#111827}",
      "@media(max-width:980px){.projects-app{grid-template-columns:1fr}.projects-side{display:none}.projects-chat-grid{grid-template-columns:1fr}.projects-bottom-bar{display:flex}}",
    ].join("");
    document.head.appendChild(s);
  }

  function createState() {
    return {
      projects: [],
      activeProjectId: null,
      tab: "chats",
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
      sort: "newest",
      sourcesType: "",
      createRequestId: null,
      createInFlight: false,
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
    try { data = await resp.json(); } catch (_) {}
    return { ok: resp.ok, status: resp.status, data: data || {} };
  }

  function mount(root, opts) {
    if (!ProjectsApi) throw new Error("ProjectsApi is required");
    ensureStyles();
    var state = createState();
    var options = opts || {};
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
      // Source modal
      srcModal: root.querySelector("#projects-source-modal"),
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

    nodes.btnNew.addEventListener("click", openCreateModal);
    if (nodes.btnNew2) nodes.btnNew2.addEventListener("click", openCreateModal);
    nodes.modalClose.addEventListener("click", closeCreateModal);
    nodes.modalCancel.addEventListener("click", closeCreateModal);
    nodes.modal.addEventListener("click", function (e) {
      if (e.target === nodes.modal) closeCreateModal();
    });
    nodes.modalCreate.addEventListener("click", createProject);
    nodes.btnTopChats.addEventListener("click", function () {
      var p = getActiveProject();
      var host = String((p && p.botHost) || "").trim();
      if (host.startsWith("@")) {
        window.open("https://t.me/" + encodeURIComponent(host.replace(/^@/, "")), "_blank");
      } else {
        setTab("chats");
      }
    });
    nodes.tabs.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      setTab(btn.getAttribute("data-tab"));
    });

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

    // Main drop zone → go to file view
    nodes.srcDropZone.addEventListener("click", function () { showSrcView("file"); });
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
      if (nodes.srcFileInp.files && nodes.srcFileInp.files[0]) setPickedFile(nodes.srcFileInp.files[0]);
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
      nodes.srcTextOk.textContent = "Добавляю…";
      try {
        await ProjectsApi.addSource(state.activeProjectId, { type: "text", title: title, contentRef: body });
        closeSourceModal();
        await loadSources(false);
        await refreshProjects();
      } catch (e) {
        alert("Ошибка: " + (e.message || e));
      } finally {
        nodes.srcTextOk.disabled = false;
        nodes.srcTextOk.textContent = "Добавить";
      }
    });

    nodes.srcUrlOk.addEventListener("click", async function () {
      var title = nodes.srcUrlTitle.value.trim();
      var href = nodes.srcUrlHref.value.trim();
      if (!href) { nodes.srcUrlHref.focus(); return; }
      if (!title) title = href;
      nodes.srcUrlOk.disabled = true;
      nodes.srcUrlOk.textContent = "Добавляю…";
      try {
        await ProjectsApi.addSource(state.activeProjectId, { type: "url", title: title, contentRef: href });
        closeSourceModal();
        await loadSources(false);
        await refreshProjects();
      } catch (e) {
        alert("Ошибка: " + (e.message || e));
      } finally {
        nodes.srcUrlOk.disabled = false;
        nodes.srcUrlOk.textContent = "Добавить";
      }
    });

    nodes.srcFileOk.addEventListener("click", async function () {
      if (!_srcFile) { nodes.srcFileInp.click(); return; }
      nodes.srcFileOk.disabled = true;
      nodes.srcFileOk.textContent = "Загружаю…";
      try {
        var text = await readFileAsText(_srcFile);
        await ProjectsApi.addSource(state.activeProjectId, { type: "file", title: _srcFile.name, contentRef: text });
        closeSourceModal();
        await loadSources(false);
        await refreshProjects();
      } catch (e) {
        alert("Ошибка: " + (e.message || e));
      } finally {
        nodes.srcFileOk.disabled = false;
        nodes.srcFileOk.textContent = "Загрузить";
      }
    });

    function _loadScript(url) {
      return new Promise(function (resolve, reject) {
        if (document.querySelector('script[src="' + url + '"]')) { resolve(); return; }
        var s = document.createElement("script");
        s.src = url; s.onload = resolve; s.onerror = reject;
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
        reader.onerror = function () { reject(new Error("Не удалось прочитать файл")); };
        reader.readAsText(file);
      });
    }

    function openSourceModal() {
      _srcFile = null;
      nodes.srcTextTitle.value = "";
      nodes.srcTextBody.value = "";
      nodes.srcUrlTitle.value = "";
      nodes.srcUrlHref.value = "";
      nodes.srcFileInp.value = "";
      nodes.srcFileLbl.textContent = "Выберите или перетащите файл (.txt, .md, .csv, .pdf, .docx, .pptx)";
      showSrcView("main");
      nodes.srcModal.classList.add("open");
    }

    function closeSourceModal() {
      nodes.srcModal.classList.remove("open");
    }

    function showSrcView(view) {
      nodes.srcViewMain.style.display = view === "main" ? "" : "none";
      nodes.srcViewText.style.display = view === "text" ? "" : "none";
      nodes.srcViewUrl.style.display = view === "url" ? "" : "none";
      nodes.srcViewFile.style.display = view === "file" ? "" : "none";
      nodes.srcBack.style.display = view === "main" ? "none" : "";
      nodes.srcTitle.textContent =
        view === "main" ? "Добавить источник" :
        view === "text" ? "Вручную" :
        view === "url" ? "По ссылке" : "Загрузить файл";
    }

    async function refreshProjects() {
      var data = await ProjectsApi.listProjects();
      state.projects = data.projects || [];
      if (!state.activeProjectId && state.projects.length > 0) state.activeProjectId = state.projects[0].id;
      if (state.activeProjectId && !state.projects.some(function (p) { return p.id === state.activeProjectId; })) {
        state.activeProjectId = state.projects[0] ? state.projects[0].id : null;
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
      if (!user || !user.uid) throw new Error("Сначала авторизуйтесь");
      var uid = user.uid;

      var verify = await postJSON("/api/verify-telegram-token", { token: token });
      if (!verify.ok || !verify.data || !verify.data.ok) {
        throw new Error((verify.data && verify.data.error) || "Невалидный Telegram токен");
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

      return { botId: botRef.id, username: username };
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
      document.body.appendChild(dd);
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
        notify("Скопировано: " + link);
      } catch (_) {
        notify("Ссылка: " + link);
      }
    }

    async function doRenameProject(p) {
      var newName = prompt("Новое название:", p.name);
      if (!newName || !newName.trim() || newName.trim() === p.name) return;
      await ProjectsApi.updateProject(p.id, { name: newName.trim() });
      notify("Переименовано");
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

    async function doDeleteProject(p) {
      var confirmed = await showDeleteConfirm(p.name);
      if (!confirmed) return;
      await ProjectsApi.deleteProject(p.id);
      if (p.id === state.activeProjectId) state.activeProjectId = null;
      await refreshProjects();
    }

    function renderSidebar() {
      nodes.list.innerHTML = "";
      state.projects.forEach(function (p) {
        var el = document.createElement("button");
        el.className = "project-row" + (p.id === state.activeProjectId ? " active" : "");
        el.innerHTML = _icFolder +
          "<span class='project-name'>" + esc(p.name) + "</span>" +
          "<span class='proj-menu-btn' title='Настройки проекта'>•••</span>";
        var menuBtn = el.querySelector(".proj-menu-btn");
        menuBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openProjectMenu(p.id, menuBtn);
        });
        el.addEventListener("click", function () {
          state.activeProjectId = p.id;
          state.chats = [];
          state.sources = [];
          state.chatsCursor = null;
          state.sourcesCursor = null;
          state.chatsQuery = "";
          state.sourcesQuery = "";
          state.sort = "newest";
          state.sourcesType = "";
          state.chatsLoadedProjectId = null;
          state.sourcesLoadedProjectId = null;
          renderSidebar();
          renderHeader();
          renderTab();
        });
        nodes.list.appendChild(el);
      });
    }

    function renderHeader() {
      var p = getActiveProject();
      if (!p) {
        nodes.title.textContent = "Выберите проект";
        nodes.meta.textContent = "—";
        nodes.tabs.style.display = "none";
        nodes.btnTopChats.style.display = "none";
        return;
      }
      nodes.title.textContent = p.name;
      var sourcesCount = Number(p.sourcesCount || 0);
      var chatsCount = Number(p.chatsCount || 0);
      nodes.meta.textContent = "IP/Домен: " + (p.botHost || "—") + " • Источники: " + sourcesCount + " • Чаты: " + chatsCount;
      nodes.tabs.style.display = "flex";
      nodes.btnTopChats.style.display = "inline-flex";
      nodes.tabs.querySelectorAll(".projects-tab").forEach(function (t) {
        t.classList.toggle("active", t.getAttribute("data-tab") === state.tab);
      });
    }

    function setTab(tab) {
      state.tab = tab;
      renderHeader();
      renderTab();
    }

    async function renderTab() {
      if (!state.activeProjectId) {
        nodes.content.innerHTML = emptyHtml();
        var b = root.querySelector("#projects-new-empty");
        if (b) b.addEventListener("click", openCreateModal);
        return;
      }
      if (state.tab === "chats") {
        if (state.chatsLoadedProjectId === state.activeProjectId) {
          renderChatsView();
          loadChats(false, { silent: true });
          return;
        }
        nodes.content.innerHTML = "<div class='projects-card'>Загрузка чатов…</div>";
        await loadChats(false);
        return;
      }
      if (state.tab === "sources") {
        if (state.sourcesLoadedProjectId === state.activeProjectId) {
          renderSourcesView();
          loadSources(false, { silent: true });
          return;
        }
        nodes.content.innerHTML = "<div class='projects-card'>Загрузка источников…</div>";
        await loadSources(false);
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
      nodes.content.innerHTML = "" +
        "<div class='projects-chat-grid'>" +
        "<div class='projects-card'>" +
        "<div class='cardHead'><h2>Chats</h2><span class='muted'>Today: " + esc(String(chatsCount)) + " messages</span></div>" +
        "<div class='projects-tools'>" +
        "<input id='projects-chat-q' placeholder='Search chats…' style='max-width:320px' class='search'>" +
        "<select id='projects-chat-sort' style='width:auto' class='select'><option value='newest'>Most recent</option><option value='oldest'>Oldest</option></select>" +
        "</div>" +
        "<div class='projects-virtual' id='projects-chat-virtual'><div class='projects-virtual-spacer' id='projects-chat-list'></div></div>" +
        "<div class='projects-load-more'><button class='projects-btn' id='projects-chat-more' " + (state.chatsHasMore ? "" : "style='display:none'") + ">Show more</button></div>" +
        "</div>" +
        "<div class='projects-card'>" +
        "<div class='cardHead'><h2>Status</h2><span class='muted'>Realtime</span></div>" +
        "<div class='projects-status-grid'>" +
        "<div class='projects-kpi'><div class='projects-kpi-k'>Chats</div><div class='projects-kpi-v'>" + esc(String(chatsCount)) + "</div></div>" +
        "<div class='projects-kpi'><div class='projects-kpi-k'>Sources</div><div class='projects-kpi-v'>" + esc(String(sourcesCount)) + "</div></div>" +
        "<div class='projects-kpi'><div class='projects-kpi-k'>Knowledge Base</div><div class='projects-kpi-v'>" + (sourcesCount > 0 ? "Ready" : "Empty") + "</div></div>" +
        "<div class='projects-kpi'><div class='projects-kpi-k'>Telegram</div><div class='projects-kpi-v' style='color:#16a34a'>Connected</div></div>" +
        "</div>" +
        "<div class='projects-hint'>1) Press <b>Add Knowledge</b> to upload PDF / link / text.<br>2) Open your bot and test with <b>/start</b>.<br>3) Check analytics after first 10 chats.</div>" +
        "</div>" +
        "</div>" +
        "<div class='projects-bottom-bar'><button class='projects-btn primary' id='projects-bottom-add'>Add Knowledge</button><button class='projects-btn' id='projects-bottom-open'>Open Bot</button></div>";
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
        return "<div class='projects-item'><div><h4>" + esc(c.name || c.userExternalId || c.id) +
          "</h4><p>Последнее: " + esc(c.lastMessage || "") + "</p></div><div style='text-align:right'><div class='projects-status'>" +
          esc(when) + "</div></div></div>";
      }, 88);
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
      if (!state.sources.length) {
        nodes.content.innerHTML = "<div class='projects-empty'><div><h3>Дайте больше контекста</h3><p>Источники = база знаний проекта.</p>" +
          "<div style='margin-top:12px'><button class='projects-btn primary' id='projects-add-source-empty'>Добавить источник</button></div></div></div>";
        var be = root.querySelector("#projects-add-source-empty");
        if (be) be.addEventListener("click", openSourceModal);
        return;
      }
      nodes.content.innerHTML = "<div class='projects-tools'><button class='projects-btn primary' id='projects-add-source'>+ Добавить источник</button>" +
        "<input id='projects-sources-q' placeholder='Поиск по источникам...' style='max-width:280px'>" +
        "<select id='projects-sources-type' style='width:auto'><option value=''>Все</option><option value='file'>file</option><option value='url'>url</option><option value='text'>text</option><option value='document'>document</option></select></div>" +
        "<div class='projects-virtual' id='projects-sources-virtual'><div class='projects-virtual-spacer' id='projects-sources-list'></div></div>" +
        "<div class='projects-load-more'><button class='projects-btn' id='projects-sources-more' " + (state.sourcesHasMore ? "" : "style='display:none'") + ">Показать ещё</button></div>";
      var addBtn = root.querySelector("#projects-add-source");
      if (addBtn) addBtn.addEventListener("click", openSourceModal);
      var qInp = root.querySelector("#projects-sources-q");
      var tSel = root.querySelector("#projects-sources-type");
      var list = root.querySelector("#projects-sources-list");
      var vbox = root.querySelector("#projects-sources-virtual");
      var more = root.querySelector("#projects-sources-more");
      qInp.value = state.sourcesQuery;
      tSel.value = state.sourcesType || "";
      var debouncedSourcesSearch = debounce(function () {
        state.sourcesCursor = null;
        state.sourcesLoadedProjectId = null;
        loadSources(false);
      }, 260);
      qInp.addEventListener("input", function () {
        state.sourcesQuery = qInp.value.trim();
        debouncedSourcesSearch();
      });
      tSel.addEventListener("change", function () {
        state.sourcesType = tSel.value;
        state.sourcesCursor = null;
        state.sourcesLoadedProjectId = null;
        loadSources(false);
      });
      if (more) more.addEventListener("click", function () { loadSources(true); });
      renderVirtualRows(vbox, list, state.sources, function (s) {
        var d = s.createdAt ? new Date(s.createdAt).toLocaleDateString("ru-RU") : "—";
        return "<div class='projects-item'><div><h4>" + esc(s.title) + "</h4><p>" + esc(s.type) + " • " + esc(d) +
          "</p></div><div style='display:flex;flex-direction:column;gap:8px;align-items:flex-end'><div class='projects-status'>" + esc(s.status) +
          "</div><button class='projects-btn' data-del-source='" + esc(s.id) + "'>Удалить</button></div></div>";
      }, 92);
      vbox.onclick = async function (evt) {
        var btn = evt.target && evt.target.closest ? evt.target.closest("[data-del-source]") : null;
        if (!btn) return;
        if (!confirm("Удалить источник?")) return;
        await ProjectsApi.deleteSource(btn.getAttribute("data-del-source"));
        state.sourcesCursor = null;
        state.sourcesLoadedProjectId = null;
        await loadSources(false);
        await refreshProjects();
      };
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

    function renderVirtualRows(viewport, spacer, rows, rowRenderer, rowHeight) {
      if (!viewport || !spacer) return;
      var h = rowHeight || 90;
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
      viewport.onscroll = paint;
      paint();
    }

    async function loadSettings() {
      var p = getActiveProject();
      nodes.content.innerHTML = "<div class='projects-card'><div class='projects-form'>" +
        "<div><label>Название проекта</label><input id='projects-set-name' value='" + esc(p.name) + "'></div>" +
        "<div><label>IP / Домен / Telegram API token</label><input id='projects-set-host' value='" + esc(p.botHost || "") + "'></div>" +
        "<div><label>Инструкции (system behavior)</label><textarea id='projects-set-inst'>" + esc(p.instructions || "") + "</textarea></div>" +
        "<div style='display:flex;gap:10px;flex-wrap:wrap'><button class='projects-btn primary' id='projects-save'>Сохранить</button>" +
        "<button class='projects-btn projects-danger' id='projects-del'>Удалить проект</button></div></div></div>";
      root.querySelector("#projects-save").addEventListener("click", async function () {
        var hostInput = root.querySelector("#projects-set-host").value.trim();
        var isToken = isTelegramToken(hostInput);
        var safeHost = isToken ? (p.botHost || "@pending_connect") : hostInput;
        await ProjectsApi.updateProject(state.activeProjectId, {
          name: root.querySelector("#projects-set-name").value.trim(),
          botHost: safeHost,
          instructions: root.querySelector("#projects-set-inst").value,
        });
        if (isToken) {
          try {
            var linked = await connectTelegramToken(hostInput, state.activeProjectId, root.querySelector("#projects-set-name").value.trim());
            notify("Telegram подключён" + (linked && linked.username ? (": " + linked.username) : ""));
          } catch (e) {
            notify(e.message || "Не удалось подключить Telegram", true);
          }
        } else {
          notify("Сохранено");
        }
        await refreshProjects();
      });
      root.querySelector("#projects-del").addEventListener("click", async function () {
        var confirmed = await showDeleteConfirm(p.name);
        if (!confirmed) return;
        await ProjectsApi.deleteProject(state.activeProjectId);
        state.activeProjectId = null;
        await refreshProjects();
      });
    }

    function openCreateModal() {
      nodes.modal.classList.add("open");
      nodes.createName.value = "";
      nodes.createHost.value = "";
      nodes.createKB.value = "skip";
      state.createRequestId = makeRequestId();
      state.createInFlight = false;
      nodes.modalCreate.disabled = false;
      nodes.modalCreate.textContent = "Создать проект";
      nodes.createName.focus();
    }

    function closeCreateModal() {
      nodes.modal.classList.remove("open");
      state.createInFlight = false;
      nodes.modalCreate.disabled = false;
      nodes.modalCreate.textContent = "Создать проект";
      state.createRequestId = null;
    }

    async function createProject() {
      if (state.createInFlight) return;
      var name = nodes.createName.value.trim();
      var botHost = nodes.createHost.value.trim();
      if (name.length < 2) { alert("Введите название проекта"); return; }
      if (botHost.length < 3) { alert("Введите IP/домен"); return; }
      if (!state.createRequestId) state.createRequestId = makeRequestId();
      state.createInFlight = true;
      nodes.modalCreate.disabled = true;
      nodes.modalCreate.textContent = "Создаю...";
      try {
        var hostLooksLikeToken = isTelegramToken(botHost);
        var created = await ProjectsApi.createProject({
          name: name,
          botHost: hostLooksLikeToken ? "@pending_connect" : botHost,
          requestId: state.createRequestId,
        });
        state.activeProjectId = created.project.id;
        if (hostLooksLikeToken) {
          try {
            var linked = await connectTelegramToken(botHost, created.project.id, name);
            if (linked && linked.username) {
              await ProjectsApi.updateProject(created.project.id, { botHost: linked.username });
            }
            notify("Telegram подключён" + (linked && linked.username ? (": " + linked.username) : ""));
          } catch (e) {
            notify("Проект создан, но Telegram не подключён: " + (e.message || "ошибка"), true);
          }
        }
        closeCreateModal();
        await refreshProjects();
        if (nodes.createKB.value === "add") {
          state.tab = "sources";
          await renderTab();
          openSourceModal();
        } else {
          state.tab = "settings";
          await renderTab();
        }
      } catch (e) {
        notify(e.message || "Не удалось создать проект. Повторите попытку.", true);
      } finally {
        state.createInFlight = false;
        if (nodes.modal.classList.contains("open")) {
          nodes.modalCreate.disabled = false;
          nodes.modalCreate.textContent = "Создать проект";
        }
      }
    }

    function layout() {
      return "" +
        "<div class='projects-app'>" +
        "<aside class='projects-side'>" +
        "<div class='projects-brand'><div class='projects-logo'>CB</div><div><div style='font-weight:700;font-size:13px'>CreateBot AI</div><div style='font-size:12px;color:#6b7280'>Projects workspace</div></div></div>" +
        "<div class='projects-sec-hdr'>Проекты <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round'><polyline points='6 9 12 15 18 9'/></svg></div>" +
        "<button class='projects-new-row' id='projects-new'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0;opacity:.55'><path d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'/><line x1='12' y1='11' x2='12' y2='17'/><line x1='9' y1='14' x2='15' y2='14'/></svg>Новый проект</button>" +
        "<div class='projects-list' id='projects-list'></div>" +
        "</aside>" +
        "<main class='projects-main'>" +
        "<div class='projects-top'><div><h1 id='projects-active-title'>Выберите проект</h1><div class='projects-meta' id='projects-active-meta'>—</div></div>" +
        "<div class='projects-top-actions'><button class='projects-btn' id='projects-top-open-chats' style='display:none'>Open Bot</button></div></div>" +
        "<div class='projects-tabs' id='projects-tabs' style='display:none'>" +
        "<button class='projects-tab active' data-tab='chats'>Chats</button>" +
        "<button class='projects-tab' data-tab='sources'>Sources</button>" +
        "<button class='projects-tab' data-tab='settings'>Settings</button>" +
        "</div><div class='projects-content' id='projects-content'></div></main></div>" +
        // Create project modal
        "<div class='projects-modal-bg' id='projects-create-modal'><div class='projects-modal'>" +
        "<div class='projects-modal-h'><div style='font-size:16px;font-weight:900'>Создать проект</div><button class='projects-btn' id='projects-create-close'>✕</button></div>" +
        "<div class='projects-modal-b'><div class='projects-form'>" +
        "<div><label>Название проекта (имя бота)</label><input id='projects-create-name' placeholder='Например: CreateBot AI'></div>" +
        "<div><label>IP / Домен бота</label><input id='projects-create-host' placeholder='Например: bot.example.com'></div>" +
        "<div><label>База знаний</label><select id='projects-create-kb'><option value='skip'>Пропустить</option><option value='add'>Добавить сейчас</option></select></div>" +
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
        "<div class='src-drop-zone' id='src-drop-zone'>" +
        "<div class='src-drop-icon'><svg width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='#9ca3af' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='12' y1='11' x2='12' y2='17'/><line x1='9' y1='14' x2='15' y2='14'/></svg></div>" +
        "<div class='src-drop-text'>Перетащите файл сюда</div>" +
        "</div>" +
        "<div class='src-type-btns'>" +
        "<div class='src-type-btn' id='src-pick-file'><div class='src-type-icon'><svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='#374151' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' y1='3' x2='12' y2='15'/></svg></div><div class='src-type-label'>Загрузить</div></div>" +
        "<div class='src-type-btn' id='src-pick-text'><div class='src-type-icon'><svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='#374151' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='3'/><line x1='7' y1='9' x2='17' y2='9'/><line x1='7' y1='13' x2='17' y2='13'/><line x1='7' y1='17' x2='13' y2='17'/></svg></div><div class='src-type-label'>Ввод текста</div></div>" +
        "<div class='src-type-btn' id='src-pick-url'><div class='src-type-icon'><svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='#374151' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/><path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/></svg></div><div class='src-type-label'>По ссылке</div></div>" +
        "</div>" +
        "</div>" +
        // Text sub-view
        "<div id='src-view-text' style='display:none'>" +
        "<div class='src-modal-b'><div class='projects-form'>" +
        "<div><label>Название</label><input id='src-text-title' placeholder='Например: Частые вопросы'></div>" +
        "<div><label>Текст</label><textarea id='src-text-body' placeholder='Вставьте текст базы знаний...' style='min-height:140px'></textarea></div>" +
        "</div></div>" +
        "<div class='src-modal-f'><button class='projects-btn' id='src-text-cancel'>Отмена</button><button class='projects-btn primary' id='src-text-ok'>Добавить</button></div>" +
        "</div>" +
        // URL sub-view
        "<div id='src-view-url' style='display:none'>" +
        "<div class='src-modal-b'><div class='projects-form'>" +
        "<div><label>Название</label><input id='src-url-title' placeholder='Например: Официальный сайт'></div>" +
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

    function emptyHtml() {
      return "<div class='projects-empty'><div><h3>Нет активного проекта</h3><p>Слева выберите проект или создайте новый.</p>" +
        "<div style='margin-top:12px'><button class='projects-btn primary' id='projects-new-empty'>+ Создать проект</button></div></div></div>";
    }

    refreshProjects().catch(function (e) {
      nodes.content.innerHTML = "<div class='projects-card'>Ошибка загрузки Projects UI: " + esc(e.message || e) + "</div>";
    });

    return {
      refresh: refreshProjects,
      setTab: setTab,
    };
  }

  return {
    mount: mount,
  };
});
