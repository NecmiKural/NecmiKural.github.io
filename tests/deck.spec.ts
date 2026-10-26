import { readdirSync, readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isSite, type Portfolio } from "../scripts/render.ts";

// 3D mode, in the "3d" project: Chromium with WebGL 2 rendered in software (playwright.config.ts).
// The HTML page itself is tested in all three browsers in site.spec.ts. Engine tests run once; the
// scene tests run for every scene in src/scenes.

const data: Portfolio = JSON.parse(readFileSync("content/portfolio.json", "utf8"));
const ids = data.projects.map((p) => p.id);
const SCENES = readdirSync("src/scenes")
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.slice(0, -3));
const rail = (page: Page, id: string) => page.locator(`#deck .rail button[data-id="${id}"]`);
const bar = (page: Page, name: string) => page.locator("#deck .bar").getByRole("button", { name, exact: true });
const frames = async (page: Page) => Number(await page.locator("#deck canvas").getAttribute("data-frames"));
const held = (page: Page) => page.locator("#deck canvas"); // data-held: the project the scene holds
// Scenes with an ambient animation (Stage.ambient): they draw a few frames a second while idle.
const AMBIENT = new Set(["lab"]);

// With a scene id, also checks that this scene is the one running: a scene that fails to load or
// is not registered falls back to the default, which would otherwise pass its tests.
async function powerOn(page: Page, scene?: string) {
  await page.goto("/");
  await page.locator("#power").click();
  await expect(page.locator("#deck [role=status]")).toHaveText(/3D mode on/); // the scene is built
  if (scene) await expect(page.locator(`#deck .scenes button[data-scene="${scene}"]`)).toHaveAttribute("aria-pressed", "true");
}

// Opens the focused rail button's project and closes it again.
async function openAndClose(page: Page) {
  await page.keyboard.press("Enter");
  await expect(page.locator("#panel-title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel")).toBeHidden();
}

test("focus order: header links, Open in 3D, then the rail; arrows, Home and End move within it", async ({ page }) => {
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
  for (const name of ["Power off", "Low power", "Sound", "Signal Box", "Glovebox", "Switchboard", "Replay Deck", "Lab"]) {
    await page.keyboard.press("Shift+Tab");
    await expect(bar(page, name)).toBeFocused();
  }
  await bar(page, "Power off").press("Enter");
  await expect(page.locator("#deck")).toHaveCount(0);
  await expect(page.locator("#power")).toBeFocused();
});

test("Lab is the default; the switcher loads each scene's chunk on demand and keeps the choice", async ({ page }) => {
  const chunks: string[] = [];
  page.on("request", (r) => chunks.push(new URL(r.url()).pathname));
  await powerOn(page);
  await expect(bar(page, "Lab")).toHaveAttribute("aria-pressed", "true");
  await expect(bar(page, "Switchboard")).toHaveAttribute("aria-pressed", "false");
  const others = SCENES.filter((s) => s !== "lab");
  expect(chunks.filter((c) => others.some((s) => c.includes(`/${s}-`)))).toEqual([]); // nothing loads unasked
  const before = await frames(page);
  await bar(page, "Switchboard").click();
  await expect(bar(page, "Switchboard")).toHaveAttribute("aria-pressed", "true");
  await expect(bar(page, "Lab")).toHaveAttribute("aria-pressed", "false");
  expect(chunks.filter((c) => c.includes("/switchboard-"))).toHaveLength(1);
  await expect.poll(() => frames(page)).toBeGreaterThan(before);
  // The new scene works: a project opens and closes in it.
  await rail(page, ids[0]).focus();
  await openAndClose(page);
  await expect(held(page)).toHaveAttribute("data-held", "");
  await powerOn(page);
  await expect(bar(page, "Switchboard")).toHaveAttribute("aria-pressed", "true");
});

