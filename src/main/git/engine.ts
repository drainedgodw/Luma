import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Commit,
  ConflictFile,
  DiffFile,
  GitRef,
  GitStatus,
  WorktreeState,
} from '../../shared/types';
import { runGit, tryGit } from './exec';
import { parseConflictMarkers, parseLog, parseRefs, parseStatus, parseUnifiedDiff } from './parse';

const FS = '\u001f';
const RS = '\u001e';
const LOG_FORMAT = ['%H', '%h', '%P', '%an', '%ae', '%at', '%D', '%s'].join(FS) + RS;

export async function isRepo(dir: string): Promise<boolean> {
  const r = await tryGit(dir, ['rev-parse', '--is-inside-work-tree']);
  return r.code === 0 && r.stdout.trim() === 'true';
}

export async function getLog(repo: string, limit = 2000): Promise<Commit[]> {
  const out = await runGit(repo, [
    'log',
    '--all',
    '--topo-order',
    `--pretty=format:${LOG_FORMAT}`,
    `--max-count=${limit}`,
  ]);
  const commits = parseLog(out);
  // decorations for HEAD/current markers
  return commits;
}

export async function getRefs(repo: string): Promise<GitRef[]> {
  const out = await runGit(repo, [
    'for-each-ref',
    '--format=%(refname) %(objectname)',
    'refs/heads',
    'refs/remotes',
    'refs/tags',
  ]);
  const refs = parseRefs(out);
  const head = await tryGit(repo, ['rev-parse', 'HEAD']);
  if (head.code === 0) refs.push({ name: 'HEAD', kind: 'head', target: head.stdout.trim() });
  return refs;
}

