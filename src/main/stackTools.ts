import { spawn } from 'node:child_process';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, posix, win32 } from 'node:path';
import {
  STACK_TOOL_CATALOG,
  isStackToolInstalled,
  stackToolDefinition,
  stackToolKey,
  type StackToolAction,
  type StackToolDefinition,
  type StackToolResult,
} from '../shared/stackCatalog';

export type NodePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export interface StackCommand { command: string; args: string[]; display: string }
export interface StackCommandOptions {
  comSpec?: string;
  nodeManager?: NodePackageManager;
  projectFile?: string;
  pythonExecutable?: string;
}
interface ProcessResult { code: number; output: string }
const activeActions = new Set<string>();

export function buildStackCommands(
  definition: StackToolDefinition,
  action: StackToolAction,
  platform: NodeJS.Platform,
  options: StackCommandOptions = {}
): StackCommand[] {
  switch (definition.manager) {
    case 'node': {
      const manager = options.nodeManager ?? 'npm';
      const args = nodePackageArguments(manager, action, definition);
      const display = formatCommand(manager, args);
      if (platform === 'win32') {
        return [{
          command: options.comSpec?.trim() || 'cmd.exe',
          args: ['/d', '/s', '/c', manager === 'bun' ? 'bun.exe' : `${manager}.cmd`, ...args],
          display,
        }];
      }
      return [{ command: manager, args, display }];
    }
    case 'pip': {
      if (!options.pythonExecutable) throw new Error('Python virtual environment is not ready');
      const args = [
        '-m', 'pip', action === 'install' ? 'install' : 'uninstall',
        ...(action === 'uninstall' ? ['--yes'] : []),
        ...definition.packages,
      ];
      return [{
        command: options.pythonExecutable,
        args,
        display: formatCommand(relativeExecutable(options.pythonExecutable, platform), args),
      }];
    }
    case 'cargo': {
      const args = [action === 'install' ? 'add' : 'remove', ...definition.packages];
      return [{ command: 'cargo', args, display: formatCommand('cargo', args) }];
    }
    case 'go': {
      const packages = definition.packages.map((name) =>
        action === 'install' ? `${name}@latest` : `${name}@none`
      );
      const args = ['get', ...packages];
      return [{ command: 'go', args, display: formatCommand('go', args) }];
    }
    case 'dotnet': {
      if (!options.projectFile) throw new Error('A .csproj file is required');
      const args = [action === 'install' ? 'add' : 'remove', options.projectFile, 'package', ...definition.packages];
      return [{ command: 'dotnet', args, display: formatCommand('dotnet', args) }];
    }
  }
}

export async function runStackToolAction(
  repo: string,
  action: StackToolAction,
  packId: string,
  name: string,
  platform: NodeJS.Platform = process.platform
): Promise<StackToolResult> {
  const definition = stackToolDefinition(packId, name);
  if (!definition) throw new Error(`“${name}” is not an approved Stack package for ${packId}`);
  const operationKey = `${repo}\u0000${definition.manager}`;
  if (activeActions.has(operationKey))
    throw new Error(`Another ${definition.manager} package action is already running`);
  activeActions.add(operationKey);
  try {
    const options: StackCommandOptions = {};
    if (definition.manager === 'node') {
      await requireFile(repo, 'package.json', 'Create package.json before adding Node packages');
      options.nodeManager = await detectNodePackageManager(repo);
      options.comSpec = process.env.ComSpec;
    }
    if (definition.manager === 'cargo')
      await requireFile(repo, 'Cargo.toml', 'Create Cargo.toml before adding Rust crates');
    if (definition.manager === 'go')
      await requireFile(repo, 'go.mod', 'Run “go mod init” before adding Go modules');
    if (definition.manager === 'dotnet') options.projectFile = await singleDotnetProject(repo);

    const preparation: StackCommand[] = [];
    if (definition.manager === 'pip') {
      const python = virtualEnvironmentPython(repo, platform);
      if (!(await fileExists(python))) {
        if (action === 'uninstall')
          throw new Error('The project .venv does not exist, so there is nothing to remove');
        const launcher = await findPythonLauncher(repo, platform);
        const args = [...launcher.args, '-m', 'venv', '.venv'];
        preparation.push({
          command: launcher.command,
          args,
          display: formatCommand(launcher.command, args),
        });
      }
      options.pythonExecutable = python;
    }

    const commands = [...preparation, ...buildStackCommands(definition, action, platform, options)];
    let output = '';
    for (const command of commands) {
      const result = await runProcess(repo, command);
      output += `$ ${command.display}\n${result.output.trim()}\n`;
      if (result.code !== 0) {
        return {
          ok: false,
          action,
          command: commands.map((item) => item.display).join('\n'),
          output: output.trim().slice(-12000),
        };
      }
      if (definition.manager === 'pip' && command === preparation[0])
        await ensureVirtualEnvironmentIgnored(repo);
    }
    return {
      ok: true,
      action,
      command: commands.map((item) => item.display).join('\n'),
      output: output.trim().slice(-12000),
    };
  } finally {
    activeActions.delete(operationKey);
  }
}

