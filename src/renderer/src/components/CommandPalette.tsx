import { useEffect, useMemo, useRef, useState } from 'react';
import { gitCall } from '../lib/api';
import { useStore } from '../store';
import { useSettings } from '../settings';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void | Promise<void>;
}

function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx === -1) {
    // subsequence match
    let ti = 0;
    let hits = 0;
    for (const ch of q) {
      const found = t.indexOf(ch, ti);
      if (found === -1) return 0;
      ti = found + 1;
      hits++;
    }
    return 0.1 + hits / q.length / 10;
  }
  return idx === 0 ? 3 : 2 - idx / text.length;
}

export default function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { refresh, setToast } = useStore();
  const { update, settings } = useSettings();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    return commands
      .map((c) => ({ c, score: Math.max(fuzzyScore(query, c.label), fuzzyScore(query, c.group + ' ' + c.label)) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [query, commands]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  async function execute(cmd: Command) {
    onClose();
    try {
      await cmd.run();
      await refresh();
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[index]) execute(results[index].c);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="glass anim-in w-[560px] overflow-hidden p-0" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          className="w-full bg-transparent px-4 py-3.5 text-sm outline-none"
          style={{ border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', userSelect: 'text' }}
        />
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
          {results.length === 0 && <div className="px-3 py-4 text-xs text-white/35">No matching command</div>}
          {results.map(({ c }, i) => (
            <button
              key={c.id}
              onClick={() => execute(c)}
              onMouseEnter={() => setIndex(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === index ? 'bg-lilac/15 text-white' : 'text-white/70 hover:bg-white/5'}`}
            >
              <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-white/30">{c.group}</span>
              <span className="flex-1 truncate text-[13px]">{c.label}</span>
              {c.hint && <span className="shrink-0 font-mono text-[10px] text-white/35">{c.hint}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-white/8 px-4 py-2 text-[10px] text-white/30">
          <span>↑↓ navigate</span>
          <span>⏎ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
