#!/usr/bin/env bash
# Self-contained development launcher for Luma.
# It keeps compatible Node.js and CPython toolchains inside .luma/ and never
# changes the user's system Node/Python installations or shell configuration.

set -Eeuo pipefail
IFS=$'\n\t'

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
readonly STATE_DIR="${LUMA_STATE_DIR:-$ROOT_DIR/.luma}"
readonly TOOLCHAIN_DIR="$STATE_DIR/toolchain"
readonly NODE_HOME="$TOOLCHAIN_DIR/node"
readonly PYTHON_HOME="$TOOLCHAIN_DIR/python"
readonly CACHE_DIR="$STATE_DIR/cache"
readonly INSTALL_STAMP="$STATE_DIR/install.stamp"
readonly NODE_DIST_URL="${LUMA_NODE_DIST_URL:-https://nodejs.org/dist}"
readonly PYTHON_RELEASES_URL="${LUMA_PYTHON_RELEASES_URL:-https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest}"
readonly BOOTSTRAP_SCHEMA="3"

COMMAND="dev"
FORCE_INSTALL=0
REFRESH_TOOLCHAIN=0
INSTALL_SYSTEM_DEPS=0
EXTRA_ARGS=()
TMP_DIR=""
NODE_BIN=""
NPM_BIN=""
PYTHON_BIN=""
PLATFORM=""
ARCH=""

log() { printf '[Luma setup] %s\n' "$*"; }
warn() { printf '[Luma setup] Warning: %s\n' "$*" >&2; }
die() { printf '[Luma setup] Error: %s\n' "$*" >&2; exit 1; }

cleanup() {
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then rm -rf -- "$TMP_DIR"; fi
}
trap cleanup EXIT INT TERM

usage() {
  cat <<'USAGE'
Luma self-contained development launcher

Usage:
  bash scripts/bootstrap.sh [command] [options] [-- command arguments]

Commands:
  dev          Install/repair dependencies when needed, then start Luma (default)
  setup        Prepare the local Node/Python toolchains and project dependencies
  doctor       Check Electron, esbuild and node-pty
  typecheck    Run the TypeScript check
  test         Run tests
  build        Create the production JavaScript build
  ci           Run typecheck, tests and production build
  dist         Build Linux packages with electron-builder
  toolchain    Download/check only the local Node and Python toolchains
  clean        Remove generated project files, but keep the downloaded toolchains
  purge        Remove generated files and the entire local toolchain
  help         Show this help

Options:
  --force                 Force a clean npm install
  --refresh-toolchain     Redownload the latest compatible Node 22 release
  --install-system-deps   Install missing Git/compiler packages via the OS package manager

Environment overrides:
  LUMA_USE_SYSTEM_NODE=1        Use an already-installed compatible Node instead of .luma/toolchain
  LUMA_NODE_VERSION=22          Override the Node version/channel read from .nvmrc
  LUMA_NODE_DIST_URL=...        Use a Node.js distribution mirror
  LUMA_PYTHON_VERSION=3.11      Override the standalone CPython used for native builds
  LUMA_PYTHON_RELEASES_URL=...  Override the python-build-standalone release API endpoint
  LUMA_STATE_DIR=...            Store the private toolchains/cache elsewhere

Examples:
  bash scripts/bootstrap.sh dev
  bash scripts/bootstrap.sh test
  bash scripts/bootstrap.sh dist
  bash scripts/bootstrap.sh dev -- --host
USAGE
}

parse_args() {
  local command_seen=0
  while (($# > 0)); do
    case "$1" in
      dev|setup|doctor|typecheck|test|build|ci|dist|toolchain|clean|purge|help)
        ((command_seen == 0)) || die 'Only one command can be selected.'
        COMMAND="$1"; command_seen=1; shift ;;
      --force) FORCE_INSTALL=1; shift ;;
      --refresh-toolchain) REFRESH_TOOLCHAIN=1; shift ;;
      --install-system-deps) INSTALL_SYSTEM_DEPS=1; shift ;;
      --) shift; EXTRA_ARGS=("$@"); break ;;
      -h|--help) COMMAND="help"; shift ;;
      *) die "Unknown argument: $1 (put application arguments after --)." ;;
    esac
  done
}

detect_platform() {
  case "$(uname -s)" in
    Linux) PLATFORM="linux" ;;
    Darwin) PLATFORM="darwin" ;;
    *) die 'The source bootstrap currently supports Linux and macOS.' ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) die "Unsupported CPU architecture: $(uname -m)" ;;
  esac
}