export async function stackToolStatus(
  repo: string,
  platform: NodeJS.Platform = process.platform
): Promise<Record<string, boolean>> {
  const detected: Record<string, string[]> = {
    typescript: [], javascript: [], python: [], rust: [], go: [], csharp: [],
  };
  const packageJson = await readText(join(repo, 'package.json'));
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
      detected.javascript = names;
      detected.typescript = names;
    } catch {}
  }

  detected.python = await pythonPackagesFromVirtualEnvironment(repo, platform);

  const cargo = await readText(join(repo, 'Cargo.toml'));
  if (cargo)
    detected.rust = [...cargo.matchAll(/^([A-Za-z0-9_-]+)\s*=\s*/gm)].map((match) => match[1]);

  const goMod = await readText(join(repo, 'go.mod'));
  if (goMod) {
    const modules = [...goMod.matchAll(/^\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)\s+v\d/gm)].map(
      (match) => match[1]
    );
    detected.go = modules.flatMap((module) => [
      module,
      module.split('/').filter(Boolean).at(-1) ?? module,
    ]);
  }

  const dotnetProjects = (await readdir(repo).catch(() => [] as string[])).filter((file) =>
    file.endsWith('.csproj')
  );
  for (const project of dotnetProjects) {
    const source = await readText(join(repo, project));
    if (source)
      detected.csharp.push(
        ...[...source.matchAll(/<PackageReference\s+Include=["']([^"']+)/g)].map((match) => match[1])
      );
  }

  const status: Record<string, boolean> = {};
  for (const [packId, tools] of Object.entries(STACK_TOOL_CATALOG)) {
    for (const [name, definition] of Object.entries(tools)) {
      status[stackToolKey(packId, name)] = isStackToolInstalled(definition, detected[packId] ?? []);
    }
  }
  return status;
}

function nodePackageArguments(
  manager: NodePackageManager,
  action: StackToolAction,
  definition: StackToolDefinition
): string[] {
  if (action === 'uninstall') return ['remove', ...definition.packages];
  const add = manager === 'npm' ? 'install' : 'add';
  const development = definition.development
    ? [manager === 'yarn' || manager === 'bun' ? '--dev' : '--save-dev']
    : [];
  return [add, ...development, ...definition.packages];
}

async function detectNodePackageManager(repo: string): Promise<NodePackageManager> {
  const packageJson = await readText(join(repo, 'package.json'));
  if (packageJson) {
    try {
      const declared = (JSON.parse(packageJson) as { packageManager?: string }).packageManager
        ?.split('@')[0]
        .trim();
      if (declared === 'npm' || declared === 'pnpm' || declared === 'yarn' || declared === 'bun')
        return declared;
    } catch {}
  }
  if (await fileExists(join(repo, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(join(repo, 'yarn.lock'))) return 'yarn';
  if ((await fileExists(join(repo, 'bun.lock'))) || (await fileExists(join(repo, 'bun.lockb'))))
    return 'bun';
  return 'npm';
}

async function findPythonLauncher(
  repo: string,
  platform: NodeJS.Platform
): Promise<{ command: string; args: string[] }> {
  const candidates = platform === 'win32'
    ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }]
    : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];
  for (const candidate of candidates) {
    const args = [...candidate.args, '--version'];
    const probe = await runProcess(repo, {
      command: candidate.command,
      args,
      display: formatCommand(candidate.command, args),
    }, 10_000);
    if (probe.code === 0) return candidate;
  }
  throw new Error('Python 3 is required to create the project .venv');
}

function virtualEnvironmentPython(repo: string, platform: NodeJS.Platform): string {
  return platform === 'win32'
    ? win32.join(repo, '.venv', 'Scripts', 'python.exe')
    : posix.join(repo, '.venv', 'bin', 'python');
}

async function pythonPackagesFromVirtualEnvironment(
  repo: string,
  platform: NodeJS.Platform
): Promise<string[]> {
  const pathApi = platform === 'win32' ? win32 : posix;
  const sitePackages: string[] = [];
  if (platform === 'win32') {
    sitePackages.push(pathApi.join(repo, '.venv', 'Lib', 'site-packages'));
  } else {
    for (const libraryDirectory of ['lib', 'lib64']) {
      const base = pathApi.join(repo, '.venv', libraryDirectory);
      const versions = await readdir(base, { withFileTypes: true }).catch(() => []);
      for (const version of versions) {
        if (version.isDirectory() && /^python\d/.test(version.name))
          sitePackages.push(pathApi.join(base, version.name, 'site-packages'));
      }
    }
  }
  const packages: string[] = [];
  for (const directory of sitePackages) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith('.dist-info')) continue;
      const metadata = await readText(pathApi.join(directory, entry.name, 'METADATA'));
      const name = metadata?.match(/^Name:\s*(.+)$/im)?.[1]?.trim();
      if (name) packages.push(name);
    }
  }
  return [...new Set(packages)];
}

