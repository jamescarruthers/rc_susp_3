import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore } from '../store/simStore';
import { mjToThreePos, mjToThreeQuat } from '../utils/iso8855';

// Placeholder box car body. Milestone 3 replaces this with body-per-part
// meshes driven by sim.xpos / sim.xquat.
export function CarMesh() {
  const group = useRef<THREE.Group>(null);
  const tmpPos = useRef(new THREE.Vector3());
  const tmpQuat = useRef(new THREE.Quaternion());

  useFrame(() => {
    const { chassis } = useSimStore.getState();
    if (!group.current) return;
    mjToThreePos(chassis.position, tmpPos.current);
    mjToThreeQuat(chassis.quaternion, tmpQuat.current);
    group.current.position.copy(tmpPos.current);
    group.current.quaternion.copy(tmpQuat.current);
  });

  return (
    <group ref={group}>
      {/* Dimensions in Three coords: (mj_x_fwd, mj_z_up, mj_y_left) */}
      <mesh castShadow>
        <boxGeometry args={[0.35, 0.05, 0.2]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.4} metalness={0.2} />
      </mesh>
    </group>
  );
}
