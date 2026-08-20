# Changelog

All notable changes are documented here. Luma follows semantic versioning once stable; `0.x` releases may change behavior between prereleases.

## [Unreleased]

### Security and release hardening

- Documented Workspace Trust and Git hook limitations.
- Defined experimental maturity labels for preview, Risk Map, language tools and Capsules.
- Added AppImage extraction and credential guidance.

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
