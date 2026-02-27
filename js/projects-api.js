(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ProjectsApi = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  async function getAuthToken() {
    try {
      if (typeof firebase !== "undefined" && firebase.auth) {
        var user = firebase.auth().currentUser;
        if (user) return await user.getIdToken();
      }
    } catch (_) {}
    return "";
  }

  async function request(path, options) {
    var token = await getAuthToken();
    var opts = options || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (token) headers.Authorization = "Bearer " + token;
    var resp = await fetch(path, Object.assign({}, opts, { headers: headers }));
    var data = {};
    try {
      data = await resp.json();
    } catch (_) {}
    if (!resp.ok) {
      var err = new Error(data.error || ("Request failed (" + resp.status + ")"));
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function listProjects() {
    return request("/api/projects");
  }

  function createProject(payload) {
    return request("/api/projects", { method: "POST", body: JSON.stringify(payload || {}) });
  }

  function getProject(id) {
    return request("/api/projects/" + encodeURIComponent(id));
  }

  function updateProject(id, payload) {
    return request("/api/projects/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(payload || {}),
    });
  }

  function deleteProject(id) {
    return request("/api/projects/" + encodeURIComponent(id), { method: "DELETE" });
  }

  function listSources(projectId) {
    return request("/api/projects/" + encodeURIComponent(projectId) + "/sources");
  }

  function addSource(projectId, payload) {
    return request("/api/projects/" + encodeURIComponent(projectId) + "/sources", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  }

  function deleteSource(sourceId) {
    return request("/api/sources/" + encodeURIComponent(sourceId), { method: "DELETE" });
  }

  function listChats(projectId, query) {
    var params = new URLSearchParams();
    var q = (query && query.q) || "";
    var sort = (query && query.sort) || "newest";
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    var suffix = params.toString() ? ("?" + params.toString()) : "";
    return request("/api/projects/" + encodeURIComponent(projectId) + "/chats" + suffix);
  }

  function listMessages(chatId) {
    return request("/api/chats/" + encodeURIComponent(chatId) + "/messages");
  }

  return {
    request: request,
    listProjects: listProjects,
    createProject: createProject,
    getProject: getProject,
    updateProject: updateProject,
    deleteProject: deleteProject,
    listSources: listSources,
    addSource: addSource,
    deleteSource: deleteSource,
    listChats: listChats,
    listMessages: listMessages,
  };
});

