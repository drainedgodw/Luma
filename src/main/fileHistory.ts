import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * Local file history: every save snapshots the file content outside git.
 * Snapshots live in userData/file-history/<path-hash>/<timestamp>.snap
 */
function dirFor(repo: string, path: string): string {
  const key = createHash('sha256').update(`${repo}::${path}`).digest('hex').slice(0, 16);
  return join(app.getPath('userData'), 'file-history', key);
}

export async function snapshot(repo: string, path: string, content: string): Promise<void> {
  const dir = dirFor(repo, path);
  await mkdir(dir, { recursive: true });
  // skip if identical to the newest snapshot
  const snaps = await listSnapshots(repo, path);
  if (snaps.length > 0) {
    const newest = await readFile(join(dir, `${snaps[0]}.snap`), 'utf8').catch(() => null);
    if (newest === content) return;
  }
  await writeFile(join(dir, `${Date.now()}.snap`), content);
  // keep the newest 50 per file
  const all = await listSnapshots(repo, path);
  for (const old of all.slice(50)) {
    await rm(join(dir, `${old}.snap`), { force: true });
  }
}

export async function listSnapshots(repo: string, path: string): Promise<number[]> {
  const dir = dirFor(repo, path);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith('.snap'))
    .map((f) => parseInt(f, 10))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => b - a);
}

export async function getSnapshot(repo: string, path: string, ts: number): Promise<string> {
  return readFile(join(dirFor(repo, path), `${ts}.snap`), 'utf8');
}
