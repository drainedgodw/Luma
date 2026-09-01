import { contextBridge, ipcRenderer } from 'electron';

const SECURE_GIT_CHANNELS = new Set(['clone', 'fetch', 'pull', 'push', 'auth', 'logout']);

const api = {
  minimize: () => ipcRenderer.send('win:min'),
  maximize: () => ipcRenderer.send('win:max'),
  closeWindow: () => ipcRenderer.send('win:close'),
  wallpaper: () => ipcRenderer.invoke('wallpaper:get'),
  openRepository: () => ipcRenderer.invoke('repo:directory:open'),
  openRepositoryPath: (path: string) => ipcRenderer.invoke('repo:directory:openPath', path),
  recentRepositories: () => ipcRenderer.invoke('repo:directory:recent'),
  gitInvoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'commit') return ipcRenderer.invoke('intel:git:commit', ...args);
    if (channel === 'rewindSoft') return ipcRenderer.invoke('intel:git:rewind', 'soft', ...args);
    if (channel === 'rewindHard') return ipcRenderer.invoke('intel:git:rewind', 'hard', ...args);
    const scope = SECURE_GIT_CHANNELS.has(channel) ? 'github:git' : 'git';
    return ipcRenderer.invoke(`${scope}:${channel}`, ...args);
  },
  intelInvoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(`intel:${channel}`, ...args),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateRun: (channel: string) => ipcRenderer.invoke('update:run', channel),
  workspaceInfo: () => ipcRenderer.invoke('workspace:info'),
  workspaceClose: () => ipcRenderer.invoke('workspace:close'),
  workspaceFiles: () => ipcRenderer.invoke('workspace:files'),
  workspaceSearch: (query: string) => ipcRenderer.invoke('workspace:search', query),
  workspaceTechnology: () => ipcRenderer.invoke('workspace:technology'),
  workspaceInitGit: () => ipcRenderer.invoke('workspace:initGit'),
  terminalCreate: (id: string, cwd: string) => ipcRenderer.send('terminal:create', { id, cwd }),
  terminalInput: (id: string, data: string) => ipcRenderer.send('terminal:write', { id, data }),
  terminalResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', { id, cols, rows }),
  terminalKill: (id: string) => ipcRenderer.send('terminal:kill', { id }),
  onTerminalData: (id: string, listener: (data: string) => void) => {
    const channel = `terminal:data:${id}`;
    const wrapped = (_event: unknown, data: string) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('luma', api);

export type LumaApi = typeof api;
