import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import * as engine from './git/engine';

export function registerIpc(getWindow: () => BrowserWindow | null) {
  const repo = (): string | null => {
    const w = getWindow();
    return w ? (w as BrowserWindow & { __repo?: string }).__repo ?? null : null;
  };
  const needRepo = (): string => {
    const r = repo();
    if (!r) throw new Error('No repository open');
    return r;
  };
  const emit = (channel: string, payload: unknown) => getWindow()?.webContents.send(channel, payload);

  // command audit log: every visual action surfaces its CLI equivalent
  let cmdId = 0;
  const log = (command: string) => emit('git:command', { id: ++cmdId, command, at: Date.now() });
  const wrap = async (command: string, fn: () => Promise<unknown>) => {
    log(command);
    try {
      return { ok: true, data: await fn() };
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      return { ok: false, error: { message: e.message ?? String(err), stderr: e.stderr ?? '' } };
    }
  };

  ipcMain.handle('repo:open', async () => {
    const r = await dialog.showOpenDialog(getWindow()!, { properties: ['openDirectory'] });
    if (r.canceled || r.filePaths.length === 0) return { ok: false, error: { message: 'canceled', stderr: '' } };
    const dir = r.filePaths[0];
    if (!(await engine.isRepo(dir))) return { ok: false, error: { message: `Not a git repository: ${dir}`, stderr: '' } };
    (getWindow() as BrowserWindow & { __repo?: string }).__repo = dir;
    return { ok: true, data: dir };
  });

  ipcMain.handle('repo:path', () => repo());
  ipcMain.handle('repo:last', () => {
    try {
      return JSON.parse(
        require('node:fs').readFileSync(join(app.getPath('userData'), 'recent.json'), 'utf8'),
      );
    } catch {
      return [];
    }
  });
  ipcMain.handle('repo:openPath', async (_e, dir: string) => {
    if (!(await engine.isRepo(dir))) return { ok: false, error: { message: 'Not a git repository', stderr: '' } };
    (getWindow() as BrowserWindow & { __repo?: string }).__repo = dir;
    const recent = JSON.parse(
      await fs.readFile(join(app.getPath('userData'), 'recent.json'), 'utf8').catch(() => '[]'),
    );
    const next = [dir, ...recent.filter((d: string) => d !== dir)].slice(0, 10);
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(join(app.getPath('userData'), 'recent.json'), JSON.stringify(next));
    return { ok: true, data: dir };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const on = (channel: string, commandFn: (...a: any[]) => string, fn: (...a: any[]) => Promise<unknown>) =>
    ipcMain.handle(channel, (_e, ...args) => wrap(commandFn(...args), () => fn(...args)));

  on('git:log', () => `git log --all --oneline`, () => engine.getLog(needRepo()));
  on('git:refs', () => `git for-each-ref`, () => engine.getRefs(needRepo()));
  on('git:status', () => `git status`, () => engine.getStatus(needRepo()));
  on('git:diff', (staged: boolean, path?: string) => `git diff${staged ? ' --cached' : ''}${path ? ' -- ' + path : ''}`, (staged, path) => engine.getDiff(needRepo(), staged, path));
  on('git:commitDiff', (h: string) => `git show ${h}`, (h) => engine.getCommitDiff(needRepo(), h));
  on('git:stage', (p: string[]) => `git add ${p.join(' ')}`, (p) => engine.stage(needRepo(), p));
  on('git:stageAll', () => `git add -A`, () => engine.stageAll(needRepo()));
  on('git:unstage', (p: string[]) => `git restore --staged ${p.join(' ')}`, (p) => engine.unstage(needRepo(), p));
  on('git:discard', (p: string[]) => `git checkout -- ${p.join(' ')}`, (p) => engine.discard(needRepo(), p));
  on('git:commit', (m: string) => `git commit -m "..."`, (m) => engine.commit(needRepo(), m));
  on('git:amend', (m?: string) => `git commit --amend`, (m) => engine.amend(needRepo(), m));
  on('git:branch', (n: string, f?: string) => `git branch ${n}${f ? ' ' + f : ''}`, (n, f) => engine.createBranch(needRepo(), n, f));
  on('git:checkout', (r: string, c?: string) => `git checkout${c ? ' -b ' + c : ''} ${r}`, (r, c) => engine.checkout(needRepo(), r, c));
  on('git:deleteBranch', (n: string, f: boolean) => `git branch -d ${n}`, (n, f) => engine.deleteBranch(needRepo(), n, f));
  on('git:merge', (r: string, noFf: boolean) => `git merge ${r}`, (r, noFf) => engine.merge(needRepo(), r, noFf));
  on('git:mergeAbort', () => `git merge --abort`, () => engine.abortMerge(needRepo()));
  on('git:rebase', (o: string) => `git rebase ${o}`, (o) => engine.rebase(needRepo(), o));
  on('git:rebaseContinue', () => `git rebase --continue`, () => engine.continueRebase(needRepo()));
  on('git:rebaseAbort', () => `git rebase --abort`, () => engine.abortRebase(needRepo()));
  on('git:fetch', (r: string) => `git fetch --prune ${r}`, (r) => engine.fetchRemotes(needRepo(), r));
  on('git:push', (u: boolean) => `git push`, (u) => engine.push(needRepo(), u));
  on('git:pull', () => `git pull --rebase`, () => engine.pull(needRepo()));
  on('git:bisectStart', (b: string, g?: string) => `git bisect start ${b} ${g ?? ''}`.trim(), (b, g) => engine.bisectStart(needRepo(), b, g));
  on('git:bisectMark', (good: boolean) => `git bisect ${good ? 'good' : 'bad'}`, (good) => engine.bisectMark(needRepo(), good));
  on('git:bisectReset', () => `git bisect reset`, () => engine.bisectReset(needRepo()));
  on('git:bisectState', () => `git bisect log`, () => engine.bisectState(needRepo()));
  on('git:conflictFile', (p: string) => `git show :2:${p} / :3:${p}`, (p) => engine.getConflictFile(needRepo(), p));
  on('git:resolveConflict', (p: string, c: string, t: string) => `write ${p}; git add ${p}`, (p, c, t) => engine.resolveConflict(needRepo(), p, c, t as 'ours' | 'theirs' | 'both' | 'custom'));
  on('git:remotes', () => `git remote`, () => engine.getRemotes(needRepo()));
  on('git:stashPush', (m?: string) => `git stash push`, (m) => engine.stashPush(needRepo(), m));
  on('git:stashPop', () => `git stash pop`, () => engine.stashPop(needRepo()));
  on('git:stashList', () => `git stash list`, () => engine.stashList(needRepo()));

  ipcMain.handle('fs:read', async (_e, p: string) => {
    try {
      return { ok: true, data: await fs.readFile(join(needRepo(), p), 'utf8') };
    } catch (err) {
      return { ok: false, error: { message: String(err), stderr: '' } };
    }
  });
  ipcMain.handle('fs:write', async (_e, p: string, content: string) => {
    try {
      await fs.writeFile(join(needRepo(), p), content);
      return { ok: true, data: null };
    } catch (err) {
      return { ok: false, error: { message: String(err), stderr: '' } };
    }
  });
  ipcMain.handle('fs:list', async (_e, p: string) => {
    try {
      const entries = await fs.readdir(join(needRepo(), p || '.'), { withFileTypes: true });
      return {
        ok: true,
        data: entries
          .filter((e) => e.name !== '.git')
          .map((e) => ({ name: e.name, dir: e.isDirectory() }))
          .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1)),
      };
    } catch {
      return { ok: true, data: [] };
    }
  });

  ipcMain.on('shell:openExternal', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
  });
}
