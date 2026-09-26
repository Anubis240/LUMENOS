#!/usr/bin/env bash
# Called only with an empty destination. Never copies private runtime state.
set -euo pipefail
[[ $# == 2 ]] || { echo 'Usage: copy-payload.sh SOURCE_APP EMPTY_DESTINATION' >&2; exit 2; }
source_app=$(realpath "$1")
destination=$(realpath -m "$2")
[[ -f "$source_app/serve.cjs" && -d "$source_app/backend" ]] || { echo 'Not a Lumen application source.' >&2; exit 1; }
[[ ! -e "$destination" ]] || { echo 'Payload destination must not already exist.' >&2; exit 1; }
mkdir -p "$destination/backend"
shopt -s nullglob
for file in "$source_app"/*.html "$source_app"/*.js "$source_app"/*.css "$source_app"/*.md "$source_app"/*.cjs; do
  cp -- "$file" "$destination/"
done
while IFS= read -r -d '' file; do
  relative=${file#"$source_app/"}
  mkdir -p "$destination/$(dirname "$relative")"
  cp -- "$file" "$destination/$relative"
done < <(find "$source_app/backend" -type f -name '*.cjs' -print0)
cp -R -- "$source_app/linux" "$destination/linux"
printf 'lumen-user-install-v1\n' > "$destination/.lumen-owned"
