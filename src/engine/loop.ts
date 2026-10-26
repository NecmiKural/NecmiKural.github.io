// Render on demand: one requestAnimationFrame loop that runs only while a tween is active or a
// frame was requested, so an idle scene draws nothing. A scene may add a slow ambient animation,
// which runs only while the engine allows it (a visible tab, low power off) and never under
// reduced motion.

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const linear = (t: number) => t;

export function createLoop(render: () => void, reduced: boolean, onError: () => void) {
  const tasks = new Set<(now: number) => boolean>();
  let dirty = false;
  let raf = 0;
  let snap = false;
  let stopped = false;
  // When the tweens that ended this frame ended. The steps that follow them are asked for in
  // promise callbacks, after the frame and before any other task, which then clears it.
  let ended: number | null = null;
  const forget = () => {
    ended = null;
  };
  // The ambient animation: a tick a few times a second, each followed by a frame.
  let ambient: ((now: number) => void) | null = null;
  let ambientMs = 0;
  let allowed = false;
  let due = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    timer = undefined;
    due = true;
    invalidate();
  };
  const rest = () => {
    clearTimeout(timer);
    timer = undefined;
    due = false;
  };

  const frame = (now: number) => {
    raf = 0;
    ended = null;
    try {
      if (due && ambient && allowed) {
        due = false;
        ambient(now);
        dirty = true;
      }
      for (const task of [...tasks]) if (task(now)) tasks.delete(task);
      if (ended !== null) setTimeout(forget);
      if (dirty) {
        dirty = false;
        render();
      }
    } catch {
      tasks.clear();
      onError(); // a scene or renderer error powers off instead of freezing mid-animation
      return;
    }
    if (tasks.size) raf = requestAnimationFrame(frame);
    if (ambient && allowed && !timer && !stopped) timer = setTimeout(wake, ambientMs);
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
    // The clock starts when the tween is asked for, not at the next frame, and the next step of a
    // sequence starts where the last one ended, not at the frame that saw it end. A step that slow
    // frames have already carried past ends at once. A sequence then takes its designed time plus
    // about a frame, however slow the frames are.
    const start = ended ?? performance.now();
    if (performance.now() - start >= ms) {
      step(1);
      invalidate();
      // After this turn, so steps asked for alongside this one still start where it did.
      queueMicrotask(() => {
        ended = Math.max(ended ?? 0, start + ms);
      });
      return Promise.resolve();
    }
    return new Promise((done) => {
      tasks.add((now) => {
        const t = snap ? 1 : Math.min(1, Math.max(0, now - start) / ms);
        step(ease(t));
        dirty = true;
        if (t === 1) {
          ended = Math.max(ended ?? 0, Math.min(start + ms, now));
          done();
        }
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
    // A scene's ambient animation, fps ticks a second; null removes it (a new scene comes in).
    setAmbient(fps: number, tick: ((now: number) => void) | null) {
      rest();
      ambient = tick;
      ambientMs = 1000 / fps;
      if (tick && allowed) wake();
    },
    // Whether the ambient animation may run: the engine's say (a visible tab, low power off).
    allowAmbient(on: boolean) {
      const was = allowed;
      allowed = on && !reduced;
      if (!allowed) rest();
      else if (!was && ambient) wake();
    },
    // Pending tweens never resolve after this, so an interrupted animation cannot touch the page.
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      rest();
      tasks.clear();
    },
  };
}
