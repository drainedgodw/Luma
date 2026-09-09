import { describe, expect, it } from 'vitest';
import { buildRuntimeCommands, runtimeRemovalDetail } from '../src/main/runtimeTools';
import type { LinuxPackageManager, RuntimeId } from '../src/shared/runtimeCatalog';

describe('Stack runtime actions', () => {
  it.each<RuntimeId>(['node', 'python', 'rust', 'go', 'java', 'dotnet', 'cpp'])('builds allowlisted Windows commands for %s', (id) => {
    const commands = buildRuntimeCommands(id, 'install', 'win32');
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(command.command).toBe('winget');
      expect(command.args).toContain('--exact');
      expect(command.args).toContain('--source');
      expect(command.args).not.toContain(id);
    }
  });
  it('removes multi-package runtimes in reverse order', () => {
    const commands = buildRuntimeCommands('java', 'uninstall', 'win32');
    expect(commands.map((item) => item.args[2])).toEqual(['Apache.Maven', 'EclipseAdoptium.Temurin.21.JDK']);
  });
  it.each<[LinuxPackageManager, string, string]>([
    ['apt', 'apt-get', 'install'], ['dnf', 'dnf', 'install'],
    ['pacman', 'pacman', '-S'], ['zypper', 'zypper', '--non-interactive'],
  ])('builds a fixed %s command behind pkexec', (linuxManager, executable, firstArgument) => {
    const command = buildRuntimeCommands('python', 'install', 'linux', { linuxManager, privilegeCommand: '/usr/bin/pkexec' })[0];
    expect(command.command).toBe('/usr/bin/pkexec');
    expect(command.args[0]).toBe(executable);
    expect(command.args[1]).toBe(firstArgument);
  });
  it('rejects renderer-controlled runtime text', () => {
    expect(() => buildRuntimeCommands('node && rm -rf /', 'install', 'linux', { linuxManager: 'apt' })).toThrow('Unknown runtime');
  });
  it('uses an explicit system-wide removal warning', () => {
    expect(runtimeRemovalDetail('cpp')).toContain('system-wide');
    expect(runtimeRemovalDetail('cpp')).toContain('other projects');
  });
});
