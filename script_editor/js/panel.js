/**
 * AE Script Editor — panel.js
 */

var csInterface   = null;
var editor        = null;
var currentPath   = null;
var currentName   = null;
var currentMode   = "script"; // "script" or "expression"
var isDirty       = false;
var modeDocuments = { script: null, expression: null };
var nextDocumentId = 0;
var restoringDocument = false;
var recentScripts = [];
var recoveryDrafts = [];
var hostLoaded    = false;
var hostLoading   = false;
var hostCallbacks = [];
var expressionEngine = null;
var engineQueryId = 0;

// Search state
var searchMatches = [];
var searchIndex   = -1;
var searchMarks   = [];

// Debug state
var errorList     = [];
var errorMarkers  = []; // gutter markers
var errorLineWidgets = [];

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
    try { csInterface = new CSInterface(); }
    catch (e) {
        document.body.innerHTML =
            '<div style="padding:16px;color:#e07070;font-family:monospace;font-size:11px;">' +
            '&#10060; CSInterface not found. Check lib/CSInterface.js</div>';
        return;
    }
    loadRecent();
    loadRecoveryDrafts();
    loadLibDrafts();
    installHostActivityIndicator();
    detectTheme();
    initEditor();
    initMode();
    initListeners();
    initSearch();
    initDebugTabs();
    loadThemePref();
    updateTitle();
    updateRecentMenu();
    loadHost();
    window.addEventListener("beforeunload", function () { syncCurrentDocument(); persistDocuments(); });
    window.addEventListener("focus", refreshExpressionEngine);
});

// ─── Host ────────────────────────────────────────────────────────────────────

