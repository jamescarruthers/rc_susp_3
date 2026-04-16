import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { xml } from '@codemirror/lang-xml';
import { oneDark } from '@codemirror/theme-one-dark';
import { useSimStore } from '../store/simStore';
import { requestModelReload } from '../loop/simLoop';
import { validateMjcf } from '../model/validate';

export function MjcfEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentMjcf = useSimStore((s) => s.mjcf);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: currentMjcf,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        xml(),
        oneDark,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) setDirty(true);
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the generator produces a fresh MJCF and the user hasn't edited, keep
  // the editor in sync so structural tuning panel changes show up here.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || dirty) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: currentMjcf },
    });
  }, [currentMjcf, dirty]);

  const apply = () => {
    const view = viewRef.current;
    if (!view) return;
    const xml = view.state.doc.toString();
    const v = validateMjcf(xml);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    setDirty(false);
    useSimStore.getState().setCustomMjcf(xml);
    requestModelReload(xml, false);
  };

  const doExport = () => {
    const view = viewRef.current;
    if (!view) return;
    const blob = new Blob([view.state.doc.toString()], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rc_car.xml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = (file: File) => {
    file.text().then((txt) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: txt } });
      setDirty(true);
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 p-2 border-b border-neutral-800 text-xs">
        <button
          className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
          onClick={apply}
          disabled={!dirty}
        >
          Apply
        </button>
        <button
          className="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600"
          onClick={() => {
            const view = viewRef.current;
            if (!view) return;
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: currentMjcf } });
            setDirty(false);
            setError(null);
            useSimStore.getState().setCustomMjcf(null);
          }}
        >
          Revert
        </button>
        <button className="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600" onClick={doExport}>
          Export
        </button>
        <label className="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 cursor-pointer">
          Import
          <input
            type="file"
            accept=".xml,application/xml,text/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
              e.target.value = '';
            }}
          />
        </label>
        {dirty && <span className="text-amber-400">unsaved</span>}
        {error && <span className="text-rose-400 truncate">{error}</span>}
      </div>
      <div ref={hostRef} className="flex-1 min-h-0 overflow-auto text-xs" />
    </div>
  );
}
