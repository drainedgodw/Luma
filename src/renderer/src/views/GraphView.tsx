import { useMemo, useRef, useState } from 'react';
import type { Commit, DiffFile } from '@shared/types';
import { layoutGraph, LANE_COLORS } from '@shared/graph';
import { useStore } from '../store';
import { gitCall } from '../lib/api';
import DiffView from '../components/DiffView';
import { Icon } from '../components/Icons';

const ROW = 56;
const LANE_W = 30;
const TOP_PAD = 20;

export default function GraphView() {
  const { commits, refresh, status, setToast, repo } = useStore();
  const [selected, setSelected] = useState<Commit | null>(null);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [branchMenu, setBranchMenu] = useState(false);
  const [rebaseMenu, setRebaseMenu] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const laid = useMemo(() => layoutGraph(commits), [commits]);
  const byHash = useMemo(() => new Map(laid.map((c) => [c.hash, c])), [laid]);
  const rowIndex = useMemo(() => new Map(laid.map((c, i) => [c.hash, i])), [laid]);

  // branch names on this repo (from refs decoration)
  const branchTips = useMemo(() => {
    const tips = new Map<string, string>();
    for (const c of laid) {
      for (const r of c.refs) {
        const m = r.match(/^(?:HEAD -> )?([^,]+)/);
        if (m) tips.set(m[1].trim(), c.hash);
      }
    }
    return tips;
  }, [laid]);

  const localBranches = useMemo(
    () => [...branchTips.keys()].filter((b) => !b.startsWith('origin/') && b !== 'HEAD'),
    [branchTips],
  );

  async function selectCommit(c: Commit) {
    setSelected(c);
    setDiff(null);
    try {
      setDiff(await gitCall<DiffFile[]>('commitDiff', c.hash));
    } catch {
      setDiff([]);
    }
  }

  async function action(fn: () => Promise<unknown>, okMsg?: string) {
    try {
      await fn();
      await refresh();
      if (okMsg) setToast(okMsg);
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  const height = Math.max(laid.length * ROW + TOP_PAD * 2, 400);

  return (
    <div className="flex h-full gap-3">
      <div className="glass relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* toolbar */}
        <div className="relative flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-wider text-white/40">History</span>
          <div className="flex-1" />
          <div className="relative">
            <button className="btn flex items-center gap-1.5 text-xs" onClick={() => { setRebaseMenu(false); setBranchMenu((v) => !v); }}>
              <Icon name="branch" /> Branch
            </button>
            {branchMenu && (
              <BranchMenu
                branches={localBranches}
                current={status?.branch}
                onClose={() => setBranchMenu(false)}
                action={action}
              />
            )}
          </div>
          <div className="relative">
            <button className="btn text-xs" onClick={() => { setBranchMenu(false); setRebaseMenu((v) => !v); }}>Rebase…</button>
            {rebaseMenu && (
              <div className="glass anim-in absolute right-0 top-10 z-30 w-56 p-2">
                <div className="px-2 pb-1 text-[11px] text-white/40">Rebase current branch onto</div>
                {localBranches.filter((b) => b !== status?.branch).map((b) => (
                  <button key={b} className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/8"
                    onClick={() => { setRebaseMenu(false); action(() => gitCall('rebase', b)); }}>
                    {b}
                  </button>
                ))}
                <div className="mt-1 border-t border-white/10 pt-1">
                  <button className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-amber hover:bg-white/8"
                    onClick={() => { setRebaseMenu(false); action(() => gitCall('rebaseAbort')); }}>Abort rebase</button>
                  <button className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-teal hover:bg-white/8"
                    onClick={() => { setRebaseMenu(false); action(() => gitCall('rebaseContinue')); }}>Continue</button>
                </div>
              </div>
            )}
          </div>
          <button className="btn text-xs" onClick={() => action(() => gitCall('fetch', 'origin'))}>Fetch</button>
          <button className="btn text-xs" onClick={() => action(() => gitCall('pull'))}>Pull</button>
          <button className="btn btn-primary text-xs" onClick={() => action(() => gitCall('push', !status?.upstream))}>Push</button>
        </div>

        {/* graph */}
        <div ref={scroller} className="relative flex-1 overflow-y-auto" onClick={() => setBranchMenu(false)}>
          <div style={{ height }} className="relative">
            <svg width={LANE_W * 12} height={height} className="absolute left-0 top-0 pointer-events-none">
              {laid.map((c, i) => {
                const y = TOP_PAD + i * ROW + ROW / 2;
                const x = 24 + c.lane * LANE_W;
                const color = LANE_COLORS[c.lane % LANE_COLORS.length];
                const segs: React.ReactNode[] = [];
                for (const p of c.parents) {
                  const pi = rowIndex.get(p);
                  if (pi === undefined) continue;
                  const pc = byHash.get(p)!;
                  const py = TOP_PAD + pi * ROW + ROW / 2;
                  const px = 24 + pc.lane * LANE_W;
                  if (px === x) {
                    segs.push(<line key={p} x1={x} y1={y} x2={x} y2={py} stroke={color} strokeWidth="2" opacity="0.55" />);
                  } else {
                    segs.push(
                      <path key={p} d={`M ${x} ${y} C ${x} ${y + ROW * 0.6}, ${px} ${py - ROW * 0.6}, ${px} ${py}`}
                        fill="none" stroke={color} strokeWidth="2" opacity="0.55" />,
                    );
                  }
                }
                return <g key={c.hash}>{segs}</g>;
              })}
            </svg>

            {laid.map((c, i) => {
              const color = LANE_COLORS[c.lane % LANE_COLORS.length];
              const isSel = selected?.hash === c.hash;
              const isHead = c.refs.some((r) => r.startsWith('HEAD'));
              return (
                <div
                  key={c.hash}
                  onClick={() => selectCommit(c)}
                  className={`absolute flex cursor-pointer items-center gap-3 rounded-xl px-3 transition-colors duration-150 hover:bg-white/5 ${isSel ? 'bg-lilac/10' : ''}`}
                  style={{ top: TOP_PAD + i * ROW, left: LANE_W * 12 - 10, right: 8, height: ROW - 8 }}
                >
                  <div className="relative flex items-center" style={{ marginLeft: 24 + c.lane * LANE_W - (LANE_W * 12 - 10) - 7 }}>
                    <span
                      className={`block rounded-full ${isSel ? 'node-selected' : ''}`}
                      style={{
                        width: isHead ? 14 : 11,
                        height: isHead ? 14 : 11,
                        background: color,
                        boxShadow: isHead ? `0 0 12px ${color}` : 'none',
                        border: isHead ? '2px solid #fff' : 'none',
                      }}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] text-white/85">{c.message}</span>
                    <span className="flex items-center gap-2 text-[11px] text-white/40">
                      <span style={{ color: LANE_COLORS[c.lane % LANE_COLORS.length] }}>{c.shortHash}</span>
                      <span>{c.author}</span>
                      <span>{new Date(c.timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {c.refs
                      .filter((r) => r !== 'HEAD')
                      .map((r) => {
                        const isCurrent = r.startsWith('HEAD -> ');
                        const name = r.replace('HEAD -> ', '');
                        const remote = name.includes('/');
                        return (
                          <span key={r} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                            remote ? 'border-white/15 text-white/50' : isCurrent ? 'border-teal/50 bg-teal/10 text-teal' : 'border-lilac/40 text-lilac'
                          }`}>
                            {!remote && <Icon name="branch" />} {name.replace('origin/', '')}
                          </span>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* detail panel */}
      {selected && (
        <div className="glass anim-in flex w-[38%] min-w-[320px] flex-col overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-sm text-white/90">{selected.message}</div>
            <div className="mt-1 text-[11px] text-white/40">
              {selected.author} · {new Date(selected.timestamp * 1000).toLocaleString()} · {selected.hash.slice(0, 10)}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {diff === null && <div className="p-4 text-xs text-white/40">Loading diff…</div>}
            {diff?.length === 0 && <div className="p-4 text-xs text-white/40">No textual changes (merge or empty commit).</div>}
            {diff?.map((f) => <DiffView key={f.newPath} file={f} />)}
          </div>
        </div>
      )}
      {repo === null && null}
    </div>
  );
}

function BranchMenu({
  branches, current, onClose, action,
}: {
  branches: string[]; current?: string; onClose: () => void;
  action: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  return (
    <div className="glass anim-in absolute right-0 top-10 z-30 w-64 p-2">
      <input className="field mb-2 w-full text-xs" placeholder="New branch name…" value={name}
        onChange={(e) => setName(e.target.value)} />
      <button
        className="btn btn-primary mb-2 w-full text-xs"
        disabled={!name.trim()}
        onClick={() => { onClose(); action(() => gitCall('checkout', 'HEAD', name.trim())); }}
      >
        Create & switch
      </button>
      <div className="border-t border-white/10 pt-1">
        {branches.map((b) => (
          <div key={b} className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/8">
            <button className={`flex-1 truncate text-left text-xs ${b === current ? 'text-teal' : ''}`}
              onClick={() => { onClose(); if (b !== current) action(() => gitCall('checkout', b)); }}>
              {b}
            </button>
            {b !== current && (
              <button className="ml-2 hidden text-[10px] text-rose group-hover:block"
                onClick={() => { onClose(); action(() => gitCall('deleteBranch', b, false)); }}>
                delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