function loadHost() {
    if (hostLoaded || hostLoading) return;
    hostLoading = true;
    var root = csInterface.getSystemPath(SystemPath.EXTENSION);
    var path1 = (root + "/jsx/host.jsx").replace(/\\/g, "/");
    var path2 = (root + "/script_editor/jsx/host.jsx").replace(/\\/g, "/");
    csInterface.evalScript(hostLoadCommand(path1), function (first) {
        if (first !== "AE_EDITOR_HOST_OK") { hostLoadFailed(first); return; }
        csInterface.evalScript(hostLoadCommand(path2), function (second) {
            if (second !== "AE_EDITOR_HOST_OK") { hostLoadFailed(second); return; }
            hostLoading = false;
            hostLoaded = true;
            var callbacks = hostCallbacks;
            hostCallbacks = [];
            callbacks.forEach(function (fn) { fn(); });
            refreshExpressionEngine();
            csInterface.evalScript("getAEVersion()", function (r) {
                try {
                    var d = JSON.parse(r);
                    if (d.success) document.getElementById("ae-version").textContent = "AE " + d.version;
                } catch (e) {}
            });
        });
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

function hostLoadFailed(response) {
    hostLoading = false;
    hostCallbacks = [];
    setOutput("Could not load AE host: " + response, "error");
}

function withHost(fn) {
    if (hostLoaded) { fn(); return; }
    hostCallbacks.push(fn);
    loadHost();
}

function refreshExpressionEngine() {
    if (!hostLoaded) return;
    var queryId = ++engineQueryId;
    csInterface.evalScript("getProjectExpressionEngine()", function (r) {
        if (queryId !== engineQueryId) return;
        var previousEngine = expressionEngine;
        try {
            var result = JSON.parse(r);
            expressionEngine = result.success ? result.engine : null;
        } catch (e) { expressionEngine = null; }
        if (currentMode === "expression" && previousEngine !== expressionEngine) lintCurrentDocument();
    });
}

// ─── Theme ───────────────────────────────────────────────────────────────────

function detectTheme() {
    try {
        var skin = csInterface.getHostEnvironment().appSkinInfo;
        var c = skin.panelBackgroundColor.color;
        applyTheme((c.red + c.green + c.blue) / 3 < 100 ? "ae-dark" : "ae-light");
    } catch (e) { applyTheme("ae-dark"); }
}

function applyTheme(name) {
    document.body.className = name;
    var cm = (name === "ae-dark" || name === "custom-dark") ? "ae-dark-theme" : "ae-light-theme";
    if (editor) editor.setOption("theme", cm);
    var sel = document.getElementById("theme-select");
    if (sel) sel.value = name;
}

function loadThemePref() {
    try { var s = localStorage.getItem("ae-editor-theme"); if (s) applyTheme(s); } catch (e) {}
}

// ─── Mode Management ─────────────────────────────────────────────────────────

function initMode() {
    var savedMode = "script";
    try {
        savedMode = localStorage.getItem("ae-editor-mode") || "script";
    } catch (e) {}
    loadDocuments();
    if (!modeDocuments.script) modeDocuments.script = newDocument(editor.getValue(), "Untitled", null, false);
    if (!modeDocuments.expression) modeDocuments.expression = newDocument("", "Expression", null, false);
    setMode(savedMode, true);
}

function setMode(mode, isInitial) {
    var nextMode = (mode === "expression") ? "expression" : "script";
    if (!isInitial && currentMode !== nextMode) syncCurrentDocument();
    currentMode = nextMode;
    if (editor && (isInitial || currentMode !== modeDocuments.activeMode)) {
        restoreDocument(modeDocuments[currentMode]);
        modeDocuments.activeMode = currentMode;
    }
    try {
        writePanelStorage("ae-editor-mode", currentMode);
    } catch (e) {}

    var btnScript = document.getElementById("mode-btn-script");
    var btnExpr   = document.getElementById("mode-btn-expr");
    var btnRun    = document.getElementById("btn-run");
    var btnPull   = document.getElementById("btn-pull-expr");
    var scText    = document.getElementById("sc-run-text");
    var btnLib    = document.getElementById("btn-library");

    if (btnScript) btnScript.classList.toggle("active", currentMode === "script");
    if (btnExpr)   btnExpr.classList.toggle("active", currentMode === "expression");

    if (currentMode === "expression") {
        if (btnRun) {
            btnRun.innerHTML = "⚡ Apply to Selected";
            btnRun.title = "Apply expression to all selected properties across timeline (Ctrl+Enter)";
            btnRun.classList.add("btn-expr");
        }
        if (btnPull) btnPull.classList.remove("hidden");
        if (scText) scText.textContent = "Apply to Selected Properties";
        if (btnLib) btnLib.title = "Open Expression Snippet Library";
    } else {
        if (btnRun) {
            btnRun.innerHTML = "▶ Run";
            btnRun.title = "Run Script in AE (Ctrl+Enter)";
            btnRun.classList.remove("btn-expr");
        }
        if (btnPull) btnPull.classList.add("hidden");
        if (scText) scText.textContent = "Run";
        if (btnLib) btnLib.title = "Open Script Snippet Library";
    }

    if (!isInitial) {
        setOutput("Mode changed to " + (currentMode === "expression" ? "Expression" : "Script") + ".", "info");
    }
    if (currentMode === "expression") refreshExpressionEngine();
    persistDocuments();
}

function newDocument(content, name, path, dirty) {
    return { id: ++nextDocumentId, content: content || "", name: name || "Untitled",
        path: path || null, dirty: !!dirty, revision: 0 };
}

function syncCurrentDocument() {
    var doc = modeDocuments[currentMode];
    if (!doc || !editor) return;
    doc.content = editor.getValue();
    doc.name = currentName || doc.name;
    doc.path = currentPath;
    doc.dirty = isDirty;
}

function restoreDocument(doc) {
    if (!doc || !editor) return;
    restoringDocument = true;
    try { editor.setValue(doc.content); }
    finally { restoringDocument = false; }
    currentPath = doc.path;
    currentName = doc.name;
    isDirty = doc.dirty;
    clearErrorMarkers(); errorList = []; updateErrorBadge(); renderErrorList();
    updateTitle();
    lintCurrentDocument();
}

function replaceCurrentDocument(content, name, path, dirty) {
    stashCurrentDraft(content);
    var doc = newDocument(content, name, path, dirty);
    modeDocuments[currentMode] = doc;
    restoreDocument(doc);
    persistDocuments();
    return doc;
}

function stashCurrentDraft(replacementContent) {
    var doc = modeDocuments[currentMode];
    if (!doc || !editor || !isDirty || editor.getValue() === replacementContent) return;
    recoveryDrafts.unshift({ mode: currentMode, name: currentName || "Untitled",
        path: currentPath, content: editor.getValue(), savedAt: Date.now() });
    recoveryDrafts = recoveryDrafts.slice(0, 10);
    try { writePanelStorage("ae-editor-recovery-v1", JSON.stringify(recoveryDrafts)); } catch (e) {}
    updateRecentMenu();
}

function loadRecoveryDrafts() {
    try {
        var saved = JSON.parse(localStorage.getItem("ae-editor-recovery-v1") || "[]");
        if (!Array.isArray(saved)) throw new Error("Invalid recovery data");
        recoveryDrafts = Array.isArray(saved) ? saved.filter(function (d) {
            return d && typeof d.content === "string" && (d.mode === "script" || d.mode === "expression");
        }).slice(0, 10) : [];
    } catch (e) { recoveryDrafts = []; protectUnreadStorage("ae-editor-recovery-v1"); }
}

function restoreRecoveryDraft(index) {
    var draft = recoveryDrafts[index];
    if (!draft) return;
    var token = documentToken();
    function restore() {
        if (!tokenStillCurrent(token)) { setOutput("Editor changed before recovery completed. Choose the draft again.", "warning"); return; }
        if (currentMode !== draft.mode) setMode(draft.mode);
        replaceCurrentDocument(draft.content, draft.name, draft.path, true);
        setOutput("Recovered draft: " + draft.name, "success");
    }
    if (isDirty) showConfirm("Open this recovery draft? The current draft will be kept in Recent.", "Recover Draft", restore);
    else restore();
}

function persistDocuments() {
    try {
        writePanelStorage("ae-editor-documents-v1", JSON.stringify({
            script: modeDocuments.script, expression: modeDocuments.expression
        }));
    } catch (e) {}
}

function loadDocuments() {
    try {
        var saved = JSON.parse(localStorage.getItem("ae-editor-documents-v1") || "null");
        if (!saved) return;
        if (typeof saved !== "object" || Array.isArray(saved)) throw new Error("Invalid saved documents");
        ["script", "expression"].forEach(function (mode) {
            var d = saved[mode];
            if (d && typeof d.content !== "string") throw new Error("Invalid saved document");
            if (d && typeof d.content === "string") {
                modeDocuments[mode] = newDocument(d.content, d.name, d.path, d.dirty);
            }
        });
    } catch (e) { protectUnreadStorage("ae-editor-documents-v1"); }
}

function documentToken() {
    var doc = modeDocuments[currentMode];
    return { mode: currentMode, doc: doc, revision: doc ? doc.revision : 0,
        content: editor ? editor.getValue() : "" };
}

function tokenStillCurrent(token) {
    var doc = modeDocuments[token.mode];
    return currentMode === token.mode && doc === token.doc &&
        (!doc || doc.revision === token.revision) && editor.getValue() === token.content;
}

function handlePrimaryAction() {
    if (currentMode === "expression") {
        applyExpressionToSelected();
    } else {
        runScript();
    }
}

// ─── CodeMirror ──────────────────────────────────────────────────────────────

function initEditor() {
    editor = CodeMirror.fromTextArea(document.getElementById("code-editor"), {
        mode: "javascript",
        theme: "ae-dark-theme",
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: false,
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-error-gutter"],
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-Enter": handlePrimaryAction,
            "Ctrl-F":     openSearch,
            "Esc":        closeSearch,
            "Ctrl-S": false,
            "Ctrl-O": false,
            "Ctrl-N": false,
            "Tab": function (cm) {
                cm.somethingSelected()
                    ? cm.indentSelection("add")
                    : cm.replaceSelection("    ", "end");
            }
        },
        hintOptions: { hint: aeHint, completeSingle: false }
    });

    editor.setValue([
        "// AE Script Editor",
        "// Ctrl+Enter to run  |  Ctrl+F to find  |  Ctrl+Space to autocomplete",
        "",
        "var comp = app.project.activeItem;",
        "",
        "if (comp && comp instanceof CompItem) {",
        "    alert('Active comp: ' + comp.name);",
        "} else {",
        "    alert('No active comp.');",
        "}"
    ].join("\n"));

    isDirty = false;

    editor.on("change", function () {
        if (restoringDocument) return;
        if (!isDirty) { isDirty = true; updateTitle(); }
        var doc = modeDocuments[currentMode];
        if (doc) { doc.content = editor.getValue(); doc.dirty = true; doc.revision++; persistDocuments(); }
        if (!document.getElementById("search-bar").classList.contains("hidden")) {
            runSearch(false);
        }
        
        lintCurrentDocument();
    });
}

function lintCurrentDocument() {
    if (!editor) return;
    clearErrorMarkers();
    // ExtendScript scripts and Legacy expressions have syntax Acorn cannot model reliably.
    if (currentMode !== "expression" || expressionEngine !== "javascript-1.0" ||
        typeof acorn === "undefined") return;
    try {
        acorn.parse(editor.getValue(), { ecmaVersion: 2018, locations: true });
    } catch (e) {
        if (!e.loc) return;
        var lineIdx = e.loc.line - 1;
        var marker = document.createElement("div");
        marker.className = "error-marker";
        marker.innerHTML = "●";
        marker.title = e.message;
        errorMarkers.push(editor.setGutterMarker(lineIdx, "CodeMirror-error-gutter", marker));
        errorLineWidgets.push(editor.addLineClass(lineIdx, "background", "lint-error"));
    }
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────

var AE_KW = [
    "app","app.project","app.activeViewer","app.version","app.buildName",
    "app.executeCommand","app.beginUndoGroup","app.endUndoGroup",
    "app.project.activeItem","app.project.items","app.project.numItems",
    "app.project.renderQueue","app.project.rootFolder",
    "app.project.item()","app.project.importFile()",
    "CompItem","comp.layers","comp.numLayers","comp.name","comp.width","comp.height",
    "comp.duration","comp.frameRate","comp.selectedLayers","comp.layer()","comp.time",
    "layer","layer.name","layer.index","layer.enabled","layer.property()",
    "layer.transform","layer.effects","layer.position","layer.scale",
    "layer.rotation","layer.opacity","layer.inPoint","layer.outPoint",
    "layer.startTime","layer.parent","layer.source","layer.duplicate()","layer.remove()",
    "layer.setParentWithJump()",
    "property.value","property.setValue()","property.setValueAtTime()",
    "property.addKey()","property.numKeys","property.keyTime()","property.keyValue()",
    "property.expression","property.expressionEnabled",
    "ShapeLayer","TextLayer","AVLayer","CameraLayer","LightLayer",
    "footage","MarkerValue","KeyframeInterpolationType","BlendingMode","TrackMatteType",
    "alert()","confirm()","prompt()",
    "parseInt()","parseFloat()","isNaN()","Math","Math.abs()","Math.round()",
    "Math.floor()","Math.ceil()","Math.sqrt()","Math.min()","Math.max()",
    "Math.PI","Math.pow()","String()","Number()","Boolean()","Array()",
    "JSON.stringify()","JSON.parse()",
    "File","Folder","File.openDialog()","File.saveDialog()",
    "thisComp","thisLayer","thisProperty","time","value",
    "toWorld()","toComp()","toWorldVec()","fromWorld()",
    "wiggle()","loopOut()","loopIn()","linear()","ease()","easeIn()","easeOut()",
    "clamp()","normalize()","radiansToDegrees()","degreesToRadians()",
    "seedRandom()","random()","gaussRandom()","comp()","footage()","layer()",
    "posterizeTime()","timeToFrames()","framesToTime()"
];

var AE_SNIPPETS = [
    { text: "app.beginUndoGroup(\"Action\");\n\n// your code here\n\napp.endUndoGroup();",
      label: "⚡ beginUndoGroup → endUndoGroup" },
    { text: "var comp = app.project.activeItem;\nif (comp && comp instanceof CompItem) {\n    \n}",
      label: "⚡ if activeItem is CompItem" },
    { text: "for (var i = 1; i <= comp.numLayers; i++) {\n    var layer = comp.layer(i);\n    \n}",
      label: "⚡ for loop — all layers" },
    { text: "var sel = comp.selectedLayers;\nfor (var i = 0; i < sel.length; i++) {\n    var layer = sel[i];\n    \n}",
      label: "⚡ for loop — selected layers" },
    { text: "try {\n    \n} catch (e) {\n    alert(e.message);\n}",
      label: "⚡ try / catch" },
    { text: "function myFunction() {\n    \n}\nmyFunction();",
      label: "⚡ function declaration" },
    { text: "property.setValueAtTime(time, value);",
      label: "⚡ setValueAtTime" },
    { text: "var null3D = comp.layers.addNull();\nnull3D.threeDLayer = true;\nnull3D.name = \"Null 3D\";",
      label: "⚡ add Null 3D layer" }
];

var AE_EXPR_SNIPPETS = [
    { text: "wiggle(3, 20);",
      label: "✦ Wiggle (freq, amp)" },
    { text: "loopOut(\"cycle\");",
      label: "✦ Loop Out (Cycle)" },
    { text: "loopOut(\"pingpong\");",
      label: "✦ Loop Out (PingPong)" },
    { text: "// Inertial Bounce (Overshoot)\nvar amp = 0.05;\nvar freq = 4.0;\nvar decay = 5.0;\nvar n = 0;\nif (numKeys > 0) {\n    n = nearestKey(time).index;\n    if (key(n).time > time) n--;\n}\nif (n === 0) {\n    t = 0;\n} else {\n    t = time - key(n).time;\n}\nif (n > 0 && t < 1) {\n    var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);\n    value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);\n} else {\n    value;\n}",
      label: "✦ Inertial Bounce (Overshoot)" },
    { text: "linear(time, inPoint, inPoint + 0.5, 0, 100);",
      label: "✦ Linear Fade In" },
    { text: "ease(time, outPoint - 0.5, outPoint, 100, 0);",
      label: "✦ Ease Fade Out" },
    { text: "posterizeTime(12);\nvalue;",
      label: "✦ Posterize Time (Stop Motion)" },
    { text: "// Auto Fade In/Out\nvar fade = 0.5;\nvar fIn = linear(time, inPoint, inPoint + fade, 0, 100);\nvar fOut = linear(time, outPoint - fade, outPoint, 100, 0);\nMath.min(fIn, fOut);",
      label: "✦ Auto Fade In/Out (Opacity)" },
    { text: "// Counter-Scale Parent\nvar p = parent.transform.scale.value;\n[value[0] * (100 / p[0]), value[1] * (100 / p[1])];",
      label: "✦ Counter-Scale Parent" },
    { text: "// Index Delay Follower\nvar delay = (index - 1) * 0.1;\nthisComp.layer(1).transform.position.valueAtTime(time - delay);",
      label: "✦ Index Delay (Follow Leader)" },
    { text: "// Digital Clock (mm:ss)\nvar sec = Math.floor(time % 60);\nvar min = Math.floor(time / 60);\n(min < 10 ? '0' + min : min) + ':' + (sec < 10 ? '0' + sec : sec);",
      label: "✦ Digital Clock (mm:ss)" }
];

function userWords(cm) {
    var seen = {}, out = [], re = /\b([a-zA-Z_$][a-zA-Z0-9_$]{2,})\b/g, m;
    while ((m = re.exec(cm.getValue())) !== null) {
        if (!seen[m[1]]) { seen[m[1]] = true; out.push(m[1]); }
    }
    return out;
}

function aeHint(cm) {
    var cur = cm.getCursor(), line = cm.getLine(cur.line);
    var s = cur.ch, e = cur.ch;
    while (s > 0 && /[\w.$]/.test(line[s - 1])) s--;
    while (e < line.length && /[\w.$]/.test(line[e])) e++;
    var word = line.slice(s, e).toLowerCase();
    var list;
    if (!word) {
        var snips = (currentMode === "expression") ? AE_EXPR_SNIPPETS : AE_SNIPPETS;
        list = snips.map(function (sn) {
            return { text: sn.text, displayText: sn.label };
        });
    } else {
        var kw = AE_KW.filter(function (k) { return k.toLowerCase().indexOf(word) === 0; })
                      .map(function (k) { return { text: k, displayText: k }; });
                      
        var docs = [];
        if (typeof AEDocs !== "undefined") {
            for (var key in AEDocs) {
                if (key.toLowerCase().indexOf(word) === 0) {
                    var entry = AEDocs[key];
                    var isFunction = (entry.category === "function" || entry.args);
                    var argsDisplay = "";
                    if (entry.args) {
                        argsDisplay = entry.args.map(function(a) { return a.split("=")[0]; }).join(", ");
                    }
                    docs.push({
                        text: isFunction ? (key + "()") : key,
                        displayText: "🪄 " + (isFunction ? (key + "(" + argsDisplay + ")") : key)
                    });
                }
            }
        }

        var uw = userWords(cm).filter(function (w) {
            return w.toLowerCase().indexOf(word) === 0 && AE_KW.indexOf(w) === -1 && !(typeof AEDocs !== "undefined" && AEDocs[w]);
        }).map(function (w) { return { text: w, displayText: "◈ " + w }; });
        list = docs.concat(kw).concat(uw);
    }
    return { list: list, from: CodeMirror.Pos(cur.line, s), to: CodeMirror.Pos(cur.line, e) };
}

// ─── Debug / Error System ─────────────────────────────────────────────────────

function clearErrorMarkers() {
    // Remove gutter markers
    for (var i = 0; i < errorMarkers.length; i++) {
        editor.setGutterMarker(errorMarkers[i], "CodeMirror-error-gutter", null);
    }
    errorMarkers = [];
    // Line classes return LineHandles; marked text returns a clearable marker.
    for (var j = 0; j < errorLineWidgets.length; j++) {
        var mark = errorLineWidgets[j];
        if (mark && typeof mark.clear === "function") {
            mark.clear();
        } else if (mark) {
            editor.removeLineClass(mark, "background", "lint-error");
        }
    }
    errorLineWidgets = [];
}

function showError(err) {
    // err = { message, line, col, name }
    errorList.unshift({ ts: new Date(), err: err });
    if (errorList.length > 50) errorList.pop();

    // Mark error line in editor if line is known
    if (err.line !== null && err.line > 0) {
        var lineIdx = err.line - 1; // CodeMirror is 0-based

        // Gutter icon
        var marker = document.createElement("div");
        marker.className = "error-gutter-marker";
        marker.title = err.message;
        marker.textContent = "✕";
        editor.setGutterMarker(lineIdx, "CodeMirror-error-gutter", marker);
        errorMarkers.push(lineIdx);

        // Line background highlight
        var mark = editor.markText(
            { line: lineIdx, ch: 0 },
            { line: lineIdx, ch: editor.getLine(lineIdx).length },
            { className: "cm-error-line" }
        );
        errorLineWidgets.push(mark);

        // Scroll to error line
        editor.scrollIntoView({ line: lineIdx, ch: 0 }, 80);
        editor.setCursor({ line: lineIdx, ch: err.col ? err.col - 1 : 0 });
    }

    // Render error panel
    renderErrorList();
    switchTab("errors");
    updateErrorBadge();
}

function renderErrorList() {
    var list = document.getElementById("error-list");
    if (!errorList.length) {
        list.innerHTML = '<div class="error-empty">No errors recorded.</div>';
        return;
    }
    list.innerHTML = errorList.map(function (item, idx) {
        var e = item.err;
        var time = item.ts.toLocaleTimeString();
        var lineInfo = (e.line !== null && e.line > 0)
            ? '<span class="err-line-link" onclick="jumpToErrorLine(' + e.line + ')">Line ' + e.line +
              (e.col ? ', Col ' + e.col : '') + '</span>'
            : '<span class="err-no-line">Line unknown</span>';
        return '<div class="error-entry">' +
            '<div class="err-header">' +
                '<span class="err-type">' + (e.name || "Error") + '</span>' +
                lineInfo +
                '<span class="err-time">' + time + '</span>' +
            '</div>' +
            '<div class="err-message">' + escapeHtml(e.message) + '</div>' +
        '</div>';
    }).join("");
}

function jumpToErrorLine(lineNum) {
    var lineIdx = lineNum - 1;
    editor.focus();
    editor.setCursor({ line: lineIdx, ch: 0 });
    editor.scrollIntoView({ line: lineIdx, ch: 0 }, 80);
}

function updateErrorBadge() {
    var badge = document.getElementById("error-badge");
    if (errorList.length > 0) {
        badge.textContent = errorList.length;
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ─── Debug Tabs ───────────────────────────────────────────────────────────────

function initDebugTabs() {
    document.querySelectorAll(".out-tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
            switchTab(this.getAttribute("data-tab"));
        });
    });
}

function switchTab(name) {
    document.querySelectorAll(".out-tab").forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-tab") === name);
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
        panel.classList.add("hidden");
    });
    var panel = document.getElementById("tab-" + name);
    if (panel) panel.classList.remove("hidden");
}

