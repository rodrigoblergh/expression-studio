/**
 * AE Expression Editor — host.jsx
 */

//@include "json2.jsx"

// ─── Scan ─────────────────────────────────────────────────────────────────────

function collectExpressions(propGroup, layerName, layerIndex, layerMeta, propFilter, results) {
    for (var i = 1; i <= propGroup.numProperties; i++) {
        try {
            var prop = propGroup.property(i);
            if (!prop) continue;

            if (prop.propertyType === PropertyType.PROPERTY) {
                // Only include if: can have expression, AND has one set, AND passes prop filter
                if (prop.canSetExpression &&
                    prop.expression !== undefined &&
                    prop.expression !== null &&
                    prop.expression !== "") {

                    // Apply property name filter if set
                    if (propFilter && propFilter.length > 0) {
                        var nameMatch = false;
                        for (var f = 0; f < propFilter.length; f++) {
                            if (prop.name.toLowerCase().indexOf(propFilter[f].toLowerCase()) !== -1) {
                                nameMatch = true;
                                break;
                            }
                        }
                        if (!nameMatch) continue;
                    }

                    results.push({
                        layerName:   layerName,
                        layerIndex:  layerIndex,
                        layerId:     layerMeta.id,
                        propPath:    buildPropPath(prop),
                        propRoute:   buildPropRoute(prop),
                        propName:    prop.name,
                        expression:  prop.expression,
                        enabled:     prop.expressionEnabled,
                        error:       prop.expressionError || "",
                        hasExpr:     true,
                        // Property context for annotation engine
                        dimensions:  getDimensions(prop),
                        isSeparated: isSeparatedPosition(prop),
                        is3DLayer:   layerMeta.is3D,
                        hasParent:   layerMeta.hasParent,
                        parentName:  layerMeta.parentName,
                        layerType:   layerMeta.layerType
                    });
                }
            } else if (prop.propertyType === PropertyType.INDEXED_GROUP ||
                       prop.propertyType === PropertyType.NAMED_GROUP) {
                collectExpressions(prop, layerName, layerIndex, layerMeta, propFilter, results);
            }
        } catch (e) {}
    }
}

function getDimensions(prop) {
    try {
        var vt = prop.propertyValueType;
        if (vt === PropertyValueType.TwoD || vt === PropertyValueType.TwoD_SPATIAL) return 2;
        if (vt === PropertyValueType.ThreeD || vt === PropertyValueType.ThreeD_SPATIAL) return 3;
        return 1;
    } catch (e) { return 1; }
}

function isSeparatedPosition(prop) {
    try {
        var parent = prop.parentProperty;
        if (parent && parent.name === "Transform") {
            var pos = parent.property("Position");
            if (pos && pos.dimensionsSeparated !== undefined) return pos.dimensionsSeparated;
        }
    } catch (e) {}
    return false;
}

function buildPropPath(prop) {
    var parts   = [];
    var current = prop;
    while (current && current.propertyDepth > 0) {
        parts.unshift(current.name);
        current = current.parentProperty;
    }
    return parts.join(" > ");
}

function buildPropRoute(prop) {
    var route = [], current = prop;
    while (current && current.propertyDepth > 0) {
        route.unshift({ index: current.propertyIndex, name: current.name, matchName: current.matchName });
        current = current.parentProperty;
    }
    return route;
}

/**
 * scanComp — auto scope:
 *   - If layers are selected → scan only those
 *   - Otherwise → scan entire comp
 * propFilterJson: JSON array of property name strings to filter, or "[]" for all
 */
function scanComp(propFilterJson) {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, error: "No active composition." });
        }

        var propFilter = [];
        try { propFilter = JSON.parse(propFilterJson) || []; } catch (e) {}

        // Auto scope
        var layers     = [];
        var scopeLabel = "comp";
        var sel        = comp.selectedLayers;

        if (sel && sel.length > 0) {
            for (var s = 0; s < sel.length; s++) layers.push(sel[s]);
            scopeLabel = sel.length === 1 ? "1 layer" : sel.length + " layers";
        } else {
            for (var k = 1; k <= comp.numLayers; k++) layers.push(comp.layer(k));
        }

        var layerData = [];
        for (var l = 0; l < layers.length; l++) {
            var layer   = layers[l];
            var results = [];
            var layerMeta = {
                id:         typeof layer.id === "number" ? layer.id : null,
                is3D:       layer.threeDLayer || false,
                hasParent:  (layer.parent !== null),
                parentName: layer.parent ? layer.parent.name : null,
                layerType:  getLayerType(layer)
            };
            collectExpressions(layer, layer.name, layer.index, layerMeta, propFilter, results);

            // Only include layer if it has at least one matching expression
            if (results.length > 0) {
                layerData.push({
                    name:        layer.name,
                    index:       layer.index,
                    id:          layerMeta.id,
                    type:        getLayerType(layer),
                    enabled:     layer.enabled,
                    expressions: results
                });
            }
        }

        return JSON.stringify({
            success:  true,
            compName: comp.name,
            compId:   comp.id,
            expressionEngine: app.project.expressionEngine || null,
            scope:    scopeLabel,
            layers:   layerData
        });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}

