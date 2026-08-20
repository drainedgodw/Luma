# Security policy

## Supported versions

Luma is currently a developer preview. Only the latest prerelease is supported with security fixes.

## Report a vulnerability

Do not open a public issue containing an exploit, credential, private repository name, filesystem path, or sensitive log. Use GitHub private vulnerability reporting when available. If it is unavailable, contact the repository owner through the private contact method on the GitHub profile and include only enough information to establish a secure follow-up channel.

Include:

- affected version and commit SHA;
- operating system, display server and Git version;
- minimal reproduction;
- expected and actual impact;
- whether a credential, repository or path was exposed.

Never include real tokens or private keys. Revoke exposed credentials before reporting.

## Security boundaries

Luma is a local Electron application with access to repositories explicitly opened by the user. It can modify files, run Git, start a shell, execute trusted project tasks and store an encrypted GitHub token. Treat an unknown repository as untrusted code.

Workspace Trust is a safety boundary for Luma-provided task and terminal entry points, not a malware scanner. Git hooks, external tools and commands may still execute code. Keep backups and review unfamiliar repositories.

## Credential handling

HTTPS GitHub credentials are encrypted with Electron `safeStorage`, stored with restrictive permissions, and passed to child Git processes through `GIT_ASKPASS`. Prefer fine-grained, repository-scoped tokens and revoke them when no longer needed. SSH authentication remains managed by the user's SSH agent and configuration.
