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
  git: Record<string, (...args: unknown[]) => Promise<GitResult<unknown>>>;
  fs: {
    read(p: string): Promise<GitResult<string>>;
    write(p: string, c: string): Promise<GitResult<null>>;
    list(p: string): Promise<GitResult<{ name: string; dir: boolean }[]>>;
  };
  onCommand(cb: (e: { id: number; command: string; at: number }) => void): void;
}

export const api: LumaApi = (window as unknown as { luma: LumaApi }).luma;

export async function gitCall<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await api.git[channel](...args)) as GitResult<T>;
  if (!r.ok) throw new Error(r.error?.message ?? 'git failed');
  return r.data as T;
}
