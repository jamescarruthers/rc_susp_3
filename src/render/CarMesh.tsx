import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mjToThreePos, mjToThreeQuat } from '../utils/iso8855';
import { getSim } from '../loop/simLoop';
import { useSimStore } from '../store/simStore';

interface BodyRef {
  name: string;
  group: THREE.Group | null;
  id: number | null;
}

// Subscribes to the Simulation directly each frame to avoid going through
// Zustand, which would re-render on every pose update. Body IDs are cached
// after the first successful lookup.
export function CarMesh() {
  const params = useSimStore((s) => s.params);

  const refs = useRef<BodyRef[]>([
    { name: 'chassis', group: null, id: null },
    { name: 'hub_fl', group: null, id: null },
    { name: 'hub_fr', group: null, id: null },
    { name: 'hub_rl', group: null, id: null },
    { name: 'hub_rr', group: null, id: null },
    { name: 'kingpin_fl', group: null, id: null },
    { name: 'kingpin_fr', group: null, id: null },
    { name: 'wheel_fl', group: null, id: null },
    { name: 'wheel_fr', group: null, id: null },
    { name: 'wheel_rl', group: null, id: null },
    { name: 'wheel_rr', group: null, id: null },
  ]);

  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    const sim = getSim();
    if (!sim) return;
    const xp = sim.xpos;
    const xq = sim.xquat;
    for (const r of refs.current) {
      if (!r.group) continue;
      if (r.id === null) r.id = sim.bodyId(r.name);
      if (r.id < 0) continue;
      const p = r.id * 3;
      const q = r.id * 4;
      mjToThreePos([xp[p], xp[p + 1], xp[p + 2]], tmpPos);
      mjToThreeQuat([xq[q], xq[q + 1], xq[q + 2], xq[q + 3]], tmpQuat);
      r.group.position.copy(tmpPos);
      r.group.quaternion.copy(tmpQuat);
    }
  });

  const bind = (i: number) => (g: THREE.Group | null) => {
    refs.current[i].group = g;
    if (g === null) refs.current[i].id = null;
  };

  const chassisHalf = {
    x: params.wheelbase / 2 + 0.04,
    y: 0.09,
    z: 0.025,
  };
  const wr = params.wheelRadius;
  const ww = 0.035;

  return (
    <>
      <group ref={bind(0)}>
        {/* Three coords: (mj_x, mj_z, -mj_y) => dims (2*hx, 2*hz, 2*hy) */}
        <mesh castShadow>
          <boxGeometry args={[chassisHalf.x * 2, chassisHalf.z * 2, chassisHalf.y * 2]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.4} metalness={0.2} />
        </mesh>
      </group>
      {/* Hubs are invisible; the wheel bodies are what we render spinning. */}
      <group ref={bind(1)} />
      <group ref={bind(2)} />
      <group ref={bind(3)} />
      <group ref={bind(4)} />
      <group ref={bind(5)} />
      <group ref={bind(6)} />
      {[7, 8, 9, 10].map((idx) => (
        <group key={idx} ref={bind(idx)}>
          <WheelMesh radius={wr} width={ww} />
        </group>
      ))}
    </>
  );
}

function WheelMesh({ radius, width }: { radius: number; width: number }) {
  // Cylinder in MuJoCo is Z-axis; the MJCF rotates it so axis is Y (world).
  // After our iso8855 transform, MuJoCo Y maps to Three -Z, so the cylinder's
  // long axis is Three Z. Three's cylinderGeometry default axis is Y, so
  // rotate by 90° around X.
  return (
    <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, width, 24]} />
      <meshStandardMaterial color="#1f2937" roughness={0.9} metalness={0.05} />
    </mesh>
  );
}
