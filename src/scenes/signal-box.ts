// Signal Box. A lever frame looks out over a small railway yard: a main line that fans into one
// siding per group, with a platform and a board for every project. Pulling a lever sets the
// route: the interlocking lamps tick on one by one, the signal arm drops and a short train runs to
// that project's platform. An interlocking refuses a conflicting route the way code refuses a bad
// proposal. Procedural geometry and canvas-drawn labels only; no railway's livery or logos.

import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene as World,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { drawText, mark, wrap } from "../engine/font.ts";
import { atlasPlane, disposeAll, drawnBox, fit, toonMaker, type Rect } from "../engine/kit.ts";
import { easeInOut, linear } from "../engine/loop.ts";
import type { Motif } from "../engine/sound.ts";
import type { CreateScene, Project } from "../engine/types.ts";

const BALLAST = "#6b6660";
const RAIL = "#3a3a3a";
const GRASS = "#7fa65a";
const SKY_TOP = "#7aa6c2";
const SKY_LOW = "#f6c28b";
const WOOD = "#5a4330";
const PAPER = "#f1ece0";
const INK = "#1e1f1c";
const LIT = "#fff3c4";
const AMBER = "#ffb000";
const SCREEN = "#10140f";
const PHOSPHOR = "#9be36b";
const UNLIT = "#1f2a19";
// The usual lever colour code, by group.
const LEVER: Record<string, string> = {
  flagship: "#b33a2e",
  software: "#1e1f1c",
  coursework: "#e0b32e",
  "open-source": "#2f6db5",
};
const VIEW = new Vector3(0.2, 0.75, 1).normalize(); // from above the lever frame, over the yard

// World units. The lever frame stands at the front; the yard ("yard" group) lies behind it, with
// its tracks along local x and the sidings at local z.
const LEVER_PITCH = 0.34;
const FRAME = { h: 0.45, d: 0.7, z: 2.3 };
const MAIN_Z = -2.1;
const SIDING_Z = (row: number) => -0.6 - row * 1; // flagships nearest
const STOP_X = (col: number) => -1.4 + col * 0.85;
const CAR = 0.65; // spacing along the track, loco and wagons
const IDLE_X = -5.3; // where the loco waits, on the stretch every route shares
const LAMPS = 5;
const ARM_CLEAR = 0.6;

const CLUNK: Motif = [
  { noise: 600, dur: 0.06, vol: 0.18 },
  { wave: "triangle", hz: 90, dur: 0.12, vol: 0.18 },
];
const CLICK: Motif = [{ hz: 1000, dur: 0.008, vol: 0.06 }];
const THUNK: Motif = [
  { noise: 300, dur: 0.05, vol: 0.2 },
  { hz: 60, dur: 0.08, vol: 0.08 },
];
const HORN: Motif = [
  { hz: 392, dur: 0.25, vol: 0.05 },
  { hz: 466, dur: 0.25, vol: 0.05 },
];
const CHUFFS: Motif = [0, 0.22, 0.4, 0.55, 0.67, 0.77, 0.86, 0.94].map((at) => ({ noise: 2000, at, dur: 0.04, vol: 0.08 }));
const BACK: Motif = [0, 0.18, 0.34, 0.48].map((at) => ({ noise: 1800, at, dur: 0.04, vol: 0.07 }));
const ARRIVED: Motif = [
  { wave: "triangle", hz: 784, dur: 0.08, vol: 0.1 },
  { wave: "triangle", hz: 659, at: 0.1, dur: 0.12, vol: 0.1 },
];

// The label atlas: 1024 px. Lever plates are 128x96 cells in the top rows; platform boards are
// 128x64 cells below them.
const ATLAS = 1024;
const ROUTES_MAX = 32;
const plate = (i: number): Rect => [(i % 8) * 128, Math.floor(i / 8) * 96, 128, 96];
const board = (i: number): Rect => [(i % 8) * 128, 384 + Math.floor(i / 8) * 64, 128, 64];
const face = (w: number, h: number, rect: Rect) => atlasPlane(w, h, rect, ATLAS);
const pad = (n: number) => String(n).padStart(2, "0");

