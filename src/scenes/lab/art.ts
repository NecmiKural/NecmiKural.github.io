// The Lab's pixel art, drawn in code on a 2D canvas: a dense chemistry lab at night. Everything
// here is original and procedural, on a grid of at least 320 x 200 pixels (MIN). The room is
// painted once per size (paintRoom); the moving parts are drawn every frame on top of it.

import { ADVANCE, drawText } from "../../engine/font.ts";

export const MIN = { width: 320, height: 200 };
export const TOP_BAR = 16; // HUD bar heights, in pixels
export const BOTTOM_BAR = 22;

export const PAL = {
  wall: "#120f26",
  brick: ["#1d1838", "#221b42", "#1a1533"],
  mortar: "#0d0a1c",
  pipe: "#4a5568",
  pipeLight: "#7a8699",
  pipeDark: "#2a3142",
  valve: "#c0392b",
  magenta: "#ff3fd0",
  teal: "#2ff5e0",
  floor: ["#18142c", "#211b3b"],
  lamp: "#ffb35c",
  sky: ["#0b0f33", "#1a1450", "#2a1a5e"],
  city: "#0f0b24",
  moon: "#f4ecc8",
  cat: "#050409",
  catRim: "#7a68c8",
  wood: "#6b4a33",
  woodDark: "#3b2a20",
  woodLight: "#8a6446",
  steel: "#7b8794",
  steelDark: "#4c5562",
  glass: "#b9e4ef",
  glassDim: "#2c3a4a",
  housing: "#c9b98f",
  housingDark: "#8f8160",
  screen: "#04140a",
  green: "#39ff6a",
  greenDim: "#145c2a",
  amber: "#ffb000",
  red: "#d23a3a",
  yellow: "#f2c230",
  ink: "#0b0d16",
  paper: "#9a9484",
  white: "#e8ecf2",
  frame: "#2a3150",
};
// Liquids by group, bright for a dark room; flagships take the banner accent (set by the scene).
export const LIQUIDS: Record<string, string> = {
  software: "#4aa8ff",
  coursework: "#57e389",
  "open-source": "#c08cff",
};

export type G = CanvasRenderingContext2D;

export const rect = (g: G, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), w, h);
};
export const px = (g: G, x: number, y: number, c: string) => rect(g, x, y, 1, 1, c);

// A 1-pixel line from (x0, y0) to (x1, y1), every pixel of it: Bresenham.
export function line(g: G, x0: number, y0: number, x1: number, y1: number, c: string): void {
  [x0, y0, x1, y1] = [x0, y0, x1, y1].map(Math.round);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  g.fillStyle = c;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// A filled or outlined pixel circle.
export function disc(g: G, cx: number, cy: number, r: number, c: string, outline = false): void {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y));
    if (!outline) g.fillRect(cx - w, cy + y, 2 * w + 1, 1);
    else {
      g.fillRect(cx - w, cy + y, 1, 1);
      g.fillRect(cx + w, cy + y, 1, 1);
    }
  }
  if (outline) {
    g.fillRect(cx - r, cy, 1, 1);
    g.fillRect(cx + r, cy, 1, 1);
  }
}

// The same small variation for the same place, every time.
export const hash = (a: number, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Where everything goes, for a grid of w x h. The room is 320 wide, centred; it stands on the
// floor line, which keeps its distance from the bottom bar, and the wall grows upwards.
export function plan(w: number, h: number) {
  const x0 = Math.floor((w - 320) / 2);
  const floor = h - BOTTOM_BAR - 24;
  const top = floor - 138; // the room's top: pipes and neon
  return {
    w,
    h,
    x0,
    floor,
    top,
    shelf: (row: number) => floor - 44 - row * 19, // shelf planks, row 0 the lowest
    bench: { x: x0 + 98, y: floor - 30, w: 202 },
    sample: { x: x0 + 107, y: floor - 30 }, // where a chosen flask stands on the bench (its base)
    burner: { x: x0 + 143, y: floor - 30 },
    round: { x: x0 + 143, y: floor - 56, r: 8 }, // the boiling flask
    condenser: { x0: x0 + 152, y0: floor - 74, x1: x0 + 194, y1: floor - 56 },
    receiver: { x: x0 + 191, y: floor - 30 },
    crt: { x: x0 + 222, y: floor - 66, w: 54, h: 36 },
    scope: { x: x0 + 240, y: floor - 110, w: 52, h: 28 },
  };
}
export type Plan = ReturnType<typeof plan>;

// The space between flasks on a shelf of n: 16 pixels, closer when more must fit on its 86, so
// the last one still stands on it (the first at +10, the last ending by +90).
export const shelfPitch = (n: number) => (n <= 1 ? 16 : Math.min(16, Math.floor(69 / (n - 1))));

// The liquid's way through the glass, as points: from the sample flask's neck to the boiling
// flask, then as vapour up and through the condenser to its outlet over the receiver.
export function tubing(p: Plan): [number, number][] {
  const s = p.sample;
  const r = p.round;
  const c = p.condenser;
  return [
    [s.x + 5, s.y - 14],
    [s.x + 5, s.y - 32],
    [r.x - 9, s.y - 32],
    [r.x - 9, r.y - 3],
    [r.x, r.y - 3],
    [r.x, r.y - r.r - 8],
    [c.x0, c.y0],
    [c.x1, c.y1],
    [c.x1 + 2, c.y1 + 3],
  ];
}

// Every pixel along the points, in order.
export function trace(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push([Math.round(ax + ((bx - ax) * k) / n), Math.round(ay + ((by - ay) * k) / n)]);
  }
  return out;
}

// ---------- the room, painted once per size ----------

