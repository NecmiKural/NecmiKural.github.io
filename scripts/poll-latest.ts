// Hourly in CI: is the live page's "Latest" strip behind the APIs? Writes stale=true or false to
// $GITHUB_OUTPUT (or prints it), so the workflow rebuilds and deploys only when a listed repo got a
// release or a commit, or a Space or dataset changed. Needs no npm ci: node and the repo only.
// A failed request means stale=false and a warning; the next hour asks again.
//   node scripts/poll-latest.ts

import { appendFile, readFile } from "node:fs/promises";
import { fetchLatest, isStale } from "./latest.ts";
import { latestStrip, SITE, type Portfolio } from "./render.ts";

const data: Portfolio = JSON.parse(await readFile("content/portfolio.json", "utf8"));
let stale = false;
try {
  const fresh = latestStrip(await fetchLatest(data));
  // A query the CDN has not seen, so the page comes from the origin, not a cached copy.
  const res = await fetch(`${SITE}?latest-poll=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${SITE} returned ${res.status}`);
  stale = isStale(await res.text(), fresh);
} catch (e) {
  console.log(`::warning::Latest poll skipped: ${(e as Error).message}`);
}
console.log(`stale=${stale}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `stale=${stale}\n`);
