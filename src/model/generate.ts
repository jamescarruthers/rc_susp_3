import type { SimParams } from '../store/simStore';
import { cornerLayout } from './defaults';

export interface GenerateOptions {
  // Full double-wishbone kinematics (milestone 4+) vs. a simpler prismatic
  // slider-spring mount for the milestone-3 rigid-chassis build.
  suspension: 'rigid-slider' | 'double-wishbone';
  // When true, front wheels gain a kingpin hinge driven by a position
  // actuator. Milestone 5 enables this.
  steering: boolean;
}

const xml = (strings: TemplateStringsArray, ...values: unknown[]) => {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += String(values[i]);
  });
  return out;
};

function f(n: number, digits = 4): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '0';
}

// Generate MJCF for the RC car from tuning parameters. Returns a complete
// XML string ready for MjModel.loadFromXML. Units: SI.
export function generateCarMjcf(params: SimParams, opts: GenerateOptions): string {
  const corners = cornerLayout(params);
  const timestep = 0.002;
  const wheelRadius = params.wheelRadius;
  const wheelHalfWidth = 0.0175;
  // Chassis geometry.
  const chassisHalf = { x: params.wheelbase / 2 + 0.04, y: 0.09, z: 0.025 };
  // Start with the wheels already touching the ground so the suspension
  // settles immediately rather than dropping the whole car.
  const startZ = wheelRadius + 0.002;
  const frictionStr = params.friction.map((v) => f(v, 4)).join(' ');

  const cornerBodies = corners
    .map((c) =>
      opts.suspension === 'double-wishbone'
        ? wishboneCorner(c, params, opts, wheelRadius, wheelHalfWidth, frictionStr)
        : sliderCorner(c, params, opts, wheelRadius, wheelHalfWidth, frictionStr),
    )
    .join('\n');

  const motorActuators = corners
    .filter((c) => c.driven)
    .map(
      (c) => `    <motor name="drive_${c.name}" joint="spin_${c.name}" gear="1" ` +
        `ctrllimited="true" ctrlrange="${f(-params.maxMotorTorque)} ${f(params.maxMotorTorque)}"/>`,
    )
    .join('\n');

  const steerActuators = opts.steering
    ? corners
        .filter((c) => c.steered)
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

  return xml`<?xml version="1.0" encoding="UTF-8"?>
<mujoco model="rc_car">
  <option timestep="${f(timestep, 4)}" integrator="implicitfast" gravity="0 0 -9.80665"
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
    <material name="arm_mat" rgba="0.8 0.5 0.1 1"/>
  </asset>
  <worldbody>
    <light name="sun" pos="2 2 4" dir="-0.5 -0.5 -1" diffuse="0.9 0.9 0.9" castshadow="true"/>
    <geom name="floor" type="plane" size="20 20 0.1" material="ground"/>
    <body name="chassis" pos="0 0 ${f(startZ)}">
      <freejoint name="root"/>
      <inertial pos="0 0 ${f(params.cogHeight - startZ)}" mass="${f(params.chassisMass)}"
                diaginertia="${f(inertiaX(params))} ${f(inertiaY(params))} ${f(inertiaZ(params))}"/>
      <geom name="chassis_shell" type="box"
            size="${f(chassisHalf.x)} ${f(chassisHalf.y)} ${f(chassisHalf.z)}"
            material="chassis_mat"/>
      <site name="chassis_site" pos="0 0 0" size="0.005"/>
${cornerBodies}
    </body>
  </worldbody>
  <actuator>
${motorActuators}
${steerActuators}
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

function inertiaX(p: SimParams): number {
  // Box approx: I = m/12 * (y² + z²)
  const y = 0.18;
  const z = 0.05;
  return (p.chassisMass / 12) * (y * y + z * z);
}
function inertiaY(p: SimParams): number {
  const x = p.wheelbase + 0.08;
  const z = 0.05;
  return (p.chassisMass / 12) * (x * x + z * z);
}
function inertiaZ(p: SimParams): number {
  const x = p.wheelbase + 0.08;
  const y = 0.18;
  return (p.chassisMass / 12) * (x * x + y * y);
}

// Milestone-3 suspension: a prismatic vertical slider per corner with a
// stiff spring + damper, plus a hub body carrying the wheel. Cheap and
// robust; replaced with a proper double-wishbone assembly in milestone 4.
function sliderCorner(
  c: { name: string; x: number; y: number; steered: boolean; driven: boolean },
  params: SimParams,
  opts: GenerateOptions,
  wheelRadius: number,
  wheelHalfWidth: number,
  _friction: string,
): string {
  const travel = 0.04;
  const mountZ = 0; // relative to chassis origin
  const kingpinBlock = opts.steering && c.steered
    ? `        <body name="kingpin_${c.name}" pos="0 0 0">
          <joint name="kingpin_${c.name}" type="hinge" axis="0 0 1"
                 limited="true" range="-0.6 0.6" damping="0.5"/>
          <inertial pos="0 0 0" mass="0.02" diaginertia="1e-5 1e-5 1e-5"/>
${wheelBody(c, wheelRadius, wheelHalfWidth, params)}
        </body>`
    : wheelBody(c, wheelRadius, wheelHalfWidth, params);
  return `      <body name="hub_${c.name}" pos="${f(c.x)} ${f(c.y)} ${f(mountZ)}">
        <joint name="susp_${c.name}" type="slide" axis="0 0 1"
               limited="true" range="-${f(travel)} ${f(travel)}"
               stiffness="${f(params.springRate)}" damping="${f(params.damping)}"
               springref="0"/>
        <inertial pos="0 0 0" mass="0.05" diaginertia="1e-4 1e-4 1e-4"/>
${kingpinBlock}
      </body>`;
}

// Milestone-4 stub: currently falls back to the slider model so the app
// keeps running until the full wishbone MJCF is wired up.
function wishboneCorner(
  c: { name: string; x: number; y: number; steered: boolean; driven: boolean },
  params: SimParams,
  opts: GenerateOptions,
  wheelRadius: number,
  wheelHalfWidth: number,
  friction: string,
): string {
  return sliderCorner(c, params, opts, wheelRadius, wheelHalfWidth, friction);
}

function wheelBody(
  c: { name: string; driven: boolean },
  wheelRadius: number,
  wheelHalfWidth: number,
  params: SimParams,
): string {
  const wheelInertia = 0.5 * params.wheelMass * wheelRadius * wheelRadius;
  return `          <body name="wheel_${c.name}" pos="0 0 0">
            <joint name="spin_${c.name}" type="hinge" axis="0 1 0" damping="0.001"/>
            <inertial pos="0 0 0" mass="${f(params.wheelMass)}"
                      diaginertia="${f(wheelInertia * 0.5)} ${f(wheelInertia)} ${f(wheelInertia * 0.5)}"/>
            <geom name="tyre_${c.name}" type="cylinder"
                  size="${f(wheelRadius)} ${f(wheelHalfWidth)}"
                  euler="1.5707963 0 0"
                  material="wheel_mat"/>
            <site name="contact_${c.name}" pos="0 0 -${f(wheelRadius)}" size="0.005"/>
          </body>`;
}
