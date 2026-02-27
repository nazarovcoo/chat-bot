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
      ".projects-app{height:100vh;display:grid;grid-template-columns:300px 1fr;background:#fff;color:#111827;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}",
      ".projects-side{border-right:1px solid #e5e7eb;padding:14px;display:flex;flex-direction:column;gap:12px}",
      ".projects-brand{display:flex;align-items:center;gap:9px;padding:8px 10px}",
      ".projects-logo{width:28px;height:28px;border-radius:10px;background:#0b0f19;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}",
      ".projects-head{display:flex;align-items:center;justify-content:space-between;padding:0 10px}",
      ".projects-title{font-size:14px;font-weight:700;color:#6b7280}",
      ".projects-btn{border:1px solid #e5e7eb;background:#fff;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700;cursor:pointer}",
      ".projects-btn.primary{background:#0b0f19;color:#fff;border-color:#0b0f19}",
      ".projects-list{display:flex;flex-direction:column;gap:8px;padding:0 6px;overflow:auto}",
      ".project-row{border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;gap:10px}",
      ".project-row.active{background:#0b0f19;color:#fff;border-color:#0b0f19}",
      ".project-name{font-weight:800;font-size:13px}",
      ".project-sub{font-size:12px;color:#6b7280;margin-top:3px}",
      ".project-row.active .project-sub{color:#cbd5e1}",
      ".project-pill{font-size:11px;border:1px solid #e5e7eb;border-radius:999px;padding:5px 8px;background:#f3f4f6;height:fit-content}",
      ".project-row.active .project-pill{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.2);color:#fff}",
      ".projects-main{display:flex;flex-direction:column;min-width:0}",
      ".projects-top{border-bottom:1px solid #e5e7eb;padding:16px 18px;display:flex;justify-content:space-between;gap:12px}",
      ".projects-top h1{margin:0;font-size:18px;line-height:1.2}",
      ".projects-meta{font-size:12px;color:#6b7280;margin-top:4px}",
      ".projects-tabs{display:flex;gap:10px;padding:12px 18px;border-bottom:1px solid #e5e7eb}",
      ".projects-tab{border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:10px 13px;font-size:13px;font-weight:800;cursor:pointer}",
      ".projects-tab.active{background:#0b0f19;color:#fff;border-color:#0b0f19}",
      ".projects-content{padding:18px;overflow:auto;flex:1}",
      ".projects-empty{border:1px dashed #d1d5db;border-radius:20px;min-height:320px;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center}",
      ".projects-empty h3{margin:0;font-size:26px}",
      ".projects-empty p{margin:10px 0 0;color:#6b7280;line-height:1.45}",
      ".projects-card{border:1px solid #e5e7eb;border-radius:16px;padding:14px;background:#fff}",
      ".projects-grid{display:grid;gap:12px}",
      ".projects-list-items{display:flex;flex-direction:column;gap:10px;margin-top:12px}",
      ".projects-item{border:1px solid #e5e7eb;border-radius:14px;padding:12px;display:flex;justify-content:space-between;gap:12px}",
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
      ".projects-danger{border:1px solid #fecaca;background:#fff;color:#b91c1c}",
      "@media(max-width:980px){.projects-app{grid-template-columns:1fr}.projects-side{display:none}}",
    ].join("");
    document.head.appendChild(s);
  }

  function createState() {
    return {
      projects: [],
      activeProjectId: null,
      tab: "chats",
      chats: [],
      sources: [],
      q: "",
      sort: "newest",
    };
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
      btnTopSrc: root.querySelector("#projects-top-add-source"),
      btnTopChats: root.querySelector("#projects-top-open-chats"),
      modal: root.querySelector("#projects-create-modal"),
      modalClose: root.querySelector("#projects-create-close"),
      modalCancel: root.querySelector("#projects-create-cancel"),
      modalCreate: root.querySelector("#projects-create-submit"),
      createName: root.querySelector("#projects-create-name"),
      createHost: root.querySelector("#projects-create-host"),
      createKB: root.querySelector("#projects-create-kb"),
    };

    nodes.btnNew.addEventListener("click", openCreateModal);
    nodes.btnNew2.addEventListener("click", openCreateModal);
    nodes.modalClose.addEventListener("click", closeCreateModal);
    nodes.modalCancel.addEventListener("click", closeCreateModal);
    nodes.modal.addEventListener("click", function (e) {
      if (e.target === nodes.modal) closeCreateModal();
    });
    nodes.modalCreate.addEventListener("click", createProject);
    nodes.btnTopSrc.addEventListener("click", function () { setTab("sources"); });
    nodes.btnTopChats.addEventListener("click", function () { setTab("chats"); });
    nodes.tabs.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      setTab(btn.getAttribute("data-tab"));
    });

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

    function getActiveProject() {
      return state.projects.find(function (p) { return p.id === state.activeProjectId; }) || null;
    }

    function renderSidebar() {
      nodes.list.innerHTML = "";
      state.projects.forEach(function (p) {
        var el = document.createElement("div");
        el.className = "project-row" + (p.id === state.activeProjectId ? " active" : "");
        el.innerHTML = "<div><div class='project-name'>" + esc(p.name) + "</div><div class='project-sub'>" + esc(p.botHost || "—") + "</div></div>" +
          "<div class='project-pill'>" + (p.legacyDefault ? "default" : "project") + "</div>";
        el.addEventListener("click", function () {
          state.activeProjectId = p.id;
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
        nodes.btnTopSrc.style.display = "none";
        nodes.btnTopChats.style.display = "none";
        return;
      }
      nodes.title.textContent = p.name;
      nodes.meta.textContent = "IP/Домен: " + (p.botHost || "—");
      nodes.tabs.style.display = "flex";
      nodes.btnTopSrc.style.display = "inline-flex";
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
        await loadChats();
        return;
      }
      if (state.tab === "sources") {
        await loadSources();
        return;
      }
      await loadSettings();
    }

    async function loadChats() {
      var data = await ProjectsApi.listChats(state.activeProjectId, { q: state.q, sort: state.sort });
      state.chats = data.chats || [];
      if (!state.chats.length) {
        nodes.content.innerHTML = "<div class='projects-empty'><div><h3>Чатов пока нет</h3><p>Здесь будут реальные диалоги клиентов проекта.</p></div></div>";
        return;
      }
      nodes.content.innerHTML = "<div class='projects-card'><div class='projects-tools'>" +
        "<input id='projects-chat-q' placeholder='Поиск по чатам...' style='max-width:320px'>" +
        "<select id='projects-chat-sort' style='width:auto'><option value='newest'>Самый новый</option><option value='oldest'>Самый старый</option></select>" +
        "</div></div><div class='projects-list-items' id='projects-chat-list'></div>";
      var qInp = root.querySelector("#projects-chat-q");
      var sSel = root.querySelector("#projects-chat-sort");
      var list = root.querySelector("#projects-chat-list");
      qInp.value = state.q;
      sSel.value = state.sort;
      qInp.addEventListener("input", function () { state.q = qInp.value.trim(); loadChats(); });
      sSel.addEventListener("change", function () { state.sort = sSel.value; loadChats(); });
      list.innerHTML = state.chats.map(function (c) {
        var when = c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString("ru-RU") : "—";
        return "<div class='projects-item'><div><h4>" + esc(c.name || c.userExternalId || c.id) +
          "</h4><p>Последнее: " + esc(c.lastMessage || "") + "</p></div><div style='text-align:right'><div class='projects-status'>" +
          esc(when) + "</div></div></div>";
      }).join("");
    }

    async function loadSources() {
      var data = await ProjectsApi.listSources(state.activeProjectId);
      state.sources = data.sources || [];
      if (!state.sources.length) {
        nodes.content.innerHTML = "<div class='projects-empty'><div><h3>Дайте больше контекста</h3><p>Источники = база знаний проекта.</p>" +
          "<div style='margin-top:12px'><button class='projects-btn primary' id='projects-add-source-empty'>Добавить источник</button></div></div></div>";
        var be = root.querySelector("#projects-add-source-empty");
        if (be) be.addEventListener("click", openSourcePrompt);
        return;
      }
      nodes.content.innerHTML = "<div class='projects-tools'><button class='projects-btn primary' id='projects-add-source'>+ Добавить источник</button></div>" +
        "<div class='projects-list-items'>" + state.sources.map(function (s) {
          var d = s.createdAt ? new Date(s.createdAt).toLocaleDateString("ru-RU") : "—";
          return "<div class='projects-item'><div><h4>" + esc(s.title) + "</h4><p>" + esc(s.type) + " • " + esc(d) +
            "</p></div><div style='display:flex;flex-direction:column;gap:8px;align-items:flex-end'><div class='projects-status'>" + esc(s.status) +
            "</div><button class='projects-btn' data-del-source='" + esc(s.id) + "'>Удалить</button></div></div>";
        }).join("") + "</div>";
      var addBtn = root.querySelector("#projects-add-source");
      if (addBtn) addBtn.addEventListener("click", openSourcePrompt);
      root.querySelectorAll("[data-del-source]").forEach(function (b) {
        b.addEventListener("click", async function () {
          if (!confirm("Удалить источник?")) return;
          await ProjectsApi.deleteSource(b.getAttribute("data-del-source"));
          await loadSources();
          await refreshProjects();
        });
      });
    }

    async function loadSettings() {
      var p = getActiveProject();
      nodes.content.innerHTML = "<div class='projects-card'><div class='projects-form'>" +
        "<div><label>Название проекта</label><input id='projects-set-name' value='" + esc(p.name) + "'></div>" +
        "<div><label>IP / Домен</label><input id='projects-set-host' value='" + esc(p.botHost || "") + "'></div>" +
        "<div><label>Инструкции (system behavior)</label><textarea id='projects-set-inst'>" + esc(p.instructions || "") + "</textarea></div>" +
        "<div style='display:flex;gap:10px;flex-wrap:wrap'><button class='projects-btn primary' id='projects-save'>Сохранить</button>" +
        "<button class='projects-btn projects-danger' id='projects-del'>Удалить проект</button></div></div></div>";
      root.querySelector("#projects-save").addEventListener("click", async function () {
        await ProjectsApi.updateProject(state.activeProjectId, {
          name: root.querySelector("#projects-set-name").value.trim(),
          botHost: root.querySelector("#projects-set-host").value.trim(),
          instructions: root.querySelector("#projects-set-inst").value,
        });
        if (typeof showToast === "function") showToast("✅ Сохранено");
        await refreshProjects();
      });
      root.querySelector("#projects-del").addEventListener("click", async function () {
        if (!confirm("Удалить проект? Это действие нельзя отменить.")) return;
        await ProjectsApi.deleteProject(state.activeProjectId);
        state.activeProjectId = null;
        await refreshProjects();
      });
    }

    async function openSourcePrompt() {
      var type = prompt("Тип источника: file | url | text | document", "text");
      if (!type) return;
      var title = prompt("Название источника", "");
      if (!title) return;
      var contentRef = prompt("Содержимое / URL / путь", "");
      if (!contentRef) return;
      await ProjectsApi.addSource(state.activeProjectId, { type: type, title: title, contentRef: contentRef });
      await loadSources();
      await refreshProjects();
    }

    function openCreateModal() {
      nodes.modal.classList.add("open");
      nodes.createName.value = "";
      nodes.createHost.value = "";
      nodes.createKB.value = "skip";
      nodes.createName.focus();
    }

    function closeCreateModal() {
      nodes.modal.classList.remove("open");
    }

    async function createProject() {
      var name = nodes.createName.value.trim();
      var botHost = nodes.createHost.value.trim();
      if (name.length < 2) { alert("Введите название проекта"); return; }
      if (botHost.length < 3) { alert("Введите IP/домен"); return; }
      var created = await ProjectsApi.createProject({ name: name, botHost: botHost });
      state.activeProjectId = created.project.id;
      closeCreateModal();
      await refreshProjects();
      if (nodes.createKB.value === "add") {
        state.tab = "sources";
        await renderTab();
        await openSourcePrompt();
      } else {
        state.tab = "settings";
        await renderTab();
      }
    }

    function layout() {
      return "" +
        "<div class='projects-app'>" +
        "<aside class='projects-side'>" +
        "<div class='projects-brand'><div class='projects-logo'>CB</div><div><div style='font-weight:700;font-size:13px'>CreateBot AI</div><div style='font-size:12px;color:#6b7280'>Projects workspace</div></div></div>" +
        "<div class='projects-head'><div class='projects-title'>Проекты</div><button class='projects-btn' id='projects-new'>+ Новый проект</button></div>" +
        "<div class='projects-list' id='projects-list'></div>" +
        "</aside>" +
        "<main class='projects-main'>" +
        "<div class='projects-top'><div><h1 id='projects-active-title'>Выберите проект</h1><div class='projects-meta' id='projects-active-meta'>—</div></div>" +
        "<div class='projects-top-actions'><button class='projects-btn' id='projects-top-add-source' style='display:none'>Добавить источник</button>" +
        "<button class='projects-btn primary' id='projects-top-open-chats' style='display:none'>Открыть чаты</button></div></div>" +
        "<div class='projects-tabs' id='projects-tabs' style='display:none'>" +
        "<button class='projects-tab active' data-tab='chats'>Чаты</button>" +
        "<button class='projects-tab' data-tab='sources'>Источники</button>" +
        "<button class='projects-tab' data-tab='settings'>Настройки</button>" +
        "</div><div class='projects-content' id='projects-content'></div></main></div>" +
        "<div class='projects-modal-bg' id='projects-create-modal'><div class='projects-modal'>" +
        "<div class='projects-modal-h'><div style='font-size:16px;font-weight:900'>Создать проект</div><button class='projects-btn' id='projects-create-close'>✕</button></div>" +
        "<div class='projects-modal-b'><div class='projects-form'>" +
        "<div><label>Название проекта (имя бота)</label><input id='projects-create-name' placeholder='Например: CreateBot AI'></div>" +
        "<div><label>IP / Домен бота</label><input id='projects-create-host' placeholder='Например: bot.example.com'></div>" +
        "<div><label>База знаний</label><select id='projects-create-kb'><option value='skip'>Пропустить</option><option value='add'>Добавить сейчас</option></select></div>" +
        "</div></div><div class='projects-modal-f'><button class='projects-btn' id='projects-create-cancel'>Отмена</button>" +
        "<button class='projects-btn primary' id='projects-create-submit'>Создать проект</button></div></div></div>";
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

