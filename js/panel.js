/**
 * AE Expression Editor — panel.js
 */

var csInterface  = null;
var hostLoaded   = false;
var hostLoading  = false;
var hostCallbacks = [];
var scanData     = null;
var scanByKey    = {};
var scanGeneration = 0;
var scanRequestId = 0;
var editRevision = 0;

// Active property filters (set of strings)
var propFilters  = [];

// CodeMirror instances keyed by layer ID and property indices.
var editors      = {};

// Pending changes: key → { expression, enabled, original, origEnabled }
var pending      = {};

// Undo history: key → [ { expression, enabled }, … ]
var history      = {};

// Visibility engine states
var textFilterTerm = "";
var visState = {
    soloLayer: null,
    hiddenLayers: {},
    soloPropName: null,
    hiddenPropNames: {},
    soloExact: null,
    hiddenExact: {},
    soloLayerPropName: null,
    hiddenLayerPropNames: {}
};

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
    try { csInterface = new CSInterface(); }
    catch (e) {
        document.body.innerHTML =
            '<div style="padding:16px;color:#e07070;font-family:monospace;font-size:11px;">❌ CSInterface not found.</div>';
        return;
    }
    detectTheme();
    loadThemePref();
    initListeners();
    loadHost();
});

// ─── Host ─────────────────────────────────────────────────────────────────────

function loadHost() {
    if (hostLoaded || hostLoading) return;
    hostLoading = true;
    var root = csInterface.getSystemPath(SystemPath.EXTENSION);
    var path = (root + "/jsx/host.jsx").replace(/\\/g, "/");
    csInterface.evalScript(hostLoadCommand(path), function (r) {
        hostLoading = false;
        if (r !== "AE_EDITOR_HOST_OK") {
            hostCallbacks = [];
            setStatus("Could not load AE host: " + r, true);
            return;
        }
        hostLoaded = true;
        var callbacks = hostCallbacks;
        hostCallbacks = [];
        callbacks.forEach(function (fn) { fn(); });
        csInterface.evalScript("getAEVersion()", function (r) {
            try {
                var d = JSON.parse(r);
                if (d.success) document.getElementById("ae-version").textContent = "AE " + d.version;
            } catch (e) {}
        });
        refreshCompBar();
    });
}

function hostLoadCommand(path) {
    // ExtendScript evalFile inherits its caller's scope. Load at the top level
    // so subsequent CEP requests can still call the host functions.
    var expected = path.indexOf("/script_editor/") !== -1 ? "runScript" : "scanComp";
    return 'var __AEEditorHostLoadStatus="AE_EDITOR_HOST_MISSING";try{' +
        'var __AEEditorHostLoadFile=new File(' + JSON.stringify(path) + ');' +
        'if(__AEEditorHostLoadFile.exists){$.evalFile(__AEEditorHostLoadFile);' +
        'if(typeof ' + expected + '!=="function")throw new Error("Host functions were not registered.");' +
        '__AEEditorHostLoadStatus="AE_EDITOR_HOST_OK";}}' +
        'catch(__AEEditorHostLoadError){__AEEditorHostLoadStatus="AE_EDITOR_HOST_ERROR: "+__AEEditorHostLoadError.message;}' +
        '__AEEditorHostLoadStatus;';
}

function withHost(fn) {
    if (hostLoaded) { fn(); return; }
    hostCallbacks.push(fn);
    loadHost();
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function detectTheme() {
    try {
        var skin = csInterface.getHostEnvironment().appSkinInfo;
        var c    = skin.panelBackgroundColor.color;
        applyTheme((c.red + c.green + c.blue) / 3 < 100 ? "ae-dark" : "ae-light");
    } catch (e) { applyTheme("ae-dark"); }
}

function applyTheme(name) {
    document.body.className = name;
    var cm = (name === "ae-dark" || name === "custom-dark") ? "ae-dark-theme" : "ae-light-theme";
    Object.keys(editors).forEach(function (k) { editors[k].setOption("theme", cm); });
    var sel = document.getElementById("theme-select");
    if (sel) sel.value = name;
    try { localStorage.setItem("ae-expr-theme", name); } catch (e) {}

    // Sync theme to Script Editor iframe
    try {
        var iframe = document.getElementById("script-iframe");
        if (iframe && iframe.contentWindow && iframe.contentWindow.applyTheme) {
            iframe.contentWindow.applyTheme(name);
        }
    } catch (e) {}
}

function loadThemePref() {
    try { var s = localStorage.getItem("ae-expr-theme"); if (s) applyTheme(s); } catch (e) {}
}

function currentCmTheme() {
    var n = document.body.className;
    return (n === "ae-dark" || n === "custom-dark") ? "ae-dark-theme" : "ae-light-theme";
}

// ─── Listeners ────────────────────────────────────────────────────────────────

function initListeners() {
    document.getElementById("btn-scan").addEventListener("click", doScan);
    document.getElementById("btn-library").addEventListener("click", openLibModal);
    document.getElementById("btn-apply-all").addEventListener("click", applyAll);
    document.getElementById("btn-revert-all").addEventListener("click", revertAll);
    document.getElementById("btn-expand-all").addEventListener("click", expandAll);
    document.getElementById("btn-collapse-all").addEventListener("click", collapseAll);
    document.getElementById("theme-select").addEventListener("change", function () { applyTheme(this.value); });
    document.getElementById("btn-bulk-replace").addEventListener("click", openBulkModal);

    // Text filter
    var fi = document.getElementById("filter-input");
    fi.addEventListener("input", function () {
        textFilterTerm = this.value.trim().toLowerCase();
        updateTreeVisibility();
        document.getElementById("btn-filter-clear").style.display = this.value ? "flex" : "none";
    });
    document.getElementById("btn-filter-clear").addEventListener("click", function () {
        fi.value = "";
        this.style.display = "none";
        textFilterTerm = "";
        updateTreeVisibility();
    });

    // Property filter chips
    document.querySelectorAll(".prop-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
            togglePropChip(this.getAttribute("data-prop"), this);
        });
    });

    // Custom prop add
    document.getElementById("btn-prop-add").addEventListener("click", addCustomProp);
    var propInput = document.getElementById("prop-custom-input");
    propInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter")        { addCustomProp(); closePropAC(); }
        if (e.key === "Escape")       { closePropAC(); }
        if (e.key === "ArrowDown")    { e.preventDefault(); movePropAC(1); }
        if (e.key === "ArrowUp")      { e.preventDefault(); movePropAC(-1); }
    });
    propInput.addEventListener("input",  function () { updatePropAC(this.value); });
    propInput.addEventListener("focus",  function () { updatePropAC(this.value); });
    document.addEventListener("click",   function (e) {
        if (!e.target.closest("#prop-custom-row")) closePropAC();
    });

    // Clear all prop filters
    document.getElementById("btn-prop-clear-all").addEventListener("click", clearAllPropFilters);

    // Global Escape key to close modals
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            if (document.getElementById("lib-modal-overlay").classList.contains("open")) {
                closeLibModal();
            } else if (document.getElementById("bulk-modal-overlay").classList.contains("open")) {
                closeBulkModal();
            }
        }
    });

    // Overlay click-to-close for modals
    document.getElementById("lib-modal-overlay").addEventListener("click", function (e) {
        if (e.target === this) closeLibModal();
    });
    document.getElementById("bulk-modal-overlay").addEventListener("click", function (e) {
        if (e.target === this) closeBulkModal();
    });
}

// ─── Property filter panel ────────────────────────────────────────────────────

function togglePropFilter() {
    var body    = document.getElementById("prop-filter-body");
    var chevron = document.getElementById("prop-filter-chevron");
    var open    = body.classList.toggle("hidden");
    chevron.textContent = open ? "▸" : "▾";
}

function togglePropChip(propName, chipEl) {
    var idx = propFilters.indexOf(propName);
    if (idx === -1) {
        propFilters.push(propName);
        chipEl.classList.add("active");
    } else {
        propFilters.splice(idx, 1);
        chipEl.classList.remove("active");
    }
    updatePropFilterBadge();
    renderActiveTags();
    if (scanData) updateTreeVisibility();
}

function addCustomProp() {
    var input = document.getElementById("prop-custom-input");
    var val   = input.value.trim();
    if (!val || propFilters.indexOf(val) !== -1) { input.value = ""; return; }
    propFilters.push(val);
    input.value = "";
    updatePropFilterBadge();
    renderActiveTags();
    if (scanData) updateTreeVisibility();
}

function removeTag(propName) {
    propFilters = propFilters.filter(function (f) { return f !== propName; });
    document.querySelectorAll(".prop-chip").forEach(function (c) {
        if (c.getAttribute("data-prop") === propName) c.classList.remove("active");
    });
    updatePropFilterBadge();
    renderActiveTags();
    if (scanData) updateTreeVisibility();
}

function clearAllPropFilters() {
    propFilters = [];
    document.querySelectorAll(".prop-chip").forEach(function (c) { c.classList.remove("active"); });
    updatePropFilterBadge();
    renderActiveTags();
    if (scanData) updateTreeVisibility();
}

