import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './lib/api';
import { useStore } from './store';

export interface EditorTab {
  path: string;
  name: string;
  dirty: boolean;
}

interface Workspace {
  tabs: EditorTab[];
  active: string | null;
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  markDirty: (path: string, dirty: boolean) => void;
  /** editor tab strip is visible */
  editorVisible: boolean;
}

const Ctx = createContext<Workspace>(null as unknown as Workspace);
export const useWorkspace = () => useContext(Ctx);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { repo, refresh } = useStore();
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    setTabs([]);
    setActive(null);
  }, [repo]);

  const openFile = useCallback((path: string) => {
    setTabs((prev) => (prev.some((t) => t.path === path) ? prev : [...prev, { path, name: path.split('/').pop()!, dirty: false }]));
    setActive(path);
  }, []);

  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.path !== path);
        setActive((cur) => (cur === path ? next[next.length - 1]?.path ?? null : cur));
        return next;
      });
    },
    [],
  );

  const markDirty = useCallback((path: string, dirty: boolean) => {
    setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, dirty } : t)));
  }, []);

  return (
    <Ctx.Provider value={{ tabs, active, openFile, closeTab, setActive, markDirty, editorVisible: tabs.length > 0 }}>
      {children}
    </Ctx.Provider>
  );
}

/** Save file content to disk. Callers refresh git status afterwards. */
export async function saveFile(path: string, content: string) {
  await api.fsWrite(path, content);
}
