import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { Commit, DiffFile } from '@shared/types';
import { layoutGraph } from '@shared/graph';
import { useStore } from '../store';
import { gitCall } from '../lib/api';
import DiffView from '../components/DiffView';
import { Icon } from '../components/Icons';

const ROW = 62;
const LANE_W = 34;
const TOP_PAD = 26;
const ORB = 8;
const HEAD_R = 10.5;

const GRAPH_PALETTES = {
  aurora: ['#c4b5fd', '#4fd1c5', '#f687b3', '#63b3ed', '#f6ad55', '#a78bfa'],
  mono: ['#f8fafc', '#cbd5e1', '#94a3b8', '#dbeafe', '#a5b4fc', '#e2e8f0'],
  ember: ['#fb7185', '#f97316', '#f59e0b', '#ef4444', '#fda4af', '#fbbf24'],
} as const;
type GraphTheme = keyof typeof GRAPH_PALETTES;

function savedGraphTheme(): GraphTheme {
  const value = localStorage.getItem('luma.graphTheme');
  return value === 'mono' || value === 'ember' ? value : 'aurora';
}

function cx(lane: number) { return 28 + lane * LANE_W; }
function cy(i: number) { return TOP_PAD + i * ROW + ROW / 2; }

export default function GraphView({ onRebase }: { onRebase?: (branch: string) => void }) {
  const { commits, refresh, status, setToast } = useStore();
  const [selected, setSelected] = useState<Commit | null>(null);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [branchMenu, setBranchMenu] = useState(false);
  const [rebaseMenu, setRebaseMenu] = useState(false);
  const [mode, setMode] = useState<'lanes' | 'orbit'>(() => localStorage.getItem('luma.graphMode') === 'orbit' ? 'orbit' : 'lanes');
  const [graphTheme, setGraphTheme] = useState<GraphTheme>(savedGraphTheme);
  const palette = GRAPH_PALETTES[graphTheme];

  useEffect(() => localStorage.setItem('luma.graphMode', mode), [mode]);
  useEffect(() => localStorage.setItem('luma.graphTheme', graphTheme), [graphTheme]);

  const laid = useMemo(() => layoutGraph(commits), [commits]);
  const rowIndex = useMemo(() => new Map(laid.map((c, i) => [c.hash, i])), [laid]);
  const branchTips = useMemo(() => {
    const tips = new Map<string, string>();
    for (const c of laid) for (const r of c.refs) {
      const name = r.replace('HEAD -> ', '');
      if (name !== 'HEAD') tips.set(name.trim(), c.hash);
    }
    return tips;
  }, [laid]);
  const localBranches = useMemo(() => [...branchTips.keys()].filter((b) => !b.startsWith('origin/') && !b.startsWith('tag:')), [branchTips]);
  const headHash = useMemo(() => laid.find((c) => c.refs.some((r) => r.startsWith('HEAD')))?.hash, [laid]);

  async function selectCommit(commit: Commit) {
    setSelected(commit);
    setDiff(null);
    try { setDiff(await gitCall<DiffFile[]>('commitDiff', commit.hash)); }
    catch { setDiff([]); }
  }

  async function action(fn: () => Promise<unknown>, okMsg?: string) {
    try {
      await fn();
      await refresh();
      if (okMsg) setToast(okMsg);
    } catch (error) { setToast((error as Error).message); }
  }

  const height = Math.max(laid.length * ROW + TOP_PAD * 2, 400);
  const maxLane = Math.max(0, ...laid.map((c) => c.lane));
  const graphWidth = 28 + (maxLane + 1) * LANE_W + 10;

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="glass relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative z-20 flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-wider text-white/40">History</span>
          <div className="ml-1 flex overflow-hidden rounded-lg border border-white/10">
            <button className={`px-2.5 py-1 text-[11px] transition-colors ${mode === 'lanes' ? 'bg-lilac/20 text-lilac' : 'text-white/50 hover:bg-white/5'}`} title="Branch lanes" onClick={() => setMode('lanes')}>Lanes</button>
            <button className={`px-2.5 py-1 text-[11px] transition-colors ${mode === 'orbit' ? 'bg-lilac/20 text-lilac' : 'text-white/50 hover:bg-white/5'}`} title="Free-form commit constellation" onClick={() => setMode('orbit')}>Orbit</button>
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-white/35">
            Palette
            <select value={graphTheme} onChange={(event) => setGraphTheme(event.target.value as GraphTheme)} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70 outline-none" title="Visual theme for commit graphs">
              <option value="aurora">Aurora</option>
              <option value="mono">Monochrome</option>
              <option value="ember">Ember</option>
            </select>
          </label>
          <div className="flex-1" />
          <div className="relative">
            <button className="btn flex items-center gap-1.5 text-xs" onClick={() => { setRebaseMenu(false); setBranchMenu((value) => !value); }}><Icon name="branch" /> Branch</button>
            {branchMenu && <BranchMenu branches={localBranches} current={status?.branch} onClose={() => setBranchMenu(false)} action={action} />}
          </div>
          <div className="relative">
            <button className="btn text-xs" onClick={() => { setBranchMenu(false); setRebaseMenu((value) => !value); }}>Rebase…</button>
            {rebaseMenu && (
              <div className="glass anim-in absolute right-0 top-10 z-30 w-56 p-2">
                <div className="px-2 pb-1 text-[11px] text-white/40">Rebase current branch onto</div>
                {localBranches.filter((b) => b !== status?.branch).map((b) => (
                  <div key={b} className="group/row flex items-center rounded-lg px-2 py-1 hover:bg-white/8">
                    <button className="flex-1 truncate text-left text-xs" onClick={() => { setRebaseMenu(false); action(() => gitCall('rebase', b)); }}>{b}</button>
                    {onRebase && <button className="hidden text-[9px] text-lilac group-hover/row:block" title="Interactive rebase" onClick={(event) => { event.stopPropagation(); setRebaseMenu(false); onRebase(b); }}>edit…</button>}
                  </div>
                ))}
                <div className="mt-1 border-t border-white/10 pt-1">
                  <button className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-amber hover:bg-white/8" onClick={() => { setRebaseMenu(false); action(() => gitCall('rebaseAbort')); }}>Abort rebase</button>
                  <button className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-teal hover:bg-white/8" onClick={() => { setRebaseMenu(false); action(() => gitCall('rebaseContinue')); }}>Continue</button>
                </div>
              </div>
            )}
          </div>
          <button className="btn text-xs" onClick={() => action(() => gitCall('fetch', 'origin'))}>Fetch</button>
          <button className="btn text-xs" onClick={() => action(() => gitCall('pull'))}>Pull</button>
          <button className="btn btn-primary text-xs" onClick={() => action(() => gitCall('push', !status?.upstream))}>Push</button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto" onClick={() => { setBranchMenu(false); setRebaseMenu(false); }}>
          {mode === 'lanes' ? (
            <div style={{ height }} className="relative">
              <svg width={graphWidth} height={height} className="absolute left-0 top-0">
                <defs>
                  <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  {palette.map((color, index) => <radialGradient key={index} id={`orb${index}`} cx="35%" cy="35%" r="80%"><stop offset="0%" stopColor="#fff" stopOpacity="0.9" /><stop offset="25%" stopColor={color} /><stop offset="100%" stopColor={color} /></radialGradient>)}
                </defs>
                {laid.map((commit, index) => {
                  const y = cy(index), x = cx(commit.lane), color = palette[commit.lane % palette.length];
                  const hot = hovered === commit.hash || selected?.hash === commit.hash;
                  return commit.parents.map((parentHash, parentIndex) => {
                    const parentRow = rowIndex.get(parentHash);
                    if (parentRow === undefined) return null;
                    const parent = laid[parentRow], py = cy(parentRow), px = cx(parent.lane);
                    const path = px === x ? `M ${x} ${y + ORB} L ${px} ${py - ORB}` : `M ${x} ${y + ORB} C ${x} ${y + ROW * .55}, ${px} ${py - ROW * .55}, ${px} ${py - ORB}`;
                    return <path key={`${commit.hash}-${parentIndex}`} d={path} fill="none" stroke={parentIndex === 0 ? color : palette[parent.lane % palette.length]} strokeWidth={hot ? 2.6 : 1.6} opacity={hovered && !hot ? .25 : .6} strokeLinecap="round" filter={hot ? 'url(#glow)' : undefined} />;
                  });
                })}
                {laid.map((commit, index) => {
                  const head = commit.hash === headHash, selectedNode = selected?.hash === commit.hash, hover = hovered === commit.hash;
                  return <g key={commit.hash} className="graph-node">
                    {head && <circle cx={cx(commit.lane)} cy={cy(index)} r={HEAD_R + 5} fill="none" stroke="#c4b5fd" opacity=".5"><animate attributeName="r" values={`${HEAD_R + 3};${HEAD_R + 8};${HEAD_R + 3}`} dur="2.2s" repeatCount="indefinite" /></circle>}
                    <circle cx={cx(commit.lane)} cy={cy(index)} r={head ? HEAD_R : selectedNode || hover ? ORB + 1.5 : ORB} fill={`url(#orb${commit.lane % palette.length})`} opacity={hovered && !selectedNode && !hover ? .45 : 1} filter={selectedNode || head || hover ? 'url(#glow)' : undefined} />
                    {selectedNode && <circle cx={cx(commit.lane)} cy={cy(index)} r={ORB + 5} fill="none" stroke="#c4b5fd" strokeWidth="1.4" />}
                  </g>;
                })}
              </svg>
              {laid.map((commit, index) => (
                <div key={commit.hash} onMouseEnter={() => setHovered(commit.hash)} onMouseLeave={() => setHovered(null)} onClick={() => selectCommit(commit)} className={`absolute flex cursor-pointer items-center gap-3 rounded-xl px-3 transition-colors ${selected?.hash === commit.hash ? 'bg-lilac/12' : 'hover:bg-white/5'}`} style={{ top: TOP_PAD + index * ROW, left: graphWidth, right: 8, height: ROW - 6 }}>
                  <div className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[13px] text-white/85">{commit.message}</span><span className="flex items-center gap-2 text-[11px] text-white/40"><span className="font-mono" style={{ color: palette[commit.lane % palette.length] }}>{commit.shortHash}</span><span>{commit.author}</span><span>{timeAgo(commit.timestamp)}</span></span></div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {commit.parents.length > 1 && <span className="rounded-full border border-white/15 px-1.5 py-.5 text-[9px] text-white/40">merge</span>}
                    {commit.refs.filter((ref) => ref !== 'HEAD').map((ref) => <span key={ref} className="rounded-full border border-lilac/40 px-2 py-.5 text-[10px] text-lilac">{ref.replace('HEAD -> ', '').replace('origin/', '').replace('tag: ', '')}</span>)}
                  </div>
                </div>
              ))}
            </div>
          ) : <OrbitGraph commits={laid} headHash={headHash} selected={selected} hovered={hovered} branchTips={branchTips} palette={palette} onSelect={selectCommit} onHover={setHovered} />}
        </div>
      </div>

      {selected && (
        <div className="glass anim-in flex w-[36%] min-w-[320px] flex-col overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-sm text-white/90">{selected.message}</div>
            <div className="mt-1 text-[11px] text-white/40">{selected.author} · {new Date(selected.timestamp * 1000).toLocaleString()} · {selected.hash.slice(0, 10)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn px-2.5 py-1 text-[10px] text-amber" title="Move branch while keeping later changes staged" onClick={() => { if (window.confirm(`Move HEAD to ${selected.shortHash} and keep later changes staged?`)) action(() => gitCall('rewindSoft', selected.hash), `Moved HEAD to ${selected.shortHash} (soft)`); }}>Roll back · soft</button>
              <button className="btn btn-danger px-2.5 py-1 text-[10px]" title="Move branch and discard tracked changes" onClick={() => { if (window.confirm(`Hard reset to ${selected.shortHash}? Tracked working-tree changes and later commits will be discarded.`)) action(() => gitCall('rewindHard', selected.hash), `Hard reset to ${selected.shortHash}`); }}>Roll back · hard</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{diff === null && <div className="p-4 text-xs text-white/40">Loading diff…</div>}{diff?.length === 0 && <div className="p-4 text-xs text-white/40">No textual changes.</div>}{diff?.map((file) => <DiffView key={file.newPath} file={file} />)}</div>
        </div>
      )}
    </div>
  );
}

