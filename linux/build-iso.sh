#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 ]] || { echo 'Usage: sudo bash linux/build-iso.sh /var/tmp/lumen-build-NAME' >&2; exit 2; }
[[ $(id -u) == 0 ]] || { echo 'live-build needs root inside the dedicated Debian build environment.' >&2; exit 1; }
build=$(realpath "$1")
[[ "$build" == /var/tmp/lumen-build-* && -f "$build/.lumen-build" && $(cat "$build/.lumen-build") == lumen-live-build-v1 ]] || { echo 'Not a managed Lumen build directory.' >&2; exit 1; }
for tool in lb debootstrap mksquashfs xorriso; do command -v "$tool" >/dev/null || { echo "Missing build tool: $tool" >&2; exit 1; }; done
cd "$build"
test -f config/includes.chroot/opt/lumen-os/serve.cjs
test -x config/includes.chroot/opt/lumen-node/bin/node
# APT options do not apply to debootstrap, which downloads through wget.
# Keep these settings local to this build; preserve TLS and signature checks.
cat > "$build/wgetrc" <<'EOF'
inet4_only = on
connect_timeout = 15
read_timeout = 45
tries = 3
waitretry = 1
EOF
export WGETRC="$build/wgetrc"
lb build 2>&1 | tee build.log
shopt -s nullglob
images=("$build"/*.iso)
((${#images[@]})) || { echo 'live-build returned without an ISO.' >&2; exit 1; }
sha256sum "${images[@]}" > "$build/SHA256SUMS"
printf '\nImage build finished. Verify the VM acceptance checklist in LINUX.md before installing anywhere.\n'
printf '%s\n' "${images[@]}"
