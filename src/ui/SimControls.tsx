import { useSimStore } from '../store/simStore';

export function SimControls() {
  const paused = useSimStore((s) => s.paused);
  const timeScale = useSimStore((s) => s.timeScale);
  const time = useSimStore((s) => s.time);
  const fps = useSimStore((s) => s.fps);
  const physicsHz = useSimStore((s) => s.physicsHz);
  const status = useSimStore((s) => s.status);
  const error = useSimStore((s) => s.error);
  const overlay = useSimStore((s) => s.overlay);
  const followCam = useSimStore((s) => s.followCam);

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-neutral-900 border-b border-neutral-800 text-xs font-mono">
      <button
        className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-700 text-white"
        onClick={() => useSimStore.getState().setPaused(!paused)}
        disabled={status !== 'ready'}
      >
        {paused ? 'Play' : 'Pause'}
      </button>
      <button
        className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50"
        onClick={() => useSimStore.getState().reset()}
        disabled={status !== 'ready'}
      >
        Reset
      </button>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={overlay}
          onChange={(e) => useSimStore.getState().setOverlay(e.target.checked)}
        />
        overlay
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={followCam}
          onChange={(e) => useSimStore.getState().setFollowCam(e.target.checked)}
        />
        follow
      </label>
      <label className="flex items-center gap-2">
        Speed
        <input
          type="range"
          min={0.1}
          max={2}
          step={0.1}
          value={timeScale}
          onChange={(e) => useSimStore.getState().setTimeScale(parseFloat(e.target.value))}
        />
        <span className="w-10 text-right">{timeScale.toFixed(1)}x</span>
      </label>
      <span className="ml-auto flex gap-4">
        <span>t = {time.toFixed(3)} s</span>
        <span>render {fps.toFixed(0)} Hz</span>
        <span>physics {physicsHz.toFixed(0)} Hz</span>
        <span
          className={
            status === 'ready'
              ? 'text-emerald-400'
              : status === 'error'
                ? 'text-rose-400'
                : 'text-amber-300'
          }
        >
          {status}
          {error ? `: ${error}` : ''}
        </span>
      </span>
    </div>
  );
}
