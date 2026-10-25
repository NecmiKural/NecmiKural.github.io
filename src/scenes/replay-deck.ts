// Replay Deck, the default scene. Each project is a cassette in a wall rack. Choosing one loads it
// into a desk tape deck: the lid shuts, the reels turn, PROPOSED lights and then VERIFIED, as in
// the eval harness that replays recorded runs and lets code check what the model proposed.
// Procedural geometry and canvas-drawn labels only: no models, image files or web fonts.

import {
  BackSide,
  Box3,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RedFormat,
  Scene as World,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { drawText, mark, wrap } from "../engine/font.ts";
import { easeInOut, linear } from "../engine/loop.ts";
import type { Motif } from "../engine/sound.ts";
import type { CreateScene, Project } from "../engine/types.ts";

const INK = "#1e1f1c";
const PAPER = "#e8e2d3";
const SHELL = "#262826";
const RACK = "#3a3c37";
const SCREEN = "#10140f";
const PHOSPHOR = "#9be36b";
const UNLIT = "#1f2a19";
const FOCUS = "#f0b54a";
const PROPOSED = "#ffb000";
const VERIFIED = "#4cc38a";
const BAND: Record<string, string> = {
  flagship: "#e8a33d",
  software: "#3f7cac",
  coursework: "#5c9e6e",
  "open-source": "#9a8fbf",
};

// World units: a cassette is 1 wide.
const TAPE = { w: 1, h: 0.64, d: 0.14 };
const PITCH = 1.14; // cassette spacing on a shelf
const ROW = 0.95; // shelf spacing
const RACK_D = 0.8;
const DECK = { w: 4.4, h: 1.4, d: 2 };
const SLOT = { x: 0.85, z: -0.15 }; // the well in the deck top
const FRONT = DECK.d / 2 + 0.004; // just in front of the deck's face
const LID_OPEN = -1.95;
const VIEW = new Vector3(0.3, 0.55, 1).normalize(); // from the scene towards the fixed camera

const LIFT: Motif = [{ wave: "triangle", hz: 220, to: 330, dur: 0.09 }];
const CLUNK: Motif = [
  { noise: 700, dur: 0.07, vol: 0.2 },
  { wave: "triangle", hz: 98, dur: 0.12, vol: 0.2 },
];
const MOTOR: Motif = [{ hz: 49, dur: 0.45, vol: 0.05, lfo: 9 }];
const CHECKED: Motif = [
  { hz: 587, dur: 0.06 },
  { hz: 740, at: 0.08, dur: 0.06 },
  { hz: 880, at: 0.16, dur: 0.09 },
];
const EJECT: Motif = [
  { wave: "triangle", hz: 330, to: 165, dur: 0.12 },
  { noise: 1200, dur: 0.04 },
];

// The label atlas: one 1024 px canvas, cut into 24 cells of 256x160. Cassettes take the first
// cells; the last two hold 32 px strips for the shelf names and the deck's face labels.
const ATLAS = 1024;
const TAPES_MAX = 22;
type Rect = readonly [x: number, y: number, w: number, h: number];
const cell = (i: number): Rect => [(i % 4) * 256, Math.floor(i / 4) * 160, 256, 160];
const shelfStrip = (row: number): Rect => [cell(22)[0], cell(22)[1] + row * 32, 256, 32];
const label = (row: number): Rect => [cell(23)[0] + 48, cell(23)[1] + row * 32, 160, 32]; // deck face labels

// A plane that shows one rectangle of the atlas.
function face(w: number, h: number, [x, y, rw, rh]: Rect): BufferGeometry {
  const g = new PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (x + uv.getX(i) * rw) / ATLAS, 1 - (y + (1 - uv.getY(i)) * rh) / ATLAS);
  }
  return g;
}

