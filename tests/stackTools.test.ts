import { describe, expect, it } from 'vitest';
import { buildStackCommands, runStackToolAction, type NodePackageManager } from '../src/main/stackTools';
import { stackToolDefinition } from '../src/shared/stackCatalog';

function tool(packId: string, name: string) {
  const definition = stackToolDefinition(packId, name);
  if (!definition) throw new Error(`Missing test definition: ${packId}:${name}`);
  return definition;
}

describe('Stack package actions', () => {
  it('uses the Windows command processor for npm shims', () => {
    expect(buildStackCommands(tool('typescript', 'React'), 'install', 'win32', {
      comSpec: 'C:\\Windows\\System32\\cmd.exe', nodeManager: 'npm',
    })).toEqual([{
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'install', 'react', 'react-dom'],
      display: 'npm install react react-dom',
    }]);
  });
  it.each<[NodePackageManager, string[]]>([
    ['npm', ['remove', 'next']], ['pnpm', ['remove', 'next']],
    ['yarn', ['remove', 'next']], ['bun', ['remove', 'next']],
  ])('builds a reversible %s removal', (nodeManager, expectedArgs) => {
    expect(buildStackCommands(tool('typescript', 'Next.js'), 'uninstall', 'linux', { nodeManager })[0])
      .toMatchObject({ command: nodeManager, args: expectedArgs });
  });
  it('preserves development dependency intent', () => {
    expect(buildStackCommands(tool('typescript', 'Vitest'), 'install', 'linux', { nodeManager: 'pnpm' })[0].args)
      .toEqual(['add', '--save-dev', 'vitest']);
  });
  it('uses a project virtual environment for Python', () => {
    expect(buildStackCommands(tool('python', 'FastAPI'), 'uninstall', 'win32', {
      pythonExecutable: 'C:\\repo\\.venv\\Scripts\\python.exe',
    })[0]).toMatchObject({
      command: 'C:\\repo\\.venv\\Scripts\\python.exe',
      args: ['-m', 'pip', 'uninstall', '--yes', 'fastapi'],
    });
  });
  it('adds and removes Cargo crates without a shell', () => {
    expect(buildStackCommands(tool('rust', 'Tokio'), 'install', 'linux')[0])
      .toMatchObject({ command: 'cargo', args: ['add', 'tokio'] });
    expect(buildStackCommands(tool('rust', 'Tokio'), 'uninstall', 'linux')[0])
      .toMatchObject({ command: 'cargo', args: ['remove', 'tokio'] });
  });
  it('uses explicit Go module versions for both actions', () => {
    expect(buildStackCommands(tool('go', 'Gin'), 'install', 'linux')[0].args)
      .toEqual(['get', 'github.com/gin-gonic/gin@latest']);
    expect(buildStackCommands(tool('go', 'Gin'), 'uninstall', 'linux')[0].args)
      .toEqual(['get', 'github.com/gin-gonic/gin@none']);
  });
  it('targets the selected .NET project explicitly', () => {
    expect(buildStackCommands(tool('csharp', 'Serilog'), 'uninstall', 'win32', { projectFile: 'Sample.csproj' })[0])
      .toMatchObject({ command: 'dotnet', args: ['remove', 'Sample.csproj', 'package', 'Serilog'] });
  });
  it('rejects package names that are not in the shared catalog', async () => {
    await expect(runStackToolAction('/tmp/project', 'install', 'typescript', 'React && rm -rf /'))
      .rejects.toThrow('not an approved Stack package');
  });
  it('uses bun.exe rather than a nonexistent bun.cmd shim on Windows', () => {
    expect(buildStackCommands(tool('javascript', 'Vue'), 'install', 'win32', { nodeManager: 'bun' })[0].args)
      .toEqual(['/d', '/s', '/c', 'bun.exe', 'add', 'vue']);
  });
});
