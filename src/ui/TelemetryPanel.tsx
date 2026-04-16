import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { telemetry, type TelemetryChannel } from '../telemetry/telemetry';

interface PlotSpec {
  title: string;
  channels: Array<{ name: TelemetryChannel; color: string; label: string }>;
}

const PLOTS: PlotSpec[] = [
  {
    title: 'Chassis',
    channels: [
      { name: 'speed', color: '#38bdf8', label: 'speed (m/s)' },
      { name: 'yawRate', color: '#10b981', label: 'yaw rate (rad/s)' },
    ],
  },
  {
    title: 'Input',
    channels: [
      { name: 'throttle', color: '#84cc16', label: 'throttle' },
      { name: 'steering', color: '#ec4899', label: 'steer' },
    ],
  },
  {
    title: 'Wheel omega (rad/s)',
    channels: [
      { name: 'omega_fl', color: '#f97316', label: 'FL' },
      { name: 'omega_fr', color: '#eab308', label: 'FR' },
      { name: 'omega_rl', color: '#06b6d4', label: 'RL' },
      { name: 'omega_rr', color: '#a855f7', label: 'RR' },
    ],
  },
  {
    title: 'Wheel torque (N·m)',
    channels: [
      { name: 'torque_fl', color: '#f97316', label: 'FL' },
      { name: 'torque_fr', color: '#eab308', label: 'FR' },
      { name: 'torque_rl', color: '#06b6d4', label: 'RL' },
      { name: 'torque_rr', color: '#a855f7', label: 'RR' },
    ],
  },
];

export function TelemetryPanel() {
  return (
    <div className="flex flex-col gap-1 overflow-auto h-full">
      {PLOTS.map((p) => (
        <Plot key={p.title} spec={p} />
      ))}
    </div>
  );
}

function Plot({ spec }: { spec: PlotSpec }) {
  const ref = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const buffers = useMemo(
    () =>
      spec.channels.map(() => new Float32Array(telemetry.capacity)),
    [spec.channels],
  );
  const xBuffer = useMemo(() => new Float32Array(telemetry.capacity), []);

  useEffect(() => {
    if (!ref.current) return;
    const width = ref.current.clientWidth || 260;
    const u = new uPlot(
      {
        title: spec.title,
        width,
        height: 100,
        pxAlign: false,
        scales: { x: { time: false } },
        legend: { show: true, live: false },
        series: [
          { label: 't' },
          ...spec.channels.map((c) => ({
            label: c.label,
            stroke: c.color,
            width: 1.2,
            spanGaps: true,
          })),
        ],
        axes: [
          { stroke: '#94a3b8', grid: { stroke: '#1f2937' } },
          { stroke: '#94a3b8', grid: { stroke: '#1f2937' } },
        ],
      },
      // initial empty data: [x, ...series]
      [new Float32Array(0), ...spec.channels.map(() => new Float32Array(0))] as unknown as uPlot.AlignedData,
      ref.current,
    );
    plotRef.current = u;

    // Throttled redraw: 30 Hz is enough for live plots and keeps main-thread
    // cost low even with 4–8 series.
    let raf = 0;
    let last = 0;
    const redraw = (t: number) => {
      raf = requestAnimationFrame(redraw);
      if (t - last < 1000 / 30) return;
      last = t;
      const xCh = telemetry.channels.get('time')!;
      const n = xCh.copyTo(xBuffer);
      const x = xBuffer.subarray(0, n);
      const data: Float32Array[] = [x];
      for (let i = 0; i < spec.channels.length; i++) {
        const c = spec.channels[i];
        const buf = buffers[i];
        telemetry.channels.get(c.name)!.copyTo(buf);
        data.push(buf.subarray(0, n));
      }
      u.setData(data as unknown as uPlot.AlignedData, true);
    };
    raf = requestAnimationFrame(redraw);

    const onResize = () => {
      if (!ref.current) return;
      u.setSize({ width: ref.current.clientWidth, height: 100 });
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      u.destroy();
      plotRef.current = null;
    };
  }, [spec, buffers, xBuffer]);

  return <div ref={ref} className="w-full" />;
}