// counts: how many project flasks stand on each shelf, lowest first; books fill the rest.
export function paintRoom(g: G, p: Plan, counts: number[]): void {
  const { w, h, x0, floor, top } = p;
  // Brick wall.
  rect(g, 0, 0, w, h, PAL.wall);
  for (let y = TOP_BAR, row = 0; y < floor; y += 6, row++) {
    for (let x = (row % 2) * -7; x < w; x += 14) {
      rect(g, x, y, 13, 5, PAL.brick[Math.floor(hash(x, y) * 3)]);
    }
  }
  // Light from the neon tubes, spilling down the wall.
  for (const [x, len, c] of [
    [x0 + 14, 72, PAL.magenta],
    [x0 + 226, 70, PAL.teal],
  ] as const) {
    for (let k = 0; k < 4; k++) {
      g.globalAlpha = 0.06 - k * 0.012;
      rect(g, x - 6 - k * 4, top + 8, len + 12 + k * 8, 30 + k * 12, c);
    }
    g.globalAlpha = 1;
  }
  // Pipes along the top, one down the right, with joints and a valve.
  pipe(g, 0, top + 2, w, true);
  pipe(g, x0 + 150, top + 9, Math.max(0, w - x0 - 150), true, 2);
  pipe(g, x0 + 306, top + 2, floor - top - 2, false);
  for (let x = x0 % 40; x < w; x += 40) rect(g, x, top + 1, 2, 6, PAL.pipeDark);
  disc(g, x0 + 307, top + 60, 4, PAL.valve, true);
  line(g, x0 + 303, top + 60, x0 + 311, top + 60, PAL.valve);
  line(g, x0 + 307, top + 56, x0 + 307, top + 64, PAL.valve);
  // Above the room, on a tall grid: glass-fronted wall cabinets, and higher still a vent.
  if (top > TOP_BAR + 14) pipe(g, 0, TOP_BAR + 4, w, true, 2);
  if (top - 52 > TOP_BAR + 8) {
    for (let k = 0; k < 3; k++) cabinet(g, x0 + 8 + k * 102, top - 50, 96, 42, k);
  }
  if (top - 52 > TOP_BAR + 40) {
    const vx = Math.round(w / 2 - 20);
    const vy = Math.round((TOP_BAR + top - 52) / 2 - 6);
    rect(g, vx, vy, 40, 14, PAL.pipeDark);
    for (let k = 0; k < 6; k++) rect(g, vx + 3, vy + 2 + k * 2, 34, 1, PAL.ink);
  }
  // Neon tube bodies (their glow and flicker are drawn per frame).
  rect(g, x0 + 12, top + 9, 4, 4, PAL.steelDark);
  rect(g, x0 + 88, top + 9, 4, 4, PAL.steelDark);
  rect(g, x0 + 224, top + 9, 4, 4, PAL.steelDark);
  rect(g, x0 + 298, top + 9, 4, 4, PAL.steelDark);
  // Hanging cables.
  sag(g, x0 + 96, top + 5, x0 + 150, top + 12, 9);
  sag(g, x0 + 250, top + 9, x0 + 244, p.scope.y, 4);
  sag(g, p.scope.x + 4, p.scope.y + p.scope.h, p.crt.x + 40, p.crt.y, 10);
  windowView(g, x0 + 100, top + 17, 66, 50);
  periodicTable(g, x0 + 172, top + 17);
  danger(g, x0 + 174, top + 47);
  biohazard(g, x0 + 228, top + 31);
  rect(g, x0 + 249, top + 15, 37, 12, PAL.ink); // the clock's case; its digits are drawn per frame
  rect(g, x0 + 249, top + 15, 37, 1, PAL.steelDark);
  plant(g, x0 + 94, top + 5);
  // Shelves on the left, one per group; books and spare glassware beside the project flasks.
  counts.forEach((n, row) => {
    const y = p.shelf(row);
    rect(g, x0 + 6, y, 86, 3, PAL.woodLight);
    rect(g, x0 + 6, y + 3, 86, 1, PAL.woodDark);
    rect(g, x0 + 10, y + 4, 2, 4, PAL.steelDark);
    rect(g, x0 + 86, y + 4, 2, 4, PAL.steelDark);
    const from = n ? x0 + 10 + (n - 1) * shelfPitch(n) + FLASK_W + 5 : x0 + 10;
    if (from < x0 + 84) books(g, from, y, x0 + 90 - from, 11, row);
  });
  // The oscilloscope on its bracket.
  const s = p.scope;
  rect(g, s.x - 2, s.y + s.h, s.w + 4, 3, PAL.woodLight);
  rect(g, s.x, s.y, s.w, s.h, PAL.steelDark);
  rect(g, s.x, s.y, s.w, 1, PAL.steel);
  rect(g, s.x + 3, s.y + 3, 32, 22, PAL.ink);
  for (const [k, y] of [0, 1, 2].entries()) disc(g, s.x + 43, s.y + 6 + y * 7, 2, k === 0 ? PAL.red : PAL.steel);
  rect(g, s.x + 39, s.y + 23, 9, 2, PAL.greenDim);
  // The bench, its drawers, and what stands on it.
  const b = p.bench;
  rect(g, b.x, b.y, b.w, 3, PAL.woodLight);
  rect(g, b.x + 2, b.y + 3, b.w - 4, floor - b.y - 3, PAL.woodDark);
  for (let k = 0; k < 4; k++) {
    const dx = b.x + 8 + k * 49;
    rect(g, dx, b.y + 8, 42, 9, PAL.wood);
    rect(g, dx + 18, b.y + 12, 6, 1, PAL.steel);
  }
  rig(g, p);
  crtHousing(g, p);
  lampBody(g, p);
  keyboard(g, p.crt.x + 8, b.y);
  mug(g, x0 + 278, b.y);
  rack(g, x0 + 288, b.y);
  barrel(g, x0 + 303, floor, "#3d6b4f");
  barrel(g, x0 + 74, floor, "#7a3b2e"); // behind the books
  // In front, under the shelves: a stack of books on the topics of the work.
  bookStack(g, x0 + 4, floor, [
    ["MACHINE LEARNING", "#2f3d8c"],
    ["DATA STREAMS", "#6a2f6e"],
    ["CHEMISTRY", "#2f6e5a"],
  ]);
  // Side areas on a wide grid: lockers and gas cylinders.
  for (let x = x0 - 40; x > -30; x -= 44) locker(g, x, floor);
  for (let x = x0 + 324; x < w; x += 22) cylinder(g, x, floor);
  // The floor: tiles, darker towards the back.
  for (let y = floor, row = 0; y < h - BOTTOM_BAR; y += 6, row++) {
    for (let x = (row % 2) * 8; x < w + 16; x += 16) rect(g, x - 8, y, 8, 6, PAL.floor[0]);
    for (let x = (row % 2) * 8; x < w + 16; x += 16) rect(g, x, y, 8, 6, PAL.floor[1]);
  }
  rect(g, 0, floor, w, 1, PAL.ink);
}

