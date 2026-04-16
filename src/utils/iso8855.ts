import * as THREE from 'three';

// ISO 8855 (MuJoCo-style vehicle frame): X forward, Y left, Z up.
// Three.js default: X right, Y up, Z into screen (right-handed: Z toward camera).
// We map MuJoCo (x, y, z) -> Three (x, z, -y).

export function mjToThreePos(mj: ArrayLike<number>, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(mj[0], mj[2], -mj[1]);
}

// Convert a MuJoCo quaternion (w, x, y, z) into a Three.js quaternion after
// applying the frame rotation that maps MuJoCo axes to Three axes.
// Frame rotation Q_fr = rotation that rotates MuJoCo frame into Three frame.
// The mapping (x,y,z)->(x,z,-y) is a -90° rotation about X axis.
// Rotation about X by -90° as quaternion: (w=cos(-45°), x=sin(-45°), 0, 0) =
//   (sqrt(2)/2, -sqrt(2)/2, 0, 0).
const FRAME = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const FRAME_INV = FRAME.clone().invert();

export function mjToThreeQuat(
  mj: ArrayLike<number>,
  out = new THREE.Quaternion(),
): THREE.Quaternion {
  // mj layout is (w, x, y, z); three layout is (x, y, z, w).
  out.set(mj[1], mj[2], mj[3], mj[0]);
  // Transform quaternion into the rotated frame:  Q_three = F * Q_mj * F^-1
  out.premultiply(FRAME).multiply(FRAME_INV);
  return out;
}