function getProjectExpressionEngine() {
    try {
        return JSON.stringify({ success: true, engine: app.project.expressionEngine || null });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}

// Preserve active transfers if the Code Editor loads this host again.
if (typeof AEExpressionScanTransfers === "undefined") AEExpressionScanTransfers = {};

function beginExpressionScan(propFilterJson) {
    try {
        var now = new Date().getTime(), count = 0;
        for (var key in AEExpressionScanTransfers) {
            if (AEExpressionScanTransfers.hasOwnProperty(key)) {
                if (now - AEExpressionScanTransfers[key].created > 120000) delete AEExpressionScanTransfers[key];
                else count++;
            }
        }
        if (count >= 4) throw new Error("Too many unfinished scans. Close and reopen the panel.");
        var text = scanComp(propFilterJson);
        var result = JSON.parse(text);
        if (!result.success) return text;
        var token = "scan_" + now + "_" + Math.floor(Math.random() * 1000000000);
        AEExpressionScanTransfers[token] = { text: text, created: now };
        return JSON.stringify({ success: true, token: token, length: text.length });
    } catch (e) { return JSON.stringify({ success: false, error: e.message }); }
}

function readExpressionScanChunk(token, offset) {
    try {
        var transfer = AEExpressionScanTransfers[token];
        if (!transfer) throw new Error("Scan transfer expired. Scan again.");
        if (typeof offset !== "number" || offset !== Math.floor(offset) || offset < 0 || offset >= transfer.text.length) {
            throw new Error("Invalid scan transfer offset.");
        }
        var end = Math.min(offset + 2048, transfer.text.length);
        var last = transfer.text.charCodeAt(end - 1);
        if (end < transfer.text.length && last >= 0xD800 && last <= 0xDBFF) end--;
        transfer.created = new Date().getTime();
        return JSON.stringify({ success: true, token: token, offset: offset, next: end,
            chunk: transfer.text.substring(offset, end), done: end === transfer.text.length });
    } catch (e) { return JSON.stringify({ success: false, error: e.message }); }
}

function releaseExpressionScan(token) {
    delete AEExpressionScanTransfers[token];
    return "AE_EDITOR_SCAN_RELEASED";
}

function getLayerType(layer) {
    if (layer instanceof CameraLayer) return "camera";
    if (layer instanceof LightLayer)  return "light";
    if (layer instanceof TextLayer)   return "text";
    if (layer instanceof ShapeLayer)  return "shape";
    if (layer.nullLayer)              return "null";
    return "av";
}

// ─── Apply ────────────────────────────────────────────────────────────────────

function applyExpressions(changesJson) {
    var undoOpen = false;
    try {
        var changes = JSON.parse(changesJson);
        if (Object.prototype.toString.call(changes) !== "[object Array]") throw new Error("Invalid changes.");
        app.beginUndoGroup("AE Expression Editor: Apply All");
        undoOpen = true;
        var applied = 0, results = [];
        for (var i = 0; i < changes.length; i++) {
            var c = changes[i];
            try {
                var prop = resolveExpressionTarget(c.target);
                if (typeof c.expression !== "string" || typeof c.enabled !== "boolean") throw new Error("Invalid expression change.");
                prop.expression = c.expression;
                prop.expressionEnabled = c.enabled;
                applied++;
                results.push({ key: c.key, success: true, expression: prop.expression, enabled: prop.expressionEnabled });
            } catch (e) {
                results.push({ key: c && c.key, success: false, error: e.message });
            }
        }
        return JSON.stringify({ success: true, applied: applied, results: results });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    } finally {
        if (undoOpen) app.endUndoGroup();
    }
}

function applyOneExpression(targetJson, expression, enabled) {
    var undoOpen = false;
    try {
        var prop = resolveExpressionTarget(JSON.parse(targetJson));
        if (typeof expression !== "string" || typeof enabled !== "boolean") throw new Error("Invalid expression change.");
        app.beginUndoGroup("AE Expression Editor: Apply");
        undoOpen = true;
        prop.expression = expression;
        prop.expressionEnabled = enabled;
        return JSON.stringify({ success: true, expression: prop.expression, enabled: prop.expressionEnabled });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    } finally {
        if (undoOpen) app.endUndoGroup();
    }
}

function toggleExpression(targetJson, enabled) {
    var undoOpen = false;
    try {
        var prop = resolveExpressionTarget(JSON.parse(targetJson));
        if (typeof enabled !== "boolean") throw new Error("Invalid toggle state.");
        app.beginUndoGroup("AE Expression Editor: Toggle");
        undoOpen = true;
        prop.expressionEnabled = enabled;
        return JSON.stringify({ success: true, enabled: prop.expressionEnabled });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    } finally {
        if (undoOpen) app.endUndoGroup();
    }
}

function toggleLayerExpressions(targetJson, state) {
    var undoOpen = false;
    try {
        var layer = resolveLayerTarget(JSON.parse(targetJson));
        if (typeof state !== "boolean") throw new Error("Invalid toggle state.");
        app.beginUndoGroup("AE Expression Editor: Toggle Layer Expressions");
        undoOpen = true;
        var count = 0;
        
        // Recursive helper
        function toggleAllPrps(propGroup) {
            for (var i = 1; i <= propGroup.numProperties; i++) {
                var p = propGroup.property(i);
                if (p.propertyType === PropertyType.PROPERTY) {
                    // has expression?
                    if (p.canSetExpression && p.expression !== undefined && p.expression !== null && p.expression !== "") {
                        p.expressionEnabled = state;
                        count++;
                    }
                } else if (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP) {
                    toggleAllPrps(p);
                }
            }
        }
        
        toggleAllPrps(layer);
        return JSON.stringify({ success: true, count: count, state: state });
    } catch(e) {
        return JSON.stringify({ success: false, error: e.message });
    } finally {
        if (undoOpen) app.endUndoGroup();
    }
}

function resolveLayerTarget(target) {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem) || !target || comp.id !== target.compId) {
        throw new Error("Composition changed since scan. Scan again.");
    }
    var layer = null, i;
    if (typeof target.layerId === "number") {
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).id === target.layerId) { layer = comp.layer(i); break; }
        }
    } else {
        throw new Error("This AE version does not expose stable layer IDs (AE 2022 or newer required for edits).");
    }
    if (!layer || layer.name !== target.layerName) throw new Error("Layer changed since scan. Scan again.");
    return layer;
}

