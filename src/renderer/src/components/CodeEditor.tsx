import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, foldGutter } from '@codemirror/language';
import { classHighlighter } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { api, gitCall } from '../lib/api';
import { useStore } from '../store';
import { useWorkspace } from '../workspace';
import { useSettings } from '../settings';
import { inlineSuggestion } from '../editor/inlineSuggest';
import { keywordsFor } from '../languages';

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
  const { settings } = useSettings();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const conf = useMemo(
    () => ({
      language: new Compartment(),
      theme: new Compartment(),
      suggest: new Compartment(),
    }),
    [],
  );

  const themeExts = useMemo(
    () =>
      EditorView.theme({
        '&': { height: '100%', backgroundColor: 'transparent', color: '#d4d4d4', fontSize: `${settings.fontSize}px` },
        '.cm-content': { caretColor: '#c4b5fd', padding: '10px 0', fontFamily: 'var(--font-mono)' },
        '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.045)' },
        '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.05)', color: '#c4b5fd' },
        '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'rgba(255,255,255,0.22)' },
        '.cm-foldGutter span': { color: 'rgba(196,181,253,0.5)' },
        '.cm-selectionBackground, .cm-editor ::selection': { backgroundColor: 'rgba(139,92,246,0.28) !important' },
        '.cm-cursor': { borderLeftColor: '#c4b5fd', borderLeftWidth: '2px' },
        '.cm-matchingBracket': { backgroundColor: 'rgba(139,92,246,0.25)', outline: '1px solid rgba(196,181,253,0.5)' },
        '.cm-ghostText': { color: 'rgba(255,255,255,0.38)', fontStyle: 'italic' },
        '.cm-scroller': settings.wordWrap ? { overflowX: 'hidden' } : {},
        '.cm-line': settings.wordWrap ? { whiteSpace: 'pre-wrap' } : {},
        '.cm-tooltip': { background: '#13131f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px' },
      }),
    [settings.fontSize, settings.wordWrap],
  );

  useEffect(() => {
    let disposed = false;
    api.fsRead(path).then((r) => {
      if (disposed || !holder.current) return;
      const keywords = keywordsFor(path);
      const state = EditorState.create({
        doc: r.ok ? r.data ?? '' : '',
        extensions: [
          conf.language.of([langFor(path), indentUnit.of(' '.repeat(settings.tabSize))]),
          conf.theme.of(themeExts),
          conf.suggest.of(settings.autocomplete ? inlineSuggestion(keywords, () => true) : []),
          lineNumbers(),
          history(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          foldGutter(),
          bracketMatching(),
          indentOnInput(),
          syntaxHighlighting(classHighlighter, { fallback: true }),
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
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              setDirty(true);
              markDirty(path, true);
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // live-apply settings without recreating the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: [conf.theme.reconfigure(themeExts), conf.suggest.reconfigure(settings.autocomplete ? inlineSuggestion(keywordsFor(path), () => true) : [])] as never });
  }, [themeExts, settings.autocomplete, settings.tabSize, conf, path]);

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
        <span className="text-[10px] text-white/25">{settings.autocomplete ? 'Tab completes' : ''}</span>
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