// A small deterministic hash for scenery placement and grass colours.
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// The centre line of the route to a siding: shared straight track first, so the idle train sits
// in the same place whatever the route, then the fan, then the siding.
const route = (z: number) =>
  new CatmullRomCurve3([
    new Vector3(-6.6, 0, MAIN_Z),
    new Vector3(-6.0, 0, MAIN_Z),
    new Vector3(-5.4, 0, MAIN_Z),
    new Vector3(-4.8, 0, MAIN_Z),
    new Vector3(-3.6, 0, (MAIN_Z + z) / 2),
    new Vector3(-2.4, 0, z),
    new Vector3(2.8, 0, z),
  ]);

// The arc-length position (0..1) where the curve reaches x.
const atX = (curve: CatmullRomCurve3, x: number) => {
  let [lo, hi] = [0, 1];
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (curve.getPointAt(mid).x < x) lo = mid;
    else hi = mid;
  }
  return lo;
};

export const create: CreateScene = (stage) => {
  const world = new World();
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 2;
  skyCanvas.height = 256;
  const sky = skyCanvas.getContext("2d") as CanvasRenderingContext2D;
  const gradient = sky.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(1, SKY_LOW);
  sky.fillStyle = gradient;
  sky.fillRect(0, 0, 2, 256);
  const skyTexture = new CanvasTexture(skyCanvas);
  skyTexture.colorSpace = SRGBColorSpace;
  world.background = skyTexture;
  const camera = new PerspectiveCamera(35, 1, 1, 100);
  world.add(new HemisphereLight("#fff4e0", "#5a6b45", 1.6));
  const sun = new DirectionalLight("#fff6e8", 2.2);
  sun.position.set(-6, 10, 6);
  world.add(sun);

  const { toon, bands } = toonMaker();
  const wood = toon(WOOD);

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasCanvas.height = ATLAS;
  const a = atlasCanvas.getContext("2d") as CanvasRenderingContext2D;
  const atlas = new CanvasTexture(atlasCanvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  const labelled = new MeshBasicMaterial({ map: atlas });

  // The block display on the frame: 2 lines of 15 characters, as on the other scenes.
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 384;
  screenCanvas.height = 96;
  const s = screenCanvas.getContext("2d") as CanvasRenderingContext2D;
  const screen = new CanvasTexture(screenCanvas);
  screen.colorSpace = SRGBColorSpace;
  let shown = "";
  const display = (top: string, bottom: string) => {
    if (shown === `${top}\n${bottom}`) return;
    shown = `${top}\n${bottom}`;
    s.fillStyle = SCREEN;
    s.fillRect(0, 0, 384, 96);
    [top, bottom].forEach((line, i) => drawText(s, line.slice(0, 15).padEnd(15), 12, 14 + i * 40, 4, PHOSPHOR, UNLIT, 3));
    screen.needsUpdate = true;
    stage.invalidate();
  };

  // Farmland: a big ground plane with grass tones in its vertex colours.
  const groundGeometry = new PlaneGeometry(40, 30, 40, 30).rotateX(-Math.PI / 2);
  const base = new Color(GRASS);
  const colours = Array.from({ length: groundGeometry.attributes.position.count }, (_, i) =>
    base.clone().multiplyScalar(0.85 + 0.25 * noise(i)).toArray(),
  ).flat();
  groundGeometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  // Unlit: it fills most of the view, and flat grass is cheap to draw on slow devices.
  const groundMaterial = new MeshBasicMaterial({ vertexColors: true });
  world.add(new Mesh(groundGeometry, groundMaterial));

  // The lever frame and its block shelf: the display and the route lamps.
  const frame = new Group();
  world.add(frame);
  const yard = new Group();
  world.add(yard);
  const lamps = new InstancedMesh(new CylinderGeometry(0.06, 0.06, 0.04, 16).rotateX(Math.PI / 2), new MeshBasicMaterial(), LAMPS);
  const lamp = (k: number, on: boolean) => {
    lamps.setColorAt(k, new Color(AMBER).multiplyScalar(on ? 1 : 0.18));
    (lamps.instanceColor as NonNullable<typeof lamps.instanceColor>).needsUpdate = true;
  };
  const lit = new Mesh(new BoxGeometry(0.18, 0.1, 0.13), new MeshBasicMaterial({ color: LIT }));
  lit.position.y = 0.95;
  lit.raycast = () => {};
  lit.visible = false;
  frame.add(lit);
  const blockScreen = new Mesh(new PlaneGeometry(0.88, 0.22), new MeshBasicMaterial({ map: screen }));

  // The train: a plain two-tone locomotive and two wagons, no faces and no railway's colours.
  const car = (parts: [BufferGeometry, string][]) => {
    const g = new Group();
    for (const [geometry, colour] of parts) g.add(new Mesh(geometry, toon(colour)));
    yard.add(g);
    return g;
  };
  const train = [
    car([
      [new BoxGeometry(0.42, 0.24, 0.26).translate(0.06, 0.24, 0), "#3d5560"],
      [new BoxGeometry(0.18, 0.34, 0.28).translate(-0.2, 0.29, 0), "#e9e2cf"],
      [new BoxGeometry(0.58, 0.08, 0.3).translate(0, 0.08, 0), "#2b2d2a"],
    ]),
    car([
      [new BoxGeometry(0.54, 0.2, 0.26).translate(0, 0.2, 0), "#b0743a"],
      [new BoxGeometry(0.58, 0.08, 0.3).translate(0, 0.08, 0), "#2b2d2a"],
    ]),
    car([
      [new BoxGeometry(0.54, 0.2, 0.26).translate(0, 0.2, 0), "#7d8288"],
      [new BoxGeometry(0.58, 0.08, 0.3).translate(0, 0.08, 0), "#2b2d2a"],
    ]),
  ];

  const routes = new Map<string, CatmullRomCurve3>(); // per group
  const stops = new Map<string, number>(); // arc position of each project's platform on its route
  const levers = new Map<string, Object3D>();
  const signals = new Map<string, Object3D>(); // arm pivots, per group
  const boards: Mesh[] = [];
  const byId = new Map<string, Project>();
  const scenery: Object3D[] = [];
  let focused: string | null = null;
  let playing: string | null = null;
  let current = route(MAIN_Z);
  let position = 0; // the loco's arc position on `current`

  // Puts the loco at arc position u on the curve, the wagons behind it, each facing along the track.
  const run = (curve: CatmullRomCurve3, u: number) => {
    const length = curve.getLength();
    train.forEach((c, k) => {
      const at = Math.max(0, u - (k * CAR) / length);
      const p = curve.getPointAt(at);
      const t = curve.getTangentAt(at);
      c.position.set(p.x, 0.1, p.z);
      c.rotation.y = -Math.atan2(t.z, t.x);
    });
  };

  const first = (p: Project) => p.label ?? wrap(p.title, 15)[0];
  const idle = () => display("SIGNAL BOX", `${byId.size} ROUTES`);
  const describe = (p: Project) => display(first(p), `LEVER ${pad([...byId.keys()].indexOf(p.id) + 1)}`);

  return {
    world,
    camera,

    build(projects) {
      if (projects.length > ROUTES_MAX) throw new Error(`the label atlas holds ${ROUTES_MAX} routes`);
      const groups = [...new Set(projects.map((p) => p.group))];
      const rows = groups.map((g) => projects.filter((p) => p.group === g));
      projects.forEach((p) => byId.set(p.id, p));

      // The lever frame: a wooden base, one lever per project with a numbered plate, and behind the
      // levers a shelf with the block display and the route lamps.
      const n = projects.length;
      const width = n * LEVER_PITCH + 0.6;
      frame.add(
        new Mesh(
          mergeGeometries([
            new BoxGeometry(width, FRAME.h, FRAME.d).translate(0, FRAME.h / 2, FRAME.z),
            new BoxGeometry(width, 0.25, 0.25).translate(0, FRAME.h + 0.125, FRAME.z - 0.35),
          ]),
          wood,
        ),
      );
      blockScreen.position.set(-width / 2 + 0.85, FRAME.h + 0.125, FRAME.z - 0.224);
      frame.add(blockScreen);
      const place = new Object3D();
      for (let k = 0; k < LAMPS; k++) {
        place.position.set(width / 2 - 0.4 - (LAMPS - 1 - k) * 0.3, FRAME.h + 0.125, FRAME.z - 0.22);
        place.updateMatrix();
        lamps.setMatrixAt(k, place.matrix);
        lamp(k, false);
      }
      frame.add(lamps);
      const plates: BufferGeometry[] = [];
      const shaft = new BoxGeometry(0.07, 0.95, 0.07).translate(0, 0.475, 0);
      const handle = new BoxGeometry(0.14, 0.07, 0.09).translate(0, 0.95, 0);
      const target = new BoxGeometry(0.3, 1.1, 0.3).translate(0, 0.55, 0);
      const hidden = new MeshBasicMaterial();
      const colours = new Map(groups.map((g) => [g, toon(LEVER[g] ?? INK)]));
      projects.forEach((p, i) => {
        const x = (i - (n - 1) / 2) * LEVER_PITCH;
        const pivot = new Object3D();
        pivot.position.set(x, FRAME.h, FRAME.z);
        pivot.rotation.x = -0.3; // leaning back: normal
        pivot.userData.id = p.id;
        const colour = colours.get(p.group) as MeshToonMaterial;
        const pick = new Mesh(target, hidden); // wider than the lever, for the pointer
        pick.visible = false;
        pivot.add(new Mesh(shaft, colour), new Mesh(handle, colour), pick);
        frame.add(pivot);
        levers.set(p.id, pivot);
        plates.push(face(0.3, 0.225, plate(i)).translate(x, FRAME.h / 2, FRAME.z + FRAME.d / 2 + 0.003));
        const [px, py] = plate(i);
        a.fillStyle = PAPER;
        a.fillRect(px + 2, py + 2, 124, 92);
        a.fillStyle = LEVER[p.group] ?? INK;
        a.fillRect(px + 2, py + 2, 124, 8);
        drawText(a, pad(i + 1), px + 10, py + 16, 4, INK);
        wrap(p.label ?? p.title, 9)
          .slice(0, 2)
          .forEach((line, l) => drawText(a, line, px + 8, py + 52 + l * 18, 2, INK));
      });
      frame.add(new Mesh(mergeGeometries(plates), labelled));

      // The yard: ballast, rails and sleepers along each route, a signal per siding, and a platform
      // with a board for every project.
      const rails: BufferGeometry[] = [];
      const sleepers: { p: Vector3; angle: number }[] = [];
      const posts: BufferGeometry[] = [];
      const platforms: BufferGeometry[] = [];
      groups.forEach((g, row) => {
        const z = SIDING_Z(row);
        const curve = route(z);
        routes.set(g, curve);
        const samples = curve.getSpacedPoints(80);
        for (const side of [-0.1, 0.1]) {
          const offset = samples.map((pt, k) => {
            const t = curve.getTangentAt(k / 80);
            return new Vector3(pt.x - t.z * side, 0.1, pt.z + t.x * side);
          });
          rails.push(new TubeGeometry(new CatmullRomCurve3(offset), 120, 0.022, 5));
        }
        const length = curve.getLength();
        for (let d = 0; d < length; d += 0.28) {
          const u = d / length;
          const t = curve.getTangentAt(u);
          sleepers.push({ p: curve.getPointAt(u), angle: -Math.atan2(t.z, t.x) });
        }
        // The signal stands where the siding leaves the fan; its arm points back at the train.
        const sx = -2.2;
        posts.push(new CylinderGeometry(0.03, 0.04, 1.05, 8).translate(sx, 0.525, z - 0.3));
        const arm = new Object3D();
        arm.position.set(sx, 0.98, z - 0.27);
        arm.add(new Mesh(new BoxGeometry(0.42, 0.07, 0.02).translate(-0.21, 0, 0), toon("#b33a2e")));
        arm.add(new Mesh(new BoxGeometry(0.06, 0.071, 0.021).translate(-0.33, 0, 0), toon(PAPER)));
        yard.add(arm);
        signals.set(g, arm);
        rows[row].forEach((p, col) => {
          const x = STOP_X(col);
          stops.set(p.id, atX(curve, x));
          platforms.push(new BoxGeometry(0.8, 0.14, 0.28).translate(x, 0.07, z + 0.36));
          posts.push(new CylinderGeometry(0.025, 0.025, 0.5, 6).translate(x, 0.39, z + 0.42));
          const i = projects.indexOf(p);
          const sign = new Mesh(face(0.62, 0.31, board(i)), labelled);
          sign.position.set(x, 0.72, z + 0.44);
          sign.userData.id = p.id;
          yard.add(sign);
          boards.push(sign);
          const [bx, by] = board(i);
          a.fillStyle = PAPER;
          a.fillRect(bx + 2, by + 2, 124, 60);
          a.fillStyle = LEVER[p.group] ?? INK;
          a.fillRect(bx + 2, by + 2, 124, 6);
          drawText(a, pad(i + 1), bx + 8, by + 14, 3, INK);
          drawText(a, wrap(p.label ?? p.title, 6)[0], bx + 50, by + 18, 2, INK);
          drawText(a, (p.ref ?? "").slice(0, 9), bx + 8, by + 42, 2, INK);
          mark(a, p.id, bx + 110, by + 44, 2, INK);
        });
      });
      const sleeperMesh = new InstancedMesh(new BoxGeometry(0.08, 0.03, 0.32), toon("#4a3b2e"), sleepers.length);
      sleepers.forEach(({ p, angle }, k) => {
        place.position.set(p.x, 0.055, p.z);
        place.rotation.set(0, angle, 0);
        place.updateMatrix();
        sleeperMesh.setMatrixAt(k, place.matrix);
      });
      const zs = groups.map((_, row) => SIDING_Z(row));
      const ballast = new BoxGeometry(9.8, 0.04, Math.max(...zs) - Math.min(...zs) + 1.2).translate(
        -1.9,
        0.02,
        (Math.max(...zs) + Math.min(...zs)) / 2,
      );
      yard.add(
        new Mesh(ballast, toon(BALLAST)),
        new Mesh(mergeGeometries(rails), toon(RAIL)),
        sleeperMesh,
        new Mesh(mergeGeometries(posts), toon("#d8d2c4")),
        new Mesh(mergeGeometries(platforms), toon("#a9a49b")),
      );

      // Trees round the yard: cones and rounded crowns, placed by a fixed hash.
      const trees = 16;
      const cones = new InstancedMesh(new ConeGeometry(0.28, 0.9, 7).translate(0, 0.45, 0), toon("#4f7a3f"), trees);
      const crowns = new InstancedMesh(new IcosahedronGeometry(0.34, 0).translate(0, 0.45, 0), toon("#6a9a4a"), trees);
      for (let k = 0; k < trees; k++) {
        const behind = k < 10;
        const x = behind ? -6 + k * 0.95 + noise(k) * 0.4 : 3.4 + noise(k) * 0.6;
        const z = behind ? Math.min(...zs) - 0.9 - noise(k + 50) * 0.6 : Math.max(...zs) - (k - 10) * 0.7;
        place.position.set(x, 0, z);
        place.rotation.set(0, noise(k + 9) * 3, 0);
        const size = 0.8 + noise(k + 20) * 0.5;
        place.scale.setScalar(size);
        place.updateMatrix();
        (k % 2 ? crowns : cones).setMatrixAt(k, place.matrix);
        // The other mesh's instance at this slot sits out of sight, at zero scale.
        place.scale.setScalar(0);
        place.updateMatrix();
        (k % 2 ? cones : crowns).setMatrixAt(k, place.matrix);
        place.scale.setScalar(1);
      }
      yard.add(cones, crowns);
      scenery.push(cones, crowns, sleeperMesh);

      atlas.needsUpdate = true;
      current = routes.get(groups[0]) as CatmullRomCurve3;
      position = atX(current, IDLE_X);
      run(current, position);
      idle();
    },

    layout(aspect) {
      if (aspect >= 1.25) {
        yard.rotation.y = 0;
        yard.position.set(0.7, 0, -0.4);
      } else {
        // Portrait: the yard turns so its tracks run away from the frame, sidings side by side.
        yard.rotation.y = -Math.PI / 2;
        yard.position.set(-2.1, 0, -2.4);
      }
      for (const b of boards) b.rotation.y = -yard.rotation.y; // boards always face the frame
      // Framed with the trees in place, so low power does not change the framing.
      for (const o of scenery) o.visible = true;
      world.updateMatrixWorld();
      fit(camera, [drawnBox(frame), drawnBox(yard)], aspect, VIEW);
      for (const o of scenery) o.visible = !stage.lowPower;
      stage.invalidate();
    },

    focus(id) {
      if (id === focused) return;
      focused = id;
      const lever = id ? levers.get(id) : undefined;
      if (lever) lever.add(lit);
      lit.visible = !!lever;
      if (!playing) {
        const p = id ? byId.get(id) : undefined;
        if (p) describe(p);
        else idle();
      }
      stage.invalidate();
    },

    async insert(id) {
      const p = byId.get(id);
      const lever = levers.get(id);
      const curve = routes.get(p?.group ?? "");
      const stop = stops.get(id);
      if (!p || !lever || !curve || stop === undefined) return;
      playing = id;
      // The lever, then the interlocking: lamps tick on one by one.
      stage.play(CLUNK);
      display(first(p), "ROUTE SETTING");
      await stage.tween(150, (t) => {
        lever.rotation.x = -0.3 + 0.65 * t;
      });
      let ticked = 0;
      await stage.tween(
        LAMPS * 55,
        (t) => {
          for (; ticked < Math.min(LAMPS, Math.floor(t * LAMPS) + 1); ticked++) {
            lamp(ticked, true);
            stage.play(CLICK);
          }
        },
        linear,
      );
      // Points and signal.
      stage.play(THUNK);
      const arm = signals.get(p.group) as Object3D;
      await stage.tween(160, (t) => {
        arm.rotation.z = ARM_CLEAR * t;
      });
      display(first(p), "ROUTE SET");
      // The train runs from the shared stretch to the platform.
      current = curve;
      const from = atX(curve, IDLE_X);
      stage.play(HORN);
      stage.play(CHUFFS);
      await stage.tween(
        1000,
        (t) => {
          position = from + (stop - from) * t;
          run(curve, position);
        },
        easeInOut,
      );
      stage.play(ARRIVED);
      display(first(p), p.ref ? `ARRIVED ${p.ref}` : "ARRIVED");
    },

    async eject() {
      const id = playing;
      const p = id ? byId.get(id) : undefined;
      const lever = id ? levers.get(id) : undefined;
      if (!p || !lever) return;
      // The train backs out to the shared stretch, then the signal, lamps and lever go back.
      stage.play(BACK);
      const curve = current;
      const from = position;
      const to = atX(curve, IDLE_X);
      await stage.tween(
        700,
        (t) => {
          position = from + (to - from) * t;
          run(curve, position);
        },
        easeInOut,
      );
      const arm = signals.get(p.group) as Object3D;
      for (let k = 0; k < LAMPS; k++) lamp(k, false);
      stage.play(CLUNK);
      await Promise.all([
        stage.tween(120, (t) => {
          arm.rotation.z = ARM_CLEAR * (1 - t);
        }),
        stage.tween(150, (t) => {
          lever.rotation.x = 0.35 - 0.65 * t;
        }),
      ]);
      playing = null;
      const f = focused ? byId.get(focused) : undefined;
      if (f) describe(f);
      else idle();
    },

    dispose() {
      disposeAll(world, [atlas, screen, skyTexture, bands]);
    },
  };
};
