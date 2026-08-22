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
- A POSIX shell for the integrated terminal
- FUSE 2 for direct AppImage launch, or use extraction mode below

The AppImage does **not** require Node.js or npm.

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

### Development build without managing Node

The supported source workflow downloads a private, compatible Node 22 toolchain into the ignored `.luma/` directory. It does not replace your system Node, edit shell configuration, or require nvm/fnm/Volta. Fish users run the same command as Bash users:

```sh
git clone https://github.com/drainedgodw/Luma.git
cd Luma
bash scripts/bootstrap.sh dev
```

On the first run, the bootstrap:

1. detects Linux/macOS and CPU architecture;
2. downloads the latest compatible Node 22 archive from nodejs.org;
3. verifies it against the official SHA-256 manifest;
4. installs `package-lock.json` with lifecycle scripts disabled;
5. runs only the reviewed `electron`, `esbuild` and `node-pty` installers;
6. rebuilds `node-pty` for Electron and checks the result before launch.

It also ignores inherited `ELECTRON_SKIP_BINARY_DOWNLOAD` and npm `ignore-scripts` settings for this run, so a global npm/Fish configuration cannot silently leave Electron uninstalled. No file in `node_modules` should be downloaded or edited manually.

Useful commands:

```sh
bash scripts/bootstrap.sh setup       # prepare only
bash scripts/bootstrap.sh doctor      # check runtime dependencies
bash scripts/bootstrap.sh typecheck
bash scripts/bootstrap.sh test
bash scripts/bootstrap.sh ci          # typecheck + tests + production build
bash scripts/bootstrap.sh dist        # build Linux packages
bash scripts/bootstrap.sh clean       # keep the private Node download
bash scripts/bootstrap.sh purge       # remove all generated files and private Node
```

If Git, Python 3, make, or a C++ compiler is missing, the script prints the exact distro command and can install it after confirmation. For a non-interactive one-shot setup on pacman/apt/dnf/zypper/apk systems:

```sh
bash scripts/bootstrap.sh dev --install-system-deps
```

To repair a partial installation:

```sh
bash scripts/bootstrap.sh setup --force
```

Advanced contributors can deliberately use an existing compatible Node by setting `LUMA_USE_SYSTEM_NODE=1`; the script refuses an incompatible version instead of producing a late Electron error.

### Production package

```sh
bash scripts/bootstrap.sh ci
bash scripts/bootstrap.sh dist
```

Packages are written to `dist/`.

## First-run safety model

Opening a repository does not automatically trust its code. Until **Trust repository** is selected in Intelligence Center, Luma blocks repository Tasks and the integrated terminal. Trust does not make unknown code safe: Git hooks and commands can still have side effects, so inspect unfamiliar repositories before executing operations.

Every soft/hard rollback creates a checkpoint branch. Undo can still alter the working tree; Luma checks for local modifications before restoring and offers to stash them.

## GitHub credentials

For HTTPS access, use a **fine-grained personal access token** limited to only the repositories and permissions needed. Luma encrypts it with Electron `safeStorage`, stores the encrypted file with mode `0600`, and passes the decrypted value only to authenticated child Git processes through `GIT_ASKPASS`. You can sign out from the GitHub panel at any time. Existing SSH keys can be used instead. OAuth Device Flow is planned but is not part of 0.1.

Never paste a token into an issue, screenshot, terminal recording, or chat.

## Keyboard and Orbit

- Orbit: drag rotates left/right and tilts up/down, Shift-drag or right-drag pans, wheel zooms, `Fit` resets the view
- Ctrl/Cmd + `P`: quick open file
- Ctrl/Cmd + `F`: find in file (editor) / search workspace
- Ctrl/Cmd + Shift + `F`: search text across the project
- Ctrl/Cmd + Shift + `P`: command palette
- Ctrl/Cmd + `B`: pin/auto-hide Explorer
- Ctrl/Cmd + `` ` ``: terminal

A full walkthrough of every section lives in [docs/USERGUIDE.md](docs/USERGUIDE.md).

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
