# Changelog

All notable changes are documented here. Luma follows semantic versioning once stable; `0.x` releases may change behavior between prereleases.

## [Unreleased]

### Security and release hardening

- Documented Workspace Trust and Git hook limitations.
- Defined experimental maturity labels for preview, Risk Map, language tools and Capsules.
- Added AppImage extraction and credential guidance.

### Build tooling

- The bootstrap now downloads a private standalone CPython 3.11 toolchain into `.luma/` whenever the system Python lacks `distutils` (removed in Python 3.12), fixing the `node-pty` native build on current Arch, Fedora and similar distributions without touching the system Python.

## [0.1.0-alpha.1] - Planned

### Added

- Lanes and Orbit history views with pan and zoom.
- Visual staging, commit diffs, branch operations, rebase, bisect and Rescue.
- GitHub PAT/SSH repository access.
- Workspace Trust, Tasks/Test Center, local Risk Map, Operation Preview and Secret Guard.
- Session Capsules and rollback checkpoints.

### Known limitations

- Language Intelligence is not protocol-based LSP.
- Risk Map reflects local test results rather than GitHub CI.
- Capsules do not restore live PTY processes.
- Linux AppImage is the only supported binary format in the first prerelease.