function timeAgo(timestamp: number) {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

function BranchMenu({ branches, current, onClose, action }: { branches: string[]; current?: string; onClose: () => void; action: (fn: () => Promise<unknown>, message?: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [mergeFor, setMergeFor] = useState<string | null>(null);
  return <div className="glass anim-in absolute right-0 top-10 z-30 w-64 p-2">
    <input className="field mb-2 w-full text-xs" placeholder="New branch name…" value={name} onChange={(event) => setName(event.target.value)} />
    <button className="btn btn-primary mb-2 w-full text-xs" disabled={!name.trim()} onClick={() => { onClose(); action(() => gitCall('checkout', 'HEAD', name.trim())); }}>Create & switch</button>
    <div className="border-t border-white/10 pt-1">{branches.map((branch) => <div key={branch}>
      <div className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/8">
        <button className={`flex-1 truncate text-left text-xs ${branch === current ? 'text-teal' : ''}`} onClick={() => { onClose(); if (branch !== current) action(() => gitCall('checkout', branch)); }}>{branch}</button>
        {branch !== current && <div className="ml-2 flex gap-2"><button className="hidden text-[10px] text-lilac group-hover:block" onClick={() => setMergeFor(mergeFor === branch ? null : branch)}>merge</button><button className="hidden text-[10px] text-rose group-hover:block" onClick={() => { onClose(); action(() => gitCall('deleteBranch', branch, false)); }}>delete</button></div>}
      </div>
      {mergeFor === branch && <div className="mb-1 ml-3 flex flex-col rounded-lg border border-white/10 bg-black/30 p-1"><button className="rounded px-2 py-1 text-left text-[10px] hover:bg-white/8" onClick={() => { onClose(); action(() => gitCall('merge', branch, false, false), `Merged ${branch}`); }}>default</button><button className="rounded px-2 py-1 text-left text-[10px] hover:bg-white/8" onClick={() => { onClose(); action(() => gitCall('merge', branch, true, false), `Merged ${branch} (--no-ff)`); }}>--no-ff</button><button className="rounded px-2 py-1 text-left text-[10px] hover:bg-white/8" onClick={() => { onClose(); action(() => gitCall('merge', branch, false, true), `Fast-forwarded ${branch}`); }}>--ff-only</button></div>}
    </div>)}</div>
  </div>;
}

interface Node { hash: string; x: number; y: number; vx: number; vy: number; lane: number; isHead: boolean; shortHash: string; }
function runForceLayout(commits: ReturnType<typeof layoutGraph>, headHash: string | undefined, width: number, height: number, ticks = 100): Node[] {
  const source = commits.slice(0, 320);
  const nodes = source.map((commit, index) => { const progress = source.length > 1 ? index / (source.length - 1) : 0; const angle = index * 2.39996; const radius = 55 + progress * Math.min(width, height) * .38; return { hash: commit.hash, x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius, vx: 0, vy: 0, lane: commit.lane, isHead: commit.hash === headHash, shortHash: commit.shortHash }; });
  const index = new Map(nodes.map((node, i) => [node.hash, i]));
  const edges: [number, number][] = [];
  for (const commit of source) { const child = index.get(commit.hash); for (const parentHash of commit.parents) { const parent = index.get(parentHash); if (child !== undefined && parent !== undefined) edges.push([child, parent]); } }
  for (let tick = 0; tick < ticks; tick++) {
    const alpha = 1 - tick / ticks;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y, d2 = Math.max(25, dx * dx + dy * dy), d = Math.sqrt(d2), force = 1800 / d2 * alpha; nodes[i].vx -= dx / d * force; nodes[i].vy -= dy / d * force; nodes[j].vx += dx / d * force; nodes[j].vy += dy / d * force; }
    for (const [childIndex, parentIndex] of edges) { const child = nodes[childIndex], parent = nodes[parentIndex], dx = parent.x - child.x, dy = parent.y - child.y, distance = Math.sqrt(dx * dx + dy * dy) || 1, force = (distance - 82) * .017 * alpha; child.vx += dx / distance * force; child.vy += dy / distance * force; parent.vx -= dx / distance * force * .3; parent.vy -= dy / distance * force * .3; }
    for (const node of nodes) { node.vx += (width / 2 - node.x) * .007 * alpha; node.vy += (height / 2 - node.y) * .007 * alpha; node.vx *= .82; node.vy *= .82; node.x = Math.max(30, Math.min(width - 30, node.x + node.vx)); node.y = Math.max(30, Math.min(height - 30, node.y + node.vy)); }
  }
  return nodes;
}

function OrbitGraph({ commits, headHash, selected, hovered, branchTips, palette, onSelect, onHover }: { commits: ReturnType<typeof layoutGraph>; headHash?: string; selected: Commit | null; hovered: string | null; branchTips: Map<string, string>; palette: readonly string[]; onSelect: (commit: Commit) => void; onHover: (hash: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ clientX: number; clientY: number; x: number; y: number; scale: number } | null>(null);
  useEffect(() => { const element = container.current; if (!element) return; const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight })); observer.observe(element); return () => observer.disconnect(); }, []);
  const nodes = useMemo(() => runForceLayout(commits, headHash, size.width, size.height), [commits, headHash, size]);
  const byHash = useMemo(() => new Map(nodes.map((node) => [node.hash, node])), [nodes]);
  const edges = useMemo(() => commits.flatMap((commit) => commit.parents.filter((parent) => byHash.has(commit.hash) && byHash.has(parent)).map((parent) => [commit.hash, parent] as const)), [commits, byHash]);
  const zoomTo = useCallback((nextScale: number, clientX?: number, clientY?: number) => setCamera((current) => { const scale = Math.max(.35, Math.min(4, nextScale)), rect = container.current?.getBoundingClientRect(), px = clientX !== undefined && rect ? clientX - rect.left : size.width / 2, py = clientY !== undefined && rect ? clientY - rect.top : size.height / 2, worldX = current.x + px / current.scale, worldY = current.y + py / current.scale; return { x: worldX - px / scale, y: worldY - py / scale, scale }; }), [size]);
  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => { event.preventDefault(); zoomTo(camera.scale * Math.exp(-event.deltaY * .0015), event.clientX, event.clientY); };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { clientX: event.clientX, clientY: event.clientY, ...camera }; };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => { if (!drag.current) return; const start = drag.current; setCamera({ x: start.x - (event.clientX - start.clientX) / start.scale, y: start.y - (event.clientY - start.clientY) / start.scale, scale: start.scale }); };
  return <div ref={container} className="relative h-full w-full overflow-hidden" style={{ minHeight: 400 }}>
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-1 backdrop-blur-xl"><button className="rounded-lg px-2 py-1 text-xs hover:bg-white/10" onClick={() => zoomTo(camera.scale / 1.25)}>−</button><span className="min-w-10 text-center font-mono text-[10px] text-white/40">{Math.round(camera.scale * 100)}%</span><button className="rounded-lg px-2 py-1 text-xs hover:bg-white/10" onClick={() => zoomTo(camera.scale * 1.25)}>+</button><button className="rounded-lg px-2 py-1 text-[10px] hover:bg-white/10" onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}>Fit</button></div>
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg bg-black/15 px-2 py-1 text-[10px] text-white/30">Wheel to zoom · drag to pan</div>
    <svg width={size.width} height={size.height} viewBox={`${camera.x} ${camera.y} ${size.width / camera.scale} ${size.height / camera.scale}`} className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <defs><filter id="orbit-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      {edges.map(([from, to]) => { const a = byHash.get(from)!, b = byHash.get(to)!, hot = hovered === from || hovered === to || selected?.hash === from || selected?.hash === to, color = palette[a.lane % palette.length], middleX = (a.x + b.x) / 2 - (b.y - a.y) * .12, middleY = (a.y + b.y) / 2 + (b.x - a.x) * .12; return <path key={`${from}-${to}`} d={`M ${a.x} ${a.y} Q ${middleX} ${middleY} ${b.x} ${b.y}`} fill="none" stroke={color} strokeWidth={hot ? 2 : 1.2} opacity={hovered && !hot ? .1 : hot ? .8 : .35} filter={hot ? 'url(#orbit-glow)' : undefined} />; })}
      {nodes.map((node) => { const color = palette[node.lane % palette.length], selectedNode = selected?.hash === node.hash, hover = hovered === node.hash, radius = node.isHead ? 11 : selectedNode ? 9.5 : hover ? 8.5 : 6, commit = commits.find((item) => item.hash === node.hash)!; return <g key={node.hash} className="cursor-pointer" onMouseEnter={() => onHover(node.hash)} onMouseLeave={() => onHover(null)} onClick={() => onSelect(commit)}>{node.isHead && <circle cx={node.x} cy={node.y} r="20" fill="none" stroke={color} opacity=".45"><animate attributeName="r" values="16;25;16" dur="2.8s" repeatCount="indefinite" /></circle>}<circle cx={node.x} cy={node.y} r={radius} fill={color} opacity={hovered && !hover && !selectedNode ? .3 : .95} filter={node.isHead || hover || selectedNode ? 'url(#orbit-glow)' : undefined} />{selectedNode && <circle cx={node.x} cy={node.y} r={radius + 5} fill="none" stroke="#c4b5fd" />}<text x={node.x} y={node.y + radius + 13} textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.55)">{node.shortHash}</text></g>; })}
      {Array.from(branchTips.entries()).map(([name, hash]) => { const node = byHash.get(hash); if (!node) return null; const color = palette[node.lane % palette.length]; return <g key={name}><rect x={node.x + 14} y={node.y - 10} width={name.replace('origin/', '').length * 7 + 12} height="18" rx="9" fill={color} opacity=".25" /><text x={node.x + 20} y={node.y + 3} fontSize="10" fill={color}>{name.replace('origin/', '')}</text></g>; })}
    </svg>
  </div>;
}