function updatePropFilterBadge() {
    var badge = document.getElementById("prop-filter-badge");
    if (propFilters.length > 0) {
        badge.textContent = propFilters.length;
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

function renderActiveTags() {
    var container = document.getElementById("prop-active-tags");
    if (!propFilters.length) { container.innerHTML = ""; return; }
    container.innerHTML = propFilters.map(function (f) {
        return '<span class="active-tag">' + escHtml(f) +
               '<button class="tag-remove" onclick="removeTag(\'' + escHtml(f) + '\')">✕</button></span>';
    }).join("");
}

// ─── Visibility Engine ─────────────────────────────────────────────────────────

function resetVisState() {
    visState = { soloLayer: null, hiddenLayers: {}, soloPropName: null, hiddenPropNames: {}, soloExact: null, hiddenExact: {}, soloLayerPropName: null, hiddenLayerPropNames: {} };
    updateTreeVisibility();
}

function updateTreeVisibility() {
    var term = textFilterTerm;

    document.querySelectorAll(".tree-layer").forEach(function (layerNode) {
        var lIndexRaw  = layerNode.getAttribute("data-layer-index");
        var lIndex     = lIndexRaw ? parseInt(lIndexRaw, 10) : -1;
        var layerName  = layerNode.getAttribute("data-layer-name") || "";
        var anyVisible = false;

        // Context visibility for layer
        var layerCtxHidden = false;
        if (visState.soloLayer !== null && visState.soloLayer !== lIndex) layerCtxHidden = true;
        if (visState.hiddenLayers[lIndex]) layerCtxHidden = true;

        var layerMatchText = !term || layerName.indexOf(term) !== -1;

        layerNode.querySelectorAll(".expr-node").forEach(function (exprNode) {
            var propName = (exprNode.getAttribute("data-prop-name") || "").toLowerCase();
            var propPath = (exprNode.getAttribute("data-prop-path") || "").toLowerCase();
            var key      = exprNode.getAttribute("data-key");
            var scannedExpr = findExprInScanData(key);
            var exprText = editors[key] ? editors[key].getValue() :
                (pending[key] ? pending[key].expression : (scannedExpr ? scannedExpr.expression : ""));
            exprText = exprText.toLowerCase();

            // 1. Text Filter Search
            var txtMatch = !term || layerMatchText || propPath.indexOf(term) !== -1 || exprText.indexOf(term) !== -1;

            // 2. Top Property Chips Filter
            var chipMatch = true;
            if (propFilters.length > 0) {
                chipMatch = propFilters.some(function (f) {
                    return propPath.indexOf(f.toLowerCase()) !== -1;
                });
            }

            // 3. Context Menu Bounds
            var ctxMatch = true;
            if (layerCtxHidden) ctxMatch = false;
            if (visState.soloExact !== null && visState.soloExact !== key) ctxMatch = false;
            if (visState.hiddenExact[key]) ctxMatch = false;
            if (visState.soloPropName !== null && visState.soloPropName !== propName) ctxMatch = false;
            if (visState.hiddenPropNames[propName]) ctxMatch = false;
            
            if (visState.soloLayerPropName !== null) {
                if (visState.soloLayerPropName.layerIndex !== lIndex || visState.soloLayerPropName.propName !== propName) {
                    ctxMatch = false;
                }
            }
            if (visState.hiddenLayerPropNames[lIndex + ":" + propName]) ctxMatch = false;

            var vis = txtMatch && chipMatch && ctxMatch;
            exprNode.style.display = vis ? "" : "none";
            if (vis) anyVisible = true;
        });

        layerNode.style.display = anyVisible ? "" : "none";
    });
}

// ─── Comp bar ─────────────────────────────────────────────────────────────────

function refreshCompBar() {
    withHost(function () {
        csInterface.evalScript("getCompInfo()", function (r) {
            try {
                var d = JSON.parse(r);
                if (d.success) {
                    document.getElementById("comp-name").textContent = "📦 " + d.compName;
                    document.getElementById("comp-stats").textContent =
                        d.numLayers + " layers" +
                        (d.selectedCount > 0 ? " · " + d.selectedCount + " selected" : "");
                } else {
                    document.getElementById("comp-name").textContent = "No active comp";
                    document.getElementById("comp-stats").textContent = "";
                }
            } catch (e) {}
        });
    });
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

function parseScanResponse(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
        throw new Error("After Effects returned an empty response. Close and reopen the panel, then scan again.");
    }
    if (raw === "EvalScript error.") throw new Error("After Effects could not execute the scan. Close and reopen the panel.");
    try { return JSON.parse(raw); }
    catch (e) { throw new Error("After Effects returned incomplete or invalid scan data (" + raw.length + " characters)."); }
}

function requestScanData(filterJson, callback) {
    var finished = false, token = null, timer;
    function finish(error, data) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (token) csInterface.evalScript("releaseExpressionScan(" + JSON.stringify(token) + ")", function () {});
        callback(error, data);
    }
    function armTimeout() {
        clearTimeout(timer);
        timer = setTimeout(function () { finish(new Error("After Effects did not complete the scan transfer. Close and reopen the panel.")); }, 30000);
    }
    function validate(data) {
        if (!data || typeof data.success !== "boolean" ||
            (data.success && !Array.isArray(data.layers))) throw new Error("After Effects returned an unexpected scan response.");
        return data;
    }
    function readChunks(length) {
        var pieces = [], offset = 0;
        function read() {
            if (finished) return;
            armTimeout();
            csInterface.evalScript("readExpressionScanChunk(" + JSON.stringify(token) + "," + offset + ")", function (raw) {
                if (finished) return;
                try {
                    var part = parseScanResponse(raw);
                    if (!part.success) throw new Error(part.error || "Could not read scan data.");
                    if (part.token !== token || part.offset !== offset || typeof part.chunk !== "string" ||
                        part.next !== offset + part.chunk.length || part.next <= offset || part.next > length ||
                        part.done !== (part.next === length)) throw new Error("Incomplete scan transfer. Scan again.");
                    pieces.push(part.chunk);
                    offset = part.next;
                    if (part.done) finish(null, validate(parseScanResponse(pieces.join(""))));
                    else setTimeout(read, 0);
                } catch (e) { finish(e); }
            });
        }
        read();
    }
    armTimeout();
    csInterface.evalScript("scanComp(" + JSON.stringify(filterJson) + ")", function (raw) {
        if (finished) return;
        try { finish(null, validate(parseScanResponse(raw))); return; }
        catch (e) { /* Retry a broken single response using bounded chunks. */ }
        setStatus("Scan response incomplete; receiving data in smaller parts…");
        armTimeout();
        csInterface.evalScript("beginExpressionScan(" + JSON.stringify(filterJson) + ")", function (raw) {
            if (finished) return;
            try {
                var start = parseScanResponse(raw);
                if (!start.success) { finish(null, validate(start)); return; }
                if (typeof start.token !== "string" || !start.token || typeof start.length !== "number" ||
                    start.length < 1 || start.length !== Math.floor(start.length)) throw new Error("Invalid scan transfer response.");
                token = start.token;
                readChunks(start.length);
            } catch (e) { finish(e); }
        });
    });
}

function doScan(discardConfirmed) {
    if (Object.keys(pending).length && discardConfirmed !== true) {
        showConfirm("Discard pending expression edits and scan again?", "Scan Expressions", function () {
            doScan(true);
        });
        return;
    }
    setStatus("Scanning…");

    var filterJson = JSON.stringify(propFilters);
    var requestId = ++scanRequestId;
    var revision = editRevision;

    withHost(function () {
        requestScanData(filterJson, function (error, d) {
            if (requestId !== scanRequestId) return;
            if (revision !== editRevision) { setStatus("Edits changed during the scan. Scan again when ready.", true); return; }
            if (error) { setStatus("Scan error: " + error.message, true); return; }
            try {
                if (!d.success) { setStatus("Error: " + d.error, true); return; }
                pending = {};
                editors = {};
                history = {};
                resetVisState();
                updateActionBar();
                scanData = d;
                scanByKey = {};
                d.layers.forEach(function (layer) {
                    layer.expressions.forEach(function (expr) { scanByKey[exprKey(expr)] = expr; });
                });
                scanGeneration++;
                refreshCompBar();
                renderTree(d);
                colorizeChipsFromScan(d);

                var total = d.layers.reduce(function (s, l) { return s + l.expressions.length; }, 0);
                var scopeMsg = d.scope === "comp" ? "full comp" : d.scope;
                setStatus(
                    total + " expression" + (total !== 1 ? "s" : "") +
                    " in " + d.layers.length + " layer" + (d.layers.length !== 1 ? "s" : "") +
                    " · " + scopeMsg +
                    (propFilters.length ? " · filtered by " + propFilters.length + " prop(s)" : "")
                );
            } catch (e) { setStatus("Parse error: " + e.message, true); }
        });
    });
}

// ─── Tree rendering ───────────────────────────────────────────────────────────

var LAYER_ICONS = { camera: "🎥", light: "💡", text: "T", shape: "⬡", "null": "✚", av: "▣" };

function renderTree(data) {
    var tree  = document.getElementById("tree");
    var empty = document.getElementById("tree-empty");

    if (!data.layers.length) {
        tree.innerHTML = "";
        empty.style.display = "flex";
        empty.innerHTML = '<div class="empty-icon">🔍</div>' +
            '<div>No expressions found.' +
            (propFilters.length ? '<br><small>Try clearing property filters.</small>' : '') +
            '</div>';
        return;
    }

    empty.style.display = "none";
    tree.innerHTML = "";
    data.layers.forEach(function (layer) {
        tree.appendChild(buildLayerNode(layer));
    });
}

function buildLayerNode(layer) {
    var node = document.createElement("div");
    node.className = "tree-layer";
    node.setAttribute("data-layer-index", layer.index);
    node.setAttribute("data-layer-name", layer.name.toLowerCase());

    var allEnabled = layer.expressions.every(function(e) { return e.enabled; });

    var header = document.createElement("div");
    header.className = "layer-header";
    header.innerHTML =
        '<span class="layer-chevron expanded">▾</span>' +
        '<span class="layer-icon">' + (LAYER_ICONS[layer.type] || "▣") + '</span>' +
        '<button class="expr-toggle layer-toggle ' + (allEnabled ? "enabled" : "disabled") + '" title="Toggle all expressions">' + (allEnabled ? "●" : "○") + '</button>' +
        '<span class="layer-index">' + layer.index + '</span>' +
        '<span class="layer-name">' + escHtml(layer.name) + '</span>' +
        '<span class="layer-expr-count">' + layer.expressions.length + '</span>';

    var toggleBtn = header.querySelector(".layer-toggle");
    toggleBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var newState = !layer.expressions.every(function (expr) { return expr.enabled; });
        var generation = scanGeneration;
        var target = layerTarget(layer);
        withHost(function() {
            csInterface.evalScript('toggleLayerExpressions(' + JSON.stringify(JSON.stringify(target)) + ',' + newState + ')', function(r) {
                try {
                    var d = JSON.parse(r);
                    if (d.success) {
                        if (generation !== scanGeneration) { setStatus("Layer toggle completed in the earlier scan. Scan again to refresh."); return; }
                        setStatus("Layer " + layer.index + ": " + (newState ? "Enabled" : "Disabled") + " " + d.count + " expression(s).");
                        allEnabled = newState;
                        toggleBtn.className = "expr-toggle layer-toggle " + (newState ? "enabled" : "disabled");
                        toggleBtn.textContent = newState ? "●" : "○";
                        layer.expressions.forEach(function(expr) {
                            expr.enabled = newState;
                            var key = exprKey(expr);
                            if (pending[key]) { pending[key].enabled = newState; pending[key].origEnabled = newState; }
                            var node = getNode(key);
                            if (node) {
                                var pt = node.querySelector(".expr-toggle:not(.layer-toggle)");
                                if (pt) {
                                    pt.className = "expr-toggle " + (newState ? "enabled" : "disabled");
                                    pt.textContent = newState ? "●" : "○";
                                }
                            }
                        });
                    } else setStatus("Error: " + d.error, true);
                } catch(e) { setStatus("Invalid host response: " + e.message, true); }
            });
        });
    });

    var body = document.createElement("div");
    body.className = "layer-body";

    layer.expressions.forEach(function (expr) {
        body.appendChild(buildExprNode(expr));
    });

    header.addEventListener("click", function () {
        var isNowCollapsed = body.classList.toggle("collapsed");
        var ch = header.querySelector(".layer-chevron");
        ch.textContent = isNowCollapsed ? "▸" : "▾";
        ch.classList.toggle("expanded", !isNowCollapsed);
    });

    // Right-click → select layer in AE timeline
    header.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        showLayerContextMenu(e, layer.index, layer.name);
    });

    node.appendChild(header);
    node.appendChild(body);
    return node;
}

