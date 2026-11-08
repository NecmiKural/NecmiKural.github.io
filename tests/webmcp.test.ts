// The WebMCP tools (scripts/webmcp.ts): what they answer, from the real content file.
//   node --test tests/webmcp.test.ts   (part of npm run check)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isSite, SITE, type Portfolio } from "../scripts/render.ts";
import { webmcpTools } from "../scripts/webmcp.ts";

const data: Portfolio = JSON.parse(readFileSync("content/portfolio.json", "utf8"));
const tools = webmcpTools(data);
const run = (name: string, input?: Record<string, unknown>) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.execute(input) as Promise<Record<string, any>>;
};

test("three read-only tools, with names a browser accepts and an id enum that matches the projects", () => {
  assert.deepEqual(
    tools.map((t) => t.name),
    ["portfolio.getProfile", "portfolio.listProjects", "portfolio.getProject"],
  );
  for (const t of tools) {
    assert.match(t.name, /^[\w.-]{1,128}$/);
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.inputSchema.type, "object");
    assert.ok(t.title && t.description.length > 40, `${t.name} explains itself`);
  }
  const getProject = tools[2].inputSchema;
  assert.deepEqual((getProject.properties.id as { enum: string[] }).enum, data.projects.map((p) => p.id));
  assert.deepEqual(getProject.required, ["id"]);
});

test("getProfile answers with the page's name, headline, facts and every profile link but the site", async () => {
  const r = await run("portfolio.getProfile", {});
  assert.equal(r.name, data.profile.name);
  assert.equal(r.headline, data.profile.headline);
  assert.ok(r.about.startsWith(data.profile.education));
  assert.deepEqual(
    r.links,
    data.links.filter((l) => !isSite(l.url)).map((l) => ({ label: l.label, url: l.url })),
  );
  assert.equal(r.page, SITE);
});

test("listProjects lists every project in page order, and one group when asked", async () => {
  const all = await run("portfolio.listProjects", {});
  assert.deepEqual(all.projects.map((p: { id: string }) => p.id), data.projects.map((p) => p.id));
  const first = all.projects[0];
  assert.equal(first.page, `${SITE}#${data.projects[0].id}`);
  assert.equal(first.repo, data.projects[0].urls.repo);
  const flagship = await run("portfolio.listProjects", { group: "flagship" });
  assert.deepEqual(
    flagship.projects.map((p: { id: string }) => p.id),
    data.projects.filter((p) => p.group === "flagship").map((p) => p.id),
  );
  await assert.rejects(run("portfolio.listProjects", { group: "nope" }), /group must be one of/);
});

test("getProject returns the card, every claim with its source, the links and its Try it items", async () => {
  for (const p of data.projects) {
    const r = await run("portfolio.getProject", { id: p.id });
    assert.equal(r.title, p.title);
    assert.equal(r.summary, p.card);
    assert.deepEqual(r.claims, p.claims.map((c) => ({ lead: c.lead ?? "", text: c.text, source: c.source })));
    assert.equal(r.links.repo, p.urls.repo);
    assert.ok(Object.values(r.links).every((u) => typeof u === "string" && u.startsWith("https://")));
    assert.deepEqual(r.try.map((t: { url: string }) => t.url), data.try.filter((t) => t.project === p.id).map((t) => t.url));
  }
});

test("getProject refuses a missing or unknown id", async () => {
  await assert.rejects(run("portfolio.getProject", {}), /id must be one of/);
  await assert.rejects(run("portfolio.getProject", { id: "../etc" }), /id must be one of/);
  await assert.rejects(run("portfolio.getProject", undefined), /id must be one of/);
});

test("every answer is plain JSON, as the browser serialises it", async () => {
  for (const [name, input] of [
    ["portfolio.getProfile", {}],
    ["portfolio.listProjects", {}],
    ["portfolio.getProject", { id: data.projects[0].id }],
  ] as const) {
    const r = await run(name, input);
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
  }
});

test("the page carries a live WebMCP origin-trial token for this site", () => {
  const html = readFileSync("index.html", "utf8");
  const token = html.match(/<meta http-equiv="origin-trial" content="([^"]+)">/)?.[1];
  assert.ok(token, "index.html has an origin-trial meta tag");
  // A token is a version byte, a 64-byte signature, a 4-byte length, then the JSON payload.
  const payload = JSON.parse(Buffer.from(token, "base64").subarray(69).toString());
  assert.equal(payload.origin, "https://necmikural.github.io:443");
  assert.equal(payload.feature, "WebMCP");
  // Fails once the token has expired: renew it at https://developer.chrome.com/origintrials.
  assert.ok(payload.expiry * 1000 > Date.now(), `the token expired on ${new Date(payload.expiry * 1000).toISOString()}`);
});
