// Switchboard. Each project is a socket on a jack field, in rows by group. Choosing one plugs a
// cord into it: the line lamp lights, the key throws and a ticket prints with the project's tag
// and the date, the way an MCP server connects a model to one tool at a time and a person decides
// which calls go through. Procedural geometry and canvas-drawn labels only.

import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene as World,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { drawText, mark, wrap } from "../engine/font.ts";
import { atlasPlane, disposeAll, drawnBox, fit, GROUP_COLOURS, outline, toonMaker, type Rect } from "../engine/kit.ts";
import { easeInOut, linear } from "../engine/loop.ts";
import type { Motif } from "../engine/sound.ts";
import type { CreateScene, Project } from "../engine/types.ts";

const WOOD = "#4a3426";
const BAKELITE = "#1b1b1b";
const BRASS = "#c9a227";
const AMBER = "#ffb000";
const PAPER = "#f3eedf";
const INK = "#1e1f1c";
const HOLE = "#0b0b0a";
const FOCUS = "#f3eedf"; // paper white: brass and amber are already on the panel

// World units. The cabinet's face is the plane z = 0; the key shelf runs forward from it.
const PITCH = 0.66; // socket spacing
const ROW = 0.86; // row spacing
const FACE_Z = 0.04; // front of the bakelite face
const SHELF = { h: 0.5, d: 1.3 };
const PRINTER = { x: 1.45, w: 1, h: 0.5, d: 0.8, z: 0.6 };
const TICKET = { w: 0.66, h: 0.9, z: 0.45 };
const TICKET_IN = SHELF.h + PRINTER.h - TICKET.h / 2 - 0.05; // fully inside the printer
const TICKET_OUT = SHELF.h + PRINTER.h + TICKET.h / 2 - 0.08;
const PLUG_LENGTH = 0.42; // from the tip to the back of the sleeve
const UPRIGHT = new Quaternion();
const PLUGGED = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(0, 0, -1));
const VIEW = new Vector3(0.25, 0.38, 1).normalize(); // from the scene towards the fixed camera

const PLUG: Motif = [
  { noise: 4000, dur: 0.02, vol: 0.15 },
  { hz: 2000, dur: 0.02, vol: 0.06 },
];
const BUZZ: Motif = [{ hz: 120, at: 0.03, dur: 0.12, vol: 0.05 }];
const THUNK: Motif = [
  { noise: 500, dur: 0.05, vol: 0.2 },
  { wave: "triangle", hz: 110, dur: 0.08, vol: 0.18 },
];
const RING: Motif = [
  { wave: "triangle", hz: 523, dur: 0.08, vol: 0.12 },
  { wave: "triangle", hz: 659, at: 0.12, dur: 0.1, vol: 0.12 },
];
const PRINT: Motif = [0, 0.08, 0.16, 0.24].map((at) => ({ noise: 3000, at, dur: 0.012, vol: 0.1 }));
const UNPLUG: Motif = [
  { wave: "triangle", hz: 400, to: 200, dur: 0.1 },
  { noise: 2500, dur: 0.03 },
];

// The label atlas: a 512 px canvas of 160x48 strips, three to a row. Sockets take the first
// strips; the last three hold the key names.
const ATLAS = 512;
const SOCKETS_MAX = 27;
const strip = (i: number): Rect => [(i % 3) * 160, Math.floor(i / 3) * 48, 160, 48];
const face = (w: number, h: number, rect: Rect) => atlasPlane(w, h, rect, ATLAS);
const KEYS = ["LINE", "RING", "TICKET"];

const MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
const today = () => {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const pad = (n: number) => String(n).padStart(2, "0");

export const create: CreateScene = (stage) => {
  const world = new World();
  world.background = new Color("#171816");
  const camera = new PerspectiveCamera(35, 1, 1, 100);
  world.add(new HemisphereLight("#fff4e0", "#2b2620", 1.5));
  const sun = new DirectionalLight("#ffffff", 2.2);
  sun.position.set(-4, 8, 8);
  world.add(sun);

  const { toon, bands } = toonMaker();
  const wood = toon(WOOD);
  const bakelite = toon(BAKELITE);
  const brass = toon(BRASS);
  const hole = new MeshBasicMaterial({ color: HOLE });

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasCanvas.height = ATLAS;
  const a = atlasCanvas.getContext("2d") as CanvasRenderingContext2D;
  const atlas = new CanvasTexture(atlasCanvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  const labelled = new MeshBasicMaterial({ map: atlas });

  // The ticket: redrawn for each project.
  const ticketCanvas = document.createElement("canvas");
  ticketCanvas.width = 256;
  ticketCanvas.height = 350;
  const tg = ticketCanvas.getContext("2d") as CanvasRenderingContext2D;
  const ticketTexture = new CanvasTexture(ticketCanvas);
  ticketTexture.colorSpace = SRGBColorSpace;

  const desk = new Mesh(new BoxGeometry(30, 0.5, 16), toon("#2b2620"));
  desk.position.y = -0.25;
  world.add(desk);
  const content = new Group(); // everything the camera frames
  world.add(content);

  // The key shelf, with two plug seats, three keys and the ticket printer.
  const keys = KEYS.map((_, k) => {
    const pivot = new Object3D();
    pivot.position.set(-0.55 + k * 0.4, SHELF.h + 0.04, 0.55);
    const lever = new Mesh(new BoxGeometry(0.07, 0.34, 0.07).translate(0, 0.17, 0), bakelite);
    pivot.add(lever);
    return pivot;
  });
  const keyBases = new Mesh(
    mergeGeometries(keys.map((k) => new BoxGeometry(0.18, 0.04, 0.18).translate(k.position.x, SHELF.h + 0.02, 0.55))),
    brass,
  );
  const keyLabels = new Mesh(
    mergeGeometries(
      KEYS.map((_, k) => face(0.36, 0.108, strip(SOCKETS_MAX + k)).rotateX(-Math.PI / 2).translate(-0.55 + k * 0.4, SHELF.h + 0.003, 0.86)),
    ),
    labelled,
  );
  KEYS.forEach((name, k) => {
    const [x, y] = strip(SOCKETS_MAX + k);
    a.fillStyle = PAPER;
    a.fillRect(x + 2, y + 2, 156, 44);
    drawText(a, name, x + (160 - name.length * 18) / 2, y + 13, 3, INK);
  });
  const seatsAt = [-1.6, -1.25];
  const seats = new Mesh(
    mergeGeometries(seatsAt.map((x) => new CircleGeometry(0.08, 20).rotateX(-Math.PI / 2).translate(x, SHELF.h + 0.003, 0.5))),
    hole,
  );
  const plugs = seatsAt.map((x) => {
    const plug = new Group(); // origin at the tip; the tip points along +y
    plug.add(
      new Mesh(new CylinderGeometry(0.035, 0.035, 0.12, 16).translate(0, -0.06, 0), brass),
      new Mesh(new CylinderGeometry(0.06, 0.055, PLUG_LENGTH - 0.12, 16).translate(0, -0.27, 0), bakelite),
    );
    plug.position.set(x, SHELF.h + PLUG_LENGTH - 0.12, 0.5); // standing in its seat
    return plug;
  });
  const home = plugs[0].position.clone();
  const anchor = new Vector3(seatsAt[0], SHELF.h, 0.5); // where the cord leaves the shelf
  const shelf = new Mesh(new BoxGeometry(1, SHELF.h, SHELF.d), wood); // resized in build
  const printer = new Mesh(new RoundedBoxGeometry(PRINTER.w, PRINTER.h, PRINTER.d, 2, 0.05), bakelite);
  printer.position.set(PRINTER.x, SHELF.h + PRINTER.h / 2, PRINTER.z);
  const slot = new Mesh(new PlaneGeometry(TICKET.w + 0.1, 0.05).rotateX(-Math.PI / 2), hole);
  slot.position.set(PRINTER.x, SHELF.h + PRINTER.h + 0.003, TICKET.z);
  const ticket = new Mesh(new PlaneGeometry(TICKET.w, TICKET.h), new MeshBasicMaterial({ map: ticketTexture }));
  ticket.position.set(PRINTER.x, TICKET_IN, TICKET.z);
  content.add(shelf, keyBases, keyLabels, ...keys, seats, ...plugs, printer, slot, ticket);

  // One cord, rebuilt along its curve while the plug moves.
  const cord = new Mesh(new BufferGeometry(), bakelite); // empty until the plug first moves
  cord.visible = false;
  cord.raycast = () => {}; // a click on a cord reaches the socket behind it
  content.add(cord);
  const cordCurve = () => {
    const plug = plugs[0];
    const back = plug.localToWorld(new Vector3(0, -PLUG_LENGTH, 0));
    const lead = plug.localToWorld(new Vector3(0, -PLUG_LENGTH - 0.2, 0));
    const sag = anchor.clone().lerp(lead, 0.5);
    sag.y = Math.max(SHELF.h + 0.06, sag.y - 0.3 * anchor.distanceTo(lead));
    return new CatmullRomCurve3([anchor, anchor.clone().setY(SHELF.h + 0.1), sag, lead, back]);
  };
  const drawCord = () => {
    plugs[0].updateMatrixWorld();
    const atHome = plugs[0].position.distanceTo(home) < 0.01;
    cord.visible = !atHome;
    if (atHome) return;
    cord.geometry.dispose();
    cord.geometry = stage.lowPower ? new TubeGeometry(cordCurve(), 24, 0.022, 4) : new TubeGeometry(cordCurve(), 64, 0.022, 8);
  };

  const ring = new Mesh(new TorusGeometry(0.17, 0.025, 8, 32), new MeshBasicMaterial({ color: FOCUS }));
  ring.visible = false;
  ring.raycast = () => {};
  content.add(ring);

  const sockets = new Map<string, Vector3>(); // socket centre on the face, by project
  const index = new Map<string, number>();
  const byId = new Map<string, Project>();
  let lamps: InstancedMesh | null = null;
  let cabinetOutline: Mesh | null = null;
  let playing: string | null = null;

  const lamp = (id: string, on: boolean) => {
    const i = index.get(id);
    if (!lamps || i === undefined) return;
    lamps.setColorAt(i, new Color(AMBER).multiplyScalar(on ? 1 : 0.18));
    (lamps.instanceColor as NonNullable<typeof lamps.instanceColor>).needsUpdate = true;
  };

  const printTicket = (p: Project) => {
    tg.fillStyle = PAPER;
    tg.fillRect(0, 0, 256, 350);
    drawText(tg, `LINE ${pad((index.get(p.id) ?? 0) + 1)}`, 14, 16, 3, INK);
    tg.fillStyle = INK;
    tg.fillRect(14, 48, 228, 2);
    wrap(p.title, 19)
      .slice(0, 5)
      .forEach((line, i) => drawText(tg, line, 14, 64 + i * 18, 2, INK));
    drawText(tg, p.ref ? `AT ${p.ref}` : p.groupName.split(",")[0], 14, 176, 2, INK);
    drawText(tg, today(), 14, 200, 2, INK);
    tg.fillRect(14, 232, 228, 2);
    drawText(tg, "CONNECTED", 14, 250, 2, INK);
    mark(tg, p.id, 212, 296, 6, INK);
    ticketTexture.needsUpdate = true;
  };

  // The plug's way from its seat to a socket, in world space (nothing in this scene moves with the
  // layout, so it can be built once per trip).
  const route = (socket: Vector3) =>
    new CatmullRomCurve3([
      home.clone(),
      home.clone().add(new Vector3(0, 0.5, 0)),
      new Vector3((home.x + socket.x) / 2, (home.y + socket.y) / 2 + 0.4, 1.1),
      socket.clone().add(new Vector3(0, 0, 0.55)),
      socket.clone().add(new Vector3(0, 0, FACE_Z - 0.05)),
    ]);
  const travel = (path: CatmullRomCurve3, ms: number, from: Quaternion, to: Quaternion) =>
    stage.tween(
      ms,
      (t) => {
        plugs[0].position.copy(path.getPointAt(t));
        plugs[0].quaternion.slerpQuaternions(from, to, Math.min(1, t * 1.4));
        drawCord();
      },
      easeInOut,
    );

  return {
    world,
    camera,

    build(projects) {
      if (projects.length > SOCKETS_MAX) throw new Error(`the label atlas holds ${SOCKETS_MAX} sockets`);
      const groups = [...new Set(projects.map((p) => p.group))];
      const rows = groups.map((g) => projects.filter((p) => p.group === g));
      const cols = Math.max(...rows.map((r) => r.length));
      const width = Math.max(cols * PITCH + 0.9, 4.2); // room for the seats, keys and printer
      const height = SHELF.h + 0.2 + groups.length * ROW + 0.85;
      const topRow = height - 0.85; // the face ends 0.22 below the cabinet top

      const cabinet = new Mesh(new RoundedBoxGeometry(width, height, 0.9, 2, 0.06), wood);
      cabinet.position.set(0, height / 2, -0.45);
      cabinetOutline = outline(cabinet, INK, 0.03);
      const field = new Mesh(new BoxGeometry(width - 0.36, groups.length * ROW + 0.3, 0.04), bakelite);
      field.position.set(0, topRow - ((groups.length - 1) * ROW) / 2 + 0.05, FACE_Z / 2);
      shelf.geometry.dispose();
      shelf.geometry = new BoxGeometry(width, SHELF.h, SHELF.d);
      shelf.position.set(0, SHELF.h / 2, SHELF.d / 2);

      // Sockets, lamps and designation strips: one draw call each, however many projects.
      const n = projects.length;
      const rims = new InstancedMesh(new TorusGeometry(0.1, 0.03, 8, 24), brass, n);
      const holes = new InstancedMesh(new CircleGeometry(0.075, 20), hole, n);
      lamps = new InstancedMesh(new CylinderGeometry(0.06, 0.06, 0.05, 16).rotateX(Math.PI / 2), new MeshBasicMaterial(), n);
      const pick = new BoxGeometry(PITCH * 0.92, ROW * 0.92, 0.06);
      const strips: ReturnType<typeof face>[] = [];
      const place = new Object3D();
      projects.forEach((p, i) => {
        byId.set(p.id, p);
        index.set(p.id, i);
        const row = groups.indexOf(p.group);
        const col = rows[row].indexOf(p);
        const at = new Vector3((col - (rows[row].length - 1) / 2) * PITCH, topRow - row * ROW, FACE_Z); // rows centred
        sockets.set(p.id, at);
        place.position.set(at.x, at.y, FACE_Z + 0.012);
        place.updateMatrix();
        rims.setMatrixAt(i, place.matrix);
        place.position.z = FACE_Z + 0.002;
        place.updateMatrix();
        holes.setMatrixAt(i, place.matrix);
        place.position.set(at.x, at.y + 0.25, FACE_Z + 0.02);
        place.updateMatrix();
        lamps?.setMatrixAt(i, place.matrix);
        lamp(p.id, false);
        strips.push(face(0.54, 0.162, strip(i)).translate(at.x, at.y - 0.25, FACE_Z + 0.003));
        // An invisible box over the socket carries the id for pointer picking.
        const target = new Mesh(pick, hole);
        target.visible = false;
        target.userData.id = p.id;
        target.position.set(at.x, at.y, FACE_Z + 0.03);
        content.add(target);

        // The designation strip: a band in the group colour and the first two lines of the name.
        const [x, y] = strip(i);
        a.fillStyle = PAPER;
        a.fillRect(x + 2, y + 2, 156, 44);
        a.fillStyle = GROUP_COLOURS[p.group] ?? BRASS;
        a.fillRect(x + 2, y + 2, 156, 6);
        const lines = p.label ? [p.label, p.tag ?? ""] : wrap(p.title, 12);
        lines.slice(0, 2).forEach((line, l) => drawText(a, line, x + 8, y + 12 + l * 16, 2, INK));
      });
      const labels = new Mesh(mergeGeometries(strips), labelled);
      content.add(cabinet, field, rims, holes, lamps, labels);
      atlas.needsUpdate = true;
    },

    layout(aspect) {
      if (cabinetOutline) cabinetOutline.visible = !stage.lowPower;
      world.updateMatrixWorld();
      // Everything, plus a ticket fully printed, so printing never leaves the view.
      const printed = new Box3().setFromCenterAndSize(
        new Vector3(PRINTER.x, TICKET_OUT, TICKET.z),
        new Vector3(TICKET.w, TICKET.h, 0.02),
      );
      fit(camera, [drawnBox(content), printed], aspect, VIEW);
      stage.invalidate();
    },

    focus(id) {
      const at = id ? sockets.get(id) : undefined;
      ring.visible = !!at;
      if (at) ring.position.set(at.x, at.y, FACE_Z + 0.016);
      stage.invalidate();
    },

    async insert(id) {
      const socket = sockets.get(id);
      const p = byId.get(id);
      if (!socket || !p) return;
      playing = id;
      await travel(route(socket), 560, UPRIGHT, PLUGGED);
      stage.play(PLUG);
      lamp(id, true);
      stage.play(BUZZ);
      stage.play(THUNK);
      await stage.tween(100, (t) => {
        keys[0].rotation.x = -0.5 * t;
      });
      stage.play(RING);
      printTicket(p);
      stage.play(PRINT);
      await stage.tween(
        380,
        (t) => {
          ticket.position.y = TICKET_IN + (TICKET_OUT - TICKET_IN) * t;
        },
        linear,
      );
    },

    async eject() {
      const id = playing;
      const socket = id ? sockets.get(id) : undefined;
      if (!id || !socket) return;
      stage.play(UNPLUG);
      lamp(id, false);
      void stage.tween(150, (t) => {
        ticket.position.y = TICKET_OUT - (TICKET_OUT - TICKET_IN) * t;
      });
      void stage.tween(100, (t) => {
        keys[0].rotation.x = -0.5 * (1 - t);
      });
      const back = route(socket);
      back.points.reverse();
      await travel(back, 420, PLUGGED, UPRIGHT);
      plugs[0].position.copy(home);
      plugs[0].quaternion.copy(UPRIGHT);
      drawCord();
      playing = null;
    },

    dispose() {
      disposeAll(world, [atlas, ticketTexture, bands]);
    },
  };
};
