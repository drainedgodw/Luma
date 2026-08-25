import { ipcMain, type BrowserWindow } from 'electron';
import { spawn as ptySpawn } from 'node-pty';
import { trustStatus } from './intelligence';
const sessions = new Map<string, { pty: ReturnType<typeof ptySpawn>; workspace: string }>();
export function registerTerminal(
  getWindow: () => BrowserWindow | null,
  getWorkspace: () => string | null
) {
  ipcMain.on('term:create', (_event, id: string) => {
    void (async () => {
      const workspace = getWorkspace();
      if (!workspace || !(await trustStatus(workspace))) {
        getWindow()?.webContents.send(
          `term:data:${id}`,
          '\r\n\x1b[33m[Luma] Terminal is disabled until this workspace is trusted. Open Workspace Tools → Trust workspace.\x1b[0m\r\n'
        );
        getWindow()?.webContents.send(`term:exit:${id}`, 126);
        return;
      }
      const pty = ptySpawn(process.env.SHELL || 'bash', ['--login'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workspace,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<
          string,
          string
        >,
      });
      sessions.set(id, { pty, workspace });
      pty.onData((data) => getWindow()?.webContents.send(`term:data:${id}`, data));
      pty.onExit(({ exitCode }) => {
        sessions.delete(id);
        getWindow()?.webContents.send(`term:exit:${id}`, exitCode);
      });
    })();
  });
  ipcMain.on('term:write', (_event, id: string, data: string) => sessions.get(id)?.pty.write(data));
  ipcMain.on('term:resize', (_event, id: string, cols: number, rows: number) => {
    try {
      sessions.get(id)?.pty.resize(cols, rows);
    } catch {}
  });
  ipcMain.on('term:kill', (_event, id: string) => {
    sessions.get(id)?.pty.kill();
    sessions.delete(id);
  });
}
