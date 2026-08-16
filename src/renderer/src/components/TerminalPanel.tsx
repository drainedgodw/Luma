import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../lib/api';
import { useStore } from '../store';

let counter = 0;

export default function TerminalPanel({ onClose }: { onClose: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const { repo } = useStore();
  const [id] = useState(() => `term-${Date.now()}-${++counter}`);

  useEffect(() => {
    if (!holder.current || !repo) return;
    const term = new Terminal({
      fontSize: 12.5,
      fontFamily: 'var(--font-mono), monospace',
      theme: {
        background: 'rgba(8, 10, 18, 0.55)',
        foreground: '#e6e6f0',
        cursor: '#c4b5fd',
        selectionBackground: 'rgba(139,92,246,0.35)',
        black: '#16161f',
        red: '#f56565',
        green: '#68d391',
        yellow: '#f6ad55',
        blue: '#63b3ed',
        magenta: '#f687b3',
        cyan: '#4fd1c5',
        white: '#e6e6f0',
      },
      allowProposedApi: true,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(holder.current);

    api.termCreate(id);
    api.termOnData(id, (data) => term.write(data));
    api.termOnExit(id, () => term.write('\r\n\x1b[90m[process exited — close panel to restart]\x1b[0m'));
    term.onData((data) => api.termWrite(id, data));

    const doFit = () => {
      try {
        fit.fit();
        api.termResize(id, term.cols, term.rows);
      } catch {
        /* hidden */
      }
    };
    const ro = new ResizeObserver(doFit);
    ro.observe(holder.current);
    setTimeout(doFit, 60);
    termRef.current = term;
    term.focus();

    return () => {
      ro.disconnect();
      api.termKill(id);
      term.dispose();
      termRef.current = null;
    };
  }, [id, repo]);

  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wider text-white/40">Terminal</span>
        <span className="font-mono text-[10px] text-white/25">{repo}</span>
        <div className="flex-1" />
        <button className="text-[11px] text-white/40 hover:text-white" title="Close terminal" onClick={onClose}>✕</button>
      </div>
      <div ref={holder} className="min-h-0 flex-1 px-2 py-1" style={{ background: 'rgba(8,10,18,0.45)' }} />
    </div>
  );
}
