// Sound through the Web Audio API: short motifs of oscillator and noise voices, defined as data.
// Off by default. The AudioContext is created only for the first sound after the visitor turns
// sound on, which happens inside a click, and the choice is kept in localStorage.

// A voice is a tone (hz, gliding to `to`) or, with `noise`, white noise through a lowpass at that
// cutoff (sweeping to `sweep`). `lfo` wobbles the volume at that rate. Times are in seconds.
export interface Voice {
  at?: number;
  dur: number;
  vol?: number;
  wave?: OscillatorType;
  hz?: number;
  to?: number;
  noise?: number;
  sweep?: number;
  lfo?: number;
}
// Every motif on the site has at most 4 tones; noise voices are not counted as notes.
export type Motif = readonly Voice[];

const KEY = "nk.sound";
const LEVEL = 0.2;

export const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
export const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the setting then lasts for this visit only.
  }
};

export function createSound() {
  let on = read(KEY) === "on";
  let ctx: AudioContext | undefined;
  let out: GainNode;
  let noise: AudioBuffer;

  const wake = (): AudioContext | undefined => {
    if (!on) return undefined;
    if (!ctx) {
      ctx = new AudioContext();
      out = ctx.createGain();
      out.gain.value = LEVEL;
      out.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      noise.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
    }
    out.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.01);
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };

  const voice = (c: AudioContext, v: Voice, t: number) => {
    const end = t + v.dur;
    const vol = v.vol ?? 0.15;
    const gain = c.createGain();
    // Exponential ramps never reach 0, so they start and end at 0.0001.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(out);
    let source: AudioScheduledSourceNode;
    if (v.noise) {
      const buffer = c.createBufferSource();
      const filter = c.createBiquadFilter();
      buffer.buffer = noise;
      filter.frequency.setValueAtTime(v.noise, t);
      if (v.sweep) filter.frequency.exponentialRampToValueAtTime(v.sweep, end);
      buffer.connect(filter).connect(gain);
      source = buffer;
    } else {
      const osc = c.createOscillator();
      osc.type = v.wave ?? "square";
      osc.frequency.setValueAtTime(v.hz ?? 440, t);
      if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, end);
      osc.connect(gain);
      source = osc;
    }
    if (v.lfo) {
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = v.lfo;
      depth.gain.value = vol / 2;
      lfo.connect(depth).connect(gain.gain);
      lfo.start(t);
      lfo.stop(end + 0.02);
    }
    source.start(t);
    source.stop(end + 0.02);
  };

  return {
    get on() {
      return on;
    },
    play(motif: Motif) {
      try {
        const c = wake();
        if (!c) return;
        const t = c.currentTime + 0.01;
        for (const v of motif) voice(c, v, t + (v.at ?? 0));
      } catch {
        // Sound is optional: a browser that refuses Web Audio leaves 3D mode silent, not broken.
      }
    },
    toggle(): boolean {
      on = !on;
      write(KEY, on ? "on" : "off");
      if (!on && ctx) out.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
      return on;
    },
    // Lets a power-off motif finish, then stops the audio clock until the next sound.
    sleep(afterMs = 0) {
      setTimeout(() => void ctx?.suspend(), afterMs);
    },
  };
}
