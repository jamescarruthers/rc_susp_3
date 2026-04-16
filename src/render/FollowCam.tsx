import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore } from '../store/simStore';
import { getSim } from '../loop/simLoop';
import { mjToThreePos } from '../utils/iso8855';

// When enabled, LERPs the OrbitControls target (and camera position) toward
// the chassis body so the user can watch the car while still orbiting with
// the mouse. Disabled by default.
export function FollowCam() {
  const follow = useSimStore((s) => s.followCam);
  const { controls } = useThree() as unknown as {
    controls: { target: THREE.Vector3; update?: () => void } | null;
  };
  const target = useMemo(() => new THREE.Vector3(), []);
  const cameraOffset = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (!follow || !controls) return;
    cameraOffset.subVectors(camera.position, controls.target);
  }, [follow, controls, camera, cameraOffset]);

  useFrame((_, dt) => {
    if (!follow || !controls) return;
    const sim = getSim();
    if (!sim) return;
    const id = sim.bodyId('chassis');
    if (id < 0) return;
    const xp = sim.xpos;
    mjToThreePos([xp[id * 3], xp[id * 3 + 1], xp[id * 3 + 2]], tmp);
    const lerp = Math.min(1, dt * 4);
    target.lerp(tmp, lerp);
    controls.target.copy(target);
    camera.position.copy(target).add(cameraOffset);
    controls.update?.();
  });

  return null;
}