test("at 320 px, nothing in 3D mode runs off the side, with every scene's button", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await powerOn(page);
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#deck, #deck .bar, #deck .rail")].map((e) => e.scrollWidth - e.clientWidth),
  );
  expect(overflow).toEqual([0, 0, 0]);
  await expect(page.locator("#deck .scenes button")).toHaveCount(SCENES.length);
});

test("a project chosen while 3D mode loads opens once the scene is in; a switch outranks an earlier choice only", async ({ page }) => {
  const title = page.locator("#panel-title");

  await test.step("chosen before the scene has loaded", async () => {
    // The scene's chunk waits at the gate, so the choice is made before the scene exists.
    let open = () => {};
    const gate = new Promise<void>((r) => (open = r));
    await page.route(/\/lab-[^/]*\.js$/, async (route) => { // the default scene
      await gate;
      await route.continue();
    });
    await page.goto("/");
    await page.locator("#power").click();
    await expect(rail(page, ids[0])).toBeFocused();
    await page.keyboard.press("Enter");
    open();
    await expect(title).toBeFocused();
    await expect(title).toHaveAccessibleName(data.projects[0].title);
    await expect(held(page)).toHaveAttribute("data-held", ids[0]);
    await page.keyboard.press("Escape");
    await expect(held(page)).toHaveAttribute("data-held", "");
  });

  await test.step("chosen, then a scene switch in the same moment", async () => {
    await page.evaluate((id) => {
      document.querySelector<HTMLElement>(`#deck .rail button[data-id="${id}"]`)?.click();
      document.querySelector<HTMLElement>(`#deck .scenes button[data-scene="switchboard"]`)?.click();
    }, ids[1]);
    await expect(bar(page, "Switchboard")).toHaveAttribute("aria-pressed", "true");
    // No panel over the new scene: the project went with the scene it was loading into.
    await expect(page.locator("#panel")).toBeHidden();
    await expect(held(page)).toHaveAttribute("data-held", "");
  });

  await test.step("chosen, a scene switch, and chosen again, in the same moment", async () => {
    await page.evaluate((id) => {
      const choose = () => document.querySelector<HTMLElement>(`#deck .rail button[data-id="${id}"]`)?.click();
      choose();
      document.querySelector<HTMLElement>(`#deck .scenes button[data-scene="replay-deck"]`)?.click();
      choose(); // a new choice that waits for the switch, not a second press that skips ahead
    }, ids[2]);
    await expect(title).toBeFocused();
    await expect(title).toHaveAccessibleName(data.projects[2].title);
    await expect(bar(page, "Replay Deck")).toHaveAttribute("aria-pressed", "true");
    await expect(held(page)).toHaveAttribute("data-held", ids[2]);
  });
});

test("3D mode opens only when asked: nothing opens or loads on its own", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  await expect(page.locator("#deck")).toHaveCount(0);
  const boot = await page.evaluate(() => performance.getEntriesByType("resource").some((e) => /\/assets\/boot-/.test(e.name)));
  expect(boot).toBe(false);
});

