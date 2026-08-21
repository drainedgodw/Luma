import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useWorkspace } from '../workspace';
import { useSettings } from '../settings';
import { fileBadge } from '../languages';
import { Icon } from './Icons';

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

interface Menu {
  x: number;
  y: number;
  node: Node;
}

/**
 * Explorer shutter. Pinned: always in place. Auto: a transform-only overlay
 * that wakes from the full-height line on the right edge of the nav rail.
 */
export default function FileTree({ awake, onCollapse }: { awake: boolean; onCollapse: () => void }) {
  const { repo } = useStore();
  const { openFile, active } = useWorkspace();
  const { settings } = useSettings();
  const [tree, setTree] = useState<Node[]>([]);
  const [creating, setCreating] = useState<Creating | null>(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const collapseTimer = useRef<number | null>(null);
  const pinned = settings.explorer === 'pinned';

  const reload = useCallback(() => {
    api.fsList('').then((r) => setTree((r.data ?? []).map(toNode(''))));
  }, []);

  const refreshDir = useCallback(async (parent: string) => {
    if (!parent) return reload();
    const rr = await api.fsList(parent);
    const children = (rr.data ?? []).map(toNode(parent));
    setTree((prev) => {
      const idx = prev.findIndex((x) => x.path === parent);
      const copy = [...prev];
      const oldCount = prev.filter((x) => x.path.startsWith(parent + '/')).length;
      copy.splice(idx + 1, oldCount, ...children);
      return copy.map((x) => (x.path === parent ? { ...x, open: true } : x));
    });
  }, [reload]);

  const cancelCollapse = useCallback(() => {
    if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
    collapseTimer.current = null;
  }, []);

  const scheduleCollapse = useCallback(() => {
    if (pinned) return;
    cancelCollapse();
    collapseTimer.current = window.setTimeout(onCollapse, 180);
  }, [cancelCollapse, onCollapse, pinned]);

  useEffect(() => () => cancelCollapse(), [cancelCollapse]);

  async function doRename(node: Node) {
    const name = renameDraft.trim().replace(/\//g, '-');
    setRenaming(null);
    if (!name || name === node.name) return;
    const r = await api.fsRename(node.path, name);
    if (r.ok) {
      await refreshDir(node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '');
    }
  }

  async function doDelete(node: Node) {
    setMenu(null);
    const ok = window.confirm(`Delete ${node.dir ? 'folder' : 'file'} “${node.name}”?` + (node.dir ? ' Everything inside goes too.' : ''));
    if (!ok) return;
    const r = await api.fsDelete(node.path, node.dir);
    if (r.ok) {
      await refreshDir(node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '');
    }
  }

  async function doDuplicate(node: Node) {
    setMenu(null);
    const r = await api.fsDuplicate(node.path);
    if (r.ok) {
      await refreshDir(node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '');
    }
  }

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
      const rr = await api.fsList(creating.parent);
      const children = (rr.data ?? []).map(toNode(creating.parent));
      setTree((prev) => {
        const idx = prev.findIndex((x) => x.path === creating.parent);
        const copy = [...prev];
        copy.splice(idx + 1, 1, ...children);
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

  return (
    <div
      className={pinned ? 'explorer-pinned shrink-0' : 'explorer-flyout'}
      data-awake={pinned || awake ? 'true' : 'false'}
      onMouseEnter={cancelCollapse}
      onMouseLeave={scheduleCollapse}
    >
      <div className="glass flex h-full flex-col overflow-hidden" style={{ width: 240 }}>
        <div className="flex items-center gap-1 border-b border-white/8 px-3 py-2">
          <span className="flex-1 text-[11px] uppercase tracking-wider text-white/40">Explorer</span>
          <button className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-white/45 hover:bg-white/8 hover:text-teal" title="New file in project root" onClick={() => startCreating('', 'file')}>
            <Icon name="filePlus" /> file
          </button>
          <button className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-white/45 hover:bg-white/8 hover:text-teal" title="New folder in project root" onClick={() => startCreating('', 'dir')}>
            <Icon name="folderPlus" /> folder
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {creating?.parent === '' && creating.afterPath === undefined && draftRow}
          {tree.map((n) => {
            const badge = fileBadge(n.path);
            return (
              <div key={n.path} className="group/row">
                <button
                  onClick={() => toggle(n)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, node: n });
                  }}
                  className={`flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs hover:bg-white/6 ${
                    active === n.path ? 'bg-lilac/10 text-lilac' : n.dir ? 'text-white/70' : 'text-white/50'
                  }`}
                >
                  <span className="w-3 shrink-0 text-white/30">{n.dir ? (n.open ? '▾' : '▸') : ''}</span>
                  {renaming === n.path ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') doRename(n);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onBlur={() => doRename(n)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded border border-lilac/40 bg-black/30 px-1.5 py-0.5 text-xs outline-none"
                      style={{ userSelect: 'text' }}
                    />
                  ) : (
                    <>
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
                        <span className="ml-auto hidden shrink-0 items-center gap-1 pr-1 group-hover/row:flex">
                          <span
                            className="rounded p-0.5 text-white/40 hover:text-teal"
                            title={`New file in ${n.name}/`}
                            onClick={(e) => {
                              e.stopPropagation();
                              startCreating(n.path, 'file');
                            }}
                          >
                            <Icon name="filePlus" />
                          </span>
                          <span
                            className="rounded p-0.5 text-white/40 hover:text-teal"
                            title={`New folder in ${n.name}/`}
                            onClick={(e) => {
                              e.stopPropagation();
                              startCreating(n.path, 'dir');
                            }}
                          >
                            <Icon name="folderPlus" />
                          </span>
                        </span>
                      )}
                    </>
                  )}
                </button>
                {creating?.parent === n.path && n.open && draftRow}
              </div>
            );
          })}
        </div>
      </div>
      {menu && (
        <>
          <div className="fixed inset-0 z-[70]" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="glass anim-in fixed z-[71] w-44 p-1.5" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: menu.y }}>
            {!menu.node.dir && (
              <>
                <MenuItem label="Open in editor" onClick={() => { toggle(menu.node); setMenu(null); }} />
                <MenuItem label="Duplicate" hint="copy" onClick={() => doDuplicate(menu.node)} />
              </>
            )}
            <MenuItem
              label="Rename…"
              hint="git mv"
              onClick={() => {
                setRenaming(menu.node.path);
                setRenameDraft(menu.node.name);
                setMenu(null);
              }}
            />
            <div className="my-1 h-px bg-white/10" />
            <MenuItem label={menu.node.dir ? 'Delete folder' : 'Delete file'} hint="git rm" danger onClick={() => doDelete(menu.node)} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, hint, onClick, danger }: { label: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-white/8 ${danger ? 'text-rose' : 'text-white/75'}`}
    >
      <span>{label}</span>
      {hint && <span className="font-mono text-[9px] text-white/25">{hint}</span>}
    </button>
  );
}

/** Full-height line on the right edge of the nav rail that wakes Explorer. */
export function ExplorerWake({ onWake, enabled }: { onWake: () => void; enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div className="explorer-wake-zone" aria-hidden="true" onPointerEnter={onWake}>
      <span className="explorer-wake-handle" />
    </div>
  );
}
