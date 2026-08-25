import { BrowserWindow, ipcMain } from 'electron';
import { promises as fs, type Dirent } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, join, relative } from 'node:path';
import * as engine from './git/engine';
import { runGit } from './git/exec';

type WorkspaceWindow = BrowserWindow & { __repo?: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: { message: string; stderr: string } };
export type WorkspaceInfo = { path: string; name: string; isGit: boolean };
export type RuntimeInfo = {
  id: string;
  label: string;
  available: boolean;
  command: string;
  version?: string;
};
export type TechnologyReport = {
  runtimes: RuntimeInfo[];
  ecosystems: Record<string, string[]>;
  manifests: string[];
};

const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  'dist',
  'out',
  'target',
  '__pycache__',
  '.venv',
  'venv',
]);
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.xz',
  '.7z',
  '.rar',
  '.mp3',
  '.wav',
  '.mp4',
  '.mkv',
  '.mov',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.so',
  '.dll',
  '.dylib',
  '.exe',
  '.bin',
  '.class',
  '.jar',
]);

function currentDirectory(getWindow: () => BrowserWindow | null): string {
  const directory = (getWindow() as WorkspaceWindow | null)?.__repo;
  if (!directory) throw new Error('No workspace folder open');
  return directory;
}
async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: { message: (error as Error).message, stderr: '' } };
  }
}
async function info(directory: string): Promise<WorkspaceInfo> {
  return {
    path: directory,
    name: basename(directory) || directory,
    isGit: await engine.isRepo(directory).catch(() => false),
  };
}

export async function workspaceFiles(root: string, maxFiles = 6000): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > 28 || result.length >= maxFiles) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (result.length >= maxFiles) return;
      if (entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) await visit(absolute, depth + 1);
      } else if (entry.isFile()) result.push(relative(root, absolute).replaceAll('\\', '/'));
    }
  }
  await visit(root, 0);
  return result;
}
function extension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot).toLowerCase();
}
export async function searchWorkspace(
  root: string,
  query: string
): Promise<Array<{ path: string; row: number; text: string }>> {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const matches: Array<{ path: string; row: number; text: string }> = [];
  for (const path of await workspaceFiles(root)) {
    if (matches.length >= 240) break;
    if (BINARY_EXTENSIONS.has(extension(path))) continue;
    const absolute = join(root, path);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isFile() || stat.size > 1_500_000) continue;
    const content = await fs.readFile(absolute).catch(() => null);
    if (!content || content.includes(0)) continue;
    const lines = content.toString('utf8').split('\n');
    for (let index = 0; index < lines.length && matches.length < 240; index += 1) {
      if (lines[index].toLocaleLowerCase().includes(needle))
        matches.push({ path, row: index + 1, text: lines[index].trim().slice(0, 260) });
    }
  }
  return matches;
}

async function commandVersion(
  cwd: string,
  command: string,
  args: string[]
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    let output = '';
    const child = spawn(command, args, { cwd, shell: false, env: process.env });
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, 2200);
    child.stdout.on('data', (data) => {
      output += String(data);
    });
    child.stderr.on('data', (data) => {
      output += String(data);
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish(code === 0 ? output.trim().split('\n')[0].slice(0, 140) : null);
    });
  });
}
async function detectRuntime(
  cwd: string,
  id: string,
  label: string,
  candidates: Array<[string, string[]]>
): Promise<RuntimeInfo> {
  for (const [command, args] of candidates) {
    const version = await commandVersion(cwd, command, args);
    if (version) return { id, label, available: true, command, version };
  }
  return { id, label, available: false, command: candidates[0][0] };
}
async function readIfPresent(root: string, name: string): Promise<string | null> {
  return fs.readFile(join(root, name), 'utf8').catch(() => null);
}
function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, 36);
}
function packageNames(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/[<>=!~[ ;]/)[0])
    .filter(Boolean);
}