// ─── Search ───────────────────────────────────────────────────────────────────

function initSearch() {
    document.getElementById("search-input").addEventListener("input", function () { runSearch(true); });
    document.getElementById("search-input").addEventListener("keydown", function (e) {
        if (e.key === "Enter")  { e.preventDefault(); e.shiftKey ? stepSearch(-1) : stepSearch(1); }
        if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
    });
    document.getElementById("replace-input").addEventListener("keydown", function (e) {
        if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
    });
    document.getElementById("btn-next").addEventListener("click", function () { stepSearch(1); });
    document.getElementById("btn-prev").addEventListener("click", function () { stepSearch(-1); });
    document.getElementById("btn-search-close").addEventListener("click", closeSearch);
    document.getElementById("btn-toggle-replace").addEventListener("click", toggleReplace);
    document.getElementById("btn-replace-one").addEventListener("click", replaceOne);
    document.getElementById("btn-replace-all").addEventListener("click", replaceAll);
}

function openSearch() {
    document.getElementById("search-bar").classList.remove("hidden");
    var inp = document.getElementById("search-input");
    var sel = editor.getSelection();
    if (sel && sel.indexOf("\n") === -1) inp.value = sel;
    inp.focus(); inp.select();
    runSearch(true);
}

function closeSearch() {
    document.getElementById("search-bar").classList.add("hidden");
    document.getElementById("replace-row").classList.add("hidden");
    clearSearchMarks();
    document.getElementById("search-count").textContent = "";
    document.getElementById("search-input").value = "";
    document.getElementById("replace-input").value = "";
    editor.focus();
}