function resolveExpressionTarget(target) {
    var current = resolveLayerTarget(target);
    if (!target.propRoute || !target.propRoute.length) throw new Error("Missing property identity. Scan again.");
    for (var i = 0; i < target.propRoute.length; i++) {
        var step = target.propRoute[i];
        if (step.index < 1 || step.index > current.numProperties) {
            throw new Error("Property changed since scan. Scan again.");
        }
        var next = current.property(step.index);
        if (!next || next.name !== step.name || next.matchName !== step.matchName) {
            throw new Error("Property changed since scan. Scan again.");
        }
        // AE does not give effect instances a persistent ID. Refuse an ambiguous route.
        for (var j = 1; j <= current.numProperties; j++) {
            if (j === step.index) continue;
            var sibling = current.property(j);
            if (sibling && sibling.name === step.name && sibling.matchName === step.matchName) {
                throw new Error("Duplicate property names cannot be identified safely. Rename the effect and scan again.");
            }
        }
        current = next;
    }
    if (!current.canSetExpression || current.propertyType !== PropertyType.PROPERTY) throw new Error("Property cannot hold an expression.");
    if (current.expression !== target.expectedExpression || current.expressionEnabled !== target.expectedEnabled) {
        throw new Error("Expression changed in After Effects since scan. Scan again.");
    }
    return current;
}

