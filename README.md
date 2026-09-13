<div align="center">

<img src="build/icon.png" width="96" alt="Luma logo" />

# Luma

**Make every Git move visible before it matters.**

A visual, Git-first desktop IDE for Linux, with a Windows edition maintained in a companion repository.

![platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-1793d1) ![license](https://img.shields.io/badge/license-MIT-22c55e) ![status](https://img.shields.io/badge/status-stable%20release%20line-22c55e)

</div>

> [!WARNING]
> Luma 0.4.1 is the new Linux release target. Keep a remote backup and begin with non-critical repositories until the first Linux 0.4.1 artifact finishes validation.

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

## Install on Linux — Bash, x86_64

Once the `v0.4.1` Linux Release is published, this one command downloads the current stable AppImage, verifies its checksum, installs it under `~/.local`, creates the launcher and adds Luma to the application menu:

```bash
curl --fail --location --show-error --progress-bar \
  https://raw.githubusercontent.com/drainedgodw/luma-ide-linux/main/install.sh \
  | bash -s -- --install --release
```

The command is Bash-first and safe to paste from fish. The current Linux release workflow is ready; pushing tag `v0.4.1` starts the GitHub Actions build and publishes the AppImage, tarball and `SHA256SUMS.txt`.

## Build from source

```bash
git clone https://github.com/drainedgodw/luma-ide-linux.git
cd luma-ide-linux
bash scripts/install-system-deps.sh
bash scripts/bootstrap.sh dev
```

The dependency helper supports Arch/Manjaro, Debian/Ubuntu, Fedora/RHEL, openSUSE, Alpine, Void, Gentoo and Nix. The bootstrap keeps compatible Node 22 and CPython 3.11 inside `.luma/`.

## Windows edition

See [luma-ide-windows](https://github.com/drainedgodw/luma-ide-windows) for the stable Windows 10/11 x64 `v0.4.1` installer. Linux and Windows now share the 0.4.1 release line; their platform artifacts remain separate.

## License

[MIT](LICENSE)