function toggleReplace() {
    var row = document.getElementById("replace-row");
    row.classList.toggle("hidden");
    if (!row.classList.contains("hidden")) document.getElementById("replace-input").focus();
}

function clearSearchMarks() {
    for (var i = 0; i < searchMarks.length; i++) searchMarks[i].clear();
    searchMarks = []; searchMatches = []; searchIndex = -1;
}

function runSearch(resetIndex) {
    clearSearchMarks();
    var term = document.getElementById("search-input").value;
    var inp  = document.getElementById("search-input");
    var cnt  = document.getElementById("search-count");
    if (!term) { cnt.textContent = ""; inp.classList.remove("no-match"); return; }
    var re;
    try { re = new RegExp(escapeRegex(term), "gi"); } catch (e) { return; }
    var content = editor.getValue(), m;
    while ((m = re.exec(content)) !== null) {
        var from = editor.posFromIndex(m.index);
        var to   = editor.posFromIndex(m.index + m[0].length);
        searchMatches.push({ from: from, to: to });
        searchMarks.push(editor.markText(from, to, { className: "cm-searching" }));
    }
    var total = searchMatches.length;
    inp.classList.toggle("no-match", total === 0);
    if (!total) { cnt.textContent = "0 / 0"; return; }
    if (resetIndex || searchIndex < 0) searchIndex = 0;
    jumpToMatch(searchIndex);
    cnt.textContent = (searchIndex + 1) + " / " + total;
}

