# Bundled third-party code

This inventory records the supplied archive. It does not replace the upstream license texts or grant new rights.

| Component | Bundled locations | Evidence / upstream |
| --- | --- | --- |
| CodeMirror 5 | `lib/cm`, `script_editor/lib/5.65.16`, corresponding CSS | Script-editor folder labels 5.65.16; verify each copy before replacement. https://github.com/codemirror/codemirror5 |
| Acorn | `lib/acorn/acorn.js`, `walk.js` | Parser declares 8.11.3; walk version not established. https://github.com/acornjs/acorn |
| JS Beautify | both `lib/beautify.min.js` copies | Exact bundled version not established. https://github.com/beautifier/js-beautify |
| Adobe CSInterface | both `lib/CSInterface.js` copies | Header declares Adobe copyright 2020 and refers to its accompanying Adobe agreement. https://github.com/Adobe-CEP/CEP-Resources |
| JSON2 fallback | both `jsx/json2.jsx` copies | Inspect supplied implementation before attributing a particular upstream revision. |

The provided ZIP did not include complete standalone license/notice files for these libraries. Before a stable redistribution, confirm the exact upstream revisions, retrieve and preserve their applicable license texts, and resolve Adobe's accompanying license requirement. Do not infer license terms solely from a file name.
