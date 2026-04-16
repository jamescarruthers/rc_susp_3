import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore } from '../store/simStore';
import { getSim } from '../loop/simLoop';
import { mjToThreePos, mjToThreeQuat } from '../utils/iso8855';
import { cornerLayout } from '../model/defaults';

// Wire-frame A-arm overlay, one group per corner. The physics model uses a
// vertical slider per wheel (simpler / more stable than a kinematic chain),
// so these bars are visualisation only — they reflect the geometry you
// would build in a real double-wishbone at the current ride height.
export function SuspensionOverlay() {
  const params = useSimStore((s) => s.params);
  const visible = useSimStore((s) => s.overlay);
  const corners = useMemo(() => cornerLayout(params), [params]);

  const groupRef = useRef<THREE.Group>(null);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    const sim = getSim();
    if (!sim || !groupRef.current || !visible) return;
    const id = sim.bodyId('chassis');
    if (id < 0) return;
    const xp = sim.xpos;
    const xq = sim.xquat;
    mjToThreePos([xp[id * 3], xp[id * 3 + 1], xp[id * 3 + 2]], tmpP);
    mjToThreeQuat([xq[id * 4], xq[id * 4 + 1], xq[id * 4 + 2], xq[id * 4 + 3]], tmpQ);
    groupRef.current.position.copy(tmpP);
    groupRef.current.quaternion.copy(tmpQ);
  });

  if (!visible) return null;

  // Wheel centre expressed in chassis body frame (ride-height reference).
  // MuJoCo chassis body origin sits ≈ (wheelRadius) above ground, so the
  // wheel centre in chassis-local is roughly z = 0.
  const wheelZ = 0;
  const r = 0.006;

  return (
    <group ref={groupRef}>
      {corners.map((c, i) => {
        const wb = i < 2 ? params.wishboneFront : params.wishboneRear;
        const s = c.side;
        // Outboard ball joints sit on the upright near the wheel.
        const upOut: [number, number, number] = [c.x, c.y, wheelZ + wb.upperOutboardZ - wb.lowerOutboardZ];
        const loOut: [number, number, number] = [c.x, c.y, wheelZ];
        // Inboard pivots pull toward the centreline by the arm length.
        const upIn: [number, number, number] = [c.x, c.y - s * wb.upperArm, wheelZ + wb.upperInboardZ - wb.upperOutboardZ];
        const loIn: [number, number, number] = [c.x, c.y - s * wb.lowerArm, wheelZ + wb.lowerInboardZ - wb.lowerOutboardZ];
        // A notional pushrod from lower-outboard up toward chassis centre.
        const pushTop: [number, number, number] = [c.x - 0.015, c.y - s * 0.04, wheelZ + 0.08];
        return (
          <group key={c.name}>
            <Bar a={upIn} b={upOut} radius={r} color="#f59e0b" />
            <Bar a={loIn} b={loOut} radius={r} color="#10b981" />
            <Bar a={loOut} b={pushTop} radius={r * 0.8} color="#60a5fa" />
          </group>
        );
      })}
    </group>
  );
}

function Bar({
  a,
  b,
  radius,
  color,
}: {
  a: [number, number, number];
  b: [number, number, number];
  radius: number;
  color: string;
}) {
  const A = mjToThreePos(a, new THREE.Vector3());
  const B = mjToThreePos(b, new THREE.Vector3());
  const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(B, A);
  const length = dir.length();
  if (length < 1e-6) return null;
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );
  return (
    <mesh position={mid} quaternion={quat} castShadow={false}>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.3} />
    </mesh>
  );
}