async function technologyReport(root: string): Promise<TechnologyReport> {
  const runtimes = await Promise.all([
    detectRuntime(root, 'node', 'Node.js', [['node', ['--version']]]),
    detectRuntime(root, 'python', 'Python', [
      ['python3', ['--version']],
      ['python', ['--version']],
    ]),
    detectRuntime(root, 'rust', 'Rust', [['rustc', ['--version']]]),
    detectRuntime(root, 'go', 'Go', [['go', ['version']]]),
    detectRuntime(root, 'java', 'Java', [
      ['java', ['--version']],
      ['java', ['-version']],
    ]),
    detectRuntime(root, 'dotnet', '.NET', [['dotnet', ['--version']]]),
    detectRuntime(root, 'cpp', 'C / C++', [
      ['c++', ['--version']],
      ['clang++', ['--version']],
      ['gcc', ['--version']],
    ]),
  ]);
  const ecosystems: Record<string, string[]> = {};
  const manifests: string[] = [];
  const packageJson = await readIfPresent(root, 'package.json');
  if (packageJson) {
    manifests.push('package.json');
    try {
      const pkg = JSON.parse(packageJson) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      ecosystems.javascript = unique([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ]);
      ecosystems.typescript = ecosystems.javascript;
    } catch {}
  }
  const requirements = await readIfPresent(root, 'requirements.txt');
  const pyproject = await readIfPresent(root, 'pyproject.toml');
  if (requirements || pyproject) {
    if (requirements) manifests.push('requirements.txt');
    if (pyproject) manifests.push('pyproject.toml');
    const pyprojectPackages = pyproject
      ? [...pyproject.matchAll(/^\s*["']?([A-Za-z0-9_.-]+)\s*(?:[<>=~!]|["'])/gm)].map(
          (match) => match[1]
        )
      : [];
    ecosystems.python = unique([
      ...(requirements ? packageNames(requirements) : []),
      ...pyprojectPackages,
    ]);
  }
  const cargo = await readIfPresent(root, 'Cargo.toml');
  if (cargo) {
    manifests.push('Cargo.toml');
    ecosystems.rust = unique(
      [...cargo.matchAll(/^([A-Za-z0-9_-]+)\s*=\s*/gm)]
        .map((match) => match[1])
        .filter((name) => !['name', 'version', 'edition'].includes(name))
    );
  }
  const goMod = await readIfPresent(root, 'go.mod');
  if (goMod) {
    manifests.push('go.mod');
    ecosystems.go = unique(
      [...goMod.matchAll(/^\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)\s+v\d/gm)].map(
        (match) => match[1].split('/').at(-1) ?? match[1]
      )
    );
  }
  const pom = await readIfPresent(root, 'pom.xml');
  const gradle =
    (await readIfPresent(root, 'build.gradle')) ?? (await readIfPresent(root, 'build.gradle.kts'));
  if (pom || gradle) {
    if (pom) manifests.push('pom.xml');
    if (gradle) manifests.push('build.gradle');
    const source = `${pom ?? ''}\n${gradle ?? ''}`;
    ecosystems.java = unique(
      ['Spring', 'Quarkus', 'Micronaut', 'JUnit', 'Hibernate', 'Android'].filter((name) =>
        source.toLowerCase().includes(name.toLowerCase())
      )
    );
  }
  const files = await fs.readdir(root).catch(() => [] as string[]);
  const csproj = files.find((name) => name.endsWith('.csproj'));
  if (csproj) {
    manifests.push(csproj);
    const source = await readIfPresent(root, csproj);
    ecosystems.csharp = unique(
      source
        ? [...source.matchAll(/<PackageReference\s+Include=["']([^"']+)/g)].map((match) => match[1])
        : []
    );
  }
  const cmake = await readIfPresent(root, 'CMakeLists.txt');
  if (cmake) {
    manifests.push('CMakeLists.txt');
    ecosystems.cpp = unique(
      ['Qt', 'Boost', 'SDL', 'OpenGL', 'Catch2', 'GoogleTest'].filter((name) =>
        cmake.toLowerCase().includes(name.toLowerCase())
      )
    );
  }
  return { runtimes, ecosystems, manifests };
}

export function registerWorkspaceIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('workspace:info', () => wrap(() => info(currentDirectory(getWindow))));
  ipcMain.handle('workspace:close', () =>
    wrap(async () => {
      const window = getWindow() as WorkspaceWindow | null;
      if (window) window.__repo = undefined;
      return null;
    })
  );
  ipcMain.handle('workspace:files', () => wrap(() => workspaceFiles(currentDirectory(getWindow))));
  ipcMain.handle('workspace:search', (_event, query: string) =>
    wrap(() => searchWorkspace(currentDirectory(getWindow), typeof query === 'string' ? query : ''))
  );
  ipcMain.handle('workspace:technology', () =>
    wrap(() => technologyReport(currentDirectory(getWindow)))
  );
  ipcMain.handle('workspace:initGit', () =>
    wrap(async () => {
      const directory = currentDirectory(getWindow);
      if (!(await engine.isRepo(directory))) await runGit(directory, ['init']);
      return info(directory);
    })
  );
}
