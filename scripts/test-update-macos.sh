#!/bin/bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/update-macos.sh"
[ "$(uname -s)" = Darwin ] || { echo 'SKIP: macOS updater tests require macOS.'; exit 0; }
work=$(mktemp -d "${TMPDIR:-/tmp}/ExpressionStudio-tests.XXXXXXXX")
work=$(cd "$work" && pwd -P)
mkdir -p "$work/package/AE-ExpressionEditor/CSXS"
printf '%s' '<ExtensionManifest ExtensionBundleId="com.aeexpressioneditor.panel" ExtensionBundleVersion="1.2.3"/>' > "$work/package/AE-ExpressionEditor/CSXS/manifest.xml"
printf '%s' '<html></html>' > "$work/package/AE-ExpressionEditor/index.html"
(cd "$work/package" && zip -qr "$work/valid.zip" AE-ExpressionEditor)
studio_validate_zip "$work/valid.zip" "$work/valid-list"
[ "$(studio_version "$work/package/AE-ExpressionEditor")" = 1.2.3 ]

# Discovery uses both signed-installer and archive folder names, across scopes.
user_root="$work/user-extensions"; common_root="$work/common-extensions"
[ "$(studio_discover_target "$user_root" "$common_root")" = "$user_root/AE-ExpressionEditor" ]
mkdir -p "$common_root/AE Expression Editor/CSXS"
cp "$work/package/AE-ExpressionEditor/CSXS/manifest.xml" "$common_root/AE Expression Editor/CSXS/manifest.xml"
[ "$(studio_discover_target "$user_root" "$common_root")" = "$common_root/AE Expression Editor" ]
mkdir -p "$user_root/AE-ExpressionEditor/CSXS"
cp "$work/package/AE-ExpressionEditor/CSXS/manifest.xml" "$user_root/AE-ExpressionEditor/CSXS/manifest.xml"
if studio_discover_target "$user_root" "$common_root"; then echo 'Duplicate installations accepted.'; exit 1; fi
mv "$common_root/AE Expression Editor" "$work/retired-common-fixture"
[ "$(studio_discover_target "$user_root" "$common_root")" = "$user_root/AE-ExpressionEditor" ]
mv "$user_root/AE-ExpressionEditor" "$user_root/AE Expression Editor"
[ "$(studio_discover_target "$user_root" "$common_root")" = "$user_root/AE Expression Editor" ]

# Real directory replacement preserves the Adobe META-INF signature and old files.
transaction="$work/transaction"
mkdir -p "$transaction/payload/CSXS" "$transaction/payload/META-INF"
printf '%s' '<ExtensionManifest ExtensionBundleId="com.aeexpressioneditor.panel" ExtensionBundleVersion="1.2.4"/>' > "$transaction/payload/CSXS/manifest.xml"
printf new > "$transaction/payload/index.html"
printf signed-fixture > "$transaction/payload/META-INF/signatures.xml"
new_target="$transaction/common/AE Expression Editor"
mkdir -p "$new_target/CSXS" "$new_target/META-INF"
cp "$work/package/AE-ExpressionEditor/CSXS/manifest.xml" "$new_target/CSXS/manifest.xml"
printf old > "$new_target/index.html"; printf old-signature > "$new_target/META-INF/signatures.xml"
studio_replace_installation "$transaction/payload" "$new_target" 1.2.3 1.2.4 "$transaction/backups"
[ "$(studio_version "$new_target")" = 1.2.4 ]
[ "$(cat "$new_target/META-INF/signatures.xml")" = signed-fixture ]
[ "$(find "$transaction/backups" -name index.html -exec cat '{}' ';')" = old ]
# Inject failure before installing and after move (post-install identity validation).
for failure_mode in before_backup before_move after_move; do
  rollback_target="$transaction/$failure_mode/AE Expression Editor"
  mkdir -p "$rollback_target/CSXS" "$rollback_target/META-INF"
  cp "$work/package/AE-ExpressionEditor/CSXS/manifest.xml" "$rollback_target/CSXS/manifest.xml"
  printf old > "$rollback_target/index.html"; printf old-signature > "$rollback_target/META-INF/signatures.xml"
  studio_move() {
    if [ "$failure_mode" = before_backup ] && [ "$(basename "$1")" = 'AE Expression Editor' ]; then return 1; fi
    if [ "$(basename "$1")" = payload ]; then
      if [ "$failure_mode" = before_move ]; then return 1; fi
      /bin/mv "$1" "$2" || return 1
      printf invalid > "$2/CSXS/manifest.xml"
      return 0
    fi
    /bin/mv "$1" "$2"
  }
  if studio_replace_installation "$transaction/payload" "$rollback_target" 1.2.3 1.2.4 "$transaction/$failure_mode-backups"; then
    echo 'Injected replacement failure was ignored.'; exit 1
  fi
  [ "$(studio_version "$rollback_target")" = 1.2.3 ]
  [ "$(cat "$rollback_target/index.html")" = old ]
  [ "$(cat "$rollback_target/META-INF/signatures.xml")" = old-signature ]
