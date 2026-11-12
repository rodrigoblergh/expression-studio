/**
 * AE Expression Annotator — 3-Layer Annotation Engine
 * Layer 3: Pattern Recognition | Layer 2: Token Annotation | Layer 1: Variable Tracking
 */

// Shared Acorn parse options
var ACORN_OPTS = {
    ecmaVersion: 2020,
    locations: true,
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true
};

// ─── PATTERN DEFINITIONS ──────────────────────────────────────────────────────

var AE_PATTERNS = [
    {
        id: "bounce", name: "Bounce / Overshoot",
        required: ["velocityAtTime", "Math.sin", "Math.exp"], excluded: [],
        params: { "amp": "Bounce intensity (higher = bigger)", "freq": "Oscillation speed in Hz", "decay": "Damping factor (higher = stops sooner)", "e": "Bounce intensity", "f": "Oscillation speed", "d": "Damping factor", "amplitude": "Bounce intensity", "frequency": "Oscillation speed", "damping": "Damping factor" },
        desc: "Creates a bouncing overshoot after keyframes. The value oscillates past its target and gradually settles.",
        how: ["Finds the most recent keyframe", "Captures velocity at that keyframe", "Applies sine oscillation with exponential decay"]
    },
    {
        id: "inertia", name: "Inertia / Momentum",
        required: ["velocityAtTime"], excluded: ["Math.sin"],
        params: { "friction": "How quickly motion decays (0-1)", "drag": "Drag coefficient" },
        desc: "Continues motion past the last keyframe with gradual deceleration, simulating physical inertia.",
        how: ["Gets velocity at the last keyframe", "Applies velocity with exponential friction decay"]
    },
    {
        id: "wiggle_seed", name: "Controlled Wiggle (Seeded)",
        required: ["seedRandom", "wiggle"], excluded: [],
        desc: "Wiggle with a fixed random seed — produces identical motion when using the same seed value.",
        how: ["Sets a deterministic random seed (often based on layer index)", "Applies wiggle with seeded random"]
    },
    {
        id: "time_remap_loop", name: "Time Remap Loop",
        required: ["loopOut"], excluded: [], propHint: "Time Remap",
        desc: "Loops a precomp's playback after the last keyframe.",
        how: ["Loops the Time Remap property using the specified mode"]
    },
    {
        id: "counter", name: "Numeric Counter",
        required: ["Math.floor"], excluded: [], propHint: "Source Text",
        params: { "rate": "Count speed (counts per second)", "start": "Starting number", "end": "Ending number" },
        desc: "Displays a number that counts up or down over time.",
        how: ["Multiplies time by rate to get current count", "Floors to get a whole number"]
    },
    {
        id: "typewriter", name: "Typewriter Effect",
        required: ["substring"], excluded: [], propHint: "Source Text",
        desc: "Reveals text character by character over time.",
        how: ["Uses time to calculate how many characters to show", "Extracts substring up to that count"]
    },
    {
        id: "orbit", name: "Orbit / Circular Motion",
        required: ["Math.sin", "Math.cos"], excluded: ["velocityAtTime"],
        params: { "radius": "Circle radius in pixels", "speed": "Rotation speed", "amp": "Circle radius", "freq": "Rotation speed" },
        desc: "Creates circular or elliptical motion by combining sine and cosine.",
        how: ["Calculates X offset with cosine", "Calculates Y offset with sine", "Adds to center position"]
    },
    {
        id: "sine_wave", name: "Sine Wave Oscillation",
        required: ["Math.sin"], excluded: ["velocityAtTime", "Math.exp", "Math.cos"],
        params: { "amp": "Wave amplitude", "freq": "Cycles per second", "amplitude": "Wave amplitude", "frequency": "Cycles per second" },
        desc: "Creates smooth, continuous oscillation using a sine wave.",
        how: ["Multiplies time by frequency and 2\u03c0", "Applies Math.sin for oscillation", "Scales by amplitude"]
    },
    {
        id: "random_hold", name: "Random Hold (Step Random)",
        required: ["seedRandom", "random"], excluded: ["wiggle"],
        desc: "Generates random values that change at fixed intervals (hold between changes).",
        how: ["Uses Math.floor(time * freq) as seed for stepped intervals", "Generates random value constant within each step"]
    },
    {
        id: "fade_inout", name: "Fade In/Out",
        required: ["linear"], excluded: [], propHint: "Opacity",
        desc: "Automatic fade in and/or fade out based on layer in/out points.",
        how: ["Uses linear() to map time near in/outPoint to opacity range"]
    },
    {
        id: "look_at", name: "Look At / Auto-Orient",
        required: ["lookAt"], excluded: [],
        desc: "Rotates the layer to point towards another layer or position.",
        how: ["Calculates orientation from one point to another using lookAt()"]
    },
    {
        id: "distance_based", name: "Distance-Based Value",
        required: ["call:length"], excluded: [],
        desc: "Value is driven by the distance between two points or layers.",
        how: ["Calculates distance using length()", "Maps distance to the property value"]
    },
    {
        id: "angle_between", name: "Angle Between Layers",
        required: ["Math.atan2"], excluded: [],
        desc: "Calculates the angle between two points, typically for rotation.",
        how: ["Uses Math.atan2 to compute angle from coordinate differences", "Converts radians to degrees if needed"]
    },
    {
        id: "parent_space", name: "Parent-Space Compensation",
        required: ["toComp"], excluded: [],
        desc: "Converts coordinates between layer-local and comp space, compensating for parent transforms.",
        how: ["Uses toComp/fromComp to transform between coordinate spaces"]
    },
    {
        id: "slider_driven", name: "Slider-Driven Value",
        required: ["effect"], excluded: [],
        desc: "Value controlled by an Effect slider, making it easy to animate or link properties to one control.",
        how: ["Reads a value from an Effects control on a layer"]
    },
    {
        id: "posterize", name: "Frame Rate Override",
        required: ["posterizeTime"], excluded: [],
        desc: "Forces evaluation at a lower frame rate for a choppy/stop-motion look.",
        how: ["posterizeTime limits evaluation to the specified fps"]
    },
    {
        id: "delay_chain", name: "Layer Delay Chain",
        required: ["valueAtTime"], excluded: [],
        params: { "delay": "Delay between layers in seconds", "offset": "Time offset" },
        desc: "Creates staggered animation using layer index for cascading delay.",
        how: ["Offsets time by index * delay", "Samples property value at the offset time"]
    },
    {
        id: "loopout_std", name: "Keyframe Loop (Post)",
        required: ["loopOut"], excluded: [],
        desc: "Repeats keyframe animation after the last keyframe. Modes: 'cycle', 'pingpong', 'offset', 'continue'.",
        how: ["Loops keyframe values after the last keyframe"]
    },
    {
        id: "loopin_std", name: "Keyframe Loop (Pre)",
        required: ["loopIn"], excluded: ["loopOut"],
        desc: "Repeats keyframe animation before the first keyframe.",
        how: ["Loops keyframe values before the first keyframe"]
    },
    {
        id: "snap_grid", name: "Snap to Grid",
        required: ["Math.round"], excluded: [],
        params: { "grid": "Grid spacing in pixels", "step": "Step size" },
        desc: "Quantizes value to fixed increments (grid snapping).",
        how: ["Rounds value to nearest grid multiple using Math.round(v/grid)*grid"]
    },
    {
        id: "wiggle_axis", name: "Wiggle Single Axis",
        required: ["wiggle"], excluded: ["seedRandom"],
        desc: "Applies wiggle to only one axis while keeping others unchanged.",
        how: ["Calls wiggle() and extracts only the desired axis component", "Preserves original value for other axes"]
    },
    {
        id: "source_rect", name: "Auto-Size (sourceRect)",
        required: ["sourceRectAtTime"], excluded: [],
        desc: "Auto-sizes or positions based on another layer's bounding box (text/shape dimensions).",
        how: ["Reads the source rectangle at current time", "Uses width/height/top/left for sizing"]
    },
    {
        id: "marker_driven", name: "Marker-Driven",
        required: ["marker"], excluded: [],
        desc: "Behavior controlled by timeline markers.",
        how: ["Reads marker keyframes to trigger changes at specific times"]
    },
    {
        id: "clamp_val", name: "Clamped Value",
        required: ["clamp"], excluded: [],
        desc: "Constrains value within min/max range.",
        how: ["Uses clamp() to restrict value between limits"]
    },
    {
        id: "exp_growth", name: "Exponential Growth/Decay",
        required: ["Math.pow"], excluded: ["velocityAtTime"],
        desc: "Value grows or decays exponentially over time.",
        how: ["Uses Math.pow with time-based exponent for exponential curve"]
    },
    {
        id: "color_conversion", name: "Color Space Conversion",
        required: ["hslToRgb", "rgbToHsl"], excluded: [],
        desc: "Converts colors between RGB and HSL to manipulate Hue, Saturation, or Lightness.",
        how: ["Extracts HSL values from RGB", "Modifies specific color channels", "Converts back to RGB array"]
    },
    {
        id: "nearest_key", name: "Keyframe Proximity Trigger",
        required: ["nearestKey"], excluded: [],
        desc: "Detects the closest keyframe and changes behavior based on distance to it.",
        how: ["Finds nearestKey(time)", "Calculates time difference", "Triggers logic when close to the keyframe"]
    },
    {
        id: "path_tracing", name: "Path Tracing (pointOnPath)",
        required: ["pointOnPath"], excluded: [],
        desc: "Moves an object along a specific shape or mask path.",
        how: ["Reads path geometry", "Maps a 0-1 percentage to pointOnPath()", "Extracts X/Y coordinates"]
    },
    {
        id: "smooth_motion", name: "Smoothed Motion",
        required: ["smooth"], excluded: [],
        desc: "Reduces jitter by averaging surrounding keyframe values.",
        how: ["Applies smooth(width, samples) to calculate a moving average over time"]
    },
    {
        id: "ease_interpolated", name: "Ease Interpolation",
        required: ["ease"], excluded: ["linear"],
        desc: "Maps an input range to an output range with a smooth ease-in/ease-out curve.",
        how: ["Reads an input value (like time or slider)", "Uses ease() to smoothly remap to target values"]
    },
    {
        id: "sample_image", name: "Image Sampling",
        required: ["sampleImage"], excluded: [],
        desc: "Reads pixel colors from another layer at specific coordinates.",
        how: ["Defines a radius/point", "Calls sampleImage() on a target layer", "Returns [R,G,B,A] color array"]
    },
    {
        id: "time_conversion", name: "Frame/Time Conversion",
        required: ["timeToFrames"], excluded: [],
        desc: "Converts absolute seconds into exact frame numbers.",
        how: ["Divides/multiplies time by comp frame rate", "Ensures frame-accurate logic execution"]
    },
    {
        id: "value_history", name: "Value Offset / History",
        required: ["valueAtTime"], excluded: ["velocityAtTime"],
        desc: "Reads the value of a property at a different point in time.",
        how: ["Subtracts/adds an offset to the current time", "Calls valueAtTime() to look into the past or future"]
    },
    {
        id: "time_strobe", name: "Time Strobing (Quantization)",
        required: ["Math.floor"], excluded: [],
        fingerprint: function (fp) { return fp["Math.floor"] && fp["time"]; },
        desc: "Creates stepped, discrete jumps in value based on time.",
        how: ["Multiplies time by a frequency", "Math.floor() removes decimals, creating stepped holds"]
    },
    {
        id: "index_offset", name: "Index-Based Offset",
        required: [], excluded: [],
        fingerprint: function (fp) { return fp["index"] && !fp["valueAtTime"]; },
        desc: "Value offset based on layer index for staggered/distributed values across layers.",
        how: ["Multiplies layer index by an offset amount", "Creates unique value per layer in the stack"]
    }
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function extractCallName(node) {
    if (!node || !node.callee) return null;
    var c = node.callee;
    if (c.type === "Identifier") return c.name;
    if (c.type === "MemberExpression" && c.property.type === "Identifier") {
        if (c.object.type === "Identifier") return c.object.name + "." + c.property.name;
        return c.property.name;
    }
    return null;
}

function resolveChain(node) {
    if (!node) return [];
    if (node.type === "Identifier") return [node.name];
    if (node.type === "MemberExpression") {
        var obj = resolveChain(node.object);
        var prop = node.computed
            ? (node.property.type === "Literal" ? "[" + node.property.value + "]" : "[...]")
            : node.property.name;
        return obj.concat(prop);
    }
    if (node.type === "CallExpression") {
        var chain = resolveChain(node.callee);
        if (node.arguments.length && node.arguments[0].type === "Literal") {
            var last = chain[chain.length - 1];
            chain[chain.length - 1] = last + "(\"" + node.arguments[0].value + "\")";
        }
        return chain;
    }
    return [];
}

function buildPropertyContext(exprData) {
    if (!exprData) return null;
    return {
        propName: exprData.propName || "",
        dimensions: exprData.dimensions || 1,
        isSeparated: exprData.isSeparated || false,
        is3DLayer: exprData.is3DLayer || false,
        hasParent: exprData.hasParent || false,
        parentName: exprData.parentName || null,
        layerType: exprData.layerType || "av"
    };
}

// Context-aware index labels
var INDEX_LABELS = {
    "position": { 2: ["X", "Y"], 3: ["X", "Y", "Z"] },
    "scale": { 2: ["Width", "Height"], 3: ["Width", "Height", "Depth"] },
    "anchorPoint": { 2: ["X", "Y"], 3: ["X", "Y", "Z"] },
    "orientation": { 3: ["X", "Y", "Z"] }
};

// ─── PATTERN DETECTION ────────────────────────────────────────────────────────

function buildFingerprint(ast) {
    var fp = {};
    try {
        acorn.walk.simple(ast, {
            CallExpression: function (node) {
                var n = extractCallName(node);
                if (n) { fp[n] = true; fp["call:" + n] = true; }
            },
            MemberExpression: function (node) {
                if (node.object.type === "Identifier" && node.object.name === "Math" &&
                    node.property.type === "Identifier") {
                    fp["Math." + node.property.name] = true;
                }
                if (node.property.type === "Identifier") {
                    fp[node.property.name] = true;
                }
            },
            Identifier: function (node) {
                fp[node.name] = true;
            }
        });
    } catch (e) { }
    return fp;
}

function detectPattern(ast, code, context) {
    var fp = buildFingerprint(ast);
    var best = null, bestScore = 0;

    for (var i = 0; i < AE_PATTERNS.length; i++) {
        var p = AE_PATTERNS[i];
        if (p.id === "snap_grid" && !hasGridSnap(ast)) continue;
        if (p.propHint && (!context || !context.propName || context.propName.indexOf(p.propHint) === -1)) continue;

        // Custom fingerprint function
        if (p.fingerprint) {
            if (!p.fingerprint(fp)) continue;
        } else {
            if (!p.required || !p.required.length) continue;
            var allReq = true;
            for (var r = 0; r < p.required.length; r++) {
                if (!fp[p.required[r]]) { allReq = false; break; }
            }
            if (!allReq) continue;
        }

        // Check exclusions
        if (p.excluded && p.excluded.length) {
            var anyExcl = false;
            for (var e = 0; e < p.excluded.length; e++) {
                if (fp[p.excluded[e]]) { anyExcl = true; break; }
            }
            if (anyExcl) continue;
        }

        // Score: more required = more specific = better match
        var score = p.required ? p.required.length : 1;
        if (p.propHint && context && context.propName && context.propName.indexOf(p.propHint) !== -1) {
            score += 10;
        }
        if (score > bestScore) { best = p; bestScore = score; }
    }
    return best;
}

function astShape(ast) {
    return JSON.stringify(ast, function (key, value) {
        if (key === "start" || key === "end" || key === "loc" || key === "range") return undefined;
        return value;
    });
}

function hasGridSnap(ast) {
    var found = false;
    acorn.walk.simple(ast, {
        BinaryExpression: function (node) {
            if (node.operator !== "*") return;
            var sides = [[node.left, node.right], [node.right, node.left]];
            for (var i = 0; i < sides.length; i++) {
                var call = sides[i][0], factor = sides[i][1];
                if (call.type !== "CallExpression" || extractCallName(call) !== "Math.round" ||
                    call.arguments.length !== 1) continue;
                var ratio = call.arguments[0];
                if (ratio.type === "BinaryExpression" && ratio.operator === "/" &&
                    astShape(ratio.right) === astShape(factor)) found = true;
            }
        }
    });
    return found;
}

function buildPatternComment(pattern, ast, code) {
    var lines = [];
    var bar = new Array(52).join("\u2550");
    lines.push("/* " + bar);
    lines.push(" * \ud83c\udfaf " + pattern.name.toUpperCase());
    lines.push(" * " + pattern.desc);

    // Detect editable params
    if (pattern.params) {
        var foundParams = [];
        try {
            acorn.walk.simple(ast, {
                VariableDeclarator: function (node) {
                    if (node.id.type === "Identifier" && pattern.params[node.id.name] && node.init) {
                        var val = code.substring(node.init.start, node.init.end);
                        foundParams.push(" *   " + node.id.name + " = " + val + "  \u2192  " + pattern.params[node.id.name]);
                    }
                },
                AssignmentExpression: function (node) {
                    if (node.left.type === "Identifier" && pattern.params[node.left.name]) {
                        var val = code.substring(node.right.start, node.right.end);
                        foundParams.push(" *   " + node.left.name + " = " + val + "  \u2192  " + pattern.params[node.left.name]);
                    }
                }
            });
        } catch (e) { }
        if (foundParams.length) {
            lines.push(" *");
            lines.push(" * EDITABLE PARAMETERS:");
            for (var p = 0; p < foundParams.length; p++) lines.push(foundParams[p]);
        }
    }

    if (pattern.how && pattern.how.length) {
        lines.push(" *");
        lines.push(" * HOW IT WORKS:");
        for (var h = 0; h < pattern.how.length; h++) {
            lines.push(" *   " + (h + 1) + ". " + pattern.how[h]);
        }
    }

    lines.push(" " + bar + " */");
    return lines.join("\n") + "\n";
}

// ─── CONTEXT-AWARE VALUE ANNOTATION ───────────────────────────────────────────

function getValueAnnotation(context) {
    if (!context) return "// value \u2192 Current property value";
    var s = "// value \u2192 ";
    if (context.isSeparated) {
        s += "number (" + context.propName + ", separated)";
    } else if (context.dimensions === 3) {
        s += "[X, Y, Z] (3D " + context.propName + ")";
    } else if (context.dimensions === 2) {
        s += "[X, Y] (2D " + context.propName + ")";
    } else {
        s += "number (" + context.propName + ")";
    }
    if (context.hasParent) {
        s += "  \u26a0 relative to parent '" + context.parentName + "'";
    }
    return s;
}

function getIndexLabel(propName, idx, context) {
    var pn = propName ? propName.toLowerCase() : "";
    var dims = context ? context.dimensions : 2;
    if (INDEX_LABELS[pn] && INDEX_LABELS[pn][dims]) {
        var labels = INDEX_LABELS[pn][dims];
        if (idx < labels.length) return labels[idx];
    }
    if (AEDocs && AEDocs[pn] && AEDocs[pn].indices && idx < AEDocs[pn].indices.length) {
        return AEDocs[pn].indices[idx];
    }
    return "index " + idx;
}

// ─── MAIN ANNOTATION FUNCTION ─────────────────────────────────────────────────

function annotateCode(code, cm, context) {
    if (typeof acorn === "undefined" || typeof acorn.walk === "undefined" || typeof AEDocs === "undefined") {
        return { error: "AST libraries or Dictionary not loaded.", patternName: null, tokenCount: 0 };
    }
    if (/(^|\n)\s*(?:\/\/\s*@(?:include|target|targetengine|resource)\b|#(?:include|target)\b)/i.test(code)) {
        return { error: "Preprocessor directives cannot be annotated safely. No changes were made.", patternName: null, tokenCount: 0 };
    }

    var ast, comments = [], parseOpts = {};
    for (var opt in ACORN_OPTS) parseOpts[opt] = ACORN_OPTS[opt];
    parseOpts.onComment = comments;
    try {
        ast = acorn.parse(code, parseOpts);
    } catch (e) {
        var lineInfo = e.loc ? " (line " + e.loc.line + ", col " + e.loc.column + ")" : "";
        return { error: "Parse error" + lineInfo + ": " + e.message, patternName: null, tokenCount: 0 };
    }

    var insertions = [];
    var linesSeen = {};
    var patternName = null;
    var lineStarts = [0], protectedRanges = [];
    for (var pos = 0; pos < code.length; pos++) {
        if (code.charAt(pos) === "\n") lineStarts.push(pos + 1);
    }
    acorn.walk.simple(ast, {
        TemplateLiteral: function (node) { protectedRanges.push({ start: node.start, end: node.end }); }
    });
    for (var ci = 0; ci < comments.length; ci++) {
        protectedRanges.push({ start: comments[ci].start, end: comments[ci].end });
    }

    function unsafeLineStart(line) {
        var offset = lineStarts[line];
        if (offset === undefined) return true;
        for (var i = 0; i < protectedRanges.length; i++) {
            if (protectedRanges[i].start < offset && offset < protectedRanges[i].end) return true;
        }
        return false;
    }

    function pushInsertion(line, text) {
        if (unsafeLineStart(line)) return;
        if (code.indexOf(text + "\n") !== -1) return;
        // Dedup: check if line above already has this exact comment
        var lineAbove = line > 0 ? cm.getLine(line - 1) : null;
        if (lineAbove && lineAbove.trim() === text.trim()) return;

        if (linesSeen[line]) {
            // Concatenate for same line
            for (var i = 0; i < insertions.length; i++) {
                if (insertions[i].line === line && !insertions[i].isPatternHeader) {
                    insertions[i].text = insertions[i].text.replace(/\n$/, "") +
                        "  \u00b7  " + text.replace(/^\/\/\s*/, "") + "\n";
                    break;
                }
            }
            return;
        }
        insertions.push({ line: line, text: text + "\n" });
        linesSeen[line] = true;
    }

    // ═══ LAYER 3: Pattern Recognition ═══
    var pattern = detectPattern(ast, code, context);
    if (pattern) {
        patternName = pattern.name;
        var blockComment = buildPatternComment(pattern, ast, code);
        if (code.indexOf(blockComment) === -1 && !unsafeLineStart(0)) {
            insertions.push({ line: 0, text: blockComment, isPatternHeader: true });
        }
    }

    // ═══ LAYER 1: Variable Tracking ═══
    var vars = {};
    function resolveMeaning(node) {
        if (!node) return null;
        if (node.type === "Identifier") {
            if (vars[node.name]) return vars[node.name];
            if (AEDocs[node.name]) return node.name;
            return node.name;
        }
        if (node.type === "MemberExpression") {
            // Handle Math.xxx
            if (node.object.type === "Identifier" && node.object.name === "Math" &&
                node.property.type === "Identifier") {
                return "Math." + node.property.name;
            }
            // Handle numeric index access: position[0] → "X position"
            if (node.property.type === "Literal" && typeof node.property.value === "number") {
                var objM = resolveMeaning(node.object);
                var idx = node.property.value;
                if (objM) {
                    var label = getIndexLabel(objM, idx, context);
                    return label + " of " + objM;
                }
                return "index " + idx;
            }
            return resolveMeaning(node.property);
        }
        if (node.type === "CallExpression") return resolveMeaning(node.callee);
        if (node.type === "UnaryExpression") return resolveMeaning(node.argument);
        if (node.type === "BinaryExpression") return resolveMeaning(node.left);
        return null;
    }

    // ═══ LAYER 2 + 1: AST Walk ═══
    acorn.walk.simple(ast, {
        VariableDeclarator: function (node) {
            if (node.id.type === "Identifier" && node.init) {
                var meaning = resolveMeaning(node.init);
                if (meaning) {
                    vars[node.id.name] = meaning;
                    var docEntry = AEDocs[meaning];
                    var desc = docEntry ? " (" + (docEntry.template || docEntry.desc) + ")" : "";
                    pushInsertion(node.loc.start.line - 1, "// " + node.id.name + " \u2192 " + meaning + desc);
                }
            }
        },

        CallExpression: function (node) {
            var name = extractCallName(node);
            if (!name) return;

            // Check both direct name and short name
            var docKey = AEDocs[name] ? name : null;
            if (!docKey) {
                // Try just the method name for Math.xxx etc
                var parts = name.split(".");
                if (parts.length > 1 && AEDocs[name]) docKey = name;
            }
            if (!docKey || (AEDocs[docKey] && AEDocs[docKey].isProp)) return;

            var doc = AEDocs[docKey];
            var commentStr = "";

            if (doc.template && doc.args) {
                commentStr = doc.template;
                for (var i = 0; i < doc.args.length; i++) {
                    var argName = doc.args[i].split("=")[0];
                    var argVal = "";
                    if (i < node.arguments.length) {
                        var argNode = node.arguments[i];
                        argVal = code.substring(argNode.start, argNode.end).replace(/\n/g, " ");
                        if (argVal.length > 50) argVal = "\u00ab" + argVal.substring(0, 47) + "\u2026\u00bb";
                    }
                    if (argVal) {
                        commentStr = commentStr.replace("{" + argName + "}", argVal);
                    }
                }
                // Clean unfilled placeholders
                commentStr = commentStr.replace(/\s*\([^)]*\{[a-zA-Z0-9_]+\}[^)]*\)/g, "");
                commentStr = commentStr.replace(/\s*\{[a-zA-Z0-9_]+\}/g, "");
                commentStr = commentStr.replace(/\s+\./g, ".").trim();
                commentStr = "// " + commentStr;
            } else {
                commentStr = "// " + name + " \u2192 " + (doc.desc || doc.template || "");
            }

            pushInsertion(node.loc.start.line - 1, commentStr);
        },

        ArrayExpression: function (node) {
            if (!node.elements || node.elements.length === 0) return;
            // Skip pure literal arrays (self-documenting)
            var allLiteral = node.elements.every(function (el) {
                return el && el.type === "Literal";
            });
            if (allLiteral && node.elements.length <= 3) return;

            var meanings = [];
            var hasKnown = false;
            node.elements.forEach(function (el) {
                if (!el) { meanings.push("_"); return; }
                var m = resolveMeaning(el);
                if (m && AEDocs[m]) { hasKnown = true; meanings.push(m); }
                else if (el.type === "Literal") { meanings.push(String(el.value)); }
                else if (m) { meanings.push(m); }
                else { meanings.push("_"); }
            });
            if (hasKnown) {
                pushInsertion(node.loc.start.line - 1, "// [" + meanings.join(", ") + "]");
            }
        }
    });

    // Second pass: MemberExpression (only for lines not yet annotated)
    acorn.walk.simple(ast, {
        MemberExpression: function (node) {
            var line = node.loc.start.line - 1;
            if (linesSeen[line]) return;

            // Handle 'value' keyword with context
            if (node.property.type === "Identifier" && node.property.name === "value") {
                // Skip — handled as Identifier below
                return;
            }

            if (node.property.type === "Identifier") {
                var name = node.property.name;
                // Check Math.xxx
                if (node.object.type === "Identifier" && node.object.name === "Math") {
                    var mathKey = "Math." + name;
                    if (AEDocs[mathKey]) {
                        pushInsertion(line, "// " + mathKey + " \u2192 " + AEDocs[mathKey].desc);
                    }
                    return;
                }
                if (AEDocs[name] && AEDocs[name].isProp) {
                    var chain = resolveChain(node);
                    var label = chain.length > 2 ? chain.join(".") : name;
                    pushInsertion(line, "// " + label + " \u2192 " + (AEDocs[name].template || AEDocs[name].desc));
                }
            }
        },
        Identifier: function (node) {
            var line = node.loc.start.line - 1;
            if (linesSeen[line]) return;
            if (node.name === "value") {
                pushInsertion(line, getValueAnnotation(context));
            }
        }
    });

    if (insertions.length === 0) {
        return { error: null, patternName: null, tokenCount: 0, message: "No known expressions found to annotate." };
    }

    // Sort descending so inserts don't shift subsequent lines
    insertions.sort(function (a, b) {
        if (a.line !== b.line) return b.line - a.line;
        // Inserting the line annotation second places it above the block header.
        return a.isPatternHeader ? -1 : (b.isPatternHeader ? 1 : 0);
    });
    var proposed = code;
    insertions.forEach(function (ins) {
        var offset = lineStarts[ins.line];
        proposed = proposed.substring(0, offset) + ins.text + proposed.substring(offset);
    });
    try {
        if (astShape(ast) !== astShape(acorn.parse(proposed, ACORN_OPTS))) {
            return { error: "Annotation would change the expression. No changes were made.", patternName: null, tokenCount: 0 };
        }
    } catch (e) {
        return { error: "Annotation would make the expression invalid. No changes were made.", patternName: null, tokenCount: 0 };
    }
    insertions.forEach(function (ins) { cm.replaceRange(ins.text, { line: ins.line, ch: 0 }); });

    return {
        error: null,
        patternName: patternName,
        tokenCount: insertions.filter(function (ins) { return !ins.isPatternHeader; }).length,
        message: null
    };
}

