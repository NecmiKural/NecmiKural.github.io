import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Portfolio } from "../scripts/render.ts";

// When 3D mode opens on its own (src/main.ts), in the "3d" project: Chromium with WebGL 2 in
// software. Desktops and tablets open it after the HTML page has painted; phones, reduced motion,
// Save-Data, no WebGL 2, a visitor who powered it off, and one who has already started on the
// page stay on the HTML page.

const data: Portfolio = JSON.parse(readFileSync("content/portfolio.json", "utf8"));
const deck = (page: Page) => page.locator("#deck");
const ready = (page: Page) => expect(page.locator("#deck [role=status]")).toHaveText(/3D mode on/);
// Absence needs a wait: the page has loaded and had time to open 3D mode if it was going to.
const settled = async (page: Page) => {
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
};
// It had time to open 3D mode and did not: no deck, and the 3D code was not even asked for (it is,
// two frames after load, long before a deck appears).
async function stays(page: Page) {
  await settled(page);
  await expect(deck(page)).toHaveCount(0);
  const asked = await page.evaluate(() => performance.getEntriesByType("resource").some((e) => /\/assets\/boot-[^/]*\.js$/.test(e.name)));
  expect(asked).toBe(false);
}
// Holds back the requests matching `url` until `release()`; `requested` settles when the first
// one is made. Holding a header icon holds the load event; holding the boot chunk holds 3D mode
// while it downloads.
async function hold(page: Page, url: string | RegExp) {
  let release = () => {};
  let seen = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const requested = new Promise<void>((r) => (seen = r));
  await page.route(url, async (route) => {
    seen();
    await gate;
    await route.continue();
  });
  return { requested, release: () => release() };
}
const ICON = "**/assets/icons/github.svg";
const BOOT = /\/assets\/boot-[^/]*\.js$/;

test("a desktop opens straight into 3D after the page has loaded and painted, and powering off sticks", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { opened?: number };
    new MutationObserver(() => {
      if (document.getElementById("deck")) w.opened ??= performance.now();
    }).observe(document, { childList: true, subtree: true }); // init scripts run before <html> exists
  });
  await page.goto("/");
  await test.step("opens on its own", () => ready(page));
  const [paint, loaded, opened] = await page.evaluate(() => [
    performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? Infinity,
    (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).loadEventEnd,
    (window as unknown as { opened: number }).opened,
  ]);
  expect(paint).toBeLessThan(opened);
  expect(loaded).toBeGreaterThan(0);
  expect(loaded).toBeLessThan(opened);
  await expect(page.locator("#deck .rail button").first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(deck(page)).toHaveCount(0);
  await expect(page.locator("#power")).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("nk.3d"))).toBe("off");
  await page.reload();
  await stays(page);

  // Asking again opens it, and from then on it opens on its own again.
  await page.locator("#power").click();
  await test.step("opens when asked", () => ready(page));
  expect(await page.evaluate(() => localStorage.getItem("nk.3d"))).toBe("on");
  await page.reload();
  await test.step("opens on its own after a reload", () => ready(page));
});

test("it waits for the load event", async ({ page }) => {
  const load = await hold(page, ICON);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await expect(deck(page)).toHaveCount(0);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some((e) => /\/assets\/boot-/.test(e.name)))).toBe(false);
  load.release();
  await ready(page);
});

// A phone's screen is its own size; the desktop profile this project starts from has a large one.
for (const [name, viewport, touch] of [
  ["a 600 px window with a mouse", { width: 600, height: 800 }, false],
  ["an upright tablet", { width: 768, height: 1024 }, true],
  ["a tablet on its side", { width: 1024, height: 768 }, true],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: touch, isMobile: touch, ...(touch ? { screen: viewport } : {}) });

    test("opens 3D mode on its own", async ({ page }) => {
      await page.goto("/");
      await ready(page);
    });
  });
}

for (const [name, viewport, touch] of [
  ["at 599 px wide with a mouse", { width: 599, height: 800 }, false],
  ["on a phone", { width: 390, height: 844 }, true],
  ["on a phone held sideways", { width: 844, height: 390 }, true],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: touch, isMobile: touch, ...(touch ? { screen: viewport } : {}) });

    test("the HTML page stays, with an Open in 3D button that works", async ({ page }) => {
      await page.goto("/");
      await stays(page);
      const button = page.locator("#power");
      await expect(button).toHaveText("Open in 3D");
      if (touch || viewport.width < 600) {
        const box = (await button.boundingBox()) as { width: number; height: number };
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThan(300);
      }
      await (touch ? button.tap() : button.click());
      await ready(page);
    });
  });
}

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("3D mode does not open on its own", async ({ page }) => {
    await page.goto("/");
    await stays(page);
  });
});

test("with Save-Data, 3D mode does not open on its own", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true } }));
  await page.goto("/");
  await stays(page);
});

test("without WebGL 2, nothing opens, nothing more loads and nothing is said", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext as (...args: unknown[]) => unknown;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      return args[0] === "webgl2" ? null : original.apply(this, args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith(".js")) scripts.push(new URL(r.url()).pathname);
  });
  await page.goto("/");
  await settled(page);
  await expect(deck(page)).toHaveCount(0);
  expect(scripts).toHaveLength(1); // the entry script only
  await expect(page.locator("#power-status")).toHaveText("");
});

test("if 3D mode fails to load on its own, nothing is said", async ({ page }) => {
  await page.route(/\/assets\/boot-[^/]*\.js$/, (route) => route.abort());
  await page.goto("/");
  await settled(page);
  await expect(deck(page)).toHaveCount(0);
  await expect(page.locator("#power-status")).toHaveText("");
});

test.describe("a visitor who has started on the page keeps it", () => {
  test("arriving at a project's link", async ({ page }) => {
    await page.goto(`/#${data.projects[1].id}`);
    await stays(page);
  });

  test("moving focus before the page has loaded", async ({ page }) => {
    const load = await hold(page, ICON);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Tab");
    load.release();
    await stays(page);
  });

  test("moving focus while 3D mode downloads", async ({ page }) => {
    const chunk = await hold(page, BOOT);
    await page.goto("/");
    await chunk.requested;
    await page.keyboard.press("Tab");
    chunk.release();
    await page.waitForTimeout(1500);
    await expect(deck(page)).toHaveCount(0);
  });

  test("pressing Open in 3D while it downloads: it opens once", async ({ page }) => {
    const chunk = await hold(page, BOOT);
    await page.goto("/");
    await chunk.requested;
    await page.locator("#power").click();
    chunk.release();
    await ready(page);
    await page.waitForTimeout(1000);
    await expect(deck(page)).toHaveCount(1);
  });

  test("opening 3D mode before the page has loaded: it opens once", async ({ page }) => {
    const load = await hold(page, ICON);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("#power").click();
    await ready(page);
    load.release();
    await settled(page);
    await expect(deck(page)).toHaveCount(1);
  });

  test("powering 3D mode off before the page has loaded: it stays off", async ({ page }) => {
    const load = await hold(page, ICON);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("#power").click();
    await ready(page);
    await page.keyboard.press("Escape");
    await expect(deck(page)).toHaveCount(0);
    load.release();
    await settled(page);
    await expect(deck(page)).toHaveCount(0);
  });
});