done
studio_move() { /bin/mv "$1" "$2"; }
# A payload without Adobe signing metadata cannot disable a signed installation.
mv "$transaction/payload/META-INF/signatures.xml" "$transaction/saved-signature.xml"
if studio_replace_installation "$transaction/payload" "$new_target" 1.2.4 1.2.4 "$transaction/unsigned-backups"; then echo 'Unsigned payload accepted.'; exit 1; fi
[ "$(cat "$new_target/META-INF/signatures.xml")" = signed-fixture ]

mkdir -p "$work/wrong/other"; printf bad > "$work/wrong/other/file"
(cd "$work/wrong" && zip -qr "$work/wrong.zip" other)
if studio_validate_zip "$work/wrong.zip" "$work/wrong-list"; then echo 'Wrong root was accepted.'; exit 1; fi
ln -s /tmp "$work/package/AE-ExpressionEditor/link"
(cd "$work/package" && zip -qry "$work/link.zip" AE-ExpressionEditor)
if studio_validate_zip "$work/link.zip" "$work/link-list"; then echo 'Symlink was accepted.'; exit 1; fi
if studio_no_links "$work/package/AE-ExpressionEditor/link/child"; then echo 'Linked destination accepted.'; exit 1; fi
cat > "$work/expired.json" <<'JSON'
{"schemaVersion":1,"extensionId":"com.aeexpressioneditor.panel","version":"1.2.3","assetName":"Expression-Studio-1.2.3.zip","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":100,"releaseUrl":"https://github.com/rodrigoblergh/expression-studio/releases/tag/v1.2.3","publishedAt":"2020-01-01T00:00:00Z","expiresAt":"2020-01-02T00:00:00Z"}
JSON
if studio_json "$work/expired.json" manifest 1.2.3; then echo 'Expired metadata accepted.'; exit 1; fi
printf '%s' '<!DOCTYPE ExtensionManifest [<!ENTITY bad SYSTEM "file:///etc/passwd">]><ExtensionManifest ExtensionBundleId="com.aeexpressioneditor.panel" ExtensionBundleVersion="1.2.3"/>' > "$work/package/AE-ExpressionEditor/CSXS/manifest.xml"
if studio_version "$work/package/AE-ExpressionEditor"; then echo 'DTD accepted.'; exit 1; fi
openssl genrsa -out "$work/private.pem" 3072 >/dev/null 2>&1
openssl rsa -in "$work/private.pem" -pubout -out "$work/public.pem" >/dev/null 2>&1
openssl dgst -sha256 -sign "$work/private.pem" -out "$work/sig.bin" "$work/expired.json"
openssl base64 -A -in "$work/sig.bin" -out "$work/sig.txt"
openssl base64 -d -A -in "$work/sig.txt" -out "$work/decoded.bin"
openssl dgst -sha256 -verify "$work/public.pem" -signature "$work/decoded.bin" "$work/expired.json" >/dev/null
printf ' ' >> "$work/expired.json"
if openssl dgst -sha256 -verify "$work/public.pem" -signature "$work/decoded.bin" "$work/expired.json" >/dev/null 2>&1; then echo 'Tampered signature accepted.'; exit 1; fi
echo "PASS: macOS updater discovery, replacement, rollback, identity, expiry, signature and tamper fixtures. Fixtures: $work"