function pipe(g: G, x: number, y: number, len: number, across: boolean, size = 4): void {
  if (across) {
    rect(g, x, y, len, size, PAL.pipe);
    rect(g, x, y, len, 1, PAL.pipeLight);
    rect(g, x, y + size - 1, len, 1, PAL.pipeDark);
  } else {
    rect(g, x, y, size, len, PAL.pipe);
    rect(g, x, y, 1, len, PAL.pipeLight);
    rect(g, x + size - 1, y, 1, len, PAL.pipeDark);
  }
}

// A cable hanging between two points, sagging by drop pixels in the middle.
function sag(g: G, ax: number, ay: number, bx: number, by: number, drop: number): void {
  const n = Math.max(2, Math.abs(bx - ax) + Math.abs(by - ay));
  let last: [number, number] | null = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t + drop * 4 * t * (1 - t);
    if (last) line(g, last[0], last[1], x, y, PAL.ink);
    last = [x, y];
  }
}

// A generic periodic table: 18 columns, 7 periods and the two rows below, coloured by block.
function periodicTable(g: G, x: number, y: number): void {
  rect(g, x, y, 42, 27, PAL.paper);
  rect(g, x + 1, y + 1, 40, 25, "#b9b19c");
  const cell = (c: number, r: number, colour: string) => px(g, x + 3 + c * 2, y + 3 + r * 2, colour);
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 18; c++) {
      const present = r === 0 ? c === 0 || c === 17 : r < 3 ? c < 2 || c > 11 : true;
      if (!present) continue;
      const colour = c < 2 ? "#d4553a" : c < 12 ? "#3f6fb5" : c === 17 ? "#8a59b8" : "#4f9a54";
      cell(c, r, colour);
    }
  }
  for (let r = 0; r < 2; r++) for (let c = 2; c < 16; c++) cell(c, 8 + r, "#2f9a9a");
}

function danger(g: G, x: number, y: number): void {
  rect(g, x, y, 40, 13, PAL.white);
  rect(g, x + 1, y + 1, 38, 11, PAL.red);
  drawText(g, "DANGER", x + 3, y + 3, 1, PAL.white);
}

// The biohazard symbol, the generic one, on a yellow disc: three open crescents round a small
// ring, drawn as thin strokes (filled blobs would read as a face at this size).
function biohazard(g: G, cx: number, cy: number): void {
  disc(g, cx, cy, 10, PAL.ink);
  disc(g, cx, cy, 9, PAL.yellow);
  for (let y = -8; y <= 8; y++) {
    for (let x = -8; x <= 8; x++) {
      const d = Math.hypot(x, y);
      let on = d >= 1.3 && d <= 2.5; // the ring
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
        const r = Math.hypot(x - Math.cos(a) * 4.3, y - Math.sin(a) * 4.3);
        const mouth = Math.hypot(x - Math.cos(a) * 6.8, y - Math.sin(a) * 6.8);
        if (r >= 2.6 && r <= 3.9 && mouth > 3.2) on = true; // a crescent, open outwards
      }
      if (on) px(g, cx + x, cy + y, PAL.ink);
    }
  }
}

function books(g: G, x: number, y: number, width: number, height: number, seed: number): void {
  const colours = ["#8c2f39", "#2f5d8c", "#3b7a57", "#b8860b", "#5a3d7a", "#7a5230"];
  let bx = x + 2;
  if (width > 26) {
    beaker(g, bx, y); // a spare beaker first, then the books
    bx += 10;
  }
  for (let k = 0; bx < x + width - 4; k++) {
    const bw = 3 + Math.floor(hash(k, seed) * 2);
    const bh = height - Math.floor(hash(k, seed + 7) * 4);
    rect(g, bx, y - bh, bw, bh, colours[(k + seed) % colours.length]);
    rect(g, bx, y - bh + 2, bw, 1, "#00000055");
    bx += bw;
  }
}

function beaker(g: G, x: number, y: number): void {
  rect(g, x, y - 9, 7, 9, PAL.glassDim);
  rect(g, x + 1, y - 4, 5, 3, "#2a8f8f");
  rect(g, x, y - 9, 1, 9, PAL.glass);
  rect(g, x + 6, y - 9, 1, 9, PAL.glass);
  rect(g, x, y - 1, 7, 1, PAL.glass);
}

