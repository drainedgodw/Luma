import { useState } from 'react';
import type { DiffFile } from '@shared/types';

export default function DiffView({ file }: { file: DiffFile }) {
  const [open, setOpen] = useState(true);
  const adds = file.hunks.reduce((n, h) => n + h.lines.filter((l) => l.type === 'add').length, 0);
  const dels = file.hunks.reduce((n, h) => n + h.lines.filter((l) => l.type === 'del').length, 0);

  return (
    <div className="mx-3 my-2 overflow-hidden rounded-xl border border-white/8">
      <button
        className="flex w-full items-center gap-2 bg-white/3 px-3 py-2 text-left hover:bg-white/6"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-white/35">{open ? '▾' : '▸'}</span>
        <span className="flex-1 truncate font-mono text-xs text-white/80">{file.newPath}</span>
        {file.status !== 'modified' && (
          <span className="rounded border border-white/15 px-1.5 text-[10px] uppercase text-white/50">
            {file.status}
          </span>
        )}
        <span className="text-[11px] text-dif-add-text">+{adds}</span>
        <span className="text-[11px] text-dif-del-text">−{dels}</span>
      </button>
      {open && (
        <div className="overflow-x-auto bg-black/25 font-mono text-[12px] leading-[1.55]">
          {file.binary ? (
            <div className="px-3 py-3 text-xs text-white/40">Binary file</div>
          ) : (
            file.hunks.map((h, hi) => (
              <div key={hi}>
                <div className="bg-white/4 px-3 py-1 text-[11px] text-lilac/70">
                  @@ -{h.oldStart} +{h.newStart}
                </div>
                {h.lines.map((l, li) => (
                  <div
                    key={li}
                    className={`flex ${l.type === 'add' ? 'dif-add' : l.type === 'del' ? 'dif-del' : ''}`}
                  >
                    <span className="w-10 shrink-0 select-none pr-2 text-right text-white/25">
                      {l.oldNo ?? ''}
                    </span>
                    <span className="w-10 shrink-0 select-none pr-2 text-right text-white/25">
                      {l.newNo ?? ''}
                    </span>
                    <span
                      className={`w-4 shrink-0 select-none ${l.type === 'add' ? 'text-dif-add-text' : l.type === 'del' ? 'text-dif-del-text' : 'text-white/20'}`}
                    >
                      {l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}
                    </span>
                    <span
                      className={`whitespace-pre ${l.type === 'add' ? 'dif-add-text' : l.type === 'del' ? 'dif-del-text' : 'text-white/70'}`}
                    >
                      {l.content}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
