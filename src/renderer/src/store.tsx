import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Commit, GitStatus, CommandLogEntry } from '@shared/types';
import { api, gitCall, emitCommandLog } from './lib/api';

type RepoInfo = { path: string; name: string; isGit: boolean };

type Toast = { id: number; text: string } | null;

interface StoreState {
  repo: RepoInfo | null;
  commits: Commit[];
  status: GitStatus | null;
  trusted: boolean;
  commandLog: CommandLogEntry[];
  toast: Toast;
  openRepo(path?: string): Promise<void>;
  closeRepo(): Promise<void>;
  refresh(): Promise<void>;
  setToast(text: string): void;
  setTrusted(value: boolean): void;
}

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [trusted, setTrusted] = useState(false);
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([]);
  const [toast, setToastState] = useState<Toast>(null);
  const logId = useRef(0);

  const setToast = useCallback((text: string) => {
    setToastState({ id: Date.now(), text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToastState(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = useCallback(async () => {
    if (!repo) return;
    try {
      const [log, st] = await Promise.all([
        gitCall<Commit[]>('log', 400),
        gitCall<GitStatus>('status'),
      ]);
      setCommits(log);
      setStatus(st);
      const t = await gitCall<boolean>('trustQuery');
      setTrusted(t);
    } catch {
      setCommits([]);
      setStatus(null);
    }
  }, [repo]);

  const openRepo = useCallback(
    async (path?: string) => {
      try {
        const info = path
          ? await api.openRepositoryPath(path)
          : await api.openRepository();
        const typed = info as { path?: string; canceled?: boolean } | null;
        if (!typed || typed.canceled || !typed.path) return;
        const workspace = await api.workspaceInfo();
        if (workspace.ok && workspace.data) setRepo(workspace.data);
        else setRepo({ path: typed.path, name: typed.path.split('/').pop() ?? typed.path, isGit: true });
      } catch (e) {
        setToast((e as Error).message);
      }
    },
    [setToast]
  );

  const closeRepo = useCallback(async () => {
    await api.workspaceClose().catch(() => undefined);
    setRepo(null);
    setCommits([]);
    setStatus(null);
  }, []);

  useEffect(() => {
    if (repo) void refresh();
  }, [repo, refresh]);

  // app-level events pushed from main (e.g. open-path via CLI)
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) void openRepo(detail);
    };
    window.addEventListener('luma:open', onOpen);
    return () => window.removeEventListener('luma:open', onOpen);
  }, [openRepo]);

  useEffect(() => {
    const onLog = (event: Event) => {
      const entry = (event as CustomEvent<{ command: string }>).detail;
      if (!entry?.command) return;
      logId.current += 1;
      emitCommandLog({ id: logId.current, command: entry.command, at: Date.now() });
      setCommandLog((prev) =>
        [...prev, { id: logId.current, command: entry.command, at: Date.now() }].slice(-200)
      );
    };
    window.addEventListener('luma:command', onLog as EventListener);
    return () => window.removeEventListener('luma:command', onLog as EventListener);
  }, []);

  // one anonymous version check per launch; offers nothing until a newer release exists
  useEffect(() => {
    void api.updateCheck().then((result) => {
      if (result.ok && result.data?.update)
        setToast(`Luma ${result.data.latest} is out — Settings → Updates`);
    });
  }, [setToast]);

  const value: StoreState = {
    repo,
    commits,
    status,
    trusted,
    commandLog,
    toast,
    openRepo,
    closeRepo,
    refresh,
    setToast,
    setTrusted,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}

export function useToast(): [Toast, (text: string) => void] {
  const { toast, setToast } = useStore();
  return [toast, setToast];
}

export { React };