function buildExprNode(expr) {
    var key = exprKey(expr);

    var node = document.createElement("div");
    node.className = "expr-node" + (expr.error ? " has-error" : "");
    node.setAttribute("data-key", key);
    node.setAttribute("data-prop-name", expr.propName.toLowerCase());
    node.setAttribute("data-prop-path", expr.propPath.toLowerCase());

    // ── Prop row ──
    var propRow = document.createElement("div");
    propRow.className = "prop-row";

    var chevron = document.createElement("span");
    chevron.className = "prop-chevron";
    chevron.textContent = "▸";

    var toggle = document.createElement("button");
    toggle.className = "expr-toggle " + (expr.enabled ? "enabled" : "disabled");
    toggle.title = expr.enabled ? "Disable expression" : "Enable expression";
    toggle.textContent = expr.enabled ? "●" : "○";
    toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        doToggle(expr, toggle);
    });

    var pathSpan = document.createElement("span");
    pathSpan.className = "prop-path";
    pathSpan.textContent = expr.propPath;
    pathSpan.title = expr.propPath;

    // Inline expression preview (single line)
    var preview = document.createElement("span");
    preview.className = "expr-preview";
    preview.textContent = expr.expression.replace(/\n/g, " ").substring(0, 60);

    // Line count badge
    var lineCount = expr.expression.split("\n").length;
    var linesBadge = document.createElement("span");
    linesBadge.className = "expr-lines-badge";
    linesBadge.textContent = lineCount + (lineCount === 1 ? " line" : " lines");

    var actions = document.createElement("div");
    actions.className = "prop-actions";

    var btnCopy   = makeActionBtn("⎘", "Copy expression", function (e) { e.stopPropagation(); copyExpr(key); });
    var btnPasteVis= makeActionBtn("👀", "Apply to all properties currently visible in panel", function (e) { e.stopPropagation(); applyToVisible(key); }, "pa-paste-vis");
    var btnPasteSel= makeActionBtn("🎯", "Apply to selected properties in AE", function (e) { e.stopPropagation(); pasteToSelected(key); }, "pa-paste-sel");
    var btnPasteLayers = makeActionBtn("⇉", "Apply to the matching property on every selected layer in AE", function (e) { e.stopPropagation(); pasteToSelectedLayers(key); }, "pa-paste-layers");
    var btnFormat = makeActionBtn("✨", "Format code", function (e) { e.stopPropagation(); formatExpr(key); }, "pa-format");
    var btnAnnotate = makeActionBtn("🪄", "Auto-Comment with docs (AST)", function (e) { e.stopPropagation(); annotateExpr(key); }, "pa-annotate");
    var btnRemoveComments = makeActionBtn("🧹", "Remove all comments", function(e) { e.stopPropagation(); removeComments(key); }, "pa-rm-comments");
    var btnApply  = makeActionBtn("✓", "Apply this change", function (e) { e.stopPropagation(); applyOne(key); }, "pa-apply hidden");
    var btnRevert = makeActionBtn("↩", "Revert change", function (e) { e.stopPropagation(); revertOne(key); }, "pa-revert hidden");
    var btnUndo   = makeActionBtn("⎌", "Undo last apply", function (e) { e.stopPropagation(); undoOne(key); }, "pa-undo hidden");

    actions.appendChild(btnCopy);
    actions.appendChild(btnPasteVis);
    actions.appendChild(btnPasteSel);
    actions.appendChild(btnPasteLayers);
    if (expr.error) {
        var errBadge = document.createElement("span");
        errBadge.className = "expr-err-badge";
        errBadge.textContent = "⚠️ Error";
        errBadge.title = expr.error;
        propRow.appendChild(errBadge);
        
        var btnCopyErr = makeActionBtn("🐞", "Copy AE Error", function (e) { e.stopPropagation(); copyTextToClipboard(expr.error); }, "pa-copy-err");
        actions.appendChild(btnCopyErr);
    }
    actions.appendChild(btnFormat);
    actions.appendChild(btnAnnotate);
    actions.appendChild(btnRemoveComments);
    actions.appendChild(btnApply);
    actions.appendChild(btnRevert);
    actions.appendChild(btnUndo);

    propRow.appendChild(chevron);
    propRow.appendChild(toggle);
    propRow.appendChild(pathSpan);
    propRow.appendChild(linesBadge);
    propRow.appendChild(preview);
    propRow.appendChild(actions);

    // ── Editor area ──
    var editorWrap = document.createElement("div");
    editorWrap.className = "expr-editor-wrap collapsed";

    var diffBar  = document.createElement("div");
    diffBar.className = "diff-bar hidden";
    diffBar.innerHTML =
        '<span class="diff-label">⚠ Modified</span>' +
        '<span class="diff-original-toggle" onclick="toggleDiff(\'' + key + '\')">Show original</span>';

    var diffOrig = document.createElement("div");
    diffOrig.className = "diff-original hidden";

    var ta = document.createElement("textarea");

    editorWrap.appendChild(diffBar);
    editorWrap.appendChild(diffOrig);
    editorWrap.appendChild(ta);

    // Toggle expand
    propRow.addEventListener("click", function () {
        var isCollapsed = editorWrap.classList.toggle("collapsed");
        chevron.textContent = isCollapsed ? "▸" : "▾";

        if (!isCollapsed && !editors[key]) {
            var cm = CodeMirror.fromTextArea(ta, {
                mode: "javascript",
                theme: currentCmTheme(),
                lineNumbers: true,
                matchBrackets: true,
                autoCloseBrackets: true,
                indentUnit: 4,
                tabSize: 4,
                lineWrapping: true,
                hintOptions: { hint: CodeMirror.hint.ae },
                extraKeys: { 
                    "Ctrl-Space": "autocomplete", 
                    "Ctrl-S": function() { applyOne(key); },
                    "Ctrl-O": false,
                    "Shift-Alt-F": function() { formatExpr(key); }
                }
            });
            cm.setValue(pending[key] ? pending[key].expression : expr.expression);
            cm.on("change", function () { onExprChange(key, cm.getValue(), expr, preview, btnApply, btnRevert, btnUndo, diffBar, node); });
            editors[key] = cm;
            setTimeout(function () { cm.refresh(); }, 10);

            // Double-click to auto-fit height
            cm.getWrapperElement().addEventListener("dblclick", function (e) {
                // Only on gutter or empty area, not on actual code tokens
                if (e.target.closest(".CodeMirror-line") || e.target.closest(".CodeMirror-code")) return;
                var wrapper = cm.getWrapperElement();
                wrapper.style.height = "auto";
                wrapper.style.maxHeight = "";
                cm.refresh();
                wrapper.classList.add("autofit-flash");
                setTimeout(function () { wrapper.classList.remove("autofit-flash"); }, 400);
            });
        } else if (!isCollapsed && editors[key]) {
            setTimeout(function () { editors[key].refresh(); }, 10);
        }
    });

    propRow.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        showPropContextMenu(e, key, expr.propName, expr.layerIndex);
    });

    node.appendChild(propRow);
    node.appendChild(editorWrap);
    return node;
}

