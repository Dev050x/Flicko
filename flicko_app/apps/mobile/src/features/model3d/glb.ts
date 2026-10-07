/*
 * Minimal GLB reader for the filter models: static, untextured triangle meshes whose
 * colour comes from the material's base colour (+ emissive). Node transforms are baked
 * in, so a model is one flat triangle list with a colour per triangle.
 */
export interface Model {
  /** x y z per vertex, model units, +Y up, +Z toward the viewer */
  positions: Float32Array;
  /** three vertex indices per triangle */
  indices: Uint32Array;
  /** r g b (0..1, display space) per triangle */
  colors: Float32Array;
  min: [number, number, number];
  max: [number, number, number];
}

type Mat = number[]; // 4x4 column-major

const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const mul = (a: Mat, b: Mat): Mat => {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};

const nodeMatrix = (n: {
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}): Mat => {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
};

const toDisplay = (linear: number) => Math.pow(Math.min(1, Math.max(0, linear)), 1 / 2.2);

export const parseGlb = (bytes: Uint8Array): Model => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB file");
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)),
  );
  const binStart = 20 + jsonLength + 8;

  const read = (accessorIndex: number): number[] => {
    const a = json.accessors[accessorIndex];
    const bv = json.bufferViews[a.bufferView];
    const parts = { SCALAR: 1, VEC3: 3 }[a.type as "SCALAR" | "VEC3"];
    const size = a.componentType === 5126 || a.componentType === 5125 ? 4 : 2;
    const stride = bv.byteStride || parts * size;
    const base = binStart + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const out: number[] = [];
    for (let i = 0; i < a.count; i++)
      for (let p = 0; p < parts; p++) {
        const at = base + i * stride + p * size;
        out.push(
          a.componentType === 5126
            ? view.getFloat32(at, true)
            : a.componentType === 5125
              ? view.getUint32(at, true)
              : view.getUint16(at, true),
        );
      }
    return out;
  };

  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];

  const visit = (index: number, parent: Mat) => {
    const node = json.nodes[index];
    const world = mul(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        const src = read(prim.attributes.POSITION);
        const first = positions.length / 3;
        for (let i = 0; i < src.length; i += 3) {
          const [x, y, z] = [src[i], src[i + 1], src[i + 2]];
          positions.push(
            world[0] * x + world[4] * y + world[8] * z + world[12],
            world[1] * x + world[5] * y + world[9] * z + world[13],
            world[2] * x + world[6] * y + world[10] * z + world[14],
          );
        }
        const mat = json.materials?.[prim.material];
        const base = mat?.pbrMetallicRoughness?.baseColorFactor ?? [0.8, 0.8, 0.8];
        const glow = mat?.emissiveFactor ?? [0, 0, 0];
        const rgb = [0, 1, 2].map((c) => toDisplay(base[c] + glow[c]));
        const tri = prim.indices !== undefined
          ? read(prim.indices)
          : Array.from({ length: src.length / 3 }, (_, i) => i);
        for (const t of tri) indices.push(first + t);
        for (let t = 0; t < tri.length; t += 3) colors.push(...rgb);
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of json.scenes[json.scene ?? 0].nodes) visit(root, IDENTITY);

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const c = i % 3;
    min[c] = Math.min(min[c], positions[i]);
    max[c] = Math.max(max[c], positions[i]);
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    colors: new Float32Array(colors),
    min,
    max,
  };
};
