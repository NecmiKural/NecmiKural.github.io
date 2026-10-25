// Draws public/og.png (1200x630), the link preview image, from the same content file.
// Run after the name, headline or flagships change: npm run og

import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { esc, type Portfolio } from "./render.ts";

const data: Portfolio = JSON.parse(readFileSync("content/portfolio.json", "utf8"));
const flagships = data.projects.filter((p) => p.group === "flagship");

const html = `<!doctype html><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; padding: 64px 72px; display: flex; flex-direction: column;
  background: #f6f3ec; color: #1e1f1c; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.site { font: 600 22px ui-monospace, Menlo, monospace; letter-spacing: .08em; color: #9c5b00; }
h1 { font-size: 92px; line-height: 1; letter-spacing: -.03em; margin-top: 28px; }
p { font-size: 32px; line-height: 1.35; margin-top: 24px; max-width: 1000px; }
ul { list-style: none; padding: 0; margin-top: auto; display: flex; gap: 20px; }
li { flex: 1; border: 3px solid #1e1f1c; border-radius: 10px; padding: 16px 20px; font-size: 24px; font-weight: 600; }
span { display: inline-block; margin-bottom: 8px; padding: 6px 10px; border-radius: 4px; background: #1e1f1c;
  color: #f6f3ec; font: 700 18px ui-monospace, Menlo, monospace; letter-spacing: .14em; }
</style>
<div class="site">necmikural.github.io</div>
<h1>${esc(data.profile.name)}</h1>
<p>${esc(data.profile.headline)}</p>
<ul>${flagships.map((p) => `<li><span>${esc(p.label ?? "")}</span><br>${esc(p.title)}</li>`).join("")}</ul>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: "public/og.png" });
await browser.close();
console.log(`og: public/og.png with ${flagships.length} flagships`);
