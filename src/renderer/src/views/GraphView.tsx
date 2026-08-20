import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { Commit, DiffFile } from '@shared/types';
import { layoutGraph } from '@shared/graph';
import { useStore } from '../store';
import { api, gitCall } from '../lib/api';
import DiffView from '../components/DiffView';
import { Icon } from '../components/Icons';

const ROW = 62;
const LANE_WIDTH = 34;
const TOP = 26;
const PALETTES = {
  aurora: ['#c4b5fd', '#4fd1c5', '#f687b3', '#63b3ed', '#f6ad55', '#a78bfa'],
  mono: ['#f8fafc', '#cbd5e1', '#94a3b8', '#dbeafe', '#a5b4fc', '#e2e8f0'],
  ember: ['#fb7185', '#f97316', '#f59e0b', '#ef4444', '#fda4af', '#fbbf24'],
} as const;
type Theme = keyof typeof PALETTES;
type Risk = { files: number; churn: number; score: number; test?: 'pass' | 'fail' };
type RiskMap = Record<string, Risk>;
type PendingOperation = { kind: 'merge' | 'rebase' | 'reset'; ref: string; mode?: 'soft' | 'hard'; summary: string; conflicts?: boolean };
const laneX = (lane: number) => 28 + lane * LANE_WIDTH;
const rowY = (row: number) => TOP + row * ROW + ROW / 2;

function riskRadius(base: number, risk?: Risk) { return risk ? Math.min(16, base + risk.score * 0.075) : base; }
function riskColor(fallback: string, risk?: Risk) { return risk?.test === 'fail' ? '#fb7185' : risk?.test === 'pass' ? '#4fd1c5' : fallback; }
function riskTitle(commit: Commit, risk?: Risk) { return risk ? `${commit.shortHash} · risk ${risk.score}/100 · ${risk.files} files · ${risk.churn} changed lines${risk.test ? ` · local test ${risk.test}` : ''}` : `${commit.shortHash} · no risk data`; }

