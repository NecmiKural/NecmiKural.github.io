import { existsSync, readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { LEFT_OUT } from "../scripts/latest.ts";
import { esc, isSite, SITE, type Portfolio } from "../scripts/render.ts";

const data: Portfolio = JSON.parse(readFileSync("content/portfolio.json", "utf8"));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
// The side list's targets in page order: "Try it", then every project.
const TARGETS = [...(data.try.length ? ["try"] : []), ...data.projects.map((p) => p.id)];
const DAY = new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("every project, claim and profile link is on the page", async ({ page }) => {
    await page.goto("/");
    for (const p of data.projects) await expect(page.locator(`#${p.id} h3`)).toBeVisible();
    const text = norm(await page.locator("main").innerText());
    for (const p of data.projects) for (const c of p.claims) expect(text).toContain(norm(c.text));
    for (const l of data.links.filter((l) => !isSite(l.url))) {
      await expect(page.locator(`header a[href="${l.url}"]`)).toBeVisible();
    }
    await expect(page.locator("#power-row")).toBeHidden();
  });

  test("the hero's two calls to action reach the work and Try it", async ({ page }) => {
    await page.goto("/");
    for (const [name, id] of [["See the work", "flagship"], ["Try a demo", "try"]]) {
      await page.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
  });

  test("the project list opens and links to every project", async ({ page }) => {
    await page.goto("/");
    const list = page.getByRole("navigation", { name: "Projects" });
    await list.locator("summary").click();
    const links = list.getByRole("link");
    await expect(links).toHaveCount(TARGETS.length);
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual(TARGETS.map((id) => `#${id}`));
    const last = data.projects.at(-1) as Portfolio["projects"][number];
    await links.last().click();
    await expect(page.locator(`#${last.id}`)).toBeInViewport();
  });
});

test.describe("the project list", () => {
  const marked = (page: Page) => page.locator("#toc a[aria-current]");

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1280, height: 500 }, // shorter than the list, which then scrolls inside itself
  ]) {
    test(`beside the content at ${viewport.width} x ${viewport.height}: every link reaches its project, which is the one marked`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const list = page.getByRole("navigation", { name: "Projects" });
      const links = list.getByRole("link");
      await expect(links.first()).toBeVisible(); // open without a click
      await expect(marked(page)).toHaveCount(0); // nothing read yet at the top
      // From the top of the page, the end of the list can be scrolled into view.
      await page.locator("#toc").evaluate((d) => (d.scrollTop = d.scrollHeight));
      await expect(links.last()).toBeInViewport({ ratio: 1 });
      const main = (await page.locator("main").boundingBox()) as { x: number };
      expect(((await list.boundingBox()) as { x: number }).x).toBeLessThan(main.x);
      await expect(links).toHaveCount(TARGETS.length);
      for (const [i, id] of TARGETS.entries()) {
        await links.nth(i).click();
        await expect(page).toHaveURL(new RegExp(`#${id}$`));
        await expect(page.locator(`#${id}`)).toBeInViewport();
        await expect(links.nth(i)).toBeInViewport(); // the list stays in view, all of it reachable
        await expect(marked(page)).toHaveCount(1);
        await expect(links.nth(i)).toHaveAttribute("aria-current", "location");
      }
    });
  }

  test("an old link target does not keep the mark once read past", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/#${data.projects[0].id}`);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const links = page.getByRole("navigation", { name: "Projects" }).getByRole("link");
    await expect(links.last()).toHaveAttribute("aria-current", "location"); // the foot of the page
    await expect(marked(page)).toHaveCount(1);
  });

  test("it becomes a column at 1080 px and folds away below, as the window changes", async ({ page }) => {
    await page.setViewportSize({ width: 1079, height: 800 });
    await page.goto("/");
    const list = page.getByRole("navigation", { name: "Projects" });
    await expect(list.locator("summary")).toBeVisible();
    await expect(list.getByRole("link").first()).toBeHidden();
    await page.setViewportSize({ width: 1080, height: 800 });
    await expect(list.getByRole("link").first()).toBeVisible();
    await expect(list.locator("summary")).toBeHidden();
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(list.getByRole("link").first()).toBeHidden();
  });

  test("collapsed at the top on a phone, and it works when opened", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const list = page.getByRole("navigation", { name: "Projects" });
    const summary = list.locator("summary");
    await expect(summary).toHaveText(`Projects (${data.projects.length})`);
    await expect(list.getByRole("link").first()).toBeHidden();
    const box = (await list.boundingBox()) as { height: number };
    expect(box.height).toBeLessThan(60); // one line until opened
    await summary.click();
    const p = data.projects[4];
    await list.getByRole("link", { name: p.title, exact: true }).click();
    await expect(page.locator(`#${p.id} h3`)).toBeInViewport();
  });
});

