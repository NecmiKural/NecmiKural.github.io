// Glovebox. In a chemistry lab the glovebox is the sandbox: a sealed box, two gloves and an
// airlock. Each project is a sample canister on a shelf. Choosing one sends it through the airlock:
// the outer door shuts, the chamber purges, the gloves set the canister under the gauge, and the
// gauge accepts the reading. The same shape as the code-mode sandbox, where model-written code
// runs sealed off and the host checks every call. Procedural geometry and canvas-drawn labels
// only; the glass is drawn as edges, not as transparent panes.

import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  Scene as World,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { drawText, mark, wrap } from "../engine/font.ts";
import { atlasPlane, disposeAll, drawnBox, fit, GROUP_COLOURS, toonMaker, type Rect } from "../engine/kit.ts";
import { easeInOut, linear } from "../engine/loop.ts";
import type { Motif } from "../engine/sound.ts";
import type { CreateScene, Project } from "../engine/types.ts";

const STEEL = "#c9ced1";
const STEEL_DARK = "#8f979b";
const GLASS = "#7fa7b5";
const YELLOW = "#f2c230";
const INK = "#1c2326";
const LABEL = "#eef0ea";
const SCREEN = "#10140f";
const PHOSPHOR = "#9be36b";
const UNLIT = "#1f2a19";
const LIT = "#fff3c4"; // a chosen canister's cap
const VIEW = new Vector3(0.45, 0.38, 1).normalize(); // a side three-quarter view

// World units. The glovebox ("lab") has its origin at the middle of its base.
const LAB = { w: 3.6, h: 2.2, d: 1.6, floor: 0.25 };
const TOP = LAB.floor + LAB.h;
const FRONT = LAB.d / 2;
const PORT_Y = 1.15;
// Three ports in a row, gloves in two, the third capped: no pair of eyes in the front.
const PORTS = [-1, 0];
const SPARE = 1;
const GAUGE = { x: -0.5, y: 1.35 }; // low enough to be seen under the front frame's top rail
const CHAMBER = { x: LAB.w / 2 + 0.5, y: 1, r: 0.42, len: 1 }; // the airlock, along x
const OUTER = CHAMBER.x + CHAMBER.len / 2 + 0.03;
const INNER = LAB.w / 2 - 0.06;
const STAGE = new Vector3(GAUGE.x, LAB.floor + 0.06 + 0.21, -0.25); // under the gauge
const RACK_D = 0.6;
const PITCH = 0.42;
const ROW = 0.68;
const CAN = { r: 0.14, h: 0.44 }; // body and cap together; origin at the middle
const NEEDLE = { rest: 0.5, purged: 1.9, accepted: -1.15 }; // radians from straight up

const DOOR: Motif = [
  { noise: 400, dur: 0.06, vol: 0.18 },
  { hz: 70, dur: 0.12, vol: 0.08 },
];
const HISS: Motif = [{ noise: 6000, sweep: 800, dur: 0.32, vol: 0.12 }];
const SQUEAK: Motif = [{ hz: 880, to: 1100, dur: 0.08, vol: 0.04, lfo: 25 }];
const TICK: Motif = [{ hz: 2400, dur: 0.01, vol: 0.05 }];
const CHIME: Motif = [
  { wave: "triangle", hz: 659, dur: 0.07, vol: 0.12 },
  { wave: "triangle", hz: 831, at: 0.08, dur: 0.07, vol: 0.12 },
  { wave: "triangle", hz: 988, at: 0.16, dur: 0.1, vol: 0.12 },
];
const SLIDE: Motif = [{ noise: 1500, sweep: 600, dur: 0.2, vol: 0.08 }];