export default function GraphView({ onRebase }: { onRebase?: (branch: string) => void }) {
  const { commits, refresh, status, setToast } = useStore();
  const [selected, setSelected] = useState<Commit | null>(null);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [branchMenu, setBranchMenu] = useState(false);
  const [mode, setMode] = useState<'lanes' | 'orbit'>(() => localStorage.getItem('luma.graphMode') === 'orbit' ? 'orbit' : 'lanes');
  const [theme, setTheme] = useState<Theme>(() => { const value = localStorage.getItem('luma.graphTheme'); return value === 'mono' || value === 'ember' ? value : 'aurora'; });
  const [riskEnabled, setRiskEnabled] = useState(() => localStorage.getItem('luma.riskEnabled') !== '0');
  const [risk, setRisk] = useState<RiskMap>({});
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const palette = PALETTES[theme];

  useEffect(() => localStorage.setItem('luma.graphMode', mode), [mode]);
  useEffect(() => localStorage.setItem('luma.graphTheme', theme), [theme]);
  useEffect(() => localStorage.setItem('luma.riskEnabled', riskEnabled ? '1' : '0'), [riskEnabled]);
  useEffect(() => { void api.intelInvoke('riskMap').then(result => { if (result.ok && result.data) setRisk(result.data as RiskMap); }); }, [commits]);

  const laid = useMemo(() => layoutGraph(commits), [commits]);
  const rows = useMemo(() => new Map(laid.map((commit, index) => [commit.hash, index])), [laid]);
  const tips = useMemo(() => { const result = new Map<string, string>(); for (const commit of laid) for (const ref of commit.refs) { const name = ref.replace('HEAD -> ', ''); if (name !== 'HEAD') result.set(name.trim(), commit.hash); } return result; }, [laid]);
  const branches = useMemo(() => [...tips.keys()].filter(branch => !branch.startsWith('origin/') && !branch.startsWith('tag:')), [tips]);
  const head = useMemo(() => laid.find(commit => commit.refs.some(ref => ref.startsWith('HEAD')))?.hash, [laid]);

  async function select(commit: Commit) {
    setSelected(commit);
    setDiff(null);
    try { setDiff(await gitCall<DiffFile[]>('commitDiff', commit.hash)); }
    catch { setDiff([]); }
  }

  async function action(fn: () => Promise<unknown>, message?: string) {
    try { await fn(); await refresh(); if (message) setToast(message); }
    catch (error) { setToast((error as Error).message); }
  }

  async function requestPreview(kind: PendingOperation['kind'], ref: string, mode?: 'soft' | 'hard') {
    try {
      const result = await api.intelInvoke('preview', kind, ref);
      if (!result.ok) throw new Error(result.error?.message ?? 'Preview failed');
      const data = result.data as { summary: string; conflicts?: boolean };
      setPending({ kind, ref, mode, summary: data.summary || 'No changes reported.', conflicts: data.conflicts });
    } catch (error) { setToast((error as Error).message); }
  }

  async function applyPending() {
    if (!pending) return;
    const operation = pending;
    setPending(null);
    if (operation.kind === 'merge') await action(() => gitCall('merge', operation.ref, false, false), `Merged ${operation.ref}`);
    else if (operation.kind === 'rebase') await action(() => gitCall('rebase', operation.ref), `Rebased onto ${operation.ref}`);
    else await action(() => gitCall(operation.mode === 'hard' ? 'rewindHard' : 'rewindSoft', operation.ref), `${operation.mode ?? 'soft'} rollback complete`);
  }

  async function undoRollback() {
    try {
      const result = await api.intelInvoke('undoRollback');
      if (!result.ok) throw new Error(result.error?.message ?? 'Undo failed');
      const data = result.data as { ref: string; safety: string; stashed: boolean };
      await refresh();
      setToast(`Restored ${data.ref}; safety branch ${data.safety}${data.stashed ? '; local changes stashed' : ''}`);
    } catch (error) { setToast((error as Error).message); }
  }

  const height = Math.max(laid.length * ROW + TOP * 2, 400);
  const width = 38 + (Math.max(0, ...laid.map(commit => commit.lane)) + 1) * LANE_WIDTH;

  return <div className="flex h-full min-h-0 gap-3">
    <div className="glass relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="relative z-20 flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <span className="text-[11px] uppercase tracking-wider text-white/50">History</span>
        <div className="flex overflow-hidden rounded-lg border border-white/10"><button className={`px-2.5 py-1 text-[11px] ${mode === 'lanes' ? 'bg-lilac/20 text-lilac' : 'text-white/50'}`} onClick={() => setMode('lanes')}>Lanes</button><button className={`px-2.5 py-1 text-[11px] ${mode === 'orbit' ? 'bg-lilac/20 text-lilac' : 'text-white/50'}`} onClick={() => setMode('orbit')}>Orbit</button></div>
        <label className="flex items-center gap-1.5 text-[10px] text-white/45">Palette <select value={theme} onChange={event => setTheme(event.target.value as Theme)} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px]"><option value="aurora">Aurora</option><option value="mono">Monochrome</option><option value="ember">Ember</option></select></label>
        <button className={`btn text-[10px] ${riskEnabled ? 'text-teal' : 'text-white/40'}`} onClick={() => setRiskEnabled(value => !value)}>Risk {riskEnabled ? 'on' : 'off'}</button>
        {riskEnabled && <div className="flex items-center gap-2 text-[9px] text-white/45"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-teal"/>local pass</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose"/>local fail</span><span>size = churn</span></div>}
        <div className="flex-1"/>
        <button className="btn text-xs text-teal" onClick={undoRollback}>Undo rollback</button>
        <div className="relative"><button className="btn text-xs" onClick={() => setBranchMenu(value => !value)}><Icon name="branch"/> Branches</button>{branchMenu && <BranchMenu branches={branches} current={status?.branch} close={() => setBranchMenu(false)} action={action} preview={requestPreview} onInteractiveRebase={onRebase}/>}</div>
        <button className="btn text-xs" onClick={() => action(() => gitCall('fetch', 'origin'))}>Fetch</button><button className="btn text-xs" onClick={() => action(() => gitCall('pull'))}>Pull</button><button className="btn btn-primary text-xs" onClick={() => action(() => gitCall('push', !status?.upstream))}>Push</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" onClick={() => setBranchMenu(false)}>{mode === 'lanes' ? <Lanes commits={laid} rows={rows} head={head} selected={selected} hovered={hovered} palette={palette} risk={riskEnabled ? risk : {}} height={height} width={width} select={select} hover={setHovered}/> : <Orbit commits={laid} head={head} selected={selected} hovered={hovered} tips={tips} palette={palette} risk={riskEnabled ? risk : {}} select={select} hover={setHovered}/>}</div>
    </div>

    {selected && <aside className="glass flex w-[38%] min-w-[330px] flex-col overflow-hidden"><div className="border-b border-white/10 px-4 py-3"><div className="text-sm">{selected.message}</div><div className="mt-1 text-[11px] text-white/45">{selected.author} · {selected.hash.slice(0, 10)}</div>{riskEnabled && risk[selected.hash] && <div className="mt-2 rounded-lg border border-white/10 p-2 text-[10px] text-white/55">Risk {risk[selected.hash].score}/100 · {risk[selected.hash].files} files · {risk[selected.hash].churn} changed lines · local test {risk[selected.hash].test ?? 'not run'}</div>}<div className="mt-3 flex flex-wrap gap-2"><button className="btn text-[10px] text-amber" onClick={() => requestPreview('reset', selected.hash, 'soft')}>Preview soft rollback</button><button className="btn btn-danger text-[10px]" onClick={() => requestPreview('reset', selected.hash, 'hard')}>Preview hard rollback</button></div></div><div className="min-h-0 flex-1 overflow-y-auto">{diff === null && <div className="p-4 text-xs">Loading diff…</div>}{diff?.length === 0 && <div className="p-4 text-xs text-white/40">This commit has no displayable file diff.</div>}{diff?.map(file => <DiffView key={`${file.oldPath}:${file.newPath}`} file={file}/>)}</div></aside>}

    {pending && <OperationModal operation={pending} cancel={() => setPending(null)} apply={applyPending}/>} 
  </div>;
}