test.describe("project visuals", () => {
  // Every visual on the page: its project, its place among the project's visuals, and the file the
  // build serves it as (the main one under the project's id, the next as id-2, and so on).
  const shown = data.projects.flatMap((p) => p.visuals.map((v, i) => ({ p, v, i, name: i ? `${p.id}-${i + 1}` : p.id })));
  const moving = shown.filter(({ v }) => v.url.endsWith(".gif"));
  const at = (page: Page, { p, i }: { p: { id: string }; i: number }) => page.locator(`#${p.id} figure`).nth(i);
  const loaded = (img: Locator) => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0);

  test("each is served by this site, sized, described, captioned, lazy, and in full view once scrolled to", async ({ page }) => {
    await page.goto("/");
    expect(shown.length).toBeGreaterThan(0);
    for (const item of shown) {
      const { v, name } = item;
      const img = at(page, item).locator("img.visual");
      await expect(img).toHaveAttribute("src", new RegExp(`^visuals/${name}(-still)?\\.(svg|png|gif)$`));
      await expect(img).toHaveAttribute("alt", v.alt);
      await expect(img).toHaveAttribute("loading", "lazy");
      const [w, h] = [Number(await img.getAttribute("width")), Number(await img.getAttribute("height"))];
      expect(w > 0 && h > 0, name).toBe(true);
      if (v.caption) await expect(at(page, item).locator("figcaption")).toHaveText(v.caption);
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => loaded(img), { message: name }).toBe(true);
      // A raster image (a GIF's still or the GIF itself) is the size it says; an SVG's own size depends on the browser.
      if (!v.url.endsWith(".svg")) expect(await img.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight]), name).toEqual([w, h]);
      await expect(img).toHaveCSS("opacity", "1");
    }
  });

  test("each holds its space before its file arrives, so nothing shifts when it does", async ({ page }) => {
    await page.route("**/visuals/**", () => {});
    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const item of shown) {
      const img = at(page, item).locator("img.visual");
      const [w, h] = [Number(await img.getAttribute("width")), Number(await img.getAttribute("height"))];
      const box = await img.boundingBox();
      expect(box?.width, item.name).toBeGreaterThan(200);
      expect(Math.abs((box?.height ?? 0) - ((box?.width ?? 0) * h) / w), item.name).toBeLessThan(3);
    }
  });

  test("portrait screenshots sit side by side on a wide screen, each in a narrow column of its own", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    // The first two portrait figures of the first project that has two; failing, not skipping, if none does.
    const rects = await page.evaluate(() => {
      const article = [...document.querySelectorAll("article")].find((a) => a.querySelectorAll("figure.tall").length >= 2);
      return [...(article?.querySelectorAll("figure.tall") ?? [])].slice(0, 2).map((f) => f.getBoundingClientRect().toJSON());
    });
    expect(rects.length, "a project with two portrait screenshots").toBe(2);
    const [a, b] = rects;
    expect(b.top).toBe(a.top);
    expect(b.left).toBeGreaterThan(a.right);
    expect(a.width).toBeGreaterThan(200);
    expect(a.width).toBeLessThan(320); // a column of its own, not stretched to share the row
  });

  test("they rise into place as they scroll into view, where the browser can tie that to scrolling", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await page.evaluate(() => CSS.supports("animation-timeline: view()"))), "no scroll-driven animations here");
    expect(await page.locator("img.visual").first().evaluate((i) => getComputedStyle(i).animationName)).toBe("rise");
  });

  test("on paper every visual shows, none left mid-rise", async ({ page }) => {
    await page.emulateMedia({ media: "print" });
    await page.goto("/");
    for (const item of shown) await expect(at(page, item).locator("img.visual"), item.name).toHaveCSS("opacity", "1");
  });

  test("a moving visual plays on its own, and its button stops it and plays it again", async ({ page }) => {
    expect(moving.length).toBeGreaterThan(0);
    await page.goto("/");
    for (const item of moving) {
      const { p, name } = item;
      const img = at(page, item).locator("img.visual");
      const button = at(page, item).locator("button.play");
      await expect(img).toHaveAttribute("src", `visuals/${name}.gif`);
      await expect(button).toHaveAccessibleName(`Stop the demo of ${p.title}`);
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => loaded(img), { message: name }).toBe(true);
      await button.click();
      await expect(img).toHaveAttribute("src", `visuals/${name}-still.gif`);
      await expect(button).toHaveAccessibleName(`Play the demo of ${p.title}`);
      await button.click();
      await expect(img).toHaveAttribute("src", `visuals/${name}.gif`);
      await expect(button).toHaveAccessibleName(`Stop the demo of ${p.title}`);
    }
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("nothing moves: no visual animates, and a GIF holds its first frame until played", async ({ page }) => {
      await page.goto("/");
      for (const item of shown) {
        const img = at(page, item).locator("img.visual");
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => loaded(img), { message: item.name }).toBe(true);
        expect(await img.evaluate((i) => getComputedStyle(i).animationName), item.name).toBe("none");
      }
      for (const item of moving) {
        await expect(at(page, item).locator("img.visual")).toHaveAttribute("src", `visuals/${item.name}-still.gif`);
        await expect(at(page, item).locator("button.play")).toHaveAccessibleName(`Play the demo of ${item.p.title}`);
      }
    });
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("a moving visual stays on its first frame, with no button that cannot work", async ({ page }) => {
      await page.goto("/");
      for (const item of moving) {
        await expect(at(page, item).locator("img.visual")).toHaveAttribute("src", `visuals/${item.name}-still.gif`);
        await expect(at(page, item).locator("button.play")).toBeHidden();
      }
    });
  });
});

