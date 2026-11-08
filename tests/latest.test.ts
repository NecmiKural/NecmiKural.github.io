// The "Latest" strip: what scripts/latest.ts picks from the GitHub and Hugging Face APIs, on a fake
// network, and how scripts/render.ts shows it.
//   node --test tests/latest.test.ts   (part of npm run check)

import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchLatest, isStale } from "../scripts/latest.ts";
import { latestStrip, type Portfolio } from "../scripts/render.ts";

const data = {
  projects: [
    { urls: { repo: "https://github.com/NecmiKural/a" } },
    { urls: { repo: "https://github.com/NecmiKural/b" } },
    { urls: { repo: "https://github.com/NecmiKural/c" } }, // no release yet
    { urls: { repo: "https://github.com/someone/else" } }, // not one of these repos: never asked
  ],
  try: [
    { name: "s", kind: "Space", url: "https://huggingface.co/spaces/necmikural/s" },
    { name: "d", kind: "Dataset", url: "https://huggingface.co/datasets/necmikural/d" },
    { name: "k", kind: "Notebook", url: "https://www.kaggle.com/code/necmikural/k" }, // not on the Hub
  ],
} as unknown as Portfolio;

const release = (repo: string, tag: string, date: string) => ({
  tag_name: tag,
  html_url: `https://github.com/NecmiKural/${repo}/releases/tag/${tag}`,
  published_at: date,
});
const commit = (repo: string, date: string) => [
  { html_url: `https://github.com/NecmiKural/${repo}/commit/${"0".repeat(39)}${repo}`, commit: { committer: { date } } },
];
const SHA = (repo: string) => `https://github.com/NecmiKural/${repo}/commit/${"0".repeat(39)}${repo}`;
const ANSWERS: Record<string, [number, unknown]> = {
  "https://api.github.com/repos/NecmiKural/a/releases/latest": [200, release("a", "v1.0.0", "2026-10-20T10:00:00Z")],
  "https://api.github.com/repos/NecmiKural/b/releases/latest": [200, release("b", "v0.2.0", "2026-10-24T20:20:38Z")],
  "https://api.github.com/repos/NecmiKural/c/releases/latest": [404, { message: "Not Found" }],
  "https://api.github.com/repos/NecmiKural/a/commits?per_page=1": [200, commit("a", "2026-10-27T08:00:00Z")],
  "https://api.github.com/repos/NecmiKural/b/commits?per_page=1": [200, commit("b", "2026-10-24T20:19:00Z")],
  "https://api.github.com/repos/NecmiKural/c/commits?per_page=1": [200, commit("c", "2026-10-21T09:00:00Z")],
  "https://huggingface.co/api/spaces/necmikural/s": [200, { lastModified: "2026-10-25T23:09:34.000Z" }],
  "https://huggingface.co/api/datasets/necmikural/d": [200, { lastModified: "2026-10-26T04:07:33.000Z" }],
};

function network(overrides: Record<string, [number, unknown]> = {}) {
  const asked: { url: string; auth?: string }[] = [];
  const get = async (url: string, init: RequestInit) => {
    asked.push({ url, auth: (init.headers as Record<string, string>).Authorization });
    const answer = { ...ANSWERS, ...overrides }[url];
    if (!answer) throw new Error(`unexpected request: ${url}`);
    return new Response(JSON.stringify(answer[1]), { status: answer[0] });
  };
  return { get, asked };
}

test("picks the newest release, the newest commit to a default branch and the newest Space or dataset update", async () => {
  const { get, asked } = network();
  assert.deepEqual(await fetchLatest(data, get, "t0ken"), {
    release: { repo: "b", tag: "v0.2.0", url: "https://github.com/NecmiKural/b/releases/tag/v0.2.0", date: "2026-10-24T20:20:38Z" },
    commit: { repo: "a", url: SHA("a"), date: "2026-10-27T08:00:00Z" },
    update: { name: "d", kind: "Dataset", url: "https://huggingface.co/datasets/necmikural/d", date: "2026-10-26T04:07:33.000Z" },
  });
  assert.equal(asked.length, 8, "two requests per own repo and one per Hub item, nothing else");
  assert.ok(asked.filter((a) => a.url.startsWith("https://api.github.com/")).every((a) => a.auth === "Bearer t0ken"));
  assert.ok(asked.filter((a) => a.url.startsWith("https://huggingface.co/")).every((a) => a.auth === undefined));
});