function findMatchingPropertyOnLayer(layer, route) {
    var current = layer;
    for (var i = 0; i < route.length; i++) {
        var match = null, count = 0;
        for (var j = 1; j <= current.numProperties; j++) {
            var candidate = current.property(j);
            if (candidate && candidate.matchName === route[i].matchName && candidate.name === route[i].name) {
                match = candidate;
                count++;
            }
        }
        if (count !== 1) throw new Error(count ? "Matching property is ambiguous." : "Matching property was not found.");
        current = match;
    }
    if (current.propertyType !== PropertyType.PROPERTY || !current.canSetExpression) {
        throw new Error("Matching property does not accept expressions.");
    }
    return current;
}

function applyExpressionToSelectedLayers(targetJson, expression) {
    var undoOpen = false;
    try {
        var target = JSON.parse(targetJson);
        resolveExpressionTarget(target);
        if (typeof expression !== "string" || !expression.length) throw new Error("Expression is empty.");
        var comp = app.project.activeItem;
        var selected = comp.selectedLayers;
        if (!selected || !selected.length) throw new Error("Select one or more layers in the timeline.");

        // Check every layer before writing anything. A missing effect must not redirect the expression.
        var destinations = [], problems = [];
        for (var i = 0; i < selected.length; i++) {
            var layer = selected[i];
            try {
                if (layer.locked) throw new Error("Layer is locked.");
                destinations.push({ layer: layer, prop: findMatchingPropertyOnLayer(layer, target.propRoute) });
            } catch (e) {
                problems.push(layer.name + ": " + e.message);
            }
        }
        if (problems.length) {
            return JSON.stringify({ success: false, error: "No layers were changed. " + problems.slice(0, 3).join(" | ") +
                (problems.length > 3 ? " | ...and " + (problems.length - 3) + " more" : "") });
        }

        app.beginUndoGroup("AE Expression Editor: Apply to Selected Layers");
        undoOpen = true;
        var applied = 0, results = [];
        for (var d = 0; d < destinations.length; d++) {
            var dest = destinations[d];
            try {
                dest.prop.expression = expression;
                dest.prop.expressionEnabled = true;
                applied++;
                results.push({ layerId: dest.layer.id, layerName: dest.layer.name,
                    propRoute: buildPropRoute(dest.prop), success: true,
                    expression: dest.prop.expression, enabled: dest.prop.expressionEnabled });
            } catch (e) {
                results.push({ layerId: dest.layer.id, layerName: dest.layer.name,
                    propRoute: buildPropRoute(dest.prop), success: false, error: e.message });
            }
        }
        return JSON.stringify({ success: true, applied: applied, selected: destinations.length, results: results });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    } finally {
        if (undoOpen) app.endUndoGroup();
    }
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

function getCompInfo() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, error: "No active comp." });
        }
        var sel = comp.selectedLayers;
        return JSON.stringify({
            success:       true,
            compName:      comp.name,
            numLayers:     comp.numLayers,
            selectedCount: sel ? sel.length : 0
        });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}

function getAEVersion() {
    try { return JSON.stringify({ success: true, version: app.version }); }
    catch (e) { return JSON.stringify({ success: false, error: e.message }); }
}

// ─── Select layer in timeline ─────────────────────────────────────────────────

