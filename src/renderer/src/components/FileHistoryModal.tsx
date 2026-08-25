import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function FileHistoryModal({
  path,
  onRestore,
  onClose,
}: {
  path: string;
  onRestore: (content: string) => void;
  onClose: () => void;
}) {
  const [snaps, setSnaps] = useState<number[] | null>(null);
  const [preview, setPreview] = useState<{ ts: number; content: string } | null>(null);

  useEffect(() => {
    api.historyList(path).then((r) => setSnaps(r.data ?? []));
  }, [path]);

  async function show(ts: number) {
    const r = await api.historyGet(path, ts);
    if (r.ok) setPreview({ ts, content: r.data ?? '' });
  }

  function ago(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="glass anim-in flex h-[70vh] w-[820px] flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <span className="text-sm">🕓 File history</span>
          <span className="flex-1 truncate font-mono text-xs text-white/50">{path}</span>
          <button className="text-white/50 hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-52 shrink-0 overflow-y-auto border-r border-white/8 p-2">
            {snaps === null && <div className="p-2 text-xs text-white/40">Loading…</div>}
            {snaps?.length === 0 && (
              <div className="p-2 text-xs text-white/40">
                No snapshots yet — they are taken on every save.
              </div>
            )}
            {snaps?.map((ts, i) => (
              <button
                key={ts}
                onClick={() => show(ts)}
                className={`mb-1 flex w-full flex-col rounded-lg px-2.5 py-2 text-left text-xs hover:bg-white/6 ${preview?.ts === ts ? 'bg-lilac/15 text-lilac' : 'text-white/70'}`}
              >
                <span>{i === 0 ? 'latest save' : ago(ts)}</span>
                <span className="text-[10px] text-white/30">{new Date(ts).toLocaleString()}</span>
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-auto p-4">
            {!preview && (
              <div className="text-xs text-white/40">Pick a snapshot to preview it.</div>
            )}
            {preview && (
              <>
                <pre
                  className="mb-3 max-h-[80%] overflow-auto rounded-xl border border-white/10 p-3 font-mono text-[12px] leading-relaxed text-white/70"
                  style={{ userSelect: 'text' }}
                >
                  {preview.content.split('\n').slice(0, 400).join('\n')}
                </pre>
                <div className="flex justify-end gap-2">
                  <button
                    className="btn btn-primary text-xs"
                    onClick={() => {
                      onRestore(preview.content);
                      onClose();
                    }}
                  >
                    Restore this version
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
