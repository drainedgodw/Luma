import { contextBridge, ipcRenderer } from 'electron';

const api = {
  openRepoDialog: () => ipcRenderer.invoke('repo:open'),
  openRepoPath: (p: string) => ipcRenderer.invoke('repo:openPath'),
  repoPath: () => ipcRenderer.invoke('repo:path'),
  recentRepos: () => ipcRenderer.invoke('repo:last'),
  git: new Proxy(
    {},
    {
      get: (_t, channel: string) =>
        (...args: unknown[]) =>
          ipcRenderer.invoke(`git:${channel}`, ...args),
    },
  ),
  fs: {
    read: (p: string) => ipcRenderer.invoke('fs:read', p),
    write: (p: string, content: string) => ipcRenderer.invoke('fs:write', p, content),
    list: (p: string) => ipcRenderer.invoke('fs:list', p),
  },
  onCommand: (cb: (entry: { id: number; command: string; at: number }) => void) => {
    ipcRenderer.on('git:command', (_e, entry) => cb(entry));
  },
};

contextBridge.exposeInMainWorld('luma', api);
export type LumaApi = typeof api;
