import { ipcMain, type BrowserWindow } from 'electron';
import { spawn as ptySpawn } from 'node-pty';

const sessions = new Map<string, { pty: ReturnType<typeof ptySpawn>; repo: string }>();

export function registerTerminal(getWindow: () => BrowserWindow | null, getRepo: () => string | null) {
  ipcMain.on('term:create', (_e, id: string) => {
    const repo = getRepo() ?? process.env.HOME ?? '.';
    const pty = ptySpawn(process.env.SHELL || 'bash', ['--login'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: repo,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
    });
    sessions.set(id, { pty, repo });
    pty.onData((data) => getWindow()?.webContents.send(`term:data:${id}`, data));
    pty.onExit(({ exitCode }) => {
      sessions.delete(id);
      getWindow()?.webContents.send(`term:exit:${id}`, exitCode);
    });
  });

  ipcMain.on('term:write', (_e, id: string, data: string) => {
    sessions.get(id)?.pty.write(data);
  });

  ipcMain.on('term:resize', (_e, id: string, cols: number, rows: number) => {
    try {
      sessions.get(id)?.pty.resize(cols, rows);
    } catch {
      /* session gone */
    }
  });

  ipcMain.on('term:kill', (_e, id: string) => {
    sessions.get(id)?.pty.kill();
    sessions.delete(id);
  });
}
