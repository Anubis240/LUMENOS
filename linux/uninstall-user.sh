#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) != 0 ]] || { echo 'Run this as the desktop user without sudo.' >&2; exit 1; }
prefix=$(realpath -m "$HOME/.local/share/lumen-os")
app="$prefix/app"
[[ -f "$app/.lumen-owned" && $(cat "$app/.lumen-owned") == lumen-user-install-v1 ]] || { echo 'No managed user installation found; nothing removed.'; exit 1; }
[[ ! -L "$app" && $(realpath "$app") == "$app" && "$prefix" == "$(realpath "$HOME")/.local/share/lumen-os" ]] || { echo 'Unexpected installation path; refusing removal.' >&2; exit 1; }
# Stop only this user's Lumen unit. Do not alter an installed system session.
systemctl --user stop lumen.service || true
for name in lumen-service lumen-shell lumen-health; do
  target="$HOME/.local/bin/$name"
  if [[ -f "$target" ]] && cmp -s "$target" "$app/linux/bin/$name"; then rm -- "$target"; else printf 'Preserved modified or absent launcher: %s\n' "$target"; fi
done
unit="$HOME/.config/systemd/user/lumen.service"
if [[ -f "$unit" ]] && grep -qx 'ExecStart=%h/.local/bin/lumen-service' "$unit"; then rm -- "$unit"; fi
desktop="$HOME/.local/share/applications/lumen.desktop"
if [[ -f "$desktop" ]] && grep -qx 'StartupWMClass=LumenOS' "$desktop"; then rm -- "$desktop"; fi
rm -r -- "$app"
systemctl --user daemon-reload
printf 'Application removed. Browser profile, state, downloaded models and keyring credentials are preserved.\n'
printf 'To erase API keys, remove them in Lumen Settings before uninstalling, or remove the Lumen OS API credentials item in Passwords and Keys.\n'
