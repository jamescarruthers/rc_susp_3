// Minimal MJCF used by milestone 2 to smoke-test mujoco-js loading and
// stepping. A single box falls onto a plane. Chassis body name is `chassis`
// so the renderer can find it by name even though we only draw one body.
export const BOX_DROP_MJCF = `<?xml version="1.0" encoding="UTF-8"?>
<mujoco model="box_drop">
  <option timestep="0.002" integrator="implicitfast" gravity="0 0 -9.80665"/>
  <default>
    <geom rgba="0.8 0.8 0.8 1" friction="1.0 0.05 0.001"/>
  </default>
  <worldbody>
    <geom name="floor" type="plane" size="10 10 0.1" rgba="0.15 0.15 0.15 1"/>
    <body name="chassis" pos="0 0 0.5">
      <freejoint/>
      <geom type="box" size="0.175 0.1 0.025" rgba="0.22 0.74 0.93 1"/>
    </body>
  </worldbody>
</mujoco>
`;