requested_node_version() {
  local requested="${LUMA_NODE_VERSION:-}"
  if [[ -z "$requested" ]]; then
    [[ -f "$ROOT_DIR/.nvmrc" ]] || die '.nvmrc is missing.'
    requested="$(tr -d '[:space:]' < "$ROOT_DIR/.nvmrc")"
  fi
  requested="${requested#v}"
  [[ "$requested" =~ ^[0-9]+$ || "$requested" =~ ^[0-9]+[.][0-9]+[.][0-9]+$ ]] \
    || die "Use a Node major (for example 22) or an exact version (for example 22.20.0), not: $requested"
  printf '%s' "$requested"
}

version_matches() {
  local actual="${1#v}" requested="${2#v}"
  if [[ "$requested" =~ ^[0-9]+$ ]]; then
    [[ "${actual%%.*}" == "$requested" ]]
  else
    [[ "$actual" == "$requested" ]]
  fi
}

validate_node_engine() {
  local version="$1" major minor
  IFS=. read -r major minor _ <<< "$version"
  if ((major != 22 || minor < 20)); then
    die "Node $version is outside Luma's supported range (>=22.20 <23)."
  fi
}

fetch_file() {
  local url="$1" output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error --retry 3 --connect-timeout 15 --output "$output" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --tries=3 --timeout=15 --output-document="$output" "$url"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$url" "$output" <<'PY'
import pathlib, sys, urllib.request
url, output = sys.argv[1:]
with urllib.request.urlopen(url, timeout=30) as response:
    pathlib.Path(output).write_bytes(response.read())
PY
  else
    die 'Need curl, wget, or Python 3 to download the private toolchain.'
  fi
}

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$file" | awk '{print $NF}'
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$file" <<'PY'
import hashlib, pathlib, sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
  else
    die 'Need sha256sum, shasum, OpenSSL, or Python 3 to verify downloads.'
  fi
}

find_node_asset() {
  local sums_file="$1" suffix hash filename
  for suffix in ".tar.gz" ".tar.xz"; do
    while IFS=' ' read -r hash filename _; do
      filename="${filename#\*}"
      if [[ "$filename" == node-v*"-$PLATFORM-$ARCH$suffix" ]]; then
        printf '%s\t%s\n' "$hash" "$filename"; return 0
      fi
    done < "$sums_file"
  done
  return 1
}

install_local_node() {
  local requested base sums record expected_hash asset archive actual_hash extracted
  requested="$(requested_node_version)"
  if [[ "$requested" =~ ^[0-9]+$ ]]; then
    base="${NODE_DIST_URL%/}/latest-v${requested}.x"
  else
    base="${NODE_DIST_URL%/}/v${requested}"
  fi
  mkdir -p -- "$TOOLCHAIN_DIR" "$CACHE_DIR" "$STATE_DIR"
  TMP_DIR="$(mktemp -d "$STATE_DIR/bootstrap.XXXXXX")"
  sums="$TMP_DIR/SHASUMS256.txt"
  log "Resolving Node $requested for $PLATFORM-$ARCH..."
  fetch_file "$base/SHASUMS256.txt" "$sums"
  record="$(find_node_asset "$sums")" || die "No Node archive found for $PLATFORM-$ARCH at $base."
  IFS=$'\t' read -r expected_hash asset <<< "$record"
  archive="$CACHE_DIR/$asset"
  if [[ ! -f "$archive" || "$(sha256_file "$archive")" != "$expected_hash" ]]; then
    rm -f -- "$archive"; log "Downloading $asset..."; fetch_file "$base/$asset" "$archive"
  else
    log "Using cached $asset."
  fi
  actual_hash="$(sha256_file "$archive")"
  [[ "$actual_hash" == "$expected_hash" ]] || { rm -f -- "$archive"; die "Checksum verification failed for $asset."; }
  mkdir -p -- "$TMP_DIR/extract"
  case "$asset" in
    *.tar.gz) tar -xzf "$archive" -C "$TMP_DIR/extract" ;;
    *.tar.xz) tar -xJf "$archive" -C "$TMP_DIR/extract" ;;
    *) die "Unsupported Node archive: $asset" ;;
  esac
  extracted="$TMP_DIR/extract/${asset%.tar.*}"
  [[ -x "$extracted/bin/node" && -x "$extracted/bin/npm" ]] || die 'Downloaded Node archive is incomplete.'
  rm -rf -- "$NODE_HOME.next"; mv -- "$extracted" "$NODE_HOME.next"
  rm -rf -- "$NODE_HOME"; mv -- "$NODE_HOME.next" "$NODE_HOME"
  printf '%s\n' "$expected_hash  $asset" > "$TOOLCHAIN_DIR/source.txt"
  log "Installed $("$NODE_HOME/bin/node" --version) inside .luma/toolchain."
}

