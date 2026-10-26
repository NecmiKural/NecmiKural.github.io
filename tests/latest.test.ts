// The "Latest" strip: what scripts/latest.ts picks from the GitHub and Hugging Face APIs, on a fake
// network, and how scripts/render.ts shows it.
//   node --test tests/latest.test.ts   (part of npm run check)

import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchLatest } from "../scripts/latest.ts";
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
const ANSWERS: Record<string, [number, unknown]> = {
  "https://api.github.com/repos/NecmiKural/a/releases/latest": [200, release("a", "v1.0.0", "2026-10-20T10:00:00Z")],
  "https://api.github.com/repos/NecmiKural/b/releases/latest": [200, release("b", "v0.2.0", "2026-10-24T20:20:38Z")],
  "https://api.github.com/repos/NecmiKural/c/releases/latest": [404, { message: "Not Found" }],
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

test("picks the newest release across the repos and the newest Space or dataset update", async () => {
  const { get, asked } = network();
  assert.deepEqual(await fetchLatest(data, get, "t0ken"), {
    release: { repo: "b", tag: "v0.2.0", url: "https://github.com/NecmiKural/b/releases/tag/v0.2.0", date: "2026-10-24T20:20:38Z" },
    update: { name: "d", kind: "Dataset", url: "https://huggingface.co/datasets/necmikural/d", date: "2026-10-26T04:07:33.000Z" },
  });
  assert.equal(asked.length, 5, "one request per own repo and per Hub item, nothing else");
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

test("the strip shows both items with their real dates, and nothing when there is no data", async () => {
  const latest = await fetchLatest(data, network().get, undefined);
  const html = latestStrip(latest);
  assert.match(html, /Release <a href="https:\/\/github\.com\/NecmiKural\/b\/releases\/tag\/v0\.2\.0">v0\.2\.0<\/a> of b, <time datetime="2026-10-24T20:20:38Z">24 Oct 2026<\/time>/);
  assert.match(html, /Dataset <a href="https:\/\/huggingface\.co\/datasets\/necmikural\/d">d<\/a> updated <time datetime="2026-10-26T04:07:33\.000Z">26 Oct 2026<\/time>/);
  assert.equal(latestStrip(null), "");
});
