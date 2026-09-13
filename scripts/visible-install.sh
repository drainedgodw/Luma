#!/usr/bin/env bash
# Fish-safe visible wrapper for the remote Linux installer.
# Usage: curl .../visible-install.sh | bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly URL="${LUMA_INSTALL_URL:-https://raw.githubusercontent.com/drainedgodw/luma-ide-linux/main/install.sh}"
tmp="$(mktemp "${TMPDIR:-/tmp}/luma-installer.XXXXXX.sh")"
cleanup() { rm -f -- "$tmp"; }
trap cleanup EXIT INT TERM

printf '[Luma bootstrap] Downloading installer from %s\n' "$URL"
if command -v curl >/dev/null 2>&1; then
  curl --fail --location --show-error --progress-bar --retry 3 --connect-timeout 15 --output "$tmp" "$URL"
elif command -v wget >/dev/null 2>&1; then
  wget --https-only --tries=3 --timeout=15 --show-progress --output-document="$tmp" "$URL"
else
  printf '[Luma bootstrap] Error: curl or wget is required.\n' >&2
  exit 1
fi

printf '[Luma bootstrap] Running installer with Bash (safe from fish).\n'
if [[ "${LUMA_TRACE:-0}" == 1 ]]; then
  PS4='+ ${BASH_SOURCE##*/}:${LINENO}: '
  export PS4
  bash -x "$tmp" "$@"
else
  bash "$tmp" "$@"
fi
