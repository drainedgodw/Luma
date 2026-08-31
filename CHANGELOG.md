# Changelog

All notable changes are documented here. Luma follows semantic versioning once stable; `0.x` releases may change behavior between prereleases.

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
