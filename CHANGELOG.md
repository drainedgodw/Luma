# Changelog

All notable changes are documented here. Luma follows semantic versioning once stable; `0.x` releases may change behavior between prereleases.

## [0.1.1] - 2026-09-01

### Added

- Anonymous update check against a plain `update.json` file (no accounts, no telemetry); the app offers an update only when a newer release exists, and Settings can reinstall to the latest main build.
- Unit tests for the graph lane layout.
- Release and nightly artifacts are signed with keyless cosign; `install.sh` verifies the signature when cosign is available.
- `install.sh --nightly` installs the rolling build of the latest main commit.

### Changed

- Simpler graph lane assignment.
- Bisect view tracks good/bad marks per commit.
- Release workflow builds through the bootstrap like CI does.

## [0.1.0] - 2026-09-01

### Added

- Lanes history view and the Orbit web with pan and zoom.
- Visual staging, commit diffs, branch operations, rebase, bisect and Rescue.
- GitHub PAT/SSH repository access.
- Workspace Trust, Tasks/Test Center, local Risk Map, Operation Preview and Secret Guard.
- Session Capsules and rollback checkpoints.

### Changed

- Orbit is now a flat Obsidian-style commit web instead of a 3D constellation.

### Build tooling

- The bootstrap downloads a private standalone CPython 3.11 toolchain into `.luma/` whenever the system Python lacks `distutils` (removed in Python 3.12), fixing the `node-pty` native build on current Arch, Fedora and similar distributions without touching the system Python.

### Security and release hardening

- Documented Workspace Trust and Git hook limitations.
- Defined experimental maturity labels for preview, Risk Map, language tools and Capsules.
- Added AppImage extraction and credential guidance.

### Known limitations

- Language Intelligence is not protocol-based LSP.
- Risk Map reflects local test results rather than GitHub CI.
- Capsules do not restore live PTY processes.
- Linux AppImage is the only supported binary format in the first prerelease.