function stepSearch(dir) {
    if (!searchMatches.length) return;
    searchIndex = (searchIndex + dir + searchMatches.length) % searchMatches.length;
    jumpToMatch(searchIndex);
    document.getElementById("search-count").textContent = (searchIndex + 1) + " / " + searchMatches.length;
}

function jumpToMatch(idx) {
    var m = searchMatches[idx];
    editor.setSelection(m.from, m.to);
    editor.scrollIntoView({ from: m.from, to: m.to }, 60);
}

function replaceOne() {
    if (!searchMatches.length) return;
    var rep = document.getElementById("replace-input").value;
    var m   = searchMatches[searchIndex >= 0 ? searchIndex : 0];
    editor.replaceRange(rep, m.from, m.to);
    runSearch(false);
}

function replaceAll() {
    var term = document.getElementById("search-input").value;
    var rep  = document.getElementById("replace-input").value;
    if (!term) return;
    var re    = new RegExp(escapeRegex(term), "g");
    var count = (editor.getValue().match(re) || []).length;
    editor.setValue(editor.getValue().replace(re, rep));
    runSearch(true);
    setOutput("Replaced " + count + " occurrence(s).", "info");
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ─── Event Listeners ──────────────────────────────────────────────────────────

function initListeners() {
    document.getElementById("btn-run").addEventListener("click", handlePrimaryAction);
    if (document.getElementById("mode-btn-script")) {
        document.getElementById("mode-btn-script").addEventListener("click", function () { setMode("script"); });
    }
    if (document.getElementById("mode-btn-expr")) {
        document.getElementById("mode-btn-expr").addEventListener("click", function () { setMode("expression"); });
    }
    if (document.getElementById("btn-pull-expr")) {
        document.getElementById("btn-pull-expr").addEventListener("click", pullExpressionFromSelected);
    }
    document.getElementById("btn-library").addEventListener("click", openLibModal);
    document.getElementById("btn-new").addEventListener("click", newScript);
    document.getElementById("btn-open").addEventListener("click", openScript);
    document.getElementById("btn-save").addEventListener("click", saveScript);
    document.getElementById("btn-save-as").addEventListener("click", saveScriptAs);
    document.getElementById("btn-format").addEventListener("click", formatCode);
    if (document.getElementById("btn-annotate")) {
        document.getElementById("btn-annotate").addEventListener("click", annotateScript);
    }
    if (document.getElementById("btn-remove-comments")) {
        document.getElementById("btn-remove-comments").addEventListener("click", removeScriptComments);
    }
    document.getElementById("btn-clear-output").addEventListener("click", clearOutput);
    document.getElementById("theme-select").addEventListener("change", function () {
        applyTheme(this.value);
        try { writePanelStorage("ae-editor-theme", this.value); } catch (e) {}
    });
    document.getElementById("file-title").addEventListener("change", function () {
        var v = this.value.trim();
        if (v) currentName = v; else this.value = currentName || "Untitled";
        syncCurrentDocument(); persistDocuments();
    });
    document.getElementById("btn-recent").addEventListener("click", function (e) {
        document.getElementById("recent-menu").classList.toggle("visible");
        e.stopPropagation();
    });
    document.addEventListener("click", function () {
        document.getElementById("recent-menu").classList.remove("visible");
    });
    document.addEventListener("keydown", function (e) {
        if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); handlePrimaryAction(); }
    });

    // Library event bindings
    document.getElementById("btn-lib-add").addEventListener("click", createNewSnippet);
    document.getElementById("btn-lib-delete").addEventListener("click", deleteCurrentSnippet);
    document.getElementById("btn-lib-save").addEventListener("click", saveCurrentSnippet);
    document.getElementById("btn-lib-copy").addEventListener("click", copyCurrentSnippet);
    document.getElementById("btn-lib-paste-sel").addEventListener("click", loadSnippetToEditor);
    document.getElementById("lib-search").addEventListener("input", function () {
        libSearchTerm = this.value;
        renderLibSidebar();
    });
    document.getElementById("lib-snippet-title").addEventListener("keydown", function (e) {
        if (e.key === "Enter") saveCurrentSnippet();
    });
    document.getElementById("lib-snippet-title").addEventListener("input", saveLibDraft);

    // Escape key to close library modal
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            if (document.getElementById("lib-modal-overlay").classList.contains("open")) {
                closeLibModal();
            }
        }
    });

    // Overlay click-to-close for library modal
    document.getElementById("lib-modal-overlay").addEventListener("click", function (e) {
        if (e.target === this) closeLibModal();
    });
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function runScript() {
    var code = editor.getValue();
    if (!code.trim()) return;

    clearErrorMarkers();
    setOutput("Running…", "info");
    switchTab("console");

    withHost(function () {
        csInterface.evalScript("runScript(" + JSON.stringify(code) + ")", function (r) {
            try {
                var d = JSON.parse(r);
                if (d.success) {
                    setOutput(d.result || "Script executed successfully.", "success");
                } else {
                    setOutput("Error — check the Errors tab.", "error");
                    // Try to pull line number from message string if AE didn't surface it
                    var line = (d.line !== undefined && d.line !== null) ? d.line : null;
                    if (!line && d.error) {
                        var lm = d.error.match(/->\s*(\d+)/i)   ||  // ExtendScript "-> 12"
                                 d.error.match(/line\s+(\d+)/i)  ||
                                 d.error.match(/\(line\s+(\d+)\)/);
                        if (lm) line = parseInt(lm[1], 10);
                    }
                    showError({
                        message: d.error || "Unknown error",
                        line:    line,
                        col:     d.col  || null,
                        name:    d.name || "Error"
                    });
                }
            } catch (e) {
                setOutput("Unexpected response:\n" + r, "warning");
            }
        });
    });
}

function applyExpressionToSelected() {
    var code = editor.getValue();
    if (!code.trim()) {
        setOutput("Editor is empty. Write or paste an expression first.", "warning");
        return;
    }

    clearErrorMarkers();
    setOutput("Applying expression to selected timeline properties…", "info");
    switchTab("console");

    withHost(function () {
        csInterface.evalScript("applyExpressionToSelectedProperties(" + JSON.stringify(code) + ")", function (r) {
            try {
                var d = JSON.parse(r);
                if (d.success) {
                    var msg = "✔ Applied to " + d.applied + " property(ies) across " + d.layerCount + " layer(s).";
                    if (d.errors && d.errors.length > 0) {
                        msg += " (" + d.errors.length + " warnings)";
                        d.errors.forEach(function (errStr) {
                            showError({ message: errStr, line: null, col: null, name: "Expression Warning" });
                        });
                    }
                    setOutput(msg, "success");
                } else {
                    setOutput("✖ " + (d.error || "Failed to apply expression."), "error");
                    showError({
                        message: d.error || "Failed to apply expression",
                        line: null,
                        col: null,
                        name: "Expression Error"
                    });
                }
            } catch (e) {
                setOutput("Unexpected response from AE:\n" + r, "warning");
            }
        });
    });
}

