#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 ]] || { echo 'Usage: bash linux/stage-iso.sh /var/tmp/lumen-build-UNIQUE' >&2; exit 2; }
source_app=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
destination=$(realpath -m "$1")
[[ "$destination" == /var/tmp/lumen-build-* && ! -e "$destination" ]] || { echo 'Use a new /var/tmp/lumen-build-NAME directory. Existing builds are never overwritten.' >&2; exit 1; }
[[ $(uname -m) == x86_64 ]] || { echo 'This image recipe currently supports x86_64 build hosts only.' >&2; exit 1; }
for tool in lb curl tar xz zstd sha256sum; do command -v "$tool" >/dev/null || { echo "Missing build tool: $tool" >&2; exit 1; }; done
source "$source_app/linux/runtime-version.env"
mkdir -p "$destination"
printf 'lumen-live-build-v1\n' > "$destination/.lumen-build"
cp -R "$source_app/linux/live-build/auto" "$source_app/linux/live-build/config" "$destination/"
chmod +x "$destination/auto/config" "$destination/config/hooks/live/0900-lumen.hook.chroot"
rootfs="$destination/config/includes.chroot"
bash "$source_app/linux/copy-payload.sh" "$source_app" "$rootfs/opt/lumen-os"
mkdir -p "$rootfs/usr/local/bin" "$rootfs/usr/lib/systemd/user" "$rootfs/usr/share/xsessions" "$rootfs/usr/share/applications" "$rootfs/usr/share/pixmaps" "$rootfs/usr/share/themes/Lumen/gtk-3.0" "$rootfs/usr/share/backgrounds/lumen" "$rootfs/usr/share/plymouth/themes/lumen" "$rootfs/etc/calamares/branding/lumen" "$rootfs/etc/xdg/autostart" "$rootfs/etc/lightdm/lightdm-gtk-greeter.conf.d" "$rootfs/etc/skel/.config/gtk-3.0" "$rootfs/etc/skel/.config/gtk-4.0" "$rootfs/etc/skel/.config/xfce4/terminal" "$rootfs/opt/lumen-node" "$destination/vendor"
for file in "$source_app/linux/bin/"*; do install -m 0755 "$file" "$rootfs/usr/local/bin/$(basename "$file")"; done
sed 's|@LUMEN_SERVICE@|/usr/local/bin/lumen-service|' "$source_app/linux/systemd/lumen.service.in" > "$rootfs/usr/lib/systemd/user/lumen.service"
install -m 0644 "$source_app/linux/desktop/lumen.desktop" "$rootfs/usr/share/applications/lumen.desktop"
install -m 0644 "$source_app/linux/desktop/lumen-installer.desktop" "$rootfs/usr/share/applications/lumen-installer.desktop"
install -m 0644 "$source_app/assets/lumen-oauth-logo-120.png" "$rootfs/usr/share/pixmaps/lumen-installer.png"
install -m 0644 "$source_app/assets/lumen-oauth-logo-120.png" "$rootfs/etc/calamares/branding/lumen/lumen.png"
install -m 0644 "$source_app/linux/theme/plymouth/lumen-splash.png" "$rootfs/etc/calamares/branding/lumen/lumen-welcome.png"
install -m 0644 "$source_app/linux/installer/branding/lumen/branding.desc" "$source_app/linux/installer/branding/lumen/stylesheet.qss" "$source_app/linux/installer/branding/lumen/show.qml" "$rootfs/etc/calamares/branding/lumen/"
install -m 0644 "$source_app/linux/desktop/lumen-session.desktop" "$rootfs/usr/share/xsessions/lumen.desktop"
install -m 0644 "$source_app/linux/desktop/lumen-autostart.desktop" "$rootfs/etc/xdg/autostart/lumen-shell.desktop"
install -m 0644 "$source_app/linux/desktop/lumen-theme.desktop" "$rootfs/etc/xdg/autostart/lumen-theme.desktop"
install -m 0644 "$source_app/linux/theme/gtk-3.0/gtk.css" "$rootfs/usr/share/themes/Lumen/gtk-3.0/gtk.css"
install -m 0644 "$source_app/linux/theme/index.theme" "$rootfs/usr/share/themes/Lumen/index.theme"
install -m 0644 "$source_app/linux/theme/gtk-3.0/gtk.css" "$rootfs/etc/skel/.config/gtk-3.0/gtk.css"
install -m 0644 "$source_app/linux/theme/gtk-3.0/settings.ini" "$rootfs/etc/skel/.config/gtk-3.0/settings.ini"
install -m 0644 "$source_app/linux/theme/gtk-4.0/gtk.css" "$rootfs/etc/skel/.config/gtk-4.0/gtk.css"
install -m 0644 "$source_app/linux/theme/terminalrc" "$rootfs/etc/skel/.config/xfce4/terminal/terminalrc"
install -m 0644 "$source_app/linux/theme/plymouth/lumen.plymouth" "$source_app/linux/theme/plymouth/lumen.script" "$source_app/linux/theme/plymouth/lumen-splash.png" "$rootfs/usr/share/plymouth/themes/lumen/"
install -m 0644 "$source_app/linux/theme/plymouth/lumen-splash.png" "$rootfs/usr/share/backgrounds/lumen/lumen-splash.png"
cat > "$rootfs/etc/lightdm/lightdm-gtk-greeter.conf.d/60-lumen-theme.conf" <<'EOF'
[greeter]
theme-name=Lumen
icon-theme-name=Papirus-Dark
font-name=Noto Sans 10
background=/usr/share/backgrounds/lumen/lumen-splash.png
EOF
archive="node-v$LUMEN_NODE_VERSION-linux-x64.tar.xz"
curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --output "$destination/vendor/$archive" "https://nodejs.org/dist/v$LUMEN_NODE_VERSION/$archive"
printf '%s  %s\n' "$LUMEN_NODE_SHA256" "$destination/vendor/$archive" | sha256sum --check -
tar -xJf "$destination/vendor/$archive" -C "$rootfs/opt/lumen-node" --strip-components=1 "node-v$LUMEN_NODE_VERSION-linux-x64/bin/node" "node-v$LUMEN_NODE_VERSION-linux-x64/LICENSE" "node-v$LUMEN_NODE_VERSION-linux-x64/README.md"
"$rootfs/opt/lumen-node/bin/node" --version
ollama_archive="ollama-linux-amd64.tar.zst"
curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --output "$destination/vendor/$ollama_archive" "https://github.com/ollama/ollama/releases/download/v$LUMEN_OLLAMA_VERSION/$ollama_archive"
printf '%s  %s\n' "$LUMEN_OLLAMA_SHA256" "$destination/vendor/$ollama_archive" | sha256sum --check -
mkdir -p "$rootfs/opt/lumen-ollama"
tar --zstd --no-same-owner -xf "$destination/vendor/$ollama_archive" --exclude='lib/ollama/cuda*' --exclude='lib/ollama/vulkan*' --exclude='lib/ollama/rocm*' -C "$rootfs/opt/lumen-ollama"
install -m 0644 "$source_app/linux/systemd/lumen-offline.service" "$rootfs/usr/lib/systemd/user/lumen-offline.service"
# The engine is available on demand; no model or startup enablement is included.
(cd "$rootfs/opt/lumen-os" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > "$destination/LUMEN-PAYLOAD-SHA256.txt"
(cd "$destination" && lb config)
printf '\nStaged %s\nBuild with: sudo bash %s/linux/build-iso.sh %s\n' "$destination" "$source_app" "$destination"
