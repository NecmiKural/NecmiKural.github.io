// Copies content/portfolio.json, the icons it names, the banners (the page's heading art) and
// the files its links point to on this site (the CV) from the profile repo's main branch.
// With --check, compares byte for byte instead and fails on any difference (CI and weekly).
//   node scripts/sync-content.ts [--check]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SITE } from "./render.ts";

const BASE = "https://raw.githubusercontent.com/NecmiKural/NecmiKural/main/";
const check = process.argv.includes("--check");

async function get(path: string): Promise<Buffer> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${BASE + path} returned ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const json = await get("content/portfolio.json");
const links: { url: string; icon?: string }[] = JSON.parse(json.toString()).links;
const icons = links.flatMap((l) => l.icon ?? []);
const served = links.flatMap((l) => (l.url.startsWith(SITE) && l.url !== SITE ? [l.url.slice(SITE.length)] : []));
for (const file of served) {
  if (!/^cv\/[\w.-]+\.pdf$/.test(file)) throw new Error(`unexpected file linked on this site: ${file}`);
}
for (const icon of icons) {
  if (!/^assets\/icons\/[\w-]+\.svg$/.test(icon)) throw new Error(`unexpected icon path: ${icon}`);
}
// Remote path to local path: the JSON stays in content/; icons, banners and the CV are served from public/.
const files: [string, Buffer][] = [
  ["content/portfolio.json", json],
  ...(await Promise.all(
    [...icons, "assets/banner-light.svg", "assets/banner-dark.svg", ...served].map(async (i): Promise<[string, Buffer]> => [`public/${i}`, await get(i)]),
  )),
];

let drift = 0;
for (const [local, bytes] of files) {
  if (!check) {
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, bytes);
    continue;
  }
  let have: Buffer | undefined;
  try {
    have = readFileSync(local);
  } catch {}
  if (!have?.equals(bytes)) {
    console.error(`${local} differs from the profile repo's main: run npm run sync-content`);
    drift++;
  }
}
console.log(`sync-content: ${files.length} files ${check ? "checked" : "written"}, ${drift} differ`);
process.exit(drift ? 1 : 0);
