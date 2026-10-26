// Lab, the default scene: a chemistry lab drawn like an 80s pixel-art game. Each project is a
// sample flask on the shelves, one shelf per group. Choosing one takes it to the bench under a
// burette: three drops, the liquid turns at the endpoint, and the CRT terminal prints the assay.
// A titration ends at a measured endpoint, the way the projects' numbers come from runs that can
// be replayed. The scene renders 320 pixels across and is scaled up without smoothing; the HUD
// shows only real data, in the site's 5x7 dot-matrix font. Procedural geometry and canvas
// textures only.

import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene as World,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ADVANCE, drawText } from "../engine/font.ts";
import { disposeAll, drawnBox, fit, GROUP_COLOURS, slides, toonMaker } from "../engine/kit.ts";
import { easeInOut, linear } from "../engine/loop.ts";
import type { Motif } from "../engine/sound.ts";
import type { CreateScene, Project } from "../engine/types.ts";

const PIXELS = 320; // render width; everything is drawn on this grid
// A small palette: CRT green, amber, wood, and a little neon.
const GREEN = "#39ff6a";
const GREEN_DIM = "#145c2a";
const AMBER = "#ffb000";
const NEON = "#ff4fd8";
const NEON_CYAN = "#3ee8ff";
const WOOD = "#8a5a33";
const WORKTOP = "#3a2b20";
const WALL = "#1d2433";
const GLASS = "#b9e4ef";
const HOUSING = "#cbb994";
const SCREEN = "#06100a";
// The profile banner's accent (scripts/portfolio.py in NecmiKural/NecmiKural): the flagship
// samples take the one for the visitor's colour scheme. The room is dark in both, so lettering and
// the cursor take the lighter one, which reads on it.
const ACCENTS = { light: "#c2410c", dark: "#fb923c" };
const BAR = 21; // HUD bar height, top and bottom, in pixels
// The assay's last state: the titration ran to its endpoint. No pass or fail is claimed.
const DONE = "ASSAY: DONE";
const VIEW = new Vector3(0.12, 0.3, 1).normalize(); // almost straight on, a little from above

// World units. The back wall is at z = -2; the bench runs along it.
const BENCH = { w: 9, h: 0.9, d: 1.2, z: -1.3 };
const TOP = BENCH.h + 0.08; // the worktop surface
const SHELF = { x: -2.4, z: -1.78, pitch: 0.55, row: 0.72, low: 1.75 };
const FLASK_H = 0.36;
const STAND = new Vector3(0.45, TOP, -1.2); // where a sample is assayed, under the burette
const TIP_Y = TOP + FLASK_H + 0.24;
const CRT = { x: 1.95, z: -1.35 };

const LIFT: Motif = [{ hz: 330, to: 660, dur: 0.06, vol: 0.08 }];
const DRIP: Motif = [{ wave: "triangle", hz: 1320, to: 990, dur: 0.04, vol: 0.1 }];
const ENDPOINT: Motif = [
  { hz: 587, dur: 0.06, vol: 0.08 },
  { hz: 740, at: 0.08, dur: 0.06, vol: 0.08 },
  { hz: 659, at: 0.16, dur: 0.06, vol: 0.08 },
  { hz: 880, at: 0.24, dur: 0.1, vol: 0.08 },
];
const TYPING: Motif = [0, 0.04, 0.08, 0.12, 0.16, 0.2].map((at) => ({ noise: 4000, at, dur: 0.01, vol: 0.05 }));
const PUT_BACK: Motif = [{ hz: 660, to: 330, dur: 0.08, vol: 0.08 }];

// An Erlenmeyer flask, turned on a lathe: liquid in the bottom, pale glass above it.
const LIQUID = [
  [0, 0],
  [0.16, 0],
  [0.165, 0.02],
  [0.12, 0.13],
  [0, 0.13],
].map(([x, y]) => new Vector2(x, y));
const FLASK = [
  [0.12, 0.13],
  [0.06, 0.25],
  [0.05, 0.27],
  [0.05, 0.34],
  [0.065, FLASK_H],
  [0, FLASK_H],
].map(([x, y]) => new Vector2(x, y));

