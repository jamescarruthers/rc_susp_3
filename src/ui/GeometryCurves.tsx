import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useGeometryStore } from '../store/geometryStore';
import { sweep, type SweepAxis, type SweepResult } from '../geometry/sweep';
import type { MetricKey } from '../geometry/metrics';

// Curve panel that runs a sweep on the active archetype and plots selected
// metrics against the swept variable. Re-sweeps any time hardpoints change,
// debounced so a continuous drag doesn't thrash the solver + uPlot.
export function GeometryCurves() {
  const hp = useGeometryStore((s) => s[s.active]);
  const [axis, setAxis] = useState<SweepAxis>('rideHeight');
  const [range, setRange] = useState<[number, number]>([-0.015, 0.015]);
  const [samples] = useState(41);

  const [result, setResult] = useState<SweepResult | null>(null);
  // Debounce the sweep so live drag keeps the UI smooth. Sweeps are cheap
  // (~41 warm-started solves, sub-ms total) but uPlot setData is the pricier
  // part; 30 ms gives us ~33 updates/sec.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setResult(sweep(hp, { axis, from: range[0], to: range[1], samples }));
    }, 30);
    return () => window.clearTimeout(handle);
  }, [hp, axis, range, samples]);

  const xLabel = axis === 'rideHeight'
    ? 'ride height Δ (mm)'
    : axis === 'steerRack'
      ? 'rack displacement (mm)'
      : 'roll angle (°)';
  const xScale = axis === 'rollAngle' ? 180 / Math.PI : 1000;

  return (
    <div className="flex flex-col gap-2 p-2 overflow-auto h-full">
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-neutral-500">Sweep</span>
        {(['rideHeight', 'steerRack', 'rollAngle'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAxis(a)}
            className={`px-2 py-0.5 rounded ${
              axis === a ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-300'
            }`}
          >
            {a === 'rideHeight' ? 'ride h' : a === 'steerRack' ? 'rack' : 'roll'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-neutral-400">
          ±
          <input
            type="number"
            step={axis === 'rollAngle' ? 0.5 : 1}
            value={(range[1] * xScale).toFixed(1)}
            onChange={(e) => {
              const v = parseFloat(e.target.value) / xScale || 0;
              setRange([-Math.abs(v), Math.abs(v)]);
            }}
            className="w-16 bg-neutral-900 border border-neutral-700 px-1 py-0.5 rounded text-right"
          />
        </div>
      </div>
      <Curve
        title="Camber vs travel"
        result={result}
        metric="camber"
        xScale={xScale}
        yScale={180 / Math.PI}
        yLabel="°"
        xLabel={xLabel}
      />
      <Curve
        title="Toe vs travel (bump steer)"
        result={result}
        metric="toe"
        xScale={xScale}
        yScale={180 / Math.PI}
        yLabel="°"
        xLabel={xLabel}
      />
      <Curve
        title="Roll-centre height"
        result={result}
        metric="rollCentreHeight"
        xScale={xScale}
        yScale={1000}
        yLabel="mm"
        xLabel={xLabel}
      />
      <Curve
        title="Scrub radius"
        result={result}
        metric="scrubRadius"
        xScale={xScale}
        yScale={1000}
        yLabel="mm"
        xLabel={xLabel}
      />
      <Curve
        title="Caster"
        result={result}
        metric="caster"
        xScale={xScale}
        yScale={180 / Math.PI}
        yLabel="°"
        xLabel={xLabel}
      />
      <Curve
        title="KPI"
        result={result}
        metric="kpi"
        xScale={xScale}
        yScale={180 / Math.PI}
        yLabel="°"
        xLabel={xLabel}
      />
    </div>
  );
}

interface CurveProps {
  title: string;
  result: SweepResult | null;
  metric: MetricKey;
  xScale: number;
  yScale: number;
  yLabel: string;
  xLabel: string;
}

function Curve({ title, result, metric, xScale, yScale, yLabel, xLabel }: CurveProps) {
  const ref = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  // Pre-allocated buffers reused on each update. Size guessed generously;
  // uPlot truncates via subarray.
  const bufX = useMemo(() => new Float32Array(256), []);
  const bufY = useMemo(() => new Float32Array(256), []);

  useEffect(() => {
    if (!ref.current) return;
    const u = new uPlot(
      {
        title,
        width: ref.current.clientWidth || 300,
        height: 130,
        pxAlign: false,
        scales: { x: { time: false } },
        legend: { show: false },
        series: [
          { label: xLabel },
          { label: yLabel, stroke: '#38bdf8', width: 1.4 },
        ],
        axes: [
          { stroke: '#94a3b8', grid: { stroke: '#1f2937' } },
          { stroke: '#94a3b8', grid: { stroke: '#1f2937' } },
        ],
      },
      [new Float32Array(0), new Float32Array(0)] as unknown as uPlot.AlignedData,
      ref.current,
    );
    plotRef.current = u;

    const onResize = () => {
      if (!ref.current) return;
      u.setSize({ width: ref.current.clientWidth, height: 130 });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      u.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const u = plotRef.current;
    if (!u || !result) return;
    const n = result.x.length;
    const xOut = n <= bufX.length ? bufX : new Float32Array(n);
    const yOut = n <= bufY.length ? bufY : new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xOut[i] = result.x[i] * xScale;
      yOut[i] = result.series[metric][i] * yScale;
    }
    u.setData(
      [xOut.subarray(0, n), yOut.subarray(0, n)] as unknown as uPlot.AlignedData,
      true,
    );
  }, [result, metric, xScale, yScale, bufX, bufY]);

  return <div ref={ref} className="w-full" />;
}
