#!/usr/bin/env bash
# Update the AUR luma-ide-bin package from an existing GitHub release.
# Usage: update-aur.sh <release-version-without-v>
set -euo pipefail

RELEASE_VERSION="$1"
PKGVER="${RELEASE_VERSION//-/_}"
REPO="drainedgodw/Luma"
AUR_PACKAGE="luma-ide-bin"
ASSET_BASE="{{https://github.com/${REPO}}}/releases/download/v${RELEASE_VERSION}"
CLONE=$(mktemp -d)
trap 'rm -rf "$CLONE"' EXIT

CHECKSUMS=$(curl --fail --silent --show-error --location "${ASSET_BASE}/SHA256SUMS.txt")
APPIMAGE=$(printf '%s\n' "$CHECKSUMS" | awk '$2 ~ /\.AppImage$/ {print $2; exit}')
SHA=$(printf '%s\n' "$CHECKSUMS" | awk '$2 ~ /\.AppImage$/ {print $1; exit}')
if [[ -z "$APPIMAGE" || -z "$SHA" ]]; then
  echo "Could not resolve AppImage and checksum for v${RELEASE_VERSION}" >&2
  exit 1
fi

SOURCE_NAME="luma-ide-${PKGVER}.AppImage"
URL="${ASSET_BASE}/${APPIMAGE}"
git clone "ssh://aur@aur.archlinux.org/${AUR_PACKAGE}.git" "$CLONE"
cd "$CLONE"

cat > PKGBUILD <<EOF
# Maintainer: Luma contributors <{{https://github.com/${REPO}}}>
pkgname=luma-ide-bin
pkgver=${PKGVER}
pkgrel=1
pkgdesc='Luma — a visual Git-first IDE (prebuilt AppImage)'
arch=('x86_64')
url='{{https://github.com/${REPO}}}'
license=('MIT')
depends=('git' 'fuse2' 'hicolor-icon-theme')
provides=('luma-ide' 'luma')
conflicts=('luma-ide' 'luma-git')
source=("${SOURCE_NAME}::${URL}")
sha256sums=('${SHA}')
noextract=("${SOURCE_NAME}")

package() {
  install -Dm755 "\${srcdir}/${SOURCE_NAME}" "\${pkgdir}/usr/lib/luma/Luma.AppImage"
  install -Dm755 /dev/stdin "\${pkgdir}/usr/bin/luma" <<'WRAPPER'
#!/usr/bin/env bash
exec /usr/lib/luma/Luma.AppImage --ozone-platform-hint=auto "\$@"
WRAPPER
  install -Dm644 /dev/stdin "\${pkgdir}/usr/share/applications/luma.desktop" <<'DESKTOP'
[Desktop Entry]
Name=Luma
Comment=Visual Git-first IDE
Exec=luma %U
Terminal=false
Type=Application
Categories=Development;IDE;
Icon=luma
DESKTOP
  "\${srcdir}/${SOURCE_NAME}" --appimage-extract '*.png' >/dev/null 2>&1 || true
  find squashfs-root -name '*.png' -size +2k -print -quit 2>/dev/null | while read -r icon; do
    install -Dm644 "\$icon" "\${pkgdir}/usr/share/icons/hicolor/512x512/apps/luma.png"
  done || true
}
EOF

makepkg --printsrcinfo > .SRCINFO
git add PKGBUILD .SRCINFO
if git diff --cached --quiet; then
  echo "AUR ${AUR_PACKAGE} is already at ${PKGVER}"
  exit 0
fi
git commit -m "Update to ${PKGVER}"
git push
echo "AUR ${AUR_PACKAGE} updated to ${PKGVER} from v${RELEASE_VERSION}"
