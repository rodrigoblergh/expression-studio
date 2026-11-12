# Live After Effects acceptance checks

Status: pending. Node tests emulate selected APIs; they do not launch After Effects or validate CEP rendering. Run on Windows and Apple Silicon macOS with each supported AE major version before claiming support.

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
