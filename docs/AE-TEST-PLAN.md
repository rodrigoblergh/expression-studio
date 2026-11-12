# Live After Effects acceptance checks

Status: Windows AE 26.0x67 native host acceptance passed 13/13 checks on 2026-11-12; see [sanitized report](ae-smoke-windows-2026-11-12.json). The signed 1.0.2 panel opened and reported the AE host version. Full embedded CEP interaction and live Apple Silicon macOS checks remain pending. Node mocks, browser tests, CI and native host scripts establish different evidence; do not treat one as a replacement for the others.

Use a disposable project with duplicate layer names, duplicate effect names, separated position dimensions, 2D/3D layers, locked layers, disabled expressions and expression errors.

1. Open both tabs, confirm host load, theme, narrow-panel layout and editor resizing. Test keyboard navigation, dialogs and focus restoration.
2. Scan all/selected layers, filter, edit, toggle and undo. Change active composition or reorder/delete layers after scanning: stale writes must be refused.
3. Delay scanning/applying/undoing, then type or rescan. New edits must remain intact. Select an effect group and its child: apply once and undo once.
4. Apply an invalid expression: show AE error and keep accurate pending state. Test disabled expressions and intended empty-expression deletion through the expression editor.
5. Save/open scripts using Unicode and quoted paths. Test read-only files, partial writes, canceled dialogs, lost storage permissions and crash recovery.
6. Annotate/clean/format scripts with regular expressions, templates, comments and directives. Compare behavior in AE, including its legacy expression engine if supported.
7. Run a benign script, a throwing script and a multi-line syntax error. Confirm useful error location and no unexpected changes.
8. Check for updates with no stable release, offline, rate limited, older/equal/newer versions. Validate the Windows helper with tampered checksum/archive, AE running, declined install, successful install and rollback.
9. Restart AE after installation and verify both tabs, snippets, preferences and a saved project. Do not replace current user work to perform these checks.

Record AE/CEP/OS versions, test project, pass/fail, screenshots and failures. A clean mocked suite is not a substitute for these results.
