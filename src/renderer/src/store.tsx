import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Commit, CommandLogEntry, GitStatus } from '@shared/types';
import { gitCall, api, requireData } from './lib/api';
interface Store {
  repo: string | null;
  isGitRepo: boolean;
  status: GitStatus | null;
  commits: Commit[];
  commands: CommandLogEntry[];
  openRepo: (path?: string) => Promise<void>;
  closeWorkspace: () => Promise<void>;
  initializeGit: () => Promise<void>;
  refresh: () => Promise<void>;
  toast: string | null;
  setToast: (s: string | null) => void;
}
const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<string | null>(null);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [commands, setCommands] = useState<CommandLogEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const openRepoRef = useRef<((p: string) => Promise<void>) | null>(null);
  useEffect(() => {
    api.onCommand((entry) => setCommands((current) => [entry, ...current].slice(0, 60)));
    void api.repoPath().then((path) => path && setRepo(path));
    const onOpen = (event: Event) => openRepoRef.current?.((event as CustomEvent<string>).detail);
    window.addEventListener('luma:open', onOpen);
    return () => window.removeEventListener('luma:open', onOpen);
  }, []);
  // one anonymous version check per launch; stays silent until a newer release exists
  useEffect(() => {
    void api.updateCheck().then((result) => {
      if (result.ok && result.data?.update)
        setToast(`Luma ${result.data.latest} is out — Settings → Updates`);
    });
  }, []);
  const refresh = useCallback(async () => {
    if (!repo) return;
    try {
      const info = await requireData(api.workspaceInfo(), 'Could not inspect workspace');
      setIsGitRepo(info.isGit);
      if (!info.isGit) {
        setStatus(null);
        setCommits([]);
        return;
      }
      const [nextStatus, nextCommits] = await Promise.all([
        gitCall<GitStatus>('status'),
        gitCall<Commit[]>('log'),
      ]);
      setStatus(nextStatus);
      setCommits(nextCommits);
    } catch (error) {
      setStatus(null);
      setCommits([]);
      setToast((error as Error).message);
    }
  }, [repo]);
  useEffect(() => {
    if (repo) void refresh();
  }, [repo, refresh]);
  const openRepo = useCallback(async (path?: string) => {
    const result = path ? await api.openRepoPath(path) : await api.openRepoDialog();
    if (result.ok && result.data) {
      setRepo(result.data);
      setIsGitRepo(false);
      setCommits([]);
      setStatus(null);
    } else if (!result.ok && result.error?.message !== 'canceled')
      setToast(result.error?.message ?? 'Failed to open directory');
  }, []);
  openRepoRef.current = openRepo;
  const closeWorkspace = useCallback(async () => {
    const result = await api.closeWorkspace();
    if (!result.ok) {
      setToast(result.error?.message ?? 'Could not close workspace');
      return;
    }
    setRepo(null);
    setIsGitRepo(false);
    setStatus(null);
    setCommits([]);
  }, []);
  const initializeGit = useCallback(async () => {
    try {
      await requireData(api.workspaceInitGit(), 'Could not initialize Git');
      await refresh();
      setToast('Git repository initialized');
    } catch (error) {
      setToast((error as Error).message);
    }
  }, [refresh]);
  return (
    <Ctx.Provider
      value={{
        repo,
        isGitRepo,
        status,
        commits,
        commands,
        openRepo,
        closeWorkspace,
        initializeGit,
        refresh,
        toast,
        setToast,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