test.describe("the hero, Try it and Latest", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${colorScheme}: the heading is the name and role in text, with the banner in the scheme's colours, fetched first`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: `${data.profile.name}, software engineer`, exact: true })).toBeVisible();
      const img = page.locator("h1 img.banner");
      await expect(img).toHaveAttribute("alt", "");
      await expect(img).toHaveAttribute("fetchpriority", "high");
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      expect(await img.evaluate((i: HTMLImageElement) => i.currentSrc)).toMatch(new RegExp(`/assets/banner-${colorScheme}\\.svg$`));
    });
  }

  test("Try it comes first and lists every working thing, each with its project", async ({ page }) => {
    expect(data.try.length).toBeGreaterThan(0);
    await page.goto("/");
    expect(await page.locator("main > section").first().getAttribute("aria-labelledby")).toBe("try");
    const rows = page.locator("table.try tbody tr");
    await expect(rows).toHaveCount(data.try.length);
    for (const [i, t] of data.try.entries()) {
      const row = rows.nth(i);
      await expect(row.getByRole("link", { name: t.name, exact: true })).toHaveAttribute("href", t.url);
      await expect(row.locator("a.of")).toHaveAttribute("href", `#${t.project}`);
      await expect(page.locator(`#${t.project}`)).toHaveCount(1);
      await expect(row.locator("td")).toHaveText([t.kind, t.see, t.note ?? ""]);
    }
  });

  test("the Latest strip, when the build could fetch it, shows real dates and real links", async ({ page }) => {
    await page.goto("/");
    // Skipped only when the build recorded that it left the strip out (an API request failed);
    // a strip missing for any other reason is a bug.
    test.skip(existsSync(LEFT_OUT), `the build left the strip out: ${existsSync(LEFT_OUT) ? readFileSync(LEFT_OUT, "utf8") : ""}`);
    const strip = page.locator("p.latest");
    await expect(strip).toHaveCount(1);
    const times = strip.locator("time");
    await expect(times).toHaveCount(2);
    for (const time of await times.all()) {
      const iso = (await time.getAttribute("datetime")) as string;
      expect(Date.parse(iso)).toBeLessThanOrEqual(Date.now());
      await expect(time).toHaveText(DAY.format(new Date(iso)));
    }
    const [release, update] = await strip.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(release).toMatch(/^https:\/\/github\.com\/NecmiKural\/[\w.-]+\/releases\/tag\//);
    expect(data.try.map((t) => t.url)).toContain(update);
  });
});

