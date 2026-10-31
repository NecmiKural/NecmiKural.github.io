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
// For the structured data (head below): facts the content file states only in prose. The
// university and the country are checked against that prose, so the two cannot drift apart.
const ROLE = "software engineer";
const UNIVERSITY = "University of Waikato";
const KNOWS_ABOUT = [
  "AI agents", "Tool calling", "Model Context Protocol (MCP)", "Retrieval-augmented generation (RAG)",
  "LLM evaluation", "Python", "PostgreSQL",
];
// Named in robots.txt so the welcome is explicit; "*" already lets every crawler in.
const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended"];

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
  visuals: { url: string; alt: string; caption: string | null }[];
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
// A working thing a visitor can open (a Space, a dataset, a notebook, a live app), for "Try it".
export interface TryItem {
  name: string;
  url: string;
  kind: string;
  project: string;
  see: string;
  note: string | null;
}
export interface Portfolio {
  profile: Record<
    "name" | "headline" | "education" | "location" | "availability" | "provenance",
    string
  >;
  links: Link[];
  projects: Project[];
  try: TryItem[];
}
// The newest release across the shown repos and the newest update to a Space or dataset in "Try
// it", fetched at build time (scripts/latest.ts). Null when a fetch failed: the strip is left out.
export interface Latest {
  release: { repo: string; tag: string; url: string; date: string };
  update: { name: string; kind: string; url: string; date: string };
}
// Each visual as served from public/visuals, by its URL: its file, its size, and for a moving
// image a still.
export type Sizes = Record<string, { width: number; height: number; file: string; still?: string }>;

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function need<T>(value: T | null | undefined, where: string): T {
  if (value === undefined || value === null || value === "") throw new Error(`missing ${where}`);
  return value;
}

function https(url: string): string {
  if (!url.startsWith("https://")) throw new Error(`link is not https: ${url}`);
  return url;
}

const href = (url: string): string => esc(https(url));

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
  // A moving image is served as its first frame, with data-play naming the moving one: src/main.ts
  // plays it and reveals the button that stops it. Without JavaScript the first frame stays.
  const visuals = p.visuals.map((pic) => {
    const v = need(sizes[pic.url], `${where} visual size`);
    const img =
      `<img class="visual" src="visuals/${v.still ?? v.file}"${v.still ? ` data-play="visuals/${v.file}"` : ""}` +
      ` alt="${esc(need(pic.alt, `${where}.visuals.alt`))}" width="${v.width}" height="${v.height}" loading="lazy" decoding="async">`;
    const play = v.still ? `<button class="play" type="button" hidden>Play the demo<span class="vh"> of ${esc(p.title)}</span></button>` : "";
    const caption = pic.caption ? `<figcaption>${esc(pic.caption)}</figcaption>` : "";
    // A portrait image (a phone screenshot) gets a narrow column, so two sit side by side (index.html).
    return `<figure class="figure${v.height > v.width ? " tall" : ""}">${img}${play}${caption}</figure>`;
  });
  const row = linkRow(p);
  return [
    `<article id="${p.id}">`,
    `<h3>${tape}${a(need(p.urls.repo, `${where}.urls.repo`), need(p.title, `${where}.title`))}</h3>`,
    `<p class="byline">${esc([byline, p.stack.join(", ")].filter(Boolean).join(SEP))}</p>`,
    `<p>${esc(need(p.card, `${where}.card`))}</p>`,
    claims.length ? `<ul class="claims">\n${claims.join("\n")}\n</ul>` : "",
    visuals.length ? `<div class="figures">${visuals.join("")}</div>` : "",
    row.length ? `<p class="more">${row.join(SEP)}</p>` : "",
    "</article>",
  ]
    .filter(Boolean)
    .join("\n");
}

// The page title and the text of its heading.
const titleOf = (data: Portfolio): string => `${need(data.profile.name, "profile.name")}, ${ROLE}`;

// Education, location and availability, joined into one line as in the profile README; an empty
// field is skipped.
const factsOf = (prof: Portfolio["profile"]): string =>
  [need(prof.education, "profile.education"), prof.location, prof.availability].filter(Boolean).join(" ");

