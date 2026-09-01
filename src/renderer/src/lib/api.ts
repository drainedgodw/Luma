export interface GitResult<T> {
  ok: boolean;
  data?: T;
  error?: { message: string; stderr: string };
}
export interface WorkspaceInfo {
  path: string;
  name: string;
  isGit: boolean;
}
export interface WorkspaceMatch {
  path: string;
  row: number;
  text: string;
}
export interface RuntimeInfo {
  id: string;
  label: string;
  available: boolean;
  command: string;
  version?: string;
}
export interface TechnologyReport {
  runtimes: RuntimeInfo[];
  ecosystems: Record<string, string[]>;
  manifests: string[];
}
export interface UpdateInfo {
  current: string;
  latest: string;
  update: boolean;
}
interface LumaApi {
  openRepoDialog(): Promise<GitResult<string>>;
  openRepoPath(p: string): Promise<GitResult<string>>;
  repoPath(): Promise<string | null>;
  recentRepos(): Promise<string[]>;
  closeWorkspace(): Promise<GitResult<null>>;
  workspaceInfo(): Promise<GitResult<WorkspaceInfo>>;
  workspaceFiles(): Promise<GitResult<string[]>>;
  workspaceSearch(q: string): Promise<GitResult<WorkspaceMatch[]>>;
  workspaceTechnology(): Promise<GitResult<TechnologyReport>>;
  workspaceInitGit(): Promise<GitResult<WorkspaceInfo>>;
  gitInvoke(c: string, ...a: unknown[]): Promise<GitResult<unknown>>;
  fsRead(p: string): Promise<GitResult<string>>;
  fsWrite(p: string, c: string): Promise<GitResult<null>>;
  historyList(p: string): Promise<GitResult<number[]>>;
  historyGet(p: string, t: number): Promise<GitResult<string>>;
  fsList(p: string): Promise<GitResult<{ name: string; dir: boolean }[]>>;
  fsNewFile(p: string, n: string): Promise<GitResult<string>>;
  fsNewDir(p: string, n: string): Promise<GitResult<string>>;
  fsRename(p: string, n: string): Promise<GitResult<null>>;
  fsDelete(p: string, d: boolean): Promise<GitResult<null>>;
  fsDuplicate(p: string): Promise<GitResult<string>>;
  githubStatus(): Promise<
    GitResult<{
      connected: boolean;
      account?: { login: string; name?: string; avatarUrl?: string };
      deviceFlowAvailable: boolean;
    }>
  >;
  githubSaveToken(
    t: string
  ): Promise<GitResult<{ login: string; name?: string; avatarUrl?: string }>>;
  githubLogout(): Promise<GitResult<null>>;
  githubRepos(q?: string): Promise<
    GitResult<
      Array<{
        id: number;
        name: string;
        fullName: string;
        description?: string;
        private: boolean;
        updatedAt: string;
        defaultBranch: string;
        httpsUrl: string;
        sshUrl: string;
        owner: string;
      }>
    >
  >;
  githubClone(r: unknown, t: 'https' | 'ssh'): Promise<GitResult<string | null>>;
  githubCloneCancel(): Promise<GitResult<boolean>>;
  onCloneProgress(
    cb: (p: {
      repo: string;
      phase: string;
      percent: number;
      detail: string;
      canceled: boolean;
    }) => void
  ): void;
  intelInvoke(m: string, ...a: unknown[]): Promise<GitResult<unknown>>;
  updateCheck(): Promise<GitResult<UpdateInfo>>;
  updateRun(c: 'release' | 'nightly'): Promise<GitResult<string>>;
  onCommand(cb: (e: { id: number; command: string; at: number }) => void): void;
  winMin(): void;
  winMax(): void;
  winClose(): void;
  wallpaper(): Promise<string | null>;
  openExternal(u: string): Promise<GitResult<null>>;
  termCreate(id: string): void;
  termWrite(id: string, d: string): void;
  termResize(id: string, c: number, r: number): void;
  termKill(id: string): void;
  termOnData(id: string, cb: (d: string) => void): void;
  termOnExit(id: string, cb: () => void): void;
  termOff(id: string): void;
}
export const api: LumaApi = (window as unknown as { luma: LumaApi }).luma;
export async function gitCall<T>(c: string, ...a: unknown[]): Promise<T> {
  const result = (await api.gitInvoke(c, ...a)) as GitResult<T>;
  if (!result.ok) throw new Error(result.error?.message ?? 'git failed');
  return result.data as T;
}
export async function requireData<T>(
  request: Promise<GitResult<T>>,
  fallback = 'Operation failed'
): Promise<T> {
  const result = await request;
  if (!result.ok) throw new Error(result.error?.message ?? fallback);
  return result.data as T;
}
