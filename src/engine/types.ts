// The contract between the engine (dialogs, rail, sound, rendering) and each 3D scene.

import type { Camera, Scene as World } from "three";
import type { Motif } from "./sound.ts";

// One project, read from its article on the page: the 3D mode shows exactly what the HTML shows.
export interface Project {
  id: string;
  title: string;
  group: string; // flagship, software, coursework or open-source
  groupName: string; // the section heading on the page
  label?: string; // cassette label of a flagship: RECON, RAG, MCP
  tag?: string; // release tag, such as v1.1.0
  ref?: string; // where the page's numbers are quoted from: the tag, or a short commit
}

// What the engine gives a scene.
export interface Stage {
  invalidate(): void; // draw one frame; nothing is drawn otherwise
  // Animates over ms, calling step with an eased 0..1. Snaps to 1 under reduced motion or a skip.
  tween(ms: number, step: (t: number) => void, ease?: (t: number) => number): Promise<void>;
  play(motif: Motif): void; // silent unless the visitor turned sound on
  // Text the scene draws into its picture (a HUD, a display), for the tests: the canvas carries it
  // as data-caption, as it carries data-held and data-frames.
  caption(text: string): void;
  // A slow ambient animation: tick is called about fps times a second with the time in ms, and a
  // frame is drawn after each. It runs only while the tab is visible and low power is off, and
  // never with reduced motion; otherwise the scene stays still on its last frame.
  ambient(fps: number, tick: (now: number) => void): void;
  readonly lowPower: boolean;
}

// A scene owns its world, camera and animations. Objects that stand for a project carry
// userData.id, which the engine uses for pointer picking.
export interface Scene {
  readonly world: World;
  readonly camera: Camera;
  // When set, the scene renders at least this many pixels across and down, keeping the canvas's
  // shape (pixelGrid in kit.ts), and the browser scales them up without smoothing: pixel art.
  readonly pixels?: { width: number; height: number };
  build(projects: readonly Project[]): void;
  layout(aspect: number): void; // also re-reads stage.lowPower
  focus(id: string | null): void;
  insert(id: string): Promise<void>;
  eject(): Promise<void>;
  dispose(): void;
}

export type CreateScene = (stage: Stage) => Scene;
