const test = require("node:test");
const assert = require("node:assert/strict");

const ProjectsApi = require("../../js/projects-api.js");

test("projects api: list/create/update use expected endpoints", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, projects: [], project: { id: "p1" } }),
    };
  };

  try {
    await ProjectsApi.listProjects();
    await ProjectsApi.createProject({ name: "A", botHost: "x.com" });
    await ProjectsApi.updateProject("p1", { name: "B" });
    await ProjectsApi.listSources("p1");
    await ProjectsApi.listChats("p1", { q: "abc", sort: "oldest" });
    await ProjectsApi.listMessages("c1");

    assert.equal(calls[0].url, "/api/projects");
    assert.equal(calls[1].url, "/api/projects");
    assert.equal(calls[1].opts.method, "POST");
    assert.equal(calls[2].url, "/api/projects/p1");
    assert.equal(calls[2].opts.method, "PATCH");
    assert.equal(calls[3].url, "/api/projects/p1/sources");
    assert.equal(calls[4].url, "/api/projects/p1/chats?q=abc&sort=oldest");
    assert.equal(calls[5].url, "/api/chats/c1/messages");
  } finally {
    global.fetch = originalFetch;
  }
});

