#!/bin/bash
# macOS CEP updater. No installation occurs without --install and terminal approval.
set -euo pipefail
umask 077
repo='https://github.com/rodrigoblergh/expression-studio'

studio_json() {
  /usr/bin/osascript -l JavaScript - "$@" <<'JXA'
ObjC.import('Foundation');
function run(argv) {
  var raw = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null);
  if (!raw) throw new Error('Could not read JSON.');
  var d = JSON.parse(ObjC.unwrap(raw).replace(/^\uFEFF/, ''));
  var repo = 'https://github.com/rodrigoblergh/expression-studio';
  if (argv[1] === 'release') {
    if (d.draft || d.prerelease || !/^v\d+\.\d+\.\d+$/.test(d.tag_name)) throw new Error('Invalid stable release.');
    var v = d.tag_name.slice(1), names = ['Expression-Studio-' + v + '.zip', 'SHA256SUMS.txt', 'update-manifest.json', 'update-manifest.sig'];
    names.forEach(function(name) {
      var matches = d.assets.filter(function(a) { return a.name === name; });
      if (matches.length !== 1 || matches[0].browser_download_url !== repo + '/releases/download/' + d.tag_name + '/' + name) throw new Error('Missing or unexpected release asset.');
    });
    return v;
  }
  var version = argv[2];
  if (d.schemaVersion !== 1 || d.extensionId !== 'com.aeexpressioneditor.panel' || d.version !== version ||
      d.assetName !== 'Expression-Studio-' + version + '.zip' || !/^[a-f0-9]{64}$/.test(d.sha256) ||
      typeof d.size !== 'number' || d.size !== Math.floor(d.size) || d.size <= 0 || d.size > 104857600 ||
      d.releaseUrl !== repo + '/releases/tag/v' + version || !isFinite(Date.parse(d.publishedAt)) ||
      !isFinite(Date.parse(d.expiresAt)) || Date.parse(d.expiresAt) <= Date.now() ||
      Date.parse(d.publishedAt) > Date.now() + 300000 || Date.parse(d.expiresAt) <= Date.parse(d.publishedAt)) throw new Error('Invalid, expired, or mismatched signed update manifest.');
  return d.sha256 + '\t' + d.size;
}
JXA
}

