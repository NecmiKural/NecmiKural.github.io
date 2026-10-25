import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isSite, type Portfolio } from "../scripts/render.ts";

// 3D mode, in the "3d" project: Chromium with WebGL 2 rendered in software (playwright.config.ts).
// The HTML page itself is tested in all three browsers in site.spec.ts.

const data: Portfolio = JSON.parse(readFileSync("content/portfolio.json", "utf8"));
const ids = data.projects.map((p) => p.id);
const rail = (page: Page, id: string) => page.locator(`#deck .rail button[data-id="${id}"]`);
const frames = async (page: Page) => Number(await page.locator("#deck canvas").getAttribute("data-frames"));

async function powerOn(page: Page) {
  await page.goto("/");
  await page.locator("#power").click();
  await expect(page.locator("#deck [role=status]")).toHaveText(/3D mode on/); // the scene is built
}

// Opens the focused rail button's project and closes it again.
async function openAndClose(page: Page) {
  await page.keyboard.press("Enter");
  await expect(page.locator("#panel-title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel")).toBeHidden();
}

test("every project opens from the rail by keyboard, and Escape steps back out", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await powerOn(page);
  for (const [i, p] of data.projects.entries()) {
    if (i > 0) await page.keyboard.press("ArrowDown");
    await expect(rail(page, p.id)).toBeFocused();
    await page.keyboard.press("Enter");
    const title = page.locator("#panel-title");
    await expect(title).toBeFocused();
    await expect(title).toHaveAccessibleName(p.title);
    await page.keyboard.press("Escape");
    await expect(page.locator("#panel")).toBeHidden();
    await expect(rail(page, p.id)).toBeFocused();
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#deck")).toHaveCount(0);
  await expect(page.locator("#power")).toBeFocused();
  expect(errors).toEqual([]);
});

test("focus order: header links, Power on, then the rail; arrows, Home and End move within it", async ({ page }) => {
  await page.goto("/");
  for (const l of data.links.filter((l) => !isSite(l.url))) {
    await page.keyboard.press("Tab");
    await expect(page.locator(`header a[href="${l.url}"]`)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(page.locator("#power")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rail(page, ids[0])).toBeFocused();
  expect(await page.locator("#deck .rail button").evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.id))).toEqual(ids);
  for (const id of ids.slice(1)) {
    await page.keyboard.press("Tab");
    await expect(rail(page, id)).toBeFocused();
  }
  await page.keyboard.press("Home");
  await expect(rail(page, ids[0])).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(rail(page, ids[1])).toBeFocused();
  await page.keyboard.press("End");
  await expect(rail(page, ids.at(-1) as string)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rail(page, ids.at(-2) as string)).toBeFocused();
  // Before the rail, in reverse: the toolbar.
  await page.keyboard.press("Home");
  for (const name of ["Power off", "Low power", "Sound", "Replay Deck"]) {
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#deck .bar").getByRole("button", { name, exact: true })).toBeFocused();
  }
  await expect(page.getByRole("button", { name: "Replay Deck" })).toHaveAttribute("aria-pressed", "true");
  await page.locator("#deck .bar").getByRole("button", { name: "Power off" }).press("Enter");
  await expect(page.locator("#deck")).toHaveCount(0);
  await expect(page.locator("#power")).toBeFocused();
});

test("powering on fetches no models, images or fonts, and nothing from other sites", async ({ page, baseURL }) => {
  await page.goto("/");
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.locator("#power").click();
  await expect(page.locator("#deck [role=status]")).toHaveText(/3D mode on/);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((u) => /\.(glb|gltf|png|jpe?g|webp|ktx2|woff2?)$/i.test(new URL(u).pathname))).toEqual([]);
  expect(requests.filter((u) => !u.startsWith(baseURL as string))).toEqual([]);
});

test("renders on demand: no frames while idle", async ({ page }) => {
  await powerOn(page);
  await expect.poll(() => frames(page)).toBeGreaterThan(0);
  await page.waitForTimeout(500); // the first highlight settles
  const idle = await frames(page);
  await page.waitForTimeout(1000);
  expect(await frames(page)).toBe(idle);
  await openAndClose(page);
  await expect(rail(page, ids[0])).toBeFocused();
  await page.waitForTimeout(1000); // the eject settles
  const after = await frames(page);
  expect(after).toBeGreaterThan(idle);
  await page.waitForTimeout(1000);
  expect(await frames(page)).toBe(after);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a project opens at once, without animation", async ({ page }) => {
    await powerOn(page);
    await page.evaluate(() => {
      const w = window as unknown as { t0?: number; t1?: number };
      const panel = document.getElementById("panel") as HTMLDialogElement;
      addEventListener("keydown", () => (w.t0 = performance.now()), { capture: true, once: true });
      new MutationObserver(() => {
        if (panel.open) w.t1 ??= performance.now();
      }).observe(panel, { attributes: true });
    });
    const before = await frames(page);
    await page.keyboard.press("Enter");
    await expect(page.locator("#panel-title")).toBeFocused();
    const ms = await page.evaluate(() => {
      const w = window as unknown as { t0: number; t1: number };
      return w.t1 - w.t0;
    });
    expect(ms).toBeLessThan(100);
    expect((await frames(page)) - before).toBeLessThanOrEqual(3); // a cut, not an animation
  });
});

test("sound is off by default, makes no AudioContext, and keeps the visitor's choice", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { made: number };
    const Original = window.AudioContext;
    w.made = 0;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.made++;
      }
    };
  });
  const made = () => page.evaluate(() => (window as unknown as { made: number }).made);
  const sound = page.locator("#deck .bar").getByRole("button", { name: "Sound" });
  await powerOn(page);
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await openAndClose(page);
  expect(await made()).toBe(0);
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  expect(await made()).toBe(1);
  await powerOn(page);
  await expect(sound).toHaveAttribute("aria-pressed", "true");
});

test("without WebGL 2 the page says so, loads no 3D code and keeps focus", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext as (...args: unknown[]) => unknown;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      return args[0] === "webgl2" ? null : original.apply(this, args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  const chunks: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith(".js")) chunks.push(r.url());
  });
  await page.locator("#power").click();
  await expect(page.locator("#power-status")).toHaveText(/needs WebGL 2/);
  await expect(page.locator("#power")).toBeFocused();
  await expect(page.locator("#deck")).toHaveCount(0);
  expect(chunks).toEqual([]);
});

test("a lost graphics context powers off and says why", async ({ page }) => {
  await powerOn(page);
  await page.evaluate(() =>
    (document.querySelector("#deck canvas") as HTMLCanvasElement)
      .getContext("webgl2")
      ?.getExtension("WEBGL_lose_context")
      ?.loseContext(),
  );
  await expect(page.locator("#deck")).toHaveCount(0);
  await expect(page.locator("#power-status")).toHaveText(/graphics context was lost/);
  await expect(page.locator("#power")).toBeFocused();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`${colorScheme}: no axe violations with the deck open and with a project open`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme });
    await powerOn(page);
    const scan = async () =>
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze())
        .violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`);
    expect(await scan()).toEqual([]);
    await page.screenshot({ path: info.outputPath(`deck-${colorScheme}.png`) });
    await page.keyboard.press("Enter");
    await expect(page.locator("#panel-title")).toBeFocused();
    expect(await scan()).toEqual([]);
    // Kept for review in the CI artifact, not compared: software rendering differs between machines.
    await page.screenshot({ path: info.outputPath(`panel-${colorScheme}.png`) });
  });
}
