import { mkdir, readFile, writeFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import { renderPage, svgSize, type Portfolio, type Sizes } from "./scripts/render.ts";

// Renders index.html from the vendored content file. The flagship visuals are fetched from
// their repos at the pinned tag or commit into public/visuals, so the site serves them itself.
function portfolio(): Plugin {
  let data: Portfolio;
  let sizes: Sizes = {};
  return {
    name: "portfolio",
    async buildStart() {
      data = JSON.parse(await readFile("content/portfolio.json", "utf8"));
      await mkdir("public/visuals", { recursive: true });
      const fetched = await Promise.all(
        data.projects
          .filter((p) => p.urls.visual)
          .map(async (p) => {
            const url = p.urls.visual as string;
            if (!url.startsWith("https://raw.githubusercontent.com/NecmiKural/")) {
              throw new Error(`${p.id}: visual is not from a NecmiKural repo: ${url}`);
            }
            const res = await fetch(url);
            if (!res.ok) throw new Error(`${p.id}: ${url} returned ${res.status}`);
            const svg = await res.text();
            const size = svgSize(svg, url);
            await writeFile(`public/visuals/${p.id}.svg`, svg);
            return [p.id, size] as const;
          }),
      );
      sizes = Object.fromEntries(fetched);
    },
    transformIndexHtml: { order: "post", handler: (html) => renderPage(html, data, sizes) },
  };
}

export default defineConfig({
  base: "./",
  plugins: [portfolio()],
  build: { modulePreload: { polyfill: false } },
});
