import { useMemo, useState } from 'react';
import { layoutGraph, LANE_COLORS } from '@shared/graph';
import { useStore } from '../store';
import { gitCall } from '../lib/api';

export default function BisectView({ active, onClose }: { active: boolean; onClose: () => void }) {
  const { commits, refresh, setToast, status } = useStore();
  const laid = useMemo(() => layoutGraph(commits), [commits]);
  const [marks, setMarks] = useState<Record<string, 'good' | 'bad'>>({});
  const [asking, setAsking] = useState<string | null>(null);

  if (!active) return null;

  const head = status?.state === 'bisect' ? laid[0] : null;

  async function mark(good: boolean) {
    try {
      const checked = head?.hash;
      await gitCall('bisectMark', good);
      await refresh();
      if (checked) setMarks((m) => ({ ...m, [checked]: good ? 'good' : 'bad' }));
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="glass anim-in flex w-[720px] flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <span className="text-2xl">🕵️</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber">Detective mode — git bisect</div>
            <div className="text-[11px] text-white/50">
              Binary search through history to find the commit that broke things.
            </div>
          </div>
          <button
            className="btn btn-danger text-xs"
            onClick={async () => {
              await gitCall('bisectReset');
              await refresh();
              setMarks({});
              onClose();
            }}
          >
            Stop investigating
          </button>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] text-white/40">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal" /> good (works)
            <span className="ml-3 inline-block h-2.5 w-2.5 rounded-full bg-rose" /> bad (broken)
            <span className="ml-3 inline-block h-2.5 w-2.5 rounded-full border-2 border-amber" />{' '}
            current suspect
          </div>
          {laid.slice(0, 40).map((c) => {
            const m = marks[c.hash];
            const isHead = head && c.hash === head.hash;
            return (
              <div
                key={c.hash}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isHead ? 'bg-amber/15' : m === 'good' ? 'bg-teal/8' : m === 'bad' ? 'bg-rose/10' : 'hover:bg-white/5'}`}
              >
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${m === 'good' ? 'bg-teal' : m === 'bad' ? 'bg-rose' : 'bg-white/20'} ${isHead ? 'detective-node border-2 border-amber' : ''}`}
                  style={
                    m
                      ? undefined
                      : { background: LANE_COLORS[c.lane % LANE_COLORS.length], opacity: 0.5 }
                  }
                />
                <span className="flex-1 truncate text-xs text-white/80">{c.message}</span>
                <span className="font-mono text-[10px] text-white/35">{c.shortHash}</span>
                {m === 'good' && <span className="text-[10px] text-teal">✓ works</span>}
                {m === 'bad' && <span className="text-[10px] text-rose">✗ broken</span>}
                {isHead && <span className="text-[10px] text-amber">← checking now</span>}
              </div>
            );
          })}
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          {asking ? null : (
            <div className="flex items-center gap-3">
              <div className="flex-1 text-sm">
                {head ? (
                  <span>
                    Does <span className="font-mono text-amber">{head.shortHash}</span> “
                    {head.message}” work?
                  </span>
                ) : (
                  'No commit checked out.'
                )}
              </div>
              <button className="btn text-xs" onClick={() => setAsking('why')}>
                How do I check?
              </button>
              <button
                className="btn btn-primary text-xs"
                style={{
                  borderColor: 'rgba(79,209,197,.6)',
                  background: 'linear-gradient(135deg, rgba(74,222,128,.8), rgba(79,209,197,.6))',
                }}
                onClick={() => mark(true)}
              >
                ✓ Works
              </button>
              <button
                className="btn btn-primary text-xs"
                style={{
                  borderColor: 'rgba(245,101,101,.5)',
                  background: 'linear-gradient(135deg, rgba(248,113,113,.8), rgba(245,101,101,.5))',
                }}
                onClick={() => mark(false)}
              >
                ✗ Broken
              </button>
            </div>
          )}
          {asking === 'why' && (
            <div className="text-xs text-white/60">
              Luma has checked out the suspect commit for you. Build / run your project now, then
              come back and press ✓ or ✗. Each answer halves the search — typically ~3–7 checks for
              months of history.
              <button className="btn ml-2 text-xs" onClick={() => setAsking(null)}>
                Got it
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
