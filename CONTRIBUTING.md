# Contributing to Luma

Luma welcomes focused bug fixes, tests and usability improvements. Large features should begin with an issue describing the user problem, safety implications and proposed interaction.

## Setup

```sh
git clone https://github.com/drainedgodw/Luma.git
cd Luma
npm ci
npm run typecheck
npm test
npm run build
```

Use Node.js 22 and a recent Git version.

## Pull requests

- Keep changes focused and formatted for review; do not minify source files.
- Add tests for Git parsing, destructive operations, IPC validation, trust boundaries and credential handling.
- Never commit tokens, `.env` files, private keys, personal paths or private repository data.
- Explain destructive-operation behavior and recovery paths.
- Include screenshots for renderer changes.
- Confirm `npm run typecheck`, `npm test` and `npm run build` pass.

## Product principles

1. Show consequences before destructive actions.
2. Create a recovery path before moving or rewriting history.
3. Keep Git commands visible and understandable.
4. Do not present textual heuristics as semantic language intelligence.
5. Prefer contextual workflows over adding another top-level mode.