ensure_node() {
  local requested actual
  requested="$(requested_node_version)"
  if [[ "${LUMA_USE_SYSTEM_NODE:-0}" == "1" ]]; then
    command -v node >/dev/null 2>&1 || die 'LUMA_USE_SYSTEM_NODE=1, but node is not installed.'
    command -v npm >/dev/null 2>&1 || die 'LUMA_USE_SYSTEM_NODE=1, but npm is not installed.'
    NODE_BIN="$(command -v node)"; NPM_BIN="$(command -v npm)"
    actual="$($NODE_BIN -p 'process.versions.node')"
    version_matches "$actual" "$requested" || die "System Node $actual does not match .nvmrc ($requested)."
    validate_node_engine "$actual"; log "Using system Node $actual because LUMA_USE_SYSTEM_NODE=1."; return
  fi
  if ((REFRESH_TOOLCHAIN == 0)) && [[ -x "$NODE_HOME/bin/node" && -x "$NODE_HOME/bin/npm" ]]; then
    actual="$($NODE_HOME/bin/node -p 'process.versions.node' 2>/dev/null || true)"
    if [[ -n "$actual" ]] && version_matches "$actual" "$requested"; then
      NODE_BIN="$NODE_HOME/bin/node"; NPM_BIN="$NODE_HOME/bin/npm"; validate_node_engine "$actual"
      export PATH="$NODE_HOME/bin:$PATH"; log "Using private Node $actual from .luma/toolchain."; return
    fi
  fi
  install_local_node
  NODE_BIN="$NODE_HOME/bin/node"; NPM_BIN="$NODE_HOME/bin/npm"
  actual="$($NODE_BIN -p 'process.versions.node')"
  version_matches "$actual" "$requested" || die "Downloaded Node $actual does not match requested $requested."
  validate_node_engine "$actual"; export PATH="$NODE_HOME/bin:$PATH"
}

# node-gyp 9 (pinned by the lockfile via electron-rebuild) drives gyp, which
# imports distutils. Python 3.12 removed distutils, so the node-pty native
# build breaks on systems with a modern Python (Arch, Fedora, recent CI
# images). The bootstrap therefore keeps a private standalone CPython <= 3.11
# next to the private Node toolchain and points node-gyp at it.

requested_python_version() {
  local requested="${LUMA_PYTHON_VERSION:-3.11}" major minor
  requested="${requested#v}"
  [[ "$requested" =~ ^[0-9]+[.][0-9]+$ ]] \
    || die "Use a Python major.minor (for example 3.11), not: $requested"
  IFS=. read -r major minor <<< "$requested"
  if ((major != 3 || minor > 11)); then
    die "node-gyp 9 needs a Python that still ships distutils (3.11 or older), not: $requested"
  fi
  printf '%s' "$requested"
}

python_version_matches() {
  local actual="$1" requested="$2"
  [[ "$actual" == "$requested."* ]]
}

python_target_triple() {
  case "$PLATFORM-$ARCH" in
    linux-x64) printf 'x86_64-unknown-linux-gnu' ;;
    linux-arm64) printf 'aarch64-unknown-linux-gnu' ;;
    darwin-x64) printf 'x86_64-apple-darwin' ;;
    darwin-arm64) printf 'aarch64-apple-darwin' ;;
    *) die "No standalone CPython build is known for $PLATFORM-$ARCH." ;;
  esac
}

