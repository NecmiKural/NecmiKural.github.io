// Renders the page from content/portfolio.json, a copy of the profile repo's generated file.
// Pure: no I/O. Used by vite.config.ts (the page) and scripts/og.ts (the share image).

export const SITE = "https://necmikural.github.io/";

const SEP = " · ";
const COURSEWORK = "Coursework, University of Waikato";
// Same headings and note as the profile README (scripts/portfolio.py in NecmiKural/NecmiKural).
const HEADINGS: Record<string, string> = {
  flagship: "Selected work",
  software: "Software",
  coursework: "Machine learning coursework, University of Waikato",
  "open-source": "Open source",
};
const COURSEWORK_NOTE =
  "Individual work unless stated. Course data and trained weights are not published.";
const SOURCE_REPO = "https://github.com/NecmiKural/NecmiKural.github.io";
const CONTENT_SOURCE = "https://github.com/NecmiKural/NecmiKural/blob/main/content/portfolio.toml";

export interface Link {
  label: string;
  url: string;
  icon?: string;
}
export interface Claim {
  lead?: string;
  text: string;
  source: string;
}
export interface Project {
  id: string;
  title: string;
  group: string;
  label?: string;
  ref?: string;
  card: string;
  stack: string[];
  byline: string;
  visual_alt?: string;
  visual_caption?: string;
  demo_note?: string;
  urls: {
    repo: string;
    release: string | null;
    results: string | null;
    visual: string | null;
    demo: string | null;
    extra: { label: string; url: string }[];
  };
  claims: Claim[];
}
export interface Portfolio {
  profile: Record<
    "name" | "headline" | "education" | "location" | "availability" | "provenance",
    string
  >;
  links: Link[];
  projects: Project[];
}
// Each visual as served from public/visuals: its file, its size, and for a moving image a still.
export type Sizes = Record<string, { width: number; height: number; file: string; still?: string }>;

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function need<T>(value: T | null | undefined, where: string): T {
  if (value === undefined || value === null || value === "") throw new Error(`missing ${where}`);
  return value;
}

function href(url: string): string {
  if (!url.startsWith("https://")) throw new Error(`link is not https: ${url}`);
  return esc(url);
}

const atRef = (ref: string): string => (ref.startsWith("v") ? ref : `commit ${ref.slice(0, 7)}`);

export const isSite = (url: string): boolean => url.replace(/\/$/, "") === SITE.replace(/\/$/, "");

// "source: README at v1.1.0", as in the profile README.
function sourceLabel(url: string): string {
  const m = url.match(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/blob\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`claim source is not a GitHub blob link: ${url}`);
  return `source: ${m[2] === "README.md" ? "README" : m[2]} at ${atRef(m[1])}`;
}

// Width and height from the root viewBox, so the image reserves its space before it loads.
export function svgSize(svg: string, where: string): { width: number; height: number } {
  const root = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!root) throw new Error(`${where}: not an SVG`);
  if (/<script\b|<[^>]+\son\w+\s*=/i.test(svg)) throw new Error(`${where}: SVG contains script`);
  const box = root.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
  if (!box) throw new Error(`${where}: SVG has no viewBox`);
  return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
}

// The kind and pixel size of a fetched visual, from its own bytes: PNG and GIF headers, or the
// viewBox of an SVG (which must hold no script).
export function imageSize(bytes: Uint8Array, where: string): { kind: "svg" | "png" | "gif"; width: number; height: number } {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  const sized = (kind: "svg" | "png" | "gif", width: number, height: number) => {
    if (!(width > 0 && height > 0)) throw new Error(`${where}: no size in the ${kind} header`);
    return { kind, width, height };
  };
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") {
    if (bytes.length < 24) throw new Error(`${where}: truncated PNG`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return sized("png", view.getUint32(16), view.getUint32(20));
  }
  if (ascii(0, 4) === "GIF8") return sized("gif", bytes[6] | (bytes[7] << 8), bytes[8] | (bytes[9] << 8));
  const { width, height } = svgSize(new TextDecoder().decode(bytes), where);
  return sized("svg", width, height);
}

