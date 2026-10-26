// The visual parsers in scripts/render.ts, on small hand-made images.
//   node --test tests/render.test.ts   (part of npm run check)

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { BANNER, firstFrame, imageSize, svgSize } from "../scripts/render.ts";

// A 2 x 1 GIF: header, screen descriptor with a two-colour global table, then the given blocks.
const gif = (...blocks: number[][]) =>
  Uint8Array.from([...Buffer.from("GIF89a"), 2, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255, ...blocks.flat()]);
const control = [0x21, 0xf9, 4, 0, 10, 0, 0, 0]; // a graphic control extension
const loop = [0x21, 0xff, 11, ...Buffer.from("NETSCAPE2.0"), 3, 1, 0, 0, 0]; // an application extension
const image = (local = false) => [
  0x2c, 0, 0, 0, 0, 2, 0, 1, 0, local ? 0x80 : 0, ...(local ? [1, 2, 3, 4, 5, 6] : []), // descriptor (+ local table)
  2, 2, 0x44, 0x01, 1, 0x05, 0, // LZW size, two data sub-blocks, the empty one
];

test("the first frame is everything up to the end of the first image, then the trailer", () => {
  const first = gif(loop, control, image());
  const whole = gif(loop, control, image(), control, image(true), [0x3b]);
  assert.deepEqual(firstFrame(whole, "t"), Uint8Array.from([...first, 0x3b]));
});

test("a first image with its own colour table is cut after its data", () => {
  const first = gif(image(true));
  assert.deepEqual(firstFrame(gif(image(true), image(), [0x3b]), "t"), Uint8Array.from([...first, 0x3b]));
});

test("a truncated GIF or one with no image fails with a clear message, never hangs", () => {
  const whole = gif(control, image(), [0x3b]);
  for (let cut = 14; cut < whole.length - 1; cut++) {
    assert.throws(() => firstFrame(whole.subarray(0, cut), "t"), /t: (truncated GIF|no image in the GIF)/, `cut at ${cut}`);
  }
  assert.throws(() => firstFrame(gif(control, [0x3b]), "t"), /no image/);
});

test("a large first frame is cut without running out of stack", () => {
  const data = Array.from({ length: 2000 }, () => [255, ...new Array(255).fill(0)]).flat(); // about 500 KB
  const big = gif([0x2c, 0, 0, 0, 0, 2, 0, 1, 0, 0, 2, ...data, 0], [0x3b]);
  assert.equal(firstFrame(big, "t").length, big.length);
});

test("sizes come from the PNG and GIF headers and the SVG viewBox, and a zero size is refused", () => {
  const png = Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n\x1a\n\0\0\0\rIHDR"), Buffer.alloc(8)]);
  png.writeUInt32BE(1920, 16);
  png.writeUInt32BE(1080, 20);
  assert.deepEqual(imageSize(png, "t"), { kind: "png", width: 1920, height: 1080 });
  assert.deepEqual(imageSize(gif(image()), "t"), { kind: "gif", width: 2, height: 1 });
  assert.deepEqual(imageSize(Buffer.from('<svg viewBox="0,0,300,130.4"></svg>'), "t"), { kind: "svg", width: 300, height: 130 });
  assert.throws(() => imageSize(png.subarray(0, 20), "t"), /truncated PNG/);
  assert.throws(() => imageSize(Uint8Array.from([...Buffer.from("GIF89a"), 0, 0, 0, 0]), "t"), /no size in the gif header/);
  assert.throws(() => imageSize(Buffer.from("<html>not found</html>"), "t"), /not an SVG/);
});

test("the banners are the size the page reserves for them", () => {
  for (const scheme of ["light", "dark"]) {
    assert.deepEqual(svgSize(readFileSync(`public/assets/banner-${scheme}.svg`, "utf8"), scheme), BANNER);
  }
});