function pullExpressionFromSelected() {
    var token = documentToken();
    clearErrorMarkers();
    setOutput("Reading expression from selected timeline property…", "info");

    withHost(function () {
        csInterface.evalScript("getSelectedPropertyExpression()", function (r) {
            try {
                var d = JSON.parse(r);
                if (d.success) {
                    if (!tokenStillCurrent(token)) { setOutput("Editor changed while reading the expression. Pull again.", "warning"); return; }
                    if (isDirty) {
                        showConfirm("Replace editor content with expression from '" + d.layerName + " > " + d.propName + "'?", "Pull Expression", function () {
                            if (tokenStillCurrent(token)) doPullExpression(d);
                            else setOutput("Editor changed before Pull completed. Pull again.", "warning");
                        });
                    } else {
                        doPullExpression(d);
                    }
                } else {
                    setOutput("✖ " + (d.error || "Could not read expression."), "warning");
                }
            } catch (e) {
                setOutput("Unexpected response:\n" + r, "error");
            }
        });
    });
}

function doPullExpression(d) {
    replaceCurrentDocument(d.expression || "", d.propName + " (Expr)", null, true);
    setOutput("Pulled expression from " + d.layerName + " > " + d.propName + (d.expression ? "" : " (property had no expression)"), "success");
}

function newScript() {
    if (isDirty) {
        var token = documentToken();
        showConfirm("Discard unsaved changes?", "New File", function () {
            if (tokenStillCurrent(token)) doNewScript();
            else setOutput("Editor changed before New completed.", "warning");
        });
        return;
    }
    doNewScript();
}

function doNewScript() {
    var content, name;
    if (currentMode === "expression") {
        content = [
            "// Expression for selected properties",
            "// Ctrl+Enter to apply to all selected properties across timeline",
            "",
            "wiggle(3, 20);"
        ].join("\n");
        name = "Expression";
    } else {
        content = [
            "// AE ExtendScript",
            "// Ctrl+Enter to run in AE",
            "",
            "var comp = app.project.activeItem;",
            "if (comp && comp instanceof CompItem) {",
            "    alert('Active comp: ' + comp.name);",
            "} else {",
            "    alert('No active comp.');",
            "}"
        ].join("\n");
        name = "Untitled";
    }
    replaceCurrentDocument(content, name, null, false);
    clearErrorMarkers(); errorList = []; updateErrorBadge();
    renderErrorList();
    updateTitle(); clearOutput();
}

function openScript() {
    if (isDirty) {
        var token = documentToken();
        showConfirm("Discard unsaved changes?", "Open File", function () {
            if (tokenStillCurrent(token)) doOpenScript();
            else setOutput("Editor changed before Open completed.", "warning");
        });
        return;
    }
    doOpenScript();
}

function doOpenScript() {
    var token = documentToken();
    withHost(function () {
        if (!tokenStillCurrent(token)) return;
        csInterface.evalScript("openFileDialog()", function (r) {
            try {
                var d = JSON.parse(r);
                if (d.success) {
                    if (!tokenStillCurrent(token)) { setOutput("Editor changed while opening the file. Open it again.", "warning"); return; }
                    replaceCurrentDocument(d.content, d.name, d.path, false);
                    addToRecent(currentPath, currentName);
                    setOutput("Opened: " + currentName, "info");
                } else if (d.error !== "Cancelled") {
                    setOutput("Error opening file: " + d.error, "error");
                }
            } catch (e) { setOutput("Unexpected error opening file.", "error"); }
        });
    });
}

function saveScript() {
    if (currentPath) {
        var token = documentToken();
        var savePath = currentPath;
        withHost(function () {
            if (!tokenStillCurrent(token) || currentPath !== savePath) return;
            csInterface.evalScript("saveFileContent(" + JSON.stringify(savePath) + "," + JSON.stringify(token.content) + ")", function (r) {
                try {
                    var d = JSON.parse(r);
                    if (d.success) finishSave(token, savePath, null);
                    else setOutput("Error saving: " + d.error, "error");
                } catch (e) { setOutput("Unexpected response while saving.", "error"); }
            });
        });
    } else { saveScriptAs(); }
}

function saveScriptAs() {
    var token = documentToken();
    withHost(function () {
        if (!tokenStillCurrent(token)) return;
        csInterface.evalScript("saveFileDialog(" + JSON.stringify(token.content) + ")", function (r) {
            try {
                var d = JSON.parse(r);
                if (d.success) {
                    finishSave(token, d.path, d.name);
                } else if (d.error !== "Cancelled") {
                    setOutput("Error saving: " + d.error, "error");
                }
            } catch (e) { setOutput("Unexpected response while saving.", "error"); }
        });
    });
}

function finishSave(token, path, name) {
    var doc = token.doc;
    if (doc && modeDocuments[token.mode] !== doc) {
        setOutput("File saved, but the editor now shows another document.", "warning");
        return;
    }
    if (doc) {
        doc.path = path;
        if (name) doc.name = name;
    }
    var unchanged = doc ? (doc.revision === token.revision && doc.content === token.content) : tokenStillCurrent(token);
    if (currentMode === token.mode && (!doc || modeDocuments[token.mode] === doc)) {
        currentPath = path;
        if (name) currentName = name;
        isDirty = !unchanged;
        updateTitle();
    }
    if (doc) doc.dirty = !unchanged;
    persistDocuments();
    if (name) addToRecent(path, name);
    setOutput(unchanged ? "Saved: " + (name || (doc ? doc.name : currentName)) :
        "An earlier version was saved; newer edits remain unsaved.", unchanged ? "success" : "warning");
}

function openRecentFile(path, name) {
    if (isDirty) {
        var token = documentToken();
        showConfirm("Discard unsaved changes?", "Open Recent", function() {
            if (tokenStillCurrent(token)) doOpenRecentFile(path, name);
            else setOutput("Editor changed before Open completed.", "warning");
        });
        return;
    }
    doOpenRecentFile(path, name);
}

function doOpenRecentFile(path, name) {
    var token = documentToken();
    withHost(function () {
        if (!tokenStillCurrent(token)) return;
        csInterface.evalScript("readFileContent(" + JSON.stringify(path) + ")", function (r) {
            try {
                var d = JSON.parse(r);
                if (d.success) {
                    if (!tokenStillCurrent(token)) { setOutput("Editor changed while opening the file. Open it again.", "warning"); return; }
                    replaceCurrentDocument(d.content, name, path, false);
                    setOutput("Opened: " + name, "info");
                } else {
                    setOutput("Could not open: " + d.error, "error");
                    removeFromRecent(path); updateRecentMenu();
                }
            } catch (e) { setOutput("Unexpected response while opening the recent file.", "error"); }
        });
    });
    document.getElementById("recent-menu").classList.remove("visible");
}

// ─── Format ───────────────────────────────────────────────────────────────────

