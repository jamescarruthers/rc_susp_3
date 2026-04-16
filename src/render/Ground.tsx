import { Grid } from '@react-three/drei';

export function Ground() {
  return (
    <>
      <Grid
        args={[50, 50]}
        cellSize={0.1}
        cellThickness={0.4}
        cellColor="#334155"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#64748b"
        fadeDistance={25}
        fadeStrength={1}
        infiniteGrid
        position={[0, 0, 0]}
      />
      <mesh receiveShadow position={[0, -0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0} />
      </mesh>
    </>
  );
}
