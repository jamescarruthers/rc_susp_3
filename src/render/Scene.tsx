import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Ground } from './Ground';
import { CarMesh } from './CarMesh';
import { SuspensionOverlay } from './SuspensionOverlay';
import { FollowCam } from './FollowCam';

// Three.js default: Y-up. MuJoCo ISO 8855: Z-up. Conversion happens per-body
// in CarMesh via utils/iso8855, so the R3F scene itself is plain Y-up and
// drei utilities (Grid, OrbitControls) work without acrobatics.
export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [1.2, 0.9, 1.2], fov: 50, near: 0.02, far: 50 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#0a0f1a']} />
      <hemisphereLight args={['#cbd5e1', '#1e293b', 0.5]} />
      <directionalLight
        position={[5, 8, 4]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <Ground />
      <CarMesh />
      <SuspensionOverlay />
      <OrbitControls makeDefault target={[0, 0.1, 0]} />
      <FollowCam />
    </Canvas>
  );
}