function formatCode() {
    try {
        var fmt = js_beautify(editor.getValue(), {
            indent_size: 4,
            indent_char: " ",
            max_preserve_newlines: 1,
            preserve_newlines: true,
            keep_array_indentation: false,
            break_chained_methods: false,
            brace_style: "collapse",
            space_before_conditional: true,
            end_with_newline: false,
            wrap_line_length: 0
        });
        fmt = fmt
            .replace(/(\{)\n(\s*)\n/g, "$1\n$2")
            .replace(/\n(\s*)\n(\s*\})/g, "\n$2")
            .replace(/^(\s*\n)+/, "")
            .replace(/(\n\s*)+$/, "");
        editor.setValue(fmt);
        setOutput("Code formatted.", "info");
    } catch (e) {
        setOutput("Format error: " + e.message, "error");
    }
}

// ─── AST Auto-Comment ─────────────────────────────────────────────────────────

function annotateScript() {
    var code = editor.getValue();
    if (!code) return;

    var result = annotateCode(code, editor, null);

    if (result.error) {
        setOutput(result.error, "error");
    } else if (result.message) {
        setOutput(result.message, "info");
    } else {
        var msg = "Annotated " + result.tokenCount + " token(s) via AST.";
        if (result.patternName) msg = "Detected: " + result.patternName + " \u00b7 " + msg;
        setOutput(msg, "info");
    }
}

