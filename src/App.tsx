import { useEffect } from 'react';
import { Scene } from './render/Scene';
import { HUD } from './ui/HUD';
import { SimControls } from './ui/SimControls';
import { TelemetryPanel } from './ui/TelemetryPanel';
import { useSimLoop } from './loop/simLoop';
import { useKeyboardInput } from './control/input';

export default function App() {
  useKeyboardInput();
  useSimLoop();

  useEffect(() => {
    document.title = 'RC Car MuJoCo Sim';
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      <SimControls />
      <div className="flex flex-1 min-h-0">
        <aside className="w-60 shrink-0 border-r border-neutral-800 bg-neutral-950 text-xs font-mono p-3 overflow-y-auto">
          <h2 className="text-neutral-300 font-semibold mb-2">Tuning</h2>
          <p className="text-neutral-500">Leva panel mounts here at milestone 7.</p>
        </aside>
        <main className="relative flex-1 min-w-0">
          <Scene />
          <HUD />
        </main>
        <aside className="w-80 shrink-0 border-l border-neutral-800 bg-neutral-950 text-xs font-mono p-2 overflow-hidden flex flex-col">
          <h2 className="text-neutral-300 font-semibold mb-1 px-1">Telemetry</h2>
          <div className="flex-1 min-h-0">
            <TelemetryPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}
