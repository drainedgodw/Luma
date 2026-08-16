<div align="center">

<img src="build/icon.png" width="96" alt="Luma logo" />

# Luma

**See your Git. No commands required.**

Luma is an open-source, Git-first IDE for Linux (Arch first, everyone else next). It renders your entire repository history as a living graph, turns staging into drag & drop, and teaches Git by showing the command behind every click — instead of asking you to memorize one.

![status](https://img.shields.io/badge/platform-Linux%20·%20Arch-informational) ![license](https://img.shields.io/badge/license-MIT-success)

</div>

## Highlights

- **Obsidian-style commit graph** — root commit, glowing branch lanes, merge curves. Click any commit for its full diff.
- **Drag-and-drop staging** — pull files between *Working tree* and the *Commit container*; type a message; commit. Unstage by dragging back out.
- **Visual diff** — green adds, red removes, per-hunk navigation.
- **Visual conflict resolution** — side-by-side ours/theirs with *Keep ours / Take theirs / Keep both* per region.
- **Detective mode** — a guided `git bisect`: Luma checks out suspects, you answer *Works* / *Broken*, it halves the search.
- **Rebase, visualized** — start a rebase onto any branch, continue or abort, all from the graph toolbar.
- **Honest by design** — a Commands panel shows every `git …` invocation Luma runs on your behalf.
- **Command palette** (`Ctrl+Shift+P`) — every action of the IDE, from the keyboard.
- **Built-in terminal** (`Ctrl+\``) — a real shell, in the repo directory, one keystroke away.
- **Stash drawer** — stashes as cards with +/− stats; apply, pop or drop in one click.
- **Rescue panel** — the full reflog as a timeline: jump back to any moment, soft or hard, with confirmation.
- **Light shell** — Electron with a single-digit-MB renderer, Tailwind 4, CodeMirror 6 editor, glassmorphism kept GPU-cheap.

## Install

### Arch Linux (AUR)

```sh
yay -S luma-bin   # prebuilt release
# or
yay -S luma-git   # builds from main
```

### Any Linux

Grab the `.AppImage` from [releases](https://github.com/drainedgodw/Luma/releases) and run it:

```sh
./luma-<version>.AppImage --ozone-platform-hint=auto
```

### From source

```sh
npm ci
npm run dev     # develop
npm test        # run the test suite against real git repos
npm run dist    # build AppImage + tar.gz
```

## Architecture

```
src/
  main/       Electron main process — Git engine (CLI wrapper, real git, no lock-in)
  preload/    context-bridge IPC
  renderer/   React 19 + Tailwind 4 UI (graph view, changes view, editor)
  shared/     types + graph layout algorithm (shared with tests)
```

The Git engine shells out to the **system git** — every feature, full parity, zero vendored copies. Parsing is unit-tested against real repositories created on the fly.

## Development

- `npm run typecheck` — strict TypeScript, zero errors required
- `npm test` — vitest suite (parsers, graph layout, bisect/merge/commit round-trips)
- CI runs on every push: typecheck → tests → build → artifact

## License

MIT
