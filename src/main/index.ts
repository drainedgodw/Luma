import { BrowserWindow, app, ipcMain } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc';
import { registerGitHubIpc } from './githubIpc';
import { registerIntelligenceIpc } from './intelligenceIpc';
import { getWallpaper } from './wallpaper';

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win?.show());
  win.on('closed', () => (win = null));
  ipcMain.on('win:min', () => win?.minimize());
  ipcMain.on('win:max', () => {
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on('win:close', () => win?.close());
  ipcMain.handle('wallpaper:get', () => getWallpaper());

  if (process.env.LUMA_REPO) {
    (win as BrowserWindow & { __repo?: string }).__repo = process.env.LUMA_REPO;
    win.webContents
      .executeJavaScript(`window.dispatchEvent(new CustomEvent('luma:open', { detail: ${JSON.stringify(process.env.LUMA_REPO)} }))`)
      .catch(() => {});
    if (process.env.LUMA_OPEN_FILE) {
      const file = JSON.stringify(process.env.LUMA_OPEN_FILE);
      win.webContents
        .executeJavaScript(`setTimeout(() => window.dispatchEvent(new CustomEvent('luma:open-file', { detail: ${file} })), 800)`)
        .catch(() => {});
    }
  }

  if (process.env.LUMA_THEME) {
    const theme = process.env.LUMA_THEME;
    win.webContents.on('did-finish-load', () => {
      win?.webContents
        .executeJavaScript(`window.dispatchEvent(new CustomEvent('luma:theme', { detail: ${JSON.stringify(theme)} }))`)
        .catch(() => {});
    });
  }

  if (process.env.LUMA_SHOT) {
    setTimeout(async () => {
      const image = await win!.webContents.capturePage();
      const { writeFile } = await import('node:fs/promises');
      await writeFile(process.env.LUMA_SHOT!, image.toPNG());
      app.quit();
    }, 4000);
  }

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  registerIpc(() => win);
  registerGitHubIpc(() => win);
  registerIntelligenceIpc(() => win);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