// The window: four panes of night sky, a full moon and an invented skyline (the stars and lit
// windows that change are drawn per frame, by windowLights).
function windowView(g: G, x: number, y: number, w: number, h: number): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip(); // the sky and the city stay inside the frame
  for (let k = 0; k < h; k++) rect(g, x, y + k, w, 1, PAL.sky[Math.min(2, Math.floor((k / h) * 3))]);
  disc(g, x + w - 16, y + 11, 5, PAL.moon);
  px(g, x + w - 18, y + 9, "#d8cfa8");
  px(g, x + w - 14, y + 13, "#d8cfa8");
  px(g, x + w - 15, y + 8, "#d8cfa8");
  for (let bx = x, k = 0; bx < x + w; k++) {
    const bw = 5 + Math.floor(hash(k, 31) * 7);
    const bh = 10 + Math.floor(hash(k, 37) * 20);
    rect(g, bx, y + h - bh, bw, bh, PAL.city);
    bx += bw + (hash(k, 41) > 0.7 ? 1 : 0);
  }
  g.restore();
  rect(g, x - 2, y - 2, w + 4, 2, PAL.woodDark); // the frame and its cross bars
  rect(g, x - 2, y + h, w + 4, 3, PAL.woodLight);
  rect(g, x - 2, y, 2, h, PAL.woodDark);
  rect(g, x + w, y, 2, h, PAL.woodDark);
  rect(g, x + w / 2 - 1, y, 2, h, PAL.woodDark);
  rect(g, x, y + h / 2 - 1, w, 2, PAL.woodDark);
}

// A pothos hanging from the pipe: a pot on a cord, leaves trailing down.
function plant(g: G, x: number, y: number): void {
  line(g, x + 3, y, x + 3, y + 5, PAL.ink);
  rect(g, x, y + 5, 7, 4, "#8a4b2f");
  const leaves = [
    [0, 9], [-1, 11], [1, 13], [-2, 15], [0, 17], [-1, 20], [6, 9], [7, 12], [5, 14], [8, 16], [6, 19], [3, 10], [4, 13],
  ];
  for (const [k, [dx, dy]] of leaves.entries()) {
    rect(g, x + dx, y + dy, 2, 2, k % 3 ? "#3f8f4f" : "#5fb36a");
  }
}

// A stack of books lying flat on the floor, titles on their spines, the widest at the bottom.
function bookStack(g: G, x: number, floor: number, books: [string, string][]): void {
  books.forEach(([title, colour], k) => {
    const w = title.length * ADVANCE + 3;
    const by = floor - 9 * (k + 1);
    const bx = x + Math.floor((books.length - k - 1) * 2);
    rect(g, bx, by, w, 9, colour);
    rect(g, bx, by, w, 1, "#ffffff22");
    rect(g, bx + w - 2, by + 1, 2, 7, "#d8d2c0"); // the page edges
    drawText(g, title, bx + 2, by + 1, 1, "#e8dcc0");
  });
}

// The desk lamp: a weighted base on the bench, an arm and a shade aimed down at the rig.
function lampBody(g: G, p: Plan): void {
  const b = p.bench.y;
  const x = p.crt.x - 14;
  rect(g, x - 3, b - 2, 9, 2, "#4a4060");
  line(g, x + 1, b - 2, x + 4, b - 22, "#6a5f86");
  line(g, x + 4, b - 22, x - 6, b - 34, "#6a5f86");
  rect(g, x + 3, b - 23, 3, 3, "#4a4060"); // the elbow
  rect(g, x - 13, b - 38, 10, 4, "#5a4a6e");
  rect(g, x - 13, b - 38, 10, 1, "#8a7aa8");
  rect(g, x - 15, b - 34, 14, 2, "#5a4a6e");
  rect(g, x - 14, b - 33, 12, 1, PAL.lamp);
}

function keyboard(g: G, x: number, y: number): void {
  rect(g, x, y - 2, 38, 3, PAL.housingDark);
  rect(g, x + 1, y - 2, 36, 1, PAL.housing);
  for (let k = 0; k < 17; k++) px(g, x + 2 + k * 2, y, "#6e6450");
}

function mug(g: G, x: number, y: number): void {
  rect(g, x, y - 7, 7, 7, "#7a2f3a");
  rect(g, x, y - 7, 7, 1, "#a8505c");
  rect(g, x + 7, y - 6, 2, 1, "#7a2f3a");
  rect(g, x + 8, y - 6, 1, 4, "#7a2f3a");
  rect(g, x + 7, y - 3, 2, 1, "#7a2f3a");
}

// A wall cabinet with two glass doors, bottles and jars behind them.
function cabinet(g: G, x: number, y: number, w: number, h: number, seed: number): void {
  rect(g, x, y, w, h, PAL.woodDark);
  rect(g, x + 2, y + 2, w - 4, h - 4, "#0e1626");
  const colours = ["#4aa8ff", "#57e389", PAL.amber, "#c08cff", "#e05a5a", "#2a8f8f"];
  for (const shelfY of [y + 19, y + h - 3]) {
    rect(g, x + 2, shelfY, w - 4, 1, PAL.woodLight);
    for (let bx = x + 5, k = 0; bx < x + w - 8; k++) {
      const bw = 3 + Math.floor(hash(k, seed + shelfY) * 3);
      const bh = 6 + Math.floor(hash(k + 9, seed + shelfY) * 8);
      rect(g, bx, shelfY - bh, bw, bh, PAL.glassDim);
      rect(g, bx, shelfY - Math.ceil(bh / 2), bw, Math.ceil(bh / 2), colours[(k + seed) % colours.length]);
      bx += bw + 2 + Math.floor(hash(k, seed) * 3);
    }
  }
  rect(g, x + w / 2, y + 2, 1, h - 4, PAL.woodDark); // the doors' meeting stiles
  rect(g, x + w / 2 - 3, y + h / 2, 2, 3, PAL.steel);
  rect(g, x + w / 2 + 2, y + h / 2, 2, 3, PAL.steel);
  g.globalAlpha = 0.12;
  for (let k = 0; k < h; k += 2) rect(g, x + 4 + k / 2, y + 2 + k, 6, 1, PAL.white); // a glint on the glass
  g.globalAlpha = 1;
}