function selectLayerInTimeline(targetJson) {
    try {
        var layer = resolveLayerTarget(JSON.parse(targetJson));
        var comp = layer.containingComp;
        // Deselect all first
        for (var i = 1; i <= comp.numLayers; i++) {
            try { comp.layer(i).selected = false; } catch (e) {}
        }
        layer.selected = true;
        // Bring comp panel to front so user sees the selection
        app.activate();
        return JSON.stringify({ success: true, layerName: layer.name });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}

// ─── Apply to selected properties across timeline ──────────────────────────────

function applyExpressionToSelectedProperties(expression) {
    var undoOpen = false;
    try {
        if (typeof expression !== "string" || !expression.length) throw new Error("Expression is empty.");
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, error: "No active composition found. Open a composition first." });
        }

        var selLayers = comp.selectedLayers;
        if (!selLayers || selLayers.length === 0) {
            return JSON.stringify({
                success: false,
                error: "No layers selected. Please select one or more layers and properties in the timeline."
            });
        }

        var applied = 0;
        var totalPropsChecked = 0;
        var affectedLayers = 0;
        var errors = [];
        var visited = [];

        app.beginUndoGroup("AE Code Editor: Apply Expression");
        undoOpen = true;

        function applyToProp(prop, layerName) {
            var count = 0;
            if (!prop) return 0;
            for (var v = 0; v < visited.length; v++) {
                if (visited[v] === prop) return 0;
            }
            visited.push(prop);

            if (prop.propertyType === PropertyType.PROPERTY) {
                totalPropsChecked++;
                if (prop.canSetExpression) {
                    try {
                        prop.expression = expression;
                        prop.expressionEnabled = true;
                        count++;
                        if (prop.expressionError) errors.push(layerName + " > " + prop.name + ": " + prop.expressionError);
                    } catch (err) {
                        errors.push(layerName + " > " + prop.name + ": " + err.message);
                    }
                } else {
                    errors.push(layerName + " > " + prop.name + ": Property does not accept expressions.");
                }
            } else if (prop.propertyType === PropertyType.INDEXED_GROUP || 
                       prop.propertyType === PropertyType.NAMED_GROUP) {
                for (var k = 1; k <= prop.numProperties; k++) {
                    try {
                        var child = prop.property(k);
                        if (child) {
                            count += applyToProp(child, layerName + " > " + prop.name);
                        }
                    } catch (e) { errors.push(layerName + " > " + prop.name + ": " + e.message); }
                }
            }
            return count;
        }

        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            if (layer.locked) { errors.push(layer.name + ": Layer is locked."); continue; }
            var props = layer.selectedProperties;
            if (!props || props.length === 0) continue;

            var layerApplied = 0;
            for (var j = 0; j < props.length; j++) {
                layerApplied += applyToProp(props[j], layer.name);
            }
            if (layerApplied > 0) {
                applied += layerApplied;
                affectedLayers++;
            }
        }


        if (totalPropsChecked === 0 && errors.length === 0) {
            return JSON.stringify({
                success: false,
                error: "No properties selected. Please select target property/properties (e.g. Position, Opacity) on the selected layers in the timeline."
            });
        }

        if (applied === 0 && errors.length > 0) {
            return JSON.stringify({
                success: false,
                error: "Could not apply expression:\n" + errors.slice(0, 5).join("\n") + (errors.length > 5 ? "\n...and " + (errors.length - 5) + " more" : ""),
                applied: 0,
                errors: errors
            });
        }

        return JSON.stringify({
            success: true,
            applied: applied,
            layerCount: affectedLayers,
            errors: errors
        });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    } finally {
        if (undoOpen) app.endUndoGroup();
    }
}

function getSelectedPropertyExpression() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, error: "No active composition found." });
        }
        var selLayers = comp.selectedLayers;
        if (!selLayers || selLayers.length === 0) {
            return JSON.stringify({ success: false, error: "No layers selected." });
        }
        for (var i = 0; i < selLayers.length; i++) {
            var props = selLayers[i].selectedProperties;
            if (props && props.length > 0) {
                for (var j = 0; j < props.length; j++) {
                    var p = props[j];
                    if (p.propertyType === PropertyType.PROPERTY && p.canSetExpression) {
                        return JSON.stringify({
                            success: true,
                            expression: p.expression || "",
                            propName: p.name,
                            layerName: selLayers[i].name
                        });
                    }
                }
            }
        }
        return JSON.stringify({ success: false, error: "No property capable of expressions is selected in the timeline." });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}

// ─── Script Execution & File Utilities ────────────────────────────────────────

function runScript(scriptCode) {
    try {
        var result = eval(scriptCode);
        if (result !== undefined) {
            return JSON.stringify({ success: true, result: String(result) });
        }
        return JSON.stringify({ success: true, result: "" });
    } catch (e) {
        var line = null;
        if (typeof e.line === "number" && e.line > 0) {
            line = e.line;
        } else if (e.message) {
            var lm = e.message.match(/->\s*(\d+)/);
            if (lm) line = parseInt(lm[1], 10);
        }
        var msg = (e.message || String(e)).replace(/\s*->\s*\d+\s*$/, "").replace(/^\s*Error:\s*/i, "");
        return JSON.stringify({
            success: false,
            error:   msg,
            line:    line,
            col:     (e.col !== undefined) ? e.col : null,
            name:    e.name || "Error"
        });
    }
}

