import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { isSite, type Portfolio } from "../scripts/render.ts";

const data: Portfolio = JSON.parse(readFileSync("content/portfolio.json", "utf8"));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

// These test the HTML page itself, so 3D mode must not open on its own (see auto.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("nk.3d", "off"));
});

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
