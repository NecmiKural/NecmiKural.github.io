// Budgets on the built site (gzip level 9). Run after `npm run build`.

import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const KB = 1024;
const gz = (b: Buffer) => gzipSync(b, { level: 9 }).length;
const problems: string[] = [];

const html = readFileSync("dist/index.html");
const page = html.toString();
if (gz(html) > 14 * KB) problems.push(`dist/index.html is ${gz(html)} B gzip, over 14 KB`);
if (page.includes("modulepreload")) problems.push("dist/index.html has a modulepreload link");

// Script the page loads up front; the 3D mode will be a separate chunk loaded on demand.
const scripts = [...page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
const js = scripts.reduce((sum, src) => sum + gz(readFileSync(`dist/${src.replace(/^\.?\//, "")}`)), 0);
if (js > 2 * KB) problems.push(`entry JS is ${js} B gzip, over 2 KB`);

const png = readFileSync("dist/og.png");
const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
if (w !== 1200 || h !== 630) problems.push(`og.png is ${w}x${h}, not 1200x630`);

for (const p of problems) console.error(p);
console.log(`check-size: index.html ${gz(html)} B gzip, entry JS ${js} B gzip, og.png ${w}x${h}`);
process.exit(problems.length ? 1 : 0);
