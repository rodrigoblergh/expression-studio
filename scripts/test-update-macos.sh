#!/bin/bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/update-macos.sh"
[ "$(uname -s)" = Darwin ] || { echo 'SKIP: macOS updater tests require macOS.'; exit 0; }
work=$(mktemp -d "${TMPDIR:-/tmp}/ExpressionStudio-tests.XXXXXXXX")
mkdir -p "$work/package/AE-ExpressionEditor/CSXS"
printf '%s' '<ExtensionManifest ExtensionBundleId="com.aeexpressioneditor.panel" ExtensionBundleVersion="1.2.3"/>' > "$work/package/AE-ExpressionEditor/CSXS/manifest.xml"
printf '%s' '<html></html>' > "$work/package/AE-ExpressionEditor/index.html"
(cd "$work/package" && zip -qr "$work/valid.zip" AE-ExpressionEditor)
studio_validate_zip "$work/valid.zip" "$work/valid-list"
[ "$(studio_version "$work/package/AE-ExpressionEditor")" = 1.2.3 ]
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
echo "PASS: macOS updater path, identity, expiry, signature and tamper fixtures. Fixtures: $work"