function Lanes({ commits, rows, head, selected, hovered, palette, risk, height, width, select, hover }: { commits: ReturnType<typeof layoutGraph>; rows: Map<string, number>; head?: string; selected: Commit | null; hovered: string | null; palette: readonly string[]; risk: RiskMap; height: number; width: number; select: (commit: Commit) => void; hover: (hash: string | null) => void }) {
  return <div style={{ height }} className="relative"><svg width={width} height={height} className="absolute left-0 top-0">{commits.flatMap((commit, index) => commit.parents.map((parent, parentIndex) => { const targetIndex = rows.get(parent); if (targetIndex === undefined) return null; const target = commits[targetIndex]; return <path key={`${commit.hash}-${parentIndex}`} d={`M ${laneX(commit.lane)} ${rowY(index)} C ${laneX(commit.lane)} ${rowY(index) + 32}, ${laneX(target.lane)} ${rowY(targetIndex) - 32}, ${laneX(target.lane)} ${rowY(targetIndex)}`} fill="none" stroke={palette[commit.lane % palette.length]} strokeWidth="1.6" opacity=".55"/>; }))}{commits.map((commit, index) => { const hot = hovered === commit.hash || selected?.hash === commit.hash; const item = risk[commit.hash]; const base = commit.hash === head ? 10.5 : hot ? 9 : 7; const radius = riskRadius(base, item); const color = riskColor(palette[commit.lane % palette.length], item); return <g key={commit.hash}><title>{riskTitle(commit, item)}</title>{commit.hash === head && <circle cx={laneX(commit.lane)} cy={rowY(index)} r={radius + 5} fill="none" stroke={color}/>}<circle cx={laneX(commit.lane)} cy={rowY(index)} r={radius} fill={color}/></g>; })}</svg>{commits.map((commit, index) => <button key={commit.hash} onMouseEnter={() => hover(commit.hash)} onMouseLeave={() => hover(null)} onClick={() => select(commit)} className={`absolute flex items-center gap-3 rounded-xl px-3 text-left ${selected?.hash === commit.hash ? 'bg-lilac/12' : 'hover:bg-white/5'}`} style={{ top: TOP + index * ROW, left: width, right: 8, height: ROW - 6 }}><div className="min-w-0 flex-1"><div className="truncate text-[13px] text-white/85">{commit.message}</div><div className="text-[11px] text-white/45"><span className="font-mono">{commit.shortHash}</span> · {commit.author} · {ago(commit.timestamp)}</div></div>{commit.refs.filter(ref => ref !== 'HEAD').map(ref => <span key={ref} className="rounded-full border border-lilac/40 px-2 text-[10px] text-lilac">{ref.replace('HEAD -> ', '').replace('origin/', '')}</span>)}</button>)}</div>;
}

