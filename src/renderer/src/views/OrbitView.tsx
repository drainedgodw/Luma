import { useEffect, useMemo, useRef, useState } from 'react';
import type { Commit, DiffFile } from '@shared/types';
import { layoutGraph, LANE_COLORS } from '@shared/graph';
import { useStore } from '../store';
import { gitCall } from '../lib/api';
import DiffView from '../components/DiffView';

interface OrbitNode {
  commit: Commit;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lane: number;
}

const MAX_NODES = 280;

function forceLayout(commits: ReturnType<typeof layoutGraph>, width: number, height: number): OrbitNode[] {
  if (!commits.length) return [];
  const nodes = commits.slice(0, MAX_NODES).map((commit, index) => {
    const progress = commits.length > 1 ? index / (commits.length - 1) : 0;
    const angle = index * 2.399963;
    const radius = 42 + progress * Math.min(width, height) * 0.42;
    return {
      commit,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      lane: commit.lane,
    };
  });
  const byHash = new Map(nodes.map((node, index) => [node.commit.hash, index]));
  const edges: Array<[number, number]> = [];
  for (const node of nodes) {
    const child = byHash.get(node.commit.hash);
    for (const parentHash of node.commit.parents) {
      const parent = byHash.get(parentHash);
      if (child !== undefined && parent !== undefined) edges.push([child, parent]);
    }
  }

  for (let tick = 0; tick < 90; tick++) {
    const alpha = 1 - tick / 90;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const distanceSquared = Math.max(25, dx * dx + dy * dy);
        const distance = Math.sqrt(distanceSquared);
        const force = (1700 / distanceSquared) * alpha;
        nodes[i].vx -= (dx / distance) * force;
        nodes[i].vy -= (dy / distance) * force;
        nodes[j].vx += (dx / distance) * force;
        nodes[j].vy += (dy / distance) * force;
      }
    }
    for (const [childIndex, parentIndex] of edges) {
      const child = nodes[childIndex];
      const parent = nodes[parentIndex];
      const dx = parent.x - child.x;
      const dy = parent.y - child.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (distance - 78) * 0.016 * alpha;
      child.vx += (dx / distance) * force;
      child.vy += (dy / distance) * force;
      parent.vx -= (dx / distance) * force * 0.35;
      parent.vy -= (dy / distance) * force * 0.35;
    }
    for (const node of nodes) {
      node.vx += (width / 2 - node.x) * 0.006 * alpha;
      node.vy += (height / 2 - node.y) * 0.006 * alpha;
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x = Math.max(28, Math.min(width - 28, node.x + node.vx));
      node.y = Math.max(28, Math.min(height - 28, node.y + node.vy));
    }
  }
  return nodes;
}

export default function OrbitView() {
  const { commits } = useStore();
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 650 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<Commit | null>(null);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const laid = useMemo(() => layoutGraph(commits), [commits]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const nodes = useMemo(
    () => forceLayout(laid, size.width, size.height),
    [laid, size.width, size.height],
  );
  const byHash = useMemo(() => new Map(nodes.map((node) => [node.commit.hash, node])), [nodes]);
  const headHash = useMemo(
    () => laid.find((commit) => commit.refs.some((ref) => ref.startsWith('HEAD')))?.hash,
    [laid],
  );

  async function selectCommit(commit: Commit) {
    setSelected(commit);
    setDiff(null);
    try {
      setDiff(await gitCall<DiffFile[]>('commitDiff', commit.hash));
    } catch {
      setDiff([]);
    }
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="glass relative min-w-0 flex-1 overflow-hidden" ref={container}>
        <div className="absolute left-4 top-3 z-10 rounded-xl border border-white/10 bg-black/25 px-3 py-2 backdrop-blur-xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lilac">Orbit</div>
          <div className="mt-0.5 text-[10px] text-white/35">
            {nodes.length} commit nodes{laid.length > MAX_NODES ? ` · newest ${MAX_NODES} shown` : ''}
          </div>
        </div>
        <svg width={size.width} height={size.height} className="absolute inset-0">
          <defs>
            <filter id="orbit-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {nodes.flatMap((node) =>
            node.commit.parents.map((parentHash) => {
              const parent = byHash.get(parentHash);
              if (!parent) return null;
              const hot = hovered === node.commit.hash || hovered === parentHash || selected?.hash === node.commit.hash || selected?.hash === parentHash;
              const middleX = (node.x + parent.x) / 2 - (parent.y - node.y) * 0.12;
              const middleY = (node.y + parent.y) / 2 + (parent.x - node.x) * 0.12;
              return (
                <path
                  key={`${node.commit.hash}-${parentHash}`}
                  d={`M ${node.x} ${node.y} Q ${middleX} ${middleY} ${parent.x} ${parent.y}`}
                  fill="none"
                  stroke={LANE_COLORS[node.lane % LANE_COLORS.length]}
                  strokeWidth={hot ? 2 : 1.1}
                  opacity={hovered && !hot ? 0.08 : hot ? 0.85 : 0.3}
                  filter={hot ? 'url(#orbit-glow)' : undefined}
                />
              );
            }),
          )}
          {nodes.map((node) => {
            const commit = node.commit;
            const color = LANE_COLORS[node.lane % LANE_COLORS.length];
            const isHead = commit.hash === headHash;
            const isSelected = selected?.hash === commit.hash;
            const isHovered = hovered === commit.hash;
            const radius = isHead ? 11 : isSelected ? 9.5 : isHovered ? 8 : 5.5;
            const branch = commit.refs.find((ref) => ref !== 'HEAD');
            return (
              <g
                key={commit.hash}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(commit.hash)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => selectCommit(commit)}
              >
                {isHead && (
                  <circle cx={node.x} cy={node.y} r="20" fill="none" stroke={color} opacity="0.45">
                    <animate attributeName="r" values="16;25;16" dur="2.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0.08;0.5" dur="2.8s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  fill={color}
                  opacity={hovered && !isHovered && !isSelected ? 0.28 : 0.95}
                  filter={isHead || isHovered || isSelected ? 'url(#orbit-glow)' : undefined}
                />
                {isSelected && <circle cx={node.x} cy={node.y} r={radius + 5} fill="none" stroke="#c4b5fd" strokeWidth="1.4" />}
                {(isHovered || isSelected || isHead) && (
                  <text x={node.x} y={node.y + radius + 13} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.8)">
                    {branch?.replace('HEAD -> ', '').replace('origin/', '') || commit.shortHash}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {selected && (
        <div className="glass anim-in flex w-[36%] min-w-[320px] flex-col overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-sm text-white/90">{selected.message}</div>
            <div className="mt-1 text-[11px] text-white/40">
              {selected.author} · {new Date(selected.timestamp * 1000).toLocaleString()} · {selected.shortHash}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {diff === null && <div className="p-4 text-xs text-white/40">Loading diff…</div>}
            {diff?.length === 0 && <div className="p-4 text-xs text-white/40">No textual changes.</div>}
            {diff?.map((file) => <DiffView key={file.newPath} file={file} />)}
          </div>
        </div>
      )}
    </div>
  );
}
