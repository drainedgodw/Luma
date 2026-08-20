import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { runGit, tryGit } from './git/exec';
import { scanStagedContent } from './secretGuard';

export interface TaskDef { id: string; label: string; command: string; args: string[] }
export interface TestResult { sha: string; task: string; ok: boolean; output: string; at: number }
export interface Capsule { id: string; name: string; branch?: string; commit?: string; tabs: string[]; active?: string | null; terminalOpen: boolean; note: string; at: number }

const dataFile = (name: string) => join(app.getPath('userData'), name);

async function json<T>(name: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(dataFile(name), 'utf8')) as T; }
  catch { return fallback; }
}

async function save(name: string, value: unknown) {
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(dataFile(name), JSON.stringify(value, null, 2), { mode: 0o600 });
}

export async function trustStatus(repo: string) {
  return (await json<string[]>('trusted-repos.json', [])).includes(repo);
}

export async function setTrust(repo: string, value: boolean) {
  const current = await json<string[]>('trusted-repos.json', []);
  await save('trusted-repos.json', value ? [...new Set([...current, repo])] : current.filter(item => item !== repo));
  return value;
}

export async function tasks(repo: string): Promise<TaskDef[]> {
  const result: TaskDef[] = [];
  try {
    const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    for (const name of Object.keys(pkg.scripts ?? {})) result.push({ id: `npm:${name}`, label: `npm · ${name}`, command: 'npm', args: ['run', name] });
  } catch { /* not a Node project */ }
  const exists = (name: string) => readFile(join(repo, name), 'utf8').then(() => true).catch(() => false);
  if (await exists('Cargo.toml')) result.push({ id: 'cargo:test', label: 'Cargo test', command: 'cargo', args: ['test'] });
  if (await exists('pyproject.toml')) result.push({ id: 'pytest', label: 'Pytest', command: 'python', args: ['-m', 'pytest'] });
  if (await exists('go.mod')) result.push({ id: 'go:test', label: 'Go test', command: 'go', args: ['test', './...'] });
  return result;
}

function processRun(repo: string, command: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repo, env: { ...process.env, CI: '1' }, shell: false });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code: code ?? -1, output: output.slice(-50_000) }));
  });
}

export async function runTask(repo: string, requested: TaskDef): Promise<TestResult> {
  if (!await trustStatus(repo)) throw new Error('Trust this repository before running tasks');
  const allowed = (await tasks(repo)).find(task => task.id === requested.id);
  if (!allowed) throw new Error('Unknown task');
  const run = await processRun(repo, allowed.command, allowed.args);
  const sha = (await runGit(repo, ['rev-parse', 'HEAD'])).trim();
  const item = { sha, task: allowed.label, ok: run.code === 0, output: run.output, at: Date.now() };
  const history = await json<TestResult[]>('test-results.json', []);
  await save('test-results.json', [item, ...history].slice(0, 200));
  return item;
}

export async function riskMap(repo: string) {
  const raw = await runGit(repo, ['log', '--all', '--max-count=200', '--format=@@%H', '--numstat']);
  const result: Record<string, { files: number; churn: number; score: number; test?: 'pass' | 'fail' }> = {};
  let hash = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) { hash = line.slice(2); result[hash] = { files: 0, churn: 0, score: 0 }; continue; }
    const match = line.match(/^(\d+|-)\s+(\d+|-)\s+/);
    if (hash && match) {
      result[hash].files += 1;
      result[hash].churn += (match[1] === '-' ? 20 : Number(match[1])) + (match[2] === '-' ? 20 : Number(match[2]));
    }
  }
  const tests = await json<TestResult[]>('test-results.json', []);
  for (const [commit, value] of Object.entries(result)) {
    value.score = Math.min(100, Math.round(Math.log2(1 + value.churn) * 12 + value.files * 2));
    const test = tests.find(item => item.sha === commit);
    if (test) value.test = test.ok ? 'pass' : 'fail';
  }
  return result;
}

export async function secretScan(repo: string) {
  const diff = await runGit(repo, ['diff', '--cached', '--no-color']);
  const filenames = (await runGit(repo, ['diff', '--cached', '--name-only'])).split('\n').filter(Boolean);
  return scanStagedContent(diff, filenames).map(finding => ({ kind: finding.kind, line: finding.preview }));
}

export async function preview(repo: string, kind: 'merge' | 'rebase' | 'reset', ref: string) {
  await runGit(repo, ['rev-parse', '--verify', ref]);
  if (kind === 'reset') return { kind, summary: `${await runGit(repo, ['log', '--oneline', `${ref}..HEAD`])}\n${await runGit(repo, ['diff', '--stat', `${ref}..HEAD`])}`.slice(0, 30_000) };
  if (kind === 'rebase') {
    const base = (await runGit(repo, ['merge-base', 'HEAD', ref])).trim();
    return { kind, summary: `Merge base: ${base.slice(0, 10)}\nCommits to replay:\n${await runGit(repo, ['log', '--oneline', `${ref}..HEAD`])}` };
  }
  const base = (await runGit(repo, ['merge-base', 'HEAD', ref])).trim();
  const tree = await tryGit(repo, ['merge-tree', base, 'HEAD', ref]);
  const text = tree.stdout || tree.stderr;
  return { kind, summary: text.slice(0, 30_000), conflicts: /<<<<<<<|CONFLICT/.test(text) };
}

export async function symbols(repo: string, word: string) {
  if (!/^[A-Za-z_$][\w$]*$/.test(word)) throw new Error('Select a valid symbol');
  const result = await tryGit(repo, ['grep', '-n', '-w', word, '--', '*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.rs', '*.go']);
  return result.stdout.split('\n').filter(Boolean).slice(0, 200).map(line => {
    const [path, row, ...text] = line.split(':');
    return { path, row: Number(row), text: text.join(':') };
  });
}

export async function rename(repo: string, from: string, to: string) {
  if (!await trustStatus(repo)) throw new Error('Trust this repository before textual replacement');
  if (!/^[A-Za-z_$][\w$]*$/.test(from) || !/^[A-Za-z_$][\w$]*$/.test(to)) throw new Error('Invalid identifier');
  const matches = await symbols(repo, from);
  const files = [...new Set(matches.map(match => match.path))];
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`\\b${escaped}\\b`, 'g');
  for (const file of files) {
    const path = join(repo, file);
    const content = await readFile(path, 'utf8');
    await writeFile(path, content.replace(expression, to));
  }
  return { files: files.length, matches: matches.length };
}

export async function capsules(repo: string) {
  return (await json<Record<string, Capsule[]>>('capsules.json', {}))[repo] ?? [];
}

export async function saveCapsule(repo: string, capsule: Omit<Capsule, 'id' | 'at'>) {
  const all = await json<Record<string, Capsule[]>>('capsules.json', {});
  const item = { ...capsule, id: `capsule-${Date.now()}`, at: Date.now() };
  all[repo] = [item, ...(all[repo] ?? [])].slice(0, 30);
  await save('capsules.json', all);
  return item;
}