interface OrbitNode { hash: string; x: number; y: number; vx: number; vy: number; lane: number; isHead: boolean; shortHash: string }
function force(commits: ReturnType<typeof layoutGraph>, head: string | undefined, width: number, height: number): OrbitNode[] { const source = commits.slice(0, 320); const nodes = source.map((commit, index) => { const progress = source.length > 1 ? index / (source.length - 1) : 0; const angle = index * 2.39996; const radius = 55 + progress * Math.min(width, height) * .38; return { hash: commit.hash, x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius, vx: 0, vy: 0, lane: commit.lane, isHead: commit.hash === head, shortHash: commit.shortHash }; }); const indexes = new Map(nodes.map((node, index) => [node.hash, index])); const edges: Array<[number, number]> = []; for (const commit of source) { const from = indexes.get(commit.hash); for (const parent of commit.parents) { const to = indexes.get(parent); if (from !== undefined && to !== undefined) edges.push([from, to]); } } for (let tick = 0; tick < 90; tick++) { const alpha = 1 - tick / 90; for (let first = 0; first < nodes.length; first++) for (let second = first + 1; second < nodes.length; second++) { const dx = nodes[second].x - nodes[first].x, dy = nodes[second].y - nodes[first].y, distanceSquared = Math.max(25, dx * dx + dy * dy), distance = Math.sqrt(distanceSquared), strength = 1700 / distanceSquared * alpha; nodes[first].vx -= dx / distance * strength; nodes[first].vy -= dy / distance * strength; nodes[second].vx += dx / distance * strength; nodes[second].vy += dy / distance * strength; } for (const [from, to] of edges) { const a = nodes[from], b = nodes[to], dx = b.x - a.x, dy = b.y - a.y, distance = Math.sqrt(dx * dx + dy * dy) || 1, strength = (distance - 82) * .017 * alpha; a.vx += dx / distance * strength; a.vy += dy / distance * strength; b.vx -= dx / distance * strength * .3; b.vy -= dy / distance * strength * .3; } for (const node of nodes) { node.vx += (width / 2 - node.x) * .007 * alpha; node.vy += (height / 2 - node.y) * .007 * alpha; node.vx *= .82; node.vy *= .82; node.x = Math.max(32, Math.min(width - 32, node.x + node.vx)); node.y = Math.max(32, Math.min(height - 32, node.y + node.vy)); } } return nodes; }

