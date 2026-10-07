import type { Model } from "./glb";

/*
 * Draws a model as flat-shaded triangles in 2D: rotate by the head pose, cull the faces
 * turned away, sort far to near (painter's algorithm) and light each face from the
 * upper left. Pure maths, shared by the live preview and the captured photo.
 */
export interface ModelPose {
  /** where the model's origin lands, view/photo pixels */
  x: number;
  y: number;
  /** pixels per model unit */
  scale: number;
  /** degrees; roll is clockwise on screen */
  yaw: number;
  pitch: number;
  roll: number;
  /** model-space shift applied before the rotation (pivot), model units */
  pivot?: [number, number, number];
}

export interface Projected {
  /** x y per vertex, three vertices per triangle */
  points: Float32Array;
  /** r g b a per vertex (0..1) */
  colors: Float32Array;
  triangles: number;
}

const LIGHT = (() => {
  const v = [-0.4, 0.6, 0.7];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / l);
})();
const AMBIENT = 0.5;

const rad = (d: number) => (d * Math.PI) / 180;

export const projectModel = (model: Model, pose: ModelPose): Projected => {
  const { positions, indices, colors } = model;
  const count = positions.length / 3;
  const [px, py, pz] = pose.pivot ?? [0, 0, 0];

  const cy = Math.cos(rad(pose.yaw));
  const sy = Math.sin(rad(pose.yaw));
  const cp = Math.cos(rad(pose.pitch));
  const sp = Math.sin(rad(pose.pitch));
  const cr = Math.cos(rad(pose.roll));
  const sr = Math.sin(rad(pose.roll));

  // rotated model-space (x right, y up, z toward viewer), before the screen roll
  const rx = new Float32Array(count);
  const ry = new Float32Array(count);
  const rz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3] - px;
    const y = positions[i * 3 + 1] - py;
    const z = positions[i * 3 + 2] - pz;
    const x1 = x * cy + z * sy; // yaw about Y
    const z1 = -x * sy + z * cy;
    rx[i] = x1;
    ry[i] = y * cp - z1 * sp; // pitch about X
    rz[i] = y * sp + z1 * cp;
  }

  const tris: { index: number; depth: number; shade: number }[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    const ux = rx[b] - rx[a];
    const uy = ry[b] - ry[a];
    const uz = rz[b] - rz[a];
    const vx = rx[c] - rx[a];
    const vy = ry[c] - ry[a];
    const vz = rz[c] - rz[a];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    if (nz <= 0) continue; // facing away
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const lit = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    tris.push({
      index: t,
      depth: (rz[a] + rz[b] + rz[c]) / 3,
      shade: AMBIENT + (1 - AMBIENT) * lit,
    });
  }
  tris.sort((p, q) => p.depth - q.depth); // far first

  const points = new Float32Array(tris.length * 6);
  const out = new Float32Array(tris.length * 12);
  tris.forEach((tri, n) => {
    for (let k = 0; k < 3; k++) {
      const v = indices[tri.index + k];
      // screen: y flips, then roll clockwise
      const x = rx[v] * pose.scale;
      const y = -ry[v] * pose.scale;
      points[n * 6 + k * 2] = pose.x + x * cr - y * sr;
      points[n * 6 + k * 2 + 1] = pose.y + x * sr + y * cr;
      const ci = (tri.index / 3) * 3;
      out[n * 12 + k * 4] = Math.min(1, colors[ci] * tri.shade);
      out[n * 12 + k * 4 + 1] = Math.min(1, colors[ci + 1] * tri.shade);
      out[n * 12 + k * 4 + 2] = Math.min(1, colors[ci + 2] * tri.shade);
      out[n * 12 + k * 4 + 3] = 1;
    }
  });
  return { points, colors: out, triangles: tris.length };
};
