# Bundled third-party code

Reviewed 2026-11-12. License documents are preserved in `licenses/`; this inventory does not replace those terms. Bundled copies were not upgraded during this review.

| Component | Bundled locations | Version evidence | Preserved license |
| --- | --- | --- | --- |
| CodeMirror | `lib/cm/` and `script_editor/lib/5.65.16/`, corresponding CSS | Both core files declare 5.65.16. Addon/minifier provenance is not independently established. | `licenses/CodeMirror-5.65.16-LICENSE.txt` (MIT) |
| Acorn | `lib/acorn/acorn.js` | 8.11.3; byte-identical to published npm distribution | `licenses/Acorn-8.11.3-LICENSE.txt` (MIT) |
| Acorn Walk | `lib/acorn/walk.js` | 8.3.2; byte-identical to published npm distribution | `licenses/Acorn-walk-8.3.2-LICENSE.txt` (MIT) |
| JS Beautify | `lib/cm/beautify.min.js`, `script_editor/lib/beautify.min.js` | 1.15.1; main copy byte-identical to cdnjs distribution; duplicate copy matches | `licenses/js-beautify-1.15.1-LICENSE.txt` (MIT) |
| Adobe CSInterface | `lib/CSInterface.js`, `script_editor/lib/CSInterface.js` | 12.0.0; main copy byte-identical to Adobe's CEP_12.x source; duplicate copy matches | `licenses/Adobe-CEP-SDK-License-en_US.pdf`; original Adobe copyright/notice remains in both files |
| JSON fallback | `jsx/json2.jsx`, `script_editor/jsx/json2.jsx` | Supplied adapted implementation; no original version or standalone license notice was supplied | Provenance remains unestablished; do not attribute an exact upstream revision |

## Sources

- CodeMirror: <https://raw.githubusercontent.com/codemirror/codemirror5/5.65.16/LICENSE>
- Acorn distribution and license: <https://cdn.jsdelivr.net/npm/acorn@8.11.3/dist/acorn.js>, <https://cdn.jsdelivr.net/npm/acorn@8.11.3/LICENSE>
- Acorn Walk distribution and license: <https://cdn.jsdelivr.net/npm/acorn-walk@8.3.2/dist/walk.js>, <https://cdn.jsdelivr.net/npm/acorn-walk@8.3.2/LICENSE>
- JS Beautify distribution and license: <https://cdnjs.cloudflare.com/ajax/libs/js-beautify/1.15.1/beautify.min.js>, <https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/LICENSE>
- Adobe source: <https://github.com/Adobe-CEP/CEP-Resources/blob/ab5e4e3e53a42fad08e1225a22a991bb1ffe73f6/CEP_12.x/CSInterface.js>
- Adobe accompanying SDK agreement: <https://github.com/Adobe-CEP/CEP-Resources/blob/ab5e4e3e53a42fad08e1225a22a991bb1ffe73f6/License/GenSDK_IHC-en_US-20120323_1224.pdf>

## Verified source checksums (SHA-256)

| File | SHA-256 |
| --- | --- |
| `lib/CSInterface.js` | `3c45400984772b88cdf4604b4763a29219f8071fdedb9a1fa19d997349003783` |
| `lib/cm/beautify.min.js` | `88dc8811bca8dce08eb15021a2f24adb8a7c5b116bcfd454e0432fc10aa061b9` |
| `lib/acorn/walk.js` | `03c0e79641bae2a62425f67a63ad4e43df49f217f1e7c050ab4bac74b1d7f2c8` |

The Adobe agreement is supplied as published by Adobe; retaining it is not a claim that this project has acquired separate permissions beyond its terms. Resolve the adapted JSON fallback's provenance before describing the whole distribution as fully audited.
