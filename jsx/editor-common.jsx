/** Shared editor host operations. Loaded at global scope by host.jsx. ES3 only. */

function getAEVersion() {
    try { return JSON.stringify({ success: true, version: app.version }); }
    catch (e) { return JSON.stringify({ success: false, error: e.message }); }
}

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

