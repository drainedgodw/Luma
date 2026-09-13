<div align="center">

<img src="build/icon.png" width="96" alt="Luma logo" />

# Luma

**Make every Git move visible before it matters.**

A visual, Git-first desktop IDE for Linux, with a Windows edition maintained in a companion repository.

![platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-1793d1) ![license](https://img.shields.io/badge/license-MIT-22c55e) ![status](https://img.shields.io/badge/status-developer%20preview-f59e0b)

</div>

> [!WARNING]
> Luma is a developer preview. Keep a remote backup and begin with non-critical repositories.

## Preview

<video controls width="100%" poster="docs/screenshots/login.png">
  <source src="https://media.githubusercontent.com/media/drainedgodw/luma-ide-linux/main/docs/showcase/luma-0.2.0-showcase-1440p.mp4" type="video/mp4" />
</video>

[Open or download the 48-second 1440p showcase video](https://media.githubusercontent.com/media/drainedgodw/luma-ide-linux/main/docs/showcase/luma-0.2.0-showcase-1440p.mp4)

### Screenshots — Linux and Windows editions

<table>
<tr>
<td><img src="docs/screenshots/login.png" alt="Luma start screen" /></td>
<td><img src="docs/screenshots/code.png" alt="Luma code editor" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/changes.png" alt="Luma changes view" /></td>
<td><img src="docs/screenshots/history_orbit.png" alt="Luma history view" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/GitHub.png" alt="Luma GitHub integration" /></td>
<td><img src="docs/screenshots/Tools.png" alt="Luma tools view" /></td>
</tr>
</table>

The same interface and preview assets are used by the companion Windows edition.

## Install on Linux — Bash, x86_64

One command downloads the Bash installer, verifies the release checksum, installs the AppImage under `~/.local`, creates the launcher and adds Luma to the application menu:

```bash
curl --fail --location --show-error --progress-bar \
  https://raw.githubusercontent.com/drainedgodw/luma-ide-linux/main/install.sh \
  | bash -s -- --install --release
```

The command is safe to paste from fish because fish only starts `curl`; Bash reads and executes the installer. To use release → nightly → source fallback instead:

```bash
curl --fail --location --show-error --progress-bar \
  https://raw.githubusercontent.com/drainedgodw/luma-ide-linux/main/install.sh \
  | LUMA_CHANNEL=auto bash -s -- --install
```

The current published Linux release is **v0.2.0**. There is no published v0.4.1 artifact yet, so an installer cannot download v0.4.1 until the matching AppImage, checksums and GitHub Release are created.

Uninstall while keeping settings:

```bash
curl -fsSL https://raw.githubusercontent.com/drainedgodw/luma-ide-linux/main/install.sh \
  | bash -s -- --uninstall
```

## Build from source

```bash
git clone https://github.com/drainedgodw/luma-ide-linux.git
cd luma-ide-linux
bash scripts/install-system-deps.sh
bash scripts/bootstrap.sh dev
```

The dependency helper supports Arch/Manjaro, Debian/Ubuntu, Fedora/RHEL, openSUSE, Alpine, Void, Gentoo and Nix. The bootstrap keeps compatible Node 22 and CPython 3.11 inside `.luma/` and does not modify your system shell.

## Windows edition

See [luma-ide-windows](https://github.com/drainedgodw/luma-ide-windows) for the self-contained Windows x64 installer. The Windows repository currently also declares source version **0.2.0**; v0.4.1 is not published there yet.

## License

[MIT](LICENSE)
