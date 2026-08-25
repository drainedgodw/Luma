import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

type WorkspaceWindow = BrowserWindow & { __repo?: string };
type DirectoryResult =
  { ok: true; data: string } | { ok: false; error: { message: string; stderr: string } };

const MAX_RECENT = 12;
const recentFile = () => join(app.getPath('userData'), 'recent.json');
const failed = (message: string): DirectoryResult => ({
  ok: false,
  error: { message, stderr: '' },
});

async function normaliseDirectory(directory: string): Promise<string> {
  const absolute = resolve(directory);
  return fs.realpath(absolute).catch(() => absolute);
}
async function readStored(): Promise<string[]> {
  try {
    const value = JSON.parse(await fs.readFile(recentFile(), 'utf8')) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
  } catch {
    return [];
  }
}
async function writeStored(paths: string[]): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(recentFile(), JSON.stringify(paths, null, 2), { mode: 0o600 });
}
async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}
async function recentDirectories(): Promise<string[]> {
  const stored = await readStored();
  const unique = [...new Set(stored)].slice(0, MAX_RECENT);
  const valid: string[] = [];
  for (const directory of unique) if (await isDirectory(directory)) valid.push(directory);
  if (
    valid.length !== stored.length ||
    valid.some((directory, index) => directory !== stored[index])
  )
    await writeStored(valid);
  return valid;
}
async function remember(directory: string): Promise<void> {
  const recent = await recentDirectories();
  await writeStored(
    [directory, ...recent.filter((item) => item !== directory)].slice(0, MAX_RECENT)
  );
}
async function forget(directory: string): Promise<void> {
  const stored = await readStored();
  await writeStored(stored.filter((item) => item !== directory));
}
async function openDirectory(
  getWindow: () => BrowserWindow | null,
  directory: string
): Promise<DirectoryResult> {
  const window = getWindow();
  if (!window) return failed('Luma window is not ready');
  const normalised = await normaliseDirectory(directory);
  if (!(await isDirectory(normalised))) {
    await forget(directory).catch(() => {});
    await forget(normalised).catch(() => {});
    return failed(`Directory does not exist: ${normalised}`);
  }
  (window as WorkspaceWindow).__repo = normalised;
  await remember(normalised).catch(() => {});
  return { ok: true, data: normalised };
}

export function registerRecentReposIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('repo:directory:open', async (): Promise<DirectoryResult> => {
    const window = getWindow();
    if (!window) return failed('Luma window is not ready');
    const result = await dialog.showOpenDialog(window, {
      title: 'Open project directory',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return failed('canceled');
    return openDirectory(getWindow, result.filePaths[0]);
  });
  ipcMain.handle(
    'repo:directory:openPath',
    async (_event, directory: string): Promise<DirectoryResult> => {
      if (typeof directory !== 'string' || !directory.trim()) return failed('Invalid directory');
      return openDirectory(getWindow, directory);
    }
  );
  ipcMain.handle('repo:directory:recent', () => recentDirectories());
}