// Frames the boxes' corners from the fixed viewing direction, as tight as the aspect allows.
// A few passes re-centre the target on what the camera actually sees.
function fit(camera: PerspectiveCamera, boxes: Box3[], aspect: number): void {
  const corners = boxes.flatMap((box) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map(
      (i) => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z),
    ),
  );
  const target = new Box3().setFromPoints(corners).getCenter(new Vector3());
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const tanH = tanV * aspect;
  camera.aspect = aspect;
  camera.position.copy(target).add(VIEW);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  let distance = 0;
  for (let pass = 0; ; pass++) {
    const q = corners.map((c) => c.clone().sub(target));
    distance = Math.max(
      ...q.map((v) => v.dot(VIEW) + Math.max(Math.abs(v.dot(right)) / tanH, Math.abs(v.dot(up)) / tanV)),
    );
    if (pass === 3) break;
    // Screen position of each corner, -1..1 across the view; then move the target to the middle.
    const xs = q.map((v) => v.dot(right) / ((distance - v.dot(VIEW)) * tanH));
    const ys = q.map((v) => v.dot(up) / ((distance - v.dot(VIEW)) * tanV));
    target
      .addScaledVector(right, ((Math.min(...xs) + Math.max(...xs)) / 2) * distance * tanH)
      .addScaledVector(up, ((Math.min(...ys) + Math.max(...ys)) / 2) * distance * tanV);
  }
  distance *= 1.04;
  camera.position.copy(target).addScaledVector(VIEW, distance);
  camera.near = distance / 20;
  camera.far = distance * 6;
  camera.updateProjectionMatrix();
}

const shelfName = (group: string) => group.toUpperCase().replace("-", " ");
const pad = (n: number) => String(n).padStart(2, "0");

