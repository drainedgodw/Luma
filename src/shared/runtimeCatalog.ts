export type RuntimeAction = 'install' | 'uninstall';
export type RuntimeId = 'node' | 'python' | 'rust' | 'go' | 'java' | 'dotnet' | 'cpp';
export type LinuxPackageManager = 'apt' | 'dnf' | 'pacman' | 'zypper';

export interface RuntimeDefinition {
  id: RuntimeId;
  label: string;
  windowsPackageIds: string[];
  linuxPackages: Record<LinuxPackageManager, string[]>;
}

export interface RuntimeActionResult {
  ok: boolean;
  action: RuntimeAction;
  command: string;
  output: string;
  restartRequired: boolean;
}

export const RUNTIME_CATALOG: Record<RuntimeId, RuntimeDefinition> = {
  node: {
    id: 'node', label: 'Node.js LTS', windowsPackageIds: ['OpenJS.NodeJS.LTS'],
    linuxPackages: { apt: ['nodejs', 'npm'], dnf: ['nodejs', 'npm'], pacman: ['nodejs', 'npm'], zypper: ['nodejs', 'npm'] },
  },
  python: {
    id: 'python', label: 'Python 3.12', windowsPackageIds: ['Python.Python.3.12'],
    linuxPackages: { apt: ['python3', 'python3-venv', 'python3-pip'], dnf: ['python3', 'python3-pip'], pacman: ['python', 'python-pip'], zypper: ['python3', 'python3-pip'] },
  },
  rust: {
    id: 'rust', label: 'Rust toolchain', windowsPackageIds: ['Rustlang.Rustup'],
    linuxPackages: { apt: ['rustc', 'cargo'], dnf: ['rust', 'cargo'], pacman: ['rust'], zypper: ['rust', 'cargo'] },
  },
  go: {
    id: 'go', label: 'Go toolchain', windowsPackageIds: ['GoLang.Go'],
    linuxPackages: { apt: ['golang-go'], dnf: ['golang'], pacman: ['go'], zypper: ['go'] },
  },
  java: {
    id: 'java', label: 'Java 21 + Maven', windowsPackageIds: ['EclipseAdoptium.Temurin.21.JDK', 'Apache.Maven'],
    linuxPackages: { apt: ['openjdk-21-jdk', 'maven'], dnf: ['java-21-openjdk-devel', 'maven'], pacman: ['jdk21-openjdk', 'maven'], zypper: ['java-21-openjdk-devel', 'maven'] },
  },
  dotnet: {
    id: 'dotnet', label: '.NET 8 SDK', windowsPackageIds: ['Microsoft.DotNet.SDK.8'],
    linuxPackages: { apt: ['dotnet-sdk-8.0'], dnf: ['dotnet-sdk-8.0'], pacman: ['dotnet-sdk-8.0'], zypper: ['dotnet-sdk-8.0'] },
  },
  cpp: {
    id: 'cpp', label: 'C/C++ toolchain', windowsPackageIds: ['LLVM.LLVM', 'Kitware.CMake'],
    linuxPackages: { apt: ['build-essential', 'cmake', 'ninja-build'], dnf: ['gcc-c++', 'cmake', 'ninja-build'], pacman: ['base-devel', 'cmake', 'ninja'], zypper: ['gcc-c++', 'cmake', 'ninja'] },
  },
};

export function runtimeDefinition(id: string): RuntimeDefinition | undefined {
  return RUNTIME_CATALOG[id as RuntimeId];
}

export function runtimeKey(id: string): string {
  return `runtime:${id}`;
}