resolve_python_asset() {
  local json="$1" requested="$2" triple="$3"
  "$NODE_BIN" - "$json" "$requested" "$triple" <<'JS'
const fs = require('node:fs');
const [json, requested, triple] = process.argv.slice(2);
const release = JSON.parse(fs.readFileSync(json, 'utf8'));
const assets = Array.isArray(release.assets) ? release.assets : [];
const prefix = `cpython-${requested}.`;
const suffix = `-${triple}-install_only_stripped.tar.gz`;
const versionOf = (name) => name.slice(prefix.length).split('+')[0].split('.').map(Number);
const matches = assets.filter((asset) => typeof asset.name === 'string'
  && asset.name.startsWith(prefix) && asset.name.endsWith(suffix));
matches.sort((a, b) => {
  const av = versionOf(a.name); const bv = versionOf(b.name);
  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    const diff = (bv[i] || 0) - (av[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
});
const best = matches[0];
const sums = assets.find((asset) => asset.name === 'SHA256SUMS');
if (!best || !sums) process.exit(1);
process.stdout.write(`${best.name}\n${best.browser_download_url}\n${sums.browser_download_url}\n`);
JS
}

install_local_python() {
  local requested triple json record asset url sums_url sums expected_hash archive actual_hash extracted
  requested="$(requested_python_version)"
  triple="$(python_target_triple)"
  mkdir -p -- "$TOOLCHAIN_DIR" "$CACHE_DIR" "$STATE_DIR"
  if [[ -z "$TMP_DIR" ]]; then TMP_DIR="$(mktemp -d "$STATE_DIR/bootstrap.XXXXXX")"; fi
  json="$TMP_DIR/python-release.json"
  log "Resolving standalone CPython $requested for $triple..."
  fetch_file "$PYTHON_RELEASES_URL" "$json"
  record="$(resolve_python_asset "$json" "$requested" "$triple")" \
    || die "No standalone CPython $requested build found for $triple at $PYTHON_RELEASES_URL."
  asset="$(sed -n '1p' <<< "$record")"
  url="$(sed -n '2p' <<< "$record")"
  sums_url="$(sed -n '3p' <<< "$record")"
  [[ -n "$asset" && -n "$url" && -n "$sums_url" ]] || die 'Could not resolve a standalone CPython download.'
  sums="$TMP_DIR/PYTHON-SHA256SUMS.txt"
  fetch_file "$sums_url" "$sums"
  expected_hash="$(awk -v file="$asset" '$2 == file {print $1; exit}' "$sums")"
  [[ -n "$expected_hash" ]] || die "SHA256SUMS does not contain $asset."
  archive="$CACHE_DIR/$asset"
  if [[ ! -f "$archive" || "$(sha256_file "$archive")" != "$expected_hash" ]]; then
    rm -f -- "$archive"; log "Downloading $asset..."; fetch_file "$url" "$archive"
  else
    log "Using cached $asset."
  fi
  actual_hash="$(sha256_file "$archive")"
  [[ "$actual_hash" == "$expected_hash" ]] || { rm -f -- "$archive"; die "Checksum verification failed for $asset."; }
  rm -rf -- "$TMP_DIR/extract-python"; mkdir -p -- "$TMP_DIR/extract-python"
  tar -xzf "$archive" -C "$TMP_DIR/extract-python"
  extracted="$TMP_DIR/extract-python/python"
  [[ -x "$extracted/bin/python3" ]] || die 'Downloaded CPython archive is incomplete.'
  rm -rf -- "$PYTHON_HOME.next"; mv -- "$extracted" "$PYTHON_HOME.next"
  rm -rf -- "$PYTHON_HOME"; mv -- "$PYTHON_HOME.next" "$PYTHON_HOME"
  printf '%s\n' "$expected_hash  $asset" > "$TOOLCHAIN_DIR/python-source.txt"
  log "Installed $("$PYTHON_HOME/bin/python3" --version 2>&1) inside .luma/toolchain."
}

export_python_environment() {
  export PYTHON="$PYTHON_BIN" npm_config_python="$PYTHON_BIN" NPM_CONFIG_PYTHON="$PYTHON_BIN"
  local bin_dir
  bin_dir="$(dirname -- "$PYTHON_BIN")"
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) export PATH="$bin_dir:$PATH" ;;
  esac
}

ensure_python() {
  local requested actual
  requested="$(requested_python_version)"
  if [[ -x "$PYTHON_HOME/bin/python3" ]]; then
    actual="$("$PYTHON_HOME/bin/python3" --version 2>/dev/null | awk '{print $2}' || true)"
    if [[ -n "$actual" ]] && python_version_matches "$actual" "$requested"; then
      PYTHON_BIN="$PYTHON_HOME/bin/python3"
      export_python_environment
      log "Using private Python $actual from .luma/toolchain."
      return
    fi
  fi
  if command -v python3 >/dev/null 2>&1 && python3 -c 'import distutils' >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
    export_python_environment
    log "Using system $(python3 --version 2>&1) for native builds (distutils is available)."
    return
  fi
  install_local_python
  PYTHON_BIN="$PYTHON_HOME/bin/python3"
  actual="$("$PYTHON_BIN" --version 2>&1 | awk '{print $2}')"
  python_version_matches "$actual" "$requested" \
    || die "Downloaded Python $actual does not match requested $requested."
  export_python_environment
}

root_command() {
  if ((EUID == 0)); then "$@"; else command -v sudo >/dev/null 2>&1 || die "sudo is required to install system packages: $*"; sudo "$@"; fi
}

system_dependency_command() {
  if command -v pacman >/dev/null 2>&1; then printf 'sudo pacman -S --needed git base-devel\n'
  elif command -v apt-get >/dev/null 2>&1; then printf 'sudo apt-get update && sudo apt-get install -y git build-essential\n'
  elif command -v dnf >/dev/null 2>&1; then printf 'sudo dnf install -y git gcc-c++ make\n'
  elif command -v zypper >/dev/null 2>&1; then printf 'sudo zypper --non-interactive install git gcc-c++ make\n'
  elif command -v apk >/dev/null 2>&1; then printf 'sudo apk add git build-base\n'
  else printf 'Install Git, make and a C/C++ compiler with your package manager.\n'; fi
}

install_missing_system_deps() {
  if command -v pacman >/dev/null 2>&1; then root_command pacman -S --needed --noconfirm git base-devel
  elif command -v apt-get >/dev/null 2>&1; then root_command apt-get update; root_command apt-get install -y git build-essential
  elif command -v dnf >/dev/null 2>&1; then root_command dnf install -y git gcc-c++ make
  elif command -v zypper >/dev/null 2>&1; then root_command zypper --non-interactive install git gcc-c++ make
  elif command -v apk >/dev/null 2>&1; then root_command apk add git build-base
  else die "Automatic dependency installation is unavailable. Run: $(system_dependency_command)"; fi
}

ensure_system_deps() {
  local missing=() answer=""
  command -v git >/dev/null 2>&1 || missing+=(git)
  command -v make >/dev/null 2>&1 || missing+=(make)
  if ! command -v c++ >/dev/null 2>&1 && ! command -v g++ >/dev/null 2>&1 && ! command -v clang++ >/dev/null 2>&1; then missing+=(C++-compiler); fi
  ((${#missing[@]} == 0)) && return
  warn "Missing native build requirements: ${missing[*]}"; warn "Suggested command: $(system_dependency_command)"
  if ((INSTALL_SYSTEM_DEPS == 1)); then install_missing_system_deps
  elif [[ -t 0 ]]; then
    read -r -p 'Install the missing system packages now? [y/N] ' answer
    [[ "$answer" =~ ^[Yy]$ ]] && install_missing_system_deps || die 'Cannot compile node-pty without the native build requirements.'
  else die 'Missing native build requirements. Rerun with --install-system-deps.'; fi
}

clear_blocking_environment() {
  local name value
  for name in ELECTRON_SKIP_BINARY_DOWNLOAD ELECTRON_SKIP_DOWNLOAD npm_config_ignore_scripts NPM_CONFIG_IGNORE_SCRIPTS; do
    value="${!name-}"
    if [[ -n "$value" && "$value" != "0" && "$value" != "false" ]]; then warn "Ignoring $name=$value for this run."; fi
    unset "$name" || true
  done
  export npm_config_ignore_scripts=false NPM_CONFIG_IGNORE_SCRIPTS=false
}

expected_install_stamp() {
  local lock_hash node_version npm_version python_version
  lock_hash="$(sha256_file "$ROOT_DIR/package-lock.json")"; node_version="$($NODE_BIN -p 'process.versions.node')"; npm_version="$($NPM_BIN --version)"
  python_version="$("$PYTHON_BIN" --version 2>&1 | awk '{print $2}')"
  printf 'schema=%s\nlock=%s\nnode=%s\nnpm=%s\npython=%s\nplatform=%s-%s\n' "$BOOTSTRAP_SCHEMA" "$lock_hash" "$node_version" "$npm_version" "$python_version" "$PLATFORM" "$ARCH"
}

run_npm() { (cd -- "$ROOT_DIR" && "$NPM_BIN" "$@"); }

quick_runtime_check() {
  [[ -d "$ROOT_DIR/node_modules" ]] || return 1
  run_npm run doctor >/dev/null 2>&1 || return 1
  local electron_path
  electron_path="$(cd -- "$ROOT_DIR" && "$NODE_BIN" -e "process.stdout.write(require('electron'))" 2>/dev/null)" || return 1
  [[ -x "$electron_path" ]] || return 1
  (cd -- "$ROOT_DIR" && ELECTRON_RUN_AS_NODE=1 "$electron_path" -e "const p=require('node-pty');if(typeof p.spawn!=='function')process.exit(1)") >/dev/null 2>&1 || return 1
}

install_dependencies() {
  local expected npm_major rebuild_bin electron_path stamp_tmp
  expected="$(expected_install_stamp)"
  if ((FORCE_INSTALL == 0)) && [[ -f "$INSTALL_STAMP" ]] && [[ "$(cat "$INSTALL_STAMP")" == "$expected" ]] && quick_runtime_check; then
    log 'Dependencies are already ready; npm install is not needed.'; return
  fi
  clear_blocking_environment
  log 'Installing the lockfile with all lifecycle scripts disabled...'
  run_npm ci --ignore-scripts=true --audit=false --fund=false
  npm_major="$($NPM_BIN --version | cut -d. -f1)"
  log 'Running only the reviewed install scripts: electron, esbuild and node-pty...'
  if ((npm_major >= 12)); then run_npm rebuild electron esbuild node-pty --foreground-scripts --strict-allow-scripts
  else run_npm rebuild electron esbuild node-pty --foreground-scripts; fi
  log 'Checking the Node-side dependencies...'; run_npm run doctor
  rebuild_bin="$ROOT_DIR/node_modules/.bin/electron-rebuild"
  [[ -x "$rebuild_bin" ]] || die 'electron-rebuild was not installed from package-lock.json.'
  log 'Rebuilding node-pty for Electron...'; (cd -- "$ROOT_DIR" && "$rebuild_bin" --force --which-module node-pty)
  electron_path="$(cd -- "$ROOT_DIR" && "$NODE_BIN" -e "process.stdout.write(require('electron'))")"
  [[ -x "$electron_path" ]] || die "Electron executable is missing after installation: $electron_path"
  (cd -- "$ROOT_DIR" && ELECTRON_RUN_AS_NODE=1 "$electron_path" -e "const p=require('node-pty');if(typeof p.spawn!=='function')throw new Error('node-pty spawn() is unavailable')")
  mkdir -p -- "$STATE_DIR"; stamp_tmp="$INSTALL_STAMP.tmp"; expected_install_stamp > "$stamp_tmp"; mv -- "$stamp_tmp" "$INSTALL_STAMP"
  log 'Dependencies and Electron native modules are ready.'
}

setup_project() { detect_platform; ensure_system_deps; ensure_node; ensure_python; install_dependencies; }
run_npm_with_extra_args() { if ((${#EXTRA_ARGS[@]} > 0)); then run_npm "$@" -- "${EXTRA_ARGS[@]}"; else run_npm "$@"; fi; }

main() {
  parse_args "$@"
  case "$COMMAND" in
    help) usage ;;
    clean) rm -rf -- "$ROOT_DIR/node_modules" "$ROOT_DIR/out" "$ROOT_DIR/dist" "$INSTALL_STAMP"; log 'Removed dependencies and generated builds; kept the private toolchains.' ;;
    purge) rm -rf -- "$ROOT_DIR/node_modules" "$ROOT_DIR/out" "$ROOT_DIR/dist" "$STATE_DIR"; log 'Removed dependencies, generated builds and the private toolchains.' ;;
    toolchain) detect_platform; ensure_node; ensure_python; log "Node: $($NODE_BIN --version); npm: $($NPM_BIN --version); Python: $("$PYTHON_BIN" --version 2>&1)" ;;
    setup) setup_project ;;
    doctor) setup_project; run_npm run doctor ;;
    typecheck) setup_project; run_npm run typecheck ;;
    test) setup_project; run_npm_with_extra_args test ;;
    build) setup_project; run_npm_with_extra_args run build ;;
    ci) setup_project; run_npm run typecheck; run_npm test; run_npm run build ;;
    dist) setup_project; run_npm_with_extra_args run dist ;;
    dev) setup_project; run_npm_with_extra_args run dev ;;
  esac
}

main "$@"
