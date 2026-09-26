#!/usr/bin/env bash
set -euo pipefail

build_dir="${1:-/var/tmp/lumen-build-installer-060}"
iso_path="$build_dir/lumen-os-preview-amd64.hybrid.iso"

stat -c 'ISO_SIZE_BYTES=%s' "$iso_path"
sha256sum "$iso_path"

test -x "$build_dir/chroot/usr/bin/calamares-install-debian"
test -x "$build_dir/chroot/usr/local/bin/lumen-installer"
test -f "$build_dir/chroot/usr/share/applications/lumen-installer.desktop"
test -f "$build_dir/chroot/etc/calamares/branding/lumen/branding.desc"
test -f "$build_dir/chroot/etc/calamares/branding/lumen/show.qml"
test -f "$build_dir/chroot/etc/calamares/branding/lumen/lumen-welcome.png"
test -f "$build_dir/chroot/usr/share/pixmaps/lumen-installer.png"

grep -n '^[[:space:]]*branding:' "$build_dir/chroot/etc/calamares/settings.conf"
grep -nE '^(Name|Exec|TryExec|Icon)=' \
  "$build_dir/chroot/usr/share/applications/lumen-installer.desktop"
grep -nE '^(componentName|strings:| *productName:| *shortProductName:| *version:)' \
  "$build_dir/chroot/etc/calamares/branding/lumen/branding.desc"
grep -E '^(calamares|calamares-settings-debian)[[:space:]]' \
  "$build_dir/binary/live/filesystem.packages"

unsquashfs -cat "$build_dir/binary/live/filesystem.squashfs" \
  usr/share/applications/lumen-installer.desktop | grep -q '^Exec=/usr/local/bin/lumen-installer$'
unsquashfs -cat "$build_dir/binary/live/filesystem.squashfs" \
  etc/calamares/settings.conf | grep -q '^branding: lumen$'
unsquashfs -cat "$build_dir/binary/live/filesystem.squashfs" \
  etc/calamares/branding/lumen/branding.desc | grep -q '^slideshow: "show.qml"$'
unsquashfs -cat "$build_dir/binary/live/filesystem.squashfs" \
  usr/local/bin/lumen-installer | grep -q '^#!/bin/sh$'

printf 'PASS: ISO includes the Lumen Calamares wrapper, branding, slideshow, artwork, and launcher.\n'