test("a failed request or a missing date throws, so the build can leave the strip out", async () => {
  const fail = network({ "https://api.github.com/repos/NecmiKural/a/releases/latest": [403, { message: "rate limit" }] });
  await assert.rejects(fetchLatest(data, fail.get, undefined), /returned 403/);
  const down = network({ "https://huggingface.co/api/spaces/necmikural/s": [500, {}] });
  await assert.rejects(fetchLatest(data, down.get, undefined), /returned 500/);
  const undated = network({ "https://huggingface.co/api/datasets/necmikural/d": [200, {}] });
  await assert.rejects(fetchLatest(data, undated.get, undefined), /no date/);
});

test("a commit link outside its own repo throws", async () => {
  const odd = network({
    "https://api.github.com/repos/NecmiKural/a/commits?per_page=1": [200, [{ html_url: "https://evil.example/x", commit: { committer: { date: "2026-10-27T08:00:00Z" } } }]],
  });
  await assert.rejects(fetchLatest(data, odd.get, undefined), /NecmiKural\/a: unexpected commit/);
});

test("a dropped connection or a 5xx is tried once more; a lasting one names its URL", async () => {
  let calls = 0;
  const flaky = network();
  const get = async (url: string, init: RequestInit) => {
    if (url.endsWith("/a/releases/latest") && calls++ === 0) return new Response("{}", { status: 502 });
    if (url.endsWith("/necmikural/s") && calls++ === 1) throw new TypeError("fetch failed");
    return flaky.get(url, init);
  };
  assert.equal((await fetchLatest(data, get, undefined))?.release.tag, "v0.2.0");
  const dead = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(fetchLatest(data, dead, undefined), /^Error: https:\/\/\S+: fetch failed$/);
});

test("with no release anywhere there is nothing true to show", async () => {
  const none = network({
    "https://api.github.com/repos/NecmiKural/a/releases/latest": [404, {}],
    "https://api.github.com/repos/NecmiKural/b/releases/latest": [404, {}],
  });
  assert.equal(await fetchLatest(data, none.get, undefined), null);
});

test("the strip shows every item with its real date, and nothing when there is no data", async () => {
  const latest = await fetchLatest(data, network().get, undefined);
  const html = latestStrip(latest);
  assert.match(html, /Release <a href="https:\/\/github\.com\/NecmiKural\/b\/releases\/tag\/v0\.2\.0">v0\.2\.0<\/a> of b, <time datetime="2026-10-24T20:20:38Z">24 Oct 2026<\/time>/);
  assert.ok(html.includes(`Commit to <a href="${SHA("a")}">a</a>, <time datetime="2026-10-27T08:00:00Z">27 Oct 2026</time>`));
  assert.match(html, /Dataset <a href="https:\/\/huggingface\.co\/datasets\/necmikural\/d">d<\/a> updated <time datetime="2026-10-26T04:07:33\.000Z">26 Oct 2026<\/time>/);
  assert.equal(latestStrip(null), "");
});

test("a commit to the released repo on the release's own day says nothing new, so it is left out", async () => {
  const same = await fetchLatest(data, network({ "https://api.github.com/repos/NecmiKural/a/commits?per_page=1": [200, commit("a", "2026-10-20T03:00:00Z")], "https://api.github.com/repos/NecmiKural/b/commits?per_page=1": [200, commit("b", "2026-10-24T23:00:00Z")] }).get, undefined);
  assert.equal(same?.commit.repo, "b");
  assert.doesNotMatch(latestStrip(same), /Commit to/);
  const later = await fetchLatest(data, network({ "https://api.github.com/repos/NecmiKural/b/commits?per_page=1": [200, commit("b", "2026-10-28T08:00:00Z")] }).get, undefined);
  assert.match(latestStrip(later), /Commit to <a [^>]+>b<\/a>, <time datetime="2026-10-28T08:00:00Z">/);
});

test("the live page is stale exactly when its strip differs from a fresh one", async () => {
  const fresh = latestStrip(await fetchLatest(data, network().get, undefined));
  const page = (strip: string) => `<header><h1>x</h1>${strip}</header><main><p class="intro">y</p></main>`;
  assert.equal(isStale(page(fresh), fresh), false);
  assert.equal(isStale(page(fresh.replace("27 Oct 2026", "26 Oct 2026")), fresh), true);
  assert.equal(isStale(page(""), fresh), true, "a live page without the strip is stale");
  assert.equal(isStale(page(""), ""), false);
});
