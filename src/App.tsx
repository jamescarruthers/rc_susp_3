import { useEffect, useState } from 'react';
import { Scene } from './render/Scene';
import { HUD } from './ui/HUD';
import { SimControls } from './ui/SimControls';
import { TelemetryPanel } from './ui/TelemetryPanel';
import { TuningPanel } from './ui/TuningPanel';
import { MjcfEditor } from './ui/MjcfEditor';
import { useSimLoop } from './loop/simLoop';
import { useKeyboardInput } from './control/input';
import { useGamepadInput } from './control/gamepad';
import { PresetBar } from './ui/PresetBar';
import { TopBar, type AppTab } from './ui/TopBar';
import { GeometryWorkbench } from './ui/GeometryWorkbench';

export default function App() {
  useKeyboardInput();
  useGamepadInput();
  useSimLoop();
  const [tab, setTab] = useState<AppTab>('geometry');
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    document.title = 'RC Suspension Workbench';
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      <TopBar tab={tab} setTab={setTab} />
      {tab === 'geometry' ? (
        <GeometryWorkbench />
      ) : (
        <>
          <SimControls />
          <PresetBar />
          <div className="flex flex-1 min-h-0">
            <aside className="w-72 shrink-0 border-r border-neutral-800 bg-neutral-950 text-xs font-mono overflow-hidden flex flex-col">
              <h2 className="text-neutral-300 font-semibold p-2">Tuning</h2>
              <div className="flex-1 min-h-0">
                <TuningPanel />
              </div>
            </aside>
            <main className="relative flex-1 min-w-0 flex flex-col">
              <div className="relative flex-1 min-h-0">
                <Scene />
                <HUD />
                <button
                  className="absolute top-2 right-2 text-xs bg-neutral-800/80 hover:bg-neutral-700 px-2 py-1 rounded"
                  onClick={() => setEditorOpen((v) => !v)}
                >
                  {editorOpen ? 'Hide MJCF' : 'Show MJCF'}
                </button>
              </div>
              {editorOpen && (
                <div className="h-72 border-t border-neutral-800 bg-neutral-950 shrink-0">
                  <MjcfEditor />
                </div>
              )}
            </main>
            <aside className="w-80 shrink-0 border-l border-neutral-800 bg-neutral-950 text-xs font-mono p-2 overflow-hidden flex flex-col">
              <h2 className="text-neutral-300 font-semibold mb-1 px-1">Telemetry</h2>
              <div className="flex-1 min-h-0">
                <TelemetryPanel />
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
