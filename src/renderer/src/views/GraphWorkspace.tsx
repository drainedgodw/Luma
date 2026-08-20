import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import type { Commit, DiffFile } from '@shared/types';
import { layoutGraph } from '@shared/graph';
import { useStore } from '../store';
import { api, gitCall } from '../lib/api';
import DiffView from '../components/DiffView';
import { Icon } from '../components/Icons';

type Mode = 'lanes' | 'orbit';
type Theme = 'aurora' | 'mono' | 'ember';
type Risk = { files: number; churn: number; score: number; test?: 'pass' | 'fail' };
type Preview = { kind: 'merge' | 'rebase' | 'reset'; ref: string; mode?: 'soft' | 'hard'; summary: string; conflicts?: boolean };
type Node = { commit: ReturnType<typeof layoutGraph>[number]; x: number; y: number };
const ROW = 62, TOP = 26, LANE = 34;
const palettes: Record<Theme, string[]> = {
  aurora: ['#c4b5fd', '#4fd1c5', '#f687b3', '#63b3ed', '#f6ad55', '#a78bfa'],
  mono: ['#f8fafc', '#cbd5e1', '#94a3b8', '#dbeafe', '#a5b4fc', '#e2e8f0'],
  ember: ['#fb7185', '#f97316', '#f59e0b', '#ef4444', '#fda4af', '#fbbf24'],
};