function removeScriptComments() {
    var code = editor.getValue();
    if (!code) return;

    showConfirm("Remove all comments from this script?", "Remove Comments", function() {
        var result = removeCodeComments(editor.getValue(), editor);
        if (result.error) {
            setOutput(result.error, "error");
        } else if (result.count === 0) {
            setOutput("No comments found to remove.", "info");
        } else {
            setOutput("Removed " + result.count + " comment(s).", "info");
        }
    });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function setOutput(msg, type) {
    var el = document.getElementById("output");
    el.textContent = msg;
    el.className = "output " + (type || "");
    switchTab("console");
}

function clearOutput() {
    document.getElementById("output").textContent = "";
    document.getElementById("output").className = "output";
    errorList = []; clearErrorMarkers(); updateErrorBadge(); renderErrorList();
}

function updateTitle() {
    var name  = currentName || "Untitled";
    var input = document.getElementById("file-title");
    if (!input) return;
    input.value = name;
    input.title = currentPath || name;
    input.style.color = isDirty ? "var(--warn)" : "var(--t1)";
}

function addToRecent(path, name) {
    recentScripts = recentScripts.filter(function (r) { return r.path !== path; });
    recentScripts.unshift({ path: path, name: name });
    if (recentScripts.length > 10) recentScripts = recentScripts.slice(0, 10);
    saveRecent(); updateRecentMenu();
}

function removeFromRecent(path) {
    recentScripts = recentScripts.filter(function (r) { return r.path !== path; });
    saveRecent();
}

function saveRecent() {
    try { writePanelStorage("ae-recent", JSON.stringify(recentScripts)); } catch (e) {}
}

function loadRecent() {
    try { var s = localStorage.getItem("ae-recent"); if (s) recentScripts = JSON.parse(s); }
    catch (e) { recentScripts = []; protectUnreadStorage("ae-recent"); }
}

function updateRecentMenu() {
    var menu = document.getElementById("recent-menu");
    var html = recentScripts.length ? recentScripts.map(function (r, i) {
        return '<div class="recent-item" data-recent="' + i + '" title="' + escapeHtml(r.path) + '">' +
            '<span>&#128196;</span><span class="recent-name">' + escapeHtml(r.name) + '</span></div>';
    }).join("") : '<div class="recent-empty">No recent files</div>';
    if (recoveryDrafts.length) {
        html += '<div class="recent-empty">Recover drafts</div>' + recoveryDrafts.map(function (d, i) {
            return '<div class="recent-item" data-draft="' + i + '">' +
                '<span>↩</span><span class="recent-name">' + escapeHtml(d.name) +
                ' (' + (d.mode === "expression" ? "Expression" : "Script") + ')</span></div>';
        }).join("");
    }
    menu.innerHTML = html;
    if (!menu.querySelectorAll) return;
    Array.prototype.forEach.call(menu.querySelectorAll("[data-recent]"), function (item) {
        item.addEventListener("click", function () {
            var r = recentScripts[parseInt(item.getAttribute("data-recent"), 10)];
            if (r) openRecentFile(r.path, r.name);
        });
    });
    Array.prototype.forEach.call(menu.querySelectorAll("[data-draft]"), function (item) {
        item.addEventListener("click", function () {
            restoreRecoveryDraft(parseInt(item.getAttribute("data-draft"), 10));
        });
    });
}

// ─── Script Snippet Library ───────────────────────────────────────────────────

var libSnippets = [];
var currentSnippetId = null;
var libEditor = null;
var libSearchTerm = "";
var libDrafts = {};
var loadingSnippet = false;

function libDraftKey(id) { return getLibStorageKey() + ":" + id; }

function loadLibDrafts() {
    try {
        var stored = JSON.parse(localStorage.getItem("ae-editor-lib-drafts-v1") || "{}");
        if (!stored || typeof stored !== "object" || Array.isArray(stored)) throw new Error("Invalid snippet drafts");
        libDrafts = stored && typeof stored === "object" ? stored : {};
    } catch (e) { libDrafts = {}; protectUnreadStorage("ae-editor-lib-drafts-v1"); }
}

function saveLibDraft() {
    if (loadingSnippet || !currentSnippetId || !libEditor) return;
    libDrafts[libDraftKey(currentSnippetId)] = {
        code: libEditor.getValue(), title: document.getElementById("lib-snippet-title").value
    };
    document.getElementById("btn-lib-save").classList.add("changed");
    try { writePanelStorage("ae-editor-lib-drafts-v1", JSON.stringify(libDrafts)); } catch (e) {}
}

var DEFAULT_EXPR_LIB = [
    {
        id: "snip_expr_wiggle",
        title: "Wiggle (Frequency & Amplitude)",
        code: "// Wiggle frequency (times per second), amplitude (amount)\nwiggle(3, 25);"
    },
    {
        id: "snip_expr_loopout",
        title: "Loop Out (Cycle / PingPong)",
        code: "// Loops keyframes continuously\nloopOut(\"cycle\");\n// Or: loopOut(\"pingpong\");"
    },
    {
        id: "snip_expr_bounce",
        title: "Inertial Bounce (Overshoot)",
        code: "// Inertial bounce after last keyframe\nvar amp = 0.05;\nvar freq = 4.0;\nvar decay = 5.0;\nvar n = 0;\nif (numKeys > 0) {\n    n = nearestKey(time).index;\n    if (key(n).time > time) n--;\n}\nif (n === 0) {\n    t = 0;\n} else {\n    t = time - key(n).time;\n}\nif (n > 0 && t < 1) {\n    var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);\n    value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);\n} else {\n    value;\n}"
    },
    {
        id: "snip_expr_autofade",
        title: "Auto Fade In & Out (Opacity)",
        code: "// Automatically fades opacity in at inPoint and out at outPoint\nvar fadeDuration = 0.5;\nvar fIn = linear(time, inPoint, inPoint + fadeDuration, 0, 100);\nvar fOut = linear(time, outPoint - fadeDuration, outPoint, 100, 0);\nMath.min(fIn, fOut);"
    },
    {
        id: "snip_expr_linear_remap",
        title: "Linear Range Remap",
        code: "// Remap input range [0, 100] to output [0, 500]\nlinear(value, 0, 100, 0, 500);"
    },
    {
        id: "snip_expr_counter_scale",
        title: "Maintain Scale with Parent",
        code: "// Apply to Scale to keep layer size independent of parent scale\nvar p = parent.transform.scale.value;\n[value[0] * (100 / p[0]), value[1] * (100 / p[1])];"
    },
    {
        id: "snip_expr_index_delay",
        title: "Follow Leader (Index Delay)",
        code: "// Positions layer based on layer above it with time offset\nvar delay = 0.08;\nthisComp.layer(index - 1).transform.position.valueAtTime(time - delay);"
    },
    {
        id: "snip_expr_clock",
        title: "Digital Timer / Clock (mm:ss)",
        code: "// Apply to Source Text on a Text Layer\nvar sec = Math.floor(time % 60);\nvar min = Math.floor(time / 60);\n(min < 10 ? '0' + min : min) + ':' + (sec < 10 ? '0' + sec : sec);"
    }
];

function getLibStorageKey() {
    return (currentMode === "expression") ? "ae-expr-lib" : "ae-script-lib";
}

function loadLibSnippets() {
    var key = getLibStorageKey();
    libSnippets = [];
    try {
        var data = localStorage.getItem(key);
        if (data) libSnippets = JSON.parse(data);
    } catch (e) { protectUnreadStorage(key); }
    if (!Array.isArray(libSnippets)) libSnippets = [];

    if (currentMode === "expression" && libSnippets.length === 0) {
        libSnippets = DEFAULT_EXPR_LIB.slice();
        saveLibSnippets();
    }
}

function saveLibSnippets() {
    var key = getLibStorageKey();
    try { writePanelStorage(key, JSON.stringify(libSnippets)); } catch (e) {}
}

function currentCmTheme() {
    var n = document.body.className;
    return (n === "ae-dark" || n === "custom-dark") ? "ae-dark-theme" : "ae-light-theme";
}

function openLibModal() {
    loadLibSnippets();
    var headerTitle = document.querySelector("#lib-sidebar-header h3");
    if (headerTitle) {
        headerTitle.textContent = (currentMode === "expression") ? "Expressions" : "Scripts";
    }
    document.getElementById("lib-modal-overlay").classList.add("open");
    renderLibSidebar();

    // Init CodeMirror editor if not ready
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
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            extraKeys: { "Esc": function() { closeLibModal(); } }
        });
        libEditor.on("change", function() {
            saveLibDraft();
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
    var draft = libDrafts[libDraftKey(id)];
    loadingSnippet = true;
    document.getElementById("lib-snippet-title").value = draft ? draft.title : s.title;
    if (libEditor) {
        libEditor.setValue(draft ? draft.code : (s.code || ""));
        document.getElementById("btn-lib-save").classList.toggle("changed", !!draft);
    }
    loadingSnippet = false;
    renderLibSidebar();
    clearLibStatus();
}

function createNewSnippet() {
    var s = {
        id: "snip_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
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
        delete libDrafts[libDraftKey(currentSnippetId)];
        try { writePanelStorage("ae-editor-lib-drafts-v1", JSON.stringify(libDrafts)); } catch (e) {}
        renderLibSidebar();
        document.getElementById("btn-lib-save").classList.remove("changed");
        showLibStatus("Saved!");
    }
}

function deleteCurrentSnippet() {
    if (!currentSnippetId) return;
    showConfirm("Are you sure you want to delete this snippet?", "Delete Snippet", function() {
        libSnippets = libSnippets.filter(function(x) { return x.id !== currentSnippetId; });
        delete libDrafts[libDraftKey(currentSnippetId)];
        try { writePanelStorage("ae-editor-lib-drafts-v1", JSON.stringify(libDrafts)); } catch (e) {}
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

function copyTextToClipboard(text) {
    try {
        var ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    } catch (e) {}
}

function loadSnippetToEditor() {
    if (!libEditor) return;
    var text = libEditor.getValue();
    if (!text) { showLibStatus("Snippet is empty.", true); return; }
    if (editor) {
        if (isDirty) {
            var token = documentToken();
            showConfirm("This will replace the current editor content. Continue?", "Load Snippet", function() {
                if (tokenStillCurrent(token)) doLoadSnippetToEditor(text);
                else showLibStatus("Editor changed. Load the snippet again.", true);
            });
            return;
        }
        doLoadSnippetToEditor(text);
    }
}

function doLoadSnippetToEditor(text) {
    var title = document.getElementById("lib-snippet-title").value.trim() || "Snippet";
    replaceCurrentDocument(text, title + " (Copy)", null, true);
    closeLibModal();
    setOutput("Loaded snippet into editor.", "info");
}

function showLibStatus(msg, isError) {
    var el = document.getElementById("lib-status");
    el.textContent = msg;
    el.className = isError ? "status-error" : "";
    clearTimeout(el._to);
    el._to = setTimeout(function() { el.textContent = ""; el.className = ""; }, 3000);
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


// Storage failures remain visible independently of transient operation messages.
var panelStorageWarning = "";
var unreadStorageKeys = {};
function protectUnreadStorage(key) {
    unreadStorageKeys[key] = true;
    showStorageWarning("Saved drafts/preferences could not be read and were retained. Save or copy current edits; recovery storage will not be overwritten in this session.");
}
function showStorageWarning(message) {
    panelStorageWarning = message;
    if (!document.createElement || !document.body) return;
    var notice = document.getElementById("storage-warning");
    if (!notice) {
        notice = document.createElement("div"); notice.id = "storage-warning";
        notice.setAttribute("role", "alert");
        notice.style.cssText = "flex-shrink:0;padding:6px 10px;color:#e6a260;font-size:11px;white-space:normal;";
        document.body.appendChild(notice);
    }
    notice.textContent = message;
}
function writePanelStorage(key, value) {
    if (unreadStorageKeys[key]) { protectUnreadStorage(key); return false; }
    try { localStorage.setItem(key, value); return true; }
    catch (error) { showStorageWarning("Draft/preferences storage is unavailable or full. Keep this panel open and save or copy your work before closing."); return false; }
}
function installHostActivityIndicator() {
    var original = csInterface.evalScript;
    var count = 0, indicator = document.createElement("span");
    indicator.id = "host-activity"; indicator.setAttribute("role", "status");
    indicator.style.cssText = "flex-shrink:0;padding:3px 8px;font-size:11px;";
    document.body.appendChild(indicator);
    csInterface.evalScript = function (command, callback) {
        count++; indicator.textContent = "After Effects: working…";
        indicator.setAttribute("aria-busy", "true");
        var completed = false;
        function finish() { if (completed) return; completed = true; count--; if (!count) { indicator.textContent = ""; indicator.setAttribute("aria-busy", "false"); } }
        try {
            return original.call(csInterface, command, function (response) {
                finish(); if (callback) callback(response);
            });
        } catch (error) { finish(); throw error; }
    };
}