// schema.org JSON-LD: the page is a profile page about the person, who wrote the selected projects.
function structuredData(data: Portfolio): object {
  const { name, headline, education, location } = data.profile;
  if (!education.includes(UNIVERSITY)) throw new Error(`profile.education does not name ${UNIVERSITY}`);
  if (!/Aotearoa|New Zealand/.test(location)) throw new Error("profile.location is not in New Zealand");
  const person = {
    "@type": "Person",
    "@id": `${SITE}#person`,
    name,
    url: SITE,
    jobTitle: ROLE[0].toUpperCase() + ROLE.slice(1),
    description: headline,
    alumniOf: { "@type": "CollegeOrUniversity", name: UNIVERSITY },
    address: { "@type": "PostalAddress", addressCountry: "NZ" },
    knowsAbout: KNOWS_ABOUT,
    // Profiles elsewhere; the site itself and the CV it serves are not.
    sameAs: data.links.filter((l) => new URL(l.url).origin !== new URL(SITE).origin).map((l) => l.url),
  };
  const code = data.projects
    .filter((p) => p.group === "flagship")
    .map((p) => ({
      "@type": "SoftwareSourceCode",
      "@id": `${SITE}#${p.id}`,
      name: p.title,
      description: p.card,
      codeRepository: p.urls.repo,
      keywords: p.stack,
      author: { "@id": person["@id"] },
    }));
  const page = { "@type": "ProfilePage", "@id": SITE, url: SITE, name: titleOf(data), mainEntity: { "@id": person["@id"] } };
  return { "@context": "https://schema.org", "@graph": [page, person, ...code] };
}

function head(data: Portfolio): string {
  const { name, headline } = data.profile;
  const title = titleOf(data);
  const description = need(headline, "profile.headline");
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
    `<script type="application/ld+json">${JSON.stringify(structuredData(data)).replace(/</g, "\\u003c")}</script>`,
  ].join("\n");
}

const DAY = new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function when(iso: string): string {
  if (Number.isNaN(Date.parse(iso))) throw new Error(`not a date: ${iso}`);
  return `<time datetime="${esc(iso)}">${DAY.format(new Date(iso))}</time>`;
}

export function latestStrip(latest: Latest | null): string {
  if (!latest) return "";
  const { release: r, update: u } = latest;
  return (
    `<p class="latest"><span class="label">Latest</span>` +
    ` <span>Release <a href="${href(r.url)}">${esc(r.tag)}</a> of ${esc(r.repo)}, ${when(r.date)}</span>` +
    ` <span>${esc(u.kind)} <a href="${href(u.url)}">${esc(u.name)}</a> updated ${when(u.date)}</span></p>`
  );
}

// "Try it": one row per working thing, with the project it belongs to. On phones the rows stack
// (index.html), so the table elements carry their roles explicitly to keep their meaning.
function tryIt(data: Portfolio): string {
  if (!data.try.length) return "";
  const rows = data.try.map((t) => {
    const p = need(data.projects.find((x) => x.id === t.project), `try ${t.name}: project ${t.project}`);
    return (
      `<tr role="row"><th role="rowheader" scope="row"><a href="${href(t.url)}">${esc(need(t.name, "try.name"))}</a>` +
      ` <a class="of" href="#${p.id}">${esc(p.title)}</a></th>` +
      `<td role="cell" data-label="Type">${esc(need(t.kind, "try.kind"))}</td>` +
      `<td role="cell" data-label="What you'll see">${esc(need(t.see, "try.see"))}</td>` +
      `<td role="cell" data-label="Note" class="note">${esc(t.note ?? "")}</td></tr>`
    );
  });
  const cols = ["Name", "Type", "What you'll see", "Note"].map((c) => `<th role="columnheader" scope="col">${esc(c)}</th>`);
  return [
    `<section aria-labelledby="try">`,
    `<h2 id="try">Try it</h2>`,
    `<p class="note">Working things you can open in the browser now.</p>`,
    `<table class="try" role="table" aria-labelledby="try">`,
    `<thead><tr role="row">${cols.join("")}</tr></thead>`,
    `<tbody>\n${rows.join("\n")}\n</tbody></table>`,
    `</section>`,
  ].join("\n");
}

// The banner's size, as drawn by the profile repo (tests/render.test.ts reads it from the files).
export const BANNER = { width: 1200, height: 240 };

