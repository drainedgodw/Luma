# Luma — User Guide

Luma is a Git-first IDE built around a visual history. This guide covers everything you need day to day: installation, the start screen, the editor, Git workflows, and every keyboard shortcut.

---

## 1. Installing and updating

Install or update Luma with one command (works like a package manager — desktop entry, icon, and a `luma` command are created automatically):

```bash
pkill -x luma 2>/dev/null || true; bash -c "$(curl -fsSL https://raw.githubusercontent.com/drainedgodw/Luma/main/install.sh)"
```

After installation, launch Luma from your application menu or by typing `luma` in a terminal.

Remove the app but keep your settings:

```bash
curl -fsSL https://raw.githubusercontent.com/drainedgodw/Luma/main/install.sh | bash -s -- --uninstall
```

Remove everything (app, settings, sessions, saved credentials):

```bash
curl -fsSL https://raw.githubusercontent.com/drainedgodw/Luma/main/install.sh | bash -s -- --purge
```

> AppImage is unpacked during installation, so FUSE is not required.

## 2. The start screen

When Luma opens you see the welcome screen:

- **Open directory** — pick any folder. It does **not** have to be a Git repository: Luma is an IDE first.
- **Recent directories** — every folder you open is remembered here. Navigate the list with **↑ ↓**, press **Enter** to open. Folders that were deleted on disk disappear from the list automatically.
- For a non-Git folder, Git sections stay hidden until you press **Initialize Git** in the header.

To come back to this screen later and pick another folder, press the **⌂** button in the top bar.

## 3. The layout

- **Left rail** — the dock with all sections: Panel, Code, History, Changes, GitHub, Tools, Term, Rescue, Stack, Setup.
- **Explorer** — the file tree. Two modes, toggled by the **Panel** button (or **Ctrl+B**):
  - **Pinned** — always visible.
  - **Auto** — hidden; hover the thin glowing line just right of the dock and the panel rolls in, move the mouse away and it rolls out. In Auto mode it only appears where it is useful (the editor).
- **Top bar** — folder name, branch badge, trust status, and window controls.

## 4. The editor

- Open a file by clicking it in the Explorer, or with **Ctrl+P** (Quick Open — fuzzy search by file name).
- **Tabs** — every open file is a tab; unsaved changes survive tab switches and app restarts (tabs are restored when you reopen the same folder). Close with **Ctrl+W**, with a confirmation if the file is unsaved.
- **Ctrl+S** — save. **Ctrl+F** — find inside the current file (search panel with next/previous match and replace). **Ctrl+Shift+F** — search text across the whole project; clicking a result opens the file at that line.
- Syntax highlighting, autocomplete (Tab completes), code folding, bracket matching and word wrap can be tuned in **Setup** (Settings).
- Each file header has **Reload** (discard local view and re-read from disk), **History** (browse older versions of this file and restore them), and **Stage** (stage the file for a commit, Git repositories only).

## 5. History — Lanes and Orbit

**History** shows the commit graph in two modes (toggle in the section header):

- **Lanes** — the classic vertical commit lanes.
- **Orbit** — the same commits as a 3-D constellation. Newest commits sit at the center, older ones spiral outward.

In Orbit you have full camera control:

| Action | Result |
| --- | --- |
| Drag | Rotate left/right and tilt up/down |
| Shift-drag or right-drag | Pan |
| Mouse wheel | Zoom |
| ⟲ ⟳ | Rotate left / right |
| ↘ ↗ | Tilt down / up |
| ◐ | Auto-spin on/off |
| Fit | Reset the camera |

In both modes: **↑ ↓** moves between commits, **Enter** opens details, and clicking a commit shows its message, metadata, risk score, and full diff with the same rollback actions available everywhere else.

### Branches, merge and rebase

- **Branches** menu: create and switch branches; next to each branch — **merge**, **rebase** and **edit** (interactive rebase).
- Merge lets you choose the strategy: default (fast-forward when possible), `--no-ff` (always a merge commit), or `--ff-only`.
- **Interactive rebase** opens a visual board: drag commits to reorder, mark them as pick / squash / fixup / drop / reword, then apply. If a rebase is interrupted midway, Luma shows the in-progress state and lets you continue or abort.
- Destructive operations (merge, rebase, rollback) always show a **read-only preview** first, including conflict detection.
- **Undo rollback** restores the state before your last rollback (a safety branch is created automatically).
- On any commit: cherry-pick, revert, and tag actions.

## 6. Changes

- See modified files, drag changes between unstaged and staged (drag-and-drop staging), and review diffs side by side.
- The commit box runs a **secret scan** before committing — if a potential API key or password is detected, Luma warns you first.
- If something goes wrong: **Rescue** shows the reflog so you can recover lost commits, and the stash drawer keeps your work-in-progress safe.

## 7. Terminal

Press **Ctrl+`** or the **Term** button for an integrated terminal (a real shell, not a simulation). The terminal starts **locked** for repositories you have not trusted yet — press **Trust & start terminal** to enable it. This is intentional: a terminal can execute anything, so it is gated behind an explicit decision.

## 8. Trust and Tools

The **Tools** section manages workspace trust:

- **Untrusted** — shell commands, tasks, and package installs are disabled.
- **Trusted** — Luma can run project tasks (tests, builds) and install packages for you.

Trusting is per-folder and stored on your machine only.

## 9. Stack — Languages & Ecosystem

Shows what is actually installed on your system:

- Real runtime versions (Node, Python, Rust, Go, …) detected from your system — no fake “install” buttons for languages you already have.
- Project dependencies are read from manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, …) and marked with ✓ in the language lists.
- Click a language to expand its frameworks and libraries. Items with an **install** button are added to the current project with its real package manager (npm, pip, cargo, go) — only whitelisted, well-known package names, and only in trusted workspaces.

## 10. GitHub

The GitHub section connects to your account (credentials are stored locally in your system keyring). Push/Pull/Fetch buttons also live in the History header. Nothing is ever sent anywhere except to GitHub over authenticated SSH/HTTPS.

## 11. Themes and settings

**Setup** (Settings) contains:

- Theme: **Cosmos** (starfield) or **Liquid Glass** (frosted glass over your desktop wallpaper).
- Editor: font size, tab size, word wrap, autocomplete on/off.
- Installed language packs for the editor.

## 12. Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| **Ctrl+P** | Quick Open file |
| **Ctrl+Shift+P** | Command palette (every action in Luma) |
| **Ctrl+F** | Find in current file (editor) / search workspace |
| **Ctrl+Shift+F** | Search text across the project |
| **Ctrl+S** | Save file |
| **Ctrl+W** | Close tab |
| **Ctrl+B** | Pin / auto-hide the Explorer |
| **Ctrl+`** | Toggle terminal |
| **↑ ↓ / Enter** | Navigate commits in History |
| **Esc** | Close dialogs, previews, commit details |

## 13. Getting help

- Something looks wrong? Check **Help** in the top bar for the built-in getting-started guide.
- Found a bug or have an idea? Open an issue at <https://github.com/drainedgodw/Luma/issues>.
- Security-related reports: see `SECURITY.md`.

---

Enjoy the constellation. ✨