// The label atlas: 1024 px. Canister labels are 128 px cells in the top half (32 of them); below
// them sit the shelf-name strips and the gauge dial.
const ATLAS = 1024;
const CANS_MAX = 32;
const cell = (i: number): Rect => [(i % 8) * 128, Math.floor(i / 8) * 128, 128, 128];
const shelfStrip = (row: number): Rect => [0, 512 + row * 32, 256, 32];
const DIAL: Rect = [512, 512, 256, 256];
const face = (w: number, h: number, rect: Rect) => atlasPlane(w, h, rect, ATLAS);

const shelfName = (group: string) => group.toUpperCase().replace("-", " ");

// A rounded mitten, turned on a lathe: wrist at y = 0, fingertips at y = 0.3.
const MITTEN = [
  [0.05, 0],
  [0.09, 0.03],
  [0.11, 0.12],
  [0.1, 0.22],
  [0.07, 0.28],
  [0, 0.31],
].map(([x, y]) => new Vector2(x, y));

export const create: CreateScene = (stage) => {
  const world = new World();
  world.background = new Color("#171816");
  const camera = new PerspectiveCamera(35, 1, 1, 100);
  world.add(new HemisphereLight("#f4f8fa", "#2b2d2a", 1.5));
  const sun = new DirectionalLight("#ffffff", 2.2);
  sun.position.set(-4, 9, 7);
  world.add(sun);

  const { toon, bands } = toonMaker();
  const steel = toon(STEEL);
  const steelDark = toon(STEEL_DARK);
  const yellow = toon(YELLOW);
  const rubber = toon(INK);

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasCanvas.height = ATLAS;
  const a = atlasCanvas.getContext("2d") as CanvasRenderingContext2D;
  const atlas = new CanvasTexture(atlasCanvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  const labelled = new MeshBasicMaterial({ map: atlas, alphaTest: 0.5 });

  // The status panel: 2 lines of 15 characters, as on the other scenes' displays.
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

  const bench = new Mesh(new BoxGeometry(40, 0.5, 16), toon("#2b2d2a"));
  bench.position.y = -0.25;
  world.add(bench);

  // The glovebox: steel floor, back and sides, a steel frame round a glass front with two glove
  // ports, and a glass top.
  const lab = new Group();
  world.add(lab);
  const wallH = LAB.h;
  const wallY = LAB.floor + wallH / 2;
  const sideWithHole = new Shape()
    .moveTo(-FRONT, LAB.floor)
    .lineTo(FRONT, LAB.floor)
    .lineTo(FRONT, TOP)
    .lineTo(-FRONT, TOP)
    .closePath();
  sideWithHole.holes.push(new Path().absarc(0, CHAMBER.y, CHAMBER.r, 0, Math.PI * 2, false));
  const rightWall = new Mesh(
    new ShapeGeometry(sideWithHole, 24).rotateY(Math.PI / 2).translate(LAB.w / 2, 0, 0),
    toon(STEEL),
  );
  (rightWall.material as MeshToonMaterial).side = DoubleSide;
  const shell = new Mesh(
    mergeGeometries([
      new BoxGeometry(LAB.w, LAB.floor, LAB.d).translate(0, LAB.floor / 2, 0),
      new BoxGeometry(LAB.w, wallH, 0.06).translate(0, wallY, -FRONT + 0.03),
      new BoxGeometry(0.06, wallH, LAB.d).translate(-LAB.w / 2 + 0.03, wallY, 0),
    ]),
    steel,
  );
  const frame = new Mesh(
    mergeGeometries([
      new BoxGeometry(LAB.w, 0.12, 0.06).translate(0, LAB.floor + 0.06, FRONT),
      new BoxGeometry(LAB.w, 0.12, 0.06).translate(0, TOP - 0.06, FRONT),
      new BoxGeometry(0.12, wallH, 0.06).translate(-LAB.w / 2 + 0.06, wallY, FRONT),
      new BoxGeometry(0.12, wallH, 0.06).translate(LAB.w / 2 - 0.06, wallY, FRONT),
    ]),
    steelDark,
  );
  // Glass: the box's edges and two glints on the front pane.
  const glints = new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        [-1.45, 2.15, -0.95, 1.65],
        [-1.25, 2.25, -1.05, 2.05],
      ].flatMap(([x1, y1, x2, y2]) => [x1, y1, FRONT + 0.002, x2, y2, FRONT + 0.002]),
      3,
    ),
  );
  const glass = new LineSegments(
    mergeGeometries([new EdgesGeometry(new BoxGeometry(LAB.w, wallH, LAB.d).translate(0, wallY, 0)), glints]),
    new LineBasicMaterial({ color: GLASS }),
  );
  const ports = new Mesh(
    mergeGeometries([
      ...[...PORTS, SPARE].map((x) => new TorusGeometry(0.2, 0.045, 10, 28).translate(x, PORT_Y, FRONT)),
      new CylinderGeometry(0.2, 0.2, 0.04, 28).rotateX(Math.PI / 2).translate(SPARE, PORT_Y, FRONT),
    ]),
    steelDark,
  );

  // The gauge and the status panel on the back wall, and the stage under the gauge.
  const back = -FRONT + 0.07;
  const dial = new Mesh(face(0.72, 0.72, DIAL), labelled);
  dial.position.set(GAUGE.x, GAUGE.y, back);
  const rim = new Mesh(new TorusGeometry(0.34, 0.035, 8, 40), yellow);
  rim.position.copy(dial.position);
  const needle = new Object3D();
  needle.position.set(GAUGE.x, GAUGE.y, back + 0.02);
  needle.rotation.z = NEEDLE.rest;
  needle.add(new Mesh(new BoxGeometry(0.025, 0.27, 0.01).translate(0, 0.12, 0), rubber));
  const panel = new Mesh(new PlaneGeometry(1.1, 0.275), new MeshBasicMaterial({ map: screen }));
  panel.position.set(GAUGE.x + 1.05, GAUGE.y, back);
  const stageDisc = new Mesh(new CylinderGeometry(0.24, 0.26, 0.06, 28), steelDark);
  stageDisc.position.set(STAGE.x, LAB.floor + 0.03, STAGE.z);

  // The airlock: an open steel cylinder on the right wall with a yellow band, a leg and two doors.
  const chamber = new Mesh(
    new CylinderGeometry(CHAMBER.r, CHAMBER.r, CHAMBER.len, 32, 1, true).rotateZ(Math.PI / 2),
    toon(STEEL),
  );
  (chamber.material as MeshToonMaterial).side = DoubleSide;
  chamber.position.set(CHAMBER.x, CHAMBER.y, 0);
  const chamberTrim = new Mesh(
    new CylinderGeometry(CHAMBER.r + 0.02, CHAMBER.r + 0.02, 0.14, 32, 1, true).rotateZ(Math.PI / 2),
    yellow,
  );
  (chamberTrim.material as MeshToonMaterial).side = DoubleSide;
  chamberTrim.position.copy(chamber.position);
  // A round door hinged on its front (side = 1) or back (side = -1) edge.
  const door = (x: number, side: number, open: number) => {
    const hinge = new Object3D();
    hinge.position.set(x, CHAMBER.y, side * (CHAMBER.r + 0.02));
    const disc = new Mesh(new CylinderGeometry(CHAMBER.r + 0.03, CHAMBER.r + 0.03, 0.05, 32).rotateZ(Math.PI / 2), steelDark);
    disc.position.z = -side * (CHAMBER.r + 0.02);
    hinge.add(disc);
    hinge.userData.open = open;
    return hinge;
  };
  const outer = door(OUTER, 1, -1.8); // swings out, towards the viewer
  const wheel = new Mesh(new TorusGeometry(0.15, 0.03, 8, 24).rotateY(Math.PI / 2), yellow);
  wheel.position.set(0.04, 0, -(CHAMBER.r + 0.02));
  outer.add(wheel);
  const inner = door(INNER, -1, -1.7); // swings into the box, along the back wall
  lab.add(shell, rightWall, frame, glass, ports, dial, rim, needle, panel, stageDisc, chamber, chamberTrim, outer, inner);

  // The gloves: mittens on rubber arms rebuilt along a curve from each port whenever they move.
  const rest = PORTS.map((x) => new Vector3(x * 0.9, 0.75, 0.15));
  const hands = PORTS.map((_, i) => {
    const hand = new Mesh(new LatheGeometry(MITTEN, 14), rubber);
    hand.position.copy(rest[i]);
    lab.add(hand);
    return hand;
  });
  const arms = PORTS.map(() => {
    const arm = new Mesh(new TubeGeometry(), rubber);
    arm.raycast = () => {};
    lab.add(arm);
    return arm;
  });
  const drawArms = () => {
    PORTS.forEach((x, i) => {
      const port = new Vector3(x, PORT_Y, FRONT);
      const wrist = hands[i].position.clone();
      const inside = new Vector3(x, PORT_Y - 0.05, FRONT - 0.3);
      const elbow = inside.clone().lerp(wrist, 0.5);
      elbow.y -= 0.15;
      const curve = new CatmullRomCurve3([port, inside, elbow, wrist]);
      arms[i].geometry.dispose();
      arms[i].geometry = stage.lowPower ? new TubeGeometry(curve, 12, 0.075, 6) : new TubeGeometry(curve, 32, 0.075, 12);
    });
  };
  // Mittens point down at rest and turn towards a canister they hold.
  const aim = (i: number, at: Vector3 | null) => {
    if (at) hands[i].lookAt(lab.localToWorld(at.clone()));
    else hands[i].rotation.set(Math.PI, 0, 0);
    hands[i].rotateX(at ? Math.PI / 2 : 0);
  };
  hands.forEach((_, i) => aim(i, null));
  drawArms();

  // The shelf rack, built with the projects.
  const rack = new Group();
  world.add(rack);
  const lit = new Mesh(new CylinderGeometry(CAN.r + 0.015, CAN.r + 0.015, 0.09, 20), new MeshBasicMaterial({ color: LIT }));
  lit.position.y = CAN.h / 2 - 0.04;
  lit.raycast = () => {};
  lit.visible = false;
  rack.add(lit);

  const cans = new Map<string, Group>();
  const homes = new Map<string, Vector3>();
  const slide = new Map<string, number>(); // how far each canister is pulled forward, 0..1
  const byId = new Map<string, Project>();
  const accepted = new Set<string>();
  let rackW = 0;
  let rackH = 0;
  let focused: string | null = null;
  let playing: string | null = null;
  let moving: Group | null = null;

  const first = (p: Project) => p.label ?? wrap(p.title, 15)[0];
  const idle = () => display("READY", accepted.size ? `ACCEPTED ${accepted.size}/${byId.size}` : `${byId.size} SAMPLES`);
  const describe = (p: Project) => display(first(p), p.ref ?? shelfName(p.group));

  const place = (id: string) => {
    const can = cans.get(id) as Group;
    if (can.parent !== rack || can === moving) return;
    can.position.z = (homes.get(id) as Vector3).z + 0.16 * (slide.get(id) ?? 0);
  };
  const pull = (id: string, to: number) => {
    const from = slide.get(id) ?? 0;
    if (from === to) return;
    void stage.tween(140, (t) => {
      slide.set(id, from + (to - from) * t);
      place(id);
    });
  };
  const showLit = () => {
    lit.visible = focused !== null && focused !== playing;
  };

  // Paths in world space, rebuilt every frame so a resize mid-flight keeps them right.
  const doorFront = () => lab.localToWorld(new Vector3(OUTER + 0.55, CHAMBER.y, 0.25));
  const fly = (can: Group, ms: number, points: () => Vector3[]) =>
    stage.tween(
      ms,
      (t) => {
        can.position.copy(new CatmullRomCurve3(points()).getPointAt(t));
      },
      easeInOut,
    );
  const swing = (hinge: Object3D, open: boolean, ms: number) => {
    const from = hinge.rotation.y;
    const to = open ? (hinge.userData.open as number) : 0;
    return stage.tween(ms, (t) => {
      hinge.rotation.y = from + (to - from) * t;
    });
  };
  const sweep = (to: number, ms: number) => {
    const from = needle.rotation.z;
    return stage.tween(ms, (t) => {
      needle.rotation.z = from + (to - from) * t;
    });
  };
  // The mittens hold a canister from its front corners, fingertips just touching it.
  const GRIP = [new Vector3(-0.3, 0, 0.3), new Vector3(0.3, 0, 0.3)];
  // The gloves move a canister along a lab-space curve.
  const carry = (can: Group, ms: number, points: Vector3[]) => {
    const curve = new CatmullRomCurve3(points);
    return stage.tween(
      ms,
      (t) => {
        can.position.copy(curve.getPointAt(t));
        hands.forEach((hand, i) => {
          hand.position.copy(can.position).add(GRIP[i]);
          aim(i, can.position);
        });
        drawArms();
      },
      easeInOut,
    );
  };
  const reach = (to: Vector3 | null, ms: number) => {
    const from = hands.map((h) => h.position.clone());
    const goal = hands.map((_, i) => (to ? to.clone().add(GRIP[i]) : rest[i]));
    return stage.tween(ms, (t) => {
      hands.forEach((hand, i) => {
        hand.position.lerpVectors(from[i], goal[i], t);
        aim(i, to);
      });
      drawArms();
    });
  };
  const IN_CHAMBER = new Vector3(CHAMBER.x, CHAMBER.y, 0);
  const AT_INNER = new Vector3(LAB.w / 2 - 0.7, CHAMBER.y, 0); // slid in on the airlock's tray
  const CARRY = [AT_INNER, new Vector3(0.6, 1.1, 0.1), new Vector3(0, 0.85, 0), STAGE];

  return {
    world,
    camera,

    build(projects) {
      if (projects.length > CANS_MAX) throw new Error(`the label atlas holds ${CANS_MAX} canisters`);
      const groups = [...new Set(projects.map((p) => p.group))];
      const rows = groups.map((g) => projects.filter((p) => p.group === g));
      const cols = Math.max(...rows.map((r) => r.length));
      rackW = cols * PITCH + 0.24;
      rackH = 0.2 + (groups.length - 1) * ROW + CAN.h + 0.25;
      const shelfTop = (row: number) => 0.2 + (groups.length - 1 - row) * ROW;

      rack.add(
        new Mesh(
          mergeGeometries([
            new BoxGeometry(rackW + 0.12, rackH, 0.06).translate(0, rackH / 2, 0.03 - RACK_D / 2),
            new BoxGeometry(0.06, rackH, RACK_D).translate(-rackW / 2 - 0.03, rackH / 2, 0),
            new BoxGeometry(0.06, rackH, RACK_D).translate(rackW / 2 + 0.03, rackH / 2, 0),
            new BoxGeometry(rackW + 0.12, 0.06, RACK_D).translate(0, rackH - 0.03, 0),
            ...groups.map((_, row) => new BoxGeometry(rackW, 0.2, RACK_D).translate(0, shelfTop(row) - 0.1, 0)),
          ]),
          steelDark,
        ),
        new Mesh(
          mergeGeometries(
            groups.map((g, row) => {
              const [x, y] = shelfStrip(row);
              drawText(a, shelfName(g), x + 6, y + 5, 3, INK);
              return face(1.2, 0.15, shelfStrip(row)).translate(-rackW / 2 + 0.68, shelfTop(row) - 0.1, RACK_D / 2 + 0.003);
            }),
          ),
          labelled,
        ),
      );

      const body = new CylinderGeometry(CAN.r, CAN.r, 0.36, 20).translate(0, -0.03, 0);
      const capGeometry = new CylinderGeometry(CAN.r + 0.01, CAN.r + 0.01, 0.08, 20).translate(0, CAN.h / 2 - 0.04, 0);
      const caps = new Map(groups.map((g) => [g, toon(GROUP_COLOURS[g] ?? YELLOW)]));
      projects.forEach((p, n) => {
        byId.set(p.id, p);
        const row = groups.indexOf(p.group);
        const col = rows[row].indexOf(p);
        const can = new Group();
        can.userData.id = p.id;
        const label = new Mesh(face(0.22, 0.22, cell(n)), labelled);
        label.position.set(0, -0.03, CAN.r + 0.003);
        can.add(new Mesh(body, steel), new Mesh(capGeometry, caps.get(p.group) as MeshToonMaterial), label);
        const home = new Vector3(-rackW / 2 + 0.12 + PITCH / 2 + col * PITCH, shelfTop(row) + CAN.h / 2, 0.02);
        can.position.copy(home);
        homes.set(p.id, home);
        cans.set(p.id, can);
        rack.add(can);

        // The label: a band in the group colour, the title, where its numbers are quoted from,
        // and the canister's own mark.
        const [x, y] = cell(n);
        a.fillStyle = LABEL;
        a.fillRect(x + 2, y + 2, 124, 124);
        a.fillStyle = GROUP_COLOURS[p.group] ?? YELLOW;
        a.fillRect(x + 2, y + 2, 124, 10);
        const lines = wrap(p.title, 9);
        if (lines.length > 5) lines.splice(4, Infinity, `${lines[4].slice(0, 7)}..`);
        lines.forEach((line, i) => drawText(a, line, x + 8, y + 18 + i * 16, 2, INK));
        drawText(a, (p.ref ?? shelfName(p.group)).slice(0, 9), x + 8, y + 104, 2, INK);
        mark(a, p.id, x + 106, y + 18, 3, INK);
      });

      // The gauge dial: ticks, a green band where a reading is accepted, and the purge range.
      const [dx, dy] = DIAL;
      const cx = dx + 128;
      const cy = dy + 128;
      a.fillStyle = "#e9eceb";
      a.beginPath();
      a.arc(cx, cy, 120, 0, Math.PI * 2);
      a.fill();
      const canvasAngle = (theta: number) => -Math.PI / 2 - theta;
      const band = (from: number, to: number, colour: string) => {
        a.strokeStyle = colour;
        a.lineWidth = 16;
        a.beginPath();
        a.arc(cx, cy, 92, canvasAngle(from), canvasAngle(to));
        a.stroke();
      };
      band(-0.75, -1.6, "#4cc38a");
      band(2.3, 1.55, "#7fa7b5");
      a.fillStyle = INK;
      for (let theta = -2.3; theta <= 2.31; theta += 0.23) {
        a.save();
        a.translate(cx, cy);
        a.rotate(-theta);
        a.fillRect(-2, -116, 4, 14);
        a.restore();
      }
      drawText(a, "OK", cx + 48, cy + 34, 3, INK);
      atlas.needsUpdate = true;
      idle();
    },

    layout(aspect) {
      if (aspect >= 1.25) {
        rack.position.set(-(rackW / 2 + 0.3), 0, 0);
        lab.position.set(LAB.w / 2 + 0.3, 0, 0);
      } else {
        // The glovebox sits on the shelf unit, its front flush with the shelves.
        rack.position.set(0, 0, 0);
        lab.position.set(0.6, rackH, (RACK_D - LAB.d) / 2); // off centre, so the pair reads as furniture
      }
      world.updateMatrixWorld();
      const apex = new Box3().setFromCenterAndSize(doorFront().add(new Vector3(0, 0.5, 0.3)), new Vector3(0.4, 0.5, 0.4));
      fit(camera, [drawnBox(rack), drawnBox(lab), apex], aspect, VIEW);
      stage.invalidate();
    },

    focus(id) {
      if (id === focused) return;
      if (focused) pull(focused, 0);
      focused = id;
      const can = id ? cans.get(id) : undefined;
      if (id && can && id !== playing) {
        can.add(lit);
        pull(id, 1);
      }
      showLit();
      if (!playing) {
        const p = id ? byId.get(id) : undefined;
        if (p) describe(p);
        else idle();
      }
      stage.invalidate();
    },

    async insert(id) {
      const can = cans.get(id);
      const p = byId.get(id);
      if (!can || !p) return;
      playing = id;
      showLit();
      // Into the airlock.
      display(first(p), "AIRLOCK");
      stage.play(DOOR);
      const start = can.getWorldPosition(new Vector3());
      world.attach(can);
      moving = can;
      await Promise.all([
        swing(outer, true, 90),
        fly(can, 420, () => [
          start,
          start.clone().add(new Vector3(0, 0.12, 0.5)),
          doorFront().add(new Vector3(0, 0.5, 0.3)),
          doorFront(),
          lab.localToWorld(IN_CHAMBER.clone()),
        ]),
      ]);
      lab.attach(can);
      can.position.copy(IN_CHAMBER);
      stage.play(DOOR);
      await swing(outer, false, 100);
      // Purge: the needle drops while the chamber hisses.
      display("PURGING", p.ref ?? "");
      stage.play(HISS);
      await sweep(NEEDLE.purged, 300);
      // Through the inner door, and the gloves set it under the gauge.
      stage.play(SLIDE);
      await Promise.all([
        swing(inner, true, 110),
        stage.tween(
          160,
          (t) => {
            can.position.lerpVectors(IN_CHAMBER, AT_INNER, t);
          },
          linear,
        ),
      ]);
      stage.play(SQUEAK);
      await reach(AT_INNER, 140);
      await carry(can, 380, CARRY);
      // The reading is accepted.
      stage.play(TICK);
      void reach(null, 160);
      void swing(inner, false, 120);
      await sweep(NEEDLE.accepted, 160);
      moving = null;
      accepted.add(id);
      stage.play(CHIME);
      display(first(p), `READING OK`);
    },

    async eject() {
      const id = playing;
      const can = id ? cans.get(id) : undefined;
      if (!id || !can) return;
      // The same way back, shortened: gloves to the airlock, doors, then home to the shelf.
      display(first(byId.get(id) as Project), "RETURNING");
      void sweep(NEEDLE.rest, 200);
      stage.play(SQUEAK);
      moving = can;
      await Promise.all([swing(inner, true, 90), reach(can.position, 100)]);
      await carry(can, 300, [...CARRY].reverse());
      void reach(null, 140);
      stage.play(DOOR);
      await stage.tween(
        90,
        (t) => {
          can.position.lerpVectors(AT_INNER, IN_CHAMBER, t);
        },
        linear,
      );
      void swing(inner, false, 90);
      await swing(outer, true, 90);
      const start = can.getWorldPosition(new Vector3());
      world.attach(can);
      const home = () => rack.localToWorld((homes.get(id) as Vector3).clone());
      stage.play(SLIDE);
      await fly(can, 360, () => [
        start,
        doorFront(),
        doorFront().add(new Vector3(0, 0.5, 0.3)),
        home().add(new Vector3(0, 0.12, 0.5)),
        home(),
      ]);
      rack.attach(can);
      can.position.copy(homes.get(id) as Vector3);
      can.rotation.set(0, 0, 0);
      slide.set(id, 0);
      moving = null;
      playing = null;
      stage.play(DOOR);
      await swing(outer, false, 90);
      if (focused === id) {
        can.add(lit);
        pull(id, 1);
      }
      showLit();
      const p = focused ? byId.get(focused) : undefined;
      if (p) describe(p);
      else idle();
    },

    dispose() {
      disposeAll(world, [atlas, screen, bands]);
    },
  };
};