export const create: CreateScene = (stage) => {
  const world = new World();
  world.background = new Color("#171816");
  const camera = new PerspectiveCamera(35, 1, 1, 100);
  world.add(new HemisphereLight("#fff4e0", "#2b2d2a", 1.5));
  const sun = new DirectionalLight("#ffffff", 2.2);
  sun.position.set(-5, 9, 7);
  world.add(sun);

  // Three-band toon shading, no textures.
  const bands = new DataTexture(new Uint8Array([60, 140, 255]), 3, 1, RedFormat);
  bands.minFilter = bands.magFilter = NearestFilter;
  bands.needsUpdate = true;
  const toon = (color: string) => new MeshToonMaterial({ color, gradientMap: bands });
  const paper = toon(PAPER);
  const ink = toon(INK);
  const flat = (color: string) => new MeshBasicMaterial({ color });
  const dark = flat(SCREEN);

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasCanvas.height = ATLAS;
  const a = atlasCanvas.getContext("2d") as CanvasRenderingContext2D;
  const atlas = new CanvasTexture(atlasCanvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  const labelled = new MeshBasicMaterial({ map: atlas, alphaTest: 0.5 });

  // The deck's dot-matrix display: 2 lines of 15 characters.
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

  // Inverted-hull outline: the mesh again, inside out and a little larger.
  const outline = (mesh: Mesh, color: string, thickness: number): Mesh => {
    mesh.geometry.computeBoundingBox();
    const size = (mesh.geometry.boundingBox as Box3).getSize(new Vector3());
    const hull = new Mesh(mesh.geometry, new MeshBasicMaterial({ color, side: BackSide }));
    hull.scale.set(1 + (2 * thickness) / size.x, 1 + (2 * thickness) / size.y, 1 + (2 * thickness) / size.z);
    hull.raycast = () => {};
    mesh.add(hull);
    return hull;
  };

  const bench = new Mesh(new BoxGeometry(40, 0.5, 16), toon("#2b2d2a"));
  bench.position.y = -0.25;
  world.add(bench);

  // The deck: a paper-coloured box with a top-loading well under a hinged lid. On its face: the
  // display, two reel windows, the PROPOSED and VERIFIED lamps and a round EJECT key.
  const deck = new Group();
  world.add(deck);
  const body = new Mesh(new RoundedBoxGeometry(DECK.w, DECK.h, DECK.d, 3, 0.14), paper);
  body.position.y = DECK.h / 2;
  const deckOutline = outline(body, INK, 0.035);
  const well = new Mesh(new PlaneGeometry(TAPE.w + 0.14, TAPE.d + 0.12), dark);
  well.rotation.x = -Math.PI / 2;
  well.position.set(SLOT.x, DECK.h + 0.004, SLOT.z);
  const hinge = new Object3D();
  hinge.position.set(SLOT.x, DECK.h + 0.01, SLOT.z - 0.23);
  hinge.rotation.x = LID_OPEN;
  const lid = new Mesh(new RoundedBoxGeometry(TAPE.w + 0.36, 0.06, 0.46, 2, 0.025), toon("#33352f"));
  lid.position.set(0, 0.03, 0.23);
  hinge.add(lid);
  const display3d = new Mesh(new PlaneGeometry(1.8, 0.45), new MeshBasicMaterial({ map: screen }));
  display3d.position.set(-1.1, DECK.h - 0.42, FRONT);
  const windows = new Mesh(
    mergeGeometries([-0.3, 0.3].map((dx) => new CircleGeometry(0.22, 32).translate(SLOT.x + dx, DECK.h - 0.42, 0))),
    dark,
  );
  windows.position.z = FRONT;
  const reels = [-0.3, 0.3].map((dx) => {
    const reel = new Mesh(new CircleGeometry(0.13, 6), flat(PAPER));
    reel.position.set(SLOT.x + dx, DECK.h - 0.42, FRONT + 0.002);
    return reel;
  });
  const lamp = (x: number) => {
    const m = new Mesh(new CylinderGeometry(0.09, 0.09, 0.06, 24), flat(INK));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, 0.52, FRONT);
    return m;
  };
  const lamps = [lamp(-1.75), lamp(-0.85)];
  const light = (on: boolean) => {
    (lamps[0].material as MeshBasicMaterial).color.set(PROPOSED).multiplyScalar(on ? 1 : 0.2);
    (lamps[1].material as MeshBasicMaterial).color.set(VERIFIED).multiplyScalar(on ? 1 : 0.2);
  };
  light(false);
  const key = new Mesh(new CylinderGeometry(0.16, 0.16, 0.08, 28), ink);
  key.rotation.x = Math.PI / 2;
  key.position.set(1.8, 0.52, FRONT);
  const deckLabels = new Mesh(
    mergeGeometries(
      [-1.75, -0.85, 1.8].map((x, row) => face(0.75, 0.15, label(row)).translate(x, 0.27, 0)),
    ),
    labelled,
  );
  deckLabels.position.z = FRONT;
  ["PROPOSED", "VERIFIED", "EJECT"].forEach((text, row) => {
    const [x, y, w] = label(row);
    drawText(a, text, x + (w - text.length * 18) / 2, y + 5, 3, INK);
  });
  const deckShadow = new Mesh(new PlaneGeometry(DECK.w + 0.5, DECK.d + 0.5), flat("#1d1e1b"));
  deckShadow.rotation.x = -Math.PI / 2;
  deckShadow.position.y = 0.003;
  deck.add(body, well, hinge, display3d, windows, ...reels, ...lamps, key, deckLabels, deckShadow);

  const rack = new Group();
  world.add(rack);
  const ring = new Mesh(new RoundedBoxGeometry(TAPE.w, TAPE.h, TAPE.d, 2, 0.035), new MeshBasicMaterial({ color: FOCUS, side: BackSide }));
  ring.scale.set(1.08, 1.12, 1.5);
  ring.raycast = () => {};
  ring.visible = false;
  rack.add(ring);

  const tapes = new Map<string, Group>();
  const homes = new Map<string, Vector3>();
  const slide = new Map<string, number>(); // how far each cassette is pulled out, 0..1
  const byId = new Map<string, Project>();
  const played = new Set<string>();
  let rackW = 0;
  let rackH = 0;
  let focused: string | null = null;
  let playing: string | null = null;
  let moving: Group | null = null;

  const idle = () =>
    display("READY", played.size ? `PLAYED ${pad(played.size)}/${pad(byId.size)}` : `${byId.size} TAPES`);
  const first = (p: Project) => p.label ?? wrap(p.title, 15)[0];
  const describe = (p: Project) => display(first(p), p.tag ?? shelfName(p.group));
  const slotIn = () => new Vector3(SLOT.x, DECK.h - TAPE.h / 2 - 0.04, SLOT.z);

  const place = (id: string) => {
    const tape = tapes.get(id) as Group;
    if (tape.parent !== rack || tape === moving) return;
    tape.position.z = (homes.get(id) as Vector3).z + 0.22 * (slide.get(id) ?? 0);
  };
  const pull = (id: string, to: number) => {
    const from = slide.get(id) ?? 0;
    if (from === to) return;
    void stage.tween(140, (t) => {
      slide.set(id, from + (to - from) * t);
      place(id);
    });
  };
  const showRing = () => {
    ring.visible = focused !== null && focused !== playing && !stage.lowPower;
  };

  // A path through world space, rebuilt every frame so it follows a resize mid-flight.
  const fly = (tape: Group, ms: number, points: () => Vector3[]) =>
    stage.tween(
      ms,
      (t) => {
        tape.position.copy(new CatmullRomCurve3(points()).getPointAt(t));
        tape.rotation.x = -Math.sin(Math.PI * t) * 0.5; // face tilts up mid-flight
      },
      easeInOut,
    );
  const above = () => deck.localToWorld(new Vector3(SLOT.x, DECK.h + 1.2, SLOT.z + 0.4));
  const pulled = (id: string) => rack.localToWorld((homes.get(id) as Vector3).clone().add(new Vector3(0, 0.15, 0.7)));

  return {
    world,
    camera,

    build(projects) {
      if (projects.length > TAPES_MAX) throw new Error(`the label atlas holds ${TAPES_MAX} cassettes`);
      const groups = [...new Set(projects.map((p) => p.group))];
      const rows = groups.map((g) => projects.filter((p) => p.group === g));
      const cols = Math.max(...rows.map((r) => r.length));
      rackW = cols * PITCH + 0.3;
      rackH = 0.22 + (groups.length - 1) * ROW + TAPE.h + 0.3;
      const shelfTop = (row: number) => 0.22 + (groups.length - 1 - row) * ROW;

      // Back, sides, top and shelves in one mesh; the shelf names in another.
      const frame = [
        new BoxGeometry(rackW + 0.2, rackH, 0.1).translate(0, rackH / 2, 0.05 - RACK_D / 2),
        new BoxGeometry(0.1, rackH, RACK_D).translate(-rackW / 2 - 0.05, rackH / 2, 0),
        new BoxGeometry(0.1, rackH, RACK_D).translate(rackW / 2 + 0.05, rackH / 2, 0),
        new BoxGeometry(rackW + 0.2, 0.1, RACK_D).translate(0, rackH - 0.05, 0),
        ...groups.map((_, row) => new BoxGeometry(rackW, 0.22, RACK_D).translate(0, shelfTop(row) - 0.11, 0)),
      ];
      const names = groups.map((g, row) => {
        const [x, y] = shelfStrip(row);
        drawText(a, shelfName(g), x + 6, y + 5, 3, PAPER);
        return face(1.6, 0.2, shelfStrip(row)).translate(-rackW / 2 + 0.9, shelfTop(row) - 0.11, RACK_D / 2 + 0.003);
      });
      const shadow = new Mesh(new PlaneGeometry(rackW + 0.6, RACK_D + 0.5), flat("#1d1e1b"));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.003;
      rack.add(new Mesh(mergeGeometries(frame), toon(RACK)), new Mesh(mergeGeometries(names), labelled), shadow);

      const shell = new RoundedBoxGeometry(TAPE.w, TAPE.h, TAPE.d, 2, 0.035);
      const shellMaterial = toon(SHELL);
      projects.forEach((p, n) => {
        byId.set(p.id, p);
        const row = groups.indexOf(p.group);
        const col = rows[row].indexOf(p);
        const tape = new Group();
        tape.userData.id = p.id;
        const front = new Mesh(face(0.94, 0.5875, cell(n)), labelled);
        front.position.z = TAPE.d / 2 + 0.003;
        tape.add(new Mesh(shell, shellMaterial), front);
        const home = new Vector3(-rackW / 2 + 0.15 + PITCH / 2 + col * PITCH, shelfTop(row) + TAPE.h / 2, 0.02);
        tape.position.copy(home);
        homes.set(p.id, home);
        tapes.set(p.id, tape);
        rack.add(tape);

        // The face: a paper label with a band in the group colour, the title, the tag and the
        // cassette's own mark; below it, the window with two hubs.
        const [x, y] = cell(n);
        a.fillStyle = SHELL;
        a.fillRect(x, y, 256, 160);
        a.fillStyle = PAPER;
        a.fillRect(x + 8, y + 8, 240, 100);
        a.fillStyle = BAND[p.group] ?? RACK;
        a.fillRect(x + 8, y + 8, 240, 12);
        const lines = wrap(p.title, 19);
        if (lines.length > 4) lines.splice(3, Infinity, `${lines[3].slice(0, 17)}..`);
        lines.forEach((line, i) => drawText(a, line, x + 14, y + 26 + i * 16, 2, INK));
        drawText(a, [p.label, p.tag ?? shelfName(p.group)].filter(Boolean).join(" "), x + 14, y + 92, 2, INK);
        mark(a, p.id, x + 226, y + 89, 3, INK);
        a.fillStyle = SCREEN;
        a.beginPath();
        a.roundRect(x + 64, y + 116, 128, 36, 8);
        a.fill();
        for (const cx of [x + 100, x + 156]) {
          a.fillStyle = PAPER;
          a.beginPath();
          a.arc(cx, y + 134, 11, 0, 2 * Math.PI);
          a.fill();
          a.fillStyle = SCREEN;
          a.beginPath();
          a.arc(cx, y + 134, 5, 0, 2 * Math.PI);
          a.fill();
        }
      });
      atlas.needsUpdate = true;
      idle();
    },

    layout(aspect) {
      // Side by side when the view is clearly wider than tall; near square or portrait, stacked.
      if (aspect >= 1.25) {
        rack.position.set(-(rackW / 2 + 0.3), 0, 0);
        deck.position.set(DECK.w / 2 + 0.3, 0, 0.7);
      } else {
        // The deck sits on top of the rack. The objects move; the camera angle does not.
        rack.position.set(0, 0, 0);
        deck.position.set(0, rackH, (RACK_D - DECK.d) / 2); // front faces flush, top row in view
      }
      deckOutline.visible = !stage.lowPower;
      showRing();
      world.updateMatrixWorld();
      // The rack, the deck and the top of a cassette's flight, so a load never leaves the view.
      const apex = new Box3().setFromCenterAndSize(above(), new Vector3(TAPE.w, TAPE.h, TAPE.w));
      fit(camera, [new Box3().setFromObject(rack), new Box3().setFromObject(deck), apex], aspect);
      stage.invalidate();
    },

    focus(id) {
      if (id === focused) return;
      if (focused) pull(focused, 0);
      focused = id;
      const tape = id ? tapes.get(id) : undefined;
      if (id && tape && id !== playing) {
        tape.add(ring);
        pull(id, 1);
      }
      showRing();
      if (!playing) {
        const p = id ? byId.get(id) : undefined;
        if (p) describe(p);
        else idle();
      }
      stage.invalidate();
    },

    async insert(id) {
      const tape = tapes.get(id);
      const p = byId.get(id);
      if (!tape || !p) return;
      playing = id;
      played.add(id);
      showRing();
      stage.play(LIFT);
      const start = tape.getWorldPosition(new Vector3());
      world.attach(tape);
      moving = tape;
      const lidFrom = hinge.rotation.x;
      await Promise.all([
        stage.tween(180, (t) => {
          hinge.rotation.x = lidFrom + (LID_OPEN - lidFrom) * t;
        }),
        fly(tape, 540, () => [
          start,
          start.clone().add(new Vector3(0, 0.15, 0.7)),
          above(),
          deck.localToWorld(new Vector3(SLOT.x, DECK.h + TAPE.h / 2 + 0.15, SLOT.z)),
          deck.localToWorld(slotIn()),
        ]),
      ]);
      deck.attach(tape);
      moving = null;
      tape.rotation.set(0, 0, 0);
      tape.position.copy(slotIn());
      await stage.tween(110, (t) => {
        hinge.rotation.x = LID_OPEN * (1 - t);
      });
      stage.play(CLUNK);
      stage.play(MOTOR);
      await stage.tween(
        320,
        (t) => {
          if (!stage.lowPower) for (const reel of reels) reel.rotation.z = -t * 3 * Math.PI;
        },
        linear,
      );
      (lamps[0].material as MeshBasicMaterial).color.set(PROPOSED);
      await stage.tween(130, () => {});
      light(true);
      stage.play(CHECKED);
      display(first(p), `SRC OK ${p.tag ?? ""}`.trim());
    },

    async eject() {
      const id = playing;
      const tape = id ? tapes.get(id) : undefined;
      if (!id || !tape) return;
      light(false);
      stage.play(EJECT);
      void stage.tween(160, (t) => {
        key.position.z = FRONT - 0.05 * Math.sin(Math.PI * t);
      });
      await stage.tween(110, (t) => {
        hinge.rotation.x = LID_OPEN * t;
      });
      const start = tape.getWorldPosition(new Vector3());
      world.attach(tape);
      moving = tape;
      await fly(tape, 400, () => [start, above(), pulled(id), rack.localToWorld((homes.get(id) as Vector3).clone())]);
      rack.attach(tape);
      moving = null;
      playing = null;
      tape.rotation.set(0, 0, 0);
      tape.position.copy(homes.get(id) as Vector3);
      slide.set(id, 0);
      if (focused === id) {
        tape.add(ring);
        pull(id, 1);
      }
      showRing();
      const p = focused ? byId.get(focused) : undefined;
      if (p) describe(p);
      else idle();
    },

    dispose() {
      const owned = new Set<{ dispose(): void }>([atlas, screen, bands]);
      world.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        owned.add(o.geometry);
        for (const m of [o.material].flat() as Material[]) owned.add(m);
      });
      for (const x of owned) x.dispose();
    },
  };
};
