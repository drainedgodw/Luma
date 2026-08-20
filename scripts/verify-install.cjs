const fs = require('node:fs');

const failures = [];
const warnings = [];
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);

if (nodeMajor !== 22) {
  warnings.push(`Node ${process.versions.node} detected; Luma source builds are tested with Node 22.`);
}

try {
  const electronPath = require('electron');
  if (typeof electronPath !== 'string' || !fs.existsSync(electronPath)) {
    failures.push('Electron executable was not installed');
  }
} catch (error) {
  failures.push(`Electron is unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const esbuild = require('esbuild');
  if (!esbuild.version) failures.push('esbuild did not expose a version');
} catch (error) {
  failures.push(`esbuild is unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const pty = require('node-pty');
  if (typeof pty.spawn !== 'function') failures.push('node-pty did not expose spawn()');
} catch (error) {
  failures.push(`node-pty is unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

for (const warning of warnings) {
  console.warn(`[Luma install] Warning: ${warning}`);
}

if (failures.length > 0) {
  console.error('\n[Luma install] Required runtime dependencies are incomplete:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`
Use Node 22 and make sure ELECTRON_SKIP_BINARY_DOWNLOAD is not set.
With npm 12, Luma's reviewed install-script allowlist should run automatically.
If this checkout predates that allowlist, update it first and reinstall:

  git pull --ff-only
  rm -rf node_modules
  npm ci

Do not download or edit files inside node_modules manually.
`);
  process.exit(1);
}

console.log('[Luma install] Electron, esbuild and node-pty are ready.');
