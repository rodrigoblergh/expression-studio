# Extension review — 1.0.2 — 2026-11-12

The supplied ZIP was imported into the initially empty repository. Three subagents reviewed host safety, panel behavior and independent functionality/usability, then cross-reviewed fixes. Source documents were treated as reference data, not delegated instructions.

## Improvements

| Area | Result |
| --- | --- |
| Pending edits | Scan, apply, undo and toggle responses check scan/document identity; delayed responses preserve newer typing. |
| Persistent recovery | Expression drafts are scoped to saved project, composition, layer, property route and original value. Conflicting/malformed/unreadable drafts are retained without replacing current edits. Unsaved projects are not assigned unsafe cross-session identities. Storage failures remain visibly reported. |
| Host operations | Shared host implementation removes divergent copies; overlapping selected groups/children write once. Undo groups close on failure, locked layers are skipped, traversal errors are surfaced. Host activity is visible while requests remain pending. |
| File safety | Partial read errors are surfaced; failed-save restoration checks the restored contents. |
| Editor behavior | Intentional empty text is respected; autocomplete handles mid-token edits, comments/strings, special identifiers and Math members. Annotation/comment-cleaning regression tests preserve parsed behavior. |
| Accessibility | Dialog labels, keyboard focus containment/restoration, nested Escape cancellation, master-tab ARIA/arrow keys, property-filter keyboard control, visible focus outlines, and editor refresh on tab visibility. |
| Updates | Pinned-key RSA/SHA-256 signed manifests, repository/identity/version/expiry/size/hash checks, archive path validation, explicit approval, backup and rollback helpers. Windows installer transaction now has real temporary-filesystem tests. macOS helper discovers user/system installations and refuses ambiguous or protected targets. |
| Provenance | Exact licenses retained for CodeMirror, Acorn, Acorn Walk, JS Beautify and Adobe CEP; matching upstream bytes documented where verified. |

## Reproduced local evidence

The following results apply to the reviewed working tree on 2026-11-12, including pending updater changes; they are not evidence that an older remote commit contains those changes.

- **65/65 Node tests passed**, including the actual headless Edge browser accessibility test. Host/document tests use mocks; three smoke-script tests verify refusal to touch unrelated user projects.
- **36 runtime scripts** passed syntax checks, with host files also checked against ES3, plus referenced assets and manifest/version consistency.
- **45 Windows updater validation and filesystem checks passed**, including install/upgrade fixtures, rollback and path separation. These operate on temporary directories, not a live CEP installation.
- **31 signature checks passed**, including tampering, wrong key, invalid metadata, expired manifests and temporary-key signing integration.
- Mock-CEP browser layouts were inspected at **500×700** and **340×400**. Toolbar wrapping and bulk dialogs fit; the update bar did not overlap panel content. These are browser screenshots, not After Effects screenshots.

## CI and host status

[Main-branch run 43320915282](https://github.com/rodrigoblergh/expression-studio/actions/runs/43320915282), revision `ab34b3b7adb85736ae6fb6c01c7da96a99c43d2b`, completed successfully on Windows, macOS and Linux, including Chromium browser checks and packaging. Later queued runs belonged to Dependabot PRs, not this main revision. Newer uncommitted updater changes and the pinned `macos-15` runner configuration require a new run. Per-branch concurrency now cancels superseded verification runs.

**Live Windows host acceptance passed 13/13 checks** in AE `26.0x67` on Windows/64 at 2026-11-12 19:42:07 America/Sao_Paulo (22:42:07 UTC). The user ran the native test script in the disposable acceptance project. See the [sanitized machine-readable report](ae-smoke-windows-2026-11-12.json). It covers scanning, stable target identities, single/batch/selected writes, toggles, stale/wrong-comp rejection, chunked scans, script results/errors, Unicode file round trips and saving the sample project.

A signed ZXP 1.0.2 was verified and installed for local evaluation; the panel opened, displayed AE 26.0 host information, and showed both acceptance-project layers and their expressions through the live CEP bridge. Embedded CEP click interaction could not be completed through the automation surface, so this is not a complete live panel UI test. Browser keyboard/layout evidence remains separate. Live Apple Silicon macOS acceptance is still pending.

## Remaining work

1. Complete the remaining [live AE acceptance plan](AE-TEST-PLAN.md): both CEP tabs and keyboard flows, real installed-update rollback, and Apple Silicon macOS coverage. Preserve the already-passed Windows host evidence.
2. Run fresh CI for the final updater changes and validate a real macOS installation. Keep macOS as a required gate; baseline CI success does not certify later revisions.
3. Establish an evidenced AE/CEP support matrix and align the manifest. Editing currently depends on AE 2022+ stable layer IDs.
4. Extend accessibility coverage to the dynamically generated expression tree and screen-reader interaction; test both themes in AE.
5. Resolve adapted JSON fallback provenance. Keep signed-ZXP generation/verification distinct from update-manifest signing and unsigned CI ZIP creation.

Provisional evidence-based estimates: functionality **8/10**, UI/accessibility **8/10**, reliability **8/10**. These subjective review scores incorporate browser and Windows host evidence but exclude unfinished full CEP UI and live macOS acceptance.
