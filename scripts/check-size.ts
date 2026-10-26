// Budgets on the built site (gzip level 9). Run after `npm run build`.

import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1024;
const gz = (b: Buffer) => gzipSync(b, { level: 9 }).length;
const problems: string[] = [];

const html = readFileSync("dist/index.html");
const page = html.toString();
if (gz(html) > 14 * KB) problems.push(`dist/index.html is ${gz(html)} B gzip, over 14 KB`);
if (page.includes("modulepreload")) problems.push("dist/index.html has a modulepreload link");

// Script the page loads up front; 3D mode is loaded on demand.
const scripts = [...page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
const js = scripts.reduce((sum, src) => sum + gz(readFileSync(`dist/${src.replace(/^\.?\//, "")}`)), 0);
if (js > 2 * KB) problems.push(`entry JS is ${js} B gzip, over 2 KB`);

// 3D mode with one scene: every other chunk (the engine with three, shared code) plus that scene's
// own chunk, named after its file in src/scenes. 180 KB gzip is the target, 200 KB the limit.
const entry = new Set(scripts.map((src) => basename(src)));
const chunks = readdirSync("dist/assets").filter((f) => f.endsWith(".js") && !entry.has(f));
const scenes = readdirSync("src/scenes").filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3));
const sceneOf = (chunk: string) => scenes.find((s) => chunk.startsWith(`${s}-`));
const modes = scenes.map((scene) => {
  if (!chunks.some((c) => sceneOf(c) === scene)) problems.push(`no chunk for scene ${scene}`);
  const size = chunks
    .filter((c) => (sceneOf(c) ?? scene) === scene)
    .reduce((sum, c) => sum + gz(readFileSync(`dist/assets/${c}`)), 0);
  if (size > 200 * KB) problems.push(`3D mode with ${scene} is ${size} B gzip, over 200 KB`);
  else if (size > 180 * KB) console.warn(`note: 3D mode with ${scene} is ${size} B gzip, over the 180 KB target`);
  return `${scene} ${size} B`;
});

// Project visuals, as served (they load lazily, one by one): each at most 512 KB, all at most 2 MB.
const visuals = readdirSync("dist/visuals").map((f) => [f, readFileSync(`dist/visuals/${f}`).length] as const);
for (const [f, size] of visuals) if (size > 512 * KB) problems.push(`dist/visuals/${f} is ${size} B, over 512 KB`);
const allVisuals = visuals.reduce((sum, [, size]) => sum + size, 0);
if (allVisuals > 2048 * KB) problems.push(`dist/visuals hold ${allVisuals} B, over 2 MB`);

const png = readFileSync("dist/og.png");
const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
if (w !== 1200 || h !== 630) problems.push(`og.png is ${w}x${h}, not 1200x630`);

for (const p of problems) console.error(p);
console.log(
  `check-size: index.html ${gz(html)} B gzip, entry JS ${js} B gzip, 3D mode (${modes.join(", ")}) gzip,` +
    ` visuals ${visuals.length} files ${allVisuals} B, og.png ${w}x${h}`,
);
process.exit(problems.length ? 1 : 0);
