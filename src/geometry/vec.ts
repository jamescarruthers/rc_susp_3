// Tiny immutable Vec3 helpers used by the geometry solver. Kept separate
// from Three.js so the solver can run under Node without pulling the whole
// renderer in.
export type Vec3 = readonly [number, number, number];

export const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

export const vadd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vlen = (a: Vec3): number => Math.sqrt(vdot(a, a));
export const vdist = (a: Vec3, b: Vec3): number => vlen(vsub(a, b));
export const vcross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vnorm = (a: Vec3): Vec3 => {
  const n = vlen(a);
  return n > 0 ? vscale(a, 1 / n) : a;
};

// 3×3 matrix as row-major tuple of three Vec3.
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export const m3mulv = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

// Intrinsic XYZ Euler angles → rotation matrix. Chosen over quaternion for
// the solver because its 3 parameters map 1:1 to the 3 rotational DOF we
// solve for, which keeps the Jacobian square.
export function eulerToMat3(rot: Vec3): Mat3 {
  const [a, b, c] = rot;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cc = Math.cos(c);
  const sc = Math.sin(c);
  // R = Rx(a) · Ry(b) · Rz(c)
  return [
    [cb * cc, -cb * sc, sb],
    [sa * sb * cc + ca * sc, -sa * sb * sc + ca * cc, -sa * cb],
    [-ca * sb * cc + sa * sc, ca * sb * sc + sa * cc, ca * cb],
  ] as const;
}
