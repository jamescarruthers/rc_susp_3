import type { Hardpoints } from '../geometry/hardpoints';

// Physical parameters that aren't expressed as hardpoint coordinates.
// Keeps the geometry type pure kinematic while letting the dynamic
// preview vary inertial / contact / actuator behaviour.
export interface DynamicsParams {
  chassisMass: number;
  chassisSize: [number, number, number]; // box half-sizes (x, y, z) for shell geom
  cogOffset: [number, number, number];   // CoG offset from chassis body origin
  wheelMass: number;
  springRate: number;
  damping: number;
  friction: [number, number, number];
  maxMotorTorque: number;
  steering: boolean; // front only
  timestep: number;
}

export const defaultDynamics: DynamicsParams = {
  chassisMass: 1.8,
  chassisSize: [0.17, 0.09, 0.025],
  cogOffset: [0, 0, 0],
  wheelMass: 0.1,
  springRate: 4000,
  damping: 80,
  friction: [1.0, 0.05, 0.001],
  maxMotorTorque: 1.2,
  steering: true,
  timestep: 0.002,
};

const f = (n: number, d = 4) => (Number.isFinite(n) ? n.toFixed(d) : '0');

// Build an MJCF from front/rear hardpoint archetypes. Each archetype is
// assumed to describe the LEFT side; the right side is produced by
// mirroring Y. Physics is the same prismatic-slider-per-corner model as
// generate.ts, but corner positions come straight from hardpoints.
export function mjcfFromGeometry(
  front: Hardpoints,
  rear: Hardpoints,
  dyn: DynamicsParams = defaultDynamics,
): string {
  // Derived dimensions.
  const wheelRadius = front.wheelRadius;
  const wheelHalfWidth = front.wheelWidth / 2;
  const wheelInertia = 0.5 * dyn.wheelMass * wheelRadius * wheelRadius;
  const [hx, hy, hz] = dyn.chassisSize;
  // Spawn Z so the wheels are just above the ground — the sliders settle
  // quickly rather than dropping the whole car on the first step.
  const startZ = wheelRadius + 0.002;
  const frictionStr = dyn.friction.map((v) => f(v, 4)).join(' ');

  // Both axles: left (side=+1) then mirrored right (side=-1).
  const corners: CornerSpec[] = [
    { axle: 'front', name: 'fl', hp: front, side: +1 },
    { axle: 'front', name: 'fr', hp: front, side: -1 },
    { axle: 'rear', name: 'rl', hp: rear, side: +1 },
    { axle: 'rear', name: 'rr', hp: rear, side: -1 },
  ];

  const bodyBlocks = corners
    .map((c) =>
      cornerBody(c, {
        springRate: dyn.springRate,
        damping: dyn.damping,
        wheelMass: dyn.wheelMass,
        wheelRadius,
        wheelHalfWidth,
        wheelInertia,
        steering: dyn.steering,
      }),
    )
    .join('\n');

  const motors = corners
    .map(
      (c) =>
        `    <motor name="drive_${c.name}" joint="spin_${c.name}" gear="1" ` +
        `ctrllimited="true" ctrlrange="${f(-dyn.maxMotorTorque)} ${f(dyn.maxMotorTorque)}"/>`,
    )
    .join('\n');
  const steerActs =
    dyn.steering
      ? corners
          .filter((c) => c.axle === 'front')
          .map(
            (c) =>
              `    <position name="steer_${c.name}" joint="kingpin_${c.name}" ` +
              `kp="30" ctrllimited="true" ctrlrange="-0.6 0.6"/>`,
          )
          .join('\n')
      : '';
  const sensors = corners
    .map(
      (c) =>
        `    <jointvel name="omega_${c.name}" joint="spin_${c.name}"/>\n` +
        `    <touch name="touch_${c.name}" site="contact_${c.name}"/>`,
    )
    .join('\n');

  // Inertia: coarse box approximation from the chassis shell.
  const ix = (dyn.chassisMass / 12) * (hy * hy * 4 + hz * hz * 4);
  const iy = (dyn.chassisMass / 12) * (hx * hx * 4 + hz * hz * 4);
  const iz = (dyn.chassisMass / 12) * (hx * hx * 4 + hy * hy * 4);

  return `<?xml version="1.0" encoding="UTF-8"?>
<mujoco model="rc_car_from_geometry">
  <option timestep="${f(dyn.timestep)}" integrator="implicitfast" gravity="0 0 -9.80665"
          iterations="30" tolerance="1e-10" solver="Newton" cone="elliptic"/>
  <compiler angle="radian" autolimits="true"/>
  <default>
    <geom friction="${frictionStr}" condim="6" solref="0.01 1" solimp="0.95 0.99 0.001"/>
    <joint damping="0.05" armature="0.0001"/>
  </default>
  <asset>
    <texture name="grid" type="2d" builtin="checker" rgb1="0.2 0.25 0.3" rgb2="0.14 0.18 0.22"
             width="300" height="300" mark="none"/>
    <material name="ground" texture="grid" texrepeat="40 40" reflectance="0"/>
    <material name="chassis_mat" rgba="0.22 0.74 0.93 1"/>
    <material name="wheel_mat" rgba="0.12 0.12 0.14 1"/>
  </asset>
  <worldbody>
    <light name="sun" pos="2 2 4" dir="-0.5 -0.5 -1" diffuse="0.9 0.9 0.9" castshadow="true"/>
    <geom name="floor" type="plane" size="20 20 0.1" material="ground"/>
    <body name="chassis" pos="0 0 ${f(startZ)}">
      <freejoint name="root"/>
      <inertial pos="${dyn.cogOffset.map((v) => f(v)).join(' ')}" mass="${f(dyn.chassisMass)}"
                diaginertia="${f(ix, 6)} ${f(iy, 6)} ${f(iz, 6)}"/>
      <geom name="chassis_shell" type="box"
            size="${f(hx)} ${f(hy)} ${f(hz)}"
            material="chassis_mat"/>
      <site name="chassis_site" pos="0 0 0" size="0.005"/>
${bodyBlocks}
    </body>
  </worldbody>
  <actuator>
${motors}
${steerActs}
  </actuator>
  <sensor>
    <framepos name="chassis_pos" objtype="body" objname="chassis"/>
    <framequat name="chassis_quat" objtype="body" objname="chassis"/>
    <velocimeter name="chassis_vel" site="chassis_site"/>
    <gyro name="chassis_gyro" site="chassis_site"/>
    <accelerometer name="chassis_acc" site="chassis_site"/>
${sensors}
  </sensor>
</mujoco>
`;
}