// The first frame of a GIF, as a GIF of its own: everything up to the end of the first image,
// then the trailer. Shown until the visitor plays the moving image.
export function firstFrame(gif: Uint8Array, where: string): Uint8Array {
  const table = (packed: number) => (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0);
  const blocks = (at: number) => {
    while (at < gif.length && gif[at] !== 0) at += gif[at] + 1; // data sub-blocks, up to the empty one
    if (at >= gif.length) throw new Error(`${where}: truncated GIF`);
    return at + 1;
  };
  let at = 13 + table(gif[10]);
  while (at < gif.length) {
    if (gif[at] === 0x21) at = blocks(at + 2); // an extension: label, then its sub-blocks
    else if (gif[at] === 0x2c) {
      at = blocks(at + 10 + table(gif[at + 9]) + 1); // descriptor, colour table, LZW size, data
      const still = new Uint8Array(at + 1);
      still.set(gif.subarray(0, at));
      still[at] = 0x3b;
      return still;
    } else break;
  }
  throw new Error(`${where}: no image in the GIF`);
}

function a(url: string, text: string, suffix = ""): string {
  return `<a href="${href(url)}">${esc(text)}${suffix}</a>`;
}

function linkRow(p: Project): string[] {
  const u = p.urls;
  const of = `<span class="vh"> for ${esc(p.title)}</span>`;
  const row: string[] = [];
  if (u.release) row.push(a(u.release, `Release ${need(p.ref, `${p.id}.ref`)}`, of));
  if (u.results) {
    const anchor = u.results.split("#")[1];
    const name = anchor ? anchor[0].toUpperCase() + anchor.slice(1).replaceAll("-", " ") : "Results";
    row.push(a(u.results, `${name} at ${atRef(need(p.ref, `${p.id}.ref`))}`, of));
  }
  for (const e of u.extra) row.push(a(e.url, e.label, of));
  if (u.demo) row.push(a(u.demo, "Demo", of) + (p.demo_note ? ` (${esc(p.demo_note)})` : ""));
  return row;
}

function article(p: Project, sizes: Sizes): string {
  if (!/^[a-z0-9-]+$/.test(p.id)) throw new Error(`bad project id: ${p.id}`);
  const where = `projects[${p.id}]`;
  const byline = need(p.byline, `${where}.byline`).replace(COURSEWORK + SEP, "");
  const tape = p.label ? `<span class="tape" aria-hidden="true">${esc(p.label)}</span> ` : "";
  const claims = p.claims.map(
    (c) =>
      `<li>${c.lead ? `<strong>${esc(c.lead)}</strong> ` : ""}${esc(need(c.text, `${where}.claim`))}` +
      ` <a class="src" href="${href(c.source)}">${esc(sourceLabel(c.source))}</a></li>`,
  );
  let visual = "";
  if (p.urls.visual) {
    const v = need(sizes[p.id], `${where} visual size`);
    // A moving image shows its first frame until the visitor plays it: src/main.ts reveals the
    // button, which swaps src and data-play. Without JavaScript the first frame stays.
    const img =
      `<img class="visual" src="visuals/${v.still ?? v.file}"${v.still ? ` data-play="visuals/${v.file}"` : ""}` +
      ` alt="${esc(need(p.visual_alt, `${where}.visual_alt`))}" width="${v.width}" height="${v.height}" loading="lazy" decoding="async">`;
    const play = v.still ? `<button class="play" type="button" hidden>Play the demo<span class="vh"> of ${esc(p.title)}</span></button>` : "";
    const caption = p.visual_caption ? `<figcaption>${esc(p.visual_caption)}</figcaption>` : "";
    visual = `<figure class="figure">${img}${play}${caption}</figure>`;
  }
  const row = linkRow(p);
  return [
    `<article id="${p.id}">`,
    `<h3>${tape}${a(need(p.urls.repo, `${where}.urls.repo`), need(p.title, `${where}.title`))}</h3>`,
    `<p class="byline">${esc([byline, p.stack.join(", ")].filter(Boolean).join(SEP))}</p>`,
    `<p>${esc(need(p.card, `${where}.card`))}</p>`,
    claims.length ? `<ul class="claims">\n${claims.join("\n")}\n</ul>` : "",
    visual,
    row.length ? `<p class="more">${row.join(SEP)}</p>` : "",
    "</article>",
  ]
    .filter(Boolean)
    .join("\n");
}

