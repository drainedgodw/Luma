<div align="center">

<img src="build/icon.png" width="96" alt="Luma logo" />

# Luma

**See what Git will do before it does it.**

A Linux-first visual Git workspace built around understandable history, previewable operations, and recovery from mistakes.

![platform](https://img.shields.io/badge/platform-Linux-1793d1) ![license](https://img.shields.io/badge/license-MIT-22c55e) ![status](https://img.shields.io/badge/status-developer%20preview-f59e0b)

</div>

> [!WARNING]
> Luma 0.1 is a developer preview, not a stable release. Keep a remote backup and begin with non-critical repositories. Experimental features are labelled below.

## Why Luma?

Most IDEs treat Git as a sidebar. Luma treats repository history as the workspace itself: inspect a commit in Orbit, understand its diff and risk, preview a rewrite, and retain a recovery point before moving HEAD.

The first release focuses on three promises:

1. **Understand history visually.**
2. **Preview dangerous operations before applying them.**
3. **Recover when something goes wrong.**

## Feature maturity

| Area | Status | Notes |
| --- | --- | --- |
| History, commit graph and diffs | Beta | Lanes and Orbit views |
| Staging and commits | Beta | Secret Guard scans staged additions before commit |
| Branches, stash, bisect and reflog | Beta | Uses the system Git executable |
| Rebase/reset/merge preview | Experimental | Preview quality depends on the operation; review the output |
| Rollback checkpoints | Experimental | Reset creates `luma-before-rollback-*`; dirty state still matters |
| GitHub PAT, clone, fetch, pull and push | Experimental | Fine-grained PAT or existing SSH keys |
| Workspace Trust and Tasks | Experimental | Tasks and integrated terminal require explicit trust |
| Risk Map | Experimental | Local churn and local test results, not GitHub CI status yet |
| Language Intelligence | Prototype | Editor autocomplete plus basic delimiter checks and textual symbol search |
| Project-wide replacement | Prototype | Textual replacement, not semantic LSP rename; review the diff |
| Session Capsules | Prototype | Tabs, note, branch metadata and terminal open/closed state; PTY processes are not restored |

## Install

### Requirements

- Linux x86_64 (Wayland or X11)
- Git
- Node.js 22 and npm when building from source
- A POSIX shell for the integrated terminal
- FUSE 2 for direct AppImage launch, or use extraction mode below

### AppImage

Download the latest **prerelease** from [GitHub Releases](https://github.com/drainedgodw/Luma/releases). Verify the published SHA-256 checksum, then:

```sh
chmod +x Luma-*.AppImage
./Luma-*.AppImage --ozone-platform-hint=auto
```

If FUSE is unavailable:

```sh
./Luma-*.AppImage --appimage-extract
./squashfs-root/luma --ozone-platform-hint=auto
```

If Electron sandboxing is unavailable on the system, use `--no-sandbox` only as a temporary troubleshooting measure and understand the reduced isolation.

### Development build

Use Node 22 (the `.nvmrc` file is included), then:

```sh
git clone https://github.com/drainedgodw/Luma.git
cd Luma
nvm use
npm ci
npm run doctor
npm run typecheck
npm test
npm run dev
```

Luma commits a version-pinned npm install-script allowlist for `electron`, `esbuild` and `node-pty`. npm 12 should therefore install the reviewed binaries automatically instead of silently skipping them. `npm ci` also runs a dependency doctor and stops with an actionable error if a required binary is missing. Do not manually download or edit files in `node_modules`.

### Production package

```sh
npm ci
npm run typecheck
npm test
npm run dist
```

Packages are written to `dist/`.

## First-run safety model

Opening a repository does not automatically trust its code. Until **Trust repository** is selected in Intelligence Center, Luma blocks repository Tasks and the integrated terminal. Trust does not make unknown code safe: Git hooks and commands can still have side effects, so inspect unfamiliar repositories before executing operations.

Every soft/hard rollback creates a checkpoint branch. Undo can still alter the working tree; Luma checks for local modifications before restoring and offers to stash them.

## GitHub credentials

For HTTPS access, use a **fine-grained personal access token** limited to only the repositories and permissions needed. Luma encrypts it with Electron `safeStorage`, stores the encrypted file with mode `0600`, and passes the decrypted value only to authenticated child Git processes through `GIT_ASKPASS`. You can sign out from the GitHub panel at any time. Existing SSH keys can be used instead. OAuth Device Flow is planned but is not part of 0.1.

Never paste a token into an issue, screenshot, terminal recording, or chat.

## Keyboard and Orbit

- Trackpad/wheel: pan
- Ctrl/Cmd + wheel or pinch: zoom
- Drag: pan
- Arrow keys or WASD: move
- Shift: faster movement
- `+` / `-`: zoom
- `0`: reset view
- Ctrl/Cmd + `` ` ``: terminal
- Ctrl/Cmd + Shift + `P`: command palette

## Project structure

```text
src/main/       Electron process, Git, terminal, trust and filesystem services
src/preload/    typed and allowlisted IPC bridge
src/renderer/   React UI, editor and visual Git workflows
src/shared/     shared types and graph layout
tests/          parser, Git integration, security and recovery tests
```

## Reporting problems

- Security issue: follow [SECURITY.md](SECURITY.md); do not open a public exploit report.
- Bug or feature proposal: open a GitHub issue with OS, display server, Git version, reproduction steps and logs with secrets removed.
- Contribution: read [CONTRIBUTING.md](CONTRIBUTING.md).
- Changes: see [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
