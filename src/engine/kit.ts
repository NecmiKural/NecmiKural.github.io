// Building blocks the scenes share: toon materials, outlines, planes cut from a label atlas, the
// camera fit and cleanup.

import {
  BackSide,
  Box3,
  DataTexture,
  InstancedMesh,
  Line,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type PerspectiveCamera,
} from "three";
import type { Stage } from "./types.ts";

// The band colour of each project group, the same in every scene.
// The render size of a pixel-art scene: at least min across and down, in the canvas's shape. The
// engine sizes the buffer with it and the scene lays out with it, so both agree.
export function pixelGrid(min: { width: number; height: number }, aspect: number): { width: number; height: number } {
  return {
    width: Math.round(Math.max(min.width, min.height * aspect)),
    height: Math.round(Math.max(min.height, min.width / aspect)),
  };
}

export const GROUP_COLOURS: Record<string, string> = {
  flagship: "#e8a33d",
  software: "#3f7cac",
  coursework: "#5c9e6e",
  "open-source": "#9a8fbf",
};

// Three-band toon shading, no textures: returns a material maker that shares one gradient map.
export function toonMaker(): { toon: (color: string) => MeshToonMaterial; bands: DataTexture } {
  const bands = new DataTexture(new Uint8Array([60, 140, 255]), 3, 1, RedFormat);
  bands.minFilter = bands.magFilter = NearestFilter;
  bands.needsUpdate = true;
  return { bands, toon: (color) => new MeshToonMaterial({ color, gradientMap: bands }) };
}

// Inverted-hull outline: the mesh again, inside out and a little larger. Not pickable.
export function outline(mesh: Mesh, color: string, thickness: number): Mesh {
  mesh.geometry.computeBoundingBox();
  const size = (mesh.geometry.boundingBox as Box3).getSize(new Vector3());
  const hull = new Mesh(mesh.geometry, new MeshBasicMaterial({ color, side: BackSide }));
  hull.scale.set(1 + (2 * thickness) / size.x, 1 + (2 * thickness) / size.y, 1 + (2 * thickness) / size.z);
  hull.raycast = () => {};
  mesh.add(hull);
  return hull;
}

// A w x h plane that shows one rectangle (in pixels) of a square atlas canvas `size` pixels wide.
export type Rect = readonly [x: number, y: number, w: number, h: number];
export function atlasPlane(w: number, h: number, [x, y, rw, rh]: Rect, size: number): BufferGeometry {
  const g = new PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (x + uv.getX(i) * rw) / size, 1 - (y + (1 - uv.getY(i)) * rh) / size);
  }
  return g;
}

// Frames the boxes' corners from a fixed viewing direction (`view`, from the scene towards the
// camera), as tight as the aspect allows. A few passes re-centre the target on what the camera
// actually sees.
export function fit(camera: PerspectiveCamera, boxes: Box3[], aspect: number, view: Vector3): void {
  const corners = boxes.flatMap((box) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map(
      (i) => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z),
    ),
  );
  const target = new Box3().setFromPoints(corners).getCenter(new Vector3());
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const tanH = tanV * aspect;
  camera.aspect = aspect;
  camera.position.copy(target).add(view);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  let distance = 0;
  for (let pass = 0; ; pass++) {
    const q = corners.map((c) => c.clone().sub(target));
    distance = Math.max(
      ...q.map((v) => v.dot(view) + Math.max(Math.abs(v.dot(right)) / tanH, Math.abs(v.dot(up)) / tanV)),
    );
    if (pass === 3) break;
    // Screen position of each corner, -1..1 across the view; then move the target to the middle.
    const xs = q.map((v) => v.dot(right) / ((distance - v.dot(view)) * tanH));
    const ys = q.map((v) => v.dot(up) / ((distance - v.dot(view)) * tanV));
    target
      .addScaledVector(right, ((Math.min(...xs) + Math.max(...xs)) / 2) * distance * tanH)
      .addScaledVector(up, ((Math.min(...ys) + Math.max(...ys)) / 2) * distance * tanV);
  }
  distance *= 1.04;
  camera.position.copy(target).addScaledVector(view, distance);
  camera.near = distance / 20;
  camera.far = distance * 6;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(); // picking can run before the first frame renders
}

// The bounds of what is drawn. Invisible helpers (pick targets, a hidden cord or ring) do not count,
// unlike Box3.setFromObject.
export function drawnBox(root: Object3D): Box3 {
  root.updateWorldMatrix(true, true);
  const box = new Box3();
  root.traverseVisible((o) => {
    if (!(o instanceof Mesh || o instanceof Line)) return;
    if (o instanceof InstancedMesh) o.computeBoundingBox();
    else o.geometry.computeBoundingBox();
    const local = o instanceof InstancedMesh ? o.boundingBox : o.geometry.boundingBox;
    if (local && !local.isEmpty()) box.union(local.clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}

// Eases how far each object is pulled out (0..1) and calls `apply` with the amount. A newer pull
// on the same object supersedes one still running, so a quick change of focus cannot leave an
// object stuck out.
export function slides(stage: Stage, apply: (id: string, amount: number) => void) {
  const amount = new Map<string, number>();
  const goal = new Map<string, number>();
  return {
    pull(id: string, to: number) {
      if ((goal.get(id) ?? 0) === to) return;
      goal.set(id, to);
      const from = amount.get(id) ?? 0;
      void stage.tween(140, (t) => {
        if (goal.get(id) !== to) return;
        amount.set(id, from + (to - from) * t);
        apply(id, amount.get(id) as number);
      });
    },
    reset(id: string) {
      goal.set(id, 0);
      amount.set(id, 0);
    },
  };
}

// Frees every geometry and material of the meshes and lines under the root, plus any extra
// resources (textures).
export function disposeAll(root: Object3D, extra: { dispose(): void }[]): void {
  const owned = new Set<{ dispose(): void }>(extra);
  root.traverse((o) => {
    if (!(o instanceof Mesh || o instanceof Line)) return;
    if (o instanceof InstancedMesh) owned.add(o); // frees its instance buffers
    owned.add(o.geometry);
    for (const m of [o.material].flat() as Material[]) owned.add(m);
  });
  for (const x of owned) x.dispose();
}
