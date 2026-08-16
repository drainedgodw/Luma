import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc';

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: true,
    backgroundColor: '#07070e',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'linux' ? false : { color: '#07070e', symbolColor: '#c4b5fd' },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('ready-to-show', () => win?.show());
  if (process.env.LUMA_REPO) {
    (win as BrowserWindow & { __repo?: string }).__repo = process.env.LUMA_REPO;
    win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('luma:open', { detail: ${JSON.stringify(process.env.LUMA_REPO)} }))`).catch(() => {});
    if (process.env.LUMA_OPEN_FILE) {
      const file = JSON.stringify(process.env.LUMA_OPEN_FILE);
      win.webContents.executeJavaScript(
        `setTimeout(() => window.dispatchEvent(new CustomEvent('luma:open-file', { detail: ${file} })), 800)`,
      ).catch(() => {});
    }
  }
  if (process.env.LUMA_SHOT) {
    setTimeout(async () => {
      const image = await win!.webContents.capturePage();
      const { writeFile } = await import('node:fs/promises');
      await writeFile(process.env.LUMA_SHOT!, image.toPNG());
      console.log(`screenshot saved: ${process.env.LUMA_SHOT}`);
      app.quit();
    }, 4000);
  }
  win.on('closed', () => (win = null));
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  // Wayland/X11: Electron 28+ picks ozone automatically when available
}

app.whenReady().then(() => {
  registerIpc(() => win);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
