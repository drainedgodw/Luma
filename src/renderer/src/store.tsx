import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Commit, CommandLogEntry, GitStatus } from '@shared/types';
import { gitCall, api } from './lib/api';

interface Store {
  repo: string | null;
  status: GitStatus | null;
  commits: Commit[];
  commands: CommandLogEntry[];
  openRepo: (path?: string) => Promise<void>;
  refresh: () => Promise<void>;
  toast: string | null;
  setToast: (s: string | null) => void;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<string | null>(null);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [commands, setCommands] = useState<CommandLogEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const openRepoRef = useRef<((p: string) => Promise<void>) | null>(null);

  useEffect(() => {
    api.onCommand((e) => setCommands((c) => [e, ...c].slice(0, 60)));
    api.repoPath().then((p) => p && setRepo(p));
    const onOpen = (e: Event) => openRepoRef.current?.((e as CustomEvent<string>).detail);
    window.addEventListener('luma:open', onOpen);
    return () => window.removeEventListener('luma:open', onOpen);
  }, []);

  const refresh = useCallback(async () => {
    if (!repo) return;
    try {
      const [s, commits] = await Promise.all([gitCall<GitStatus>('status'), gitCall<Commit[]>('log')]);
      setStatus(s);
      setCommits(commits);
    } catch (e) {
      setToast((e as Error).message);
    }
  }, [repo]);

  useEffect(() => {
    if (repo) refresh();
  }, [repo, refresh]);

  const openRepo = useCallback(async (path?: string) => {
    const r = path ? await api.openRepoPath(path) : await api.openRepoDialog();
    if (r.ok && r.data) {
      setRepo(r.data);
      setCommits([]);
      setStatus(null);
    } else if (!r.ok && r.error?.message !== 'canceled') {
      setToast(r.error?.message ?? 'Failed to open');
    }
  }, []);
  openRepoRef.current = openRepo;

  return (
    <Ctx.Provider value={{ repo, status, commits, commands, openRepo, refresh, toast, setToast }}>
      {children}
    </Ctx.Provider>
  );
}
