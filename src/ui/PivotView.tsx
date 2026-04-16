import { useCallback, useMemo, useRef, useState } from 'react';
import type { Hardpoints } from '../geometry/hardpoints';
import type { HardpointKey } from '../store/geometryStore';
import type { Vec3 } from '../geometry/vec';

// Single-plane SVG view of a corner's hardpoints. `axes` picks which of
// the three chassis coordinates show up on the horizontal / vertical
// screen axes. The third coordinate is locked during drag.
export type ViewAxes = 'xz' | 'yz';

interface PivotViewProps {
  axes: ViewAxes;
  hp: Hardpoints;
  selected: HardpointKey | null;
  onSelect: (key: HardpointKey | null) => void;
  onMove: (key: HardpointKey, newPoint: Vec3) => void;
  width?: number;
  height?: number;
  title: string;
}

const HP_LIST: HardpointKey[] = [
  'upperInboardFront',
  'upperInboardRear',
  'upperOutboard',
  'lowerInboardFront',
  'lowerInboardRear',
  'lowerOutboard',
  'tieRodInboard',
  'tieRodOutboard',
  'wheelCentre',
];

const HP_COLOURS: Record<HardpointKey, string> = {
  upperInboardFront: '#f59e0b',
  upperInboardRear: '#f59e0b',
  upperOutboard: '#fbbf24',
  lowerInboardFront: '#10b981',
  lowerInboardRear: '#10b981',
  lowerOutboard: '#34d399',
  tieRodInboard: '#60a5fa',
  tieRodOutboard: '#93c5fd',
  wheelCentre: '#f472b6',
};

