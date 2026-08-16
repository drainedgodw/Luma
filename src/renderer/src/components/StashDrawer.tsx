import { useCallback, useEffect, useState } from 'react';
import type { StashEntry } from '../../../main/git/engine';
import { gitCall } from '../lib/api';
import { useStore } from '../store';

export default function StashDrawer({ onClose }: { onClose: () => void }) {
  const { refresh, setToast } = useStore();
  const [entries, setEntries] = useState<StashEntry[] | null>(null);

  const load = useCallback(() => {
    gitCall<StashEntry[]>('stashList').then(setEntries).catch((e) => {
      setToast((e as Error).message);
      setEntries([]);
    });
  }, [setToast]);

  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await refresh();
      load();
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex justify-end bg-black/35 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="glass anim-in m-3 flex w-[380px] flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-sm">🗂 Stash drawer</span>
          <span className="flex-1" />
          <button className="text-white/50 hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2">
          <button className="btn btn-primary px-3 py-1 text-[11px]" onClick={() => act(() => gitCall('stashPush'))}>
            Stash current changes
          </button>
          <span className="text-[10px] text-white/30">git stash push</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {entries === null && <div className="p-3 text-xs text-white/40">Loading…</div>}
          {entries?.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <div className="text-3xl opacity-20">🗂</div>
              <div className="text-xs text-white/40">The drawer is empty</div>
              <div className="text-[11px] text-white/25">Stashed changes will collect here as cards</div>
            </div>
          )}
          {entries?.map((s) => (
            <div key={s.ref} className="glass-soft mb-2 flex flex-col gap-1.5 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-teal">{s.ref}</span>
                <span className="flex-1 truncate text-xs text-white/80" title={s.message}>{s.message || 'WIP'}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-white/35">
                <span>{new Date(s.timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <span>{s.files} files</span>
                <span className="text-dif-add-text">+{s.insertions}</span>
                <span className="text-dif-del-text">−{s.deletions}</span>
              </div>
              <div className="mt-1 flex gap-1.5">
                <button className="btn px-2 py-0.5 text-[10px]" title="Apply and keep in drawer" onClick={() => act(() => gitCall('stashApply', s.ref))}>Apply</button>
                <button className="btn px-2 py-0.5 text-[10px]" title="Apply and remove from drawer" onClick={() => act(() => gitCall('stashPop', s.ref))}>Pop</button>
                <button className="btn px-2 py-0.5 text-[10px] hover:border-rose/40 hover:text-rose" title="Delete this stash" onClick={() => act(() => gitCall('stashDrop', s.ref))}>Drop</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