// ─── COMMENT REMOVAL ──────────────────────────────────────────────────────────

function removeCodeComments(code, cm) {
    if (typeof acorn === "undefined") {
        return { error: "AST parser not loaded.", count: 0 };
    }

    try {
        var comments = [];
        var opts = {};
        for (var k in ACORN_OPTS) opts[k] = ACORN_OPTS[k];
        opts.onComment = comments;
        acorn.parse(code, opts);

        comments = comments.filter(function (c) {
            // ExtendScript preprocessor directives are written as line comments.
            return !/^\/\/\s*@(?:include|target|targetengine|resource)\b/i.test(code.substring(c.start, c.end));
        });
        if (comments.length === 0) {
            return { error: null, count: 0, message: "No comments found." };
        }

        comments.sort(function (a, b) { return b.start - a.start; });

        comments.forEach(function (c) {
            var from = { line: c.loc.start.line - 1, ch: c.loc.start.column };
            var to = { line: c.loc.end.line - 1, ch: c.loc.end.column };
            // Preserve every line break and a lexical separator between adjacent tokens.
            var whitespace = code.substring(c.start, c.end).replace(/[^\r\n]/g, " ");
            cm.replaceRange(whitespace, from, to);
        });

        return { error: null, count: comments.length, message: null };
    } catch (e) {
        var lineInfo = e.loc ? " (line " + e.loc.line + ")" : "";
        return { error: "Parse error" + lineInfo + ": " + e.message, count: 0 };
    }
}
