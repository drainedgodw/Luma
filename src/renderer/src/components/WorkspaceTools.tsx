import { useEffect, useMemo, useRef, useState } from 'react';
import { api, requireData, type WorkspaceMatch } from '../lib/api';
import { useStore } from '../store';
import { useWorkspace } from '../workspace';
import { fileBadge } from '../languages';
const fileName = (path: string) => path.split('/').pop() || path;
function fuzzyRank(path: string, query: string): number {
  const lower = path.toLocaleLowerCase();
  const name = fileName(path).toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  if (!needle) return 10;
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (name.includes(needle)) return 2;
  if (lower.startsWith(needle)) return 3;
  if (lower.includes(needle)) return 4;
  let cursor = 0;
  for (const char of lower) if (char === needle[cursor]) cursor += 1;
  return cursor === needle.length ? 5 : 99;
}
export function QuickOpen({ close }: { close: () => void }) {
  const { openFile } = useWorkspace();
  const { setToast } = useStore();
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void requireData(api.workspaceFiles(), 'Could not scan workspace')
      .then((items) => {
        if (active) setFiles(items);
      })
      .catch((error) => setToast((error as Error).message))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setToast]);
  const filtered = useMemo(
    () =>
      files
        .map((path) => ({ path, score: fuzzyRank(path, query.trim()) }))
        .filter((item) => item.score < 99)
        .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
        .slice(0, 100)
        .map((item) => item.path),
    [files, query]
  );
  useEffect(() => setSelected(0), [query]);
  function choose(path = filtered[selected]) {
    if (!path) return;
    openFile(path);
    close();
  }
  return (
    <Modal title="Quick Open" hint="Ctrl+P" close={close}>
      <input
        autoFocus
        className="field w-full px-3 py-2 text-sm"
        placeholder="Type a file name or path…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelected((value) => Math.min(filtered.length - 1, value + 1));
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected((value) => Math.max(0, value - 1));
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            choose();
          }
        }}
      />
      <div className="mt-2 max-h-[55vh] overflow-y-auto rounded-xl border border-white/8 bg-black/15 p-1">
        {loading && <div className="p-4 text-center text-xs text-white/35">Scanning files…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-4 text-center text-xs text-white/35">No matching files</div>
        )}
        {filtered.map((path, index) => {
          const badge = fileBadge(path);
          return (
            <button
              key={path}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${selected === index ? 'bg-lilac/15 text-white' : 'text-white/60 hover:bg-white/5'}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => choose(path)}
            >
              <span
                className="w-8 rounded px-1 text-center text-[8px] font-bold leading-4"
                style={{ color: badge.color, background: `${badge.color}1c` }}
              >
                {badge.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs">{fileName(path)}</span>
                <span className="block truncate font-mono text-[10px] text-white/30">{path}</span>
              </span>
              <span className="text-[10px] text-white/25">↵</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-white/25">
        ↑ ↓ select · Enter open · Esc close · {files.length} files indexed
      </div>
    </Modal>
  );
}
export function WorkspaceSearch({ close }: { close: () => void }) {
  const { openFile } = useWorkspace();
  const { setToast } = useStore();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<WorkspaceMatch[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setMatches([]);
      setLoading(false);
      return;
    }
    const id = ++request.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void requireData(api.workspaceSearch(value), 'Workspace search failed')
        .then((items) => {
          if (request.current === id) {
            setMatches(items);
            setSelected(0);
          }
        })
        .catch((error) => setToast((error as Error).message))
        .finally(() => {
          if (request.current === id) setLoading(false);
        });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, setToast]);
  function choose(item = matches[selected]) {
    if (!item) return;
    openFile(item.path);
    window.dispatchEvent(
      new CustomEvent('luma:reveal-line', { detail: { path: item.path, line: item.row } })
    );
    close();
  }
  return (
    <Modal title="Search in Workspace" hint="Ctrl+Shift+F" close={close}>
      <input
        autoFocus
        className="field w-full px-3 py-2 text-sm"
        placeholder="Search text in all project files…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelected((value) => Math.min(matches.length - 1, value + 1));
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected((value) => Math.max(0, value - 1));
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            choose();
          }
        }}
      />
      <div className="mt-2 max-h-[55vh] overflow-y-auto rounded-xl border border-white/8 bg-black/15 p-1">
        {loading && <div className="p-3 text-center text-xs text-white/35">Searching…</div>}
        {!loading && query.trim() && matches.length === 0 && (
          <div className="p-4 text-center text-xs text-white/35">No matches</div>
        )}
        {!query.trim() && (
          <div className="p-4 text-center text-xs text-white/35">
            Type text to search this workspace
          </div>
        )}
        {matches.map((item, index) => (
          <button
            key={`${item.path}:${item.row}:${index}`}
            className={`block w-full rounded-lg px-3 py-2 text-left ${selected === index ? 'bg-lilac/15' : 'hover:bg-white/5'}`}
            onMouseEnter={() => setSelected(index)}
            onClick={() => choose(item)}
          >
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/65">
                {item.path}
              </span>
              <span className="text-[10px] text-lilac">Ln {item.row}</span>
            </span>
            <span className="mt-1 block truncate font-mono text-[10px] text-white/35">
              {item.text || ' '}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-white/25">
        Up to 240 matches · dependencies, generated files and caches are skipped
      </div>
    </Modal>
  );
}
function Modal({
  title,
  hint,
  close,
  children,
}: {
  title: string;
  hint: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-[90] flex items-start justify-center bg-black/65 px-6 pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section className="glass w-full max-w-2xl p-4 shadow-2xl">
        <header className="mb-3 flex items-center gap-3">
          <span className="text-sm font-semibold text-white/80">{title}</span>
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-white/30">
            {hint}
          </span>
          <span className="flex-1" />
          <button className="btn px-2 py-1 text-xs" onClick={close}>
            Esc
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
