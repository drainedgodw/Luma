import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import { promises as fs, readFileSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import * as engine from './git/engine';
import { invalidateStatusCache, runGit } from './git/exec';
import { parseDiffNameStatus, parseGitStatus, parseNumstat } from './git/parse';
import { isPathSafe, validateMessage } from './pathGuard';
import { scanStagedContent } from './secretGuard';
import { startTerminal, writeTerminal, resizeTerminal, killTerminal } from './terminal';
import { listFileHistory, readFileVersion } from './fileHistory';
import { appendTemplate, listTemplates } from './recentRepos';

type GetWindow = () => BrowserWindow | null;
type Result<T> = { ok: true; data: T } | { ok: false; error: { message: string; stderr: string } };

const pendingTemplates = new WeakMap<BrowserWindow, string>();

type RepoWindow = BrowserWindow & { __repo?: string };
function currentRepo(getWindow: GetWindow): string {
  const repo = (getWindow() as RepoWindow | null)?.__repo;
  if (!repo) throw new Error('No repository open');
  return repo;
}

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    const err = error as Error & { stderr?: string };
    return { ok: false, error: { message: err.message, stderr: err.stderr ?? '' } };
  }
}

function throwOnHook(output: string) {
  if (/(^|\n).{0,80}hook/i.test(output)) {
    throw new Error(
      'A Git hook modified or blocked this operation. Luma does not run hooks; review the hook output in the Commands log.'
    );
  }
}

