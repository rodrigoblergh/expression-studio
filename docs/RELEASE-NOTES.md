Expression Studio 1.0.2 — review candidate

- Recover expression drafts safely for the same saved project and unchanged target; retain conflicting drafts and show storage failures.
- Preserve newer typing during delayed scan, apply, undo and toggle responses.
- Improve keyboard navigation, labeled dialogs, focus restoration and narrow-panel behavior.
- Share host operations between editor views; expose pending AE work and improve file-error handling.
- Verify signed update metadata and packages before approved replacement, with backups and rollback protection. Add macOS installation discovery and duplicate/protected-folder refusal.
- Include regression, browser, filesystem and signature checks, plus upstream license records.

Local checks passed: 65 Node/browser tests, 36-script source validation, 45 Windows updater checks and 31 signature checks. Windows AE 26.0x67 host acceptance passed 13/13 checks. The committed baseline passed three-platform CI; final updater changes need fresh CI. Complete live CEP interaction and live macOS acceptance remain pending. This is not a certified stable release. See docs/REVIEW.md for exact evidence and limitations.