export async function getStatus(repo: string): Promise<GitStatus> {
  const out = await runGit(repo, ['status', '--porcelain=v2', '--branch']);
  const s = parseStatus(out);

  let state: WorktreeState = s.branch === '(detached)' ? 'detached' : 'branch';
  let rebaseOnto: string | undefined;
  let rebaseHead: string | undefined;

  const rebaseCheck = await tryGit(repo, ['rev-parse', '--git-path', 'rebase-merge']);
  if (rebaseCheck.code === 0) {
    const dir = join(repo, rebaseCheck.stdout.trim());
    try {
      const ontoRaw = await readFile(join(dir, 'onto'), 'utf8');
      state = 'rebase';
      rebaseOnto = ontoRaw.trim();
      rebaseHead = await readFile(join(dir, 'head-name'), 'utf8').catch(() => '');
    } catch {
      /* not rebasing */
    }
  }

  let bisectTerms: GitStatus['bisectTerms'] | undefined;
  const bisect = await tryGit(repo, ['bisect', 'log']);
  const bisectActive = bisect.code === 0 && /git bisect start|# (bad|good): \[/.test(bisect.stdout);
  if (bisectActive) {
    state = 'bisect';
    const good = await tryGit(repo, ['bisect', 'terms', '--term-good']);
    const bad = await tryGit(repo, ['bisect', 'terms', '--term-bad']);
    bisectTerms = {
      good: good.code === 0 ? good.stdout.trim() : 'good',
      bad: bad.code === 0 ? bad.stdout.trim() : 'bad',
    };
  }

  const mergeHead = await tryGit(repo, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
  const conflicted = s.entries.some((e) => e.conflicted);
  if (mergeHead.code === 0 && conflicted) {
    state = 'merge';
  }

  return {
    state,
    branch: s.branch === '(detached)' ? undefined : s.branch,
    upstream: s.upstream,
    ahead: s.ahead,
    behind: s.behind,
    entries: s.entries,
    rebaseOnto,
    rebaseHead,
    bisectTerms,
  };
}

export async function getDiff(repo: string, staged: boolean, path?: string): Promise<DiffFile[]> {
  const args = ['diff', '--no-color', '--find-renames', '-M'];
  if (staged) args.push('--cached');
  if (path) args.push('--', path);
  const out = await runGit(repo, args);
  return parseUnifiedDiff(out);
}

export async function getCommitDiff(repo: string, hash: string): Promise<DiffFile[]> {
  const out = await runGit(repo, ['show', '--no-color', '--find-renames', '--format=', hash]);
  return parseUnifiedDiff(out);
}

export async function stage(repo: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(repo, ['add', '--', ...paths]);
}

export async function stageAll(repo: string): Promise<void> {
  await runGit(repo, ['add', '-A']);
}

export async function unstage(repo: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(repo, ['restore', '--staged', '--', ...paths]);
}

export async function discard(repo: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(repo, ['checkout', '--', ...paths]);
}

export async function commit(repo: string, message: string): Promise<void> {
  await runGit(repo, ['commit', '-m', message]);
}

export async function commitAll(repo: string, message: string): Promise<void> {
  await stageAll(repo);
  await commit(repo, message);
}

export async function amend(repo: string, message?: string): Promise<void> {
  const args = ['commit', '--amend', '--no-edit'];
  if (message) args.push('-m', message);
  await runGit(repo, args);
}

export async function createBranch(repo: string, name: string, from?: string): Promise<void> {
  const args = ['branch', name];
  if (from) args.push(from);
  await runGit(repo, args);
}

export async function checkout(repo: string, ref: string, create?: string): Promise<void> {
  const args = ['checkout'];
  if (create) args.push('-b', create);
  args.push(ref);
  await runGit(repo, args);
}

export async function deleteBranch(repo: string, name: string, force = false): Promise<void> {
  await runGit(repo, ['branch', force ? '-D' : '-d', name]);
}

export async function merge(
  repo: string,
  ref: string,
  noFf = false,
  ffOnly = false
): Promise<void> {
  const args = ['merge', ref];
  if (noFf) args.push('--no-ff');
  if (ffOnly) args.push('--ff-only');
  await runGit(repo, args);
}

export async function abortMerge(repo: string): Promise<void> {
  await runGit(repo, ['merge', '--abort']);
}

export async function rebase(repo: string, onto: string): Promise<void> {
  await runGit(repo, ['rebase', onto]);
}

export async function continueRebase(repo: string): Promise<void> {
  await runGit(repo, ['rebase', '--continue']);
}

export async function abortRebase(repo: string): Promise<void> {
  await runGit(repo, ['rebase', '--abort']);
}

export async function fetchRemotes(repo: string, remote = 'origin'): Promise<void> {
  await runGit(repo, ['fetch', '--prune', remote]);
}

export async function push(repo: string, setUpstream = false): Promise<void> {
  const args = ['push'];
  if (setUpstream) args.push('-u', 'origin', 'HEAD');
  await runGit(repo, args);
}

export async function pull(repo: string): Promise<void> {
  await runGit(repo, ['pull', '--rebase']);
}

// ---- bisect ----

export async function bisectStart(repo: string, bad = 'HEAD', good?: string): Promise<void> {
  const args = ['bisect', 'start', bad];
  if (good) args.push(good);
  await runGit(repo, args);
}

export async function bisectMark(repo: string, good: boolean): Promise<void> {
  await runGit(repo, ['bisect', good ? 'good' : 'bad']);
}

export async function bisectReset(repo: string): Promise<void> {
  await runGit(repo, ['bisect', 'reset']);
}

export interface BisectState {
  active: boolean;
  revision?: string;
  remainingSteps?: string;
  isGood?: boolean;
  isBad?: boolean;
}

export async function bisectState(repo: string): Promise<BisectState> {
  const r = await tryGit(repo, ['bisect', 'log']);
  if (r.code !== 0 || !/git bisect start|# (bad|good): \[/.test(r.stdout)) return { active: false };
  const rev = await tryGit(repo, ['rev-parse', 'HEAD']);
  const steps = await tryGit(repo, ['bisect', 'visualize', '--', '--format=%s', '-1']);
  // "git bisect log" first bad commit line: "# first bad commit: [...]"
  const m = r.stdout.match(/# (good|bad): \[([0-9a-f]+)\]/g);
  const marks = m?.map((x) => x.match(/# (good|bad): \[([0-9a-f]+)\]/)!) ?? [];
  const headHash = rev.code === 0 ? rev.stdout.trim() : undefined;
  const marked = marks.find((x) => x[2] === headHash);
  const remain = r.stdout.match(/# skip count.*|# remaining steps/i);
  return {
    active: true,
    revision: headHash,
    remainingSteps: steps.code === 0 ? steps.stdout.trim().split('\n').pop() : undefined,
    isGood: marked?.[1] === 'good',
    isBad: marked?.[1] === 'bad',
  };
}

// ---- conflicts ----

export async function getConflictFile(repo: string, path: string): Promise<ConflictFile> {
  const content = await readFile(join(repo, path), 'utf8');
  const { resolved, regions } = parseConflictMarkers(content);
  const ours = await runGit(repo, ['show', `:2:${path}`]).catch(() => '');
  const theirs = await runGit(repo, ['show', `:3:${path}`]).catch(() => '');
  const base = await runGit(repo, ['show', `:1:${path}`]).catch(() => '');
  return { path, ours, theirs, base, regions };
}

export async function resolveConflict(
  repo: string,
  path: string,
  content: string,
  take: 'ours' | 'theirs' | 'both' | 'custom' = 'custom'
): Promise<void> {
  let final = content;
  if (take === 'ours') final = await runGit(repo, ['show', `:2:${path}`]).catch(() => '');
  if (take === 'theirs') final = await runGit(repo, ['show', `:3:${path}`]).catch(() => '');
  if (take === 'both') {
    const { resolved } = parseConflictMarkers(await readFile(join(repo, path), 'utf8'));
    final = resolved;
  }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(repo, path), final);
  await stage(repo, [path]);
}

export async function pushTag(repo: string, tag: string): Promise<void> {
  await runGit(repo, ['push', 'origin', tag]);
}

export async function getRemotes(repo: string): Promise<string[]> {
  const out = await runGit(repo, ['remote']);
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function stashPush(repo: string, message?: string): Promise<void> {
  const args = ['stash', 'push', '--include-untracked'];
  if (message) args.push('-m', message);
  await runGit(repo, args);
}

export async function stashPop(repo: string, ref?: string): Promise<void> {
  await runGit(repo, ['stash', 'pop', ...(ref ? [ref] : [])]);
}

export async function stashApply(repo: string, ref: string): Promise<void> {
  await runGit(repo, ['stash', 'apply', ref]);
}

export async function stashDrop(repo: string, ref: string): Promise<void> {
  await runGit(repo, ['stash', 'drop', ref]);
}

export interface StashEntry {
  ref: string;
  hash: string;
  timestamp: number;
  message: string;
  files: number;
  insertions: number;
  deletions: number;
}

export async function stashList(repo: string): Promise<StashEntry[]> {
  const out = await runGit(repo, ['stash', 'list', '--format=%gd\u001f%h\u001f%ct\u001f%s']);
  const entries: StashEntry[] = [];
  for (const rec of out.split('\n').filter(Boolean)) {
    const [ref, hash, ts, message] = rec.split('\u001f');
    entries.push({
      ref,
      hash,
      timestamp: parseInt(ts, 10) || 0,
      message,
      files: 0,
      insertions: 0,
      deletions: 0,
    });
  }
  for (const e of entries) {
    try {
      let stat = await runGit(repo, ['stash', 'show', '--numstat', '--format=', e.ref]);
      if (!stat.trim()) {
        // untracked-only stash: contents live in the third parent
        stat = await runGit(repo, ['show', '--numstat', '--format=', `${e.ref}^3`]);
      }
      for (const line of stat.split('\n').filter(Boolean)) {
        const [a, d] = line.split('\t');
        e.files++;
        e.insertions += a === '-' ? 0 : parseInt(a, 10) || 0;
        e.deletions += d === '-' ? 0 : parseInt(d, 10) || 0;
      }
    } catch {
      /* binary or unreadable */
    }
  }
  return entries;
}

export interface ReflogEntry {
  hash: string;
  shortHash: string;
  selector: string;
  summary: string;
}

export async function reflog(repo: string, limit = 30): Promise<ReflogEntry[]> {
  const out = await runGit(repo, [
    'reflog',
    `--max-count=${limit}`,
    '--format=%H\u001f%h\u001f%gd\u001f%gs',
  ]);
  const entries: ReflogEntry[] = [];
  for (const rec of out.split('\n').filter(Boolean)) {
    const [hash, shortHash, selector, summary] = rec.split('\u001f');
    entries.push({ hash, shortHash, selector, summary });
  }
  return entries;
}

export async function rewindHard(repo: string, ref: string): Promise<void> {
  await runGit(repo, ['reset', '--hard', ref]);
}

export async function rewindSoft(repo: string, ref: string): Promise<void> {
  await runGit(repo, ['reset', '--soft', ref]);
}

export async function cherryPick(repo: string, hash: string): Promise<void> {
  await runGit(repo, ['cherry-pick', hash]);
}

export async function revertCommit(repo: string, hash: string): Promise<void> {
  await runGit(repo, ['revert', '--no-edit', hash]);
}

export async function createTag(
  repo: string,
  name: string,
  hash?: string,
  message?: string
): Promise<void> {
  const args = ['tag'];
  if (message) args.push('-a', name, '-m', message);
  else args.push(name);
  if (hash) args.push(hash);
  await runGit(repo, args);
}

export async function deleteTag(repo: string, name: string): Promise<void> {
  await runGit(repo, ['tag', '-d', name]);
}

export async function getCommitRange(repo: string, from: string, to: string): Promise<Commit[]> {
  const out = await runGit(repo, [
    'log',
    '--topo-order',
    `--pretty=format:${LOG_FORMAT}`,
    `${from}..${to}`,
  ]);
  return parseLog(out);
}

export interface RebaseTodoItem {
  hash: string;
  command: 'pick' | 'squash' | 'drop' | 'edit' | 'reword';
  message: string;
  shortHash: string;
}

export async function getRebaseTodo(repo: string): Promise<RebaseTodoItem[] | null> {
  const dir = await tryGit(repo, ['rev-parse', '--git-path', 'rebase-merge']);
  if (dir.code !== 0) {
    const dir2 = await tryGit(repo, ['rev-parse', '--git-path', 'rebase-apply']);
    if (dir2.code !== 0) return null;
  }
  const todoPath = await tryGit(repo, ['rev-parse', '--git-path', 'rebase-merge/git-rebase-todo']);
  let todoFile: string;
  if (todoPath.code === 0) {
    todoFile = join(repo, todoPath.stdout.trim());
  } else {
    const applyPath = await tryGit(repo, [
      'rev-parse',
      '--git-path',
      'rebase-apply/git-rebase-todo',
    ]);
    if (applyPath.code === 0) {
      todoFile = join(repo, applyPath.stdout.trim());
    } else return null;
  }
  try {
    const content = await readFile(todoFile, 'utf8');
    return content
      .split('\n')
      .filter((line) => /^(pick|squash|drop|edit|reword)\s/.test(line))
      .map((line) => {
        const m = line.match(/^(pick|squash|drop|edit|reword)\s+(\S+)\s+(.*)$/)!;
        return {
          command: m[1] as RebaseTodoItem['command'],
          hash: m[2],
          shortHash: m[2].slice(0, 7),
          message: m[3],
        };
      });
  } catch {
    return null;
  }
}

function shellQuote(s: string): string {
  return '"' + s.replace(/[$"\\`]/g, '\\$&') + '"';
}

export async function startInteractiveRebase(
  repo: string,
  base: string,
  todos: RebaseTodoItem[]
): Promise<void> {
  const gitDir = (await runGit(repo, ['rev-parse', '--absolute-git-dir'])).trim();
  const lines: string[] = [];
  for (const t of todos) {
    if (t.command === 'drop') continue;
    if (t.command === 'reword') {
      // the sequence editor cannot set messages, so amend right after the pick
      lines.push(`pick ${t.hash}`);
      lines.push(`exec git commit --amend -m ${shellQuote(t.message || 'reworded')}`);
    } else {
      lines.push(`${t.command} ${t.hash}`);
    }
  }
  if (lines.length === 0) throw new Error('Nothing to rebase — every commit is dropped');
  const todoPath = join(gitDir, 'luma-rebase-todo');
  await writeFile(todoPath, lines.join('\n') + '\n');
  const editorPath = join(gitDir, 'luma-rebase-editor.sh');
  await writeFile(editorPath, `#!/bin/sh\nexec cp '${todoPath.replace(/'/g, "'\\''")}' "$1"\n`);
  await chmod(editorPath, 0o755);
  await runGit(repo, ['rebase', '-i', base], {
    GIT_SEQUENCE_EDITOR: editorPath,
    // squash combines messages in the prepared file; accept them as-is
    GIT_EDITOR: 'true',
  });
}

// ---- branch bridges (PR-style overview) ----

export interface BranchBridge {
  name: string;
  /** commit id of merge base with the base branch */
  mergeBase: string;
  /** commits only in this branch */
  ahead: number;
  /** commits only in the base branch */
  behind: number;
  insertions: number;
  deletions: number;
  files: number;
  /** branch tip fully contained in base */
  merged: boolean;
  remoteTracking?: string;
}

export async function getMainBranch(repo: string): Promise<string> {
  const symbolic = await tryGit(repo, [
    'symbolic-ref',
    '-q',
    '--short',
    'refs/remotes/origin/HEAD',
  ]);
  if (symbolic.code === 0) return symbolic.stdout.trim().replace(/^origin\//, '');
  for (const candidate of ['main', 'master', 'trunk', 'develop']) {
    const r = await tryGit(repo, ['rev-parse', '-q', '--verify', `refs/heads/${candidate}`]);
    if (r.code === 0) return candidate;
  }
  return 'main';
}

export async function listBranchBridges(repo: string, base: string): Promise<BranchBridge[]> {
  const out = await runGit(repo, [
    'for-each-ref',
    '--format=%(refname:short)\u001f%(upstream:short)',
    'refs/heads',
  ]);
  const branches: { name: string; remoteTracking?: string }[] = [];
  for (const rec of out.split('\n').filter(Boolean)) {
    const [name, upstream] = rec.split('\u001f');
    if (name === base) continue;
    branches.push({ name, remoteTracking: upstream || undefined });
  }
  const bridges: BranchBridge[] = [];
  for (const b of branches) {
    const counts = await tryGit(repo, [
      'rev-list',
      '--left-right',
      '--count',
      `${base}...${b.name}`,
    ]);
    const [behind = 0, ahead = 0] =
      counts.code === 0
        ? counts.stdout
            .trim()
            .split(/\s+/)
            .map((n) => parseInt(n, 10) || 0)
        : [];
    const mb = await tryGit(repo, ['merge-base', base, b.name]);
    const merged = await tryGit(repo, ['merge-base', '--is-ancestor', b.name, base]);
    let insertions = 0;
    let deletions = 0;
    let files = 0;
    try {
      const stat = await runGit(repo, ['diff', '--numstat', '--format=', `${base}...${b.name}`]);
      for (const line of stat.split('\n').filter(Boolean)) {
        const [a, d] = line.split('\t');
        files++;
        insertions += a === '-' ? 0 : parseInt(a, 10) || 0;
        deletions += d === '-' ? 0 : parseInt(d, 10) || 0;
      }
    } catch {
      /* unreadable diff */
    }
    bridges.push({
      name: b.name,
      mergeBase: mb.code === 0 ? mb.stdout.trim() : '',
      ahead,
      behind,
      insertions,
      deletions,
      files,
      merged: merged.code === 0,
      remoteTracking: b.remoteTracking,
    });
  }
  // most active bridges first: unmerged with commits ahead, then merged
  return bridges.sort(
    (a, b) =>
      Number(b.merged) - Number(a.merged) || b.ahead - a.ahead || a.name.localeCompare(b.name)
  );
}

export async function getRemoteUrl(repo: string): Promise<string | null> {
  const r = await tryGit(repo, ['remote', 'get-url', 'origin']);
  if (r.code !== 0) return null;
  const raw = r.stdout.trim();
  const ssh = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  const https = raw.match(/^https?:\/\/.+$/);
  if (https) return raw.replace(/\.git$/, '');
  return null;
}
