// Lab, the default scene: a dense chemistry lab at night, drawn like an 80s pixel-art game. Each
// project is a sample flask on the shelves, one shelf per group. Choosing one takes it to the
// distillation rig: its liquid runs through the tubing into the boiling flask, through the
// condenser, and drips into the receiver; then the CRT prints the assay. A distillation ends in
// a measured product, the way the projects' numbers come from runs that can be replayed.
//
// The picture is a 2D canvas drawn in code (lab/art.ts) at a low resolution, shown 1:1 on a
// plane facing an orthographic camera and scaled up by the browser without smoothing. Invisible
// planes over the flasks carry the project ids for pointer picking. The room moves a little all
// the time (neon, flame, screens, steam) at a low frame rate; the engine stops that in a hidden
// tab, with low power, and entirely with reduced motion. The HUD shows real data only.

import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene as World,
  SRGBColorSpace,
} from "three";
import { pixelGrid } from "../engine/kit.ts";
import { easeInOut, linear } from "../engine/loop.ts";
import type { Motif } from "../engine/sound.ts";
import type { CreateScene, Project } from "../engine/types.ts";
import * as art from "./lab/art.ts";

// The profile banner's accent (scripts/portfolio.py in NecmiKural/NecmiKural): the flagship
// samples take the one for the visitor's colour scheme. The room is dark in both, so lettering,
// the HUD frame and the glow take the lighter one, which reads on it.
const ACCENTS = { light: "#c2410c", dark: "#fb923c" };
const LETTERING = ACCENTS.dark;
const RUNNING = "ASSAY RUNNING";
const DONE = "ASSAY DONE"; // the run reached its end; no pass or fail is claimed
const FPS = 12; // the room's ambient animation
const IDLE_LIQUID = "#9d4dff"; // what the boiling flask holds between assays

const LIFT: Motif = [{ hz: 330, to: 660, dur: 0.06, vol: 0.08 }];
const POUR: Motif = [{ noise: 1800, dur: 0.18, vol: 0.04 }];
const DRIP: Motif = [{ wave: "triangle", hz: 1320, to: 990, dur: 0.04, vol: 0.1 }];
const ENDPOINT: Motif = [
  { hz: 587, dur: 0.06, vol: 0.08 },
  { hz: 740, at: 0.08, dur: 0.06, vol: 0.08 },
  { hz: 659, at: 0.16, dur: 0.06, vol: 0.08 },
  { hz: 880, at: 0.24, dur: 0.1, vol: 0.08 },
];
const PUT_BACK: Motif = [{ hz: 660, to: 330, dur: 0.08, vol: 0.08 }];

type Point = { x: number; y: number };

