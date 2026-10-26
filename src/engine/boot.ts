// 3D mode. Opens a full-screen dialog with a toolbar, a rail of buttons (one per project, read
// from the page) and the canvas, then loads the chosen scene. Everything the scenes share lives
// here: rendering on demand, the project panel, sound, low power, reduced motion and failures.

import { Mesh, Raycaster, Vector2, WebGLRenderer, type Object3D } from "three";
import css from "./engine.css?inline";
import { createLoop } from "./loop.ts";
import { createSound, read, write, type Motif } from "./sound.ts";
import type { CreateScene, Project, Scene, Stage } from "./types.ts";

// Each scene is its own chunk, loaded when chosen. The first is the default.
const SCENES: { id: string; name: string; load: () => Promise<{ create: CreateScene }> }[] = [
  { id: "replay-deck", name: "Replay Deck", load: () => import("../scenes/replay-deck.ts") },
  { id: "switchboard", name: "Switchboard", load: () => import("../scenes/switchboard.ts") },
  { id: "glovebox", name: "Glovebox", load: () => import("../scenes/glovebox.ts") },
  { id: "signal-box", name: "Signal Box", load: () => import("../scenes/signal-box.ts") },
];

const POWER_ON: Motif = [
  { noise: 2000, sweep: 300, dur: 0.08, vol: 0.12 },
  { hz: 262, at: 0.08, dur: 0.07 },
  { hz: 330, at: 0.15, dur: 0.07 },
  { hz: 494, at: 0.22, dur: 0.07 },
];
const TICK: Motif = [{ hz: 1568, dur: 0.018, vol: 0.08 }];
const POWER_OFF: Motif = [{ hz: 523, to: 262, dur: 0.25 }];

const LOST = "3D mode stopped because the graphics context was lost. Everything on this page works without it.";
const BROKEN = "3D mode stopped because of an error. Everything on this page works without it.";

const sound = createSound(); // one AudioContext for the whole visit, made only if sound is on

export interface BootOptions {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  lowPower: boolean;
  opener: HTMLElement;
  say(text: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

// The projects in page order, from the articles in the page's sections.
function readProjects(): Project[] {
  return [...document.querySelectorAll<HTMLElement>("main section[aria-labelledby]")].flatMap((section) => {
    const group = section.getAttribute("aria-labelledby") as string;
    const groupName = section.querySelector("h2")?.textContent?.trim() || group;
    return [...section.querySelectorAll<HTMLElement>("article[id]")].map((article) => {
      const h3 = article.querySelector("h3");
      const byline = article.querySelector(".byline")?.textContent ?? "";
      const tag = byline.split(" · ").find((s) => /^v\d+(\.\d+)+$/.test(s));
      const at = article.querySelector("a.src")?.getAttribute("href")?.match(/\/blob\/([^/]+)\//)?.[1];
      return {
        id: article.id,
        title: (h3?.querySelector("a") ?? h3)?.textContent?.trim() || article.id,
        group,
        groupName,
        label: h3?.querySelector(".tape")?.textContent?.trim() || undefined,
        tag,
        ref: tag ?? (at && /^[0-9a-f]{40}$/.test(at) ? at.slice(0, 7) : at),
      };
    });
  });
}

export async function boot(o: BootOptions): Promise<void> {
  if (o.gl.isContextLost()) {
    o.say(LOST); // lost while this chunk was downloading
    return;
  }
  if (!document.getElementById("deck-css")) document.head.append(el("style", { id: "deck-css" }, css));
  const projects = readProjects();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lowPower = o.lowPower;
  let scene: Scene | null = null;
  let closed = false;
  let message = "";

  // The dialog: toolbar, canvas, rail, a status line and the nested project panel.
  const sceneButtons = SCENES.map((s) =>
    el("button", { type: "button", "aria-pressed": "false", "data-scene": s.id }, s.name),
  );
  const soundButton = el("button", { type: "button", "aria-pressed": String(sound.on) }, "Sound");
  const lowButton = el("button", { type: "button", "aria-pressed": String(lowPower) }, "Low power");
  const offButton = el("button", { type: "button" }, "Power off");
  const bar = el(
    "div",
    { class: "bar" },
    el("p", { class: "name" }, "3D mode"),
    el("p", { class: "hint" }, "Enter loads a project. Escape ejects it, then powers off."),
    el("div", { class: "scenes", role: "group", "aria-label": "Scene" }, ...sceneButtons),
    soundButton,
    lowButton,
    offButton,
  );
  const groups = [...new Set(projects.map((p) => p.group))].map((g) => projects.filter((p) => p.group === g));
  const rail = el(
    "nav",
    { class: "rail", "aria-label": "Projects" },
    ...groups.flatMap((items) => [
      el("h2", {}, items[0].groupName),
      el("ul", {}, ...items.map((p) => el("li", {}, el("button", { type: "button", "data-id": p.id }, p.title)))),
    ]),
  );
  const buttons = [...rail.querySelectorAll<HTMLButtonElement>("button")];
  const buttonFor = (id: string | null) => buttons.find((b) => b.dataset.id === id);
  const live = el("p", { class: "vh", role: "status" });
  const ejectButton = el("button", { type: "button", class: "eject" }, "Eject");
  const panelBody = el("div");
  const panel = el("dialog", { id: "panel", "aria-labelledby": "panel-title" }, ejectButton, panelBody);
  o.canvas.setAttribute("aria-hidden", "true");
  const deck = el("dialog", { id: "deck", "aria-label": "3D mode" }, bar, o.canvas, rail, live, panel);

  const fail = (text: string) => {
    message = text;
    closed = true;
    if (panel.open) panel.close();
    if (deck.open) deck.close();
  };
  // Event handlers go through this, so any error powers off cleanly instead of leaving a dead scene.
  const guard =
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
    (...args: A) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) result.catch(() => fail(BROKEN));
      } catch {
        fail(BROKEN);
      }
    };

