import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { runGit, tryGit } from './git/exec';
import { scanStagedContent } from './secretGuard';
import { searchWorkspace } from './workspaceIpc';
export interface TaskDef {
  id: string;
  label: string;
  command: string;
  args: string[];
}
export interface TestResult {
  sha: string;
  task: string;
  ok: boolean;
  output: string;
  at: number;
}
export interface Capsule {
  id: string;
  name: string;
  branch?: string;
  commit?: string;
  tabs: string[];
  active?: string | null;
  terminalOpen: boolean;
  note: string;
  at: number;
}
const dataFile = (name: string) => join(app.getPath('userData'), name);
async function json<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(dataFile(name), 'utf8')) as T;
  } catch {
    return fallback;
  }
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
  await save(
    'trusted-repos.json',
    value ? [...new Set([...current, repo])] : current.filter((item) => item !== repo)
  );
  return value;
}
export async function tasks(repo: string): Promise<TaskDef[]> {
  const result: TaskDef[] = [];
  try {
    const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    for (const name of Object.keys(pkg.scripts ?? {}))
      result.push({
        id: `npm:${name}`,
        label: `npm · ${name}`,
        command: 'npm',
        args: ['run', name],
      });
  } catch {}
  const exists = (name: string) =>
    readFile(join(repo, name), 'utf8')
      .then(() => true)
      .catch(() => false);
  if (await exists('Cargo.toml'))
    result.push({ id: 'cargo:test', label: 'Cargo test', command: 'cargo', args: ['test'] });
  if ((await exists('pyproject.toml')) || (await exists('requirements.txt')))
    result.push({ id: 'pytest', label: 'Pytest', command: 'python3', args: ['-m', 'pytest'] });
  if (await exists('go.mod'))
    result.push({ id: 'go:test', label: 'Go test', command: 'go', args: ['test', './...'] });
  return result;
}
function processRun(
  repo: string,
  command: string,
  args: string[]
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repo,
      env: { ...process.env, CI: '1' },
      shell: false,
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, output: output.slice(-50000) }));
  });
}
async function workspaceRevision(repo: string) {
  const result = await tryGit(repo, ['rev-parse', 'HEAD']);
  return result.code === 0 && result.stdout.trim()
    ? result.stdout.trim()
    : `workspace:${basename(repo)}`;
}
export async function runTask(repo: string, requested: TaskDef): Promise<TestResult> {
  if (!(await trustStatus(repo))) throw new Error('Trust this workspace before running tasks');
  const allowed = (await tasks(repo)).find((task) => task.id === requested.id);
  if (!allowed) throw new Error('Unknown task');
  const run = await processRun(repo, allowed.command, allowed.args);
  const sha = await workspaceRevision(repo);
  const item = { sha, task: allowed.label, ok: run.code === 0, output: run.output, at: Date.now() };
  const history = await json<TestResult[]>('test-results.json', []);
  await save('test-results.json', [item, ...history].slice(0, 200));
  return item;
}

// Catalog of installable packages per language. Only whitelisted names can be
// installed, so a compromised renderer cannot run arbitrary shell commands.
const INSTALL_CATALOG: Record<string, Record<string, { command: string; args: string[] }>> = {
  typescript: {
    React: { command: 'npm', args: ['install', 'react', 'react-dom'] },
    'Next.js': { command: 'npm', args: ['install', 'next'] },
    Angular: { command: 'npm', args: ['install', '@angular/core'] },
    NestJS: { command: 'npm', args: ['install', '@nestjs/core'] },
    Zod: { command: 'npm', args: ['install', 'zod'] },
    Vitest: { command: 'npm', args: ['install', '-D', 'vitest'] },
    Prisma: { command: 'npm', args: ['install', 'prisma'] },
    tRPC: { command: 'npm', args: ['install', '@trpc/server'] },
  },
  javascript: {
    React: { command: 'npm', args: ['install', 'react', 'react-dom'] },
    Vue: { command: 'npm', args: ['install', 'vue'] },
    Svelte: { command: 'npm', args: ['install', 'svelte'] },
    Express: { command: 'npm', args: ['install', 'express'] },
    Vite: { command: 'npm', args: ['install', '-D', 'vite'] },
    Jest: { command: 'npm', args: ['install', '-D', 'jest'] },
    Axios: { command: 'npm', args: ['install', 'axios'] },
    'Three.js': { command: 'npm', args: ['install', 'three'] },
  },
  python: {
    Django: { command: 'python3', args: ['-m', 'pip', 'install', '--user', 'Django'] },
    FastAPI: { command: 'python3', args: ['-m', 'pip', 'install', '--user', 'fastapi'] },
    Flask: { command: 'python3', args: ['-m', 'pip', 'install', '--user', 'Flask'] },
    NumPy: { command: 'python3', args: ['-m', 'pip', 'install', '--user', 'numpy'] },
    pandas: { command: 'python3', args: ['-m', 'pip', 'install', '--user', 'pandas'] },
    PyTorch: { command: 'python3', args: ['-m', 'pip', 'install', '--user', 'torch'] },
    pytest: { command: 'python3', args: ['-m', 'pip', 'install', '--user', 'pytest'] },
  },
  rust: {
    Axum: { command: 'cargo', args: ['add', 'axum'] },
    'Actix Web': { command: 'cargo', args: ['add', 'actix-web'] },
    Rocket: { command: 'cargo', args: ['add', 'rocket'] },
    Bevy: { command: 'cargo', args: ['add', 'bevy'] },
    Tokio: { command: 'cargo', args: ['add', 'tokio'] },
    Serde: { command: 'cargo', args: ['add', 'serde'] },
    Clap: { command: 'cargo', args: ['add', 'clap'] },
    Rayon: { command: 'cargo', args: ['add', 'rayon'] },
  },
  go: {
    Gin: { command: 'go', args: ['get', '-u', 'github.com/gin-gonic/gin'] },
    Fiber: { command: 'go', args: ['get', '-u', 'github.com/gofiber/fiber/v2'] },
    Echo: { command: 'go', args: ['get', '-u', 'github.com/labstack/echo/v4'] },
    Cobra: { command: 'go', args: ['get', '-u', 'github.com/spf13/cobra'] },
    GORM: { command: 'go', args: ['get', '-u', 'gorm.io/gorm'] },
    Testify: { command: 'go', args: ['get', '-u', 'github.com/stretchr/testify'] },
    Zap: { command: 'go', args: ['get', '-u', 'go.uber.org/zap'] },
  },
};

