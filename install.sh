#!/usr/bin/env bash
# Luma user-local installer. Installs an AppImage like a small package manager:
# application files, launcher, desktop entry and icon all live under ~/.local.

set -Eeuo pipefail
IFS=$'\n\t'

readonly REPO="drainedgodw/Luma"
readonly REF="${LUMA_REF:-main}"
readonly HOME_DIR="${HOME:?HOME is not set}"
readonly DATA_HOME="${XDG_DATA_HOME:-$HOME_DIR/.local/share}"
readonly CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME_DIR/.config}"
readonly CACHE_HOME="${XDG_CACHE_HOME:-$HOME_DIR/.cache}"
readonly STATE_HOME="${XDG_STATE_HOME:-$HOME_DIR/.local/state}"
readonly INSTALL_ROOT="${LUMA_INSTALL_ROOT:-$HOME_DIR/.local/opt/luma}"
readonly BIN_DIR="${LUMA_BIN_DIR:-$HOME_DIR/.local/bin}"
readonly LAUNCHER="$BIN_DIR/luma"
readonly DESKTOP_FILE="$DATA_HOME/applications/luma.desktop"
readonly ICON_FILE="$DATA_HOME/icons/hicolor/512x512/apps/luma.png"
readonly API_URL="https://api.github.com/repos/$REPO"
readonly NIGHTLY_URL="https://github.com/$REPO/releases/download/nightly"
readonly ICON_URL="https://raw.githubusercontent.com/$REPO/$REF/build/icon.png"
readonly SOURCE_URL="https://github.com/$REPO/archive/refs/heads/$REF.tar.gz"

ACTION="install"
CHANNEL="${LUMA_CHANNEL:-release}"
TMP_DIR=""
APPIMAGE=""
VERSION=""

log() { printf '[Luma installer] %s\n' "$*"; }
warn() { printf '[Luma installer] Warning: %s\n' "$*" >&2; }
die() { printf '[Luma installer] Error: %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then rm -rf -- "$TMP_DIR"; fi
}
trap cleanup EXIT INT TERM

usage() {
  cat <<'USAGE'
Luma user-local installer

Usage:
  install.sh [--install|--update|--uninstall|--purge] [--release|--source]

Actions:
  --install       Install or atomically update Luma (default)
  --update        Same as --install
  --uninstall     Remove application files, launcher, menu entry and icon
  --purge         Uninstall and also remove Luma settings, cache and credentials

Channels:
  --release       Require a GitHub Release AppImage
  --source        Build the current main branch, like an AUR -git package
  auto            Prefer a release; build from source when none exists

Environment:
  LUMA_REF=main                 Source branch to build
  LUMA_CHANNEL=release|source|auto
  LUMA_APPIMAGE_FILE=/path      Install a local AppImage (testing/manual package)
  LUMA_ICON_FILE=/path          Use a local PNG icon instead of build/icon.png
  LUMA_NO_SANDBOX=1            Add --no-sandbox to the generated launcher

Rerun the installer to update Luma.
USAGE
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --install|--update) ACTION="install" ;;
      --uninstall) ACTION="uninstall" ;;
      --purge) ACTION="purge" ;;
      --release) CHANNEL="release" ;;
      --source) CHANNEL="source" ;;
      -h|--help) ACTION="help" ;;
      *) die "Unknown option: $1" ;;
    esac
    shift
  done
  case "$CHANNEL" in auto|release|source) ;; *) die "Invalid channel: $CHANNEL" ;; esac
}

need() { command -v "$1" >/dev/null 2>&1 || die "Required command is missing: $1"; }

fetch() {
  local url="$1" output="$2"
  curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error \
    --retry 3 --connect-timeout 15 --output "$output" "$url"
}

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$file" | awk '{print $1}'
  else python3 - "$file" <<'PY'
import hashlib, pathlib, sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
  fi
}

refresh_desktop() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA_HOME/applications" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$DATA_HOME/icons/hicolor" >/dev/null 2>&1 || true
  command -v xdg-desktop-menu >/dev/null 2>&1 && xdg-desktop-menu forceupdate >/dev/null 2>&1 || true
  command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 >/dev/null 2>&1 || true
  command -v kbuildsycoca5 >/dev/null 2>&1 && kbuildsycoca5 >/dev/null 2>&1 || true
}

