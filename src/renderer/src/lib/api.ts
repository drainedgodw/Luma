export interface GitResult<T> {
  ok: boolean;
  data?: T;
  error?: { message: string; stderr: string };
}

interface LumaApi {
  openRepoDialog(): Promise<GitResult<string>>;
  openRepoPath(p: string): Promise<GitResult<string>>;
  repoPath(): Promise<string | null>;
  recentRepos(): Promise<string[]>;
  gitInvoke(channel: string, ...args: unknown[]): Promise<GitResult<unknown>>;
  fsRead(p: string): Promise<GitResult<string>>;
  fsWrite(p: string, c: string): Promise<GitResult<null>>;
  historyList(p: string): Promise<GitResult<number[]>>;
  historyGet(p: string, ts: number): Promise<GitResult<string>>;
  fsList(p: string): Promise<GitResult<{ name: string; dir: boolean }[]>>;
  fsNewFile(parent: string, name: string): Promise<GitResult<string>>;
  fsNewDir(parent: string, name: string): Promise<GitResult<string>>;
  fsRename(path: string, newName: string): Promise<GitResult<null>>;
  fsDelete(path: string, isDir: boolean): Promise<GitResult<null>>;
  fsDuplicate(path: string): Promise<GitResult<string>>;
  onCommand(cb: (e: { id: number; command: string; at: number }) => void): void;
  winMin(): void;
  winMax(): void;
  winClose(): void;
  wallpaper(): Promise<string | null>;
  openExternal(url: string): Promise<GitResult<null>>;
  termCreate(id: string): void;
  termWrite(id: string, data: string): void;
  termResize(id: string, cols: number, rows: number): void;
  termKill(id: string): void;
  termOnData(id: string, cb: (data: string) => void): void;
  termOnExit(id: string, cb: () => void): void;
}

export const api: LumaApi = (window as unknown as { luma: LumaApi }).luma;

export async function gitCall<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await api.gitInvoke(channel, ...args)) as GitResult<T>;
  if (!r.ok) throw new Error(r.error?.message ?? 'git failed');
  return r.data as T;
}