export async function installTool(
  repo: string,
  packId: string,
  name: string
): Promise<{ ok: boolean; output: string }> {
  if (!(await trustStatus(repo)))
    throw new Error('Trust this workspace before installing packages');
  const entry = INSTALL_CATALOG[packId]?.[name];
  if (!entry)
    throw new Error(
      `“${name}” cannot be installed automatically for this language — install it manually`
    );
  const run = await processRun(repo, entry.command, entry.args);
  return { ok: run.code === 0, output: run.output.slice(-4000) };
}
export async function riskMap(repo: string) {
  const raw = await runGit(repo, ['log', '--all', '--max-count=200', '--format=@@%H', '--numstat']),
    result: Record<
      string,
      { files: number; churn: number; score: number; test?: 'pass' | 'fail' }
    > = {};
  let hash = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) {
      hash = line.slice(2);
      result[hash] = { files: 0, churn: 0, score: 0 };
      continue;
    }
    const match = line.match(/^(\d+|-)\s+(\d+|-)\s+/);
    if (hash && match) {
      result[hash].files += 1;
      result[hash].churn +=
        (match[1] === '-' ? 20 : Number(match[1])) + (match[2] === '-' ? 20 : Number(match[2]));
    }
  }
  const tests = await json<TestResult[]>('test-results.json', []);
  for (const [commit, value] of Object.entries(result)) {
    value.score = Math.min(100, Math.round(Math.log2(1 + value.churn) * 12 + value.files * 2));
    const test = tests.find((item) => item.sha === commit);
    if (test) value.test = test.ok ? 'pass' : 'fail';
  }
  return result;
}
export async function secretScan(repo: string) {
  const diff = await runGit(repo, ['diff', '--cached', '--no-color']),
    filenames = (await runGit(repo, ['diff', '--cached', '--name-only']))
      .split('\n')
      .filter(Boolean);
  return scanStagedContent(diff, filenames).map((finding) => ({
    kind: finding.kind,
    line: finding.preview,
  }));
}
export async function preview(repo: string, kind: 'merge' | 'rebase' | 'reset', ref: string) {
  await runGit(repo, ['rev-parse', '--verify', ref]);
  if (kind === 'reset')
    return {
      kind,
      summary:
        `${await runGit(repo, ['log', '--oneline', `${ref}..HEAD`])}\n${await runGit(repo, ['diff', '--stat', `${ref}..HEAD`])}`.slice(
          0,
          30000
        ),
    };
  if (kind === 'rebase') {
    const base = (await runGit(repo, ['merge-base', 'HEAD', ref])).trim();
    return {
      kind,
      summary: `Merge base: ${base.slice(0, 10)}\nCommits to replay:\n${await runGit(repo, ['log', '--oneline', `${ref}..HEAD`])}`,
    };
  }
  const base = (await runGit(repo, ['merge-base', 'HEAD', ref])).trim();
  const tree = await tryGit(repo, ['merge-tree', base, 'HEAD', ref]);
  const text = tree.stdout || tree.stderr;
  return { kind, summary: text.slice(0, 30000), conflicts: /<<<<<<<|CONFLICT/.test(text) };
}
export async function symbols(repo: string, word: string) {
  if (!/^[A-Za-z_$][\w$]*$/.test(word)) throw new Error('Select a valid symbol');
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    expression = new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`);
  return (await searchWorkspace(repo, word))
    .filter((match) => expression.test(match.text))
    .slice(0, 200);
}
export async function rename(repo: string, from: string, to: string) {
  if (!(await trustStatus(repo)))
    throw new Error('Trust this workspace before textual replacement');
  if (!/^[A-Za-z_$][\w$]*$/.test(from) || !/^[A-Za-z_$][\w$]*$/.test(to))
    throw new Error('Invalid identifier');
  const matches = await symbols(repo, from),
    files = [...new Set(matches.map((match) => match.path))],
    escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    expression = new RegExp(`\\b${escaped}\\b`, 'g');
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
  const all = await json<Record<string, Capsule[]>>('capsules.json', {}),
    item = { ...capsule, id: `capsule-${Date.now()}`, at: Date.now() };
  all[repo] = [item, ...(all[repo] ?? [])].slice(0, 30);
  await save('capsules.json', all);
  return item;
}
