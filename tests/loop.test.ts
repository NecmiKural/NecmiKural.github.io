// The render loop's tweens, on a fake clock with slow frames (as in software rendering).
//   node --test tests/loop.test.ts   (part of npm run check)

import assert from "node:assert/strict";
import { test } from "node:test";

let clock = 0;
let frames: ((now: number) => void)[] = [];
Object.assign(globalThis, {
  performance: { now: () => clock },
  requestAnimationFrame: (f: (now: number) => void) => frames.push(f),
  cancelAnimationFrame: () => {},
});
const { createLoop } = await import("../src/engine/loop.ts");

// Advances the clock a frame at a time until `done()`, letting promise continuations run between
// frames as a browser does. Returns the time it took.
async function run(frame: number, done: () => boolean): Promise<number> {
  const begin = clock;
  while (!done() && clock - begin < 60_000) {
    clock += frame;
    const due = frames;
    frames = [];
    for (const f of due) f(clock);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return clock - begin;
}

test("a sequence of tweens takes its designed time plus at most a frame, however slow the frames", async () => {
  const loop = createLoop(() => {}, false, () => assert.fail("loop error"));
  let finished = false;
  void (async () => {
    for (let k = 0; k < 4; k++) await loop.tween(300, () => {});
    finished = true;
  })();
  // 1200 ms designed, 250 ms frames. A step clocked from when it was asked for took 2000 ms; one
  // clocked from its first frame took 3000 ms.
  assert.equal(await run(250, () => finished), 1250);
});

test("steps shorter than a frame do not cost a frame each", async () => {
  // The Glovebox insert: 1660 ms designed, with steps that run side by side.
  for (const frame of [100, 250, 500, 700]) {
    const loop = createLoop(() => {}, false, () => assert.fail("loop error"));
    const t = (ms: number) => loop.tween(ms, () => {});
    let finished = false;
    void (async () => {
      await Promise.all([t(90), t(420)]);
      await t(100);
      await t(300);
      await Promise.all([t(110), t(160)]);
      await t(140);
      await t(380);
      void t(160);
      void t(120);
      await t(160);
      finished = true;
    })();
    const took = await run(frame, () => finished);
    assert.ok(took <= 1660 + frame, `${took} ms at ${frame} ms frames`);
  }
});

test("a tween asked for after the loop has been idle starts then, not in the past", async () => {
  const loop = createLoop(() => {}, false, () => assert.fail("loop error"));
  let finished = false;
  void loop.tween(100, () => {}).then(() => (finished = true));
  await run(250, () => finished);
  await new Promise((resolve) => setTimeout(resolve, 5));
  clock += 5000;
  finished = false;
  void loop.tween(1000, () => {}).then(() => (finished = true));
  assert.equal(await run(250, () => finished), 1000);
});

test("a tween longer than a frame ends at the first frame after its time is up", async () => {
  const loop = createLoop(() => {}, false, () => assert.fail("loop error"));
  let finished = false;
  void loop.tween(1000, () => {}).then(() => (finished = true));
  assert.equal(await run(250, () => finished), 1000); // not 1250
});

test("under reduced motion a tween ends at once", async () => {
  const loop = createLoop(() => {}, true, () => assert.fail("loop error"));
  let last = -1;
  await loop.tween(1000, (t) => (last = t));
  assert.equal(last, 1);
});
