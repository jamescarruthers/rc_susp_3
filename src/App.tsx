import { useEffect } from 'react';
import { Scene } from './render/Scene';
import { HUD } from './ui/HUD';
import { SimControls } from './ui/SimControls';
import { TelemetryPanel } from './ui/TelemetryPanel';
import { TuningPanel } from './ui/TuningPanel';
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
        <aside className="w-72 shrink-0 border-r border-neutral-800 bg-neutral-950 text-xs font-mono overflow-hidden flex flex-col">
          <h2 className="text-neutral-300 font-semibold p-2">Tuning</h2>
          <div className="flex-1 min-h-0">
            <TuningPanel />
          </div>
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