function body(data: Portfolio, sizes: Sizes, latest: Latest | null): string {
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
  const tryLink = data.try.length ? [`<li><a href="#try">Try it</a></li>`] : [];
  const toc =
    `<nav aria-label="Projects"><details id="toc">` +
    `<summary>Projects (${data.projects.length})</summary>\n<ul>\n${[...tryLink, ...groups].join("\n")}\n</ul></details></nav>`;
  // The profile README's banner, the dark one for a dark scheme, sits in the heading above its text
  // (name and role), which is what search engines and screen readers read; so the banner's alt is
  // empty. It is the first thing painted, so it is fetched first.
  const banner =
    `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">` +
    `<img class="banner" src="assets/banner-light.svg" alt="" width="${BANNER.width}" height="${BANNER.height}" fetchpriority="high"></picture>`;
  const ctas = [
    data.projects.some((p) => p.group === "flagship") ? `<a class="cta primary" href="#flagship">See the work</a>` : "",
    data.try.length ? `<a class="cta" href="#try">Try a demo</a>` : "",
  ].filter(Boolean);
  return [
    "<header>",
    `<h1>${banner}<span class="role">${esc(titleOf(data))}</span></h1>`,
    `<p class="headline">${esc(prof.headline)}</p>`,
    `<p>${esc(factsOf(prof))}</p>`,
    ctas.length ? `<p class="ctas">${ctas.join(" ")}</p>` : "",
    `<ul class="links">\n${links.join("\n")}\n</ul>`,
    // In place from the first paint, so showing it shifts nothing; a noscript style in index.html
    // hides it when JavaScript is off.
    `<div id="power-row"><p><button id="power" type="button">Open in 3D</button>` +
      ` <span class="note">The same projects in a 3D scene.</span></p>` +
      `<p id="power-status" class="note" role="status"></p></div>`,
    latestStrip(latest),
    `<p class="note">${esc(need(prof.provenance, "profile.provenance"))}</p>`,
    "</header>",
    toc,
    `<main>\n${[tryIt(data), ...sections].filter(Boolean).join("\n")}\n</main>`,
    `<footer><p>Built from <a href="${CONTENT_SOURCE}">the profile README's content file</a>.` +
      ` <a href="${SOURCE_REPO}">Source of this site</a>.</p></footer>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderPage(template: string, data: Portfolio, sizes: Sizes, latest: Latest | null = null): string {
  for (const marker of ["<!--head-->", "<!--body-->"]) {
    if (!template.includes(marker)) throw new Error(`index.html has no ${marker} marker`);
  }
  return template.replace("<!--head-->", () => head(data)).replace("<!--body-->", () => body(data, sizes, latest));
}

// llms.txt (llmstxt.org): the page as Markdown for language models, from the same content.
function llms(data: Portfolio): string {
  const item = (text: string, url: string, note?: string | null) => `- [${text}](${https(url)})${note ? `: ${note}` : ""}`;
  const linkedin = need(data.links.find((l) => l.label === "LinkedIn"), "a LinkedIn link");
  const projects = (groups: string[]) =>
    data.projects.filter((p) => groups.includes(p.group)).map((p) => item(p.title, p.urls.repo, `${p.card} (${p.byline})`));
  return [
    `# ${titleOf(data)}`,
    "",
    `> ${data.profile.headline}`,
    "",
    factsOf(data.profile),
    "",
    `To get in touch, use [LinkedIn](${https(linkedin.url)}). The page ${SITE} has every project below, with figures quoted from each project's README and a link to their source.`,
    "",
    `## ${HEADINGS.flagship}`,
    "",
    ...projects(["flagship"]),
    "",
    "## Try it",
    "",
    ...data.try.map((t) => item(t.name, t.url, `${t.kind}. ${t.see}`)),
    "",
    "## Links",
    "",
    ...data.links.filter((l) => !isSite(l.url)).map((l) => item(l.label, l.url)),
    "",
    "## Optional",
    "",
    ...projects(Object.keys(HEADINGS).filter((g) => g !== "flagship")),
    "",
  ].join("\n");
}

// Files served beside the page for crawlers: robots.txt lets every one in, the sitemap lists the
// page and the files it links to on this site (the CV), and llms.txt is above.
export function crawlerFiles(data: Portfolio): Record<string, string> {
  const served = [SITE, ...data.links.filter((l) => l.url.startsWith(SITE)).map((l) => l.url)];
  return {
    "robots.txt": [...["*", ...AI_CRAWLERS].map((a) => `User-agent: ${a}`), "Allow: /", "", `Sitemap: ${SITE}sitemap.xml`, ""].join("\n"),
    "sitemap.xml": [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...served.map((u) => `<url><loc>${href(u)}</loc></url>`),
      `</urlset>`,
      "",
    ].join("\n"),
    "llms.txt": llms(data),
  };
}
