<div align="center">

<img src="build/icon.png" width="96" alt="Luma logo" />

# Luma

**A visual, Git-first IDE for Linux.**

Luma turns repository history and everyday Git operations into an interactive workspace. Inspect branches, stage changes, resolve conflicts, rewrite history, and recover previous states without leaving the editor.

![platform](https://img.shields.io/badge/platform-Linux%20·%20Arch-1793d1) ![license](https://img.shields.io/badge/license-MIT-22c55e) ![status](https://img.shields.io/badge/status-early%20development-f59e0b)

</div>

## Current features

- **Visual commit graph** — inspect branch lanes, merge paths, commit metadata, and diffs.
- **Visual staging** — drag files between the working tree and commit container, then commit or amend.
- **Diff and conflict tools** — review additions and deletions, navigate hunks, and resolve ours/theirs conflicts visually.
- **Interactive rebase** — reorder, squash, fixup, reword, edit, or drop commits; continue or abort an interrupted rebase.
- **Branch operations** — create, checkout, delete, merge with default/`--no-ff`/`--ff-only` strategies, rebase, cherry-pick, revert, and manage tags.
- **Detective mode** — guided `git bisect` with clear Works/Broken decisions.
- **Recovery tools** — stash management, reflog timeline, and soft/hard rewind actions with confirmation.
- **Integrated workspace** — file explorer, CodeMirror 6 editor, tabs, command palette, terminal, file history, and theme settings.
- **Transparent Git execution** — the Commands panel shows the equivalent `git` command for each action.

> Luma is under active development. Use it on repositories with a clean working tree and a remote backup while testing destructive Git operations.

## Install

### Development build from `main`

```sh
git clone https://github.com/drainedgodw/Luma.git
cd Luma
npm ci
npm run dev
```

### Production build

```sh
npm ci
npm run typecheck
npm test
npm run dist
```

Generated Linux packages are written to `dist/`.

### Arch Linux

The repository contains packaging definitions for:

- `luma-git` — builds the latest `main` branch.
- `luma-bin` — installs a prebuilt tagged release.

Until the packages are published in AUR, install a GitHub Actions artifact or build from source. Tagged releases trigger the AppImage and AUR publishing workflow when the required repository secrets are configured.

### AppImage

Download an AppImage from [GitHub Releases](https://github.com/drainedgodw/Luma/releases), make it executable, and run it:

```sh
chmod +x luma-*.AppImage
./luma-*.AppImage --ozone-platform-hint=auto
```

## Project structure

```text
src/
  main/       Electron process, Git engine, terminal and filesystem services
  preload/    typed IPC bridge
  renderer/   React interface, editor and visual Git workflows
  shared/     shared types and commit graph layout

tests/        parser, graph and real-repository integration tests
.github/      CI, release and Arch packaging automation
```

Luma uses the system Git executable as its source of truth, preserving compatibility with existing repositories, hooks, credentials, and new Git features.

## Quality gates

Every push and pull request runs:

```sh
npm run typecheck
npm test
npm run build
```

Release tags additionally build Linux packages, checksums, and a GitHub Release.

## License

[MIT](LICENSE)
