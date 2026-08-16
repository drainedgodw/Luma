import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useWorkspace } from '../workspace';
import { useSettings } from '../settings';
import { fileBadge } from '../languages';

interface Node {
  name: string;
  dir: boolean;
  path: string;
  open?: boolean;
}

interface Creating {
  parent: string;
  kind: 'file' | 'dir';
  afterPath?: string;
}

/**
 * Explorer shutter. Pinned: always in place. Auto: fully hidden, slides out
 * when the cursor touches the left edge and pushes the workspace aside.
 */
export default function FileTree({ awake, onCollapse }: { awake: boolean; onCollapse: () => void }) {
  const { repo } = useStore();
  const { openFile, active } = useWorkspace();
  const { settings } = useSettings();
  const [tree, setTree] = useState<Node[]>([]);
  const [creating, setCreating] = useState<Creating | null>(null);
  const [draft, setDraft] = useState('');
  const pinned = settings.explorer === 'pinned';

  const reload = useCallback(() => {
    api.fsList('').then((r) => setTree((r.data ?? []).map(toNode(''))));
  }, []);

  useEffect(() => {
    reload();
  }, [repo, reload]);

  const toNode = (parent: string) => (e: { name: string; dir: boolean }): Node => ({
    ...e,
    path: parent ? `${parent}/${e.name}` : e.name,
  });

  const toggle = useCallback(
    async (n: Node) => {
      if (!n.dir) {
        openFile(n.path);
        return;
      }
      if (n.open) {
        setTree((prev) => prev.map((x) => (x.path === n.path ? { ...x, open: false } : x)).filter((x) => !x.path.startsWith(n.path + '/')));
        return;
      }
      const r = await api.fsList(n.path);
      const children = (r.data ?? []).map(toNode(n.path));
      setTree((prev) => {
        const idx = prev.findIndex((x) => x.path === n.path);
        const copy = [...prev];
        copy.splice(idx + 1, 0, ...children);
        return copy.map((x) => (x.path === n.path ? { ...x, open: true } : x));
      });
    },
    [openFile],
  );

  function startCreating(parent: string, kind: 'file' | 'dir', afterPath?: string) {
    setCreating({ parent, kind, afterPath });
    setDraft('');
  }

  async function confirmCreate() {
    if (!creating || !draft.trim()) {
      setCreating(null);
      return;
    }
    const name = draft.trim().replace(/\//g, '-');
    const r = creating.kind === 'file'
      ? await api.fsNewFile(creating.parent, name)
      : await api.fsNewDir(creating.parent, name);
    setCreating(null);
    if (!r.ok) return;
    if (creating.parent) {
      // refresh the parent's children in place
      const rr = await api.fsList(creating.parent);
      const children = (rr.data ?? []).map(toNode(creating.parent));
      setTree((prev) => {
        const idx = prev.findIndex((x) => x.path === creating.parent);
        const copy = [...prev];
        copy.splice(idx + 1, 1, ...children); // replace old children block
        return copy.map((x) => (x.path === creating.parent ? { ...x, open: true } : x));
      });
      if (creating.kind === 'file') openFile(creating.parent ? `${creating.parent}/${name}` : name);
    } else {
      reload();
      if (creating.kind === 'file') openFile(name);
    }
  }

  const draftRow = creating && (
    <div className="flex items-center gap-1.5 px-3 py-1">
      <span className="w-3 shrink-0" />
      <span
        className="w-6 shrink-0 rounded text-center text-[8px] font-bold leading-4"
        style={{ color: creating.kind === 'file' ? '#94a3b8' : '#a3a3aa', background: 'rgba(255,255,255,0.06)' }}
      >
        {creating.kind === 'file' ? 'N' : 'D'}
      </span>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmCreate();
          if (e.key === 'Escape') setCreating(null);
        }}
        onBlur={() => confirmCreate()}
        placeholder={creating.kind === 'file' ? 'file name…' : 'folder name…'}
        className="w-full rounded border border-lilac/40 bg-black/30 px-1.5 py-0.5 text-xs outline-none"
        style={{ userSelect: 'text' }}
      />
    </div>
  );

  const shown = pinned || awake;

  return (
    <div
      className="shrink-0"
      style={{
        width: shown ? 240 : 0,
        overflow: 'hidden',
        transition: 'width .28s cubic-bezier(.16,1,.3,1)',
        pointerEvents: shown ? 'auto' : 'none',
      }}
      onMouseLeave={onCollapse}
    >
      <div className="glass flex h-full flex-col overflow-hidden" style={{ width: 240 }}>
        <div className="flex items-center gap-1 border-b border-white/8 px-3 py-2">
          <span className="flex-1 text-[11px] uppercase tracking-wider text-white/40">Explorer</span>
          <button className="rounded px-1.5 text-[13px] leading-none text-white/40 hover:text-teal" title="New file in root" onClick={() => startCreating('', 'file')}>＋</button>
          <button className="rounded px-1.5 text-[13px] leading-none text-white/40 hover:text-teal" title="New folder in root" onClick={() => startCreating('', 'dir')}>⊞</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {creating?.parent === '' && creating.afterPath === undefined && draftRow}
          {tree.map((n) => {
            const badge = fileBadge(n.path);
            return (
              <div key={n.path} className="group/row">
                <button
                  onClick={() => toggle(n)}
                  className={`flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs hover:bg-white/6 ${
                    active === n.path ? 'bg-lilac/10 text-lilac' : n.dir ? 'text-white/70' : 'text-white/50'
                  }`}
                >
                  <span className="w-3 shrink-0 text-white/30">{n.dir ? (n.open ? '▾' : '▸') : ''}</span>
                  {n.dir ? (
                    <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] bg-white/10" />
                  ) : (
                    <span
                      className="w-6 shrink-0 rounded text-center text-[8px] font-bold leading-4"
                      style={{ color: badge.color, background: `${badge.color}1c` }}
                    >
                      {badge.label}
                    </span>
                  )}
                  <span className="truncate">{n.name}</span>
                  {n.dir && (
                    <span className="ml-auto hidden shrink-0 gap-1 pr-1 group-hover/row:flex">
                      <span
                        className="rounded px-1 text-[10px] text-white/40 hover:text-teal"
                        title={`New file in ${n.name}/`}
                        onClick={(e) => {
                          e.stopPropagation();
                          startCreating(n.path, 'file');
                        }}
                      >
                        ＋
                      </span>
                      <span
                        className="rounded px-1 text-[10px] text-white/40 hover:text-teal"
                        title={`New folder in ${n.name}/`}
                        onClick={(e) => {
                          e.stopPropagation();
                          startCreating(n.path, 'dir');
                        }}
                      >
                        ⊞
                      </span>
                    </span>
                  )}
                </button>
                {creating?.parent === n.path && n.open && draftRow}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Wide invisible strip on the window's left edge that wakes the explorer (auto mode only). */
export function ExplorerWake({ onWake, enabled }: { onWake: () => void; enabled: boolean }) {
  if (!enabled) return null;
  return <div className="fixed left-0 top-0 z-50 h-full w-3" onMouseEnter={onWake} />;
}
