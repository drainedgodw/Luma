import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('luma', {
  openRepoDialog: () => ipcRenderer.invoke('repo:open'),
  openRepoPath: (p: string) => ipcRenderer.invoke('repo:openPath', p),
  repoPath: () => ipcRenderer.invoke('repo:path'),
  recentRepos: () => ipcRenderer.invoke('repo:last'),
  gitInvoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(`git:${channel}`, ...args),
  fsRead: (p: string) => ipcRenderer.invoke('fs:read', p),
  fsWrite: (p: string, content: string) => ipcRenderer.invoke('fs:write', p, content),
  historyList: (p: string) => ipcRenderer.invoke('history:list', p),
  historyGet: (p: string, ts: number) => ipcRenderer.invoke('history:get', p, ts),
  fsList: (p: string) => ipcRenderer.invoke('fs:list', p),
  fsNewFile: (parent: string, name: string) => ipcRenderer.invoke('fs:newFile', parent, name),
  fsNewDir: (parent: string, name: string) => ipcRenderer.invoke('fs:newDir', parent, name),
  fsRename: (path: string, newName: string) => ipcRenderer.invoke('fs:rename', path, newName),
  fsDelete: (path: string, isDir: boolean) => ipcRenderer.invoke('fs:delete', path, isDir),
  fsDuplicate: (path: string) => ipcRenderer.invoke('fs:duplicate', path),
  onCommand: (cb: (entry: { id: number; command: string; at: number }) => void) => {
    ipcRenderer.on('git:command', (_e, entry) => cb(entry));
  },
  winMin: () => ipcRenderer.send('win:min'),
  winMax: () => ipcRenderer.send('win:max'),
  winClose: () => ipcRenderer.send('win:close'),
  wallpaper: () => ipcRenderer.invoke('wallpaper:get'),
  termCreate: (id: string) => ipcRenderer.send('term:create', id),
  termWrite: (id: string, data: string) => ipcRenderer.send('term:write', id, data),
  termResize: (id: string, cols: number, rows: number) => ipcRenderer.send('term:resize', id, cols, rows),
  termKill: (id: string) => ipcRenderer.send('term:kill', id),
  termOnData: (id: string, cb: (data: string) => void) => {
    ipcRenderer.on(`term:data:${id}`, (_e, data) => cb(data));
  },
  termOnExit: (id: string, cb: () => void) => {
    ipcRenderer.on(`term:exit:${id}`, () => cb());
  },
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
