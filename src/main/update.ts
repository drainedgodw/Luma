import { app, ipcMain } from 'electron';
import { spawn } from 'node:child_process';

// Anonymous update check: one static file over plain HTTPS.
// No account, no token, no machine id — everyone gets the same bytes.
const VERSION_URL = 'https://raw.githubusercontent.com/drainedgodw/Luma/main/update.json';
const INSTALLER_URL = 'https://raw.githubusercontent.com/drainedgodw/Luma/main/install.sh';

function newerThan(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function latestVersion(): Promise<string> {
  const response = await fetch(VERSION_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`update check: HTTP ${response.status}`);
  const data = (await response.json()) as { version?: string };
  if (!data.version) throw new Error('update check: no version field');
  return data.version;
}

export function registerUpdateIpc(): void {
  ipcMain.handle('update:check', async () => {
    try {
      const current = app.getVersion();
      const latest = await latestVersion();
      return { ok: true, data: { current, latest, update: newerThan(latest, current) } };
    } catch (error) {
      return { ok: false, error: { message: (error as Error).message, stderr: '' } };
    }
  });
  ipcMain.handle('update:run', (_event, channel: string) => {
    if (channel !== 'release' && channel !== 'nightly')
      return { ok: false, error: { message: 'Unknown update channel', stderr: '' } };
    // the installer verifies checksums and cosign, then swaps the app atomically
    const child = spawn(
      'bash',
      ['-c', `curl -fsSL ${INSTALLER_URL} | bash -s -- --${channel}`],
      { detached: true, stdio: 'ignore' }
    );
    child.on('exit', (code) => {
      if (code === 0) {
        app.relaunch();
        app.exit(0);
      }
    });
    child.unref();
    return { ok: true, data: 'updating' };
  });
}