function makeActionBtn(label, title, handler, extraClass) {
    var btn = document.createElement("button");
    btn.className = "pa-btn " + (extraClass || "");
    btn.title     = title;
    btn.textContent = label;
    btn.addEventListener("click", handler);
    return btn;
}

// ─── Change handling ──────────────────────────────────────────────────────────

function onExprChange(key, newValue, origExpr, preview, btnApply, btnRevert, btnUndo, diffBar, node) {
    editRevision++;
    var isDiff = newValue !== origExpr.expression;
    node.classList.remove("apply-error");
    btnApply.title = "Apply this change";

    if (isDiff) {
        if (!pending[key]) {
            pending[key] = {
                original:    origExpr.expression,
                origEnabled: origExpr.enabled,
                enabled:     origExpr.enabled
            };
        }
        pending[key].expression = newValue;
        node.classList.add("has-changes");
        diffBar.classList.remove("hidden");
        btnApply.classList.remove("hidden");
        btnRevert.classList.remove("hidden");
        if (history[key] && history[key].length) btnUndo.classList.remove("hidden");
        preview.textContent = newValue.replace(/\n/g, " ").substring(0, 60);
    } else {
        delete pending[key];
        node.classList.remove("has-changes");
        diffBar.classList.add("hidden");
        btnApply.classList.add("hidden");
        btnRevert.classList.add("hidden");
        btnUndo.classList.add("hidden");
        preview.textContent = origExpr.expression.replace(/\n/g, " ").substring(0, 60);
    }
    
    // Only the modern expression engine follows the JavaScript grammar used here.
    if (editors[key]) {
        var cm = editors[key];
        cm.eachLine(function(l) { cm.removeLineClass(l, "background", "lint-error"); });
        node.classList.remove("has-syntax-error");
        node.title = "";
        if (scanData && scanData.expressionEngine === "javascript-1.0" && typeof acorn !== "undefined") {
            try {
                acorn.parse(newValue, { ecmaVersion: 2018 });
            } catch (e) {
                node.classList.add("has-syntax-error");
                node.title = e.message;
                if (e.loc) {
                    cm.addLineClass(e.loc.line - 1, "background", "lint-error");
                }
            }
        }
    }

    updateActionBar();
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function doToggle(expr, toggleBtn) {
    var generation = scanGeneration;
    var newVal   = !expr.enabled;
    var target = expressionTarget(expr);
    withHost(function () {
        csInterface.evalScript(
            'toggleExpression(' + JSON.stringify(JSON.stringify(target)) + ',' + newVal + ')',
            function (r) {
                try {
                    var d = JSON.parse(r);
                    if (!d.success) { setStatus("Toggle failed: " + d.error, true); return; }
                    if (generation !== scanGeneration) { setStatus("Toggle completed in the earlier scan. Scan again to refresh."); return; }
                    expr.enabled = d.enabled;
                    var key = exprKey(expr);
                    if (pending[key]) { pending[key].enabled = d.enabled; pending[key].origEnabled = d.enabled; }
                    toggleBtn.className = "expr-toggle " + (d.enabled ? "enabled" : "disabled");
                    toggleBtn.title = d.enabled ? "Disable expression" : "Enable expression";
                    toggleBtn.textContent = d.enabled ? "●" : "○";
                    var lNode = toggleBtn.closest(".tree-layer");
                    if (lNode) {
                        var allEnabled = Array.prototype.every.call(lNode.querySelectorAll(".expr-toggle:not(.layer-toggle)"), function (t) { return t.classList.contains("enabled"); });
                        var lToggle = lNode.querySelector(".layer-toggle");
                        lToggle.className = "expr-toggle layer-toggle " + (allEnabled ? "enabled" : "disabled");
                        lToggle.textContent = allEnabled ? "●" : "○";
                    }
                    setStatus((d.enabled ? "Enabled" : "Disabled") + ": " + expr.propPath);
                } catch (e) { setStatus("Invalid host response: " + e.message, true); }
            }
        );
    });
}

// ─── Apply / Revert ───────────────────────────────────────────────────────────

function applyOne(key) {
    var p = pending[key];
    if (!p) return;
    var change = expressionChange(key, p.expression, p.enabled);
    withHost(function () {
        csInterface.evalScript(
            'applyOneExpression(' + JSON.stringify(JSON.stringify(change.target)) + ',' +
            JSON.stringify(change.expression) + ',' + change.enabled + ')',
            function (r) {
                try {
                    var d = JSON.parse(r);
                    if (d.success) {
                        markApplied(key, change, d);
                        updateActionBar();
                        setStatus("Applied: " + change.propPath +
                            (change.scanGeneration !== scanGeneration ? " · scan again to refresh" : ""));
                    } else { markFailed(change, d.error); setStatus("Error: " + d.error, true); }
                } catch (e) { setStatus("Invalid host response: " + e.message, true); }
            }
        );
    });
}

function applyAll() {
    var keys = Object.keys(pending);
    if (!keys.length) return;

    var changes = keys.map(function (k) { return expressionChange(k, pending[k].expression, pending[k].enabled); });

    withHost(function () {
        csInterface.evalScript('applyExpressions(' + JSON.stringify(JSON.stringify(changes)) + ')', function (r) {
            try {
                var d = JSON.parse(r);
                if (d.success) {
                    var failed = [];
                    d.results.forEach(function (result, i) {
                        if (result.success) markApplied(changes[i].key, changes[i], result);
                        else { failed.push(result.error); markFailed(changes[i], result.error); }
                    });
                    updateActionBar();
                    setStatus("Applied " + d.applied + " expression" + (d.applied !== 1 ? "s" : "") +
                              (failed.length ? " · " + failed.length + " failed: " + failed[0] : ""), failed.length > 0);
                } else { setStatus("Error: " + d.error, true); }
            } catch (e) { setStatus("Invalid host response: " + e.message, true); }
        });
    });
}

function revertOne(key) {
    var p = pending[key]; if (!p) return;
    var cm = editors[key]; if (cm) cm.setValue(p.original);
    delete pending[key];
    var node = getNode(key);
    if (node) {
        node.classList.remove("has-changes");
        node.classList.remove("apply-error");
        node.querySelector(".pa-apply").title = "Apply this change";
        node.querySelector(".diff-bar").classList.add("hidden");
        node.querySelector(".diff-original").classList.add("hidden");
        node.querySelector(".pa-apply").classList.add("hidden");
        node.querySelector(".pa-revert").classList.add("hidden");
    }
    updateActionBar();
    var expr = findExprInScanData(key);
    setStatus("Reverted: " + (expr ? expr.propPath : key));
}

function revertAll() { Object.keys(pending).forEach(function (k) { revertOne(k); }); }

function undoOne(key) {
    if (!history[key] || !history[key].length) return;
    if (pending[key]) { setStatus("Revert or apply the pending edit before undo.", true); return; }
    var snap = history[key][history[key].length - 1];
    var expr = findExprInScanData(key); if (!expr) return;
    var target = expressionTarget(expr);
    var generation = scanGeneration;
    var undoHistory = history[key];

    withHost(function () {
        csInterface.evalScript(
            'applyOneExpression(' + JSON.stringify(JSON.stringify(target)) + ',' +
            JSON.stringify(snap.expression) + ',' + snap.enabled + ')',
            function (r) {
                try {
                    var d = JSON.parse(r);
                    if (d.success) {
                        if (generation !== scanGeneration || history[key] !== undoHistory) {
                            setStatus("Undo completed in the earlier scan. Scan again to refresh."); return;
                        }
                        if (undoHistory[undoHistory.length - 1] === snap) undoHistory.pop();
                        updateScanData(key, d.expression, d.enabled);
                        if (pending[key]) {
                            pending[key].original = d.expression;
                            pending[key].origEnabled = d.enabled;
                        } else {
                            var cm = editors[key]; if (cm) cm.setValue(d.expression);
                        }
                        setStatus("Undone: " + expr.propPath);
                        var node = getNode(key);
                        if (node && !history[key].length) node.querySelector(".pa-undo").classList.add("hidden");
                    } else { setStatus("Undo error: " + d.error, true); }
                } catch (e) { setStatus("Invalid host response: " + e.message, true); }
            }
        );
    });
}

// ─── Diff view ────────────────────────────────────────────────────────────────

function toggleDiff(key) {
    var node     = getNode(key); if (!node) return;
    var diffOrig = node.querySelector(".diff-original");
    var lnk      = node.querySelector(".diff-original-toggle");
    var hidden   = diffOrig.classList.toggle("hidden");
    if (!hidden) {
        var p = pending[key] || findExprInScanData(key);
        var origText = p ? p.original : "";
        diffOrig.innerHTML =
            '<span class="diff-original-label">▸ Original expression</span>' +
            escHtml(origText);
        lnk.textContent = "Hide original";
    } else { lnk.textContent = "Show original"; }
}

// ─── Copy & Paste ─────────────────────────────────────────────────────────────

function copyTextToClipboard(text) {
    try {
        var ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
        setStatus("Copied to clipboard.");
    } catch (e) {}
}

function copyExpr(key) {
    var cm   = editors[key];
    var source = findExprInScanData(key);
    var text = cm ? cm.getValue() : (pending[key] ? pending[key].expression : (source ? source.expression : ""));
    copyTextToClipboard(text);
}

function pasteToSelected(key) {
    var cm   = editors[key];
    var source = findExprInScanData(key);
    var text = cm ? cm.getValue() : (pending[key] ? pending[key].expression : (source ? source.expression : ""));
    
    withHost(function() {
        setStatus("Applying to selected properties in AE...");
        csInterface.evalScript(
            'applyExpressionToSelectedProperties(' + JSON.stringify(text) + ')',
            function(r) {
                try {
                    var d = JSON.parse(r);
                    if (d.success) setStatus("Applied expression to " + d.applied + " selected propert" + (d.applied === 1 ? "y" : "ies") + " in AE." +
                        (d.errors && d.errors.length ? " " + d.errors.length + " warning(s): " + d.errors[0] : ""), !!(d.errors && d.errors.length));
                    else setStatus("Error: " + d.error, true);
                } catch(e) {}
            }
        );
    });
}

function pasteToSelectedLayers(key) {
    var expr = findExprInScanData(key);
    if (!expr) { setStatus("Expression is no longer in the scan. Scan again.", true); return; }
    var cm = editors[key];
    var text = cm ? cm.getValue() : (pending[key] ? pending[key].expression : expr.expression);
    if (!text) { setStatus("Expression is empty.", true); return; }
    var target = expressionTarget(expr);
    var generation = scanGeneration;
    withHost(function () {
        setStatus("Applying to selected layers in AE...");
        csInterface.evalScript(
            'applyExpressionToSelectedLayers(' + JSON.stringify(JSON.stringify(target)) + ',' + JSON.stringify(text) + ')',
            function (r) {
                try {
                    var d = JSON.parse(r);
                    if (!d.success) { setStatus("Selected layers: " + d.error, true); return; }
                    var failed = [];
                    d.results.forEach(function (result) {
                        if (!result.success) failed.push(result.layerName + ": " + result.error);
                        if (generation !== scanGeneration) return;
                        var resultKey = "id" + result.layerId + ":" + result.propRoute.map(function (part) { return part.index; }).join(".");
                        var scanned = findExprInScanData(resultKey);
                        if (!scanned) return;
                        var change = { key: resultKey, propPath: scanned.propPath, scanGeneration: generation,
                            expression: text, enabled: true };
                        if (!result.success) { markFailed(change, result.error); return; }
                        markApplied(resultKey, change, result);
                        if (editors[resultKey] && !pending[resultKey]) editors[resultKey].setValue(result.expression);
                    });
                    updateActionBar();
                    setStatus("Applied to " + d.applied + " of " + d.selected + " selected layer" +
                        (d.selected === 1 ? "" : "s") + "." +
                        (failed.length ? " " + failed.length + " failed: " + failed[0] : " Scan again to see new expressions."),
                        failed.length > 0);
                } catch (e) { setStatus("Invalid host response: " + e.message, true); }
            }
        );
    });
}

function applyToVisible(sourceKey) {
    var cm = editors[sourceKey];
    var source = findExprInScanData(sourceKey);
    var text = cm ? cm.getValue() : (pending[sourceKey] ? pending[sourceKey].expression : (source ? source.expression : ""));
    
    var targets = [];
    document.querySelectorAll(".expr-node").forEach(function (node) {
        if (node.style.display !== "none") {
            targets.push(node.getAttribute("data-key"));
        }
    });
    if (!targets.length) return;
    
    var changes = targets.map(function(k) {
        var expr = findExprInScanData(k);
        return expressionChange(k, text, expr.enabled);
    });
    
    withHost(function() {
        setStatus("Applying expression to " + targets.length + " visible propert" + (targets.length === 1 ? "y" : "ies") + "...");
        csInterface.evalScript('applyExpressions(' + JSON.stringify(JSON.stringify(changes)) + ')', function(r) {
            try {
                var d = JSON.parse(r);
                if (d.success) {
                    var failed = [];
                    d.results.forEach(function(result, i) {
                        var change = changes[i];
                        if (!result.success) { failed.push(result.error); markFailed(change, result.error); return; }
                        markApplied(change.key, change, result);
                        if (change.scanGeneration === scanGeneration && editors[change.key] &&
                            (!pending[change.key] || pending[change.key].expression === change.expression)) {
                            editors[change.key].setValue(result.expression);
                        }
                    });
                    updateActionBar();
                    setStatus("Applied to " + d.applied + " visible expression" + (d.applied !== 1 ? "s" : "") +
                        (failed.length ? " · " + failed.length + " failed: " + failed[0] : ""), failed.length > 0);
                } else {
                    setStatus("Error applying to visible: " + d.error, true);
                }
            } catch(e) { setStatus("Invalid host response: " + e.message, true); }
        });
    });
}

// ─── Format ───────────────────────────────────────────────────────────────────

function formatExpr(key) {
    var cm = editors[key];
    if (!cm) return;
    
    // Only format if js_beautify is available
    if (typeof js_beautify === "function") {
        var cursor = cm.getCursor();
        var code = cm.getValue();
        var formatted = js_beautify(code, {
            indent_size: 4,
            space_in_empty_paren: true,
            preserve_newlines: false,
            max_preserve_newlines: 0
        });
        
        if (code !== formatted) {
            cm.setValue(formatted);
            cm.setCursor(cursor);
            setStatus("Code formatted.");
        }
    }
}

// ─── AST Auto-Comment ─────────────────────────────────────────────────────────

function annotateExpr(key) {
    if (!editors[key]) return;
    var cm = editors[key];
    var exprData = findExprInScanData(key);
    var context = (typeof buildPropertyContext === "function" && exprData) ? buildPropertyContext(exprData) : null;
    var result = annotateCode(cm.getValue(), cm, context);

    if (result.error) {
        setStatus(result.error, true);
    } else if (result.message) {
        setStatus(result.message);
    } else {
        var msg = "Annotated " + result.tokenCount + " token(s) via AST.";
        if (result.patternName) msg = "Detected: " + result.patternName + " \u00b7 " + msg;
        setStatus(msg, false);
    }
}

function removeComments(key) {
    if (!editors[key]) return;
    showConfirm("Remove all comments from this expression?", "Remove Comments", function() {
        var cm = editors[key];
        var result = removeCodeComments(cm.getValue(), cm);
        if (result.error) {
            setStatus(result.error, true);
        } else if (result.count === 0) {
            setStatus("No comments found to remove.");
        } else {
            setStatus("Removed " + result.count + " comment(s).", false);
        }
    });
}

// ─── Expand / Collapse all ────────────────────────────────────────────────────

function expandAll() {
    document.querySelectorAll(".layer-body").forEach(function (b) { b.classList.remove("collapsed"); });
    document.querySelectorAll(".layer-chevron").forEach(function (c) {
        c.textContent = "▾"; c.classList.add("expanded");
    });
}

function collapseAll() {
    document.querySelectorAll(".layer-body").forEach(function (b) { b.classList.add("collapsed"); });
    document.querySelectorAll(".layer-chevron").forEach(function (c) {
        c.textContent = "▸"; c.classList.remove("expanded");
    });
    // Also collapse open expression editors
    document.querySelectorAll(".expr-editor-wrap").forEach(function (w) { w.classList.add("collapsed"); });
    document.querySelectorAll(".prop-chevron").forEach(function (c) { c.textContent = "▸"; });
}

// ─── Text filter removed (handled in updateTreeVisibility) ──────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

function exprKey(expr) {
    return String(expr.layerId === null ? "i" + expr.layerIndex : "id" + expr.layerId) + ":" +
        expr.propRoute.map(function (step) { return step.index; }).join(".");
}

function getNode(key) { return document.querySelector('.expr-node[data-key="' + key + '"]'); }

function layerTarget(layer) {
    return { compId: scanData.compId, layerId: layer.id, layerIndex: layer.index, layerName: layer.name };
}

function expressionTarget(expr) {
    return { compId: scanData.compId, layerId: expr.layerId, layerIndex: expr.layerIndex,
        layerName: expr.layerName, propRoute: expr.propRoute,
        expectedExpression: expr.expression, expectedEnabled: expr.enabled };
}

function expressionChange(key, expression, enabled) {
    var expr = findExprInScanData(key);
    return { key: key, propPath: expr.propPath, scanGeneration: scanGeneration,
        target: expressionTarget(expr), expression: expression, enabled: enabled };
}

function markApplied(key, change, result, previous) {
    if (change.scanGeneration !== scanGeneration) return;
    var expr = findExprInScanData(key);
    if (!expr) return;
    if (!history[key]) history[key] = [];
    history[key].push(previous || { expression: expr.expression, enabled: expr.enabled });
    expr.expression = result.expression;
    expr.enabled = result.enabled;
    var p = pending[key];
    if (p) {
        p.original = result.expression;
        p.origEnabled = result.enabled;
        if (p.expression === change.expression && p.enabled === change.enabled) delete pending[key];
    }
    var node = getNode(key);
    if (node) {
        node.classList.remove("apply-error");
        node.querySelector(".pa-apply").title = "Apply this change";
        var toggle = node.querySelector(".expr-toggle:not(.layer-toggle)");
        if (toggle) {
            toggle.className = "expr-toggle " + (result.enabled ? "enabled" : "disabled");
            toggle.title = result.enabled ? "Disable expression" : "Enable expression";
            toggle.textContent = result.enabled ? "●" : "○";
        }
        if (!pending[key]) {
            node.querySelector(".expr-preview").textContent = result.expression.replace(/\n/g, " ").substring(0, 60);
            var lines = result.expression.split("\n").length;
            node.querySelector(".expr-lines-badge").textContent = lines + (lines === 1 ? " line" : " lines");
        }
    }
    if (node && !pending[key]) {
        node.classList.remove("has-changes");
        node.querySelector(".diff-bar").classList.add("hidden");
        node.querySelector(".diff-original").classList.add("hidden");
        node.querySelector(".pa-apply").classList.add("hidden");
        node.querySelector(".pa-revert").classList.add("hidden");
        node.querySelector(".pa-undo").classList.remove("hidden");
    }
    flashNode(key, true);
}

function markFailed(change, error) {
    if (change.scanGeneration !== scanGeneration) return;
    var expr = findExprInScanData(change.key);
    if (!expr) return;
    var hadPending = !!pending[change.key];
    if (!hadPending && change.expression !== expr.expression) {
        pending[change.key] = { original: expr.expression, origEnabled: expr.enabled,
            expression: change.expression, enabled: change.enabled };
        if (editors[change.key]) editors[change.key].setValue(change.expression);
    }
    var node = getNode(change.key);
    if (node) {
        node.classList.add("apply-error");
        if (pending[change.key]) {
            node.classList.add("has-changes");
            node.querySelector(".pa-apply").classList.remove("hidden");
            node.querySelector(".pa-revert").classList.remove("hidden");
            node.querySelector(".diff-bar").classList.remove("hidden");
            node.querySelector(".expr-preview").textContent = pending[change.key].expression.replace(/\n/g, " ").substring(0, 60);
        }
        node.querySelector(".pa-apply").title = "Apply failed: " + error;
    }
    flashNode(change.key, false);
}

function flashNode(key, success) {
    var node = getNode(key); if (!node) return;
    node.classList.add(success ? "applied-flash" : "error-flash");
    setTimeout(function () { node.classList.remove("applied-flash", "error-flash"); }, 700);
}

function findExprInScanData(key) {
    if (!scanData) return null;
    if (scanByKey[key]) return scanByKey[key];
    for (var i = 0; i < scanData.layers.length; i++) {
        for (var j = 0; j < scanData.layers[i].expressions.length; j++) {
            var e = scanData.layers[i].expressions[j];
            if (exprKey(e) === key) return e;
        }
    }
    return null;
}

function updateScanData(key, expression, enabled) {
    var expr = findExprInScanData(key);
    if (expr) { expr.expression = expression; expr.enabled = enabled; }
}

function updateActionBar() {
    var count = Object.keys(pending).length;
    var bar   = document.getElementById("action-bar");
    var badge = document.getElementById("change-badge");
    if (count > 0) {
        bar.classList.remove("hidden");
        badge.classList.remove("hidden");
        badge.textContent = count + " changed";
        document.getElementById("pending-count").textContent =
            count + " pending change" + (count !== 1 ? "s" : "");
    } else {
        bar.classList.add("hidden");
        badge.classList.add("hidden");
    }
}

function setStatus(msg, isError) {
    var el = document.getElementById("status-msg");
    el.textContent = msg;
    el.className   = isError ? "status-error" : "";
}

function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Property Autocomplete ────────────────────────────────────────────────────

// All known AE property names — built from chips + any scanned props
var AE_PROP_SUGGESTIONS = [
    "Position","X Position","Y Position","Z Position",
    "Scale","Rotation","X Rotation","Y Rotation","Z Rotation",
    "Opacity","Anchor Point","Source Text",
    "Path","Fill Color","Stroke Color","Stroke Width",
    "Start Point","End Point","Offset","Trim Paths",
    "Time Remap","Audio Levels","Effects"
];

var propACIndex = -1;

function getPropSuggestions(term) {
    // Merge static list with property names already seen in scanData
    var all = AE_PROP_SUGGESTIONS.slice();
    if (scanData) {
        scanData.layers.forEach(function (l) {
            l.expressions.forEach(function (e) {
                if (all.indexOf(e.propName) === -1) all.push(e.propName);
            });
        });
    }
    if (!term) return all.slice(0, 20);
    var lower = term.toLowerCase();
    return all.filter(function (s) { return s.toLowerCase().indexOf(lower) !== -1; }).slice(0, 20);
}

function updatePropAC(term) {
    var list = document.getElementById("prop-autocomplete-list");
    var suggestions = getPropSuggestions(term.trim());
    if (!suggestions.length) { closePropAC(); return; }
    propACIndex = -1;
    list.innerHTML = suggestions.map(function (s, i) {
        var display = term
            ? s.replace(new RegExp("(" + escRegex(term) + ")", "gi"), "<span class='pac-item-match'>$1</span>")
            : escHtml(s);
        return '<div class="pac-item" data-index="' + i + '" data-value="' + escHtml(s) + '">' + display + "</div>";
    }).join("");
    list.querySelectorAll(".pac-item").forEach(function (item) {
        item.addEventListener("mousedown", function (e) {
            e.preventDefault();
            selectPropAC(this.getAttribute("data-value"));
        });
    });
    list.classList.remove("hidden");
}

function movePropAC(dir) {
    var list  = document.getElementById("prop-autocomplete-list");
    var items = list.querySelectorAll(".pac-item");
    if (!items.length) return;
    items[propACIndex] && items[propACIndex].classList.remove("active");
    propACIndex = Math.max(0, Math.min(items.length - 1, propACIndex + dir));
    items[propACIndex].classList.add("active");
    items[propACIndex].scrollIntoView({ block: "nearest" });
    document.getElementById("prop-custom-input").value = items[propACIndex].getAttribute("data-value");
}

function selectPropAC(value) {
    document.getElementById("prop-custom-input").value = value;
    closePropAC();
    addCustomProp();
}

function closePropAC() {
    document.getElementById("prop-autocomplete-list").classList.add("hidden");
    propACIndex = -1;
}

function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ─── Bulk Replace ─────────────────────────────────────────────────────────────

var bulkMode = "exact"; // "exact" | "pattern"

function openBulkModal() {
    document.getElementById("bulk-modal-overlay").classList.add("open");
    document.getElementById("bm-results").classList.remove("visible");
    document.getElementById("bm-results").innerHTML = "";
}

function closeBulkModal() {
    document.getElementById("bulk-modal-overlay").classList.remove("open");
}

function setBulkMode(mode) {
    bulkMode = mode;
    document.getElementById("bm-mode-exact").classList.toggle("active",   mode === "exact");
    document.getElementById("bm-mode-pattern").classList.toggle("active", mode === "pattern");
    document.getElementById("bm-exact-fields").style.display   = mode === "exact"   ? "" : "none";
    document.getElementById("bm-pattern-fields").style.display = mode === "pattern" ? "" : "none";
    document.getElementById("bm-results").classList.remove("visible");
}

function swapFunctionCalls(source, findName, replaceName) {
    if (!/^[A-Za-z_$][\w$]*$/.test(findName) || !/^[A-Za-z_$][\w$]*$/.test(replaceName)) {
        return { error: "Use a single JavaScript function name in each field." };
    }
    if (typeof acorn === "undefined" || !acorn.walk) return { error: "JavaScript parser is unavailable." };
    var ast;
    try { ast = acorn.parse(source, { ecmaVersion: 2020, allowReturnOutsideFunction: true }); }
    catch (e) { return { error: "Could not parse expression: " + e.message }; }
    var positions = [];
    acorn.walk.simple(ast, { CallExpression: function (call) {
        var callee = call.callee;
        if (callee.type === "Identifier" && callee.name === findName) positions.push(callee);
        else if (callee.type === "MemberExpression" && !callee.computed &&
                 callee.property.type === "Identifier" && callee.property.name === findName) {
            positions.push(callee.property);
        }
    } });
    var output = source;
    positions.sort(function (a, b) { return b.start - a.start; }).forEach(function (node) {
        output = output.slice(0, node.start) + replaceName + output.slice(node.end);
    });
    return { expression: output, count: positions.length };
}

function getBulkAnalysis() {
    var analysis = { matches: [], conflicts: [], similar: [], error: null };
    if (!scanData) { analysis.error = "No scan data. Click Scan first."; return analysis; }
    var exact = bulkMode === "exact";
    var findVal = document.getElementById(exact ? "bm-find" : "bm-func-find").value;
    var replaceVal = document.getElementById(exact ? "bm-replace" : "bm-func-replace").value;
    if (!exact) { findVal = findVal.trim(); replaceVal = replaceVal.trim(); }
    if (!findVal || (!exact && !replaceVal)) {
        analysis.error = exact ? "Enter an expression to find." : "Enter both function names.";
        return analysis;
    }
    if (!exact && (!/^[A-Za-z_$][\w$]*$/.test(findVal) || !/^[A-Za-z_$][\w$]*$/.test(replaceVal))) {
        analysis.error = "Use a single JavaScript function name in each field.";
        return analysis;
    }
    var similarName = exact && findVal.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    scanData.layers.forEach(function (layer) {
        layer.expressions.forEach(function (expr) {
            var key = exprKey(expr);
            var next;
            if (exact) {
                if (expr.expression !== findVal) {
                    if (similarName && swapFunctionCalls(expr.expression, similarName[1], similarName[1]).count) {
                        analysis.similar.push(expr);
                    }
                    return;
                }
                next = replaceVal;
            } else {
                var swapped = swapFunctionCalls(expr.expression, findVal, replaceVal);
                if (swapped.error) {
                    analysis.conflicts.push({ expr: expr, reason: swapped.error });
                    return;
                }
                if (!swapped.count) return;
                next = swapped.expression;
            }
            if (next === expr.expression) return;
            if (pending[key]) {
                analysis.conflicts.push({ expr: expr, reason: "This expression has an unsaved edit." });
                return;
            }
            analysis.matches.push({ key: key, expr: expr, original: expr.expression,
                newExpression: next, scanGeneration: scanGeneration });
        });
    });
    return analysis;
}

function getBulkMatches() { return getBulkAnalysis().matches; }

function computeNewExpression(match) { return match.newExpression; }

function doBulkPreview() {
    var resultsEl = document.getElementById("bm-results");
    resultsEl.classList.add("visible");
    var analysis = getBulkAnalysis();
    if (analysis.error) {
        resultsEl.innerHTML = '<div class="bm-no-match">' + escHtml(analysis.error) + '</div>';
        return;
    }
    var html = '<div class="bm-section-title bm-match">' + analysis.matches.length +
        ' proposed change' + (analysis.matches.length === 1 ? '' : 's') + '</div>';
    analysis.matches.forEach(function (match) {
        var expr = match.expr;
        html += '<div class="bm-result-row">' +
            '<span class="bm-row-layer">' + escHtml(expr.layerName) + '</span>' +
            '<span class="bm-row-prop">' + escHtml(expr.propPath) + '</span>' +
            '<span class="bm-row-expr">Before (' + (expr.enabled ? 'enabled' : 'disabled') +
            '): ' + escHtml(match.original) + '</span>' +
            '<span class="bm-row-arrow">→</span>' +
            '<span class="bm-row-expr bm-row-new">After (' + (expr.enabled ? 'enabled' : 'disabled') +
            '): ' + escHtml(match.newExpression) + '</span></div>';
    });
    if (analysis.conflicts.length) {
        html += '<div class="bm-section-title bm-similar">' + analysis.conflicts.length + ' skipped</div>';
        analysis.conflicts.forEach(function (conflict) {
            html += '<div class="bm-result-row bm-similar-row">' +
                '<span class="bm-row-layer">' + escHtml(conflict.expr.layerName) + '</span>' +
                '<span class="bm-row-prop">' + escHtml(conflict.expr.propPath) + '</span>' +
                '<span class="bm-row-expr">' + escHtml(conflict.reason) + '</span></div>';
        });
    }
    if (analysis.similar.length) {
        html += '<div class="bm-section-title bm-similar">' + analysis.similar.length +
            ' similar expression' + (analysis.similar.length === 1 ? '' : 's') + ' left unchanged</div>';
    }
    resultsEl.innerHTML = html;
}

function doBulkApply() {
    var matches = getBulkMatches();
    if (!matches.length) { doBulkPreview(); return; }

    var changes = matches.map(function (m) {
        var expr = findExprInScanData(m.key);
        return expressionChange(m.key, computeNewExpression(m), expr.enabled);
    });

    withHost(function () {
        csInterface.evalScript('applyExpressions(' + JSON.stringify(JSON.stringify(changes)) + ')', function (r) {
            try {
                var d = JSON.parse(r);
                var resultsEl = document.getElementById("bm-results");
                resultsEl.classList.add("visible");
                if (d.success) {
                    var failed = [];
                    d.results.forEach(function (result, i) {
                        var change = changes[i];
                        if (!result.success) { failed.push(result.error); markFailed(change, result.error); return; }
                        markApplied(change.key, change, result);
                        if (change.scanGeneration === scanGeneration && editors[change.key] &&
                            (!pending[change.key] || pending[change.key].expression === change.expression)) {
                            editors[change.key].setValue(result.expression);
                        }
                    });
                    updateActionBar();
                    resultsEl.innerHTML = '<span class="bm-match">✓ Applied to ' + d.applied + ' expression' + (d.applied !== 1 ? "s" : "") + '.</span>' +
                        (failed.length ? '<div class="bm-no-match">' + failed.length + ' failed: ' + escHtml(failed[0]) + '</div>' : '');
                    setStatus("Bulk replace: " + d.applied + " updated" + (failed.length ? ", " + failed.length + " failed: " + failed[0] : ""), failed.length > 0);
                    if (!failed.length) setTimeout(closeBulkModal, 1200);
                } else {
                    resultsEl.innerHTML = '<span style="color:var(--err)">Error: ' + escHtml(d.error) + '</span>';
                }
            } catch (e) { setStatus("Invalid host response: " + e.message, true); }
        });
    });
}

// ─── Chip colorizing after scan ───────────────────────────────────────────────

function colorizeChipsFromScan(data) {
    // Collect all unique prop names that appear in the scan
    var foundProps = {};
    data.layers.forEach(function (l) {
        l.expressions.forEach(function (e) {
            foundProps[e.propName.toLowerCase()] = true;
        });
    });

    // Static chips
    document.querySelectorAll(".prop-chip").forEach(function (chip) {
        var prop = (chip.getAttribute("data-prop") || "").toLowerCase();
        if (foundProps[prop]) {
            chip.classList.add("has-expr");
        } else {
            chip.classList.remove("has-expr");
        }
    });

    // Active tags
    renderActiveTagsWithScan(foundProps);
}

function renderActiveTagsWithScan(foundProps) {
    var container = document.getElementById("prop-active-tags");
    if (!propFilters.length) { container.innerHTML = ""; return; }
    container.innerHTML = propFilters.map(function (f) {
        var hasExpr = foundProps && foundProps[f.toLowerCase()];
        return '<span class="active-tag' + (hasExpr ? ' tag-has-expr' : '') + '">' +
               (hasExpr ? '✦ ' : '') + escHtml(f) +
               '<button class="tag-remove" onclick="removeTag(\'' + escHtml(f) + '\')">✕</button></span>';
    }).join("");
}

// ─── Component Context Menus ──────────────────────────────────────────────────

var _ctxMenu = null;

function showLayerContextMenu(e, layerIndex, layerName) {
    removeContextMenu();
    var menu = document.createElement("div");
    menu.id = "layer-ctx-menu";
    menu.className = "ctx-menu";
    menu.innerHTML =
        '<div class="ctx-item ctx-solo-layer" data-index="' + layerIndex + '">' +
        '  <span class="ctx-icon">🟢</span> Solo This Layer' +
        '</div>' +
        '<div class="ctx-item ctx-hide-layer" data-index="' + layerIndex + '">' +
        '  <span class="ctx-icon">🔴</span> Hide This Layer' +
        '</div>' +
        '<div class="ctx-sep"></div>' +
        '<div class="ctx-item ctx-select-layer" data-index="' + layerIndex + '">' +
        '  <span class="ctx-icon">⬦</span> Select <strong>' + escHtml(layerName) + '</strong> in AE' +
        '</div>' +
        '<div class="ctx-item ctx-expand-layer" data-index="' + layerIndex + '">' +
        '  <span class="ctx-icon">⊞</span> Expand this layer' +
        '</div>' +
        '<div class="ctx-sep"></div>' +
        '<div class="ctx-item ctx-reset-vis">' +
        '  <span class="ctx-icon">🔄</span> Reset Visibility' +
        '</div>';

    menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + "px";
    menu.style.top  = Math.min(e.clientY, window.innerHeight - 150) + "px";
    document.body.appendChild(menu);
    _ctxMenu = menu;

    menu.querySelector(".ctx-solo-layer").addEventListener("click", function() {
        var idx = parseInt(this.getAttribute("data-index"), 10);
        resetVisState(); visState.soloLayer = idx; updateTreeVisibility(); removeContextMenu();
    });
    menu.querySelector(".ctx-hide-layer").addEventListener("click", function() {
        var idx = parseInt(this.getAttribute("data-index"), 10);
        visState.hiddenLayers[idx] = true; updateTreeVisibility(); removeContextMenu();
    });
    menu.querySelector(".ctx-reset-vis").addEventListener("click", function() {
        resetVisState(); removeContextMenu();
    });

    menu.querySelector(".ctx-select-layer").addEventListener("click", function () {
        var idx = parseInt(this.getAttribute("data-index"), 10);
        var layer = scanData && scanData.layers.filter(function (item) { return item.index === idx; })[0];
        removeContextMenu();
        if (!layer) { setStatus("Layer no longer in the scan. Scan again.", true); return; }
        withHost(function () {
            csInterface.evalScript("selectLayerInTimeline(" + JSON.stringify(JSON.stringify(layerTarget(layer))) + ")", function (r) {
                try {
                    var d = JSON.parse(r);
                    if (d.success) setStatus("Selected in timeline: " + d.layerName);
                    else setStatus("Error: " + d.error, true);
                } catch (e) {}
            });
        });
    });

    menu.querySelector(".ctx-expand-layer").addEventListener("click", function () {
        var idx = parseInt(this.getAttribute("data-index"), 10);
        removeContextMenu();
        var layerNode = document.querySelector('.tree-layer[data-layer-index="' + idx + '"]');
        if (layerNode) {
            var body = layerNode.querySelector(".layer-body");
            var chevron = layerNode.querySelector(".layer-chevron");
            if (body)    { body.classList.remove("collapsed"); }
            if (chevron) { chevron.textContent = "▾"; chevron.classList.add("expanded"); }
        }
    });

    setTimeout(function () {
        document.addEventListener("click", removeContextMenu, { once: true });
        document.addEventListener("contextmenu", removeContextMenu, { once: true });
    }, 50);
}

function showPropContextMenu(e, key, propName, layerIndex) {
    removeContextMenu();
    var menu = document.createElement("div");
    menu.id = "prop-ctx-menu";
    menu.className = "ctx-menu";
    menu.innerHTML =
        '<div class="ctx-title">' + escHtml(propName) + '</div>' +
        '<div class="ctx-item ctx-solo-exact" data-key="' + key + '"><span class="ctx-icon">🟢</span> Solo This Property Here</div>' +
        '<div class="ctx-item ctx-solo-layer-name" data-name="' + escHtml(propName) + '" data-layer="' + layerIndex + '"><span class="ctx-icon">🟢</span> Solo \'' + escHtml(propName) + '\' (This Layer)</div>' +
        '<div class="ctx-item ctx-solo-name" data-name="' + escHtml(propName) + '"><span class="ctx-icon">🟢</span> Solo \'' + escHtml(propName) + '\' (All Layers)</div>' +
        '<div class="ctx-sep"></div>' +
        '<div class="ctx-item ctx-hide-exact" data-key="' + key + '"><span class="ctx-icon">🔴</span> Hide This Property Here</div>' +
        '<div class="ctx-item ctx-hide-layer-name" data-name="' + escHtml(propName) + '" data-layer="' + layerIndex + '"><span class="ctx-icon">🔴</span> Hide \'' + escHtml(propName) + '\' (This Layer)</div>' +
        '<div class="ctx-item ctx-hide-name" data-name="' + escHtml(propName) + '"><span class="ctx-icon">🔴</span> Hide \'' + escHtml(propName) + '\' (All Layers)</div>' +
        '<div class="ctx-sep"></div>' +
        '<div class="ctx-item ctx-reset-vis"><span class="ctx-icon">🔄</span> Reset Visibility</div>';
        
    menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + "px";
    menu.style.top  = Math.min(e.clientY, window.innerHeight - 300) + "px";
    document.body.appendChild(menu);
    _ctxMenu = menu;
    
    // Solo / Hide events
    menu.querySelector(".ctx-solo-exact").addEventListener("click", function() {
        var k = this.getAttribute("data-key");
        resetVisState(); visState.soloExact = k; updateTreeVisibility(); removeContextMenu();
    });
    menu.querySelector(".ctx-solo-layer-name").addEventListener("click", function() {
        var n = this.getAttribute("data-name").toLowerCase();
        var l = parseInt(this.getAttribute("data-layer"), 10);
        resetVisState(); visState.soloLayerPropName = { layerIndex: l, propName: n }; updateTreeVisibility(); removeContextMenu();
    });
    menu.querySelector(".ctx-solo-name").addEventListener("click", function() {
        var n = this.getAttribute("data-name").toLowerCase();
        resetVisState(); visState.soloPropName = n; updateTreeVisibility(); removeContextMenu();
    });
    menu.querySelector(".ctx-hide-exact").addEventListener("click", function() {
        var k = this.getAttribute("data-key");
        visState.hiddenExact[k] = true; updateTreeVisibility(); removeContextMenu();
    });
    menu.querySelector(".ctx-hide-layer-name").addEventListener("click", function() {
        var n = this.getAttribute("data-name").toLowerCase();
        var l = parseInt(this.getAttribute("data-layer"), 10);
        visState.hiddenLayerPropNames[l + ":" + n] = true; updateTreeVisibility(); removeContextMenu();
    });
    menu.querySelector(".ctx-hide-name").addEventListener("click", function() {
        var n = this.getAttribute("data-name").toLowerCase();
        visState.hiddenPropNames[n] = true; updateTreeVisibility(); removeContextMenu();
    });
    
    menu.querySelector(".ctx-reset-vis").addEventListener("click", function() {
        resetVisState(); removeContextMenu();
    });
    
    setTimeout(function () {
        document.addEventListener("click", removeContextMenu, { once: true });
        document.addEventListener("contextmenu", removeContextMenu, { once: true });
    }, 50);
}

function removeContextMenu() {
    if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
}
// ─── Expression Library / Snippets ────────────────────────────────────────────

var libSnippets = [];
var currentSnippetId = null;
var libEditor = null;
var libSearchTerm = "";

function loadLibSnippets() {
    try {
        var data = localStorage.getItem("ae-expr-lib");
        if (data) libSnippets = JSON.parse(data);
    } catch(e) {}
    if (!Array.isArray(libSnippets)) libSnippets = [];
}

function saveLibSnippets() {
    try { localStorage.setItem("ae-expr-lib", JSON.stringify(libSnippets)); } catch(e) {}
}

function openLibModal() {
    loadLibSnippets();
    document.getElementById("lib-modal-overlay").classList.add("open");
    renderLibSidebar();
    
    // Init editor if not ready
    if (!libEditor) {
        var ta = document.getElementById("lib-editor-ta");
        libEditor = CodeMirror.fromTextArea(ta, {
            mode: "javascript",
            theme: currentCmTheme(),
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            indentUnit: 4,
            tabSize: 4,
            lineWrapping: true,
            extraKeys: { "Esc": function() { closeLibModal(); } }
        });
        libEditor.on("change", function() {
            document.getElementById("btn-lib-save").classList.add("changed");
        });
    } else {
        libEditor.setOption("theme", currentCmTheme());
    }
    
    if (libSnippets.length > 0) {
        openSnippet(libSnippets[0].id);
    } else {
        createNewSnippet();
    }
    
    setTimeout(function() { libEditor.refresh(); }, 50);
}

function closeLibModal() {
    document.getElementById("lib-modal-overlay").classList.remove("open");
}

function renderLibSidebar() {
    var list = document.getElementById("lib-list");
    list.innerHTML = "";
    var term = libSearchTerm.toLowerCase();
    
    libSnippets.forEach(function(s) {
        if (term) {
            var tMatch = (s.title || "").toLowerCase().indexOf(term) !== -1;
            var cMatch = (s.code || "").toLowerCase().indexOf(term) !== -1;
            if (!tMatch && !cMatch) return;
        }
        
        var item = document.createElement("div");
        item.className = "lib-item" + (s.id === currentSnippetId ? " active" : "");
        item.textContent = s.title || "Untitled Snippet";
        item.onclick = function() { openSnippet(s.id); };
        list.appendChild(item);
    });
}

function openSnippet(id) {
    var s = libSnippets.filter(function(x) { return x.id === id; })[0];
    if (!s) return;
    currentSnippetId = id;
    document.getElementById("lib-snippet-title").value = s.title;
    if (libEditor) {
        libEditor.setValue(s.code || "");
        document.getElementById("btn-lib-save").classList.remove("changed");
    }
    renderLibSidebar();
    clearLibStatus();
}

function createNewSnippet() {
    var s = {
        id: "snip_" + Date.now() + "_" + Math.floor(Math.random()*1000),
        title: "New Snippet",
        code: ""
    };
    libSnippets.push(s);
    saveLibSnippets();
    openSnippet(s.id);
}

function saveCurrentSnippet() {
    if (!currentSnippetId) return;
    var s = libSnippets.filter(function(x) { return x.id === currentSnippetId; })[0];
    if (s) {
        s.title = document.getElementById("lib-snippet-title").value.trim() || "Untitled Snippet";
        if (libEditor) s.code = libEditor.getValue();
        saveLibSnippets();
        renderLibSidebar();
        document.getElementById("btn-lib-save").classList.remove("changed");
        showLibStatus("Saved!");
    }
}

function deleteCurrentSnippet() {
    if (!currentSnippetId) return;
    showConfirm("Are you sure you want to delete this snippet?", "Delete Snippet", function() {
        libSnippets = libSnippets.filter(function(x) { return x.id !== currentSnippetId; });
        saveLibSnippets();
        if (libSnippets.length > 0) openSnippet(libSnippets[0].id);
        else createNewSnippet();
    });
}

function copyCurrentSnippet() {
    if (libEditor) {
        copyTextToClipboard(libEditor.getValue());
        showLibStatus("Copied to clipboard.");
    }
}

function pasteCurrentSnippetToSel() {
    if (!libEditor) return;
    var text = libEditor.getValue();
    if (!text) return;
    withHost(function() {
        showLibStatus("Applying to selected properties...");
        csInterface.evalScript('applyExpressionToSelectedProperties(' + JSON.stringify(text) + ')', function(r) {
            try {
                var d = JSON.parse(r);
                if (d.success) showLibStatus("Applied to " + d.applied + " properties in AE." +
                    (d.errors && d.errors.length ? " " + d.errors.length + " warning(s): " + d.errors[0] : ""), !!(d.errors && d.errors.length));
                else showLibStatus("Error: " + d.error, true);
            } catch(e) {}
        });
    });
}

function showLibStatus(msg, isError) {
    var el = document.getElementById("lib-status");
    el.textContent = msg;
    el.className = isError ? "status-error" : "";
    clearTimeout(el.to);
    el.to = setTimeout(function() { el.textContent = ""; el.className = ""; }, 3000);
}
function clearLibStatus() {
    var el = document.getElementById("lib-status");
    el.textContent = ""; el.className = "";
}

// ─── Custom Confirm Modal ────────────────────────────────────────────────────

var confirmCallback = null;

function showConfirm(msg, title, callback) {
    title = title || "Warning";
    document.getElementById("custom-confirm-title").textContent = title;
    document.getElementById("custom-confirm-message").textContent = msg;
    document.getElementById("custom-confirm-overlay").classList.remove("hidden");
    confirmCallback = callback;
}

function hideConfirm() {
    document.getElementById("custom-confirm-overlay").classList.add("hidden");
    confirmCallback = null;
}

if (document.getElementById("btn-confirm-cancel")) {
    document.getElementById("btn-confirm-cancel").addEventListener("click", hideConfirm);
}
if (document.getElementById("btn-confirm-ok")) {
    document.getElementById("btn-confirm-ok").addEventListener("click", function() {
        if (confirmCallback) confirmCallback();
        hideConfirm();
    });
}

// Bind library events
document.getElementById("btn-lib-add").addEventListener("click", createNewSnippet);
document.getElementById("btn-lib-delete").addEventListener("click", deleteCurrentSnippet);
document.getElementById("btn-lib-save").addEventListener("click", saveCurrentSnippet);
document.getElementById("btn-lib-copy").addEventListener("click", copyCurrentSnippet);
document.getElementById("btn-lib-paste-sel").addEventListener("click", pasteCurrentSnippetToSel);

// Bind search input
document.getElementById("lib-search").addEventListener("input", function() {
    libSearchTerm = this.value;
    renderLibSidebar();
});

// Bind title enter key
document.getElementById("lib-snippet-title").addEventListener("keydown", function(e) {
    if (e.key === "Enter") saveCurrentSnippet();
});
