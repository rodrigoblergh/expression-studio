# Expression Studio

An After Effects CEP panel combining an expression browser/editor and a script editor. The extension ID is retained to preserve installation identity and preferences.

Version **1.0.3** is a review candidate. It adds persistent expression drafts, accessible dialogs and tabs, shared host operations, and signed, approval-based update helpers. Local automated/browser checks and 13 live Windows AE host checks pass. The committed baseline passed Windows, macOS and Linux CI; newer working-tree updater changes require a fresh CI run. Live macOS and complete CEP interaction acceptance remain pending. The original manifest advertises AE 16–99.9, which is not a validated support claim; expression editing requires stable layer IDs available in AE 2022 or newer.

## Install for evaluation

Download the ZIP artifact from a successful **Verify and package** run in GitHub Actions. Extract `AE-ExpressionEditor` into your CEP extensions directory, then open it from After Effects' Extensions menu. The CI ZIP is a CEP development package. A separately signed ZXP 1.0.3 was verified and installed for local Windows evaluation; that does not sign or automatically publish CI ZIP artifacts. Close AE before replacing an existing installation and retain a backup. The GitHub source ZIP is not the installable package.

- Windows user directory: `%APPDATA%\Adobe\CEP\extensions`
- macOS user directory: `~/Library/Application Support/Adobe/CEP/extensions`

Use a disposable project for first evaluation. The Script tab intentionally executes code you choose to run, with AE's scripting permissions.

## Verification

Node 22 or later; core checks require no npm installation:

```sh
node scripts/check.cjs
node --test
```

The real browser accessibility test runs when Playwright is available; otherwise it reports an explicit skip. CI installs Playwright and Chromium in a separate required browser job. On Windows, run these additional checks in PowerShell 7:

```powershell
./scripts/Test-Update.ps1
./scripts/Test-Signatures.ps1
```

On macOS, run `bash scripts/test-update-macos.sh`. This checks updater fixtures, not After Effects. Build a tested ZIP and SHA-256 file with `./scripts/package.ps1`. See [review evidence](docs/REVIEW.md) and the [live AE test plan](docs/AE-TEST-PLAN.md).

## Updates

Pushes and pull requests run source checks and regression tests on Windows, macOS and Linux, plus a Chromium keyboard test. Packaging waits for those jobs. Weekly Dependabot proposals maintain GitHub Actions dependencies; they do not update bundled editor libraries or merge themselves.

The panel's **Check for updates** action checks published stable GitHub releases. Windows and macOS helpers require explicit installation approval, AE closed, the pinned publisher's signed release manifest, and matching package size/checksum. They retain backups and attempt rollback on installation failure. They do not close/restart AE or silently promote candidates. The macOS helper detects supported existing folder names in both user and system locations and refuses duplicate/protected installations; its newer discovery changes still require a fresh macOS CI run.

See [update and release workflow](docs/UPDATES.md). A candidate is not automatically advertised as a stable update.

## Source provenance

Imported from user-supplied `AE-ExpressionEditor.zip` on 2026-11-12.
Archive SHA-256: `6a440a6b910cdfc783496457637afc1f45d9f4f30d3c86ebba205d05ab62d95c`.
The original HTML guide is retained as reference material, not instructions governing this review.

No new license is assigned to the supplied application source. Exact upstream licenses and verification details are included in [third-party notices](THIRD-PARTY-NOTICES.md); adapted JSON fallback provenance remains unresolved.