// A canvas texture drawn on the pixel grid: no smoothing, no mipmaps.
function pixelCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return { canvas, g, texture };
}

export const create: CreateScene = (stage) => {
  const world = new World();
  world.background = new Color(WALL);
  const camera = new PerspectiveCamera(25, 1, 1, 100);
  world.add(camera); // so the HUD, a child of the camera, is drawn
  world.add(new HemisphereLight("#cfe8ff", "#2a1d14", 1.4));
  const sun = new DirectionalLight("#fff2dc", 2.4);
  sun.position.set(-3, 7, 6);
  world.add(sun);

  const { toon, bands } = toonMaker();
  const flat = (colour: string) => new MeshBasicMaterial({ color: colour });
  const accent = matchMedia("(prefers-color-scheme: dark)").matches ? ACCENTS.dark : ACCENTS.light;
  const lettering = ACCENTS.dark;
  const groupColour = (group: string) => (group === "flagship" ? accent : (GROUP_COLOURS[group] ?? AMBER));
  const textures: { dispose(): void }[] = [bands];

  // The room: tiled floor, back wall with a dot-matrix sign, a long bench with a dark worktop.
  const floorTiles = pixelCanvas(2, 2);
  floorTiles.g.fillStyle = "#232733";
  floorTiles.g.fillRect(0, 0, 2, 2);
  floorTiles.g.fillStyle = "#2c3140";
  floorTiles.g.fillRect(0, 0, 1, 1);
  floorTiles.g.fillRect(1, 1, 1, 1);
  floorTiles.texture.wrapS = floorTiles.texture.wrapT = RepeatWrapping;
  floorTiles.texture.repeat.set(16, 8);
  textures.push(floorTiles.texture);
  const floor = new Mesh(new PlaneGeometry(16, 8).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: floorTiles.texture }));
  floor.position.z = 1.5;
  const wall = new Mesh(new PlaneGeometry(16, 7), flat(WALL));
  wall.position.set(0, 3.5, -2);
  world.add(floor, wall);

  // The sign, lettered like the banner: its 5 x 7 dots, lit over faint unlit ones. One texel a dot:
  // gaps between dots would be finer than the 320-pixel grid and break up.
  const sign = pixelCanvas(19, 9);
  drawText(sign.g, "LAB", 1, 1, 1, lettering, `${lettering}30`);
  textures.push(sign.texture);
  const plate = new Mesh(new PlaneGeometry(2.1, 1), new MeshBasicMaterial({ map: sign.texture, transparent: true }));
  plate.position.set(0.55, 4.25, -1.98);
  world.add(plate);

  const room = new Group(); // what the camera frames, apart from the fume hood
  world.add(room);
  room.add(
    new Mesh(new BoxGeometry(BENCH.w, BENCH.h, BENCH.d).translate(0, BENCH.h / 2, BENCH.z), toon(WOOD)),
    new Mesh(new BoxGeometry(BENCH.w + 0.1, 0.08, BENCH.d + 0.05).translate(0, BENCH.h + 0.04, BENCH.z), toon(WORKTOP)),
  );

  // The burette on its stand, with a white tile where the sample stands.
  const glass = flat(GLASS);
  const steel = toon("#9aa3ad");
  room.add(
    new Mesh(
      mergeGeometries([
        new BoxGeometry(0.7, 0.05, 0.45).translate(STAND.x + 0.15, TOP + 0.025, STAND.z),
        new CylinderGeometry(0.025, 0.025, 1.9, 8).translate(STAND.x + 0.42, TOP + 0.95, STAND.z - 0.12),
        new BoxGeometry(0.42, 0.05, 0.05).translate(STAND.x + 0.21, TIP_Y + 0.75, STAND.z - 0.06),
      ]),
      steel,
    ),
    new Mesh(new BoxGeometry(0.4, 0.012, 0.4).translate(STAND.x, TOP + 0.056, STAND.z), flat("#e9eef2")),
    new Mesh(new CylinderGeometry(0.045, 0.045, 1, 12).translate(STAND.x, TIP_Y + 0.62, STAND.z), glass),
    new Mesh(new CylinderGeometry(0.035, 0.035, 0.55, 12).translate(STAND.x, TIP_Y + 0.84, STAND.z + 0.012), flat(NEON_CYAN)),
    new Mesh(new CylinderGeometry(0.012, 0.035, 0.1, 8).translate(STAND.x, TIP_Y + 0.07, STAND.z), glass),
  );
  const drop = new Mesh(new SphereGeometry(0.03, 6, 4), flat(NEON_CYAN));
  drop.visible = false;
  room.add(drop);

  // The CRT terminal: a beige housing, a green screen and a keyboard. Its screen is drawn at
  // about the size it covers on the pixel grid, 6 characters by 3 lines, and shows text only.
  const crt = pixelCanvas(36, 24);
  textures.push(crt.texture);
  let shown = "";
  let screenLines: string[] = [];
  let screenChars = Infinity;
  let small = false; // the screen covers fewer pixels than its text needs: bars stand for the lines
  const terminal = (lines: string[], chars = Infinity) => {
    screenLines = lines;
    screenChars = chars;
    const key = `${lines.join("\n")}|${chars}|${small}`;
    if (key === shown) return;
    shown = key;
    crt.g.fillStyle = SCREEN;
    crt.g.fillRect(0, 0, 36, 24);
    let left = chars;
    lines.slice(0, 3).forEach((line, i) => {
      const part = line.slice(0, Math.max(0, Math.min(6, left)));
      left -= Math.min(6, line.length);
      const colour = i === 0 ? AMBER : GREEN;
      if (!small) drawText(crt.g, part, 0, i * 8, 1, colour);
      else if (part) {
        crt.g.fillStyle = colour;
        crt.g.fillRect(0, i * 8 + 1, part.length * ADVANCE - 1, 5);
      }
    });
    crt.texture.needsUpdate = true;
    stage.invalidate();
  };
  room.add(
    new Mesh(new BoxGeometry(1.75, 0.98, 0.8).translate(CRT.x, TOP + 0.52, CRT.z), toon(HOUSING)), // wide, no chin
    new Mesh(new BoxGeometry(1.2, 0.06, 0.32).translate(CRT.x, TOP + 0.03, CRT.z + 0.7), toon("#a8996f")),
  );
  const screen = new Mesh(new PlaneGeometry(1.2, 0.8), new MeshBasicMaterial({ map: crt.texture }));
  screen.position.set(CRT.x, TOP + 0.52, CRT.z + 0.402);
  room.add(screen);

  // The fume hood on the right: a steel cabinet, its glass sash drawn as edges, a neon strip light.
  const hood = new Group();
  world.add(hood);
  hood.add(
    new Mesh(
      mergeGeometries([
        new BoxGeometry(2, 0.12, 1.3).translate(0, 2.6, 0),
        new BoxGeometry(0.1, 2.6, 1.3).translate(-0.95, 1.3, 0),
        new BoxGeometry(0.1, 2.6, 1.3).translate(0.95, 1.3, 0),
        new BoxGeometry(2, 2.6, 0.08).translate(0, 1.3, -0.62),
        new BoxGeometry(2, TOP, 1.3).translate(0, TOP / 2, 0),
      ]),
      toon("#7b8794"),
    ),
    new LineSegments(new EdgesGeometry(new BoxGeometry(1.8, 1, 0.02).translate(0, 2.0, 0.6)), new LineBasicMaterial({ color: GLASS })),
    new Mesh(new BoxGeometry(1.6, 0.05, 0.05).translate(0, 2.48, 0.3), flat(NEON)),
    // Three vessels of different heights, so no pair reads as a pair of eyes in the sash's frame.
    new Mesh(new CylinderGeometry(0.13, 0.12, 0.3, 10).translate(-0.4, TOP + 0.15, -0.1), glass),
    new Mesh(new CylinderGeometry(0.1, 0.09, 0.22, 10).translate(0.3, TOP + 0.11, 0.1), glass),
    new Mesh(new CylinderGeometry(0.05, 0.07, 0.62, 8).translate(0.62, TOP + 0.31, -0.3), glass), // a measuring cylinder
  );
  hood.position.set(4.1, 0, -1.3);

  // The pixel HUD, on a plane in front of the camera, drawn at one texel per screen pixel.
  let hud = pixelCanvas(PIXELS, 200);
  const hudMaterial = new MeshBasicMaterial({ map: hud.texture, transparent: true, depthTest: false, depthWrite: false });
  const hudPlane = new Mesh(new PlaneGeometry(1, 1), hudMaterial);
  hudPlane.renderOrder = 10;
  hudPlane.raycast = () => {};
  camera.add(hudPlane);

  // The pixel cursor over the chosen flask.
  const arrow = pixelCanvas(7, 5);
  arrow.g.fillStyle = lettering;
  [7, 5, 3, 1].forEach((w, row) => arrow.g.fillRect((7 - w) / 2, row, w, 1));
  textures.push(arrow.texture);
  const cursor = new Mesh(new PlaneGeometry(0.14, 0.1), new MeshBasicMaterial({ map: arrow.texture, transparent: true }));
  cursor.position.y = FLASK_H + 0.14;
  cursor.raycast = () => {};
  cursor.visible = false;
  room.add(cursor);

  const flasks = new Map<string, Group>();
  const liquids = new Map<string, MeshToonMaterial>();
  const homes = new Map<string, Vector3>();
  const byId = new Map<string, Project>();
  let total = 0;
  let flagships = 0;
  let aspect = 1;
  let focused: string | null = null;
  let playing: string | null = null;
  let status = "";
  let moving: Group | null = null;

  const slide = slides(stage, (id, amount) => {
    const flask = flasks.get(id) as Group;
    if (flask.parent !== room || flask === moving || id === playing) return;
    flask.position.y = (homes.get(id) as Vector3).y + 0.06 * amount; // a small hop
  });

  // Real data only: counts from the page, the chosen project's title and where its numbers come from.
  const drawHud = () => {
    const h = hud.canvas.height;
    const g = hud.g;
    g.clearRect(0, 0, PIXELS, h);
    const box = (x: number, y: number, w: number, bh: number) => {
      g.fillStyle = "rgba(6, 10, 8, 0.82)";
      g.fillRect(x, y, w, bh);
      g.fillStyle = GREEN_DIM;
      g.fillRect(x, y, w, 1);
      g.fillRect(x, y + bh - 1, w, 1);
    };
    const lines: string[] = [];
    const line = (text: string, x: number, y: number, colour: string) => {
      drawText(g, text, x, y, 1, colour);
      lines.push(text);
    };
    const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "S"}`;
    box(0, 0, PIXELS, BAR);
    line(`INVENTORY: ${count(total, "PROJECT")}`, 4, 3, GREEN);
    line(`SAMPLES: ${count(flagships, "FLAGSHIP")}`, 4, 12, lettering); // the flagship samples' colour
    const lab = "LAB: OPEN";
    line(lab, PIXELS - 4 - lab.length * ADVANCE, 3, AMBER);
    const shownId = playing ?? focused; // the sample on the bench, else the one pointed at
    const p = shownId ? byId.get(shownId) : undefined;
    if (p) {
      box(0, h - BAR, PIXELS, BAR);
      const width = Math.floor((PIXELS - 8) / ADVANCE);
      line(p.title.toUpperCase().slice(0, width), 4, h - 18, GREEN);
      const group = p.group.toUpperCase().replace("-", " ");
      line((p.ref ? `${group}  REF ${p.ref}` : group).slice(0, 30), 4, h - 9, GREEN);
      if (status) line(status, PIXELS - 4 - status.length * ADVANCE, h - 9, status === DONE ? GREEN : AMBER);
    }
    hud.texture.needsUpdate = true;
    stage.caption(hudPlane.visible ? lines.join("\n") : "");
    stage.invalidate();
  };

  const liquidColour = (id: string) => new Color(groupColour(byId.get(id)?.group ?? ""));
  const idleTerminal = () => terminal(["READY", String(total), "FLASKS"]);

  return {
    world,
    camera,
    pixelWidth: PIXELS,

    build(projects) {
      byId.clear();
      projects.forEach((p) => byId.set(p.id, p));
      total = projects.length;
      flagships = projects.filter((p) => p.group === "flagship").length;
      const groups = [...new Set(projects.map((p) => p.group))];
      const rows = groups.map((g) => projects.filter((p) => p.group === g));
      const cols = Math.max(...rows.map((r) => r.length));
      const width = cols * SHELF.pitch + 0.3;
      const shelfY = (row: number) => SHELF.low + (groups.length - 1 - row) * SHELF.row;

      // Shelves on the wall, one per group; the HUD names the group of the chosen sample (labels this
      // small would not survive the pixel grid).
      room.add(
        new Mesh(
          mergeGeometries(groups.map((_, row) => new BoxGeometry(width, 0.06, 0.4).translate(SHELF.x, shelfY(row) - 0.03, SHELF.z))),
          toon(WOOD),
        ),
      );
      // The flasks: liquid in the group colour, a pale glass top, and a box for the pointer.
      const liquidGeometry = new LatheGeometry(LIQUID, 10);
      const flaskGeometry = new LatheGeometry(FLASK, 10);
      const target = new BoxGeometry(0.42, 0.5, 0.42).translate(0, 0.25, 0);
      const hidden = new MeshBasicMaterial();
      projects.forEach((p) => {
        const row = groups.indexOf(p.group);
        const col = rows[row].indexOf(p);
        const flask = new Group();
        flask.userData.id = p.id;
        const liquid = toon(groupColour(p.group));
        liquids.set(p.id, liquid);
        const pick = new Mesh(target, hidden);
        pick.visible = false;
        flask.add(new Mesh(liquidGeometry, liquid), new Mesh(flaskGeometry, glass), pick);
        const home = new Vector3(SHELF.x - width / 2 + 0.15 + SHELF.pitch / 2 + col * SHELF.pitch, shelfY(row), SHELF.z);
        flask.position.copy(home);
        homes.set(p.id, home);
        flasks.set(p.id, flask);
        room.add(flask);
      });
      idleTerminal();
      drawHud();
    },

    layout(next) {
      aspect = next;
      // The HUD texture matches the render target, PIXELS wide, so each dot is one screen pixel. In a
      // very short window the bars would leave no room for the scene, so there is no HUD.
      const h = Math.max(1, Math.round(PIXELS / aspect));
      hudPlane.visible = h >= 100;
      if (hud.canvas.height !== h) {
        // A new texture: an uploaded one cannot change size in place.
        hud.texture.dispose();
        hud = pixelCanvas(PIXELS, h);
        hudMaterial.map = hud.texture;
        hudMaterial.needsUpdate = true;
      }
      world.updateMatrixWorld();
      // Wide views take in the fume hood; narrow ones frame the shelves, burette and terminal. The
      // cursor is left out, so the framing does not depend on what is pointed at.
      const pointed = cursor.visible;
      cursor.visible = false;
      const boxes = [drawnBox(room), drawnBox(plate)];
      cursor.visible = pointed;
      if (aspect >= 1.25) boxes.push(drawnBox(hood));
      // Framed in the band between the HUD bars: the same width, a shorter height.
      const band = hudPlane.visible ? (h - 2 * BAR) / h : 1;
      const fov = camera.fov;
      camera.fov = (Math.atan(Math.tan((fov * Math.PI) / 360) * band) * 360) / Math.PI;
      fit(camera, boxes, aspect / band, VIEW);
      camera.fov = fov;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const distance = camera.near * 1.5;
      const height = 2 * distance * Math.tan((camera.fov * Math.PI) / 360);
      hudPlane.scale.set(height * aspect, height, 1);
      hudPlane.position.set(0, 0, -distance);
      // How many pixels the terminal's screen covers decides between text and bars.
      const edge = (x: number) => new Vector3(x, screen.position.y, screen.position.z).project(camera).x;
      small = ((edge(CRT.x + 0.6) - edge(CRT.x - 0.6)) / 2) * PIXELS < 36;
      terminal(screenLines, screenChars);
      drawHud();
    },

    focus(id) {
      if (id === focused) return;
      if (focused) slide.pull(focused, 0);
      focused = id;
      const flask = id ? flasks.get(id) : undefined;
      if (id && flask && id !== playing) {
        slide.pull(id, 1);
        flask.add(cursor);
      }
      cursor.visible = !!flask && id !== playing;
      if (!playing) status = "";
      drawHud();
    },

    async insert(id) {
      const flask = flasks.get(id);
      const p = byId.get(id);
      const liquid = liquids.get(id);
      if (!flask || !p || !liquid) return;
      playing = id;
      cursor.visible = false;
      status = "ASSAY: RUNNING";
      drawHud();
      stage.play(LIFT);
      const start = flask.position.clone();
      moving = flask;
      const path = new CatmullRomCurve3([
        start,
        start.clone().add(new Vector3(0, 0.25, 0.5)),
        new Vector3(STAND.x - 0.2, TIP_Y + 0.3, STAND.z + 0.5),
        STAND.clone(),
      ]);
      await stage.tween(450, (t) => flask.position.copy(path.getPointAt(t)), easeInOut);
      moving = null;
      // Three drops, and the liquid turns at the endpoint.
      const from = liquidColour(id);
      const to = new Color(NEON);
      for (let k = 0; k < 3; k++) {
        stage.play(DRIP);
        drop.visible = true;
        await stage.tween(
          110,
          (t) => {
            drop.position.set(STAND.x, TIP_Y - (TIP_Y - (TOP + FLASK_H - 0.02)) * t, STAND.z);
            liquid.color.copy(from).lerp(to, (k + t) / 3);
          },
          linear,
        );
      }
      drop.visible = false;
      stage.play(ENDPOINT);
      // The terminal types the assay.
      stage.play(TYPING);
      const lines = ["ASSAY", (p.ref ?? "").slice(0, 6), "DONE"];
      const chars = lines.join("").length;
      await stage.tween(300, (t) => terminal(lines, Math.ceil(chars * t)), linear);
      status = DONE;
      drawHud();
    },

    async eject() {
      const id = playing;
      const flask = id ? flasks.get(id) : undefined;
      const liquid = id ? liquids.get(id) : undefined;
      if (!id || !flask || !liquid) return;
      stage.play(PUT_BACK);
      status = "";
      drawHud();
      const home = homes.get(id) as Vector3;
      const start = flask.position.clone();
      const back = new CatmullRomCurve3([start, new Vector3(STAND.x - 0.2, TIP_Y + 0.3, STAND.z + 0.5), home.clone().add(new Vector3(0, 0.25, 0.5)), home.clone()]);
      const from = liquid.color.clone();
      const colour = liquidColour(id);
      moving = flask;
      await stage.tween(
        400,
        (t) => {
          flask.position.copy(back.getPointAt(t));
          liquid.color.copy(from).lerp(colour, t);
        },
        easeInOut,
      );
      moving = null;
      playing = null;
      slide.reset(id);
      if (focused === id) {
        slide.pull(id, 1);
        flask.add(cursor);
        cursor.visible = true;
      }
      idleTerminal();
      drawHud();
    },

    dispose() {
      disposeAll(world, [...textures, hud.texture]);
    },
  };
};
