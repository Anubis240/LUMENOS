#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) != 0 ]] || { echo 'Run this as your desktop user without sudo.' >&2; exit 1; }
source_app=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
export PATH="/opt/lumen-node/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
for tool in node chromium secret-tool systemctl curl; do command -v "$tool" >/dev/null || { echo "Missing $tool. Install dependencies described in LINUX.md." >&2; exit 1; }; done
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo 'Node.js 22 or later is required.' >&2; exit 1; }
systemctl --user show-environment >/dev/null || { echo 'Run inside your graphical login session.' >&2; exit 1; }
prefix="$HOME/.local/share/lumen-os"
app="$prefix/app"
[[ ! -e "$app" ]] || { echo 'Lumen is already installed. Use uninstall-user.sh first; it preserves your state and browser profile.' >&2; exit 1; }
for name in lumen-service lumen-shell lumen-health; do
  [[ ! -e "$HOME/.local/bin/$name" ]] || { echo "Existing launcher would be overwritten: $name" >&2; exit 1; }
done
for file in "$HOME/.config/systemd/user/lumen.service" "$HOME/.local/share/applications/lumen.desktop"; do
  [[ ! -e "$file" ]] || { echo "Existing file would be overwritten: $file" >&2; exit 1; }
done
umask 077
mkdir -p "$prefix" "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.config/systemd/user"
bash "$source_app/linux/copy-payload.sh" "$source_app" "$app"
for name in lumen-service lumen-shell lumen-health; do install -m 0755 "$app/linux/bin/$name" "$HOME/.local/bin/$name"; done
sed 's|@LUMEN_SERVICE@|%h/.local/bin/lumen-service|' "$app/linux/systemd/lumen.service.in" > "$HOME/.config/systemd/user/lumen.service"
# Desktop entries do not expand $HOME; use a quoted absolute path, escaping the desktop-entry syntax.
LUMEN_DESKTOP_ROOT="$HOME" node -e 'const fs=require("fs"); const h=process.env.LUMEN_DESKTOP_ROOT; const q=s=>"\""+s.replace(/[\\"`$]/g,"\\$&").replace(/%/g,"%%")+"\""; fs.writeFileSync(h+"/.local/share/applications/lumen.desktop",`[Desktop Entry]\nType=Application\nName=Lumen OS\nComment=AI desktop\nExec=${q(h+"/.local/bin/lumen-shell")}\nIcon=applications-science\nTerminal=false\nCategories=Utility;\nStartupWMClass=LumenOS\n`);'
systemctl --user daemon-reload
printf '\nLumen installed for this user. Open Lumen OS from your application menu, or run:\n  %s/.local/bin/lumen-shell\n' "$HOME"
printf 'No auto-start or login setting was changed. Keys belong in Settings > AI & Voice.\n'