export const create: CreateScene = (stage) => {
  const world = new World();
  // Looking down -z at the picture (z = 0) and the pick planes over it (z = 1); its rays start
  // halfway between near and far, so it stands back at z = 5.
  const camera = new OrthographicCamera(0, 1, 0, -1, -10, 10);
  camera.position.z = 5;
  const accent = matchMedia("(prefers-color-scheme: dark)").matches ? ACCENTS.dark : ACCENTS.light;
  const liquidOf = (group: string) => (group === "flagship" ? accent : (art.LIQUIDS[group] ?? art.PAL.amber));

  // The picture: one canvas, redrawn before each frame, on a plane that fills the view.
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const room = document.createElement("canvas"); // the still parts, painted once per size
  let veil = art.overlay(1, 1);
  const material = new MeshBasicMaterial();
  const surface = new Mesh(new PlaneGeometry(1, 1), material);
  world.add(surface);
  let texture: CanvasTexture | null = null;

  const pickGeometry = new PlaneGeometry(art.FLASK_W + 4, art.FLASK_H + 4);
  const hidden = new MeshBasicMaterial();
  const picks = new Map<string, Mesh>();
  const homes = new Map<string, Point>();
  const byId = new Map<string, Project>();
  const order: string[] = [];
  let counts: number[] = [];
  let plan = art.plan(art.MIN.width, art.MIN.height);
  let path: [number, number][] = [];
  let condenserFrom = 0; // where along the path the condenser starts

  let projects = 0;
  let flagships = 0;
  let focused: string | null = null;
  let playing: string | null = null;
  let status = "";
  let flight = 0; // the playing flask's way from its shelf (0) to the rig (1)
  let flow = 0; // 0..1 along the tubing
  let drops = 0; // 0..3 drops fallen, fractional while one falls
  let screen: string[] | null = null;
  let typed = 0;
  let start = 0;
  let t = 0; // ms of ambient time; still under reduced motion
  let said = "";

  stage.ambient(FPS, (now) => {
    start ||= now;
    t = now - start;
  });

  const home = (id: string) => homes.get(id) ?? { x: 0, y: 0 };
  const sampleAt = (): Point => ({ x: plan.sample.x, y: plan.sample.y - art.FLASK_H });
  const placePick = (id: string, p: Point) => picks.get(id)?.position.set(p.x + art.FLASK_W / 2, -(p.y + art.FLASK_H / 2), 1);
  // Where a flask is: on its shelf, or along an arc over the bench to the rig. Worked out from the
  // current layout every time, so a resize mid-flight lands it in the right place.
  const flaskAt = (id: string): Point => {
    const from = home(id);
    if (id !== playing || flight === 0) return from;
    const to = sampleAt();
    const lift = Math.min(from.y, to.y) - 20;
    const k = flight;
    const u = 1 - k;
    return {
      x: Math.round(u * u * from.x + 2 * u * k * ((from.x + to.x) / 2) + k * k * to.x),
      y: Math.round(u * u * from.y + 2 * u * k * lift + k * k * to.y),
    };
  };

  const draw = () => {
    if (!texture) return;
    g.drawImage(room, 0, 0);
    art.neon(g, plan, t);
    art.windowLights(g, plan, t);
    art.clock(g, plan, new Date(), t);
    const shown = playing ?? focused;
    // Flasks on the shelves, glowing; the one being assayed is drawn where it is.
    order.forEach((id, i) => {
      if (id === playing) return;
      const p = home(id);
      const liquid = liquidOf(byId.get(id)?.group ?? "");
      art.flaskGlow(g, p.x, p.y, liquid);
      art.flask(g, p.x, p.y, liquid, t, i);
    });
    if (focused && focused !== playing) {
      const p = home(focused);
      art.glow(g, p.x, p.y, LETTERING, Math.sin(t / 250));
    }
    const sample = playing ? liquidOf(byId.get(playing)?.group ?? "") : IDLE_LIQUID;
    // The liquid in the tubing, then the rig over it.
    const reached = Math.round(flow * path.length);
    for (let k = 0; k < reached; k++) art.px(g, path[k][0], path[k][1], sample);
    art.flame(g, plan.burner.x, plan.bench.y - 13, t, playing !== null);
    art.roundFlask(g, plan, reached > condenserFrom - 8 ? sample : IDLE_LIQUID, t);
    art.coil(g, plan, Math.max(0, (reached - condenserFrom) / (path.length - condenserFrom)), sample);
    const out = path[path.length - 1];
    const falling = drops % 1;
    if (falling > 0) art.px(g, out[0], out[1] + 1 + Math.round(falling * 8), sample);
    const r = plan.receiver;
    const level = Math.min(3, Math.floor(drops));
    if (level) art.rect(g, r.x + 1, r.y - 1 - level, art.FLASK_W - 2, level, sample);
    art.steam(g, plan.round.x, plan.round.y - plan.round.r - 9, t, playing ? 6 : 3, 1);
    art.steam(g, r.x + 5, r.y - art.FLASK_H - 1, t, 2, 2);
    art.steam(g, plan.x0 + 278, plan.bench.y - 8, t, 2, 3); // the mug
    art.sparks(g, plan.x0 + 150, plan.top + 12, t);
    art.scopeTrace(g, plan, t);
    let left = typed; // characters typed so far, line by line
    art.crtScreen(
      g,
      plan,
      t,
      screen?.map((s) => {
        const part = s.slice(0, Math.max(0, left));
        left -= s.length;
        return part;
      }) ?? null,
    );
    art.screenGlow(g, plan);
    art.cat(g, plan, t);
    if (playing) {
      const p = flaskAt(playing);
      art.flask(g, p.x, p.y, sample, t, 99);
      placePick(playing, p);
    }
    art.lampLight(g, plan);
    const p = shown ? byId.get(shown) : undefined;
    const version = p?.tag ? p.tag.toUpperCase() : p?.ref ? `REF ${p.ref.toUpperCase()}` : "";
    const lines = art.hud(g, plan, {
      projects,
      flagships,
      title: p?.title ?? "",
      detail: p ? [p.group.toUpperCase().replace("-", " "), version].filter(Boolean).join("  ") : "",
      status: shown === playing ? status : "",
      accent: LETTERING,
    });
    g.drawImage(veil, 0, 0);
    texture.needsUpdate = true;
    const text = lines.join("\n");
    if (text !== said) stage.caption((said = text));
  };
  world.onBeforeRender = draw;

  return {
    world,
    camera,
    pixels: art.MIN,

    build(list) {
      byId.clear();
      order.length = 0;
      for (const p of list) {
        byId.set(p.id, p);
        order.push(p.id);
        const pick = new Mesh(pickGeometry, hidden);
        pick.visible = false;
        pick.userData.id = p.id;
        picks.set(p.id, pick);
        world.add(pick);
      }
      projects = list.length;
      flagships = list.filter((p) => p.group === "flagship").length;
      const groups = [...new Set(list.map((p) => p.group))];
      // Lowest shelf first: the first group (the flagships) goes on the top shelf.
      counts = groups.map((_, row) => list.filter((p) => p.group === groups[groups.length - 1 - row]).length);
      for (const p of list) homes.set(p.id, { x: 0, y: 0 });
      stage.invalidate();
    },

    layout(aspect) {
      const grid = pixelGrid(art.MIN, aspect);
      if (canvas.width !== grid.width || canvas.height !== grid.height || !texture) {
        canvas.width = room.width = grid.width;
        canvas.height = room.height = grid.height;
        // A new texture: an uploaded one cannot change size in place.
        texture?.dispose();
        texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.magFilter = texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
        material.map = texture;
        material.needsUpdate = true;
        plan = art.plan(grid.width, grid.height);
        art.paintRoom(room.getContext("2d") as CanvasRenderingContext2D, plan, counts);
        veil = art.overlay(grid.width, grid.height);
        path = art.trace(art.tubing(plan));
        condenserFrom = path.findIndex(([x, y]) => x === plan.condenser.x0 && y === plan.condenser.y0);
      }
      // Homes on the shelves, in page order within each group.
      const groups = [...new Set(order.map((id) => byId.get(id)?.group ?? ""))];
      groups.forEach((group, gi) => {
        const row = groups.length - 1 - gi;
        const on = order.filter((id) => byId.get(id)?.group === group);
        const pitch = art.shelfPitch(on.length);
        on.forEach((id, col) => {
          homes.set(id, { x: plan.x0 + 10 + col * pitch, y: plan.shelf(row) - art.FLASK_H });
          // Pick planes as wide as the flask's share of the shelf, so neighbours never overlap.
          picks.get(id)?.scale.set(Math.min(art.FLASK_W + 4, pitch) / (art.FLASK_W + 4), 1, 1);
        });
      });
      for (const id of order) placePick(id, flaskAt(id));
      camera.right = grid.width;
      camera.bottom = -grid.height;
      camera.updateProjectionMatrix();
      surface.scale.set(grid.width, grid.height, 1);
      surface.position.set(grid.width / 2, -grid.height / 2, 0);
      world.updateMatrixWorld(); // picking can run before the first frame
      stage.invalidate();
    },

    focus(id) {
      if (id === focused) return;
      focused = id;
      stage.invalidate();
    },

    async insert(id) {
      const p = byId.get(id);
      if (!p) return;
      playing = id;
      status = RUNNING;
      stage.play(LIFT);
      await stage.tween(450, (k) => (flight = k), easeInOut); // to the rig, in an arc over the bench
      // Through the tubing, the boiling flask and the condenser.
      stage.play(POUR);
      await stage.tween(500, (k) => (flow = k), linear);
      // Three drops into the receiver.
      for (let k = 0; k < 3; k++) {
        stage.play(DRIP);
        await stage.tween(110, (u) => (drops = k + Math.min(u, 0.999)), linear);
        drops = k + 1;
      }
      // The CRT prints the assay.
      stage.play(ENDPOINT);
      screen = ["ASSAY", (p.tag ?? p.ref ?? "").toUpperCase().slice(0, 7), "DONE"]; // 7 a line
      const chars = screen.join("").length;
      await stage.tween(300, (k) => (typed = Math.ceil(chars * k)), linear);
      status = DONE;
      stage.invalidate();
    },

    async eject() {
      const id = playing;
      if (!id) return;
      stage.play(PUT_BACK);
      status = "";
      const full = flow;
      await stage.tween(
        400,
        (k) => {
          flight = 1 - k; // back along the same arc
          flow = full * (1 - k);
          drops = 3 * (1 - k);
        },
        easeInOut,
      );
      playing = null;
      flight = 0;
      flow = 0;
      drops = 0;
      screen = null;
      typed = 0;
      placePick(id, home(id));
      stage.invalidate();
    },

    dispose() {
      texture?.dispose();
      material.dispose();
      hidden.dispose();
      surface.geometry.dispose();
      pickGeometry.dispose();
    },
  };
};
