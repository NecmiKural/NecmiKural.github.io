import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isSite, type Portfolio } from "../scripts/render.ts";

const data: Portfolio = JSON.parse(readFileSync("content/portfolio.json", "utf8"));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
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

  test("the project list opens and links to every project", async ({ page }) => {
    await page.goto("/");
    const list = page.getByRole("navigation", { name: "Projects" });
    await list.locator("summary").click();
    const links = list.getByRole("link");
    await expect(links).toHaveCount(data.projects.length);
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual(data.projects.map((p) => `#${p.id}`));
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
      for (const [i, p] of data.projects.entries()) {
        await links.nth(i).click();
        await expect(page).toHaveURL(new RegExp(`#${p.id}$`));
        await expect(page.locator(`#${p.id} h3`)).toBeInViewport();
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
      for (const selector of ["h1", ".headline", "header .links"]) {
        const box = await page.locator(selector).boundingBox();
        expect(box, selector).not.toBeNull();
        expect(box!.y + box!.height, `${selector} bottom`).toBeLessThanOrEqual(height);
      }
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
      // Kept for review in the CI artifact, not compared: fonts differ between machines.
      await page.screenshot({ path: info.outputPath(`${width}-${colorScheme}.png`), fullPage: true });
    });
  }
}
