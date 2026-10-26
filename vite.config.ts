import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import { firstFrame, imageSize, renderPage, type Portfolio, type Sizes } from "./scripts/render.ts";

// Renders index.html from the vendored content file. The project visuals are fetched from their
// repos at the pinned commit into public/visuals, so the site serves them itself; a GIF also
// gets a still of its first frame, shown until it plays.
function portfolio(): Plugin {
  let data: Portfolio;
  let sizes: Sizes = {};
  return {
    name: "portfolio",
    async buildStart() {
      data = JSON.parse(await readFile("content/portfolio.json", "utf8"));
      await rm("public/visuals", { recursive: true, force: true }); // no file left from an earlier build
      await mkdir("public/visuals", { recursive: true });
      const fetched = await Promise.all(
        data.projects
          .flatMap((p) => p.visuals.map(({ url }, i) => ({ p, url, name: i ? `${p.id}-${i + 1}` : p.id })))
          .map(async ({ p, url, name }) => {
            if (!/^https:\/\/raw\.githubusercontent\.com\/NecmiKural\/[\w.-]+\/[0-9a-f]{40}\/[\w./-]+\.(svg|png|gif)$/.test(url) || url.includes("..")) {
              throw new Error(`${p.id}: visual is not a file in a NecmiKural repo at a pinned commit: ${url}`);
            }
            const res = await fetch(url, { redirect: "error" });
            if (!res.ok) throw new Error(`${p.id}: ${url} returned ${res.status}`);
            const bytes = new Uint8Array(await res.arrayBuffer());
            const { kind, width, height } = imageSize(bytes, url);
            if (!url.endsWith(`.${kind}`)) throw new Error(`${p.id}: ${url} is not a ${kind} file`);
            const file = `${name}.${kind}`;
            await writeFile(`public/visuals/${file}`, bytes);
            let still: string | undefined;
            if (kind === "gif") {
              still = `${name}-still.gif`;
              await writeFile(`public/visuals/${still}`, firstFrame(bytes, url));
            }
            return [url, { width, height, file, still }] as const;
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
  // The 3D chunk is budgeted in gzip by scripts/check-size.ts; this only quiets the minified-size warning.
  build: { modulePreload: { polyfill: false }, chunkSizeWarningLimit: 700 },
});
