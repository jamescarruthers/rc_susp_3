import type { Data, Model, Mujoco } from './types';
import { writeModelXml } from './loader';

export interface BodyPose {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

interface BodyLookup {
  [name: string]: number;
}

interface ActuatorLookup {
  [name: string]: number;
}

// Wraps a single (model, data) pair. A Simulation instance is tied to one
// MJCF string; reloading builds a new instance via Simulation.reload.
export class Simulation {
  readonly mujoco: Mujoco;
  model: Model;
  data: Data;
  private bodies: BodyLookup = {};
  private actuators: ActuatorLookup = {};
  private sensors: ActuatorLookup = {};
  private _timestep: number;
  private _initialQpos: Float64Array;

  constructor(mujoco: Mujoco, model: Model, data: Data) {
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this._timestep = (model as unknown as { opt: { timestep: number } }).opt.timestep;

    // Cache name → id maps. mj_name2id is O(log n) but we hit these each frame.
    this.cacheLookups();

    const qpos = (data as unknown as { qpos: Float64Array }).qpos;
    this._initialQpos = new Float64Array(qpos);
  }

  static create(mujoco: Mujoco, xml: string, path = '/working/scene.xml'): Simulation {
    writeModelXml(mujoco, path, xml);
    const MjModelCtor = (mujoco as unknown as { MjModel: { loadFromXML(p: string): Model } })
      .MjModel;
    const model = MjModelCtor.loadFromXML(path);
    const MjDataCtor = (mujoco as unknown as { MjData: new (m: Model) => Data }).MjData;
    const data = new MjDataCtor(model);
    // Run forward once so xpos/xquat are populated from qpos0 before the
    // first render frame.
    (mujoco as unknown as { mj_forward(m: Model, d: Data): void }).mj_forward(model, data);
    return new Simulation(mujoco, model, data);
  }

  dispose() {
    try {
      (this.data as unknown as { delete(): void }).delete();
    } catch {
      // ignore
    }
    try {
      (this.model as unknown as { delete(): void }).delete();
    } catch {
      // ignore
    }
  }

  get timestep(): number {
    return this._timestep;
  }

  get time(): number {
    return (this.data as unknown as { time: number }).time;
  }

  step() {
    (this.mujoco as unknown as { mj_step(m: Model, d: Data): void }).mj_step(
      this.model,
      this.data,
    );
  }

  forward() {
    (this.mujoco as unknown as { mj_forward(m: Model, d: Data): void }).mj_forward(
      this.model,
      this.data,
    );
  }

  reset() {
    (this.mujoco as unknown as { mj_resetData(m: Model, d: Data): void }).mj_resetData(
      this.model,
      this.data,
    );
    const qpos = (this.data as unknown as { qpos: Float64Array }).qpos;
    qpos.set(this._initialQpos);
    this.forward();
  }

  get ctrl(): Float64Array {
    return (this.data as unknown as { ctrl: Float64Array }).ctrl;
  }

  get qpos(): Float64Array {
    return (this.data as unknown as { qpos: Float64Array }).qpos;
  }

  get qvel(): Float64Array {
    return (this.data as unknown as { qvel: Float64Array }).qvel;
  }

  get xpos(): Float64Array {
    return (this.data as unknown as { xpos: Float64Array }).xpos;
  }

  get xquat(): Float64Array {
    return (this.data as unknown as { xquat: Float64Array }).xquat;
  }

  get sensordata(): Float64Array {
    return (this.data as unknown as { sensordata: Float64Array }).sensordata;
  }

  get nbody(): number {
    return (this.model as unknown as { nbody: number }).nbody;
  }

  get nu(): number {
    return (this.model as unknown as { nu: number }).nu;
  }

  bodyId(name: string): number {
    const id = this.bodies[name];
    return id === undefined ? -1 : id;
  }

  getBodyPose(id: number, out: BodyPose): BodyPose {
    const xp = this.xpos;
    const xq = this.xquat;
    const p = id * 3;
    const q = id * 4;
    out.position[0] = xp[p];
    out.position[1] = xp[p + 1];
    out.position[2] = xp[p + 2];
    out.quaternion[0] = xq[q];
    out.quaternion[1] = xq[q + 1];
    out.quaternion[2] = xq[q + 2];
    out.quaternion[3] = xq[q + 3];
    return out;
  }

  actuatorId(name: string): number {
    const id = this.actuators[name];
    return id === undefined ? -1 : id;
  }

  setCtrl(name: string, value: number): boolean {
    const id = this.actuatorId(name);
    if (id < 0) return false;
    this.ctrl[id] = value;
    return true;
  }

  sensorId(name: string): number {
    const id = this.sensors[name];
    return id === undefined ? -1 : id;
  }

  // Return the offset into `sensordata` for the named sensor, or -1 if
  // not found.
  sensorAdr(name: string): number {
    const id = this.sensorId(name);
    if (id < 0) return -1;
    const adr = (this.model as unknown as { sensor_adr: ArrayLike<number> }).sensor_adr;
    return adr[id];
  }

  sensorDim(name: string): number {
    const id = this.sensorId(name);
    if (id < 0) return 0;
    const dim = (this.model as unknown as { sensor_dim: ArrayLike<number> }).sensor_dim;
    return dim[id];
  }

  private cacheLookups() {
    const { mujoco, model } = this;
    const nameFn = (mujoco as unknown as {
      mj_id2name(m: Model, type: number, id: number): string;
    }).mj_id2name;
    const mjtObj = (mujoco as unknown as {
      mjtObj: {
        mjOBJ_BODY: { value: number };
        mjOBJ_ACTUATOR: { value: number };
        mjOBJ_SENSOR: { value: number };
      };
    }).mjtObj;
    const bodyT = mjtObj.mjOBJ_BODY.value;
    const actT = mjtObj.mjOBJ_ACTUATOR.value;
    const senT = mjtObj.mjOBJ_SENSOR.value;
    const nbody = (model as unknown as { nbody: number }).nbody;
    const nu = (model as unknown as { nu: number }).nu;
    const nsensor = (model as unknown as { nsensor: number }).nsensor;
    for (let i = 0; i < nbody; i++) {
      const name = nameFn.call(mujoco, model, bodyT, i);
      if (name) this.bodies[name] = i;
    }
    for (let i = 0; i < nu; i++) {
      const name = nameFn.call(mujoco, model, actT, i);
      if (name) this.actuators[name] = i;
    }
    for (let i = 0; i < nsensor; i++) {
      const name = nameFn.call(mujoco, model, senT, i);
      if (name) this.sensors[name] = i;
    }
  }
}
