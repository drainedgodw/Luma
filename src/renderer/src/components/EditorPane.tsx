import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { api, gitCall } from '../lib/api';
import { useStore } from '../store';

function langFor(path: string) {
  if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) return javascript({ typescript: true, jsx: true });
  if (path.endsWith('.json')) return json();
  if (path.endsWith('.md')) return markdown();
  if (path.endsWith('.py')) return python();
  return [];
}

export default function EditorPane({ path }: { path: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const { refresh } = useStore();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let disposed = false;
    api.fsRead(path).then((r) => {
      if (disposed || !holder.current) return;
      const state = EditorState.create({
        doc: r.ok ? r.data : `(unreadable: ${r.error?.message})`,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          bracketMatching(),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, { key: 'Mod-s', preventDefault: true, run: () => { save(); return true; } }]),
          langFor(path),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setDirty(true);
          }),
          EditorView.theme({
            '&': { height: '100%', backgroundColor: 'transparent', color: '#e6e6f0' },
            '.cm-content': { caretColor: '#c4b5fd' },
            '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
          }),
        ],
      });
      view.current = new EditorView({ state, parent: holder.current });
    });
    return () => {
      disposed = true;
      view.current?.destroy();
      view.current = null;
      setDirty(false);
    };
  }, [path]);

  async function save() {
    if (!view.current) return;
    setSaving(true);
    await api.fsWrite(path, view.current.state.doc.toString());
    setDirty(false);
    setSaving(false);
    await refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/8 px-2 py-1.5">
        <span className="flex-1 truncate font-mono text-[11px] text-white/70" title={path}>{path.split('/').pop()}</span>
        {dirty && <span className="text-[10px] text-amber">●</span>}
        <button className={`btn px-2 py-0.5 text-[10px] ${dirty ? 'border-lilac/50 text-lilac' : 'opacity-40'}`} disabled={!dirty || saving} onClick={save}>
          Save
        </button>
        <button className="btn px-2 py-0.5 text-[10px]" title="Stage this file" onClick={() => gitCall('stage', [path]).then(refresh)}>Stage</button>
      </div>
      <div ref={holder} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