function Orbit({ commits, head, selected, hovered, tips, palette, risk, select, hover }: { commits: ReturnType<typeof layoutGraph>; head?: string; selected: Commit | null; hovered: string | null; tips: Map<string, string>; palette: readonly string[]; risk: RiskMap; select: (commit: Commit) => void; hover: (hash: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ clientX: number; clientY: number; x: number; y: number; scale: number } | null>(null);
  useEffect(() => { const element = box.current; if (!element) return; const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight })); observer.observe(element); return () => observer.disconnect(); }, []);
  const nodes = useMemo(() => force(commits, head, size.width, size.height), [commits, head, size]);
  const byHash = useMemo(() => new Map(nodes.map(node => [node.hash, node])), [nodes]);
  const edges = useMemo(() => commits.flatMap(commit => commit.parents.filter(parent => byHash.has(commit.hash) && byHash.has(parent)).map(parent => [commit.hash, parent] as const)), [commits, byHash]);
  const zoom = useCallback((next: number, clientX?: number, clientY?: number) => setCamera(current => { const scale = Math.max(.35, Math.min(4, next)); const rect = box.current?.getBoundingClientRect(); const px = clientX !== undefined && rect ? clientX - rect.left : size.width / 2, py = clientY !== undefined && rect ? clientY - rect.top : size.height / 2, worldX = current.x + px / current.scale, worldY = current.y + py / current.scale; return { x: worldX - px / scale, y: worldY - py / scale, scale }; }), [size]);
  const wheel = (event: ReactWheelEvent<SVGSVGElement>) => { event.preventDefault(); if (event.ctrlKey || event.metaKey) zoom(camera.scale * Math.exp(-event.deltaY * .0015), event.clientX, event.clientY); else setCamera(current => ({ ...current, x: current.x + event.deltaX / current.scale, y: current.y + event.deltaY / current.scale })); };
  const keyboard = (event: React.KeyboardEvent<HTMLDivElement>) => { const key = event.key.toLowerCase(), step = event.shiftKey ? 120 : 42; if (key === '0') { setCamera({ x: 0, y: 0, scale: 1 }); event.preventDefault(); return; } if (key === '+' || key === '=') { zoom(camera.scale * 1.2); event.preventDefault(); return; } if (key === '-') { zoom(camera.scale / 1.2); event.preventDefault(); return; } const movement = key === 'arrowleft' || key === 'a' ? [-step, 0] : key === 'arrowright' || key === 'd' ? [step, 0] : key === 'arrowup' || key === 'w' ? [0, -step] : key === 'arrowdown' || key === 's' ? [0, step] : null; if (movement) { setCamera(current => ({ ...current, x: current.x + movement[0] / current.scale, y: current.y + movement[1] / current.scale })); event.preventDefault(); } };
  return <div ref={box} tabIndex={0} onKeyDown={keyboard} className="relative h-full w-full overflow-hidden outline-none focus:ring-1 focus:ring-lilac/40"><div className="absolute right-3 top-3 z-10 rounded-xl border border-white/10 bg-black/30 p-1"><button aria-label="Zoom out" className="px-2" onClick={() => zoom(camera.scale / 1.25)}>−</button><span className="px-2 font-mono text-[10px]">{Math.round(camera.scale * 100)}%</span><button aria-label="Zoom in" className="px-2" onClick={() => zoom(camera.scale * 1.25)}>+</button><button className="px-2 text-[10px]" onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}>Fit</button></div><div className="pointer-events-none absolute bottom-3 left-3 z-10 text-[10px] text-white/45">Trackpad pan · Ctrl/pinch zoom · arrows/WASD · select node for diff</div><svg width={size.width} height={size.height} viewBox={`${camera.x} ${camera.y} ${size.width / camera.scale} ${size.height / camera.scale}`} className="absolute inset-0 touch-none cursor-grab" onWheel={wheel} onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { clientX: event.clientX, clientY: event.clientY, ...camera }; }} onPointerMove={(event: ReactPointerEvent<SVGSVGElement>) => { if (!drag.current) return; const start = drag.current; setCamera({ x: start.x - (event.clientX - start.clientX) / start.scale, y: start.y - (event.clientY - start.clientY) / start.scale, scale: start.scale }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>{edges.map(([from, to]) => { const a = byHash.get(from)!, b = byHash.get(to)!, hot = hovered === from || hovered === to || selected?.hash === from || selected?.hash === to; return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={palette[a.lane % palette.length]} strokeWidth={hot ? 2 : 1.2} opacity={hot ? .8 : .35}/>; })}{nodes.map(node => { const commit = commits.find(item => item.hash === node.hash)!; const item = risk[node.hash]; const hot = hovered === node.hash || selected?.hash === node.hash; const radius = riskRadius(node.isHead ? 11 : hot ? 9 : 6, item); const color = riskColor(palette[node.lane % palette.length], item); return <g key={node.hash} role="button" tabIndex={0} aria-label={riskTitle(commit, item)} className="cursor-pointer" onMouseEnter={() => hover(node.hash)} onMouseLeave={() => hover(null)} onClick={() => select(commit)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') select(commit); }}><title>{riskTitle(commit, item)}</title>{node.isHead && <circle cx={node.x} cy={node.y} r={radius + 8} fill="none" stroke={color}/>}<circle cx={node.x} cy={node.y} r={radius} fill={color}/><text x={node.x} y={node.y + radius + 13} textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.65)">{node.shortHash}</text></g>; })}{[...tips].map(([name, hash]) => { const node = byHash.get(hash); return node ? <text key={name} x={node.x + 15} y={node.y} fontSize="10" fill={palette[node.lane % palette.length]}>{name.replace('origin/', '')}</text> : null; })}</svg></div>;
}

function BranchMenu({ branches, current, close, action, preview, onInteractiveRebase }: { branches: string[]; current?: string; close: () => void; action: (fn: () => Promise<unknown>, message?: string) => Promise<void>; preview: (kind: 'merge' | 'rebase', ref: string) => Promise<void>; onInteractiveRebase?: (branch: string) => void }) { const [name, setName] = useState(''); return <div className="glass absolute right-0 top-10 z-30 w-72 p-2"><input className="field mb-2 w-full text-xs" placeholder="New branch…" value={name} onChange={event => setName(event.target.value)}/><button className="btn btn-primary mb-2 w-full text-xs" disabled={!name.trim()} onClick={() => { close(); void action(() => gitCall('checkout', 'HEAD', name.trim()), `Created ${name.trim()}`); }}>Create and switch</button>{branches.map(branch => <div key={branch} className="rounded-lg px-2 py-1.5 hover:bg-white/8"><div className="flex items-center gap-1"><button className={`min-w-0 flex-1 truncate text-left text-xs ${branch === current ? 'text-teal' : ''}`} onClick={() => { close(); if (branch !== current) void action(() => gitCall('checkout', branch)); }}>{branch}</button>{branch !== current && <><button className="text-[9px] text-lilac" onClick={() => { close(); void preview('merge', branch); }}>merge</button><button className="text-[9px] text-amber" onClick={() => { close(); void preview('rebase', branch); }}>rebase</button>{onInteractiveRebase && <button className="text-[9px] text-white/50" onClick={() => { close(); onInteractiveRebase(branch); }}>edit</button>}<button className="text-[9px] text-rose" onClick={() => { close(); void action(() => gitCall('deleteBranch', branch, false)); }}>delete</button></>}</div></div>)}</div>; }

function OperationModal({ operation, cancel, apply }: { operation: PendingOperation; cancel: () => void; apply: () => Promise<void> }) { return <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 p-8"><div className="glass flex max-h-[80vh] w-full max-w-3xl flex-col p-5"><div className="flex items-center gap-3"><div><div className="text-sm font-semibold">{operation.kind.toUpperCase()} preview · {operation.ref}</div><div className={`text-[11px] ${operation.conflicts ? 'text-rose' : 'text-teal'}`}>{operation.conflicts ? 'Possible conflicts detected' : 'Read-only preview complete'}</div></div><div className="flex-1"/><button className="btn" onClick={cancel}>Cancel</button><button className={`btn ${operation.mode === 'hard' || operation.conflicts ? 'btn-danger' : 'btn-primary'}`} onClick={() => void apply()}>Apply {operation.mode ?? operation.kind}</button></div><pre className="mt-4 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-[11px] text-white/65">{operation.summary}</pre><div className="mt-3 text-[10px] text-white/40">Luma creates rollback protection for reset operations. Review conflicts and maintain a remote backup before rewriting history.</div></div></div>; }

function ago(timestamp: number) { const seconds = Date.now() / 1000 - timestamp; return seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h ago` : `${Math.floor(seconds / 86400)}d ago`; }
