import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import type { Commit, DiffFile } from '@shared/types';
import { layoutGraph } from '@shared/graph';
import { useStore } from '../store';
import { api, gitCall } from '../lib/api';
import DiffView from '../components/DiffView';
import { Icon } from '../components/Icons';

type Mode = 'lanes' | 'orbit';
type Risk = { files: number; churn: number; score: number; test?: 'pass' | 'fail' };
type Preview = {
  kind: 'merge' | 'rebase' | 'reset';
  ref: string;
  mode?: 'soft' | 'hard';
  summary: string;
  conflicts?: boolean;
};
type LaidCommit = ReturnType<typeof layoutGraph>[number];
type OrbitNode = {
  commit: LaidCommit;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
};
type OrbitCamera = { x: number; y: number; k: number };
const ROW = 62;
const TOP = 26;
const LANE = 34;
const COLORS = ['#c4b5fd', '#4fd1c5', '#f687b3', '#63b3ed', '#f6ad55', '#a78bfa'];

export default function GraphWorkspace({ onRebase }: { onRebase?: (branch: string) => void }) {
  const { commits, status, refresh, setToast } = useStore();
  const [mode, setMode] = useState<Mode>(() =>
    localStorage.getItem('luma.graphMode') === 'orbit' ? 'orbit' : 'lanes'
  );
  const [selected, setSelected] = useState<Commit | null>(null);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [risk, setRisk] = useState<Record<string, Risk>>({});
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const laid = useMemo(() => layoutGraph(commits), [commits]);
  const branches = useMemo(() => {
    const names = new Set<string>();
    for (const commit of laid)
      for (const value of commit.refs) {
        const name = value.replace('HEAD -> ', '').trim();
        if (name !== 'HEAD' && !name.startsWith('origin/') && !name.startsWith('tag:'))
          names.add(name);
      }
    return [...names];
  }, [laid]);
  useEffect(() => localStorage.setItem('luma.graphMode', mode), [mode]);
  useEffect(() => {
    void api.intelInvoke('riskMap').then((result) => {
      if (result.ok && result.data) setRisk(result.data as Record<string, Risk>);
    });
  }, [commits]);
  const choose = useCallback(async (commit: Commit) => {
    setSelected(commit);
    setDiff(null);
    try {
      setDiff(await gitCall<DiffFile[]>('commitDiff', commit.hash));
    } catch {
      setDiff([]);
    }
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (event.key === 'Escape') {
        setSelected(null);
        setDiff(null);
        setPreview(null);
        return;
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Enter') return;
      const current = Math.max(
        0,
        laid.findIndex((commit) => commit.hash === selected?.hash)
      );
      if (event.key === 'Enter') {
        if (laid[current]) void choose(laid[current]);
        return;
      }
      event.preventDefault();
      const next =
        event.key === 'ArrowDown'
          ? Math.min(laid.length - 1, current + 1)
          : Math.max(0, current - 1);
      if (laid[next]) void choose(laid[next]);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [choose, laid, selected?.hash]);
  async function action(run: () => Promise<unknown>, message?: string) {
    try {
      await run();
      await refresh();
      if (message) setToast(message);
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  async function prepare(kind: Preview['kind'], ref: string, resetMode?: 'soft' | 'hard') {
    try {
      const result = await api.intelInvoke('preview', kind, ref);
      if (!result.ok) throw new Error(result.error?.message ?? 'Preview failed');
      const data = result.data as { summary?: string; conflicts?: boolean };
      setPreview({
        kind,
        ref,
        mode: resetMode,
        summary: data.summary || 'No changes reported.',
        conflicts: data.conflicts,
      });
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  async function apply() {
    if (!preview) return;
    const operation = preview;
    setPreview(null);
    if (operation.kind === 'merge')
      await action(() => gitCall('merge', operation.ref, false, false), `Merged ${operation.ref}`);
    else if (operation.kind === 'rebase')
      await action(() => gitCall('rebase', operation.ref), `Rebased onto ${operation.ref}`);
    else
      await action(
        () => gitCall(operation.mode === 'hard' ? 'rewindHard' : 'rewindSoft', operation.ref),
        'Rollback complete'
      );
  }
  async function undoRollback() {
    try {
      const result = await api.intelInvoke('undoRollback');
      if (!result.ok) throw new Error(result.error?.message ?? 'Undo failed');
      await refresh();
      setToast('Previous rollback restored');
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  return (
    <div className="relative flex h-full min-h-0 gap-3">
      <section className="glass relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/50">History</div>
            <div className="text-[9px] text-white/25">
              Lanes and Orbit share commit details, diffs and rollback actions
            </div>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            <button
              className={`px-2.5 py-1 text-[11px] ${mode === 'lanes' ? 'bg-lilac/20 text-lilac' : 'text-white/50'}`}
              onClick={() => setMode('lanes')}
            >
              Lanes
            </button>
            <button
              className={`px-2.5 py-1 text-[11px] ${mode === 'orbit' ? 'bg-lilac/20 text-lilac' : 'text-white/50'}`}
              onClick={() => setMode('orbit')}
            >
              Orbit
            </button>
          </div>
          <span className="text-[9px] text-white/30">↑ ↓ select · Enter details</span>
          <div className="flex-1" />
          <button className="btn text-xs text-teal" onClick={() => void undoRollback()}>
            Undo rollback
          </button>
          <div className="relative">
            <button className="btn text-xs" onClick={() => setBranchesOpen((value) => !value)}>
              <Icon name="branch" /> Branches
            </button>
            {branchesOpen && (
              <BranchMenu
                branches={branches}
                current={status?.branch}
                close={() => setBranchesOpen(false)}
                action={action}
                preview={prepare}
                interactive={onRebase}
              />
            )}
          </div>
          <button
            className="btn text-xs"
            onClick={() => void action(() => gitCall('fetch', 'origin'))}
          >
            Fetch
          </button>
          <button className="btn text-xs" onClick={() => void action(() => gitCall('pull'))}>
            Pull
          </button>
          <button
            className="btn btn-primary text-xs"
            onClick={() => void action(() => gitCall('push', !status?.upstream))}
          >
            Push
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          {mode === 'lanes' ? (
            <Lanes commits={laid} risk={risk} selected={selected} choose={choose} />
          ) : (
            <Orbit commits={laid} risk={risk} selected={selected} choose={choose} />
          )}
        </div>
      </section>
      {selected && (
        <CommitDetails
          commit={selected}
          risk={risk[selected.hash]}
          diff={diff}
          close={() => {
            setSelected(null);
            setDiff(null);
          }}
          prepare={prepare}
        />
      )}
      {preview && <PreviewModal preview={preview} cancel={() => setPreview(null)} apply={apply} />}
    </div>
  );
}
function categoryColor(
  commit: LaidCommit,
  risk: Record<string, Risk>,
  isFirst: boolean,
  isHead: boolean
) {
  if (isFirst) return { color: '#f6e05e', label: 'first commit' };
  if (isHead) return { color: '#63b3ed', label: 'HEAD / latest' };
  if (commit.parents.length > 1) return { color: '#a78bfa', label: 'merge' };
  const item = risk[commit.hash];
  if (item?.test === 'fail') return { color: '#fb7185', label: 'tests failed' };
  if (item?.test === 'pass') return { color: '#4fd1c5', label: 'tests pass' };
  return { color: COLORS[commit.lane % COLORS.length], label: 'regular' };
}
const LEGEND = [
  ['#f6e05e', 'first commit'],
  ['#63b3ed', 'HEAD / latest'],
  ['#a78bfa', 'merge'],
  ['#fb7185', 'tests failed'],
  ['#4fd1c5', 'tests pass'],
  ['#c4b5fd', 'regular branch'],
] as const;
function ColorLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-[9px] text-white/50">
      {LEGEND.map(([color, label]) => (
        <div key={label} className="flex items-center gap-1.5 leading-4">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          {label}
        </div>
      ))}
    </div>
  );
}
function radius(base: number, risk?: Risk) {
  return risk ? Math.min(17, base + risk.score * 0.07) : base;
}
function Lanes({
  commits,
  risk,
  selected,
  choose,
}: {
  commits: ReturnType<typeof layoutGraph>;
  risk: Record<string, Risk>;
  selected: Commit | null;
  choose: (commit: Commit) => void;
}) {
  const rows = new Map(commits.map((commit, index) => [commit.hash, index]));
  const width = 44 + (Math.max(0, ...commits.map((commit) => commit.lane)) + 1) * LANE;
  const height = Math.max(400, commits.length * ROW + TOP * 2);
  const isRoot = (commit: LaidCommit) =>
    !commit.parents.some((parent) => rows.has(parent));
  const isHead = (commit: LaidCommit) => commit.refs.some((ref) => ref.includes('HEAD'));
  return (
    <div className="relative min-w-[650px]" style={{ height }}>
      <svg className="absolute inset-0" width={width} height={height}>
        {commits.flatMap((commit, index) =>
          commit.parents.map((parent) => {
            const parentIndex = rows.get(parent);
            if (parentIndex === undefined) return null;
            const target = commits[parentIndex];
            const x = 28 + commit.lane * LANE;
            const y = TOP + index * ROW + ROW / 2;
            const px = 28 + target.lane * LANE;
            const py = TOP + parentIndex * ROW + ROW / 2;
            return (
              <path
                key={`${commit.hash}:${parent}`}
                d={`M${x},${y} C${x},${y + 30} ${px},${py - 30} ${px},${py}`}
                fill="none"
                stroke={COLORS[commit.lane % COLORS.length]}
                opacity=".5"
              />
            );
          })
        )}
        {commits.map((commit, index) => {
          const active = selected?.hash === commit.hash;
          const item = risk[commit.hash];
          const x = 28 + commit.lane * LANE;
          const y = TOP + index * ROW + ROW / 2;
          const cat = categoryColor(commit, risk, isRoot(commit), isHead(commit));
          return (
            <g key={commit.hash}>
              {isHead(commit) && (
                <circle cx={x} cy={y} r={radius(active ? 10 : 7, item) + 5} fill="none" stroke="#63b3ed" strokeWidth="1.5" opacity=".6" />
              )}
              {isRoot(commit) && (
                <circle cx={x} cy={y} r={radius(active ? 10 : 7, item) + 5} fill="none" stroke="#f6e05e" strokeWidth="1.5" opacity=".6" />
              )}
              <circle
                cx={x}
                cy={y}
                r={radius(active ? 10 : 7, item)}
                fill={cat.color}
                stroke={active ? '#fff' : 'transparent'}
                strokeWidth="3"
              />
            </g>
          );
        })}
      </svg>
      {commits.map((commit, index) => (
        <button
          key={commit.hash}
          className={`absolute flex items-center rounded-xl px-3 text-left ${selected?.hash === commit.hash ? 'bg-lilac/12 ring-1 ring-lilac/35' : 'hover:bg-white/5'}`}
          style={{ top: TOP + index * ROW, left: width, right: 8, height: ROW - 6 }}
          onClick={() => void choose(commit)}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-white/85">{commit.message}</span>
            <span className="block text-[11px] text-white/45">
              #{commits.length - index} · {commit.shortHash} · {commit.author}
            </span>
          </span>
          {commit.refs.length > 0 && (
            <span className="ml-3 max-w-48 truncate rounded-full border border-teal/25 bg-teal/8 px-2 py-0.5 text-[9px] text-teal">
              {commit.refs.join(' · ')}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
function Orbit({
  commits,
  risk,
  selected,
  choose,
}: {
  commits: ReturnType<typeof layoutGraph>;
  risk: Record<string, Risk>;
  selected: Commit | null;
  choose: (commit: Commit) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const pan = useRef<{ clientX: number; clientY: number; camera: OrbitCamera } | null>(null);
  const dragging = useRef<OrbitNode | null>(null);
  const moved = useRef(false);
  const nodes = useRef<OrbitNode[]>([]);
  const byHash = useRef(new Map<string, OrbitNode>());
  const links = useRef<[OrbitNode, OrbitNode][]>([]);
  const frame = useRef(0);
  const alpha = useRef(0);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState<OrbitCamera>({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<LaidCommit | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight })
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const meta = useMemo(() => {
    const list = commits.slice(0, 400);
    const seen = new Set(list.map((commit) => commit.hash));
    return new Map(
      list.map((commit, index) => [
        commit.hash,
        { ordinal: list.length - index, root: !commit.parents.some((p) => seen.has(p)) },
      ])
    );
  }, [commits]);

  const tick = () => {
    const ns = nodes.current;
    const a = (alpha.current *= 0.985);
    // everything pushes apart, parents pull their kids back
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const m = ns[j];
        let dx = n.x - m.x;
        let dy = n.y - m.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const f = (2600 * a) / (d2 * d);
        n.vx += dx * f;
        n.vy += dy * f;
        m.vx -= dx * f;
        m.vy -= dy * f;
      }
      n.vx -= n.x * 0.012 * a;
      n.vy -= n.y * 0.012 * a;
    }
    for (const [p, c] of links.current) {
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - 100) * 0.035 * a) / d;
      p.vx += dx * f;
      p.vy += dy * f;
      c.vx -= dx * f;
      c.vy -= dy * f;
    }
    for (const n of ns) {
      if (n.fx != null) {
        n.x = n.fx;
        n.vx = 0;
      } else {
        n.vx = Math.max(-40, Math.min(40, n.vx * 0.55));
        n.x += n.vx;
      }
      if (n.fy != null) {
        n.y = n.fy;
        n.vy = 0;
      } else {
        n.vy = Math.max(-40, Math.min(40, n.vy * 0.55));
        n.y += n.vy;
      }
    }
  };

  const loop = () => {
    if (frame.current) return;
    const step = () => {
      tick();
      setTick((t) => t + 1);
      frame.current =
        alpha.current > 0.02 || dragging.current ? requestAnimationFrame(step) : 0;
    };
    frame.current = requestAnimationFrame(step);
  };

  // rebuild the web when history or the pane itself changes
  useEffect(() => {
    const list = commits.slice(0, 400);
    const generation = new Map<string, number>();
    for (const commit of list.slice().reverse()) {
      let gen = 0;
      for (const parent of commit.parents) {
        const parentGen = generation.get(parent);
        if (parentGen !== undefined) gen = Math.max(gen, parentGen + 1);
      }
      generation.set(commit.hash, gen);
    }
    const rings = new Map<number, LaidCommit[]>();
    for (const commit of list) {
      const gen = generation.get(commit.hash) ?? 0;
      const ring = rings.get(gen) ?? [];
      ring.push(commit);
      rings.set(gen, ring);
    }
    const maxGen = Math.max(1, ...rings.keys());
    const span = Math.min(size.width, size.height);
    const placed = new Map<string, { x: number; y: number }>();
    for (const [gen, ring] of rings) {
      const r = gen === 0 ? (ring.length > 1 ? 26 : 0) : 46 + (gen / maxGen) * span * 0.44;
      ring.forEach((commit, i) => {
        const angle = (i / ring.length) * Math.PI * 2 + gen * 0.7;
        placed.set(commit.hash, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      });
    }
    nodes.current = list.map((commit) => {
      const position = placed.get(commit.hash) ?? { x: 0, y: 0 };
      return { commit, x: position.x, y: position.y, vx: 0, vy: 0, fx: null, fy: null };
    });
    byHash.current = new Map(nodes.current.map((n) => [n.commit.hash, n]));
    links.current = nodes.current.flatMap((n) =>
      n.commit.parents.flatMap((p) => {
        const target = byHash.current.get(p);
        return target ? [[n, target] as [OrbitNode, OrbitNode]] : [];
      })
    );
    setCamera((c) =>
      c.x === 0 && c.y === 0 && c.k === 1 ? { x: size.width / 2, y: size.height / 2, k: 1 } : c
    );
    alpha.current = 1;
    loop();
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [commits, size]);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = holder.current?.getBoundingClientRect();
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return { x: (sx - camera.x) / camera.k, y: (sy - camera.y) / camera.k };
  };
  const zoomAt = (factor: number, sx = size.width / 2, sy = size.height / 2) =>
    setCamera((current) => {
      const k = Math.max(0.2, Math.min(4, current.k * factor));
      return {
        x: sx - (sx - current.x) * (k / current.k),
        y: sy - (sy - current.y) * (k / current.k),
        k,
      };
    });
  const fit = () => {
    const ns = nodes.current;
    if (!ns.length) return;
    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = Math.max(60, maxX - minX);
    const h = Math.max(60, maxY - minY);
    const k = Math.max(
      0.2,
      Math.min(2, Math.min((size.width - 80) / w, (size.height - 80) / h))
    );
    setCamera({
      x: size.width / 2 - ((minX + maxX) / 2) * k,
      y: size.height / 2 - ((minY + maxY) / 2) * k,
      k,
    });
  };
  const wheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
  };

  return (
    <div ref={holder} className="relative h-full min-h-[440px] overflow-hidden">
      <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-xl border border-white/10 bg-black/45 p-1 text-[11px]">
        <button className="px-2" onClick={() => zoomAt(1 / 1.25)}>
          −
        </button>
        <span className="px-1 text-[10px] leading-6">{Math.round(camera.k * 100)}%</span>
        <button className="px-2" onClick={() => zoomAt(1.25)}>
          +
        </button>
        <button className="px-2 text-[10px]" onClick={fit}>
          Fit
        </button>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[9px] text-white/45">
        drag — pan · wheel — zoom · drag a commit — place it
      </div>
      <svg
        width={size.width}
        height={size.height}
        className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
        onWheel={wheel}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          moved.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
          const hit = (event.target as Element).closest('[data-orbit-node]');
          const node = hit ? byHash.current.get(hit.getAttribute('data-hash') ?? '') : undefined;
          if (node) {
            dragging.current = node;
            node.fx = node.x;
            node.fy = node.y;
            alpha.current = Math.max(alpha.current, 0.35);
            loop();
            return;
          }
          pan.current = { clientX: event.clientX, clientY: event.clientY, camera };
        }}
        onPointerMove={(event) => {
          if (dragging.current) {
            const point = toWorld(event.clientX, event.clientY);
            if (
              Math.abs(point.x - dragging.current.x) + Math.abs(point.y - dragging.current.y) >
              2 / camera.k
            )
              moved.current = true;
            dragging.current.fx = point.x;
            dragging.current.fy = point.y;
            alpha.current = Math.max(alpha.current, 0.15);
            return;
          }
          if (!pan.current) return;
          const start = pan.current;
          const dx = event.clientX - start.clientX;
          const dy = event.clientY - start.clientY;
          if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
          setCamera({ ...start.camera, x: start.camera.x + dx, y: start.camera.y + dy });
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          const node = dragging.current;
          if (node) {
            node.fx = null;
            node.fy = null;
            dragging.current = null;
            if (!moved.current) void choose(node.commit);
          }
          pan.current = null;
        }}
      >
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
          {links.current.map(([from, to]) => (
            <line
              key={`${from.commit.hash}:${to.commit.hash}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={COLORS[from.commit.lane % COLORS.length]}
              strokeWidth={1.4 / camera.k}
              opacity=".45"
            />
          ))}
          {nodes.current.map((node) => {
            const commit = node.commit;
            const active = selected?.hash === commit.hash;
            const item = risk[commit.hash];
            const info = meta.get(commit.hash);
            const isHead = commit.refs.some((ref) => ref.includes('HEAD'));
            const cat = categoryColor(commit, risk, info?.root ?? false, isHead);
            const nodeRadius = radius(active ? 12 : 7, item);
            return (
              <g
                data-orbit-node="true"
                data-hash={commit.hash}
                key={commit.hash}
                className="cursor-pointer"
                onPointerEnter={() => setHovered(commit)}
                onPointerLeave={() => setHovered(null)}
              >
                <circle cx={node.x} cy={node.y} r={Math.max(10, nodeRadius + 6)} fill="transparent" />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={active ? nodeRadius + 9 : nodeRadius + 3}
                  fill={active ? 'rgba(139,92,246,.25)' : 'transparent'}
                  stroke={active ? 'rgba(196,181,253,.8)' : 'transparent'}
                  strokeWidth="2"
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeRadius}
                  fill={cat.color}
                  stroke={active ? '#fff' : 'transparent'}
                  strokeWidth="2.5"
                />
                {info?.root && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={nodeRadius + 5}
                    fill="none"
                    stroke="#f6e05e"
                    strokeWidth="1.6"
                    opacity=".7"
                  />
                )}
                {isHead && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={nodeRadius + 8}
                    fill="none"
                    stroke="#63b3ed"
                    strokeWidth="1.6"
                    opacity=".6"
                  />
                )}
                {(active || camera.k > 0.75) && (
                  <text
                    x={node.x}
                    y={node.y + nodeRadius + 14}
                    textAnchor="middle"
                    fontSize={active ? '11' : '9'}
                    fill={active ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.6)'}
                  >
                    #{info?.ordinal} {commit.shortHash}
                  </text>
                )}
                {info?.root && camera.k > 0.9 && (
                  <text
                    x={node.x}
                    y={node.y - nodeRadius - 18}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#f6e05e"
                    opacity=".85"
                  >
                    first
                  </text>
                )}
                {commit.refs.length > 0 && (active || camera.k > 1.1) && (
                  <text
                    x={node.x}
                    y={node.y - nodeRadius - 9}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#4fd1c5"
                  >
                    {commit.refs[0].slice(0, 24)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {hovered && selected?.hash !== hovered.hash && (
        <div className="pointer-events-none absolute bottom-4 left-4 max-w-sm rounded-xl border border-lilac/25 bg-[#0b1020]/95 p-3 shadow-2xl">
          <div className="truncate text-xs text-white/85">{hovered.message}</div>
          <div className="mt-1 font-mono text-[10px] text-lilac">
            #{meta.get(hovered.hash)?.ordinal ?? '—'} · {hovered.shortHash}
          </div>
          <div className="mt-1 text-[10px] text-white/40">
            {hovered.author} · {new Date(hovered.timestamp * 1000).toLocaleString()}
          </div>
          {hovered.parents.length > 0 && (
            <div className="mt-1 text-[9px] text-white/35">
              after {hovered.parents.map((parent) => parent.slice(0, 7)).join(', ')}
            </div>
          )}
          <div className="mt-2 text-[9px] text-white/25">
            Click for diff and the same actions as Lanes
          </div>
        </div>
      )}
      <ColorLegend />
    </div>
  );
}
function CommitDetails({
  commit,
  risk,
  diff,
  close,
  prepare,
}: {
  commit: Commit;
  risk?: Risk;
  diff: DiffFile[] | null;
  close: () => void;
  prepare: (
    kind: 'merge' | 'rebase' | 'reset',
    ref: string,
    mode?: 'soft' | 'hard'
  ) => Promise<void>;
}) {
  return (
    <aside
      aria-label="Commit details"
      className="glass relative flex w-[38%] min-w-[330px] flex-col overflow-hidden"
    >
      <button
        aria-label="Close commit details"
        title="Close (Esc)"
        className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-lg text-white/60 hover:border-rose/50 hover:text-rose"
        onClick={close}
      >
        ×
      </button>
      <div className="border-b border-white/10 px-4 py-3 pr-14">
        <div className="text-sm">{commit.message}</div>
        <div className="mt-1 text-[11px] text-white/45">
          {commit.author} · {commit.hash.slice(0, 10)}
        </div>
        <div className="mt-1 text-[10px] text-white/30">
          {new Date(commit.timestamp * 1000).toLocaleString()}
        </div>
        {commit.refs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {commit.refs.map((ref) => (
              <span
                key={ref}
                className="rounded border border-teal/25 px-1.5 py-0.5 text-[9px] text-teal"
              >
                {ref}
              </span>
            ))}
          </div>
        )}
        {risk && (
          <div className="mt-2 rounded-lg border border-white/10 p-2 text-[10px] text-white/55">
            Risk {risk.score}/100 · {risk.files} files · {risk.churn} changed lines · local test{' '}
            {risk.test ?? 'not run'}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn text-[10px] text-amber"
            onClick={() => void prepare('reset', commit.hash, 'soft')}
          >
            Preview soft rollback
          </button>
          <button
            className="btn btn-danger text-[10px]"
            onClick={() => void prepare('reset', commit.hash, 'hard')}
          >
            Preview hard rollback
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {diff === null && <div className="p-4 text-xs">Loading diff…</div>}
        {diff?.length === 0 && (
          <div className="p-4 text-xs text-white/40">No displayable file diff.</div>
        )}
        {diff?.map((file) => (
          <DiffView key={`${file.oldPath}:${file.newPath}`} file={file} />
        ))}
      </div>
    </aside>
  );
}
function BranchMenu({
  branches,
  current,
  close,
  action,
  preview,
  interactive,
}: {
  branches: string[];
  current?: string;
  close: () => void;
  action: (run: () => Promise<unknown>, message?: string) => Promise<void>;
  preview: (kind: 'merge' | 'rebase', ref: string) => Promise<void>;
  interactive?: (branch: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="glass absolute right-0 top-10 z-30 w-72 p-2">
      <input
        className="field mb-2 w-full text-xs"
        placeholder="New branch…"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        className="btn btn-primary mb-2 w-full text-xs"
        disabled={!name.trim()}
        onClick={() => {
          close();
          void action(() => gitCall('checkout', 'HEAD', name.trim()));
        }}
      >
        Create and switch
      </button>
      {branches.map((branch) => (
        <div
          key={branch}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/8"
        >
          <button
            className={`min-w-0 flex-1 truncate text-left text-xs ${branch === current ? 'text-teal' : ''}`}
            onClick={() => {
              close();
              if (branch !== current) void action(() => gitCall('checkout', branch));
            }}
          >
            {branch}
          </button>
          {branch !== current && (
            <>
              <button
                className="text-[9px] text-lilac"
                onClick={() => {
                  close();
                  void preview('merge', branch);
                }}
              >
                merge
              </button>
              <button
                className="text-[9px] text-amber"
                onClick={() => {
                  close();
                  void preview('rebase', branch);
                }}
              >
                rebase
              </button>
              {interactive && (
                <button
                  className="text-[9px]"
                  onClick={() => {
                    close();
                    interactive(branch);
                  }}
                >
                  edit
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
function PreviewModal({
  preview,
  cancel,
  apply,
}: {
  preview: Preview;
  cancel: () => void;
  apply: () => Promise<void>;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 p-8">
      <div className="glass flex max-h-[80vh] w-full max-w-3xl flex-col p-5">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold">
              {preview.kind.toUpperCase()} preview · {preview.ref}
            </div>
            <div className={preview.conflicts ? 'text-xs text-rose' : 'text-xs text-teal'}>
              {preview.conflicts ? 'Possible conflicts detected' : 'Read-only preview complete'}
            </div>
          </div>
          <div className="flex-1" />
          <button className="btn" onClick={cancel}>
            Cancel
          </button>
          <button
            className={`btn ${preview.mode === 'hard' || preview.conflicts ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => void apply()}
          >
            Apply {preview.mode ?? preview.kind}
          </button>
        </div>
        <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-[11px] text-white/65">
          {preview.summary}
        </pre>
      </div>
    </div>
  );
}