studio_version() {
  local manifest="$1/CSXS/manifest.xml" identity version
  [ -f "$manifest" ] || { echo 'Extension manifest missing.' >&2; return 1; }
  # DTDs are forbidden; do not resolve entities from an installed or downloaded manifest.
  if /usr/bin/grep -qi '<!DOCTYPE\|<!ENTITY' "$manifest"; then echo 'Unsafe manifest XML.' >&2; return 1; fi
  identity=$(/usr/bin/xmllint --nonet --xpath 'string(/ExtensionManifest/@ExtensionBundleId)' "$manifest")
  version=$(/usr/bin/xmllint --nonet --xpath 'string(/ExtensionManifest/@ExtensionBundleVersion)' "$manifest")
  [ "$identity" = 'com.aeexpressioneditor.panel' ] && [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Wrong extension identity or version.' >&2; return 1; }
  printf '%s\n' "$version"
}

studio_validate_zip() {
  local archive="$1" list="$2" name part total
  /usr/bin/zipinfo -1 "$archive" > "$list"
  [ "$(/usr/bin/wc -l < "$list" | /usr/bin/tr -d ' ')" -le 5000 ] || return 1
  if [ -n "$(LC_ALL=C /usr/bin/sort -f "$list" | /usr/bin/uniq -di)" ]; then echo 'Duplicate archive paths.' >&2; return 1; fi
  while IFS= read -r name; do
    case "$name" in AE-ExpressionEditor/) continue;; AE-ExpressionEditor/*) ;; *) echo 'Unexpected archive root.' >&2; return 1;; esac
    case "$name" in *\\*|*:*|*[[:cntrl:]]*|*'//'*) echo 'Unsafe archive path.' >&2; return 1;; esac
    name=${name#AE-ExpressionEditor/}; name=${name%/}
    local oldIFS="$IFS"; IFS='/'; read -ra parts <<< "$name"; IFS="$oldIFS"
    for part in "${parts[@]}"; do
      case "$part" in ''|.|..|*'.'|*' ') echo 'Unsafe archive component.' >&2; return 1;; esac
    done
  done < "$list"
  if /usr/bin/zipinfo -l "$archive" | /usr/bin/grep -Eq '^[^d-][rwxstST-]{9}[[:space:]]'; then echo 'Links or special files in archive.' >&2; return 1; fi
  total=$(/usr/bin/unzip -l "$archive" | /usr/bin/tail -1 | /usr/bin/awk '{print $1}')
  [[ "$total" =~ ^[0-9]+$ ]] && [ "$total" -le 104857600 ] || { echo 'Archive too large.' >&2; return 1; }
}

studio_no_links() {
  local current="$1"
  while [ "$current" != '/' ] && [ -n "$current" ]; do
    [ ! -L "$current" ] || { echo 'Linked installation paths are not supported.' >&2; return 1; }
    current=$(/usr/bin/dirname "$current")
  done
}

studio_main() {
  [ "$(/usr/bin/uname -s)" = Darwin ] || { echo 'This updater requires macOS.' >&2; return 1; }
  local install=false
  case "${1:---check}" in --check) ;; --install) install=true;; *) echo 'Usage: update-macos.sh [--check|--install]' >&2; return 1;; esac
  [ "$#" -le 1 ] || return 1
  local target="$HOME/Library/Application Support/Adobe/CEP/extensions/AE-ExpressionEditor"
  local scriptdir installed='0.0.0' work status version zipname base answer sha size actual checksum_count backup='' stage candidate parent
  scriptdir=$(cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")" && pwd)
  studio_no_links "$target"
  if [ -e "$target" ]; then installed=$(studio_version "$target"); fi
  work=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/ExpressionStudio-update.XXXXXXXX")
  status=$(/usr/bin/curl --proto '=https' --tlsv1.2 --silent --show-error -L -w '%{http_code}' -o "$work/release.json" -H 'Accept: application/vnd.github+json' 'https://api.github.com/repos/rodrigoblergh/expression-studio/releases/latest')
  if [ "$status" = 404 ]; then echo 'No stable release is published. Nothing was installed.'; return; fi
  [ "$status" = 200 ] || { echo "GitHub update check failed (HTTP $status)." >&2; return 1; }
  version=$(studio_json "$work/release.json" release)
  # Compare numeric components without relying on GNU sort -V.
  if /usr/bin/awk -v a="$installed" -v b="$version" 'BEGIN {split(a,x,".");split(b,y,".");for(i=1;i<=3;i++){if(x[i]+0>y[i]+0)exit 0;if(x[i]+0<y[i]+0)exit 1;}exit 0;}'; then echo "Expression Studio $installed is up to date."; return; fi
  echo "Update available: $installed -> $version. $repo/releases/tag/v$version"
  if ! $install; then echo 'Check only. Run with --install to review and approve installation.'; return; fi
  if /usr/bin/pgrep -f '/Adobe After Effects[^/]*/.*Contents/MacOS/' >/dev/null; then echo 'Save your project and close After Effects first. No application was closed.' >&2; return 1; fi
  [ -t 0 ] || { echo 'Installation requires interactive terminal approval.' >&2; return 1; }
  printf 'Install Expression Studio %s with a backup of existing files? Type INSTALL: ' "$version"
  IFS= read -r answer
  [ "$answer" = INSTALL ] || { echo 'Cancelled. Nothing was installed.'; return; }
  [ -f "$scriptdir/update-public.pem" ] || { echo 'Bundled update verification key is missing.' >&2; return 1; }
  zipname="Expression-Studio-$version.zip"; base="$repo/releases/download/v$version"
  local asset
  for asset in "$zipname" SHA256SUMS.txt update-manifest.json update-manifest.sig; do
    /usr/bin/curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error -L "$base/$asset" -o "$work/$asset"
  done
  /usr/bin/openssl base64 -d -A -in "$work/update-manifest.sig" -out "$work/signature.bin"
  /usr/bin/openssl dgst -sha256 -verify "$scriptdir/update-public.pem" -signature "$work/signature.bin" "$work/update-manifest.json" >/dev/null
  IFS=$'\t' read -r sha size <<< "$(studio_json "$work/update-manifest.json" manifest "$version")"
  [[ "$sha" =~ ^[a-f0-9]{64}$ ]] && [[ "$size" =~ ^[0-9]+$ ]] || return 1
  [ "$(/usr/bin/stat -f '%z' "$work/$zipname")" = "$size" ] || { echo 'Package size mismatch.' >&2; return 1; }
  actual=$(/usr/bin/shasum -a 256 "$work/$zipname" | /usr/bin/awk '{print $1}')
  [ "$actual" = "$sha" ] || { echo 'Package signature hash mismatch.' >&2; return 1; }
  checksum_count=$(/usr/bin/awk -v hash="$sha" -v name="$zipname" '$1==hash && ($2==name || $2=="*"name) {n++} END {print n+0}' "$work/SHA256SUMS.txt")
  [ "$checksum_count" = 1 ] || { echo 'Missing or ambiguous checksum.' >&2; return 1; }
  studio_validate_zip "$work/$zipname" "$work/paths.txt"
  stage="$work/stage"; /bin/mkdir "$stage"
  /usr/bin/unzip -q -n "$work/$zipname" -d "$stage"
  [ -z "$(/usr/bin/find "$stage" -type l -print)" ] || { echo 'Extracted links are forbidden.' >&2; return 1; }
  [ "$(studio_version "$stage/AE-ExpressionEditor")" = "$version" ] && [ -f "$stage/AE-ExpressionEditor/index.html" ] || return 1
  if /usr/bin/pgrep -f '/Adobe After Effects[^/]*/.*Contents/MacOS/' >/dev/null; then echo 'After Effects started during download. Close it and retry.' >&2; return 1; fi
  studio_no_links "$target"
  parent=$(/usr/bin/dirname "$target"); /bin/mkdir -p "$parent"
  candidate=$(/usr/bin/mktemp -d "$parent/.ExpressionStudio-stage.XXXXXXXX")
  /bin/cp -R "$stage/AE-ExpressionEditor" "$candidate/payload"
  [ "$(studio_version "$candidate/payload")" = "$version" ] || return 1
  if [ -e "$target" ]; then
    [ "$(studio_version "$target")" = "$installed" ] || { echo 'Installed version changed; check again.' >&2; return 1; }
    local backups="$HOME/Library/Application Support/ExpressionStudio/backups"
    studio_no_links "$backups"; /bin/mkdir -p "$backups"
    backup=$(/usr/bin/mktemp -d "$backups/$installed.XXXXXXXX")
    /bin/mv "$target" "$backup/AE-ExpressionEditor"
  fi
  if ! /bin/mv "$candidate/payload" "$target"; then
    if [ -n "$backup" ] && [ ! -e "$target" ]; then
      /bin/mv "$backup/AE-ExpressionEditor" "$target"
      echo 'Installation failed; previous extension restored.' >&2
    else
      echo "Installation failed. Previous files, if any, are at: $backup" >&2
    fi
    return 1
  fi
  echo "Installed Expression Studio $version. Reopen After Effects. CEP preferences were preserved."
  [ -z "$backup" ] || echo "Previous files retained at: $backup"
  echo "Downloaded files retained at: $work"
}
if [ "${BASH_SOURCE[0]}" = "$0" ]; then studio_main "$@"; fi
