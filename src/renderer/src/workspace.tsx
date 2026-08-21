import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './lib/api';
import { useStore } from './store';
export interface EditorTab { path: string; name: string; dirty: boolean; }
interface Workspace { tabs: EditorTab[]; active: string | null; openFile: (path: string) => void; closeTab: (path: string) => void; setActive: (path: string) => void; markDirty: (path: string, dirty: boolean) => void; editorVisible: boolean; }
const Ctx = createContext<Workspace>(null as unknown as Workspace);
export const useWorkspace = () => useContext(Ctx);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { repo } = useStore(); const [tabs, setTabs] = useState<EditorTab[]>([]); const [active, setActive] = useState<string | null>(null);
  useEffect(() => { setTabs([]); setActive(null); }, [repo]);
  const openFile = useCallback((path: string) => { setTabs((previous) => previous.some((tab) => tab.path === path) ? previous : [...previous, { path, name: path.split('/').pop()!, dirty: false }]); setActive(path); }, []);
  const closeTab = useCallback((path: string) => { setTabs((previous) => { const target = previous.find((tab) => tab.path === path); if (target?.dirty && !window.confirm(`Close ${target.name} and discard unsaved changes?`)) return previous; const next = previous.filter((tab) => tab.path !== path); setActive((current) => current === path ? next[next.length - 1]?.path ?? null : current); return next; }); }, []);
  const markDirty = useCallback((path: string, dirty: boolean) => { setTabs((previous) => previous.map((tab) => tab.path === path ? { ...tab, dirty } : tab)); }, []);
  return <Ctx.Provider value={{ tabs, active, openFile, closeTab, setActive, markDirty, editorVisible: tabs.length > 0 }}>{children}</Ctx.Provider>;
}
export async function saveFile(path: string, content: string) { const result = await api.fsWrite(path, content); if (!result.ok) throw new Error(result.error?.message ?? 'Could not save file'); }
