# Repository and installed updates

## Automated repository checks

- Push/PR: source and asset checks, regression tests on Windows/macOS/Linux, required Chromium keyboard tests, then a versioned ZIP and SHA-256 file. Per-branch concurrency cancels superseded runs; macOS is pinned to `macos-15`.
- Weekly: Dependabot proposes GitHub Actions updates. It does not merge them or upgrade bundled editor libraries.
- Version tags: the release workflow checks/packages the tagged revision and creates a **draft prerelease**. This draft step is not automatic stable promotion and does not independently prove the full three-platform matrix passed for that tag.

Workflows act on pushed source. They do not watch local edits, invent source changes or install updates. No local scheduled agent has been created.

## Explicitly approved installed updates

The panel's **Check for updates** action checks published stable GitHub releases. Installers require matching release metadata, the pinned publisher key's RSA/SHA-256 signature, the expected package name/version/identity, valid publication/expiry dates, and the signed package size/hash. ZIP contents are checked before replacement. AE must be closed; helpers do not close or restart it.

From the extracted extension directory, Windows PowerShell 7:

```powershell
# Check only.
./scripts/Update-ExpressionStudio.ps1 -CheckOnly
# Review the detected target and approve installation.
./scripts/Update-ExpressionStudio.ps1 -Install
```

On macOS:

```sh
bash scripts/update-macos.sh --check
bash scripts/update-macos.sh --install
```

The macOS helper checks both user and system CEP extension locations and the existing names `AE Expression Editor` and `AE-ExpressionEditor`. It refuses multiple matching installations, links and protected destinations instead of silently creating another copy or invoking sudo. A new install uses the per-user location. The Windows helper likewise discovers both names under user and common CEP folders, verifies their identity, refuses duplicates, and requires administrator rights for a protected system installation before downloading.

Previous files are retained as backups. Failed replacement attempts restore the previous directory where possible and report failure. Local Windows transaction tests use temporary fixtures; they do not prove every failure mode on a live CEP installation. macOS baseline CI passed, but newer discovery/transaction changes require fresh platform checks and actual installation testing.

## Signing and publishing

Signed update metadata is implemented. `scripts/update-public.xml` and `scripts/update-public.pem` contain the pinned public key. The private signing key must stay outside the repository and release package. A release ZIP, checksum, signed manifest and detached signature must agree:

- `Expression-Studio-X.Y.Z.zip`
- `SHA256SUMS.txt`
- `update-manifest.json`
- `update-manifest.sig`

After building, the publisher can run the PowerShell 7 signing helper with the existing private key:

```powershell
./scripts/Sign-Release.ps1 -Package ./dist/Expression-Studio-X.Y.Z.zip -PrivateKey /secure/location/publisher-key.pem
```

The helper verifies its result against the pinned public key. `Test-Signatures.ps1` uses temporary keys and validates tampering/metadata failures; it never supplies a production signing key. The draft release workflow does not automatically produce production signatures, so the publisher must attach the matching signed metadata before stable publication. The panel can show a stable release while the installer still refuses it if required signed assets are missing or invalid.

ZXP package signing is separate: a signed ZXP 1.0.2 was verified and installed for local Windows evaluation. CI-generated ZIPs are not signed ZXP artifacts merely because update metadata is signed.

## Candidate release checklist

1. Keep `package.json`, both manifest version fields and the panel update version aligned.
2. Run source, Node/browser, updater and signature checks; record actual live AE and macOS evidence in [REVIEW.md](REVIEW.md).
3. Push the exact candidate and wait for its required CI jobs, including macOS; success on an earlier commit is not sufficient.
4. Tag that same commit `vX.Y.Z`; review the generated draft prerelease, license records, package checksums and signed metadata.
5. Publish a prerelease for evaluation. Publish stable only after the intended support matrix passes. Stable publication makes the version visible to installed checkers; installation still requires user approval.

References: [GitHub workflow triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
