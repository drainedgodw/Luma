import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  runtimeDefinition,
  type LinuxPackageManager,
  type RuntimeAction,
  type RuntimeActionResult,
  type RuntimeId,
} from '../shared/runtimeCatalog';

export interface RuntimeCommand { command: string; args: string[]; display: string }
export interface RuntimeCommandOptions {
  linuxManager?: LinuxPackageManager;
  privilegeCommand?: string | null;
}
interface ProcessResult { code: number; output: string }
const activeRuntimeActions = new Set<string>();

const LINUX_MANAGERS: Record<LinuxPackageManager, { command: string; install: string[]; uninstall: string[] }> = {
  apt: { command: 'apt-get', install: ['install', '-y'], uninstall: ['remove', '-y'] },
  dnf: { command: 'dnf', install: ['install', '-y'], uninstall: ['remove', '-y'] },
  pacman: { command: 'pacman', install: ['-S', '--needed', '--noconfirm'], uninstall: ['-Rns', '--noconfirm'] },
  zypper: { command: 'zypper', install: ['--non-interactive', 'install'], uninstall: ['--non-interactive', 'remove'] },
};

const MANAGER_PATHS: Array<[LinuxPackageManager, string[]]> = [
  ['apt', ['/usr/bin/apt-get', '/bin/apt-get']],
  ['dnf', ['/usr/bin/dnf', '/bin/dnf']],
  ['pacman', ['/usr/bin/pacman', '/bin/pacman']],
  ['zypper', ['/usr/bin/zypper', '/bin/zypper']],
];

export function buildRuntimeCommands(
  id: string,
  action: RuntimeAction,
  platform: NodeJS.Platform,
  options: RuntimeCommandOptions = {}
): RuntimeCommand[] {
  const definition = runtimeDefinition(id);
  if (!definition) throw new Error(`Unknown runtime: ${id}`);
  if (platform === 'win32') {
    const packageIds = action === 'uninstall'
      ? [...definition.windowsPackageIds].reverse()
      : definition.windowsPackageIds;
    return packageIds.map((packageId) => {
      const args = action === 'install'
        ? ['install', '--id', packageId, '--exact', '--source', 'winget', '--silent', '--accept-package-agreements', '--accept-source-agreements']
        : ['uninstall', '--id', packageId, '--exact', '--source', 'winget', '--silent', '--accept-source-agreements'];
      return { command: 'winget', args, display: formatCommand('winget', args) };
    });
  }
  if (platform !== 'linux') throw new Error(`Runtime setup is not supported on ${platform}`);
  if (!options.linuxManager) throw new Error('Linux package manager was not detected');
  const manager = LINUX_MANAGERS[options.linuxManager];
  const packages = definition.linuxPackages[options.linuxManager];
  const managerArgs = [...(action === 'install' ? manager.install : manager.uninstall), ...packages];
  if (options.privilegeCommand) {
    return [{
      command: options.privilegeCommand,
      args: [manager.command, ...managerArgs],
      display: formatCommand(basename(options.privilegeCommand), [manager.command, ...managerArgs]),
    }];
  }
  return [{ command: manager.command, args: managerArgs, display: formatCommand(manager.command, managerArgs) }];
}

export async function runRuntimeAction(
  repo: string,
  action: RuntimeAction,
  id: string,
  platform: NodeJS.Platform = process.platform
): Promise<RuntimeActionResult> {
  const definition = runtimeDefinition(id);
  if (!definition) throw new Error(`“${id}” is not an approved Stack runtime`);
  const operationKey = platform === 'win32' ? 'windows-runtime' : 'linux-runtime';
  if (activeRuntimeActions.has(operationKey)) throw new Error('Another runtime action is already running');
  activeRuntimeActions.add(operationKey);
  try {
    const options: RuntimeCommandOptions = {};
    if (platform === 'linux') {
      options.linuxManager = await detectLinuxPackageManager();
      if (!isRoot()) options.privilegeCommand = await detectPrivilegeBroker();
    }
    const commands = buildRuntimeCommands(id, action, platform, options);
    let output = '';
    for (const command of commands) {
      const result = await runProcess(repo, command);
      output += `$ ${command.display}\n${result.output.trim()}\n`;
      if (result.code !== 0) {
        return {
          ok: false, action,
          command: commands.map((item) => item.display).join('\n'),
          output: output.trim().slice(-16000),
          restartRequired: false,
        };
      }
    }
    output += `\n${definition.label} ${action === 'install' ? 'installation' : 'removal'} completed. Restart Luma so it can refresh the system PATH.`;
    return {
      ok: true, action,
      command: commands.map((item) => item.display).join('\n'),
      output: output.trim().slice(-16000),
      restartRequired: true,
    };
  } finally {
    activeRuntimeActions.delete(operationKey);
  }
}

export async function detectLinuxPackageManager(): Promise<LinuxPackageManager> {
  for (const [manager, paths] of MANAGER_PATHS) {
    for (const path of paths) if (await fileExists(path)) return manager;
  }
  throw new Error('Supported package manager not found (apt, dnf, pacman or zypper required)');
}

export function runtimeRemovalDetail(id: RuntimeId): string {
  const definition = runtimeDefinition(id)!;
  return `This removes ${definition.label} system-wide and can break other projects. Luma cannot restore another project's toolchain. The fixed package-manager command will be shown after it runs.`;
}

function isRoot(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}
async function detectPrivilegeBroker(): Promise<string> {
  for (const path of ['/usr/bin/pkexec', '/bin/pkexec']) if (await fileExists(path)) return path;
  throw new Error('pkexec is required to authorize system package changes on Linux');
}
async function fileExists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
}

function runProcess(cwd: string, command: RuntimeCommand, timeoutMs = 30 * 60_000): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const append = (chunk: unknown) => { output = `${output}${String(chunk)}`.slice(-60_000); };
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

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map((value) => /^[A-Za-z0-9_./:@+-]+$/.test(value) ? value : JSON.stringify(value)).join(' ');
}