function head(data: Portfolio): string {
  const { name, headline } = data.profile;
  const title = `${need(name, "profile.name")}, software engineer`;
  const description = need(headline, "profile.headline");
  const links = data.links.filter((l) => !isSite(l.url));
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    url: SITE,
    jobTitle: "Software engineer",
    sameAs: links.map((l) => l.url),
  };
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${SITE}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${SITE}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${SITE}og.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(`${name}. ${headline}`)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${JSON.stringify(person).replace(/</g, "\\u003c")}</script>`,
  ].join("\n");
}

function body(data: Portfolio, sizes: Sizes): string {
  const prof = data.profile;
  const links = data.links
    .filter((l) => !isSite(l.url))
    .map((l) => {
      if (l.icon && !/^assets\/icons\/[\w-]+\.svg$/.test(l.icon)) throw new Error(`bad icon: ${l.icon}`);
      const icon = l.icon ? `<img src="${l.icon}" alt="" width="20" height="20">` : "";
      return `<li><a href="${href(l.url)}">${icon}${esc(l.label)}</a></li>`;
    });
  const sections = Object.keys(HEADINGS).flatMap((g) => {
    const projects = data.projects.filter((p) => p.group === g);
    if (!projects.length) return [];
    const note = g === "coursework" ? `<p class="note">${COURSEWORK_NOTE}</p>\n` : "";
    const articles = projects.map((p) => article(p, sizes)).join("\n");
    return [`<section aria-labelledby="${g}">\n<h2 id="${g}">${HEADINGS[g]}</h2>\n${note}${articles}\n</section>`];
  });
  const unknown = data.projects.find((p) => !(p.group in HEADINGS));
  if (unknown) throw new Error(`unknown group ${unknown.group} for ${unknown.id}`);
  // Every project, grouped as on the page and in the 3D rail; plain links to the articles.
  const groups = Object.keys(HEADINGS).flatMap((g) => {
    const items = data.projects
      .filter((p) => p.group === g)
      .map((p) => `<li><a href="#${p.id}">${esc(need(p.title, `projects[${p.id}].title`))}</a></li>`);
    return items.length ? [`<li><span>${HEADINGS[g]}</span>\n<ul>\n${items.join("\n")}\n</ul></li>`] : [];
  });
  const toc =
    `<nav aria-label="Projects"><details id="toc">` +
    `<summary>Projects (${data.projects.length})</summary>\n<ul>\n${groups.join("\n")}\n</ul></details></nav>`;
  // Joined into one line, as in the profile README; an empty field is skipped.
  const facts = [need(prof.education, "profile.education"), prof.location, prof.availability].filter(Boolean);
  return [
    "<header>",
    `<h1>${esc(need(prof.name, "profile.name"))}</h1>`,
    `<p class="headline">${esc(prof.headline)}</p>`,
    `<p>${esc(facts.join(" "))}</p>`,
    `<ul class="links">\n${links.join("\n")}\n</ul>`,
    // In place from the first paint, so showing it shifts nothing; a noscript style in index.html
    // hides it when JavaScript is off.
    `<div id="power-row"><p><button id="power" type="button">Open in 3D</button>` +
      ` <span class="note">The same projects in a 3D scene.</span></p>` +
      `<p id="power-status" class="note" role="status"></p></div>`,
    `<p class="note">${esc(need(prof.provenance, "profile.provenance"))}</p>`,
    "</header>",
    toc,
    `<main>\n${sections.join("\n")}\n</main>`,
    `<footer><p>Built from <a href="${CONTENT_SOURCE}">the profile README's content file</a>.` +
      ` <a href="${SOURCE_REPO}">Source of this site</a>.</p></footer>`,
  ].join("\n");
}

export function renderPage(template: string, data: Portfolio, sizes: Sizes): string {
  for (const marker of ["<!--head-->", "<!--body-->"]) {
    if (!template.includes(marker)) throw new Error(`index.html has no ${marker} marker`);
  }
  return template.replace("<!--head-->", () => head(data)).replace("<!--body-->", () => body(data, sizes));
}
