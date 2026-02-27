(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ProjectsApi = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var _cache = new Map();
  var CACHE_TTL_MS = 45000;

  function _cacheKey(path, options) {
    var method = (options && options.method) || "GET";
    return method + ":" + path;
  }

  function _readCache(key) {
    var rec = _cache.get(key);
    if (!rec) return null;
    if (Date.now() > rec.expiresAt) {
      _cache.delete(key);
      return null;
    }
    return rec.value;
  }

  function _writeCache(key, val) {
    _cache.set(key, { value: val, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  function _invalidateCacheByPrefix(prefix) {
    Array.from(_cache.keys()).forEach(function (k) {
      if (k.indexOf(prefix) !== -1) _cache.delete(k);
    });
  }

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
    var opts = options || {};
    var method = (opts.method || "GET").toUpperCase();
    var key = _cacheKey(path, opts);
    if (method === "GET") {
      var c = _readCache(key);
      if (c) return c;
    }

    var token = await getAuthToken();
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
    if (method === "GET") _writeCache(key, data);
    if (method !== "GET") _invalidateCacheByPrefix("/api/projects");
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

  function listSources(projectId, query) {
    var params = new URLSearchParams();
    var q = (query && query.q) || "";
    var type = (query && query.type) || "";
    var limit = (query && query.limit) || "";
    var cursor = (query && query.cursor) || "";
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));
    var suffix = params.toString() ? ("?" + params.toString()) : "";
    return request("/api/projects/" + encodeURIComponent(projectId) + "/sources" + suffix);
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
    var limit = (query && query.limit) || "";
    var cursor = (query && query.cursor) || "";
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));
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
