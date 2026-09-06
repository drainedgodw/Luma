import { useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useSettings } from '../settings';

let counter = 0;
type TrustState = 'checking' | 'restricted' | 'trusted';

const MIN_RATIO = 22;
const MAX_RATIO = 82;
const DEFAULT_RATIO = 38;
const HEIGHT_KEY = 'luma.terminalHeight';

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

function clampRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

function storedRatio(): number {
  try {
    const stored = localStorage.getItem(HEIGHT_KEY);
    if (stored === null) return DEFAULT_RATIO;
    const value = Number(stored);
    return Number.isFinite(value) ? clampRatio(value) : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

export default function TerminalPanel({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const { repo } = useStore();
  const { settings } = useSettings();
  const [id] = useState(() => `term-${Date.now()}-${++counter}`);
  const [trust, setTrust] = useState<TrustState>('checking');
  const [trustError, setTrustError] = useState('');
  const [heightRatio, setHeightRatio] = useState(storedRatio);
  const [maximized, setMaximized] = useState(false);
  const theme = THEMES[settings.theme === 'liquid' ? 'liquid' : 'cosmos'];

  useEffect(() => {
    localStorage.setItem('luma.terminalOpen', '1');
    return () => localStorage.setItem('luma.terminalOpen', '0');
  }, []);

  useEffect(() => {
    localStorage.setItem(HEIGHT_KEY, String(heightRatio));
  }, [heightRatio]);

  useEffect(() => {
    const frame = panel.current?.parentElement as HTMLElement | null;
    const stack = frame?.parentElement as HTMLElement | null;
    if (!frame || !stack) return;
    const previousFrame = {
      position: frame.style.position,
      inset: frame.style.inset,
      zIndex: frame.style.zIndex,
      height: frame.style.height,
      minHeight: frame.style.minHeight,
      flexShrink: frame.style.flexShrink,
    };
    const previousStackPosition = stack.style.position;
    return () => {
      Object.assign(frame.style, previousFrame);
      stack.style.position = previousStackPosition;
    };
  }, []);

  useEffect(() => {
    const frame = panel.current?.parentElement as HTMLElement | null;
    const stack = frame?.parentElement as HTMLElement | null;
    if (!frame || !stack) return;
    stack.style.position = 'relative';
    if (maximized) {
      frame.style.position = 'absolute';
      frame.style.inset = '0';
      frame.style.zIndex = '30';
      frame.style.height = 'auto';
      frame.style.minHeight = '0';
      frame.style.flexShrink = '1';
    } else {
      frame.style.position = '';
      frame.style.inset = '';
      frame.style.zIndex = '';
      frame.style.height = `${heightRatio}%`;
      frame.style.minHeight = '160px';
      frame.style.flexShrink = '0';
    }
  }, [heightRatio, maximized]);

  useEffect(() => () => dragCleanup.current?.(), []);

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

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const frame = panel.current?.parentElement as HTMLElement | null;
    const stack = frame?.parentElement as HTMLElement | null;
    if (!stack) return;
    event.preventDefault();
    dragCleanup.current?.();
    setMaximized(false);
    const bounds = stack.getBoundingClientRect();
    const setFromPointer = (clientY: number) => {
      const ratio = ((bounds.bottom - clientY) / Math.max(bounds.height, 1)) * 100;
      setHeightRatio(clampRatio(ratio));
    };
    setFromPointer(event.clientY);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const move = (next: PointerEvent) => setFromPointer(next.clientY);
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      dragCleanup.current = null;
    };
    dragCleanup.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    if (event.key === 'ArrowUp') next = heightRatio + 4;
    else if (event.key === 'ArrowDown') next = heightRatio - 4;
    else if (event.key === 'Home') next = MIN_RATIO;
    else if (event.key === 'End') next = MAX_RATIO;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setMaximized((value) => !value);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setMaximized(false);
    setHeightRatio(clampRatio(next));
  }

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
    <div
      ref={panel}
      className="term-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border"
    >
      <style>{`.term-panel .xterm,.term-panel .xterm-viewport,.term-panel .xterm-screen{background:transparent!important}.term-panel .xterm-viewport{scrollbar-color:rgba(255,255,255,.16) transparent}`}</style>
      <div
        role="separator"
        aria-label="Resize terminal"
        aria-orientation="horizontal"
        aria-valuemin={MIN_RATIO}
        aria-valuemax={MAX_RATIO}
        aria-valuenow={Math.round(heightRatio)}
        aria-valuetext={maximized ? 'Maximized' : `${Math.round(heightRatio)} percent`}
        tabIndex={0}
        title="Drag to resize · Double-click or press Enter to maximize"
        onPointerDown={beginResize}
        onDoubleClick={() => setMaximized((value) => !value)}
        onKeyDown={resizeWithKeyboard}
        className="group flex h-3 shrink-0 touch-none cursor-ns-resize items-center justify-center outline-none focus-visible:bg-lilac/10"
      >
        <span className="h-0.5 w-12 rounded-full bg-white/12 transition-colors group-hover:bg-lilac/60 group-focus-visible:bg-lilac/70" />
      </div>
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wider text-white/40">Terminal</span>
        <span className="truncate font-mono text-[10px] text-white/25">{repo}</span>
        <div className="flex-1" />
        <span className="text-[10px] text-white/20">
          {maximized ? 'maximized' : `${Math.round(heightRatio)}%`}
        </span>
        <button
          aria-label={maximized ? 'Restore terminal size' : 'Maximize terminal'}
          title={maximized ? 'Restore terminal size' : 'Maximize terminal'}
          data-ui-sound="navigation"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[12px] text-white/40 hover:bg-white/8 hover:text-white"
          onClick={() => setMaximized((value) => !value)}
        >
          {maximized ? '↙' : '↗'}
        </button>
        <button
          aria-label="Close terminal"
          title="Close terminal"
          data-ui-sound="destructive"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[11px] text-white/40 hover:bg-white/8 hover:text-white"
          onClick={onClose}
        >
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