test("the CV the header links to is served by this site, as a PDF", async ({ request }) => {
  const cv = data.links.find((l) => l.label.startsWith("CV"));
  expect(cv?.url).toMatch(/^https:\/\/necmikural\.github\.io\/cv\/[\w.-]+\.pdf$/);
  const path = new URL(cv?.url as string).pathname;
  expect(existsSync(`dist${path}`), `dist${path}`).toBe(true);
  const res = await request.get(path);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
});

// What a crawler gets without running any script: the raw HTML and the files beside it. However
// the 3D mode changes, this keeps the content readable to search engines and AI agents.
test.describe("for search engines and AI crawlers", () => {
  const get = async (request: APIRequestContext, path: string) => {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    return res.text();
  };

  test("the raw HTML has the name, the role and every project, and its JSON-LD parses", async ({ request }) => {
    const html = await get(request, "/");
    expect(html).toMatch(new RegExp(`<h1>.*<span class="role">${data.profile.name}, software engineer</span></h1>`));
    for (const p of data.projects) {
      expect(html).toContain(`<article id="${p.id}">`);
      expect(html).toContain(`href="${esc(p.urls.repo)}">${esc(p.title)}</a></h3>`);
    }
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
    expect(scripts).toHaveLength(1);
    const graph: Record<string, any>[] = JSON.parse(scripts[0][1])["@graph"];
    const page = graph.find((n) => n["@type"] === "ProfilePage");
    const person = graph.find((n) => n["@id"] === page?.mainEntity["@id"]);
    expect(person).toMatchObject({ "@type": "Person", name: data.profile.name, address: { addressCountry: "NZ" } });
    expect(data.profile.education).toContain(person?.alumniOf.name);
    expect(person?.sameAs).toContain(data.links.find((l) => l.label === "LinkedIn")?.url);
    const code = graph.filter((n) => n["@type"] === "SoftwareSourceCode");
    expect(code.map((c) => c.codeRepository)).toEqual(data.projects.filter((p) => p.group === "flagship").map((p) => p.urls.repo));
    for (const c of code) expect(c.author["@id"]).toBe(person?.["@id"]);
  });

  test("robots.txt lets every crawler in and names the sitemap, which lists the page", async ({ request }) => {
    const robots = await get(request, "/robots.txt");
    expect(robots).toContain("User-agent: *\n");
    expect(robots).toContain("\nAllow: /\n");
    expect(robots).not.toContain("Disallow");
    expect(robots).toContain(`Sitemap: ${SITE}sitemap.xml`);
    expect(await get(request, "/sitemap.xml")).toContain(`<loc>${SITE}</loc>`);
  });

  test("llms.txt names him and links every project, the demos and the profiles", async ({ request }) => {
    const llms = await get(request, "/llms.txt");
    expect(llms.startsWith(`# ${data.profile.name}, software engineer\n\n> ${data.profile.headline}\n`)).toBe(true);
    const urls = [...data.projects.map((p) => p.urls.repo), ...data.try.map((t) => t.url), ...data.links.filter((l) => !isSite(l.url)).map((l) => l.url)];
    for (const url of urls) expect(llms).toContain(`](${url})`);
  });
});

test("with JavaScript, the optional 3D mode is offered", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#power")).toBeVisible();
});

for (const { width, height } of VIEWPORTS) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${width}px ${colorScheme}: no overflow, intro above the fold, no axe violations`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      for (const selector of ["h1", ".headline", ".ctas", "header .links"]) {
        const box = await page.locator(selector).boundingBox();
        expect(box, selector).not.toBeNull();
        expect(box!.y + box!.height, `${selector} bottom`).toBeLessThanOrEqual(height);
      }
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
      // Kept for review in the CI artifact, not compared: fonts differ between machines. In CSS
      // pixels, so the long page at 320 px stays inside WebKit's 32767-pixel screenshot limit.
      await page.screenshot({ path: info.outputPath(`${width}-${colorScheme}.png`), fullPage: true, scale: "css" });
    });
  }
}