test.describe("on a phone", () => {
  // A phone's screen is its own size; the desktop profile this project starts from has a large one.
  const viewport = { width: 390, height: 844 };
  test.use({ viewport, screen: viewport, hasTouch: true, isMobile: true });

  test("Open in 3D is a large button that works", async ({ page }) => {
    await page.goto("/");
    const button = page.locator("#power");
    const box = (await button.boundingBox()) as { width: number; height: number };
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThan(300);
    await button.tap();
    await expect(page.locator("#deck [role=status]")).toHaveText(/3D mode on/);
  });
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

// The Lab's own promises: pixel art at every size, a HUD with the page's real counts, and the sample
// on the bench staying there, and named, while the visitor points at others.
test.describe("lab", () => {
  const caption = (page: Page) => page.locator("#deck canvas");
  const flagships = data.projects.filter((p) => p.group === "flagship").length;

  test("renders at least 320 x 200 pixels in the canvas's shape, scaled up without smoothing, at every window size", async ({ page }) => {
    await powerOn(page, "lab");
    const canvas = page.locator("#deck canvas");
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 960 },
      { width: 1920, height: 600 },
      { width: 1024, height: 768 },
      { width: 606, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const grid = () =>
        canvas.evaluate((c: HTMLCanvasElement) => {
          const shape = c.width / c.height / (c.clientWidth / c.clientHeight);
          return c.width >= 320 && c.height >= 200 && (c.width === 320 || c.height === 200) && Math.abs(shape - 1) < 0.02;
        });
      await expect.poll(grid, { message: `${viewport.width} x ${viewport.height}` }).toBe(true);
      await expect(canvas).toHaveCSS("image-rendering", "pixelated");
    }
  });

  test("the HUD shows the page's own counts", async ({ page }) => {
    await powerOn(page, "lab");
    await expect(caption(page)).toHaveAttribute("data-caption", new RegExp(`\\n${data.projects.length} PROJECTS\\n${flagships} FLAGSHIPS\\nLAB OPEN`));
  });

  test("the room moves a few times a second while idle, and rests in a hidden tab and with low power", async ({ page }) => {
    await powerOn(page, "lab");
    const still = async (what: string) => {
      await page.waitForTimeout(300);
      const before = await frames(page);
      await page.waitForTimeout(1000);
      expect(await frames(page), what).toBe(before);
    };
    await page.waitForTimeout(500);
    const before = await frames(page);
    await page.waitForTimeout(2000);
    const drawn = (await frames(page)) - before;
    expect(drawn).toBeGreaterThan(4); // it moves
    expect(drawn).toBeLessThanOrEqual(32); // at about 12 frames a second, not 60
    const hide = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await hide(true);
    await still("in a hidden tab");
    await hide(false);
    const shown = await frames(page);
    await expect.poll(() => frames(page)).toBeGreaterThan(shown + 2);
    await bar(page, "Low power").click();
    await expect(bar(page, "Low power")).toHaveAttribute("aria-pressed", "true");
    await still("with low power");
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the room stays still", async ({ page }) => {
      await powerOn(page, "lab");
      await page.waitForTimeout(500);
      const before = await frames(page);
      await page.waitForTimeout(1500);
      expect(await frames(page)).toBe(before);
    });
  });

  test("the sample on the bench stays there, and named, while another is pointed at", async ({ page }) => {
    // A fake clock holds the assay part way, whatever the speed of the machine.
    await page.clock.install();
    await powerOn(page, "lab");
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    // pauseAt fires each due callback once, at the new time: let frames and the timers queued after
    // them run, as they would in a browser, before the assay starts.
    await page.clock.runFor(100);
    const [a, b] = data.projects; // both flagships, on the top shelf
    await expect(rail(page, a.id)).toBeFocused();
    await page.keyboard.press("Enter");
    await page.clock.runFor(600); // the flask has landed and the drops are falling
    await page.keyboard.press("ArrowDown");
    await page.clock.runFor(200); // the pointed-at flask has hopped; the assay is still running
    await expect(rail(page, b.id)).toBeFocused();
    await expect(held(page)).toHaveAttribute("data-held", a.id);
    await expect(caption(page)).toHaveAttribute("data-caption", new RegExp(`${a.title.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*ASSAY RUNNING`));
    // Where each flask is: the pointer finds the sample on the bench well below the shelf.
    const rows = await page.evaluate(() => {
      const c = document.querySelector("#deck canvas") as HTMLCanvasElement;
      const r = c.getBoundingClientRect();
      const found: Record<string, number[]> = {};
      for (let gy = 1; gy < 60; gy++) {
        for (let gx = 1; gx < 80; gx++) {
          c.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + (r.width * gx) / 80, clientY: r.top + (r.height * gy) / 60, bubbles: true }));
          const id = c.dataset.pointed;
          if (id) (found[id] ??= []).push(gy / 60);
        }
      }
      return Object.fromEntries(Object.entries(found).map(([id, ys]) => [id, ys.reduce((x, y) => x + y) / ys.length]));
    });
    expect(rows[a.id], "the sample on the bench").toBeGreaterThan(rows[b.id] + 0.15);
    await page.clock.resume();
    await expect(page.locator("#panel-title")).toBeFocused();
    await expect(page.locator("#panel-title")).toHaveAccessibleName(a.title);
    await expect(caption(page)).toHaveAttribute("data-caption", /ASSAY DONE/); // the run ended; no verdict claimed
  });
});