function barrel(g: G, x: number, floor: number, colour: string): void {
  rect(g, x, floor - 24, 20, 24, colour);
  rect(g, x, floor - 24, 20, 2, "#ffffff22");
  for (const y of [floor - 19, floor - 7]) rect(g, x, y, 20, 2, PAL.steelDark);
  rect(g, x + 3, floor - 15, 14, 5, PAL.yellow);
  for (let k = 0; k < 4; k++) rect(g, x + 4 + k * 4, floor - 15, 2, 5, PAL.ink);
}

function locker(g: G, x: number, floor: number): void {
  rect(g, x, floor - 70, 32, 70, PAL.steelDark);
  rect(g, x + 1, floor - 69, 15, 68, "#3d4552");
  rect(g, x + 17, floor - 69, 14, 68, "#3d4552");
  for (let k = 0; k < 3; k++) rect(g, x + 4, floor - 64 + k * 3, 9, 1, PAL.ink); // vents on one door
  rect(g, x + 19, floor - 40, 2, 6, PAL.steel); // a handle on the other
}

function cylinder(g: G, x: number, floor: number): void {
  rect(g, x, floor - 44, 10, 44, "#8a3a3a");
  rect(g, x + 2, floor - 50, 6, 6, PAL.steel);
  rect(g, x + 1, floor - 44, 2, 44, "#ffffff22");
}

// The test-tube rack at the end of the bench.
function rack(g: G, x: number, y: number): void {
  const colours = ["#4aa8ff", "#57e389", "#c08cff"];
  rect(g, x, y - 4, 15, 2, PAL.steel);
  rect(g, x, y - 1, 15, 1, PAL.steelDark);
  colours.forEach((c, k) => {
    rect(g, x + 2 + k * 5, y - 12, 3, 11, PAL.glassDim);
    rect(g, x + 2 + k * 5, y - 6 - k, 3, 5 + k, c);
  });
}

// The distillation rig's fixed parts: stand, ring, burner body, condenser and receiver glass.
function rig(g: G, p: Plan): void {
  const r = p.round;
  const c = p.condenser;
  const base = p.bench.y;
  rect(g, r.x + 12, base - 3, 14, 3, PAL.steelDark); // stand foot
  rect(g, r.x + 17, r.y - 30, 2, base - r.y + 27, PAL.steel); // rod
  rect(g, r.x - 2, r.y - 16, 21, 2, PAL.steel); // clamp arm
  rect(g, r.x - 10, r.y + 9, 20, 1, PAL.steel); // ring under the flask
  // Burner body: base, tube, collar.
  rect(g, p.burner.x - 6, base - 3, 12, 3, PAL.steelDark);
  rect(g, p.burner.x - 2, base - 12, 4, 9, PAL.steel);
  rect(g, p.burner.x - 3, base - 8, 6, 2, PAL.steelDark);
  // Condenser: an outer glass jacket, slanting down to the right, its coil drawn per frame.
  const dx = c.x1 - c.x0;
  const dy = c.y1 - c.y0;
  for (let k = 0; k <= dx; k++) {
    const y = c.y0 + (dy * k) / dx;
    px(g, c.x0 + k, y - 3, PAL.glass);
    px(g, c.x0 + k, y + 3, PAL.glass);
  }
  rect(g, c.x0 + 6, c.y0 - 8, 3, 6, "#3f6fb5"); // water hoses
  rect(g, c.x1 - 9, c.y1 + 3, 3, 6, "#3f6fb5");
  // Glass tubing, drawn as a pale line; the liquid runs inside it, per frame.
  const path = tubing(p);
  for (let i = 1; i < path.length; i++) line(g, path[i - 1][0], path[i - 1][1], path[i][0], path[i][1], PAL.glassDim);
  // The receiver, a flask under the outlet.
  flaskShape(g, p.receiver.x, p.receiver.y - FLASK_H, PAL.glass);
}

function crtHousing(g: G, p: Plan): void {
  const c = p.crt;
  rect(g, c.x, c.y, c.w, c.h, PAL.housing);
  rect(g, c.x, c.y + c.h - 2, c.w, 2, PAL.housingDark);
  rect(g, c.x + 1, c.y + 1, c.w - 2, 1, "#e2d6b4");
  rect(g, c.x + 5, c.y + 4, 44, 28, PAL.ink); // the screen's bezel
  rect(g, c.x + c.w - 4, c.y + c.h - 6, 2, 2, PAL.greenDim); // power light, off to one side
}

// ---------- sprites and moving parts, drawn per frame ----------

// An Erlenmeyer flask, w pixels wide at the base (odd), standing with its top-left at (x, y).
const FLASK = [
  "    ###    ",
  "    #.#    ",
  "    #.#    ",
  "    #.#    ",
  "   #...#   ",
  "   #...#   ",
  "  #.....#  ",
  "  #LLLLL#  ",
  " #LLLLLLL# ",
  " #LLLLLLL# ",
  "#LLLLLLLLL#",
  "#LLLLLLLLL#",
  "#LLLLLLLLL#",
  " ######### ",
];
export const FLASK_W = 11;
export const FLASK_H = FLASK.length;