remove_install() {
  rm -rf -- "$INSTALL_ROOT"
  rm -f -- "$LAUNCHER" "$DESKTOP_FILE" "$ICON_FILE"
  refresh_desktop
  log 'Removed the application, launcher, desktop entry and icon.'
}

purge_user_data() {
  rm -rf -- \
    "$CONFIG_HOME/Luma" "$CONFIG_HOME/luma" \
    "$CACHE_HOME/Luma" "$CACHE_HOME/luma" \
    "$STATE_HOME/Luma" "$STATE_HOME/luma" \
    "$DATA_HOME/Luma" "$DATA_HOME/luma"
  log 'Removed Luma settings, cache, sessions and encrypted GitHub credentials.'
}

resolve_release() {
  local json="$TMP_DIR/releases.json" resolved
  fetch "$API_URL/releases?per_page=20" "$json" || json=''
  if [[ -n "$json" ]] && command -v python3 >/dev/null 2>&1; then
    resolved="$(python3 - "$json" <<'PY'
import json, sys
releases = json.load(open(sys.argv[1], encoding='utf-8'))
for release in releases:
    if release.get('draft') or release.get('prerelease') or release.get('tag_name') == 'nightly':
        continue
    assets = {a['name']: a['browser_download_url'] for a in release.get('assets', [])}
    app = next(((name, url) for name, url in assets.items() if name.endswith('.AppImage')), None)
    sums = assets.get('SHA256SUMS.txt')
    if app and sums:
        print(release['tag_name'])
        print(app[0])
        print(app[1])
        print(sums)
        break
PY
)"
  fi

  if [[ -n "$resolved" ]]; then
    local tag asset_name app_url sums_url expected actual
    tag="$(sed -n '1p' <<< "$resolved")"
    asset_name="$(sed -n '2p' <<< "$resolved")"
    app_url="$(sed -n '3p' <<< "$resolved")"
    sums_url="$(sed -n '4p' <<< "$resolved")"
    APPIMAGE="$TMP_DIR/$asset_name"
    log "Downloading Luma release $tag..."
    fetch "$sums_url" "$TMP_DIR/SHA256SUMS.txt"
    fetch "$app_url" "$APPIMAGE"
    expected="$(awk -v file="$asset_name" '$2 == file {print $1; exit}' "$TMP_DIR/SHA256SUMS.txt")"
    [[ -n "$expected" ]] || die "SHA256SUMS.txt does not contain $asset_name."
    actual="$(sha256_file "$APPIMAGE")"
    [[ "$actual" == "$expected" ]] || die 'AppImage checksum verification failed.'
    VERSION="$tag"
    return 0
  fi

  local nightly_sums="$TMP_DIR/nightly-SHA256SUMS.txt" nightly_asset expected actual
  if fetch "$NIGHTLY_URL/SHA256SUMS.txt" "$nightly_sums"; then
    nightly_asset="$(awk '$2 ~ /[.]AppImage$/ {print $2; exit}' "$nightly_sums")"
    expected="$(awk '$2 ~ /[.]AppImage$/ {print $1; exit}' "$nightly_sums")"
    if [[ -n "$nightly_asset" && -n "$expected" ]]; then
      APPIMAGE="$TMP_DIR/$nightly_asset"
      log 'No stable release found; downloading the nightly AppImage...'
      fetch "$NIGHTLY_URL/$nightly_asset" "$APPIMAGE"
      actual="$(sha256_file "$APPIMAGE")"
      [[ "$actual" == "$expected" ]] || die 'Nightly AppImage checksum verification failed.'
      VERSION="nightly"
      return 0
    fi
  fi

  return 1
}

build_from_source() {
  local archive="$TMP_DIR/source.tar.gz" source_dir
  log "No usable release found; building $REF from source (AUR-style)."
  fetch "$SOURCE_URL" "$archive"
  mkdir -p "$TMP_DIR/source"
  tar -xzf "$archive" -C "$TMP_DIR/source"
  source_dir="$(find "$TMP_DIR/source" -mindepth 1 -maxdepth 1 -type d -print -quit)"
  [[ -n "$source_dir" && -f "$source_dir/scripts/bootstrap.sh" ]] || die 'Downloaded source does not contain scripts/bootstrap.sh.'
  bash "$source_dir/scripts/bootstrap.sh" dist --install-system-deps
  APPIMAGE="$(find "$source_dir/dist" -maxdepth 1 -type f -name '*.AppImage' -print -quit)"
  [[ -n "$APPIMAGE" ]] || die 'The source build completed without an AppImage.'
  VERSION="source-$REF"
}

