<div align="center">

<img src="build/icon.png" width="96" alt="Luma logo" />

# Luma

**See what Git will do before it does it.**

A visual, Git-first desktop IDE for Linux, with a Windows edition maintained in a companion repository.

![platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-1793d1) ![license](https://img.shields.io/badge/license-MIT-22c55e) ![status](https://img.shields.io/badge/status-developer%20preview-f59e0b)

</div>

> [!WARNING]
> Luma 0.2 is a developer preview. Keep a remote backup and begin with non-critical repositories.

## Why Luma?

Most IDEs treat Git as a sidebar. Luma treats history as the workspace itself: inspect commits in a visual web, preview a rewrite before applying it, and keep a recovery point before moving `HEAD`.

## Install on Linux

The installer is Bash-only, but it is **fish-safe**: fish should download the file and hand it to Bash rather than trying to interpret Bash syntax itself.

```fish
curl --fail --location --show-error --progress-bar \
  https://raw.githubusercontent.com/drainedgodw/Luma/main/install.sh \
  --output /tmp/luma-install.sh
bash /tmp/luma-install.sh --install --auto
```

If you prefer a one-liner, run it through Bash explicitly:

```fish
bash -c 'curl --fail --location --show-error --progress-bar https://raw.githubusercontent.com/drainedgodw/Luma/main/install.sh | bash -s -- --install --auto'
```

The installer logs each phase, shows downloads, verifies SHA-256 checksums, and installs to `~/.local` without root. Use `LUMA_TRACE=1` for a command trace:

```fish
LUMA_TRACE=1 bash /tmp/luma-install.sh --install --auto
```

Actions and channels:

```text
--install / --update       install or atomically update
--uninstall                remove the application but keep settings
--purge                    remove the application and user data
--auto                     release -> nightly -> source fallback
--release                  require a signed/checksummed release AppImage
--nightly                  install the latest nightly AppImage
--source                   build the selected branch locally
```

The same command works on a fresh machine and on updates. For a source build, the installer invokes the self-contained bootstrap and can install missing native build tools with `--install-system-deps`.

### Supported Linux distributions

The portable dependency helper covers Arch/Manjaro (`pacman`), Debian/Ubuntu (`apt-get`), Fedora/RHEL (`dnf`/`yum`), openSUSE (`zypper`), Alpine (`apk`), Void (`xbps-install`), Gentoo (`emerge`), and Nix (`nix`). If a distribution is not detected, the script prints the exact packages it needs instead of failing silently.

The runtime itself is packaged as a FUSE-independent AppImage and currently targets Linux x86_64. ARM64 source builds are supported by the development bootstrap, but an ARM64 release artifact is not published yet.

## Fish / Caelestia troubleshooting

1. Do not run `curl ... | sh` from fish; use `bash /tmp/luma-install.sh` as shown above.
2. Make sure the file is executable only if you invoke it directly: `chmod +x /tmp/luma-install.sh`.
3. Run `bash /tmp/luma-install.sh --help` first. The output confirms that Bash is reading the script.
4. For a source build, run `bash scripts/install-system-deps.sh` and then `bash scripts/bootstrap.sh dev -- --verbose`.
5. If the desktop entry does not appear immediately, launch `~/.local/bin/luma` once, then restart the desktop shell.
6. Attach the complete `[Luma installer]` or `[Luma setup]` log to a bug report; the scripts intentionally print the phase and downloaded asset without printing credentials.

## From source

```sh
git clone https://github.com/drainedgodw/Luma.git
cd Luma
bash scripts/install-system-deps.sh
bash scripts/bootstrap.sh dev
```

The bootstrap downloads a compatible private Node 22 and CPython 3.11 for the `node-pty` native build into the ignored `.luma/` directory. It does not touch your system Node, Python, fish, Bash, or shell configuration. Use `LUMA_USE_SYSTEM_NODE=1` only when your system Node is already in the supported `>=22.20 <23` range.

Useful checks:

```sh
bash scripts/bootstrap.sh doctor
bash scripts/bootstrap.sh typecheck
bash scripts/bootstrap.sh test
bash scripts/bootstrap.sh --help
```

## Linux and Windows versions

The Linux and Windows editions are intended to ship the same Luma version and feature line. The companion repository is [luma-ide-windows](https://github.com/drainedgodw/luma-ide-windows). At the time of this update, both repositories declare version **0.2.0** in `package.json`; **0.4.1 is not yet present in the Windows repository**. Version bumps should be made in both repositories together once the 0.4.1 release is actually prepared.

The Windows edition bundles its runtime and Git. Linux uses the AppImage installer or the self-contained source bootstrap because Linux distributions differ in package managers, compilers, display servers, and FUSE availability.

## Features

- **History** — commit graph in two views: classic Lanes and an interactive Orbit web
- **Changes** — staging by drag & drop, diffs, conflict resolution, and commit templates
- **Visual rebase** — reorder, squash, fixup, reword, drop, cherry-pick, revert, tags, and merges
- **Safety net** — Secret Guard, checkpoint branches, reflog Rescue, bisect, and stash
- **Editor** — CodeMirror 6 with syntax highlighting, tabs, find & replace, and project search
- **Terminal** — integrated terminal unlocked per repository via Workspace Trust
- **GitHub** — fine-grained PAT or SSH keys, clone, fetch, pull, and push
- **Languages & Ecosystem** — detects runtimes and project dependencies
- **Updates** — anonymous version check with no accounts and no telemetry
- **Two themes** — Cosmos and Liquid Glass

## Keyboard

- Ctrl + `P` — quick open file
- Ctrl + `F` — find in editor / search workspace
- Ctrl + Shift + `F` — search across the project
- Ctrl + Shift + `P` — command palette
- Ctrl + `B` — pin/auto-hide Explorer
- Ctrl + `` ` `` — terminal

## Project structure

```text
src/main/       Electron process, Git, terminal, trust and filesystem services
src/preload/    typed and allowlisted IPC bridge
src/renderer/   React UI, editor and visual Git workflows
scripts/        portable bootstrap, dependency helper and install diagnostics
tests/          parser, Git integration, security and recovery tests
```

## Screenshots

The screenshots are intentionally presented as a compact contact sheet so the main flows can be compared at a glance.

<table>
<tr>
<td><img src="docs/screenshots/login.png" alt="Start" /></td>
<td><img src="docs/screenshots/code.png" alt="Code" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/changes.png" alt="Changes" /></td>
<td><img src="docs/screenshots/history_orbit.png" alt="History Orbit" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/GitHub.png" alt="GitHub" /></td>
<td><img src="docs/screenshots/Tools.png" alt="Tools" /></td>
</tr>
</table>

Additional views: [Lanes](docs/screenshots/history_lanes.png), [Rescue](docs/screenshots/rescue.png), [Stack](docs/screenshots/stack.png), and [Settings](docs/screenshots/setup.png).

## Showcase video

The showcase video belongs in `docs/showcase/luma-0.2.0-showcase-1440p.mp4` for local/release distribution. GitHub's file-writing connector cannot transfer a 54.6 MB binary attachment in the same operation as text files, so the repository currently documents the exact target path and metadata in [docs/showcase/README.md](docs/showcase/README.md). Upload the MP4 with Git LFS or a GitHub Release asset before publishing the public link.

## Reporting problems

- Security issue: follow [SECURITY.md](SECURITY.md); do not open a public exploit report.
- Bug or feature proposal: open a GitHub issue with OS, display server, Git version, reproduction steps, and logs with secrets removed.
- Contribution: read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
