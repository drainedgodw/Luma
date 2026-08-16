import { useMemo, useRef, useState } from 'react';
import type { Commit, DiffFile } from '@shared/types';
import { layoutGraph, LANE_COLORS } from '@shared/graph';
import { useStore } from '../store';
import { gitCall } from '../lib/api';
import DiffView from '../components/DiffView';
import { Icon } from '../components/Icons';

const ROW = 62;
const LANE_W = 34;
const TOP_PAD = 26;
const ORB = 8; // orb radius
const HEAD_R = 10.5;

function cx(lane: number) {
  return 28 + lane * LANE_W;
}
function cy(i: number) {
  return TOP_PAD + i * ROW + ROW / 2;
}

export default function GraphView() {
  const { commits, refresh, status, setToast } = useStore();
  const [selected, setSelected] = useState<Commit | null>(null);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [branchMenu, setBranchMenu] = useState(false);
  const [rebaseMenu, setRebaseMenu] = useState(false);

  const laid = useMemo(() => layoutGraph(commits), [commits]);
  const rowIndex = useMemo(() => new Map(laid.map((c, i) => [c.hash, i])), [laid]);

  const branchTips = useMemo(() => {
    const tips = new Map<string, string>();
    for (const c of laid) {
      for (const r of c.refs) {
        const m = r.replace('HEAD -> ', '');
        if (m !== 'HEAD') tips.set(m.trim(), c.hash);
      }
    }
    return tips;
  }, [laid]);

  const localBranches = useMemo(
    () => [...branchTips.keys()].filter((b) => !b.startsWith('origin/') && !b.startsWith('tag:')),
    [branchTips],
  );

  const headHash = useMemo(() => {
    const c = laid.find((x) => x.refs.some((r) => r.startsWith('HEAD')));
    return c?.hash;
  }, [laid]);

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
  const maxLane = Math.max(0, ...laid.map((c) => c.lane));
  const graphWidth = 28 + (maxLane + 1) * LANE_W + 10;

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="glass relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* toolbar */}
        <div className="relative z-20 flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-wider text-white/40">History</span>
          <div className="flex-1" />
          <div className="relative">
            <button className="btn flex items-center gap-1.5 text-xs" onClick={() => { setRebaseMenu(false); setBranchMenu((v) => !v); }}>
              <Icon name="branch" /> Branch
            </button>
            {branchMenu && (
              <BranchMenu branches={localBranches} current={status?.branch} onClose={() => setBranchMenu(false)} action={action} />
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

        {/* graph scroll area */}
        <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => { setBranchMenu(false); setRebaseMenu(false); }}>
          <div style={{ height }} className="relative">
            <svg width={graphWidth} height={height} className="absolute left-0 top-0">
              <defs>
                <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="3.2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {LANE_COLORS.map((c, i) => (
                  <radialGradient key={i} id={`orb${i}`} cx="35%" cy="35%" r="80%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                    <stop offset="25%" stopColor={c} />
                    <stop offset="100%" stopColor={c} />
                  </radialGradient>
                ))}
              </defs>

              {/* edges */}
              {laid.map((c, i) => {
                const y = cy(i);
                const x = cx(c.lane);
                const color = LANE_COLORS[c.lane % LANE_COLORS.length];
                const isHot = hovered === c.hash || selected?.hash === c.hash;
                return c.parents.map((p, pi) => {
                  const pj = rowIndex.get(p);
                  if (pj === undefined) return null;
                  const pc = laid[pj];
                  const py = cy(pj);
                  const px = cx(pc.lane);
                  const pcolor = LANE_COLORS[pc.lane % LANE_COLORS.length];
                  const d =
                    px === x
                      ? `M ${x} ${y + ORB} L ${px} ${py - ORB}`
                      : // split/merge: vertical drop then bezier into parent lane
                        `M ${x} ${y + ORB} C ${x} ${y + ROW * 0.55}, ${px} ${py - ROW * 0.55}, ${px} ${py - ORB}`;
                  return (
                    <path
                      key={`${c.hash}-${pi}`}
                      d={d}
                      fill="none"
                      stroke={pi === 0 ? color : pcolor}
                      strokeWidth={isHot ? 2.6 : 1.6}
                      opacity={hovered && !isHot ? 0.25 : 0.6}
                      strokeLinecap="round"
                      filter={isHot ? 'url(#glow)' : undefined}
                    />
                  );
                });
              })}

              {/* orbs */}
              {laid.map((c, i) => {
                const color = LANE_COLORS[c.lane % LANE_COLORS.length];
                const isHead = c.hash === headHash;
                const isSel = selected?.hash === c.hash;
                const isHover = hovered === c.hash;
                return (
                  <g key={c.hash} className="graph-node" data-hash={c.hash}>
                    {isHead && (
                      <circle cx={cx(c.lane)} cy={cy(i)} r={HEAD_R + 5} fill="none" stroke="#c4b5fd" strokeWidth="1.2" opacity="0.5">
                        <animate attributeName="r" values={`${HEAD_R + 3};${HEAD_R + 8};${HEAD_R + 3}`} dur="2.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.55;0.12;0.55" dur="2.2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      cx={cx(c.lane)}
                      cy={cy(i)}
                      r={isHead ? HEAD_R : isSel || isHover ? ORB + 1.5 : ORB}
                      fill={`url(#orb${c.lane % LANE_COLORS.length})`}
                      opacity={hovered && !isSel && !isHover ? 0.45 : 1}
                      filter={isSel || isHead || isHover ? 'url(#glow)' : undefined}
                      style={{ transition: 'r .18s cubic-bezier(.16,1,.3,1)' }}
                    />
                    {isSel && <circle cx={cx(c.lane)} cy={cy(i)} r={ORB + 5} fill="none" stroke="#c4b5fd" strokeWidth="1.4" opacity="0.9" />}
                  </g>
                );
              })}
            </svg>

            {/* rows */}
            {laid.map((c, i) => {
              const isSel = selected?.hash === c.hash;
              return (
                <div
                  key={c.hash}
                  onMouseEnter={() => setHovered(c.hash)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => selectCommit(c)}
                  className={`absolute flex cursor-pointer items-center gap-3 rounded-xl px-3 transition-colors duration-150 ${isSel ? 'bg-lilac/12' : 'hover:bg-white/5'}`}
                  style={{ top: TOP_PAD + i * ROW, left: graphWidth, right: 8, height: ROW - 6 }}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-[13px] ${isSel ? 'text-white' : 'text-white/85'}`}>{c.message}</span>
                    <span className="flex items-center gap-2 text-[11px] text-white/40">
                      <span className="font-mono" style={{ color: LANE_COLORS[c.lane % LANE_COLORS.length] }}>{c.shortHash}</span>
                      <span>{c.author}</span>
                      <span>{timeAgo(c.timestamp)}</span>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {c.parents.length > 1 && (
                      <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">merge</span>
                    )}
                    {c.refs
                      .filter((r) => r !== 'HEAD')
                      .map((r) => {
                        const isCurrent = r.startsWith('HEAD -> ');
                        const name = r.replace('HEAD -> ', '').replace('tag: ', '');
                        const isTag = r.startsWith('tag: ');
                        const remote = name.includes('/');
                        return (
                          <span key={r} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                            isTag ? 'border-amber/40 bg-amber/10 text-amber' : remote ? 'border-white/15 text-white/50' : isCurrent ? 'border-teal/50 bg-teal/10 text-teal' : 'border-lilac/40 bg-lilac/8 text-lilac'
                          }`}>
                            {isTag ? '⚑' : !remote && <Icon name="branch" />} {name.replace('origin/', '')}
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
        <div className="glass anim-in flex w-[36%] min-w-[320px] flex-col overflow-hidden">
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
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
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
