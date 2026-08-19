import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useSettings } from '../settings';

let counter = 0;
const THEMES = {
  cosmos: { bg: 'transparent', fg: '#e6e6f0', cursor: '#c4b5fd', selection: 'rgba(139,92,246,0.35)' },
  liquid: { bg: 'transparent', fg: '#f2f4fa', cursor: '#a5f3fc', selection: 'rgba(165,243,252,0.30)' },
} as const;

export default function TerminalPanel({ onClose }: { onClose: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const { repo } = useStore();
  const { settings } = useSettings();
  const [id] = useState(() => `term-${Date.now()}-${++counter}`);
  const theme = THEMES[settings.theme === 'liquid' ? 'liquid' : 'cosmos'];

  useEffect(() => {
    const terminal = termRef.current;
    if (!terminal) return;
    terminal.options.theme = { ...terminal.options.theme, background: theme.bg, foreground: theme.fg, cursor: theme.cursor, selectionBackground: theme.selection };
  }, [theme]);

  useEffect(() => {
    if (!holder.current || !repo) return;
    const term = new Terminal({ fontSize: 12.5, fontFamily: 'var(--font-mono), monospace', theme: { background: theme.bg, foreground: theme.fg, cursor: theme.cursor, selectionBackground: theme.selection, black: '#16161f', red: '#f56565', green: '#68d391', yellow: '#f6ad55', blue: '#63b3ed', magenta: '#f687b3', cyan: '#4fd1c5', white: '#e6e6f0' }, allowProposedApi: true, cursorBlink: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(holder.current);
    api.termCreate(id);
    api.termOnData(id, (data) => term.write(data));
    api.termOnExit(id, () => term.write('\r\n\x1b[90m[process exited — close panel to restart]\x1b[0m'));
    term.onData((data) => api.termWrite(id, data));
    const doFit = () => { try { fit.fit(); api.termResize(id, term.cols, term.rows); } catch { /* hidden */ } };
    const observer = new ResizeObserver(doFit);
    observer.observe(holder.current);
    setTimeout(doFit, 60);
    termRef.current = term;
    term.focus();
    return () => { observer.disconnect(); api.termKill(id); term.dispose(); termRef.current = null; };
  }, [id, repo]);

  return (
    <div className="glass term-panel flex h-full min-h-0 flex-col overflow-hidden">
      <style>{`.term-panel,.term-panel .xterm,.term-panel .xterm-viewport,.term-panel .xterm-screen{background:transparent!important}.term-panel .xterm-viewport{scrollbar-color:rgba(255,255,255,.16) transparent}`}</style>
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-1.5"><span className="text-[11px] uppercase tracking-wider text-white/40">Terminal</span><span className="font-mono text-[10px] text-white/25">{repo}</span><div className="flex-1" /><button className="text-[11px] text-white/40 hover:text-white" title="Close terminal" onClick={onClose}>✕</button></div>
      <div ref={holder} className="min-h-0 flex-1 px-2 py-1" style={{ background: 'transparent' }} />
    </div>
  );
}
