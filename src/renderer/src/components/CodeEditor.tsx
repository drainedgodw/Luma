import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, defaultHighlightStyle, foldGutter } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { api, gitCall } from '../lib/api';
import { useStore } from '../store';
import { useWorkspace } from '../workspace';

function langFor(path: string) {
  if (/\.(ts|tsx|js|jsx|mjs)$/.test(path)) return javascript({ typescript: true, jsx: true });
  if (path.endsWith('.json')) return json();
  if (/\.(md|markdown)$/.test(path)) return markdown();
  if (path.endsWith('.py')) return python();
  return [];
}

export default function CodeEditor({ path }: { path: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { refresh, setToast } = useStore();
  const { markDirty } = useWorkspace();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let disposed = false;
    api.fsRead(path).then((r) => {
      if (disposed || !holder.current) return;
      const state = EditorState.create({
        doc: r.ok ? r.data ?? '' : '',
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          foldGutter(),
          bracketMatching(),
          indentOnInput(),
          indentUnit.of('  '),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                save();
                return true;
              },
            },
          ]),
          langFor(path),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              setDirty(true);
              markDirty(path, true);
            }
          }),
          EditorView.theme({
            '&': { height: '100%', backgroundColor: 'transparent', color: '#e6e6f0' },
            '.cm-content': { caretColor: '#c4b5fd', padding: '10px 0' },
            '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
            '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)' },
            '.cm-foldGutter span': { color: 'rgba(196,181,253,0.5)' },
            '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(139,92,246,0.25) !important' },
          }),
        ],
      });
      viewRef.current = new EditorView({ state, parent: holder.current });
    });
    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [path]);

  async function save() {
    if (!viewRef.current) return;
    setSaving(true);
    try {
      await api.fsWrite(path, viewRef.current.state.doc.toString());
      setDirty(false);
      markDirty(path, false);
      await refresh();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-1.5">
        <span className="flex-1 truncate font-mono text-[11px] text-white/50">{path}</span>
        <button className={`btn px-3 py-1 text-[11px] ${dirty ? 'border-lilac/50 text-lilac' : 'opacity-40'}`} disabled={!dirty || saving} onClick={save}>
          Save {dirty ? '●' : ''}
        </button>
        <button
          className="btn px-3 py-1 text-[11px]"
          title="Stage this file"
          onClick={async () => {
            if (dirty) await save();
            try {
              await gitCall('stage', [path]);
              await refresh();
            } catch (e) {
              setToast((e as Error).message);
            }
          }}
        >
          Stage
        </button>
      </div>
      <div ref={holder} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