export function registerIpc(getWindow: GetWindow): void {
  const on = (channel: string, handler: (...a: any[]) => Promise<unknown> | unknown) => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await handler(...args);
      } catch (error) {
        const err = error as Error & { stderr?: string };
        return { ok: false, error: { message: err.message, stderr: err.stderr ?? '' } };
      }
    });
  };

  on('repo:open', async () => {
    const win = getWindow();
    if (!win) throw new Error('no window');
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: { message: 'canceled', stderr: '' } };
    (win as RepoWindow).__repo = result.filePaths[0];
    return { ok: true, data: { path: result.filePaths[0] } };
  });

  on('repo:openPath', async (path: string) => {
    const win = getWindow() as RepoWindow | null;
    if (!win) throw new Error('no window');
    const abs = resolve(String(path));
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat?.isDirectory()) throw new Error('Not a directory: ' + abs);
    win.__repo = abs;
    return { ok: true, data: { path: abs } };
  });

  on('repo:last', async () => {
    const file = join(app.getPath('userData'), 'session.json');
    try {
      const cached = readFileSync(file, 'utf8');
      return JSON.parse(cached);
    } catch {
      return null;
    }
  });

  on('git:log', async (limit = 400) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      if (!(await engine.isRepo(repo))) return [];
      return engine.log(repo, Number(limit) || 400);
    })
  );

  on('git:status', () => wrap(() => engine.status(currentRepo(getWindow))));

  on('git:commitDiff', (hash: string) =>
    wrap(() => engine.commitDiff(currentRepo(getWindow), String(hash)))
  );

  on('git:worktreeDiff', () => wrap(() => engine.worktreeDiff(currentRepo(getWindow))));

  on('git:stage', (paths: string[]) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      for (const p of paths) if (!isPathSafe(String(p))) throw new Error('unsafe path: ' + p);
      await runGit(repo, ['add', '--', ...paths.map(String)]);
      invalidateStatusCache(repo);
      return engine.status(repo);
    })
  );

  on('git:unstage', (paths: string[]) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      for (const p of paths) if (!isPathSafe(String(p))) throw new Error('unsafe path: ' + p);
      await runGit(repo, ['restore', '--staged', '--', ...paths.map(String)]);
      invalidateStatusCache(repo);
      return engine.status(repo);
    })
  );

  on('git:commit', (message: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      validateMessage(String(message));
      const status = await engine.status(repo);
      const staged = status.entries.filter((e) => e.staged);
      if (!staged.length) throw new Error('Nothing staged to commit.');
      const diff = await runGit(repo, ['diff', '--cached', '-U0']);
      const findings = scanStagedContent(diff.split('\n'), []);
      if (findings.length) {
        const names = [...new Set(findings.map((f) => f.kind))].join(', ');
        throw new Error(`Secret Guard blocked the commit: possible ${names}. Unstage or edit the flagged lines, or use --no-verify intentionally from the CLI.`);
      }
      const out = await runGit(repo, ['commit', '-m', String(message)]);
      throwOnHook(out.stderr + out.stdout);
      invalidateStatusCache(repo);
      return engine.status(repo);
    })
  );

  on('git:checkout', (ref: string, createBranch?: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const args = createBranch ? ['checkout', '-b', String(createBranch), String(ref)] : ['checkout', String(ref)];
      const out = await runGit(repo, args);
      throwOnHook(out.stderr + out.stdout);
      invalidateStatusCache(repo);
      return engine.status(repo);
    })
  );

  on('git:merge', (branch: string, noFf: boolean, ffOnly: boolean) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const args = ['merge'];
      if (noFf) args.push('--no-ff');
      if (ffOnly) args.push('--ff-only');
      args.push(String(branch));
      const out = await runGit(repo, args, { allowExitCodes: [0, 1] });
      throwOnHook(out.stderr + out.stdout);
      invalidateStatusCache(repo);
      return { status: await engine.status(repo), stderr: out.stderr };
    })
  );

  on('git:rebase', (onto: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const out = await runGit(repo, ['rebase', String(onto)], { allowExitCodes: [0, 1] });
      throwOnHook(out.stderr + out.stdout);
      invalidateStatusCache(repo);
      return { status: await engine.status(repo), stderr: out.stderr };
    })
  );

  on('git:rebaseContinue', () =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const out = await runGit(repo, ['-c', 'core.editor=true', 'rebase', '--continue'], {
        allowExitCodes: [0, 1],
      });
      invalidateStatusCache(repo);
      return { status: await engine.status(repo), stderr: out.stderr };
    })
  );

  on('git:rebaseAbort', () =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      await runGit(repo, ['rebase', '--abort']);
      invalidateStatusCache(repo);
      return engine.status(repo);
    })
  );

  on('git:rebaseInteractive', (base: string, ops: { hash: string; action: string; message?: string }[]) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      return engine.interactiveRebase(repo, String(base), ops);
    })
  );

  on('git:cherryPick', (hash: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const out = await runGit(repo, ['cherry-pick', String(hash)], { allowExitCodes: [0, 1] });
      invalidateStatusCache(repo);
      return { status: await engine.status(repo), stderr: out.stderr };
    })
  );

  on('git:revert', (hash: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const out = await runGit(repo, ['revert', '--no-edit', String(hash)], { allowExitCodes: [0, 1] });
      invalidateStatusCache(repo);
      return { status: await engine.status(repo), stderr: out.stderr };
    })
  );

  on('git:tag', (name: string, ref: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      await runGit(repo, ['tag', String(name), String(ref)]);
      return engine.status(repo);
    })
  );

  on('git:rewindSoft', (ref: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      await engine.createCheckpointBranch(repo, 'soft-rewind');
      await runGit(repo, ['reset', '--soft', String(ref)]);
      invalidateStatusCache(repo);
      return engine.status(repo);
    })
  );

  on('git:rewindHard', (ref: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const status = await engine.status(repo);
      const dirty = status.entries.length > 0;
      if (dirty) {
        await runGit(repo, ['stash', 'push', '-u', '-m', 'luma-safety-stash']);
      }
      await engine.createCheckpointBranch(repo, 'hard-rewind');
      await runGit(repo, ['reset', '--hard', String(ref)]);
      invalidateStatusCache(repo);
      return { status: await engine.status(repo), stashed: dirty };
    })
  );

  on('git:bisectStart', (good: string, bad: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      await runGit(repo, ['bisect', 'start']);
      await runGit(repo, ['bisect', 'bad', String(bad)]);
      const out = await runGit(repo, ['bisect', 'good', String(good)]);
      invalidateStatusCache(repo);
      return { status: await engine.status(repo), stderr: out.stderr };
    })
  );

  on('git:bisectMark', (good: boolean) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const out = await runGit(repo, ['bisect', good ? 'good' : 'bad'], { allowExitCodes: [0, 1] });
      invalidateStatusCache(repo);
      return { status: await engine.status(repo), stderr: out.stderr };
    })
  );

  on('git:bisectReset', () =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      await runGit(repo, ['bisect', 'reset']);
      invalidateStatusCache(repo);
      return engine.status(repo);
    })
  );

  on('git:reflog', () => wrap(() => engine.reflog(currentRepo(getWindow))));

  on('git:stashList', () => wrap(() => engine.stashList(currentRepo(getWindow))));

  on('git:stashPush', (message: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const args = ['stash', 'push', '-u'];
      if (message) args.push('-m', String(message));
      await runGit(repo, args);
      invalidateStatusCache(repo);
      return engine.status(repo);
    })
  );

  on('git:stashPop', (index: number) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const out = await runGit(repo, ['stash', 'pop', `stash@{${Number(index) || 0}}`], {
        allowExitCodes: [0, 1],
      });
      invalidateStatusCache(repo);
      return { status: await engine.status(repo), stderr: out.stderr };
    })
  );

  on('git:conflicts', () =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const statusOut = await runGit(repo, ['status', '--porcelain=v1', '-z']);
      const parsed = parseGitStatus(statusOut.stdout);
      const conflicted = parsed.entries.filter((e) => e.conflicted);
      const files = [];
      for (const entry of conflicted) {
        files.push(await engine.conflictFile(repo, entry.path));
      }
      return files;
    })
  );

  on('git:resolveConflict', (path: string, content: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      if (!isPathSafe(String(path))) throw new Error('unsafe path');
      const absolute = join(repo, String(path));
      const relativeCheck = normalize(absolute).startsWith(normalize(repo));
      if (!relativeCheck) throw new Error('path escapes repository');
      await fs.writeFile(absolute, String(content), 'utf8');
      await runGit(repo, ['add', '--', String(path)]);
      invalidateStatusCache(repo);
      return engine.status(repo);
    })
  );

  on('fs:readFile', async (path: string) => {
    const repo = currentRepo(getWindow);
    const absolute = join(repo, String(path));
    if (!normalize(absolute).startsWith(normalize(repo))) throw new Error('path escapes repository');
    return fs.readFile(absolute, 'utf8');
  });

  on('fs:writeFile', async (path: string, content: string) => {
    const repo = currentRepo(getWindow);
    if (!isPathSafe(String(path))) throw new Error('unsafe path');
    const absolute = join(repo, String(path));
    if (!normalize(absolute).startsWith(normalize(repo))) throw new Error('path escapes repository');
    await fs.writeFile(absolute, String(content), 'utf8');
    invalidateStatusCache(repo);
    return true;
  });

  on('fs:list', async (dir: string) => {
    const repo = currentRepo(getWindow);
    const absolute = join(repo, String(dir));
    if (!normalize(absolute).startsWith(normalize(repo))) throw new Error('path escapes repository');
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, dir: e.isDirectory() }));
  });

  on('file:history', (path: string) =>
    wrap(() => listFileHistory(currentRepo(getWindow), String(path)))
  );

  on('file:version', (path: string, commitHash: string) =>
    wrap(() => readFileVersion(currentRepo(getWindow), String(path), String(commitHash)))
  );

  on('templates:list', () => wrap(() => listTemplates(currentRepo(getWindow))));

  on('templates:remember', (message: string) =>
    wrap(() => appendTemplate(currentRepo(getWindow), String(message)))
  );

  on('git:trustQuery', async () => {
    const repo = (getWindow() as RepoWindow | null)?.__repo;
    if (!repo) return false;
    const file = join(app.getPath('userData'), 'trusted.json');
    try {
      const list = JSON.parse(await fs.readFile(file, 'utf8')) as string[];
      return list.includes(repo);
    } catch {
      return false;
    }
  });

  on('git:trustGrant', async () => {
    const repo = currentRepo(getWindow);
    const file = join(app.getPath('userData'), 'trusted.json');
    let list: string[] = [];
    try {
      list = JSON.parse(await fs.readFile(file, 'utf8')) as string[];
    } catch {}
    if (!list.includes(repo)) list.push(repo);
    await fs.writeFile(file, JSON.stringify(list), 'utf8');
    return true;
  });

  on('terminal:create', (id: string, cwd: string) => {
    const win = getWindow();
    if (!win) throw new Error('no window');
    startTerminal(String(id), String(cwd), win.webContents);
  });
  ipcMain.on('terminal:write', (_e, { id, data }: { id: string; data: string }) =>
    writeTerminal(String(id), String(data))
  );
  ipcMain.on('terminal:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) =>
    resizeTerminal(String(id), Number(cols), Number(rows))
  );
  ipcMain.on('terminal:kill', (_e, { id }: { id: string }) => killTerminal(String(id)));

  on('templates:pending', (message: string) => {
    const win = getWindow();
    if (win) pendingTemplates.set(win, String(message));
    return true;
  });

  on('templates:takePending', () => {
    const win = getWindow();
    if (!win) return null;
    const value = pendingTemplates.get(win) ?? null;
    pendingTemplates.delete(win);
    return value;
  });

  on('git:numstat', (ref: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const out = await runGit(repo, ['diff', '--numstat', `${String(ref)}..HEAD`]);
      return parseNumstat(out.stdout);
    })
  );

  on('git:nameStatus', (ref: string) =>
    wrap(async () => {
      const repo = currentRepo(getWindow);
      const out = await runGit(repo, ['diff', '--name-status', `${String(ref)}..HEAD`]);
      return parseDiffNameStatus(out.stdout);
    })
  );
}
