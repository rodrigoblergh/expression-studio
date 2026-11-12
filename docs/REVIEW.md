# Extension review — 2026-11-12

The supplied ZIP was imported into the initially empty GitHub repository. Three subagents reviewed host safety, panel behavior and independent functionality/usability, then cross-reviewed fixes. Source documents were treated as reference data, not delegated instructions.

## Fixed

| Area | Issue and result |
| --- | --- |
| Pending edits | Scan, undo and toggle responses could affect a replacement scan or newer typing. Generation/identity checks now preserve newer work. |
| Recovery | Accepting an older recovery prompt could overwrite new typing; stale confirmation is now refused. |
| Empty edits | Copy/apply could fall back to original content when the editor intentionally contained an empty string. Empty contents are now respected; apply-to-selection separately rejects an empty expression. |
| AE mutations | Overlapping group/child selections caused duplicate writes; targets are deduplicated. Unexpected errors now close undo groups. Locked layers are skipped and traversal failures are reported. |
| File I/O | Partial reads could report success; read errors are surfaced. Failed-save recovery verifies the restored contents instead of trusting a copy result. |
| Autocomplete | Mid-token completion, comments/strings, `__proto__` identifiers and `Math` member completion now behave correctly. |
| Configuration | Removed unnecessary permission for insecure remote content. Added a descriptive iframe title. |

## Verification and update infrastructure

- Dependency-free Node regression tests exercise mocked host/browser behavior, AST preservation and update-response validation.
- Source checks parse runtime scripts, check referenced HTML assets and ensure manifest version consistency.
- Windows updater validation tests cover archive paths, checksums and manifest identity; no real installation was performed.
- GitHub Actions runs tests on Windows/macOS/Linux and produces tested package artifacts. Version tags create draft prereleases.
- A user-initiated panel check and approval-based Windows update helper prepare installed updates. A stable release is required; none is published by this review.

See the successful CI run for the exact committed revision and test counts. Node parsing is not proof of compatibility with ExtendScript or older CEP engines.

## Remaining improvements, in priority order

1. **Live host acceptance:** run the [AE test plan](AE-TEST-PLAN.md) on Windows and Apple Silicon macOS; replace the unverified AE 16–99.9 manifest range with an evidenced support policy. Do not claim a 9.5/10 result without this evidence.
2. **Accessible dialogs:** add proper dialog labels, keyboard focus containment/restoration and an accessible master-tab interaction model. Visually test narrow panels and both themes.
3. **Persistent drafts:** add expression-panel recovery and visible warnings when browser storage is full/blocked; make long host operations visibly pending.
4. **Shared host code:** consolidate duplicated selected-property application and library infrastructure to avoid behavior diverging between tabs.
5. **Distribution:** complete upstream license/provenance records, signed CEP packaging and independently signed update manifests; add a tested macOS updater. Current SHA-256 verification relies on assets from the same GitHub release.

Independent source-review estimates after the fixes: functionality **7/10**, UI/accessibility **6/10**, reliability **7/10**. These are subjective, provisional scores; no live AE or visual certification is implied.
