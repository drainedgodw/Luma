import { useMemo, useState } from 'react';
import type { ConflictFile } from '@shared/types';
import { gitCall } from '../lib/api';
import DiffView from './DiffView';

export default function ConflictModal({
  file,
  onClose,
  onResolved,
}: {
  file: ConflictFile;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [choices, setChoices] = useState<Record<number, 'ours' | 'theirs' | 'both'>>({});
  const { resolved, remaining } = useMemo(() => buildResolved(file, choices), [file, choices]);

  function buildResolved(f: ConflictFile, ch: Record<number, 'ours' | 'theirs' | 'both'>) {
    const lines = [...f.ours.split('\n')];
    // rebuild from ours + chosen replacements for each region by line numbers
    const out: string[] = [];
    const regionByStart = new Map(f.regions.map((r) => [r.startLine, r]));
    let i = 0;
    // We reconstruct from original conflicted content is complex; instead compose: ours base with regions replaced.
    // Simpler: use file content directly via regions markers — fall back to choice application:
    const source = f.ours.split('\n');
    const sourceRegions = findRegions(source, 'ours');
    let cursor = 0;
    for (const r of f.regions) {
      const src = sourceRegions.find((sr) => Math.abs(sr.startLine - r.startLine) <= 3);
      if (src) {
        out.push(...source.slice(cursor, src.startLine));
        const choice = choices[src.startLine] ?? 'ours';
        if (choice === 'ours') out.push(...r.ours);
        else if (choice === 'theirs') out.push(...r.theirs);
        else {
          const seen = new Set(r.ours);
          out.push(...r.ours, ...r.theirs.filter((l) => !seen.has(l)));
        }
        cursor = src.endLine + 1;
      }
    }
    out.push(...source.slice(cursor));
    return {
      resolved: out.join('\n'),
      remaining: f.regions.filter((r) => !choices[r.startLine]).length,
    };
  }

  function findRegions(lines: string[], _side: string) {
    const regions: { startLine: number; endLine: number }[] = [];
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('<<<<<<<')) start = i;
      else if (lines[i].startsWith('>>>>>>>') && start >= 0) {
        regions.push({ startLine: start, endLine: i });
        start = -1;
      }
    }
    return regions;
  }

  async function resolve(take?: 'ours' | 'theirs') {
    try {
      if (take) {
        await gitCall('resolveConflict', file.path, '', take);
      } else {
        await gitCall('resolveConflict', file.path, resolved, 'custom');
      }
      onResolved();
      onClose();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass anim-in flex max-h-[85vh] w-[860px] flex-col overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="text-sm text-amber">⚡ Resolve conflict</span>
          <span className="flex-1 truncate font-mono text-xs text-white/60">{file.path}</span>
          <button className="text-white/50 hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {file.regions.length === 0 && (
            <div className="mb-3 text-xs text-white/50">
              No conflict markers found — the file may already be resolved, or markers use a custom
              format.
            </div>
          )}
          {file.regions.map((r, idx) => {
            const srcStart =
              findRegions(file.ours.split('\n'), 'ours')[idx]?.startLine ?? r.startLine;
            const choice = choices[srcStart];
            return (
              <div key={idx} className="mb-4 overflow-hidden rounded-xl border border-white/10">
                <div className="flex items-center gap-2 border-b border-white/10 bg-white/4 px-3 py-2">
                  <span className="text-[11px] text-white/50">
                    Conflict #{idx + 1} · line {r.startLine + 1}
                  </span>
                  <div className="flex-1" />
                  {(['ours', 'theirs', 'both'] as const).map((c) => (
                    <button
                      key={c}
                      className={`btn px-3 py-1 text-[11px] ${choice === c ? 'border-lilac/60 bg-lilac/20 text-lilac' : ''}`}
                      onClick={() => setChoices((s) => ({ ...s, [srcStart]: c }))}
                    >
                      {c === 'ours' ? 'Keep ours' : c === 'theirs' ? 'Take theirs' : 'Keep both'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 font-mono text-[12px]">
                  <div className="dif-del">
                    <div className="bg-rose/15 px-3 py-1 text-[10px] uppercase tracking-wide text-rose">
                      Ours
                    </div>
                    {r.ours.slice(0, 30).map((l, i) => (
                      <div key={i} className="whitespace-pre px-3 dif-del-text">
                        {l || ' '}
                      </div>
                    ))}
                  </div>
                  <div className="dif-add">
                    <div className="bg-teal/15 px-3 py-1 text-[10px] uppercase tracking-wide text-teal">
                      Theirs
                    </div>
                    {r.theirs.slice(0, 30).map((l, i) => (
                      <div key={i} className="whitespace-pre px-3 dif-add-text">
                        {l || ' '}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {file.base && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-white/40">
                Show common ancestor
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-[11px] text-white/50">
                {file.base}
              </pre>
            </details>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
          <span className="text-[11px] text-white/40">
            {remaining > 0 ? `${remaining} region(s) default to "ours"` : 'All regions decided'}
          </span>
          <div className="flex-1" />
          <button className="btn text-xs" onClick={() => resolve('ours')}>
            All ours
          </button>
          <button className="btn text-xs" onClick={() => resolve('theirs')}>
            All theirs
          </button>
          <button className="btn btn-primary text-xs" onClick={() => resolve()}>
            Resolve & stage
          </button>
        </div>
      </div>
    </div>
  );
}

// silence unused DiffView import for future inline preview
export { DiffView };
