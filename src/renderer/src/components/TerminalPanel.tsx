import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useSettings } from '../settings';

let counter = 0;
type TrustState = 'checking' | 'restricted' | 'trusted';

const THEMES = {
  cosmos: {
    bg: 'transparent',
    fg: '#e6e6f0',
    cursor: '#c4b5fd',
    selection: 'rgba(139,92,246,.35)',
  },
  liquid: {
    bg: 'transparent',
    fg: '#f2f4fa',
    cursor: '#a5f3fc',
    selection: 'rgba(165,243,252,.30)',
  },
} as const;

export default function TerminalPanel({ onClose }: { onClose: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const { repo } = useStore();
  const { settings } = useSettings();
  const [id] = useState(() => `term-${Date.now()}-${++counter}`);
  const [trust, setTrust] = useState<TrustState>('checking');
  const [trustError, setTrustError] = useState('');
  const theme = THEMES[settings.theme === 'liquid' ? 'liquid' : 'cosmos'];

  useEffect(() => {
    localStorage.setItem('luma.terminalOpen', '1');
    return () => localStorage.setItem('luma.terminalOpen', '0');
  }, []);

  useEffect(() => {
    let active = true;
    setTrust('checking');
    setTrustError('');
    void api.intelInvoke('trustStatus').then((result) => {
      if (!active) return;
      setTrust(result.ok && Boolean(result.data) ? 'trusted' : 'restricted');
      if (!result.ok)
        setTrustError(result.error?.message ?? 'Could not read workspace trust status.');
    });
    return () => {
      active = false;
    };
  }, [repo]);

  useEffect(() => {
    const terminal = termRef.current;
    if (terminal) {
      terminal.options.theme = {
        ...terminal.options.theme,
        background: theme.bg,
        foreground: theme.fg,
        cursor: theme.cursor,
        selectionBackground: theme.selection,
      };
    }
  }, [theme]);

  useEffect(() => {
    if (!holder.current || !repo || trust !== 'trusted') return;

    const term = new Terminal({
      fontSize: 12.5,
      fontFamily: 'var(--font-mono), monospace',
      theme: {
        background: theme.bg,
        foreground: theme.fg,
        cursor: theme.cursor,
        selectionBackground: theme.selection,
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
      cursorBlink: !settings.reduceMotion,
      scrollback: 2000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(holder.current);

    api.termOnData(id, (data) => term.write(data));
    api.termOnExit(id, () =>
      term.write('\r\n\x1b[90m[process exited — close panel to restart]\x1b[0m')
    );
    const input = term.onData((data) => api.termWrite(id, data));
    api.termCreate(id);

    let frame = 0;
    let lastCols = 0;
    let lastRows = 0;
    const fitNow = () => {
      frame = 0;
      try {
        fit.fit();
        if (term.cols !== lastCols || term.rows !== lastRows) {
          lastCols = term.cols;
          lastRows = term.rows;
          api.termResize(id, term.cols, term.rows);
        }
      } catch {}
    };
    const resize = () => {
      if (!frame) frame = window.requestAnimationFrame(fitNow);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(holder.current);
    resize();

    termRef.current = term;
    term.focus();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      input.dispose();
      api.termOff(id);
      api.termKill(id);
      term.dispose();
      termRef.current = null;
    };
  }, [id, repo, settings.reduceMotion, trust]);

  async function trustRepository() {
    if (
      !window.confirm(
        'Trust this repository? Terminal commands and local tasks can execute code from it.'
      )
    )
      return;
    setTrustError('');
    const result = await api.intelInvoke('setTrust', true);
    if (!result.ok || !result.data) {
      setTrustError(result.error?.message ?? 'Could not trust this repository.');
      return;
    }
    setTrust('trusted');
    window.dispatchEvent(new CustomEvent('luma:trust-changed', { detail: true }));
  }

  return (
    <div className="term-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border">
      <style>{`.term-panel .xterm,.term-panel .xterm-viewport,.term-panel .xterm-screen{background:transparent!important}.term-panel .xterm-viewport{scrollbar-color:rgba(255,255,255,.16) transparent}`}</style>
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wider text-white/40">Terminal</span>
        <span className="truncate font-mono text-[10px] text-white/25">{repo}</span>
        <div className="flex-1" />
        <button className="text-[11px] text-white/40 hover:text-white" onClick={onClose}>
          ✕
        </button>
      </div>
      {trust === 'trusted' ? (
        <div ref={holder} className="min-h-0 flex-1 px-2 py-1" />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="max-w-lg text-center">
            <div className="text-sm font-semibold text-amber">
              Terminal locked for this repository
            </div>
            <p className="mt-2 text-xs leading-5 text-white/45">
              Luma blocks shell execution until you explicitly trust the repository. This prevents
              an unfamiliar project from running local commands without your approval.
            </p>
            {trustError && <div className="mt-2 text-xs text-rose">{trustError}</div>}
            <button
              className="btn btn-primary mt-4"
              disabled={trust === 'checking'}
              onClick={() => void trustRepository()}
            >
              {trust === 'checking' ? 'Checking trust…' : 'Trust & start terminal'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