export default function GraphWorkspace({ onRebase }: { onRebase?: (branch: string) => void }) {
  const { commits, status, refresh, setToast } = useStore();
  const [mode, setMode] = useState<Mode>(() => localStorage.getItem('luma.graphMode') === 'orbit' ? 'orbit' : 'lanes');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('luma.graphTheme') as Theme) || 'aurora');
  const [selected, setSelected] = useState<Commit | null>(null);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [riskEnabled, setRiskEnabled] = useState(() => localStorage.getItem('luma.riskEnabled') !== '0');
  const [risk, setRisk] = useState<Record<string, Risk>>({});
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const laid = useMemo(() => layoutGraph(commits), [commits]);
  const colors = palettes[theme];
  const refs = useMemo(() => {
    const result = new Map<string, string>();
    for (const commit of laid) for (const ref of commit.refs) {
      const name = ref.replace('HEAD -> ', '').trim();
      if (name !== 'HEAD') result.set(name, commit.hash);
    }
    return result;
  }, [laid]);
  const branches = [...refs.keys()].filter(name => !name.startsWith('origin/') && !name.startsWith('tag:'));

  useEffect(() => localStorage.setItem('luma.graphMode', mode), [mode]);
  useEffect(() => localStorage.setItem('luma.graphTheme', theme), [theme]);
  useEffect(() => localStorage.setItem('luma.riskEnabled', riskEnabled ? '1' : '0'), [riskEnabled]);
  useEffect(() => { void api.intelInvoke('riskMap').then(result => { if (result.ok && result.data) setRisk(result.data as Record<string, Risk>); }); }, [commits]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelected(null); setDiff(null); setPreview(null); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  async function choose(commit: Commit) {
    setSelected(commit);
    setDiff(null);
    try { setDiff(await gitCall<DiffFile[]>('commitDiff', commit.hash)); } catch { setDiff([]); }
  }
  function closeDetails() { setSelected(null); setDiff(null); }
  async function action(run: () => Promise<unknown>, message?: string) {
    try { await run(); await refresh(); if (message) setToast(message); } catch (error) { setToast((error as Error).message); }
  }
  async function prepare(kind: Preview['kind'], ref: string, resetMode?: 'soft' | 'hard') {
    try {
      const result = await api.intelInvoke('preview', kind, ref);
      if (!result.ok) throw new Error(result.error?.message ?? 'Preview failed');
      const data = result.data as { summary?: string; conflicts?: boolean };
      setPreview({ kind, ref, mode: resetMode, summary: data.summary || 'No changes reported.', conflicts: data.conflicts });
    } catch (error) { setToast((error as Error).message); }
  }
  async function apply() {
    if (!preview) return;
    const operation = preview;
    setPreview(null);
    if (operation.kind === 'merge') await action(() => gitCall('merge', operation.ref, false, false), `Merged ${operation.ref}`);
    else if (operation.kind === 'rebase') await action(() => gitCall('rebase', operation.ref), `Rebased onto ${operation.ref}`);
    else await action(() => gitCall(operation.mode === 'hard' ? 'rewindHard' : 'rewindSoft', operation.ref), 'Rollback complete');
  }
  async function undoRollback() {
    try {
      const result = await api.intelInvoke('undoRollback');
      if (!result.ok) throw new Error(result.error?.message ?? 'Undo failed');
      await refresh();
      setToast('Previous rollback restored');
    } catch (error) { setToast((error as Error).message); }
  }

  return <div className="relative flex h-full min-h-0 gap-3">
    <section className="glass relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-20 flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <span className="text-[11px] uppercase tracking-wider text-white/50">History</span>
        <div className="flex overflow-hidden rounded-lg border border-white/10"><button className={`px-2.5 py-1 text-[11px] ${mode === 'lanes' ? 'bg-lilac/20 text-lilac' : 'text-white/50'}`} onClick={() => setMode('lanes')}>Lanes</button><button className={`px-2.5 py-1 text-[11px] ${mode === 'orbit' ? 'bg-lilac/20 text-lilac' : 'text-white/50'}`} onClick={() => setMode('orbit')}>Orbit</button></div>
        <label className="flex items-center gap-1 text-[10px] text-white/45">Palette <select value={theme} onChange={event => setTheme(event.target.value as Theme)} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px]"><option value="aurora">Aurora</option><option value="mono">Monochrome</option><option value="ember">Ember</option></select></label>
        <button className={`btn text-[10px] ${riskEnabled ? 'text-teal' : 'text-white/40'}`} onClick={() => setRiskEnabled(value => !value)}>Risk {riskEnabled ? 'on' : 'off'}</button>
        {riskEnabled && <span className="text-[9px] text-white/40">● teal pass · <b className="text-rose">●</b> fail · size = churn</span>}
        <div className="flex-1"/><button className="btn text-xs text-teal" onClick={undoRollback}>Undo rollback</button>
        <div className="relative"><button className="btn text-xs" onClick={() => setBranchesOpen(value => !value)}><Icon name="branch"/> Branches</button>{branchesOpen && <BranchMenu branches={branches} current={status?.branch} close={() => setBranchesOpen(false)} action={action} preview={prepare} interactive={onRebase}/>}</div>
        <button className="btn text-xs" onClick={() => action(() => gitCall('fetch', 'origin'))}>Fetch</button><button className="btn text-xs" onClick={() => action(() => gitCall('pull'))}>Pull</button><button className="btn btn-primary text-xs" onClick={() => action(() => gitCall('push', !status?.upstream))}>Push</button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{mode === 'lanes' ? <Lanes commits={laid} colors={colors} risk={riskEnabled ? risk : {}} selected={selected} choose={choose}/> : <Orbit commits={laid} colors={colors} risk={riskEnabled ? risk : {}} selected={selected} choose={choose}/>}</div>
    </section>

    {selected && <aside aria-label="Commit details" className="glass relative flex w-[38%] min-w-[330px] flex-col overflow-hidden">
      <button aria-label="Close commit details" title="Close (Esc)" className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-lg text-white/60 hover:border-rose/50 hover:bg-rose/10 hover:text-rose" onClick={closeDetails}>×</button>
      <div className="border-b border-white/10 px-4 py-3 pr-14"><div className="text-sm">{selected.message}</div><div className="mt-1 text-[11px] text-white/45">{selected.author} · {selected.hash.slice(0, 10)}</div>{riskEnabled && risk[selected.hash] && <div className="mt-2 rounded-lg border border-white/10 p-2 text-[10px] text-white/55">Risk {risk[selected.hash].score}/100 · {risk[selected.hash].files} files · {risk[selected.hash].churn} changed lines · local test {risk[selected.hash].test ?? 'not run'}</div>}<div className="mt-3 flex flex-wrap gap-2"><button className="btn text-[10px] text-amber" onClick={() => prepare('reset', selected.hash, 'soft')}>Preview soft rollback</button><button className="btn btn-danger text-[10px]" onClick={() => prepare('reset', selected.hash, 'hard')}>Preview hard rollback</button></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto">{diff === null && <div className="p-4 text-xs">Loading diff…</div>}{diff?.length === 0 && <div className="p-4 text-xs text-white/40">No displayable file diff.</div>}{diff?.map(file => <DiffView key={`${file.oldPath}:${file.newPath}`} file={file}/>)}</div>
    </aside>}
    {preview && <PreviewModal preview={preview} cancel={() => setPreview(null)} apply={apply}/>} 
  </div>;
}

