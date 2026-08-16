import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useWorkspace } from '../workspace';
import { fileBadge } from '../languages';

interface Node {
  name: string;
  dir: boolean;
  path: string;
  open?: boolean;
}

/**
 * Collapsible explorer: hidden by default, wakes when the cursor touches the
 * left edge, pushes the workspace aside instead of covering it.
 */
export default function FileTree({ awake, onCollapse }: { awake: boolean; onCollapse: () => void }) {
  const { repo } = useStore();
  const { openFile, active } = useWorkspace();
  const [tree, setTree] = useState<Node[]>([]);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    api.fsList('').then((r) => setTree((r.data ?? []).map(toNode(''))));
  }, [repo]);

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

  const shown = awake || pinned;

  return (
    <div
      className="relative shrink-0"
      style={{ width: shown ? 240 : 0, transition: 'width .28s cubic-bezier(.16,1,.3,1)' }}
      onMouseLeave={onCollapse}
    >
      <div className="h-full overflow-hidden" style={{ width: 240 }}>
        <div className="glass flex h-full flex-col overflow-hidden" style={{ width: 240 }}>
          <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
            <span className="flex-1 text-[11px] uppercase tracking-wider text-white/40">Explorer</span>
            <button
              className={`rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${pinned ? 'text-lilac' : 'text-white/30 hover:text-white/70'}`}
              title={pinned ? 'Unpin — collapses when the cursor leaves' : 'Pin panel open'}
              onClick={() => setPinned((p) => !p)}
            >
              ⊙
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {tree.map((n) => {
              const badge = fileBadge(n.path);
              return (
                <button
                  key={n.path}
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
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The invisible hover strip on the window's left edge that wakes the explorer. */
export function ExplorerWake({ onWake, enabled }: { onWake: () => void; enabled: boolean }) {
  if (!enabled) return null;
  return <div className="fixed left-0 top-0 z-50 h-full w-1.5" onMouseEnter={onWake} />;
}
