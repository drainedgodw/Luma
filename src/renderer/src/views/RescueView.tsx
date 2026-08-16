import { useCallback, useEffect, useState } from 'react';
import type { ReflogEntry } from '../../../main/git/engine';
import { gitCall } from '../lib/api';
import { useStore } from '../store';

export default function RescueView() {
  const { refresh, setToast } = useStore();
  const [entries, setEntries] = useState<ReflogEntry[] | null>(null);
  const [confirm, setConfirm] = useState<ReflogEntry | null>(null);

  const load = useCallback(() => {
    gitCall<ReflogEntry[]>('reflog').then(setEntries).catch((e) => {
      setToast((e as Error).message);
      setEntries([]);
    });
  }, [setToast]);

  useEffect(load, [load]);

  async function rewind(entry: ReflogEntry, mode: 'hard' | 'soft') {
    try {
      await gitCall(mode === 'hard' ? 'rewindHard' : 'rewindSoft', entry.selector);
      await refresh();
      load();
      setToast(`Rewound to ${entry.selector} (${mode})`);
    } catch (e) {
      setToast((e as Error).message);
    }
    setConfirm(null);
  }

  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
        <span className="text-[11px] uppercase tracking-wider text-white/40">Rescue</span>
        <span className="text-[11px] text-white/25">every move HEAD ever made — jump back to any moment</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {entries === null && <div className="p-3 text-xs text-white/40">Loading…</div>}
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {entries?.map((e, i) => (
            <div key={`${e.selector}-${i}`} className="glass-soft group flex items-center gap-3 px-4 py-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${i === 0 ? 'bg-teal shadow-[0_0_8px_#4fd1c5]' : 'bg-white/20'}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-white/80">{e.summary}</div>
                <div className="font-mono text-[10px] text-white/30">{e.selector} · {e.shortHash}</div>
              </div>
              {i > 0 && (
                <div className="flex shrink-0 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="btn px-2 py-1 text-[10px]" title="Choose how to jump back to this point" onClick={() => setConfirm(e)}>Jump back</button>
                </div>
              )}
              {i === 0 && <span className="shrink-0 text-[10px] text-teal">now</span>}
            </div>
          ))}
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass anim-in w-[440px] p-5">
            <div className="mb-2 text-sm font-semibold text-amber">⚠ Rewind history?</div>
            <div className="mb-1 text-xs text-white/60">
              Move HEAD to <span className="font-mono text-amber">{confirm.selector}</span> — “{confirm.summary}”
            </div>
            <div className="mb-4 text-[11px] text-white/35">
              Hard discards everything after this point permanently. Soft keeps the changes staged.
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn text-xs" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn text-xs" onClick={() => rewind(confirm, 'soft')}>Soft rewind</button>
              <button className="btn btn-danger text-xs" onClick={() => rewind(confirm, 'hard')}>Hard rewind</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
