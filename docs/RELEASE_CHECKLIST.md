# Luma developer preview release checklist

## Scope and claims

- [ ] Version is an alpha/prerelease; README maturity table matches implementation.
- [ ] No prototype text search is called semantic rename or LSP.
- [ ] Local test state is not called GitHub CI state.
- [ ] Workspace snapshots do not claim to restore live PTY processes.
- [ ] Known limitations and recovery behavior are in release notes.

## Security

- [ ] Filesystem traversal and symlink escape tests pass.
- [ ] Terminal and project Tasks are blocked until Workspace Trust.
- [ ] Git hook limitations are visible to the user.
- [ ] Hard rollback and Undo protect dirty worktrees.
- [ ] Secret Guard patterns and override behavior are tested.
- [ ] No credentials, `.env`, private paths or repository data are in source, screenshots or logs.

## Product smoke test

- [ ] Open trusted and untrusted repositories.
- [ ] Select commits in Lanes and Orbit and inspect diffs.
- [ ] Pan/zoom Orbit with mouse, trackpad and keyboard.
- [ ] Stage, unstage, commit and trigger Secret Guard.
- [ ] Preview merge, rebase and reset.
- [ ] Soft rollback → Undo; hard rollback with dirty files → safety stash → Undo.
- [ ] Run a passing and failing task and verify commit association.
- [ ] Save and restore a workspace snapshot.
- [ ] Clone/fetch/pull/push over PAT HTTPS and SSH.
- [ ] Verify Liquid Glass and Cosmos terminal readability.

## Packaging

- [ ] PR CI: typecheck, tests, build, native rebuild and AppImage package.
- [ ] Tag CI: AppImage, tarball and SHA256SUMS.
- [ ] Release artifacts carry cosign bundles (`*.sigstore.json`), `verify-blob` passes.
- [ ] AppImage starts with FUSE.
- [ ] Extracted AppImage starts without FUSE.
- [ ] Wayland and X11 launch tested.
- [ ] Release contains screenshots, installation commands and known limitations.
- [ ] Artifact checksum matches the published SHA256SUMS.

## After publishing

- [ ] `update.json` on main points at the new release (the release workflow does this).
- [ ] Download assets from the public release rather than Actions.
- [ ] Re-test a clean installation.
- [ ] Confirm security contact and issue templates are visible.
- [ ] Keep the previous prerelease available for rollback.