export function flaskShape(g: G, x: number, y: number, glass: string, liquid?: string): void {
  FLASK.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === "#") px(g, x + c, y + r, glass);
      else if (ch === "." || (ch === "L" && !liquid)) px(g, x + c, y + r, "#0e1626");
      else if (ch === "L" && liquid) px(g, x + c, y + r, liquid);
    }
  });
}

// A project flask: glass, liquid, a highlight, and rising bubbles when the room is animated.
export function flask(g: G, x: number, y: number, liquid: string, t: number, seed: number): void {
  flaskShape(g, x, y, PAL.glass, liquid);
  px(g, x + 3, y + 10, "#ffffff88");
  for (let k = 0; k < 2; k++) {
    const phase = (t / 1400 + hash(seed, k)) % 1;
    const by = y + 12 - Math.floor(phase * 6);
    px(g, x + 3 + Math.floor(hash(seed, k + 5) * 5), by, "#ffffffaa");
  }
}

// The flask under the pointer or keyboard focus: a soft glow and selection corners, which pulse
// out a pixel with `beat`.
export function glow(g: G, x: number, y: number, colour: string, beat: number): void {
  g.globalAlpha = 0.18;
  rect(g, x - 2, y - 2, FLASK_W + 4, FLASK_H + 3, colour);
  g.globalAlpha = 1;
  const o = beat > 0 ? 1 : 0;
  const [l, r, t, b] = [x - 3 - o, x + FLASK_W + 2 + o, y - 3 - o, y + FLASK_H + 1 + o];
  for (const [cx, cy, sx, sy] of [
    [l, t, 1, 1],
    [r, t, -1, 1],
    [l, b, 1, -1],
    [r, b, -1, -1],
  ]) {
    rect(g, Math.min(cx, cx + 2 * sx), cy, 3, 1, colour);
    rect(g, cx, Math.min(cy, cy + 2 * sy), 1, 3, colour);
  }
}

export function neon(g: G, p: Plan, t: number): void {
  const flicker = hash(Math.floor(t / 90)) > 0.94 ? 0.35 : 1; // the magenta tube stutters now and then
  for (const [x, len, c, on] of [
    [p.x0 + 16, 72, PAL.magenta, flicker],
    [p.x0 + 228, 70, PAL.teal, 1],
  ] as const) {
    g.globalAlpha = 0.18 * on;
    rect(g, x - 3, p.top + 7, len + 6, 8, c);
    g.globalAlpha = on;
    rect(g, x, p.top + 10, len, 2, c);
    rect(g, x, p.top + 10, len, 1, PAL.white);
    g.globalAlpha = 1;
  }
}

export function flame(g: G, x: number, y: number, t: number, high: boolean): void {
  const f = Math.floor(t / 83) % 3;
  const tall = (high ? 9 : 6) + (f === 1 ? 1 : 0);
  for (let k = 0; k < tall; k++) {
    const w = Math.max(1, Math.round((1 - k / tall) * (high ? 5 : 4)));
    const c = k < tall * 0.45 ? "#3ea0ff" : k < tall * 0.75 ? "#8fd0ff" : PAL.amber;
    rect(g, x - Math.floor(w / 2) + (k > tall / 2 ? (f - 1) % 2 : 0), y - k, w, 1, c);
  }
}

// The boiling flask: round, with liquid of the given colour (or none) and bubbles.
export function roundFlask(g: G, p: Plan, liquid: string | null, t: number): void {
  const r = p.round;
  disc(g, r.x, r.y, r.r, PAL.glass);
  disc(g, r.x, r.y, r.r - 1, "#0e1626");
  rect(g, r.x - 2, r.y - r.r - 8, 5, 8, PAL.glass);
  rect(g, r.x - 1, r.y - r.r - 8, 3, 8, "#0e1626");
  if (liquid) {
    for (let y = 1; y < r.r; y++) {
      const w = Math.round(Math.sqrt((r.r - 1) ** 2 - y * y));
      rect(g, r.x - w, r.y + y, 2 * w + 1, 1, liquid);
    }
    for (let k = 0; k < 3; k++) {
      const phase = (t / 700 + k / 3) % 1;
      px(g, r.x - 3 + k * 3, r.y + 5 - Math.floor(phase * 5), "#ffffffcc");
    }
  }
  px(g, r.x - 4, r.y - 3, "#ffffff99");
}

// The condenser's coil inside its jacket: a zigzag, lit along its length up to `fill`.
export function coil(g: G, p: Plan, fill: number, colour: string): void {
  const c = p.condenser;
  const dx = c.x1 - c.x0;
  const dy = c.y1 - c.y0;
  for (let k = 0; k <= dx; k++) {
    const y = c.y0 + (dy * k) / dx + ((k % 6) < 3 ? -1 : 1);
    px(g, c.x0 + k, y, k / dx <= fill ? colour : PAL.glassDim);
  }
}

// Steam: a few pale puffs rising from (x, y) and fading.
export function steam(g: G, x: number, y: number, t: number, n: number, seed: number): void {
  for (let k = 0; k < n; k++) {
    const phase = (t / 1600 + k / n + hash(seed, k)) % 1;
    const sx = x + Math.round(Math.sin((phase + k) * 6) * 2);
    const sy = y - Math.round(phase * 14);
    g.globalAlpha = 0.5 * (1 - phase);
    rect(g, sx, sy, phase > 0.5 ? 2 : 1, phase > 0.5 ? 2 : 1, PAL.white);
  }
  g.globalAlpha = 1;
}

