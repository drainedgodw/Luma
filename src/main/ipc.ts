import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import * as engine from './git/engine';
import { tryGit } from './git/exec';
import { registerTerminal } from './terminal';
import { snapshot as snapFile, listSnapshots, getSnapshot } from './fileHistory';
import { assertParentInRepo, resolveExistingRepoPath, resolveRepoPath } from './pathGuard';
export function registerIpc(getWindow: () => BrowserWindow | null) {
  const repo = () => {
    const w = getWindow();
    return w ? ((w as BrowserWindow & { __repo?: string }).__repo ?? null) : null;
  };
  const needRepo = () => {
    const r = repo();
    if (!r) throw new Error('No repository open');
    return r;
  };
  const emit = (c: string, p: unknown) => getWindow()?.webContents.send(c, p);
  let cmdId = 0;
  const wrap = async (command: string, fn: () => Promise<unknown>) => {
    emit('git:command', { id: ++cmdId, command, at: Date.now() });
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return { ok: false, error: { message: e.message ?? String(err), stderr: e.stderr ?? '' } };
    }
  };
  const on = (
    channel: string,
    commandFn: (...a: any[]) => string,
    fn: (...a: any[]) => Promise<unknown>
  ) => ipcMain.handle(channel, (_e, ...args) => wrap(commandFn(...args), () => fn(...args)));
  const safeName = (n: string) => {
    if (!n || n === '.' || n === '..' || /[\\/\0]/.test(n)) throw new Error('Invalid file name');
    return n;
  };
  const validatePaths = (r: string, paths: string[]) => {
    for (const p of paths) resolveRepoPath(r, p, false);
    return paths;
  };
  ipcMain.handle('repo:open', async () => {
    const x = await dialog.showOpenDialog(getWindow()!, { properties: ['openDirectory'] });
    if (x.canceled || !x.filePaths.length)
      return { ok: false, error: { message: 'canceled', stderr: '' } };
    const dir = x.filePaths[0];
    if (!(await engine.isRepo(dir)))
      return { ok: false, error: { message: `Not a git repository: ${dir}`, stderr: '' } };
    (getWindow() as BrowserWindow & { __repo?: string }).__repo = dir;
    return { ok: true, data: dir };
  });
  ipcMain.handle('repo:path', () => repo());
  ipcMain.handle('repo:last', () => {
    try {
      return JSON.parse(
        require('node:fs').readFileSync(join(app.getPath('userData'), 'recent.json'), 'utf8')
      ) as string[];
    } catch {
      return [];
    }
  });
  ipcMain.handle('repo:openPath', async (_e, dir: string) => {
    if (!(await engine.isRepo(dir)))
      return { ok: false, error: { message: 'Not a git repository', stderr: '' } };
    (getWindow() as BrowserWindow & { __repo?: string }).__repo = dir;
    const recent = JSON.parse(
      await fs.readFile(join(app.getPath('userData'), 'recent.json'), 'utf8').catch(() => '[]')
    );
    const next = [dir, ...recent.filter((d: string) => d !== dir)].slice(0, 10);
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(join(app.getPath('userData'), 'recent.json'), JSON.stringify(next), {
      mode: 0o600,
    });
    return { ok: true, data: dir };
  });
  on(
    'git:log',
    () => `git log --all --oneline`,
    () => engine.getLog(needRepo())
  );
  on(
    'git:refs',
    () => `git for-each-ref`,
    () => engine.getRefs(needRepo())
  );
  on(
    'git:status',
    () => `git status`,
    () => engine.getStatus(needRepo())
  );
  on(
    'git:diff',
    (s: boolean, p?: string) => `git diff${s ? ' --cached' : ''}${p ? ' -- ' + p : ''}`,
    (s, p) => {
      const r = needRepo();
      if (p) resolveRepoPath(r, p, false);
      return engine.getDiff(r, s, p);
    }
  );
  on(
    'git:commitDiff',
    (h: string) => `git show ${h}`,
    (h) => engine.getCommitDiff(needRepo(), h)
  );
  on(
    'git:stage',
    (p: string[]) => `git add ${p.join(' ')}`,
    (p) => {
      const r = needRepo();
      return engine.stage(r, validatePaths(r, p));
    }
  );
  on(
    'git:stageAll',
    () => `git add -A`,
    () => engine.stageAll(needRepo())
  );
  on(
    'git:unstage',
    (p: string[]) => `git restore --staged ${p.join(' ')}`,
    (p) => {
      const r = needRepo();
      return engine.unstage(r, validatePaths(r, p));
    }
  );
  on(
    'git:discard',
    (p: string[]) => `git checkout -- ${p.join(' ')}`,
    (p) => {
      const r = needRepo();
      return engine.discard(r, validatePaths(r, p));
    }
  );
  on(
    'git:commit',
    () => `git commit -m "..."`,
    (m) => engine.commit(needRepo(), m)
  );
  on(
    'git:amend',
    () => `git commit --amend`,
    (m) => engine.amend(needRepo(), m)
  );
  on(
    'git:branch',
    (n: string, f?: string) => `git branch ${n}${f ? ' ' + f : ''}`,
    (n, f) => engine.createBranch(needRepo(), n, f)
  );
  on(
    'git:checkout',
    (r: string, c?: string) => `git checkout${c ? ' -b ' + c : ''} ${r}`,
    (r, c) => engine.checkout(needRepo(), r, c)
  );
  on(
    'git:deleteBranch',
    (n: string) => `git branch -d ${n}`,
    (n, f) => engine.deleteBranch(needRepo(), n, f)
  );
  on(
    'git:merge',
    (r: string, n: boolean, f: boolean) =>
      `git merge${n ? ' --no-ff' : ''}${f ? ' --ff-only' : ''} ${r}`,
    (r, n, f) => engine.merge(needRepo(), r, n, f)
  );
  on(
    'git:mergeAbort',
    () => `git merge --abort`,
    () => engine.abortMerge(needRepo())
  );
  on(
    'git:rebase',
    (o: string) => `git rebase ${o}`,
    (o) => engine.rebase(needRepo(), o)
  );
  on(
    'git:rebaseContinue',
    () => `git rebase --continue`,
    () => engine.continueRebase(needRepo())
  );
  on(
    'git:rebaseAbort',
    () => `git rebase --abort`,
    () => engine.abortRebase(needRepo())
  );
  on(
    'git:fetch',
    (r: string) => `git fetch --prune ${r}`,
    (r) => engine.fetchRemotes(needRepo(), r)
  );
  on(
    'git:push',
    () => `git push`,
    (u) => engine.push(needRepo(), u)
  );
  on(
    'git:pull',
    () => `git pull --rebase`,
    () => engine.pull(needRepo())
  );
  on(
    'git:bisectStart',
    (b: string, g?: string) => `git bisect start ${b} ${g ?? ''}`.trim(),
    (b, g) => engine.bisectStart(needRepo(), b, g)
  );
  on(
    'git:bisectMark',
    (g: boolean) => `git bisect ${g ? 'good' : 'bad'}`,
    (g) => engine.bisectMark(needRepo(), g)
  );
  on(
    'git:bisectReset',
    () => `git bisect reset`,
    () => engine.bisectReset(needRepo())
  );
  on(
    'git:bisectState',
    () => `git bisect log`,
    () => engine.bisectState(needRepo())
  );
  on(
    'git:conflictFile',
    (p: string) => `git show conflict ${p}`,
    (p) => {
      const r = needRepo();
      resolveRepoPath(r, p, false);
      return engine.getConflictFile(r, p);
    }
  );
  on(
    'git:resolveConflict',
    (p: string) => `write ${p}; git add ${p}`,
    (p, c, t) => {
      const r = needRepo();
      resolveRepoPath(r, p, false);
      return engine.resolveConflict(r, p, c, t);
    }
  );
  on(
    'git:remotes',
    () => `git remote`,
    () => engine.getRemotes(needRepo())
  );
  on(
    'git:stashPush',
    () => `git stash push`,
    (m) => engine.stashPush(needRepo(), m)
  );
  on(
    'git:stashPop',
    (r?: string) => `git stash pop ${r ?? ''}`.trim(),
    (r) => engine.stashPop(needRepo(), r)
  );
  on(
    'git:stashApply',
    (r: string) => `git stash apply ${r}`,
    (r) => engine.stashApply(needRepo(), r)
  );
  on(
    'git:stashDrop',
    (r: string) => `git stash drop ${r}`,
    (r) => engine.stashDrop(needRepo(), r)
  );
  on(
    'git:stashList',
    () => `git stash list`,
    () => engine.stashList(needRepo())
  );
  on(
    'git:reflog',
    () => `git reflog`,
    () => engine.reflog(needRepo())
  );
  on(
    'git:rewindHard',
    (r: string) => `git reset --hard ${r}`,
    (r) => engine.rewindHard(needRepo(), r)
  );
  on(
    'git:rewindSoft',
    (r: string) => `git reset --soft ${r}`,
    (r) => engine.rewindSoft(needRepo(), r)
  );
  on(
    'git:cherryPick',
    (h: string) => `git cherry-pick ${h}`,
    (h) => engine.cherryPick(needRepo(), h)
  );
  on(
    'git:revert',
    (h: string) => `git revert --no-edit ${h}`,
    (h) => engine.revertCommit(needRepo(), h)
  );
  on(
    'git:createTag',
    (n: string, h?: string, m?: string) => `git tag ${m ? '-a ' : ''}${n}`,
    (n, h, m) => engine.createTag(needRepo(), n, h, m)
  );
  on(
    'git:deleteTag',
    (n: string) => `git tag -d ${n}`,
    (n) => engine.deleteTag(needRepo(), n)
  );
  on(
    'git:commitRange',
    (f: string, t: string) => `git log ${f}..${t}`,
    (f, t) => engine.getCommitRange(needRepo(), f, t)
  );
  on(
    'git:rebaseTodo',
    () => `git rebase --show-todo`,
    () => engine.getRebaseTodo(needRepo())
  );
  on(
    'git:interactiveRebase',
    (b: string) => `git rebase -i ${b}`,
    (b, t) => engine.startInteractiveRebase(needRepo(), b, t)
  );
  on(
    'git:mainBranch',
    () => `git symbolic-ref refs/remotes/origin/HEAD`,
    () => engine.getMainBranch(needRepo())
  );
  on(
    'git:bridges',
    (b: string) => `git rev-list --left-right --count ${b}...`,
    (b) => engine.listBranchBridges(needRepo(), b)
  );
  on(
    'git:remoteUrl',
    () => `git remote get-url origin`,
    () => engine.getRemoteUrl(needRepo())
  );
  ipcMain.handle('fs:read', async (_e, p: string) => {
    try {
      const r = needRepo();
      const target = await resolveExistingRepoPath(r, p, false);
      return { ok: true, data: await fs.readFile(target, 'utf8') };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('fs:write', async (_e, p: string, content: string) => {
    try {
      const r = needRepo();
      const target = resolveRepoPath(r, p, false);
      await assertParentInRepo(r, target);
      await fs.writeFile(target, content);
      await snapFile(r, p, content);
      return { ok: true, data: null };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('history:list', async (_e, p: string) => {
    try {
      resolveRepoPath(needRepo(), p, false);
      return { ok: true, data: await listSnapshots(needRepo(), p) };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('history:get', async (_e, p: string, ts: number) => {
    try {
      resolveRepoPath(needRepo(), p, false);
      if (!Number.isSafeInteger(ts) || ts < 0) throw new Error('Invalid snapshot');
      return { ok: true, data: await getSnapshot(needRepo(), p, ts) };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('fs:list', async (_e, p: string) => {
    try {
      const target = await resolveExistingRepoPath(needRepo(), p || '.');
      const entries = await fs.readdir(target, { withFileTypes: true });
      return {
        ok: true,
        data: entries
          .filter((e) => e.name !== '.git')
          .map((e) => ({ name: e.name, dir: e.isDirectory() }))
          .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1)),
      };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('fs:newFile', async (_e, parent: string, name: string) => {
    try {
      const r = needRepo(),
        target = resolveRepoPath(r, parent ? `${parent}/${safeName(name)}` : safeName(name), false);
      await assertParentInRepo(r, target);
      if (
        await fs
          .stat(target)
          .then(() => true)
          .catch(() => false)
      )
        throw new Error('Already exists');
      await fs.writeFile(target, '');
      return { ok: true, data: target };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('fs:newDir', async (_e, parent: string, name: string) => {
    try {
      const r = needRepo(),
        target = resolveRepoPath(r, parent ? `${parent}/${safeName(name)}` : safeName(name), false);
      await assertParentInRepo(r, target);
      await fs.mkdir(target);
      return { ok: true, data: target };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('fs:rename', async (_e, path: string, newName: string) => {
    const r = needRepo();
    try {
      const from = await resolveExistingRepoPath(r, path, false),
        parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
        relativeTo = parent ? `${parent}/${safeName(newName)}` : safeName(newName),
        to = resolveRepoPath(r, relativeTo, false);
      await assertParentInRepo(r, to);
      const tracked = await tryGit(r, ['ls-files', '--error-unmatch', '--', path]);
      if (tracked.code === 0) {
        const mv = await tryGit(r, ['mv', '--', path, relativeTo]);
        if (mv.code !== 0) throw new Error(mv.stderr);
      } else await fs.rename(from, to);
      return { ok: true, data: null };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('fs:delete', async (_e, path: string, isDir: boolean) => {
    const r = needRepo();
    try {
      const target = await resolveExistingRepoPath(r, path, false);
      const tracked = await tryGit(r, ['ls-files', '--error-unmatch', '--', path]);
      if (tracked.code === 0) {
        const x = await tryGit(
          r,
          isDir ? ['rm', '-r', '-q', '--', path] : ['rm', '-q', '--', path]
        );
        if (x.code !== 0) throw new Error(x.stderr);
      } else await fs.rm(target, { recursive: true, force: true });
      return { ok: true, data: null };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('fs:duplicate', async (_e, path: string) => {
    try {
      const r = needRepo(),
        from = await resolveExistingRepoPath(r, path, false),
        dot = path.lastIndexOf('.'),
        copy = dot > 0 ? `${path.slice(0, dot)}-copy${path.slice(dot)}` : `${path}-copy`,
        to = resolveRepoPath(r, copy, false);
      await assertParentInRepo(r, to);
      await fs.copyFile(from, to);
      return { ok: true, data: copy };
    } catch (e) {
      return { ok: false, error: { message: String(e), stderr: '' } };
    }
  });
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      await shell.openExternal(url);
      return { ok: true, data: null };
    }
    return { ok: false, error: { message: 'Invalid URL', stderr: '' } };
  });
  registerTerminal(getWindow, repo);
}
