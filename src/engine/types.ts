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
}

// What the engine gives a scene.
export interface Stage {
  invalidate(): void; // draw one frame; nothing is drawn otherwise
  // Animates over ms, calling step with an eased 0..1. Snaps to 1 under reduced motion or a skip.
  tween(ms: number, step: (t: number) => void, ease?: (t: number) => number): Promise<void>;
  play(motif: Motif): void; // silent unless the visitor turned sound on
  readonly lowPower: boolean;
}

// A scene owns its world, camera and animations. Objects that stand for a project carry
// userData.id, which the engine uses for pointer picking.
export interface Scene {
  readonly world: World;
  readonly camera: Camera;
  build(projects: readonly Project[]): void;
  layout(aspect: number): void; // also re-reads stage.lowPower
  focus(id: string | null): void;
  insert(id: string): Promise<void>;
  eject(): Promise<void>;
  dispose(): void;
}

export type CreateScene = (stage: Stage) => Scene;