// Sparks now and then from a cable joint.
export function sparks(g: G, x: number, y: number, t: number): void {
  const beat = Math.floor(t / 120);
  if (hash(beat, 9) < 0.82) return;
  for (let k = 0; k < 4; k++) {
    px(g, x + Math.round((hash(beat, k) - 0.5) * 8), y + Math.round(hash(beat, k + 4) * 5), k % 2 ? PAL.yellow : PAL.white);
  }
}

// The oscilloscope's trace and the CRT's waveform and bars, moving with t.
export function scopeTrace(g: G, p: Plan, t: number): void {
  const s = p.scope;
  const x = s.x + 3;
  const y = s.y + 3;
  for (let gx = 0; gx < 32; gx += 8) rect(g, x + gx, y, 1, 22, "#0d2a14");
  for (let gy = 0; gy < 22; gy += 7) rect(g, x, y + gy, 32, 1, "#0d2a14");
  let last = 0;
  for (let k = 0; k < 32; k++) {
    const v = Math.round(11 + Math.sin(k / 3 + t / 260) * 6 * Math.sin(t / 1900 + 1));
    line(g, x + k - 1, y + (k ? last : v), x + k, y + v, PAL.green);
    last = v;
  }
}

export function crtScreen(g: G, p: Plan, t: number, text: string[] | null): void {
  const sx = p.crt.x + 7;
  const sy = p.crt.y + 6;
  rect(g, sx, sy, 42, 24, PAL.screen); // 7 characters by 3 lines
  if (text) {
    text.slice(0, 3).forEach((s, i) => drawText(g, s.slice(0, 7), sx, sy + i * 8, 1, i === 0 ? PAL.amber : PAL.green));
    return;
  }
  // A scrolling trace on top, bars of a graph below.
  let last = 0;
  for (let k = 0; k < 42; k++) {
    const v = Math.round(6 + Math.sin(k / 2.3 - t / 300) * 4 + Math.sin(k / 0.9 + t / 170));
    if (k) line(g, sx + k - 1, sy + last, sx + k, sy + v, PAL.green);
    last = v;
  }
  for (let k = 0; k < 7; k++) {
    const hgt = 3 + Math.round((Math.sin(t / 500 + k * 1.7) * 0.5 + 0.5) * 7);
    rect(g, sx + 2 + k * 6, sy + 23 - hgt, 4, hgt, k % 2 ? PAL.greenDim : PAL.green);
  }
}

// The window's stars and the lit windows across the city, changing slowly.
export function windowLights(g: G, p: Plan, t: number): void {
  const x = p.x0 + 100;
  const y = p.top + 17;
  for (let k = 0; k < 9; k++) {
    const sx = x + 2 + Math.floor(hash(k, 51) * 40);
    const sy = y + 2 + Math.floor(hash(k, 53) * 16);
    g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t / 900 + k * 1.7));
    px(g, sx, sy, PAL.white);
  }
  g.globalAlpha = 1;
  const beat = Math.floor(t / 2500);
  for (let bx = x, k = 0; bx < x + 66; k++) {
    const bw = 5 + Math.floor(hash(k, 31) * 7);
    const bh = 10 + Math.floor(hash(k, 37) * 20);
    for (let j = 0; j < 4; j++) {
      const wx = bx + 1 + Math.floor(hash(k, j + 60) * (bw - 2));
      const wy = y + 50 - bh + 2 + Math.floor(hash(k, j + 70) * (bh - 4));
      // Inside the frame, and not where the rig stands in front of the window.
      const free = wx < Math.min(x + 66, p.condenser.x0 - 2);
      if (free && hash(k * 7 + j, beat) > 0.45) px(g, wx, wy, j % 2 ? "#ffd27a" : "#7ee0ff");
    }
    bx += bw + (hash(k, 41) > 0.7 ? 1 : 0);
  }
}

// The red LED clock: the visitor's own time, the colon blinking.
export function clock(g: G, p: Plan, now: Date, t: number): void {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const colon = Math.floor(t / 500) % 2 === 0 ? ":" : " ";
  drawText(g, `${hh}${colon}${mm}`, p.x0 + 252, p.top + 18, 1, "#ff3b3b", "#3a0d12");
}

// The desk lamp's warm light, poured over the bench below its shade.
export function lampLight(g: G, p: Plan): void {
  const x = p.crt.x - 22;
  const y = p.bench.y - 33;
  const pool = g.createRadialGradient(x, y + 24, 2, x, y + 24, 70);
  pool.addColorStop(0, "rgba(255, 170, 80, 0.6)");
  pool.addColorStop(0.45, "rgba(255, 140, 60, 0.24)");
  pool.addColorStop(1, "rgba(255, 120, 40, 0)");
  g.globalCompositeOperation = "screen";
  g.fillStyle = pool;
  g.fillRect(x - 75, y - 10, 150, 90);
  g.globalCompositeOperation = "source-over";
  rect(g, x - 2, y + 1, 4, 1, "#fff2c8"); // the bulb
}

// The CRT's green light on the wall round it, which the cat on top sits against.
export function screenGlow(g: G, p: Plan): void {
  const cx = p.crt.x + p.crt.w / 2;
  const cy = p.crt.y + 10;
  const light = g.createRadialGradient(cx, cy, 4, cx, cy, 44);
  light.addColorStop(0, "rgba(80, 255, 140, 0.28)");
  light.addColorStop(1, "rgba(80, 255, 140, 0)");
  g.globalCompositeOperation = "screen";
  g.fillStyle = light;
  g.fillRect(cx - 46, cy - 46, 92, 92);
  g.globalCompositeOperation = "source-over";
}