function readFileContent(filePath) {
    try {
        var file = new File(filePath);
        if (!file.exists) {
            return JSON.stringify({ success: false, error: "File not found: " + filePath });
        }
        file.encoding = "UTF-8";
        if (!file.open("r")) {
            return JSON.stringify({ success: false, error: "Could not open file: " + filePath });
        }
        var content, closed;
        try {
            content = file.read();
            if (file.error) throw new Error("Could not read file: " + file.error);
        }
        finally { closed = file.close(); }
        if (!closed) {
            return JSON.stringify({ success: false, error: "Could not close file: " + filePath });
        }
        return JSON.stringify({ success: true, content: content, name: file.name });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}

function saveFileContent(filePath, content) {
    try {
        return JSON.stringify(writeFileSafely(new File(filePath), content));
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}

function readWrittenFile(file) {
    try {
        file.encoding = "UTF-8";
        if (!file.open("r")) return null;
        var text, closed;
        try { text = file.read(); if (file.error) return null; }
        finally { closed = file.close(); }
        return closed ? text : null;
    } catch (e) { return null; }
}

function writeFileSafely(file, content) {
    if (typeof content !== "string") return { success: false, error: "Invalid file content." };
    if (file.alias) return { success: false, error: "Saving through a file shortcut is not supported." };
    var suffix = ".ae-editor-" + (new Date()).getTime() + "-" + Math.floor(Math.random() * 1000000);
    var temp = new File(file.fsName + suffix + ".tmp");
    var backup = new File(file.fsName + suffix + ".bak");
    if (temp.exists || backup.exists) return { success: false, error: "Could not create a unique temporary file." };
    temp.encoding = "UTF-8";
    if (!temp.open("w")) return { success: false, error: "Could not open temporary file for writing." };
    var wrote, closed;
    try { wrote = temp.write(content); }
    catch (e) { wrote = false; }
    finally { closed = temp.close(); }
    if (!wrote || !closed) {
        if (temp.exists) temp.remove();
        return { success: false, error: "Could not write temporary file. Original file was not changed." };
    }
    if (readWrittenFile(temp) !== content) {
        return { success: false, error: "Temporary file verification failed. Original file was not changed. Draft: " + temp.fsName };
    }
    var hadOriginal = file.exists;
    if (hadOriginal) {
        var originalContent = readWrittenFile(file);
        if (originalContent === null) {
            return { success: false, error: "Could not read original file. Original was not changed. Draft: " + temp.fsName };
        }
        var backedUp = false;
        try { backedUp = file.copy(backup.fsName); } catch (e) {}
        if (!backedUp || readWrittenFile(backup) !== originalContent) {
            return { success: false, error: "Could not verify original backup. Original was not changed. Draft: " + temp.fsName };
        }
    }
    var copied = false;
    try { copied = temp.copy(file.fsName); } catch (e) {}
    if (!copied || readWrittenFile(file) !== content) {
        var restored = false;
        try {
            restored = hadOriginal ? (backup.copy(file.fsName) && readWrittenFile(file) === originalContent) :
                (!file.exists || file.remove());
        } catch (e) {}
        return { success: false, error: "Save failed. " +
            (restored ? (hadOriginal ? "Original file was restored." : "Incomplete new file was removed.") :
                (hadOriginal ? "Original backup: " + backup.fsName : "Check destination: " + file.fsName)) +
            " Draft: " + temp.fsName };
    }
    try { temp.remove(); } catch (e) {}
    if (hadOriginal) try { backup.remove(); } catch (e) {}
    return { success: true, path: file.fsName };
}

function openFileDialog() {
    try {
        var file = File.openDialog("Open File", "Scripts/Expressions:*.jsx;*.js;*.txt,All files:*.*");
        if (file) {
            file.encoding = "UTF-8";
            if (!file.open("r")) {
                return JSON.stringify({ success: false, error: "Could not open selected file." });
            }
            var content, closed;
            try {
                content = file.read();
                if (file.error) throw new Error("Could not read file: " + file.error);
            }
            finally { closed = file.close(); }
            if (!closed) {
                return JSON.stringify({ success: false, error: "Could not close selected file." });
            }
            return JSON.stringify({
                success: true,
                content: content,
                name:    decodeURI(file.name),
                path:    file.fsName
            });
        }
        return JSON.stringify({ success: false, error: "Cancelled" });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}

function saveFileDialog(content) {
    try {
        var file = File.saveDialog("Save File", "ExtendScript:*.jsx,JavaScript:*.js,Text:*.txt");
        if (file) {
            var result = writeFileSafely(file, content);
            if (!result.success) return JSON.stringify(result);
            return JSON.stringify({
                success: true,
                path: file.fsName,
                name: decodeURI(file.name)
            });
        }
        return JSON.stringify({ success: false, error: "Cancelled" });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}
