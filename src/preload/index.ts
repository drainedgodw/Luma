import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('luma', {
  openRepoDialog: () => ipcRenderer.invoke('repo:open'),
  openRepoPath: (p: string) => ipcRenderer.invoke('repo:openPath', p),
  repoPath: () => ipcRenderer.invoke('repo:path'),
  recentRepos: () => ipcRenderer.invoke('repo:last'),
  gitInvoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(`git:${channel}`, ...args),
  fsRead: (p: string) => ipcRenderer.invoke('fs:read', p),
  fsWrite: (p: string, content: string) => ipcRenderer.invoke('fs:write', p, content),
  fsList: (p: string) => ipcRenderer.invoke('fs:list', p),
  onCommand: (cb: (entry: { id: number; command: string; at: number }) => void) => {
    ipcRenderer.on('git:command', (_e, entry) => cb(entry));
  },
  winMin: () => ipcRenderer.send('win:min'),
  winMax: () => ipcRenderer.send('win:max'),
  winClose: () => ipcRenderer.send('win:close'),
  wallpaper: () => ipcRenderer.invoke('wallpaper:get'),
});

export type LumaApi = {
  openRepoDialog(): Promise<unknown>;
  openRepoPath(p: string): Promise<unknown>;
  repoPath(): Promise<string | null>;
  recentRepos(): Promise<string[]>;
  gitInvoke(channel: string, ...args: unknown[]): Promise<unknown>;
  fsRead(p: string): Promise<unknown>;
  fsWrite(p: string, c: string): Promise<unknown>;
  fsList(p: string): Promise<unknown>;
  onCommand(cb: (e: { id: number; command: string; at: number }) => void): void;
};