interface CornerSpec {
  axle: 'front' | 'rear';
  name: string;
  hp: Hardpoints;
  side: 1 | -1;
}

interface CornerDyn {
  springRate: number;
  damping: number;
  wheelMass: number;
  wheelRadius: number;
  wheelHalfWidth: number;
  wheelInertia: number;
  steering: boolean;
}

function cornerBody(c: CornerSpec, d: CornerDyn): string {
  const wx = c.hp.wheelCentre[0] * (c.axle === 'rear' ? -1 : 1);
  const wy = c.hp.wheelCentre[1] * c.side;
  const travel = 0.04;
  const mountZ = 0;
  const kingpinOpen =
    d.steering && c.axle === 'front'
      ? `        <body name="kingpin_${c.name}" pos="0 0 0">
          <joint name="kingpin_${c.name}" type="hinge" axis="0 0 1"
                 limited="true" range="-0.6 0.6" damping="0.5"/>
          <inertial pos="0 0 0" mass="0.02" diaginertia="1e-5 1e-5 1e-5"/>
`
      : '';
  const kingpinClose = d.steering && c.axle === 'front' ? `        </body>\n` : '';
  return `      <body name="hub_${c.name}" pos="${f(wx)} ${f(wy)} ${f(mountZ)}">
        <joint name="susp_${c.name}" type="slide" axis="0 0 1"
               limited="true" range="-${f(travel)} ${f(travel)}"
               stiffness="${f(d.springRate)}" damping="${f(d.damping)}"
               springref="0"/>
        <inertial pos="0 0 0" mass="0.05" diaginertia="1e-4 1e-4 1e-4"/>
${kingpinOpen}          <body name="wheel_${c.name}" pos="0 0 0">
            <joint name="spin_${c.name}" type="hinge" axis="0 1 0" damping="0.001"/>
            <inertial pos="0 0 0" mass="${f(d.wheelMass)}"
                      diaginertia="${f(d.wheelInertia * 0.5)} ${f(d.wheelInertia)} ${f(d.wheelInertia * 0.5)}"/>
            <geom name="tyre_${c.name}" type="cylinder"
                  size="${f(d.wheelRadius)} ${f(d.wheelHalfWidth)}"
                  euler="1.5707963 0 0"
                  material="wheel_mat"/>
            <site name="contact_${c.name}" pos="0 0 -${f(d.wheelRadius)}" size="0.005"/>
          </body>
${kingpinClose}      </body>`;
}