  // Rendering: only when something changed. data-frames counts frames for the tests.
  const renderer = new WebGLRenderer({ canvas: o.canvas, context: o.gl, antialias: !lowPower });
  let frames = 0;
  const loop = createLoop(
    () => {
      if (!scene) return;
      renderer.render(scene.world, scene.camera);
      o.canvas.dataset.frames = String(++frames);
    },
    reduced,
    () => fail(BROKEN),
  );
  const stage: Stage = {
    invalidate: loop.invalidate,
    tween: loop.tween,
    play: (motif) => sound.play(motif),
    get lowPower() {
      return lowPower;
    },
  };
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = o.canvas;
    if (!w || !h) return;
    renderer.setPixelRatio(lowPower ? 1 : Math.min(devicePixelRatio, 1.5));
    renderer.setSize(w, h, false);
    scene?.layout(w / h);
    loop.invalidate();
  };
  const observer = new ResizeObserver(guard(resize));

  // One animation at a time. A new one first finishes the running one at once.
  let running: Promise<void> | null = null;
  let target: string | null = null; // the project being loaded or shown
  let inWell: string | null = null; // the project the scene holds
  let shown: string | null = null; // the project in the panel
  let highlighted: string | null = null;
  const hold = (id: string | null) => {
    inWell = id;
    o.canvas.dataset.held = id ?? ""; // for the tests, like data-frames
  };
  const run = async (task: () => Promise<void>) => {
    while (running) {
      loop.skip(true);
      await running;
    }
    const current = task();
    running = current;
    try {
      await current;
    } finally {
      running = null;
      loop.skip(false);
    }
  };

  const show = async (id: string) => {
    const entry = SCENES.find((s) => s.id === id) ?? SCENES[0];
    const { create } = await entry.load();
    if (closed) return;
    scene?.dispose();
    hold(null);
    scene = create(stage);
    scene.build(projects);
    scene.focus(highlighted);
    for (const b of sceneButtons) b.setAttribute("aria-pressed", String(b.dataset.scene === entry.id));
    resize();
  };

  const openPanel = (id: string) => {
    const article = document.getElementById(id);
    if (!article) return;
    const copy = article.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    const title = el("h2", { id: "panel-title", tabindex: "-1" });
    const h3 = copy.querySelector("h3");
    if (h3) {
      title.append(...h3.childNodes);
      h3.replaceWith(title);
    } else copy.prepend(title);
    panelBody.replaceChildren(copy);
    shown = id;
    panel.showModal();
    title.focus();
  };

  // Queued behind whatever is running, a scene still loading included, and played on the scene
  // that is current when its turn comes, so a choice made during a load or a switch is kept.
  const activate = async (id: string) => {
    if (running && target === id) {
      loop.skip(true); // a second Enter on the same project skips to the end
      return;
    }
    target = id;
    await run(async () => {
      const s = scene;
      if (!s || target !== id || inWell === id) return; // superseded while queued, or already loaded
      if (inWell) await s.eject();
      hold(id);
      await s.insert(id);
    });
    // Not once something asked for later has started: a scene switch empties the scene, and the
    // later choice wins.
    if (target === id && !closed && !panel.open && inWell === id && !running) openPanel(id);
  };

  let lastTick = performance.now() + 400; // no tick on top of the power-on sound
  const highlight = (id: string | null) => {
    if (id === highlighted) return;
    highlighted = id;
    scene?.focus(id);
    const now = performance.now();
    if (id && now - lastTick > 60) {
      lastTick = now;
      sound.play(TICK);
    }
  };
  const railFocus = () => (rail.contains(document.activeElement) ? ((document.activeElement as HTMLElement).dataset.id ?? null) : null);

  // Pointer: hover highlights, a click acts like the matching rail button.
  const ray = new Raycaster();
  const ndc = new Vector2();
  const pick = (e: MouseEvent): string | null => {
    if (!scene) return null;
    const r = o.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, ((r.top - e.clientY) / r.height) * 2 + 1);
    scene.camera.updateMatrixWorld(); // current even if no frame has rendered since a layout
    ray.setFromCamera(ndc, scene.camera);
    // Meshes only: lines (such as glass drawn as edges) have a pick margin of a whole unit.
    let obj: Object3D | null = ray.intersectObject(scene.world, true).find((hit) => hit.object instanceof Mesh)?.object ?? null;
    while (obj && !obj.userData.id) obj = obj.parent;
    return (obj?.userData.id as string | undefined) ?? null;
  };

  const lost = (e: Event) => {
    e.preventDefault();
    fail(LOST);
  };
  const onVisibility = () => {
    if (document.hidden) sound.sleep();
  };

  o.canvas.addEventListener(
    "pointermove",
    guard((e: PointerEvent) => {
      const id = pick(e);
      o.canvas.style.cursor = id ? "pointer" : "";
      o.canvas.dataset.pointed = id ?? ""; // for the tests, like data-held
      highlight(id ?? railFocus());
    }),
  );
  o.canvas.addEventListener("pointerleave", () => highlight(railFocus()));
  o.canvas.addEventListener(
    "click",
    guard((e: MouseEvent) => {
      const b = buttonFor(pick(e));
      b?.focus();
      b?.click();
    }),
  );
  rail.addEventListener("focusin", (e) => highlight((e.target as HTMLElement).dataset.id ?? highlighted));
  rail.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const moves: Record<string, number> = {
      ArrowDown: i + 1,
      ArrowRight: i + 1,
      ArrowUp: i - 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: buttons.length - 1,
    };
    if (i < 0 || !(e.key in moves) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, moves[e.key]))].focus();
  });
  rail.addEventListener(
    "click",
    guard((e: MouseEvent) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>("[data-id]")?.dataset.id;
      return id ? activate(id) : undefined;
    }),
  );
  ejectButton.addEventListener("click", () => panel.close());
  panel.addEventListener(
    "close",
    // The close event comes a task after Escape, so a quick next keypress can get there first:
    // if the panel opened again or another project is already loading, that has taken over.
    guard(async () => {
      if (closed || panel.open) return;
      const id = shown;
      shown = null;
      if (target !== id) return;
      target = null;
      if (!rail.contains(document.activeElement)) buttonFor(id)?.focus();
      await run(async () => {
        if (inWell !== id || panel.open) return;
        await scene?.eject();
        hold(null);
      });
    }),
  );
  soundButton.addEventListener("click", () => {
    soundButton.setAttribute("aria-pressed", String(sound.toggle()));
    sound.play(TICK);
  });
  lowButton.addEventListener(
    "click",
    guard(() => {
      lowPower = !lowPower;
      write("nk.lowpower", lowPower ? "on" : "off");
      lowButton.setAttribute("aria-pressed", String(lowPower));
      resize();
    }),
  );
  offButton.addEventListener("click", () => deck.close());
  for (const b of sceneButtons) {
    b.addEventListener(
      "click",
      guard(async () => {
        const id = b.dataset.scene as string;
        if (b.getAttribute("aria-pressed") === "true") return;
        await run(() => show(id));
        write("nk.scene", id); // only once it has loaded, so a broken scene is not remembered
      }),
    );
  }

  // Power off: Escape, the Power off button or a failure. Frees the GPU and returns focus.
  deck.addEventListener("close", () => {
    closed = true;
    loop.stop();
    observer.disconnect();
    o.canvas.removeEventListener("webglcontextlost", lost);
    document.removeEventListener("visibilitychange", onVisibility);
    try {
      scene?.dispose();
      renderer.dispose();
      if (!o.gl.isContextLost()) renderer.forceContextLoss();
    } catch {
      // A lost context can refuse cleanup calls; the canvas is removed either way.
    }
    deck.remove();
    sound.play(POWER_OFF);
    sound.sleep(400);
    o.opener.focus();
    o.say(message);
  });

  o.canvas.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", onVisibility);
  document.body.append(deck);
  deck.showModal();
  buttons[0]?.focus();
  observer.observe(o.canvas);
  try {
    sound.play(POWER_ON);
    // Through run(), so a choice made before the scene has loaded waits for it.
    await run(() => show(read("nk.scene") ?? SCENES[0].id).catch(() => show(SCENES[0].id)));
    live.textContent = `3D mode on: ${projects.length} projects.`;
  } catch {
    fail(BROKEN);
  }
}
