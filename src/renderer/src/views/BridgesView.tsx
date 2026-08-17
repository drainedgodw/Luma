import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BranchBridge } from '../../../main/git/engine';
import { useStore } from '../store';
import { gitCall, api } from '../lib/api';
import { LANE_COLORS } from '@shared/graph';

/** A "bridge" card: source branch —arc→ base branch, PR-style actions. */
export default function BridgesView({ onRebase }: { onRebase?: (branch: string) => void }) {
  const { commits, refresh, setToast, status } = useStore();
  const [base, setBase] = useState<string | null>(null);
  const [bridges, setBridges] = useState<BranchBridge[] | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const branchNames = useMemo(() => {
    const tips = new Map<string, string>();
    for (const c of commits) {
      for (const r of c.refs) {
        const m = r.replace('HEAD -> ', '');
        if (m !== 'HEAD' && !m.startsWith('tag:')) tips.set(m.trim(), c.hash);
      }
    }
    return [...tips.keys()].filter((b) => !b.startsWith('origin/') && !b.includes('/'));
  }, [commits]);

  const load = useCallback(
    (baseBranch: string) => {
      gitCall<BranchBridge[]>('bridges', baseBranch)
        .then(setBridges)
        .catch((e) => {
          setToast((e as Error).message);
          setBridges([]);
        });
      gitCall<string | null>('remoteUrl').then(setRemoteUrl).catch(() => setRemoteUrl(null));
    },
    [setToast],
  );

  useEffect(() => {
    if (base) return;
    gitCall<string>('mainBranch').then((m) => setBase(branchNames.includes(m) ? m : (status?.branch ?? m)));
  }, [base, branchNames, status?.branch]);

  useEffect(() => {
    if (base) load(base);
  }, [base, load]);

  async function act(name: string, fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(name);
    try {
      await fn();
      await refresh();
      if (base) load(base);
      if (okMsg) setToast(okMsg);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function switchBase(b: string) {
    setBridges(null);
    setBase(b);
  }

  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
        <span className="text-[11px] uppercase tracking-wider text-white/40">Bridges</span>
        <span className="text-[11px] text-white/25">every branch is a bridge into</span>
        <div className="relative">
          <select
            value={base ?? ''}
            onChange={(e) => switchBase(e.target.value)}
            className="field cursor-pointer py-1 font-mono text-xs"
            style={{ userSelect: 'none' }}
          >
            {(branchNames.length > 0 ? branchNames : [base ?? 'main']).map((b) => (
              <option key={b} value={b} className="bg-deep">
                {b}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1" />
        <button className="btn text-xs" onClick={() => base && load(base)} title="Re-read branch state">↻ Refresh</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {bridges === null && <div className="p-3 text-xs text-white/40">Scanning bridges…</div>}
        {bridges?.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <div className="text-4xl opacity-20">🌉</div>
            <div className="text-sm text-white/40">No other branches</div>
            <div className="text-xs text-white/25">Create a branch in History → Branch, and its bridge appears here</div>
          </div>
        )}
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          {bridges?.map((b, i) => (
            <BridgeCard
              key={b.name}
              bridge={b}
              base={base ?? 'main'}
              color={LANE_COLORS[i % LANE_COLORS.length]}
              current={status?.branch}
              busy={busy === b.name}
              remoteUrl={remoteUrl}
              onRebase={onRebase}
              act={act}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BridgeCard({
  bridge, base, color, current, busy, remoteUrl, onRebase, act,
}: {
  bridge: BranchBridge;
  base: string;
  color: string;
  current?: string;
  busy: boolean;
  remoteUrl: string | null;
  onRebase?: (branch: string) => void;
  act: (name: string, fn: () => Promise<unknown>, okMsg?: string) => Promise<void>;
}) {
  const b = bridge;
  const isCurrent = b.name === current;
  const canFastForward = b.behind === 0 && b.ahead > 0;
  const diverged = b.behind > 0 && b.ahead > 0;
  const prUrl = remoteUrl ? `${remoteUrl}/compare/${base}...${b.name}?expand=1` : null;

  return (
    <div className={`glass-soft overflow-hidden transition-all duration-200 ${busy ? 'opacity-50' : ''} ${b.merged ? 'opacity-60' : ''}`}>
      {/* the bridge visual */}
      <div className="flex items-stretch gap-0 px-5 pt-4">
        {/* source node */}
        <div className="flex w-40 shrink-0 flex-col items-start gap-1">
          <span className="flex items-center gap-1.5 font-mono text-[13px]" style={{ color }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
            {b.name}
          </span>
          <span className="pl-4 text-[10px] text-white/30">{b.ahead} commit{b.ahead === 1 ? '' : 's'} ahead</span>
        </div>

        {/* arc */}
        <svg viewBox="0 0 120 44" className="h-11 min-w-[120px] flex-1" preserveAspectRatio="none">
          <path
            d={diverged ? 'M 4 22 C 34 22, 40 4, 60 4 C 80 4, 86 22, 116 22' : 'M 4 22 C 40 22, 80 22, 116 22'}
            fill="none"
            stroke={b.merged ? 'rgba(255,255,255,.2)' : color}
            strokeWidth={b.merged ? 1.5 : 2.2}
            strokeDasharray={diverged ? '5 4' : undefined}
            strokeLinecap="round"
            opacity="0.75"
          />
          {Array.from({ length: Math.min(b.ahead, 7) }).map((_, i, arr) => {
            const t = 0.18 + (i / Math.max(arr.length - 1, 1)) * 0.64;
            const x = 4 + t * 112;
            const y = 22 - Math.sin(t * Math.PI) * (diverged ? 18 : 2);
            return <circle key={i} cx={x} cy={y} r={2.4} fill={b.merged ? 'rgba(255,255,255,.35)' : color} />;
          })}
        </svg>

        {/* target node */}
        <div className="flex w-40 shrink-0 flex-col items-end gap-1">
          <span className="flex items-center gap-1.5 font-mono text-[13px] text-teal">
            {base}
            <span className="h-2.5 w-2.5 rounded-full bg-teal shadow-[0_0_8px_#4fd1c5]" />
          </span>
          <span className="pr-4 text-[10px] text-white/30">{b.behind === 0 ? 'ready to receive' : `${b.behind} ahead of you`}</span>
        </div>
      </div>

      {/* body */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        {b.merged ? (
          <span className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[10px] text-teal">merged — bridge closed</span>
        ) : b.ahead === 0 ? (
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/40">no own commits</span>
        ) : diverged ? (
          <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] text-amber">diverged — rebase first</span>
        ) : (
          <span className="rounded-full border border-lilac/40 bg-lilac/10 px-2 py-0.5 text-[10px] text-lilac">ready to merge</span>
        )}
        <span className="text-[10px] text-white/35">{b.files} files</span>
        <span className="text-[10px] text-dif-add-text">+{b.insertions}</span>
        <span className="text-[10px] text-dif-del-text">−{b.deletions}</span>
        {b.remoteTracking && <span className="rounded border border-white/10 px-1.5 text-[9px] text-white/30">↟ {b.remoteTracking}</span>}
        {isCurrent && <span className="rounded border border-teal/40 px-1.5 text-[9px] text-teal">checked out</span>}

        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          {prUrl && !b.merged && (
            <button
              className="btn px-2.5 py-1 text-[10px]"
              title={`Open a PR ${b.name} → ${base} on the forge`}
              onClick={() => api.openExternal(prUrl)}
            >
              ⇪ Open PR
            </button>
          )}
          {!b.merged && canFastForward && (
            <button
              className="btn px-2.5 py-1 text-[10px]"
              disabled={busy}
              title={`git checkout ${base} && git merge --ff-only ${b.name}`}
              onClick={() => act(b.name, async () => {
                await gitCall('checkout', base);
                await gitCall('merge', b.name, false);
              }, `Fast-forwarded ${base} to ${b.name}`)}
            >
              ⇥ Fast-forward
            </button>
          )}
          {!b.merged && b.ahead > 0 && (
            <button
              className="btn btn-primary px-2.5 py-1 text-[10px]"
              disabled={busy}
              title={`git checkout ${base} && git merge --no-ff ${b.name}`}
              onClick={() => act(b.name, async () => {
                await gitCall('checkout', base);
                await gitCall('merge', b.name, true);
              }, `Merged ${b.name} into ${base}`)}
            >
              ⌥ Merge bridge
            </button>
          )}
          {diverged && !b.merged && (
            <button
              className="btn px-2.5 py-1 text-[10px]"
              disabled={busy}
              title={`git rebase ${base}`}
              onClick={() => act(b.name, async () => {
                if (!isCurrent) await gitCall('checkout', b.name);
                await gitCall('rebase', base);
              }, `Rebased ${b.name} onto ${base}`)}
            >
              ↻ Rebase
            </button>
          )}
          {onRebase && !b.merged && (
            <button
              className="btn px-2.5 py-1 text-[10px]"
              disabled={busy}
              title="Rearrange, squash, drop commits before merging"
              onClick={() => {
                if (!isCurrent) act(b.name, () => gitCall('checkout', b.name)).then(() => onRebase(base));
                else onRebase(base);
              }}
            >
              ✎ Plan
            </button>
          )}
          {b.merged && (
            <button
              className="btn px-2.5 py-1 text-[10px] hover:border-rose/40 hover:text-rose"
              disabled={busy || isCurrent}
              title={`git branch -d ${b.name}`}
              onClick={() => act(b.name, () => gitCall('deleteBranch', b.name, false), `Deleted ${b.name}`)}
            >
              🗑 Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
