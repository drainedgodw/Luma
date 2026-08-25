import type { Commit, DiffFile, DiffHunk, DiffLine, GitRef, StatusEntry } from '../../shared/types';

const FS = '\u001f'; // unit separator
const RS = '\u001e'; // record separator

/**
 * Parse `git log --pretty` output with %x1f / %x1e separators.
 * Format per commit: hash FS short FS parents FS author FS email FS ts FS decorate FS subject (RS)
 */
export function parseLog(out: string): Commit[] {
  const commits: Commit[] = [];
  for (const rec of out.split(RS)) {
    const t = rec.trim();
    if (!t) continue;
    const [hash, shortHash, parents, author, email, ts, refs, message] = t.split(FS);
    if (!hash) continue;
    commits.push({
      hash,
      shortHash,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      author,
      email,
      timestamp: parseInt(ts, 10) || 0,
      message,
      refs: refs
        ? refs
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean)
        : [],
      lane: 0,
    });
  }
  return commits;
}

export function parseRefs(out: string): GitRef[] {
  const refs: GitRef[] = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    // <refname> <target> [<worktree-path>]
    const [name, target, wt] = line.split(' ');
    if (wt) continue; // skip other worktrees' HEADs
    refs.push({
      name,
      target,
      kind:
        name === 'HEAD'
          ? 'head'
          : name.startsWith('refs/tags/')
            ? 'tag'
            : name.startsWith('refs/remotes/')
              ? 'remote'
              : 'branch',
    });
  }
  return refs;
}

/** Parse `git status --porcelain=v2 --branch` */
export function parseStatus(out: string): {
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  entries: StatusEntry[];
} {
  let branch: string | undefined;
  let upstream: string | undefined;
  let ahead = 0;
  let behind = 0;
  const entries: StatusEntry[] = [];

  for (const line of out.split('\n')) {
    if (!line) continue;
    if (line.startsWith('# branch.head ')) {
      branch = line.slice(14);
    } else if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice(18);
    } else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) {
        ahead = parseInt(m[1], 10);
        behind = parseInt(m[2], 10);
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      // changed entry: XY ... paths
      const parts = line.split(' ');
      const xy = parts[1];
      let origPath: string | undefined;
      let path: string;
      if (line.startsWith('2 ')) {
        // rename: ... %x00 newpath %x00 origpath — but with plain parse: parts[8]=new, parts[9]=orig (percent-encoded)
        path = unquote(parts[8]);
        origPath = unquote(parts[9]);
      } else {
        path = unquote(parts[8]);
      }
      entries.push(toEntry(path, xy[0], xy[1], origPath));
    } else if (line.startsWith('u ')) {
      const parts = line.split(' ');
      const path = unquote(parts[10]);
      entries.push({
        path,
        x: 'C',
        y: 'C',
        staged: false,
        unstaged: false,
        untracked: false,
        conflicted: true,
        origPath: undefined,
      });
    } else if (line.startsWith('? ') || line.startsWith('! ')) {
      const path = unquote(line.slice(2));
      if (line.startsWith('? ')) {
        entries.push({
          path,
          x: '?',
          y: '?',
          staged: false,
          unstaged: true,
          untracked: true,
          conflicted: false,
        });
      }
    }
  }
  return { branch, upstream, ahead, behind, entries };
}

function unquote(p: string): string {
  if (p?.startsWith('"') && p?.endsWith('"')) {
    // git C-style quoting — decode \nnn octal and common escapes
    return p
      .slice(1, -1)
      .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
      .replace(/\\t/g, '\t')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"');
  }
  return p;
}

function toEntry(path: string, x: string, y: string, origPath?: string): StatusEntry {
  return {
    path,
    x,
    y,
    staged: x !== '.' && x !== '?',
    unstaged: y !== '.' && y !== '?',
    untracked: false,
    conflicted: x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D'),
    origPath,
  };
}

/** Parse unified diff output (`git diff [--cached] [-- <path>]`) into structured files. */
export function parseUnifiedDiff(out: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = out.split('\n');
  let cur: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^diff --git a\/(.*) b\/(.*)$/))) {
      cur = { oldPath: m[1], newPath: m[2], binary: false, status: 'modified', hunks: [] };
      files.push(cur);
      hunk = null;
    } else if (cur && line.startsWith('new file mode')) {
      cur.status = 'added';
    } else if (cur && line.startsWith('deleted file mode')) {
      cur.status = 'deleted';
    } else if (cur && line.startsWith('rename from ')) {
      cur.status = 'renamed';
    } else if (cur && line.startsWith('Binary files')) {
      cur.binary = true;
    } else if ((m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/))) {
      hunk = {
        oldStart: +m[1],
        oldLines: m[2] ? +m[2] : 1,
        newStart: +m[3],
        newLines: m[4] ? +m[4] : 1,
        lines: [],
      };
      (cur as DiffFile).hunks.push(hunk);
      oldNo = hunk.oldStart;
      newNo = hunk.newStart;
    } else if (hunk && line.startsWith('+')) {
      const dl: DiffLine = { type: 'add', content: line.slice(1), newNo: newNo++ };
      hunk.lines.push(dl);
    } else if (hunk && line.startsWith('-')) {
      const dl: DiffLine = { type: 'del', content: line.slice(1), oldNo: oldNo++ };
      hunk.lines.push(dl);
    } else if (hunk && (line.startsWith(' ') || line === '')) {
      if (line === '' && oldNo === 0) continue;
      hunk.lines.push({ type: 'context', content: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
    } else if (hunk && line.startsWith('\\')) {
      // "\ No newline at end of file" — attach to previous
      const last = hunk.lines[hunk.lines.length - 1];
      if (last) last.content += line;
    }
  }
  return files;
}

/**
 * Parse conflicted file content into conflict regions.
 * Expects file with <<<<<<< ======= >>>>>>> markers.
 */
export function parseConflictMarkers(content: string): {
  resolved: string;
  regions: { startLine: number; endLine: number; ours: string[]; theirs: string[] }[];
} {
  const lines = content.split('\n');
  const regions: { startLine: number; endLine: number; ours: string[]; theirs: string[] }[] = [];
  const resolved: string[] = [];
  let ours: string[] = [];
  let theirs: string[] = [];
  let inOurs = false;
  let inTheirs = false;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('<<<<<<<')) {
      inOurs = true;
      inTheirs = false;
      ours = [];
      theirs = [];
      startLine = i;
    } else if (l.startsWith('=======') && inOurs) {
      inTheirs = true;
      inOurs = false;
    } else if (l.startsWith('>>>>>>>') && inTheirs) {
      inTheirs = false;
      regions.push({ startLine, endLine: i, ours: [...ours], theirs: [...theirs] });
      resolved.push(...ours);
    } else if (inTheirs) {
      theirs.push(l);
    } else if (inOurs) {
      ours.push(l);
    } else {
      resolved.push(l);
    }
  }
  return { resolved: resolved.join('\n'), regions };
}
