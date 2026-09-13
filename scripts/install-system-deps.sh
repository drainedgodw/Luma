#!/usr/bin/env bash
# Portable native-build dependency helper for Luma.
# Run with: bash scripts/install-system-deps.sh
# It is intentionally verbose and safe to call from fish or another shell.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[Luma deps] %s\n' "$*"; }
warn() { printf '[Luma deps] Warning: %s\n' "$*" >&2; }
die() { printf '[Luma deps] Error: %s\n' "$*" >&2; exit 1; }

as_root() {
  if ((EUID == 0)); then "$@"; return; fi
  command -v sudo >/dev/null 2>&1 || die "sudo is required for: $*"
  sudo "$@"
}

has_all() {
  local command_name
  for command_name in "$@"; do command -v "$command_name" >/dev/null 2>&1 || return 1; done
}

install_for() {
  local manager="$1"; shift
  log "Detected package manager: $manager"
  log "Installing native requirements: $*"
  case "$manager" in
    pacman) as_root pacman -S --needed --noconfirm "$@" ;;
    apt-get) as_root apt-get update; as_root apt-get install -y "$@" ;;
    dnf) as_root dnf install -y "$@" ;;
    yum) as_root yum install -y "$@" ;;
    zypper) as_root zypper --non-interactive install "$@" ;;
    apk) as_root apk add "$@" ;;
    xbps-install) as_root xbps-install -S "$@" ;;
    emerge) as_root emerge --ask=n "$@" ;;
    nix) command -v nix-env >/dev/null 2>&1 || die 'nix-env is missing'; nix-env -iA "$@" ;;
    *) die "Unsupported package manager: $manager" ;;
  esac
}

if [[ "$(uname -s)" != Linux ]]; then
  log 'This helper is for Linux. macOS uses Xcode Command Line Tools and Homebrew.'
  exit 0
fi

if has_all git make c++; then
  log 'Git, make, and a C++ compiler are already available.'
  exit 0
fi

if command -v pacman >/dev/null 2>&1; then
  install_for pacman git base-devel
elif command -v apt-get >/dev/null 2>&1; then
  install_for apt-get git build-essential
elif command -v dnf >/dev/null 2>&1; then
  install_for dnf git gcc-c++ make
elif command -v yum >/dev/null 2>&1; then
  install_for yum git gcc-c++ make
elif command -v zypper >/dev/null 2>&1; then
  install_for zypper git gcc-c++ make
elif command -v apk >/dev/null 2>&1; then
  install_for apk git build-base
elif command -v xbps-install >/dev/null 2>&1; then
  install_for xbps-install git base-devel
elif command -v emerge >/dev/null 2>&1; then
  install_for emerge dev-vcs/git sys-devel/make sys-devel/gcc
elif command -v nix-env >/dev/null 2>&1; then
  log 'Nix detected; install the toolchain in your profile or devShell.'
  install_for nix nixpkgs.git nixpkgs.gnumake nixpkgs.gcc
else
  warn 'Could not identify a supported package manager.'
  warn 'Install Git, make, and a C/C++ compiler, then rerun:'
  warn '  bash scripts/bootstrap.sh dev'
  exit 2
fi

if has_all git make c++; then
  log 'Native requirements are ready.'
else
  warn 'The package manager completed, but one or more commands are still missing.'
  warn 'Check your distribution documentation and rerun this helper.'
  exit 2
fi
