// Render on demand: one requestAnimationFrame loop that runs only while a tween is active or a
// frame was requested, so an idle scene draws nothing.

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const linear = (t: number) => t;

export function createLoop(render: () => void, reduced: boolean) {
  const tasks = new Set<(now: number) => boolean>();
  let dirty = false;
  let raf = 0;
  let snap = false;
  let stopped = false;

  const frame = (now: number) => {
    raf = 0;
    for (const task of [...tasks]) if (task(now)) tasks.delete(task);
    if (dirty) {
      dirty = false;
      render();
    }
    if (tasks.size) raf = requestAnimationFrame(frame);
  };

  const invalidate = () => {
    dirty = true;
    if (!raf && !stopped) raf = requestAnimationFrame(frame);
  };

  const tween = (ms: number, step: (t: number) => void, ease = easeOut): Promise<void> => {
    if (reduced || snap || ms <= 0) {
      step(1);
      invalidate();
      return Promise.resolve();
    }
    return new Promise((done) => {
      let start = -1;
      tasks.add((now) => {
        if (start < 0) start = now;
        const t = snap ? 1 : Math.min(1, (now - start) / ms);
        step(ease(t));
        dirty = true;
        if (t === 1) done();
        return t === 1;
      });
      invalidate();
    });
  };

  return {
    invalidate,
    tween,
    // While on, running tweens end on the next frame and new ones snap: a second Enter skips ahead.
    skip(on: boolean) {
      snap = on;
    },
    // Pending tweens never resolve after this, so an interrupted animation cannot touch the page.
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      tasks.clear();
    },
  };
}
