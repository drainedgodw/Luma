import type { CommandLogEntry } from '@shared/types';

type GitResult<T> = { ok: true; data?: T } | { ok: false; error?: { message: string } };

interface LumaApi {
  minimize(): void;
  maximize(): void;
  closeWindow(): void;
  wallpaper(): Promise<string | null>;
  openRepository(): Promise<string | null>;
  openRepositoryPath(path: string): Promise<unknown>;
  recentRepositories(): Promise<string[]>;
  gitInvoke(channel: string, ...args: unknown[]): Promise<GitResult<unknown>>;
  intelInvoke(channel: string, ...args: unknown[]): Promise<GitResult<unknown>>;
  updateCheck(): Promise<GitResult<{ current: string; latest: string; update: boolean }>>;
  updateRun(channel: 'release' | 'nightly'): Promise<GitResult<string>>;
  workspaceInfo(): Promise<GitResult<{ path: string; name: string; isGit: boolean }>>;
  workspaceClose(): Promise<GitResult<null>>;
  workspaceFiles(): Promise<GitResult<string[]>>;
  workspaceSearch(
    query: string
  ): Promise<GitResult<Array<{ path: string; row: number; text: string }>>>;
  workspaceTechnology(): Promise<GitResult<unknown>>;
  workspaceInitGit(): Promise<GitResult<{ path: string; name: string; isGit: boolean }>>;
  terminalCreate(id: string, cwd: string): void;
  terminalInput(id: string, data: string): void;
  terminalResize(id: string, cols: number, rows: number): void;
  terminalKill(id: string): void;
  onTerminalData(id: string, listener: (data: string) => void): () => void;
}

function getApi(): LumaApi {
  const w = window as unknown as { luma?: LumaApi };
  if (!w.luma) throw new Error('Luma preload bridge is unavailable');
  return w.luma;
}

export const api = new Proxy({} as LumaApi, {
  get(_t, prop: string) {
    const impl = getApi();
    const value = impl[prop as keyof LumaApi];
    if (typeof value !== 'function') throw new Error(`Unknown API method: ${prop}`);
    return (value as (...a: unknown[]) => unknown).bind(impl);
  },
}) as LumaApi;

/** Invoke a git/IPC channel and unwrap { ok, data/error } */
export async function gitCall<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const r = await getApi().gitInvoke(channel, ...args);
  if (!r.ok) throw new Error(r.error?.message ?? 'IPC error');
  return r.data as T;
}

export async function intelCall<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const r = await getApi().intelInvoke(channel, ...args);
  if (!r.ok) throw new Error(r.error?.message ?? 'IPC error');
  return r.data as T;
}

let commandLogListener: ((entry: CommandLogEntry) => void) | null = null;

export function onCommandLog(listener: (entry: CommandLogEntry) => void) {
  commandLogListener = listener;
  return () => {
    if (commandLogListener === listener) commandLogListener = null;
  };
}

/** called from store when a command log entry arrives */
export function emitCommandLog(entry: CommandLogEntry) {
  commandLogListener?.(entry);
}