async function singleDotnetProject(repo: string): Promise<string> {
  const projects = (await readdir(repo)).filter((file) => file.endsWith('.csproj'));
  if (projects.length === 0)
    throw new Error('Create a .csproj project before adding NuGet packages');
  if (projects.length > 1)
    throw new Error('Open a folder containing one .csproj file so Luma can choose safely');
  return projects[0];
}

async function requireFile(repo: string, name: string, message: string): Promise<void> {
  if (!(await fileExists(join(repo, name)))) throw new Error(message);
}

async function ensureVirtualEnvironmentIgnored(repo: string): Promise<void> {
  const path = join(repo, '.gitignore');
  const current = (await readText(path)) ?? '';
  if (/^\.venv\/?$/m.test(current)) return;
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  await writeFile(path, `${current}${separator}.venv/\n`, 'utf8');
}

async function fileExists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
}
async function readText(path: string): Promise<string | null> {
  return readFile(path, 'utf8').catch(() => null);
}

function runProcess(
  cwd: string,
  command: StackCommand,
  timeoutMs = 15 * 60_000
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const append = (chunk: unknown) => {
      output = `${output}${String(chunk)}`.slice(-50_000);
    };
    const child = spawn(command.command, command.args, {
      cwd,
      env: { ...process.env, CI: '1', NO_COLOR: '1' },
      shell: false,
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      finish({ code: -1, output: `${output}\nTimed out after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', (error) => finish({ code: -1, output: `${output}\n${error.message}` }));
    child.once('close', (code) => finish({ code: code ?? -1, output }));
  });
}

function relativeExecutable(path: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? win32.basename(path) : posix.basename(path);
}
function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteArgument).join(' ');
}
function quoteArgument(value: string): string {
  return /^[A-Za-z0-9_./:@+-]+$/.test(value) ? value : JSON.stringify(value);
}