resolve_appimage() {
  if [[ -n "${LUMA_APPIMAGE_FILE:-}" ]]; then
    APPIMAGE="$(cd -- "$(dirname -- "$LUMA_APPIMAGE_FILE")" && pwd)/$(basename -- "$LUMA_APPIMAGE_FILE")"
    [[ -f "$APPIMAGE" ]] || die "Local AppImage not found: $APPIMAGE"
    VERSION="local"
    return
  fi

  case "$CHANNEL" in
    release) resolve_release || die 'No GitHub Release with AppImage and SHA256SUMS.txt is available.' ;;
    source) build_from_source ;;
    auto) resolve_release || build_from_source ;;
  esac
}

install_appimage() {
  local next="$INSTALL_ROOT.next.$$" old="$INSTALL_ROOT.old.$$" extracted icon wrapper_target
  rm -rf -- "$next" "$old"
  mkdir -p -- "$next"
  install -m755 "$APPIMAGE" "$next/Luma.AppImage"

  log 'Extracting the AppImage for FUSE-independent launches...'
  (
    cd -- "$next"
    ./Luma.AppImage --appimage-extract >/dev/null
  )
  extracted="$next/squashfs-root"
  [[ -x "$extracted/luma" ]] || die 'The AppImage does not contain the expected luma executable.'
  mv -- "$extracted" "$next/app"
  printf '%s\n' "$VERSION" > "$next/version"

  mkdir -p -- "$BIN_DIR" "$(dirname -- "$DESKTOP_FILE")" "$(dirname -- "$ICON_FILE")"
  wrapper_target="$INSTALL_ROOT/app/luma"
  {
    printf '#!/usr/bin/env bash\n'
    printf 'args=(--ozone-platform-hint=auto)\n'
    printf '[[ "${LUMA_NO_SANDBOX:-0}" == "1" ]] && args+=(--no-sandbox)\n'
    printf 'exec %q "${args[@]}" "$@"\n' "$wrapper_target"
  } > "$LAUNCHER"
  chmod 755 "$LAUNCHER"

  icon="$next/icon.png"
  if [[ -n "${LUMA_ICON_FILE:-}" ]]; then
    install -m644 "$LUMA_ICON_FILE" "$icon"
  else
    log 'Downloading the Luma application icon...'
    fetch "$ICON_URL" "$icon"
  fi
  [[ -s "$icon" ]] || die 'The Luma PNG icon could not be installed.'
  install -m644 "$icon" "$ICON_FILE"

  cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Luma
GenericName=Git IDE
Comment=Visual Git-first IDE
Exec="$LAUNCHER" %U
TryExec=$LAUNCHER
Icon=$ICON_FILE
Terminal=false
Categories=Development;IDE;RevisionControl;
Keywords=Git;IDE;History;Diff;Repository;
StartupNotify=true
StartupWMClass=Luma
EOF
  chmod 644 "$DESKTOP_FILE"

  if [[ -d "$INSTALL_ROOT" ]]; then mv -- "$INSTALL_ROOT" "$old"; fi
  mv -- "$next" "$INSTALL_ROOT"
  rm -rf -- "$old"
  refresh_desktop

  log "Installed Luma $VERSION in $INSTALL_ROOT."
  log 'The Luma icon is now available in the application menu.'
  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    warn "$BIN_DIR is not in PATH; the application menu still works."
  fi
}

main() {
  parse_args "$@"
  case "$ACTION" in
    help) usage; exit 0 ;;
    uninstall) remove_install; exit 0 ;;
    purge) remove_install; purge_user_data; exit 0 ;;
  esac

  [[ "$(uname -s)" == "Linux" ]] || die 'The binary installer currently supports Linux only.'
  case "$(uname -m)" in x86_64|amd64) ;; *) die 'The current AppImage is supported on Linux x86_64 only.' ;; esac
  need curl
  need tar
  need find
  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/luma-install.XXXXXX")"
  resolve_appimage
  install_appimage
}

main "$@"
