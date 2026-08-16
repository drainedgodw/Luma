#!/usr/bin/env bash
# Update the AUR luma-bin package for a released version.
# Usage: update-aur.sh <version-without-v>
set -euo pipefail

VERSION="$1"
REPO="drainedgodw/Luma"
ASSET_BASE="https://github.com/${REPO}/releases/download/v${VERSION}"
CLONE=$(mktemp -d)

git clone "ssh://aur@aur.archlinux.org/luma-bin.git" "$CLONE"
cd "$CLONE"

APPIMAGE="luma-${VERSION}.AppImage"
URL="${ASSET_BASE}/${APPIMAGE}"
SHA=$(curl -sL "${ASSET_BASE}/SHA256SUMS.txt" | grep "${APPIMAGE}" | awk '{print $1}')

cat > PKGBUILD <<EOF
# Maintainer: Luma contributors <https://github.com/${REPO}>
pkgname=luma-bin
pkgver=${VERSION}
pkgrel=1
pkgdesc='Luma — a visual Git-first IDE (prebuilt AppImage)'
arch=('x86_64')
url='https://github.com/${REPO}'
license=('MIT')
depends=('electron33' 'git' 'hicolor-icon-theme' 'nss' 'atk' 'at-spi2-atk' 'libcups' 'libdrm' 'libxkbcommon' 'libxrandr' 'libxcomposite' 'libxdamage' 'pango' 'alsa-lib' 'mesa')
provides=('luma')
conflicts=('luma' 'luma-git')
source=("${URL}")
sha256sums=('${SHA}')
noextract=("${APPIMAGE}")

package() {
  install -Dm755 "${srcdir}/${APPIMAGE}" "\$pkgdir/usr/lib/luma/luma.AppImage"
  install -Dm644 /dev/null "\$pkgdir/usr/share/applications/luma.desktop"
  cat > "\$pkgdir/usr/share/applications/luma.desktop" <<DESKTOP
[Desktop Entry]
Name=Luma
Comment=Visual Git-first IDE
Exec=/usr/lib/luma/luma.AppImage --ozone-platform-hint=auto %U
Type=Application
Categories=Development;
Icon=luma
DESKTOP
  # AppImage self-extracts its icons; extract a simple one for the menu
  "\$srcdir/\$APPIMAGE" --appimage-extract '*.png' >/dev/null 2>&1 || true
  find squashfs-root -name '*.png' -size +2k -print -quit 2>/dev/null | while read -r icon; do
    install -Dm644 "\$icon" "\$pkgdir/usr/share/icons/hicolor/512x512/apps/luma.png"
  done || true
}
EOF

# source URL has spaces-safe names; add .SRCINFO
makepkg --printsrcinfo > .SRCINFO

git add PKGBUILD .SRCINFO
git commit -m "Update to ${VERSION}"
git push
echo "AUR luma-bin updated to ${VERSION}"