// A soft light round a glowing flask.
export function flaskGlow(g: G, x: number, y: number, colour: string): void {
  g.globalAlpha = 0.16;
  rect(g, x - 2, y + 6, FLASK_W + 4, FLASK_H - 4, colour);
  g.globalAlpha = 0.08;
  rect(g, x - 4, y + 3, FLASK_W + 8, FLASK_H, colour);
  g.globalAlpha = 1;
}

// A black cat asleep on the CRT, curled up, its tail over the side. Now and then the tail's tip
// flicks or an ear twitches; it never moves otherwise.
const CAT = [
  "...#....#...............",
  "...##..##...............",
  "..########.....#######..",
  ".##########..##########.",
  "########################",
  "########################",
  ".######################.",
  "..####################..",
];
export function cat(g: G, p: Plan, t: number): void {
  const x = p.crt.x + 13;
  const y = p.crt.y - CAT.length;
  const beat = Math.floor(t / 250);
  const twitch = t > 0 && hash(beat, 81) > 0.97; // an ear, for a quarter second now and then
  const flick = t > 0 && hash(Math.floor(t / 400), 83) > 0.9 ? 1 : 0; // still: the resting pose
  const at = (r: number, c: number) => CAT[r]?.[c] === "#";
  CAT.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (!at(r, c)) continue;
      if (twitch && r === 0 && c === 3) continue;
      // The neon outlines it: an edge on the top or the sides catches the light.
      const rim = !at(r - 1, c) || !at(r, c - 1) || !at(r, c + 1);
      px(g, x + c, y + r, rim ? PAL.catRim : PAL.cat);
    }
  });
  // The tail, down the CRT's right side, its tip curling out when it flicks.
  for (let k = 0; k < 9; k++) {
    px(g, x + 22, y + 5 + k, PAL.cat);
    px(g, x + 23, y + 5 + k, PAL.catRim);
  }
  px(g, x + 21 - flick, y + 14, PAL.catRim);
  px(g, x + 22 - flick, y + 14, PAL.cat);
}

// ---------- the HUD frame and the screen overlay ----------

export interface Hud {
  projects: number;
  flagships: number;
  title: string;
  detail: string; // group and version or commit
  status: string;
  accent: string;
}

// Draws the bars and their text; returns the lines it wrote, for the tests.
export function hud(g: G, p: Plan, d: Hud): string[] {
  const { w, h } = p;
  const lines: string[] = [];
  const text = (s: string, x: number, y: number, c: string) => {
    drawText(g, s, x, y, 1, c);
    lines.push(s);
  };
  for (const [y, bh] of [
    [0, TOP_BAR],
    [h - BOTTOM_BAR, BOTTOM_BAR],
  ]) {
    rect(g, 0, y, w, bh, PAL.ink);
    rect(g, 0, y, w, 1, PAL.frame);
    rect(g, 0, y + bh - 1, w, 1, PAL.frame);
  }
  // Corner brackets round the play area, in the accent.
  const [l, r, t, b] = [1, w - 2, TOP_BAR + 1, h - BOTTOM_BAR - 2];
  for (const [cx, cy, sx, sy] of [
    [l, t, 1, 1],
    [r, t, -1, 1],
    [l, b, 1, -1],
    [r, b, -1, -1],
  ]) {
    rect(g, Math.min(cx, cx + 5 * sx), cy, 6, 1, d.accent);
    rect(g, cx, Math.min(cy, cy + 5 * sy), 1, 6, d.accent);
  }
  // Top bar: the lab's name, then the counts with small icons.
  text("LAB", 5, 5, d.accent);
  flaskIcon(g, 31, 4, PAL.green);
  text(`${d.projects} PROJECT${d.projects === 1 ? "" : "S"}`, 39, 5, PAL.green);
  gemIcon(g, 39 + 12 * ADVANCE + 4, 5, d.accent);
  text(`${d.flagships} FLAGSHIP${d.flagships === 1 ? "" : "S"}`, 39 + 12 * ADVANCE + 13, 5, d.accent);
  const open = "LAB OPEN";
  text(open, w - 5 - open.length * ADVANCE, 5, PAL.amber);
  // Bottom bar: the sample in hand, its version or commit, and the assay.
  if (d.title) {
    const room = Math.floor((w - 10) / ADVANCE);
    text(d.title.toUpperCase().slice(0, room), 5, h - BOTTOM_BAR + 4, PAL.green);
    text(d.detail.slice(0, room - d.status.length - 2), 5, h - BOTTOM_BAR + 13, PAL.green);
    if (d.status) text(d.status, w - 5 - d.status.length * ADVANCE, h - BOTTOM_BAR + 13, d.status.endsWith("DONE") ? PAL.green : PAL.amber);
  }
  return lines;
}

function flaskIcon(g: G, x: number, y: number, c: string): void {
  [".#.", ".#.", "#.#", "###"].forEach((row, r) => {
    for (let k = 0; k < 3; k++) if (row[k] === "#") rect(g, x + k * 2, y + r * 2, 2, 2, c);
  });
}

function gemIcon(g: G, x: number, y: number, c: string): void {
  [".#.", "###", ".#."].forEach((row, r) => {
    for (let k = 0; k < 3; k++) if (row[k] === "#") rect(g, x + k * 2, y + r * 2, 2, 2, c);
  });
}

// Scanlines and a vignette, made once per size and laid over every frame.
export function overlay(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d") as G;
  g.fillStyle = "rgba(0, 0, 0, 0.16)";
  for (let y = 1; y < h; y += 2) g.fillRect(0, y, w, 1);
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  v.addColorStop(0, "rgba(0, 0, 0, 0)");
  v.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  return c;
}