export function PivotView({
  axes,
  hp,
  selected,
  onSelect,
  onMove,
  width = 320,
  height = 240,
  title,
}: PivotViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragKey = useRef<HardpointKey | null>(null);
  const [, setDragTick] = useState(0); // force re-render during drag

  // Axis index helpers. 'xz' → horiz=0 (X), vert=2 (Z). 'yz' → horiz=1 (Y), vert=2 (Z).
  const [iH, iV] = axes === 'xz' ? [0, 2] : [1, 2];
  const horizLabel = axes === 'xz' ? 'X (fwd)' : 'Y (left)';
  const vertLabel = 'Z (up)';

  // Fit-to-content transform: compute bounds across all plotted points.
  const { toScreen, fromScreen, bounds } = useMemo(() => {
    const pts: Vec3[] = HP_LIST.map((k) =>
      k === 'wheelCentre' ? hp.wheelCentre : (hp as unknown as Record<string, Vec3>)[k],
    );
    // Include wheel circle extent and ground line.
    let minH = Infinity;
    let maxH = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of pts) {
      minH = Math.min(minH, p[iH]);
      maxH = Math.max(maxH, p[iH]);
      minV = Math.min(minV, p[iV]);
      maxV = Math.max(maxV, p[iV]);
    }
    // Extend vertical down to the ground plane (z=0).
    minV = Math.min(minV, 0);
    // Extend for wheel radius.
    minH -= hp.wheelRadius;
    maxH += hp.wheelRadius;
    // Padding: 10% on each side.
    const dh = Math.max(0.01, maxH - minH);
    const dv = Math.max(0.01, maxV - minV);
    const pad = 0.1;
    minH -= dh * pad;
    maxH += dh * pad;
    minV -= dv * pad;
    maxV += dv * pad;
    // Preserve aspect ratio by expanding the smaller dimension.
    const dataAspect = (maxH - minH) / (maxV - minV);
    const screenAspect = width / height;
    if (dataAspect > screenAspect) {
      // Data wider: expand V to match.
      const need = (maxH - minH) / screenAspect;
      const midV = (minV + maxV) / 2;
      minV = midV - need / 2;
      maxV = midV + need / 2;
    } else {
      const need = (maxV - minV) * screenAspect;
      const midH = (minH + maxH) / 2;
      minH = midH - need / 2;
      maxH = midH + need / 2;
    }
    const sx = width / (maxH - minH);
    const sy = height / (maxV - minV);
    const toScreen = (dataH: number, dataV: number): [number, number] => [
      (dataH - minH) * sx,
      height - (dataV - minV) * sy, // flip Y so +Z is up on screen
    ];
    const fromScreen = (px: number, py: number): [number, number] => [
      minH + px / sx,
      minV + (height - py) / sy,
    ];
    return { toScreen, fromScreen, bounds: { minH, maxH, minV, maxV } };
  }, [hp, iH, iV, width, height]);

  const project = useCallback(
    (p: Vec3): [number, number] => toScreen(p[iH], p[iV]),
    [toScreen, iH, iV],
  );

  const startDrag = (key: HardpointKey) => (e: React.PointerEvent<SVGCircleElement>) => {
    dragKey.current = key;
    (e.target as SVGElement).setPointerCapture(e.pointerId);
    onSelect(key);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragKey.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const [dataH, dataV] = fromScreen(px, py);
    const key = dragKey.current;
    const curr = key === 'wheelCentre' ? hp.wheelCentre : (hp as unknown as Record<string, Vec3>)[key];
    const next: [number, number, number] = [curr[0], curr[1], curr[2]];
    next[iH] = dataH;
    next[iV] = dataV;
    onMove(key, next);
    setDragTick((t) => t + 1);
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragKey.current) {
      (e.target as SVGElement).releasePointerCapture?.(e.pointerId);
      dragKey.current = null;
    }
  };

  // --- Compose geometry primitives as SVG elements.
  const ground = (() => {
    const [x1, y1] = toScreen(bounds.minH, 0);
    const [x2, y2] = toScreen(bounds.maxH, 0);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" strokeWidth={1} strokeDasharray="4 3" />;
  })();

  // A-arm triangles (side view shows both inboard points separately; front
  // view collapses them to the midpoint, but drawing the triangle still
  // helps sanity-check alignment).
  const bar = (a: Vec3, b: Vec3, color: string, w = 2) => {
    const [x1, y1] = project(a);
    const [x2, y2] = project(b);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeLinecap="round" />;
  };

  const wheelPrimitive = (() => {
    const [cx, cy] = project(hp.wheelCentre);
    if (axes === 'xz') {
      // Side view: wheel is a circle.
      const rx = hp.wheelRadius * (width / (bounds.maxH - bounds.minH));
      const ry = hp.wheelRadius * (height / (bounds.maxV - bounds.minV));
      return (
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#1f2937" strokeWidth={1.5} />
      );
    }
    // Front view: wheel is a rectangle (width × 2*radius).
    const halfW = hp.wheelWidth / 2;
    const corners: Vec3[] = [
      [hp.wheelCentre[0], hp.wheelCentre[1] - halfW, hp.wheelCentre[2] - hp.wheelRadius],
      [hp.wheelCentre[0], hp.wheelCentre[1] + halfW, hp.wheelCentre[2] - hp.wheelRadius],
      [hp.wheelCentre[0], hp.wheelCentre[1] + halfW, hp.wheelCentre[2] + hp.wheelRadius],
      [hp.wheelCentre[0], hp.wheelCentre[1] - halfW, hp.wheelCentre[2] + hp.wheelRadius],
    ];
    const pts = corners.map((c) => project(c).join(',')).join(' ');
    return <polygon points={pts} fill="#1f2937" opacity={0.35} stroke="#334155" strokeWidth={1} />;
  })();

  return (
    <div className="relative">
      <div className="text-[10px] uppercase tracking-wide text-neutral-400 px-2 py-1">
        {title} · {horizLabel} / {vertLabel}
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={(e) => {
          if (e.target === svgRef.current) onSelect(null);
        }}
        className="bg-neutral-900 rounded border border-neutral-800 touch-none"
      >
        {ground}
        {wheelPrimitive}
        {/* Upper A-arm */}
        {bar(hp.upperInboardFront, hp.upperOutboard, '#f59e0b')}
        {bar(hp.upperInboardRear, hp.upperOutboard, '#f59e0b')}
        {bar(hp.upperInboardFront, hp.upperInboardRear, '#f59e0b80', 1)}
        {/* Lower A-arm */}
        {bar(hp.lowerInboardFront, hp.lowerOutboard, '#10b981')}
        {bar(hp.lowerInboardRear, hp.lowerOutboard, '#10b981')}
        {bar(hp.lowerInboardFront, hp.lowerInboardRear, '#10b98180', 1)}
        {/* Tie rod */}
        {bar(hp.tieRodInboard, hp.tieRodOutboard, '#60a5fa')}
        {/* Steering axis */}
        {bar(hp.lowerOutboard, hp.upperOutboard, '#ec4899', 1)}
        {/* Hardpoint handles */}
        {HP_LIST.map((k) => {
          const p = k === 'wheelCentre' ? hp.wheelCentre : (hp as unknown as Record<string, Vec3>)[k];
          const [x, y] = project(p);
          const isSel = selected === k;
          return (
            <g key={k}>
              <circle
                cx={x}
                cy={y}
                r={isSel ? 7 : 5}
                fill={HP_COLOURS[k]}
                stroke={isSel ? '#f8fafc' : '#0f172a'}
                strokeWidth={isSel ? 2 : 1}
                onPointerDown={startDrag(k)}
                style={{ cursor: 'grab' }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
