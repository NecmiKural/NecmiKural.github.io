// The "Latest" strip's data, fetched at build time: the newest release across the shown
// NecmiKural repos (GitHub API; CI passes the Actions token) and the newest update to a Space or
// dataset listed in "Try it" (Hugging Face API). Any failed request throws, so the build leaves
// the strip out instead of showing a guess; a repo without a release is not a failure.

import type { Latest, Portfolio } from "./render.ts";

type Get = (url: string, init: RequestInit) => Promise<Response>;

const OWN_REPO = /^https:\/\/github\.com\/(NecmiKural\/[\w.-]+)$/;
const HUB_ITEM = /^https:\/\/huggingface\.co\/(spaces|datasets)\/([\w.-]+\/[\w.-]+)$/;
const TIMEOUT_MS = 15_000;
const ATTEMPTS = 2; // a dropped connection or a 5xx is tried once more
// Written by the build when it leaves the strip out, so the page tests can tell that apart from a
// strip that went missing through a bug.
export const LEFT_OUT = ".latest-left-out";

function newest<T extends { date: string }>(items: T[]): T | undefined {
  return items.reduce<T | undefined>((best, x) => (!best || Date.parse(x.date) > Date.parse(best.date) ? x : best), undefined);
}

function date(value: unknown, where: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${where}: no date`);
  return value;
}

export async function fetchLatest(data: Portfolio, get: Get = fetch, token = process.env.GITHUB_TOKEN): Promise<Latest | null> {
  const json = async (url: string, headers: Record<string, string>, missingIsNone = false) => {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await get(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        if (attempt < ATTEMPTS) continue;
        throw new Error(`${url}: ${(e as Error).message}`);
      }
      if (res.status >= 500 && attempt < ATTEMPTS) continue;
      if (missingIsNone && res.status === 404) return null;
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      return res.json();
    }
  };
  const github = { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const repos = [...new Set(data.projects.flatMap((p) => p.urls.repo.match(OWN_REPO)?.[1] ?? []))];
  const releasing = Promise.all(
    repos.map(async (repo) => {
      const r = await json(`https://api.github.com/repos/${repo}/releases/latest`, github, true);
      if (!r) return [];
      if (typeof r.tag_name !== "string" || !String(r.html_url).startsWith(`https://github.com/${repo}/`)) {
        throw new Error(`${repo}: unexpected release`);
      }
      return [{ repo: repo.split("/")[1], tag: r.tag_name, url: r.html_url, date: date(r.published_at, repo) }];
    }),
  );
  const updating = Promise.all(
    data.try.flatMap((t) => {
      const m = t.url.match(HUB_ITEM);
      if (!m) return [];
      return [
        json(`https://huggingface.co/api/${m[1]}/${m[2]}`, {}).then((r) => ({
          name: t.name,
          kind: t.kind,
          url: t.url,
          date: date(r.lastModified, t.url),
        })),
      ];
    }),
  );
  const [releases, updates] = await Promise.all([releasing, updating]);
  const release = newest(releases.flat());
  const update = newest(updates);
  return release && update ? { release, update } : null;
}