function colorFor(commit: ReturnType<typeof layoutGraph>[number], colors: string[], risk?: Risk) { return risk?.test === 'fail' ? '#fb7185' : risk?.test === 'pass' ? '#4fd1c5' : colors[commit.lane % colors.length]; }
function radiusFor(base: number, risk?: Risk) { return risk ? Math.min(16, base + risk.score * .075) : base; }
function titleFor(commit: ReturnType<typeof layoutGraph>[number], risk?: Risk) { return risk ? `${commit.shortHash} · risk ${risk.score}/100 · ${risk.files} files · ${risk.churn} changed lines · local test ${risk.test ?? 'not run'}` : commit.shortHash; }

function Lanes({ commits, colors, risk, selected, choose }: { commits: ReturnType<typeof layoutGraph>; colors: string[]; risk: Record<string, Risk>; selected: Commit | null; choose: (commit: Commit) => void }) {
  const rows = new Map(commits.map((commit, index) => [commit.hash, index]));
  const width = 44 + (Math.max(0, ...commits.map(commit => commit.lane)) + 1) * LANE;
  const height = Math.max(400, commits.length * ROW + TOP * 2);
  return <div className="relative" style={{ height }}><svg className="absolute inset-0" width={width} height={height}>{commits.flatMap((commit, index) => commit.parents.map(parent => { const parentIndex = rows.get(parent); if (parentIndex === undefined) return null; const target = commits[parentIndex]; const x = 28 + commit.lane * LANE, y = TOP + index * ROW + ROW / 2, px = 28 + target.lane * LANE, py = TOP + parentIndex * ROW + ROW / 2; return <path key={`${commit.hash}:${parent}`} d={`M${x},${y} C${x},${y + 30} ${px},${py - 30} ${px},${py}`} fill="none" stroke={colors[commit.lane % colors.length]} opacity=".5"/>; }))}{commits.map((commit, index) => { const item = risk[commit.hash], radius = radiusFor(selected?.hash === commit.hash ? 10 : 7, item), x = 28 + commit.lane * LANE, y = TOP + index * ROW + ROW / 2; return <g key={commit.hash}><title>{titleFor(commit, item)}</title><circle cx={x} cy={y} r={radius} fill={colorFor(commit, colors, item)}/></g>; })}</svg>{commits.map((commit, index) => <button key={commit.hash} className={`absolute flex items-center rounded-xl px-3 text-left ${selected?.hash === commit.hash ? 'bg-lilac/12' : 'hover:bg-white/5'}`} style={{ top: TOP + index * ROW, left: width, right: 8, height: ROW - 6 }} onClick={() => choose(commit)}><span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-white/85">{commit.message}</span><span className="block text-[11px] text-white/45">{commit.shortHash} · {commit.author}</span></span></button>)}</div>;
}

function Orbit({ commits, colors, risk, selected, choose }: { commits: ReturnType<typeof layoutGraph>; colors: string[]; risk: Record<string, Risk>; selected: Commit | null; choose: (commit: Commit) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; clientX: number; clientY: number; scale: number; moved: boolean } | null>(null);
  useEffect(() => { const element = holder.current; if (!element) return; const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight })); observer.observe(element); return () => observer.disconnect(); }, []);
  const nodes = useMemo<Node[]>(() => commits.slice(0, 320).map((commit, index, source) => { const progress = source.length > 1 ? index / (source.length - 1) : 0, angle = index * 2.39996, radius = 55 + progress * Math.min(size.width, size.height) * .38; return { commit, x: size.width / 2 + Math.cos(angle) * radius, y: size.height / 2 + Math.sin(angle) * radius }; }), [commits, size]);
  const byHash = useMemo(() => new Map(nodes.map(node => [node.commit.hash, node])), [nodes]);
  const zoom = useCallback((scale: number) => setCamera(current => ({ ...current, scale: Math.max(.35, Math.min(4, scale)) })), []);
  const wheel = (event: WheelEvent<SVGSVGElement>) => { event.preventDefault(); if (event.ctrlKey || event.metaKey) zoom(camera.scale * Math.exp(-event.deltaY * .0015)); else setCamera(current => ({ ...current, x: current.x + event.deltaX / current.scale, y: current.y + event.deltaY / current.scale })); };
  return <div ref={holder} className="relative h-full min-h-[400px] overflow-hidden"><div className="absolute right-3 top-3 z-10 rounded-xl border border-white/10 bg-black/30 p-1"><button className="px-2" onClick={() => zoom(camera.scale / 1.25)}>−</button><span className="px-2 text-[10px]">{Math.round(camera.scale * 100)}%</span><button className="px-2" onClick={() => zoom(camera.scale * 1.25)}>+</button><button className="px-2 text-[10px]" onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}>Fit</button></div><svg width={size.width} height={size.height} viewBox={`${camera.x} ${camera.y} ${size.width / camera.scale} ${size.height / camera.scale}`} className="absolute inset-0 touch-none cursor-grab" onWheel={wheel} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { ...camera, clientX: event.clientX, clientY: event.clientY, moved: false }; }} onPointerMove={event => { if (!drag.current) return; const start = drag.current, dx = event.clientX - start.clientX, dy = event.clientY - start.clientY; if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true; setCamera({ x: start.x - dx / start.scale, y: start.y - dy / start.scale, scale: start.scale }); }} onPointerUp={() => { drag.current = null; }}>{nodes.flatMap(node => node.commit.parents.map(parent => { const target = byHash.get(parent); return target ? <line key={`${node.commit.hash}:${parent}`} x1={node.x} y1={node.y} x2={target.x} y2={target.y} stroke={colors[node.commit.lane % colors.length]} opacity=".35"/> : null; }))}{nodes.map(node => { const item = risk[node.commit.hash], radius = radiusFor(selected?.hash === node.commit.hash ? 10 : 7, item); return <g key={node.commit.hash} className="cursor-pointer" onClick={() => { if (!drag.current?.moved) choose(node.commit); }}><title>{titleFor(node.commit, item)}</title><circle cx={node.x} cy={node.y} r={radius} fill={colorFor(node.commit, colors, item)}/><text x={node.x} y={node.y + radius + 13} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.6)">{node.commit.shortHash}</text></g>; })}</svg></div>;
}

function BranchMenu({ branches, current, close, action, preview, interactive }: { branches: string[]; current?: string; close: () => void; action: (run: () => Promise<unknown>, message?: string) => Promise<void>; preview: (kind: 'merge' | 'rebase', ref: string) => Promise<void>; interactive?: (branch: string) => void }) {
  const [name, setName] = useState('');
  return <div className="glass absolute right-0 top-10 z-30 w-72 p-2"><input className="field mb-2 w-full text-xs" placeholder="New branch…" value={name} onChange={event => setName(event.target.value)}/><button className="btn btn-primary mb-2 w-full text-xs" disabled={!name.trim()} onClick={() => { close(); void action(() => gitCall('checkout', 'HEAD', name.trim())); }}>Create and switch</button>{branches.map(branch => <div key={branch} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/8"><button className={`min-w-0 flex-1 truncate text-left text-xs ${branch === current ? 'text-teal' : ''}`} onClick={() => { close(); if (branch !== current) void action(() => gitCall('checkout', branch)); }}>{branch}</button>{branch !== current && <><button className="text-[9px] text-lilac" onClick={() => { close(); void preview('merge', branch); }}>merge</button><button className="text-[9px] text-amber" onClick={() => { close(); void preview('rebase', branch); }}>rebase</button>{interactive && <button className="text-[9px]" onClick={() => { close(); interactive(branch); }}>edit</button>}</>}</div>)}</div>;
}

function PreviewModal({ preview, cancel, apply }: { preview: Preview; cancel: () => void; apply: () => Promise<void> }) {
  return <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 p-8"><div className="glass flex max-h-[80vh] w-full max-w-3xl flex-col p-5"><div className="flex items-center gap-3"><div><div className="text-sm font-semibold">{preview.kind.toUpperCase()} preview · {preview.ref}</div><div className={preview.conflicts ? 'text-xs text-rose' : 'text-xs text-teal'}>{preview.conflicts ? 'Possible conflicts detected' : 'Read-only preview complete'}</div></div><div className="flex-1"/><button className="btn" onClick={cancel}>Cancel</button><button className={`btn ${preview.mode === 'hard' || preview.conflicts ? 'btn-danger' : 'btn-primary'}`} onClick={() => void apply()}>Apply {preview.mode ?? preview.kind}</button></div><pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-[11px] text-white/65">{preview.summary}</pre></div></div>;
}
