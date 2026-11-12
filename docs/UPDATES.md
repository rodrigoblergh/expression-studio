# Repository and installed updates

## Already automated

- Push/PR: syntax and asset checks, regression tests on three operating systems, then a versioned ZIP and SHA-256 file.
- Weekly: Dependabot opens GitHub Actions update proposals. Review and merge after checks; bundled browser libraries need a separate compatibility review.
- Version tag: creates a **draft prerelease**, after testing. No automatic stable promotion or installation.

GitHub workflows act on committed/pushed source. They do not watch local edits or give an unattended agent permission to invent changes. No local scheduled agent has been created.

## Approval-based installed updates

Use the panel's **Check for updates** action to view published stable releases. For Windows, run the bundled `scripts/Update-ExpressionStudio.ps1` to check; use `-Install` only when ready to approve replacement. Save work and close AE first. The helper explains its target and confirms before installation. If no stable release exists it reports that state. macOS updates are manual until a tested native updater exists.

From the extracted extension folder in Windows PowerShell:

```powershell
# Check only; does not download or install a package.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Update-ExpressionStudio.ps1 -CheckOnly
# Ask for approval, then verify and install the latest stable release.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Update-ExpressionStudio.ps1 -Install
```

The execution-policy setting applies to this invocation only. The target defaults to the per-user CEP folder; an existing target must have the matching extension identity. Installation does not restart AE automatically.

Checksums establish agreement with the repository's release assets, not independent publisher signing. Before wider deployment, add an independently signed release manifest and signed distribution package, following the other Studio extensions' release policy. Do not enable silent installation.

## Publish a candidate

1. Update `package.json`, both version fields in `CSXS/manifest.xml`, and the panel's displayed update version together.
2. Run checks and the documented AE test matrix. Record actual results in `docs/REVIEW.md`.
3. Commit and push. Tag that commit `vX.Y.Z`, matching the manifest version, and push the tag.
4. The release workflow tests/packages that commit and creates a draft prerelease with ZIP and checksum. Review the draft and provenance/license requirements.
5. Publish a prerelease for evaluation. Promote to stable only after live host validation; stable publication makes it visible to installed checkers.

References: [GitHub workflow triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
