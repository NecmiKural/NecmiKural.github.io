// Copies content/portfolio.json, the icons it names and the banners (the page's heading art)
// from the profile repo's main branch.
// With --check, compares byte for byte instead and fails on any difference (CI and weekly).
//   node scripts/sync-content.ts [--check]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const BASE = "https://raw.githubusercontent.com/NecmiKural/NecmiKural/main/";
const check = process.argv.includes("--check");

async function get(path: string): Promise<Buffer> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${BASE + path} returned ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const json = await get("content/portfolio.json");
const icons: string[] = JSON.parse(json.toString())
  .links.map((l: { icon?: string }) => l.icon)
  .filter(Boolean);
for (const icon of icons) {
  if (!/^assets\/icons\/[\w-]+\.svg$/.test(icon)) throw new Error(`unexpected icon path: ${icon}`);
}
// Remote path to local path: the JSON stays in content/, icons are served from public/.
const files: [string, Buffer][] = [
  ["content/portfolio.json", json],
  ...(await Promise.all(
    [...icons, "assets/banner-light.svg", "assets/banner-dark.svg"].map(async (i): Promise<[string, Buffer]> => [`public/${i}`, await get(i)]),
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
