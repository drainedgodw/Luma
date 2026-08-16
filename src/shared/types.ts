export interface Commit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  email: string;
  timestamp: number;
  message: string;
  refs: string[];
  /** assigned by graph layout */
  lane: number;
}

export type RefKind = 'branch' | 'remote' | 'tag' | 'head' | 'stash';

export interface GitRef {
  name: string;
  kind: RefKind;
  target: string;
  current?: boolean;
}

export type WorktreeState = 'branch' | 'detached' | 'rebase' | 'merge' | 'bisect' | 'cherry';

export interface StatusEntry {
  path: string;
  origPath?: string;
  x: string;
  y: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
}

export interface GitStatus {
  state: WorktreeState;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  entries: StatusEntry[];
  /** while rebasing */
  rebaseOnto?: string;
  rebaseHead?: string;
  bisectTerms?: { good: string; bad: string };
  mergeHeads?: string[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  binary: boolean;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'del' | 'context';
  content: string;
  oldNo?: number;
  newNo?: number;
}

export interface ConflictFile {
  path: string;
  ours: string;
  theirs: string;
  base: string;
  /** conflict regions with both sides */
  regions: ConflictRegion[];
}

export interface ConflictRegion {
  startLine: number;
  endLine: number;
  ours: string[];
  theirs: string[];
}

export interface IpcError {
  message: string;
  stderr: string;
}

export type SidebarView = 'graph' | 'changes' | 'bisect' | 'settings';

export interface CommandLogEntry {
  id: number;
  command: string;
  at: number;
}
