# Expression Studio

An After Effects CEP panel combining an expression browser/editor and a script editor. The existing extension ID and folder name are retained to preserve installation identity and preferences.

Version **1.0.1** is a review candidate. Automated tests run against mocked AE/browser APIs; this is not a certified stable AE release. The original manifest advertises AE 16–99.9, but that range has not been validated.

## Install for evaluation

Download the ZIP artifact from a successful **Verify and package** run in GitHub Actions. Extract `AE-ExpressionEditor` into your CEP extensions directory, then open it from After Effects' Extensions menu. A development/unsigned CEP package requires Adobe's CEP development configuration; it is not a signed ZXP installer. Close AE before replacing an existing installation and retain a backup. Do not copy the GitHub source ZIP directly into CEP: it has an extra repository folder.

- Windows user directory: `%APPDATA%\Adobe\CEP\extensions`
- macOS user directory: `~/Library/Application Support/Adobe/CEP/extensions`

Use a disposable project for first evaluation. The Script tab intentionally executes the script you choose to run, with AE's scripting permissions.

## Verification

Node 22 or later; no npm installation or third-party test dependencies required:

```sh
node scripts/check.cjs
node --test
```

To build a tested ZIP and SHA-256 checksum, run `./scripts/package.ps1` with PowerShell 7. See [review findings](docs/REVIEW.md) and [live AE checks](docs/AE-TEST-PLAN.md).

## Updates

Every push and pull request runs the regression suite on Windows, macOS and Linux. Successful runs produce a versioned CEP ZIP. Weekly Dependabot proposals maintain GitHub Actions dependencies; they do not change bundled editor libraries or merge themselves.

The panel's **Check for updates** action checks published stable GitHub releases. Installation requires approval and AE must be closed. The Windows update helper checks release provenance, package checksum and archive paths, backs up the installed extension, and rolls back installation failures. It does not close AE or change CEP preferences. macOS installation remains manual.

See [update and release workflow](docs/UPDATES.md). Until a stable release is published, the checker correctly reports that none is available. Development artifacts are not silently promoted to stable.

## Source provenance

Imported from the user-supplied `AE-ExpressionEditor.zip` on 2026-11-12.
Archive SHA-256: `6a440a6b910cdfc783496457637afc1f45d9f4f30d3c86ebba205d05ab62d95c`.
The original HTML guide is retained as reference material, not as instructions governing this review.

No new license is assigned to the supplied application source. See [third-party inventory](THIRD-PARTY-NOTICES.md).
