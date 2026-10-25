// An original 5x7 bitmap font, as data, for every label and display in the 3D scenes. Each glyph
// is seven rows, top to bottom, one base-32 digit per row; of a row's five bits, 16 is the
// leftmost column. Unknown characters draw as "?".
const GLYPHS: Record<string, string> = {
  A: "ehhvhhh", B: "uhhuhhu", C: "ehggghe", D: "sihhhis", E: "vgguggv", F: "vgguggg",
  G: "ehgnhhf", H: "hhhvhhh", I: "e44444e", J: "72222ic", K: "hikokih", L: "ggggggv",
  M: "hrllhhh", N: "hhpljhh", O: "ehhhhhe", P: "uhhuggg", Q: "ehhhlid", R: "uhhukih",
  S: "fgge11u", T: "v444444", U: "hhhhhhe", V: "hhhhha4", W: "hhhllla", X: "hha4ahh",
  Y: "hhha444", Z: "v1248gv",
  "0": "ehhlhhe", "1": "4c4444e", "2": "eh1248v", "3": "v2421he", "4": "26aiv22",
  "5": "vgu11he", "6": "68guhhe", "7": "v124888", "8": "ehhehhe", "9": "ehhf12c",
  " ": "0000000", "-": "000v000", ".": "00000cc", "/": "01248g0", ":": "0cc0cc0",
  "(": "2488842", ")": "8422248", "+": "044v440", "?": "eh12404",
};

export const ADVANCE = 6; // columns per character, gap included

// Draws text with each lit dot as a `dot`-pixel square on a `pitch`-pixel grid. With `off`, the
// unlit dots are drawn too, as on a dot-matrix display.
export function drawText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  pitch: number,
  on: string,
  off?: string,
  dot = pitch,
): void {
  [...text.toUpperCase()].forEach((ch, i) => {
    const rows = GLYPHS[ch] ?? GLYPHS["?"];
    for (let r = 0; r < 7; r++) {
      const bits = parseInt(rows[r], 32);
      for (let c = 0; c < 5; c++) {
        const lit = bits & (16 >> c);
        if (!lit && !off) continue;
        g.fillStyle = lit ? on : (off as string);
        g.fillRect(x + (i * ADVANCE + c) * pitch, y + r * pitch, dot, dot);
      }
    }
  });
}

// Upper-cased lines of at most `width` characters, broken after hyphens and at spaces.
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const piece of text.toUpperCase().split(/(?<=-)|(?= )/)) {
    if ((line + piece).length <= width) line += piece;
    else {
      if (line) lines.push(line);
      line = piece.trimStart();
    }
  }
  if (line) lines.push(line);
  return lines.flatMap((l) => l.match(new RegExp(`.{1,${width}}`, "g")) ?? []);
}

// A 5x5 mark, mirrored left to right, from an FNV-1a hash of the id, so every object has its own.
export function mark(g: CanvasRenderingContext2D, id: string, x: number, y: number, pitch: number, color: string): void {
  let h = 0x811c9dc5;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  g.fillStyle = color;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      if (!((h >> (r * 3 + c)) & 1)) continue;
      g.fillRect(x + c * pitch, y + r * pitch, pitch, pitch);
      g.fillRect(x + (4 - c) * pitch, y + r * pitch, pitch, pitch);
    }
  }
}
