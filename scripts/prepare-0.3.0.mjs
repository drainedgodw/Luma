import fs from 'node:fs';

const version = '0.3.0';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content);
const replaceOnce = (text, oldText, newText, label) => {
  const first = text.indexOf(oldText);
  if (first < 0 || text.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Expected one ${label}`);
  }
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
};

for (const filename of ['package.json', 'package-lock.json', 'update.json']) {
  const data = JSON.parse(read(filename));
  data.version = version;
  if (filename === 'package-lock.json') data.packages[''].version = version;
  write(filename, `${JSON.stringify(data, null, 2)}\n`);
}

const settingsPath = 'src/renderer/src/views/SettingsView.tsx';
write(
  settingsPath,
  replaceOnce(
    read(settingsPath),
    'Version 0.2.0 · MIT license',
    'Version 0.3.0 · MIT license',
    'Settings version label'
  )
);

const changelogPath = 'CHANGELOG.md';
let changelog = read(changelogPath);
const heading = '## [0.3.0] - 2026-09-08';
if (!changelog.includes(heading)) {
  const marker = '## [0.2.0] - 2026-09-06';
  const entry = `## [0.3.0] - 2026-09-08

### Fixed

- Rebuilt Languages & Ecosystem (Stack) so supported dependencies have one-click install and remove actions.
- Added installed-state refresh, removal confirmation and visible command output on Linux and Windows.
- Made package-manager execution platform-aware for npm, pnpm, Yarn, Bun, Python, Cargo, Go and .NET.

### Security

- Require Workspace Trust for Stack mutations and accept only shared-catalog package identifiers.
- Prevent renderer input from becoming a shell command and avoid executing repository-local Python during status detection.

### Known limitations

- Java and C/C++ entries remain manual until a deterministic manifest mutation path is available.

`;
  changelog = replaceOnce(changelog, marker, entry + marker, '0.2.0 changelog marker');
  write(changelogPath, changelog);
}

const readmePath = 'README.md';
let readme = read(readmePath);
readme = replaceOnce(
  readme,
  'Luma 0.2 is a developer preview.',
  'Luma 0.3 is a developer preview.',
  'preview version statement'
);
if (!readme.includes('Luma-0.2.0.AppImage')) throw new Error('Missing 0.2.0 AppImage names');
readme = readme.replaceAll('Luma-0.2.0.AppImage', 'Luma-0.3.0.AppImage');
readme = replaceOnce(
  readme,
  'This install runs 0.2.0.',
  'This install runs 0.3.0.',
  'Settings screenshot version'
);
readme = replaceOnce(
  readme,
  '- **Languages & Ecosystem** — detects runtimes and project dependencies, installs packages and frameworks with a whitelisted command set',
  '- **Languages & Ecosystem** — detects project dependencies and provides one-click install and remove actions through an allowlisted, Workspace Trust-protected command set',
  'Languages & Ecosystem feature'
);
write(readmePath, readme);
