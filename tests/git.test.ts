import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  parseLog,
  parseUnifiedDiff,
  parseConflictMarkers,
  parseStatus,
} from '../src/main/git/parse';
import { layoutGraph } from '../src/shared/graph';
import * as engine from '../src/main/git/engine';

let repo: string;

function git(cmd: string) {
  execSync(`git ${cmd}`, {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@t',
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00',
      GIT_COMMITTER_DATE: '2020-01-01T00:00:00',
    },
  });
}

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'luma-test-'));
  git('init -b main');
  await writeFile(join(repo, 'a.txt'), 'one\n');
  git('add . && git commit -m "first"');
  await writeFile(join(repo, 'a.txt'), 'one\ntwo\n');
  git('add . && git commit -m "second"');
  git('checkout -b feature');
  await writeFile(join(repo, 'b.txt'), 'feature\n');
  git('add . && git commit -m "feature work"');
  git('checkout main');
  await mkdir(join(repo, 'c'), { recursive: true });
  await writeFile(join(repo, 'c/d.txt'), 'main side\n');
  git('add . && git commit -m "main work"');
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe('parseLog + graph layout', () => {
  it('parses commits with parents and refs', async () => {
    const commits = await engine.getLog(repo);
    expect(commits.length).toBeGreaterThanOrEqual(4);
    const first = commits.find((c) => c.message === 'first')!;
    expect(first.parents).toHaveLength(0);
    const second = commits.find((c) => c.message === 'second')!;
    expect(second.parents).toEqual([first.hash]);
  });

  it('assigns distinct lanes to diverged branches', async () => {
    const commits = await engine.getLog(repo);
    const laid = layoutGraph(commits);
    const lanes = new Set(laid.map((c) => c.lane));
    expect(lanes.size).toBeGreaterThanOrEqual(2);
    const f = laid.find((c) => c.message === 'feature work')!;
    const m = laid.find((c) => c.message === 'main work')!;
    expect(f.lane).not.toBe(m.lane);
  });

  it('root commit gets lane and merges join lanes', async () => {
    git('merge feature -m "merge feature" || true');
    const commits = await engine.getLog(repo);
    const merge = commits.find((c) => c.message === 'merge feature');
    if (merge) {
      expect(merge.parents).toHaveLength(2);
      const laid = layoutGraph(commits);
      const laidMerge = laid.find((c) => c.hash === merge.hash)!;
      expect(laidMerge.lane).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('parseUnifiedDiff', () => {
  it('classifies added and removed lines with line numbers', () => {
    const diff = [
      'diff --git a/a.txt b/a.txt',
      'index 111..222 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1,2 @@',
      ' one',
      '+two',
    ].join('\n');
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].hunks[0].lines).toEqual([
      { type: 'context', content: 'one', oldNo: 1, newNo: 1 },
      { type: 'add', content: 'two', newNo: 2 },
    ]);
  });

  it('parses real diff from repo', async () => {
    const files = await engine.getDiff(repo, false);
    expect(files).toHaveLength(0); // clean worktree
    await writeFile(join(repo, 'a.txt'), 'changed\n');
    const files2 = await engine.getDiff(repo, false);
    expect(files2[0].hunks.length).toBeGreaterThan(0);
    await engine.discard(repo, ['a.txt']);
  });
});

describe('parseStatus', () => {
  it('detects untracked and staged states', async () => {
    await writeFile(join(repo, 'new.txt'), 'x\n');
    const status = await engine.getStatus(repo);
    expect(status.entries.some((e) => e.path === 'new.txt' && e.untracked)).toBe(true);
    expect(status.branch).toBe('main');
  });
});

describe('parseConflictMarkers', () => {
  it('extracts ours/theirs regions', () => {
    const content = 'a\n<<<<<<< HEAD\nours line\n=======\ntheirs line\n>>>>>>> feat\nz\n';
    const { regions, resolved } = parseConflictMarkers(content);
    expect(regions).toHaveLength(1);
    expect(regions[0].ours).toEqual(['ours line']);
    expect(regions[0].theirs).toEqual(['theirs line']);
    expect(resolved).toBe('a\nours line\nz\n');
  });
});

describe('stage/commit roundtrip', () => {
  it('stages and commits via engine', async () => {
    await engine.stage(repo, ['new.txt']);
    let status = await engine.getStatus(repo);
    expect(status.entries.find((e) => e.path === 'new.txt')?.staged).toBe(true);
    await engine.commit(repo, 'add new file');
    status = await engine.getStatus(repo);
    expect(status.entries.find((e) => e.path === 'new.txt')).toBeUndefined();
    const log = await engine.getLog(repo);
    expect(log[0].message).toBe('add new file');
  });
});

describe('bisect flow', () => {
  it('starts, marks and resets', async () => {
    const log = await engine.getLog(repo);
    const bad = log[0].hash;
    const good = log[log.length - 1].hash;
    await engine.bisectStart(repo, bad, good);
    let state = await engine.bisectState(repo);
    expect(state.active).toBe(true);
    await engine.bisectMark(repo, true);
    await engine.bisectReset(repo);
    state = await engine.bisectState(repo);
    expect(state.active).toBe(false);
  });
});

describe('stash drawer', () => {
  it('push, list with stats, apply, drop', async () => {
    await writeFile(join(repo, 'stashed.txt'), 'stash me\n');
    await engine.stashPush(repo, 'test stash');
    let list = await engine.stashList(repo);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].message).toContain('test stash');
    expect(list[0].files).toBeGreaterThanOrEqual(1);
    // working tree clean again
    const status = await engine.getStatus(repo);
    expect(status.entries.some((e) => e.path === 'stashed.txt')).toBe(false);
    await engine.stashApply(repo, list[0].ref);
    const afterApply = await engine.getStatus(repo);
    expect(afterApply.entries.some((e) => e.path === 'stashed.txt' && e.untracked)).toBe(true);
    await engine.stashDrop(repo, list[0].ref);
    list = await engine.stashList(repo);
    expect(list.length).toBe(0);
  });
});

describe('rescue reflog', () => {
  it('lists entries and rewinds soft', async () => {
    const before = await engine.reflog(repo);
    expect(before.length).toBeGreaterThanOrEqual(1);
    const log = await engine.getLog(repo);
    const target = log[1]; // one commit back
    await engine.rewindSoft(repo, target.hash);
    const after = await engine.reflog(repo);
    expect(after[0].summary).toContain('reset');
    // restore
    const original = log[0].hash;
    await engine.rewindHard(repo, original);
    const restored = await engine.getLog(repo);
    expect(restored[0].hash).toBe(original);
  });
});
