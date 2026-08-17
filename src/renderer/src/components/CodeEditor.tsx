import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit, foldGutter } from '@codemirror/language';
import { api, gitCall } from '../lib/api';
import { useStore } from '../store';
import { useWorkspace } from '../workspace';
import { useSettings } from '../settings';
import { inlineSuggestion } from '../editor/inlineSuggest';
import { lumaHighlighting } from '../editor/highlight';
import { langSupport, keywordsFor, fileBadge } from '../languages';
import FileHistoryModal from './FileHistoryModal';

export default function CodeEditor({ path }: { path: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { refresh, setToast } = useStore();
  const { markDirty } = useWorkspace();
  const { settings } = useSettings();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const conf = useMemo(() => ({ language: new Compartment(), theme: new Compartment(), suggest: new Compartment() }), []);

  const badge = fileBadge(path);

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
        '.cm-line': settings.wordWrap ? { whiteSpace: 'pre-wrap' } : {},
      }),
    [settings.fontSize, settings.wordWrap],
  );

  const suggestExts = useMemo(
    () => (settings.autocomplete ? inlineSuggestion(keywordsFor(path, settings.installedPacks), () => true) : []),
    [settings.autocomplete, settings.installedPacks, path],
  );

  useEffect(() => {
    let disposed = false;
    api.fsRead(path).then((r) => {
      if (disposed || !holder.current) return;
      const state = EditorState.create({
        doc: r.ok ? r.data ?? '' : '',
        extensions: [
          conf.language.of([...langSupport(path, settings.installedPacks), indentUnit.of(' '.repeat(settings.tabSize))]),
          conf.theme.of(themeExts),
          conf.suggest.of(suggestExts),
          lumaHighlighting,
          lineNumbers(),
          history(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          foldGutter(),
          bracketMatching(),
          indentOnInput(),
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

  // live-apply language packs, settings changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        conf.language.reconfigure([...langSupport(path, settings.installedPacks), indentUnit.of(' '.repeat(settings.tabSize))]),
        conf.theme.reconfigure(themeExts),
        conf.suggest.reconfigure(suggestExts),
      ] as never,
    });
  }, [themeExts, suggestExts, settings.installedPacks, settings.tabSize, conf, path]);

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
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: badge.color, background: `${badge.color}1e`, border: `1px solid ${badge.color}44` }}>
          {badge.label}
        </span>
        <span className="flex-1 truncate font-mono text-[11px] text-white/50">{path}</span>
        {settings.autocomplete && <span className="text-[10px] text-white/25">Tab completes</span>}
        <button className={`btn px-3 py-1 text-[11px] ${dirty ? 'border-lilac/50 text-lilac' : 'opacity-40'}`} disabled={!dirty || saving} onClick={save}>
          Save {dirty ? '●' : ''}
        </button>
        <button className="btn px-3 py-1 text-[11px]" title="View save history and restore" onClick={() => setShowHistory(true)}>
          History
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
      {showHistory && (
        <FileHistoryModal
          path={path}
          onRestore={(content) => {
            if (viewRef.current) {
              viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: content } });
              setDirty(true);
            }
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
