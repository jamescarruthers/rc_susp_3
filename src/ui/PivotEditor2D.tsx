import { useEffect, useRef, useState } from 'react';
import { useGeometryStore, type HardpointKey } from '../store/geometryStore';
import { PivotView } from './PivotView';
import type { Vec3 } from '../geometry/vec';

// Side + front pivot editors stacked. The container measures its width and
// passes it to the SVG so the views re-fit on resize.
export function PivotEditor2D() {
  const hp = useGeometryStore((s) => s[s.active]);
  const selected = useGeometryStore((s) => s.selected);
  const select = useGeometryStore((s) => s.select);
  const setHardpoint = useGeometryStore((s) => s.setHardpoint);

  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 320, h: 240 });

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setSize({ w, h: Math.max(180, Math.floor(w * 0.55)) });
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const onMove = (key: HardpointKey, next: Vec3) => setHardpoint(key, [...next]);

  return (
    <div ref={ref} className="flex flex-col gap-2 p-2 overflow-auto">
      <PivotView
        axes="xz"
        hp={hp}
        selected={selected}
        onSelect={select}
        onMove={onMove}
        width={size.w - 16}
        height={size.h}
        title="Side"
      />
      <PivotView
        axes="yz"
        hp={hp}
        selected={selected}
        onSelect={select}
        onMove={onMove}
        width={size.w - 16}
        height={size.h}
        title="Front"
      />
    </div>
  );
}