for (const scene of SCENES) {
  test.describe(scene, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((s) => localStorage.setItem("nk.scene", s), scene);
    });

    test("every project opens from the rail by keyboard, and Escape steps back out", async ({ page }) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await powerOn(page, scene);
      for (const [i, p] of data.projects.entries()) {
        if (i > 0) await page.keyboard.press("ArrowDown");
        await expect(rail(page, p.id)).toBeFocused();
        await page.keyboard.press("Enter");
        const title = page.locator("#panel-title");
        await expect(title).toBeFocused();
        await expect(title).toHaveAccessibleName(p.title);
        await expect(held(page)).toHaveAttribute("data-held", p.id);
        await page.keyboard.press("Escape");
        await expect(page.locator("#panel")).toBeHidden();
        await expect(rail(page, p.id)).toBeFocused();
        await expect(held(page)).toHaveAttribute("data-held", ""); // ejected back to the rack
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("#deck")).toHaveCount(0);
      await expect(page.locator("#power")).toBeFocused();
      expect(errors).toEqual([]);
    });

    test("a project chosen while switching to this scene opens in it once it has loaded", async ({ page }) => {
      const other = SCENES.find((s) => s !== scene) as string;
      await page.addInitScript((s) => localStorage.setItem("nk.scene", s), other); // runs after beforeEach's
      await powerOn(page, other);
      const p = data.projects[1];
      // In one task, as a quick visitor would: switch, then choose while the scene still loads.
      await page.evaluate(
        ([s, id]) => {
          document.querySelector<HTMLElement>(`#deck .scenes button[data-scene="${s}"]`)?.click();
          document.querySelector<HTMLElement>(`#deck .rail button[data-id="${id}"]`)?.click();
        },
        [scene, p.id],
      );
      const title = page.locator("#panel-title");
      await expect(title).toBeFocused();
      await expect(title).toHaveAccessibleName(p.title);
      await expect(page.locator(`#deck .scenes button[data-scene="${scene}"]`)).toHaveAttribute("aria-pressed", "true");
      await expect(held(page)).toHaveAttribute("data-held", p.id);
    });

    test("quick presses settle on the last project chosen, with nothing left running", async ({ page }) => {
      await powerOn(page, scene);
      // Records every change of the held project while the panel is open: nothing may load or eject
      // behind it.
      await page.evaluate(() => {
        const w = window as unknown as { behind: string[] };
        const canvas = document.querySelector("#deck canvas") as HTMLCanvasElement;
        const panel = document.getElementById("panel") as HTMLDialogElement;
        w.behind = [];
        new MutationObserver(() => {
          if (panel.open) w.behind.push(canvas.dataset.held ?? "");
        }).observe(canvas, { attributeFilter: ["data-held"] });
      });
      await page.keyboard.press("Enter"); // the first project starts loading
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter"); // the second, before the first has finished
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter"); // and the first again
      const title = page.locator("#panel-title");
      await expect(title).toBeFocused();
      await expect(title).toHaveAccessibleName(data.projects[0].title);
      await expect(held(page)).toHaveAttribute("data-held", ids[0]);
      await page.waitForTimeout(1500); // anything still queued would have run by now
      expect(await page.evaluate(() => (window as unknown as { behind: string[] }).behind)).toEqual([]);
      await expect(page.locator("#panel")).toBeVisible();
      if (AMBIENT.has(scene)) return; // its room moves on its own (tested in the lab block)
      const settled = await frames(page);
      await page.waitForTimeout(500);
      expect(await frames(page)).toBe(settled);
    });

    test("a second Enter skips the loading animation to the end", async ({ page }) => {
      await powerOn(page, scene);
      await page.evaluate(() => {
        const w = window as unknown as { t0?: number; t1?: number };
        const panel = document.getElementById("panel") as HTMLDialogElement;
        addEventListener("keydown", () => (w.t0 = performance.now()), { capture: true, once: true });
        new MutationObserver(() => {
          if (panel.open) w.t1 ??= performance.now();
        }).observe(panel, { attributes: true });
      });
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await expect(page.locator("#panel-title")).toBeFocused();
      const ms = await page.evaluate(() => {
        const w = window as unknown as { t0: number; t1: number };
        return w.t1 - w.t0;
      });
      expect(ms).toBeLessThan(600); // a full load takes over 1 s in every scene
    });

    test("powering on fetches no models, images or fonts, and nothing from other sites", async ({ page, baseURL }) => {
      await page.goto("/");
      const requests: string[] = [];
      page.on("request", (r) => requests.push(r.url()));
      await page.locator("#power").click();
      await expect(page.locator("#deck [role=status]")).toHaveText(/3D mode on/);
      await expect(page.locator(`#deck .scenes button[data-scene="${scene}"]`)).toHaveAttribute("aria-pressed", "true");
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.filter((u) => /\.(glb|gltf|png|jpe?g|webp|ktx2|woff2?)$/i.test(new URL(u).pathname))).toEqual([]);
      expect(requests.filter((u) => !u.startsWith(baseURL as string))).toEqual([]);
    });

    if (!AMBIENT.has(scene)) test("renders on demand: no frames while idle", async ({ page }) => {
      await powerOn(page, scene);
      await expect.poll(() => frames(page)).toBeGreaterThan(0);
      await page.waitForTimeout(500); // the first highlight settles
      const idle = await frames(page);
      await page.waitForTimeout(1000);
      expect(await frames(page)).toBe(idle);
      await openAndClose(page);
      await expect(rail(page, ids[0])).toBeFocused();
      await expect(held(page)).toHaveAttribute("data-held", ""); // the eject has finished
      await page.waitForTimeout(300); // and the highlight that follows it
      const after = await frames(page);
      expect(after).toBeGreaterThan(idle);
      await page.waitForTimeout(1000);
      expect(await frames(page)).toBe(after);
    });

    test.describe("with reduced motion", () => {
      test.use({ reducedMotion: "reduce" });

      test("a project opens at once, without animation", async ({ page }) => {
        await powerOn(page, scene);
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
      await powerOn(page, scene);
      await expect(sound).toHaveAttribute("aria-pressed", "false");
      await openAndClose(page);
      expect(await made()).toBe(0);
      await sound.click();
      await expect(sound).toHaveAttribute("aria-pressed", "true");
      expect(await made()).toBe(1);
      await powerOn(page, scene);
      await expect(sound).toHaveAttribute("aria-pressed", "true");
    });

    // A sweep over the canvas must point at every project; then a click opens one. The portrait
    // size also runs the stacked layouts.
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 480, height: 900 },
    ]) {
      test(`the pointer reaches every project at ${viewport.width} x ${viewport.height}, and a click opens one`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await powerOn(page, scene);
        // Pointer moves over a 47 x 39 grid, dispatched in the page (the same handler a real mouse
        // runs, but fast enough for software rendering). Returns, for each project hit, its most
        // interior grid point: a hovered object may slide forward, so an edge point can miss, and
        // a project can have two separate targets (a lever and a board), so a mean can miss too.
        const hits = await page.evaluate(() => {
          const c = document.querySelector("#deck canvas") as HTMLCanvasElement;
          const r = c.getBoundingClientRect();
          const grid = new Map<string, string>();
          for (let gy = 1; gy < 40; gy++) {
            for (let gx = 1; gx < 48; gx++) {
              c.dispatchEvent(
                new PointerEvent("pointermove", {
                  clientX: r.left + (r.width * gx) / 48,
                  clientY: r.top + (r.height * gy) / 40,
                  bubbles: true,
                }),
              );
              if (c.dataset.pointed) grid.set(`${gx},${gy}`, c.dataset.pointed);
            }
          }
          const found: Record<string, { x: number; y: number; inside: number }> = {};
          for (const [key, id] of grid) {
            const [gx, gy] = key.split(",").map(Number);
            const inside = [-1, 1].flatMap((d) => [`${gx + d},${gy}`, `${gx},${gy + d}`]).filter((k) => grid.get(k) === id).length;
            if ((found[id]?.inside ?? -1) < inside) {
              found[id] = { x: r.left + (r.width * gx) / 48, y: r.top + (r.height * gy) / 40, inside };
            }
          }
          return found;
        });
        expect(ids.filter((id) => !hits[id]), "projects the pointer never reached").toEqual([]);
        // A real click on one of them opens it.
        const id = ids[ids.length - 1];
        const { x, y } = hits[id];
        await page.mouse.click(x, y);
        await expect(page.locator("#panel-title")).toBeFocused();
        await expect(held(page)).toHaveAttribute("data-held", id);
        const project = data.projects.find((p) => p.id === id) as { title: string };
        await expect(page.locator("#panel-title")).toHaveAccessibleName(project.title);
      });
    }

    test("the pointer finds projects before the first frame is drawn", async ({ page }) => {
      // With requestAnimationFrame held back nothing renders, so picking must not depend on it.
      await page.addInitScript(() => {
        window.requestAnimationFrame = () => 0;
      });
      await powerOn(page, scene);
      const reached = await page.evaluate(() => {
        const c = document.querySelector("#deck canvas") as HTMLCanvasElement;
        const r = c.getBoundingClientRect();
        const found = new Set<string>();
        for (let gy = 1; gy < 40; gy++) {
          for (let gx = 1; gx < 48; gx++) {
            const x = r.left + (r.width * gx) / 48;
            const y = r.top + (r.height * gy) / 40;
            c.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
            if (c.dataset.pointed) found.add(c.dataset.pointed);
          }
        }
        return { ids: [...found], frames: c.dataset.frames ?? "" };
      });
      expect(reached.frames, "a frame was drawn").toBe("");
      expect(ids.filter((id) => !reached.ids.includes(id))).toEqual([]);
    });

    test("low power: toggling it keeps the scene working", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await powerOn(page, scene);
      const low = bar(page, "Low power");
      const before = await low.getAttribute("aria-pressed");
      await low.click();
      await expect(low).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
      await rail(page, ids[0]).focus();
      await openAndClose(page);
      await low.click(); // and back, with the project ejected
      await expect(held(page)).toHaveAttribute("data-held", "");
      expect(errors).toEqual([]);
    });

    test("a lost graphics context powers off and says why", async ({ page }) => {
      await powerOn(page, scene);
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
        await powerOn(page, scene);
        const scan = async () =>
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze())
            .violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`);
        expect(await scan()).toEqual([]);
        await page.screenshot({ path: info.outputPath(`${scene}-${colorScheme}.png`) });
        await page.keyboard.press("Enter");
        await expect(page.locator("#panel-title")).toBeFocused();
        expect(await scan()).toEqual([]);
        // Kept for review in the CI artifact, not compared: software rendering differs between machines.
        await page.screenshot({ path: info.outputPath(`${scene}-panel-${colorScheme}.png`) });
      });
    }
  });
}
