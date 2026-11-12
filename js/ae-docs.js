// ═══════════════════════════════════════════════════════════════════════════════
// AE Expression Dictionary — Comprehensive reference for annotation engine
// Covers functions, properties, globals, and Math methods used in AE expressions
// ═══════════════════════════════════════════════════════════════════════════════

window.AEDocs = {

    // ─── INTERPOLATION & EASING ──────────────────────────────────────────────────

    "linear": {
        category: "function",
        args: ["t", "tMin", "tMax", "value1", "value2"],
        template: "Maps {t} linearly from [{tMin}..{tMax}] to [{value1}..{value2}].",
        desc: "Linear interpolation between two value ranges.",
        returns: "Number/Array"
    },
    "ease": {
        category: "function",
        args: ["t", "tMin", "tMax", "value1", "value2"],
        template: "Eases {t} from [{tMin}..{tMax}] to [{value1}..{value2}] with smooth start and end.",
        desc: "Smooth (ease in + out) interpolation.",
        returns: "Number/Array"
    },
    "easeIn": {
        category: "function",
        args: ["t", "tMin", "tMax", "value1", "value2"],
        template: "Eases {t} from [{tMin}..{tMax}] to [{value1}..{value2}] with smooth start.",
        desc: "Smooth start interpolation (ease in).",
        returns: "Number/Array"
    },
    "easeOut": {
        category: "function",
        args: ["t", "tMin", "tMax", "value1", "value2"],
        template: "Eases {t} from [{tMin}..{tMax}] to [{value1}..{value2}] with smooth end.",
        desc: "Smooth end interpolation (ease out).",
        returns: "Number/Array"
    },

    // ─── RANDOM & NOISE ──────────────────────────────────────────────────────────

    "wiggle": {
        category: "function",
        args: ["freq", "amp", "octaves", "amp_mult", "t"],
        template: "Wiggles {freq} times/sec with {amp} amplitude.",
        desc: "Random oscillation of the property value.",
        returns: "Number/Array"
    },
    "random": {
        category: "function",
        args: ["minValOrArray", "maxValOrArray"],
        template: "Random value between {minValOrArray} and {maxValOrArray}.",
        desc: "Uniform random number generator.",
        returns: "Number/Array"
    },
    "gaussRandom": {
        category: "function",
        args: ["minValOrArray", "maxValOrArray"],
        template: "Gaussian random value between {minValOrArray} and {maxValOrArray}.",
        desc: "Bell-curve distributed random number.",
        returns: "Number/Array"
    },
    "seedRandom": {
        category: "function",
        args: ["seed", "timeless"],
        template: "Sets random seed to {seed} (timeless: {timeless}).",
        desc: "Seeds the random generator for deterministic results.",
        returns: "Void"
    },
    "noise": {
        category: "function",
        args: ["valOrArray"],
        template: "Perlin noise for value {valOrArray}.",
        desc: "Perlin noise function (-1 to 1).",
        returns: "Number"
    },

    // ─── LOOPING ─────────────────────────────────────────────────────────────────

    "loopOut": {
        category: "function",
        args: ["type", "numKeyframes"],
        template: "Loops keyframes after the last one using '{type}' mode.",
        desc: "Post-expression keyframe looping.",
        returns: "Number/Array"
    },
    "loopIn": {
        category: "function",
        args: ["type", "numKeyframes"],
        template: "Loops keyframes before the first one using '{type}' mode.",
        desc: "Pre-expression keyframe looping.",
        returns: "Number/Array"
    },
    "loopOutDuration": {
        category: "function",
        args: ["type", "duration"],
        template: "Loops the last {duration} seconds of keyframes after the last keyframe using '{type}' mode.",
        desc: "Duration-based post-expression keyframe looping.",
        returns: "Number/Array"
    },
    "loopInDuration": {
        category: "function",
        args: ["type", "duration"],
        template: "Loops the first {duration} seconds of keyframes before the first keyframe using '{type}' mode.",
        desc: "Duration-based pre-expression keyframe looping.",
        returns: "Number/Array"
    },

    // ─── MATH UTILITIES ──────────────────────────────────────────────────────────

    "clamp": {
        category: "function",
        args: ["value", "limit1", "limit2"],
        template: "Constrains {value} between {limit1} and {limit2}.",
        desc: "Clamps a value within a range.",
        returns: "Number"
    },
    "length": {
        category: "function",
        args: ["point1", "point2"],
        template: "Distance between {point1} and {point2}.",
        desc: "Euclidean distance between two points.",
        returns: "Number"
    },
    "lookAt": {
        category: "function",
        args: ["fromPoint", "atPoint"],
        template: "Orientation to look from {fromPoint} towards {atPoint}.",
        desc: "Calculates orientation between two 3D points.",
        returns: "Array(3)"
    },
    "normalize": {
        category: "function",
        args: ["vec"],
        template: "Normalizes {vec} to unit length.",
        desc: "Returns a unit vector in the same direction.",
        returns: "Array"
    },
    "add": {
        category: "function",
        args: ["vec1", "vec2"],
        template: "Adds vectors {vec1} + {vec2}.",
        desc: "Vector addition.",
        returns: "Array"
    },
    "sub": {
        category: "function",
        args: ["vec1", "vec2"],
        template: "Subtracts {vec2} from {vec1}.",
        desc: "Vector subtraction.",
        returns: "Array"
    },
    "mul": {
        category: "function",
        args: ["vec", "amount"],
        template: "Multiplies {vec} by {amount}.",
        desc: "Vector scalar multiplication.",
        returns: "Array"
    },
    "div": {
        category: "function",
        args: ["vec", "amount"],
        template: "Divides {vec} by {amount}.",
        desc: "Vector scalar division.",
        returns: "Array"
    },
    "cross": {
        category: "function",
        args: ["vec1", "vec2"],
        template: "Cross product of {vec1} and {vec2}.",
        desc: "3D vector cross product.",
        returns: "Array(3)"
    },
    "dot": {
        category: "function",
        args: ["vec1", "vec2"],
        template: "Dot product of {vec1} and {vec2}.",
        desc: "Vector dot product.",
        returns: "Number"
    },
    "degreesToRadians": {
        category: "function",
        args: ["degrees"],
        template: "Converts {degrees}° to radians.",
        desc: "Degree to radian conversion.",
        returns: "Number"
    },
    "radiansToDegrees": {
        category: "function",
        args: ["radians"],
        template: "Converts {radians} rad to degrees.",
        desc: "Radian to degree conversion.",
        returns: "Number"
    },

    // ─── TIME FUNCTIONS ──────────────────────────────────────────────────────────

    "valueAtTime": {
        category: "function",
        args: ["t"],
        template: "Value of this property at time {t}.",
        desc: "Samples this property at a different time.",
        returns: "Number/Array"
    },
    "velocityAtTime": {
        category: "function",
        args: ["t"],
        template: "Velocity of this property at time {t}.",
        desc: "Rate of change (temporal velocity) at a specific time.",
        returns: "Number/Array"
    },
    "speedAtTime": {
        category: "function",
        args: ["t"],
        template: "Speed (scalar velocity) at time {t}.",
        desc: "Absolute rate of change (always positive).",
        returns: "Number"
    },
    "framesToTime": {
        category: "function",
        args: ["frames", "fps"],
        template: "Converts {frames} frames to seconds.",
        desc: "Frame count to time conversion.",
        returns: "Number"
    },
    "timeToFrames": {
        category: "function",
        args: ["t", "fps"],
        template: "Converts {t} seconds to frame count.",
        desc: "Time to frame count conversion.",
        returns: "Number"
    },
    "posterizeTime": {
        category: "function",
        args: ["fps"],
        template: "Forces evaluation at {fps} fps (choppy/step motion).",
        desc: "Limits expression evaluation rate.",
        returns: "Void"
    },

    // ─── KEYFRAME FUNCTIONS ──────────────────────────────────────────────────────

    "nearestKey": {
        category: "function",
        args: ["t"],
        template: "Nearest keyframe to time {t}.",
        desc: "Returns the keyframe closest to the given time.",
        returns: "Key"
    },
    "key": {
        category: "function",
        args: ["indexOrName"],
        template: "Keyframe at index or marker name {indexOrName}.",
        desc: "Accesses a keyframe by index or name.",
        returns: "Key"
    },

    // ─── SPATIAL TRANSFORMS ──────────────────────────────────────────────────────

    "toComp": {
        category: "function",
        args: ["point", "t"],
        template: "Converts {point} from layer space to comp space.",
        desc: "Layer-local coordinates to composition coordinates.",
        returns: "Array"
    },
    "fromComp": {
        category: "function",
        args: ["point", "t"],
        template: "Converts {point} from comp space to layer space.",
        desc: "Composition coordinates to layer-local coordinates.",
        returns: "Array"
    },
    "toWorld": {
        category: "function",
        args: ["point", "t"],
        template: "Converts {point} from layer space to world space.",
        desc: "Layer-local coordinates to world coordinates.",
        returns: "Array"
    },
    "fromWorld": {
        category: "function",
        args: ["point", "t"],
        template: "Converts {point} from world space to layer space.",
        desc: "World coordinates to layer-local coordinates.",
        returns: "Array"
    },
    "toCompVec": {
        category: "function",
        args: ["vec", "t"],
        template: "Transforms direction vector {vec} to comp space.",
        desc: "Direction vector from layer to comp space.",
        returns: "Array"
    },
    "fromCompVec": {
        category: "function",
        args: ["vec", "t"],
        template: "Transforms direction vector {vec} from comp to layer space.",
        desc: "Direction vector from comp to layer space.",
        returns: "Array"
    },

    // ─── LAYER REFERENCES ────────────────────────────────────────────────────────

    "layer": {
        category: "function",
        args: ["nameOrIndex"],
        template: "Reference to layer '{nameOrIndex}'.",
        desc: "Accesses a layer by name or index.",
        returns: "Layer"
    },
    "comp": {
        category: "function",
        args: ["name"],
        template: "Reference to composition '{name}'.",
        desc: "Accesses a composition by name.",
        returns: "Comp"
    },
    "effect": {
        category: "function",
        args: ["nameOrIndex"],
        template: "Reference to effect '{nameOrIndex}'.",
        desc: "Accesses an effect on the layer.",
        returns: "Effect"
    },
    "mask": {
        category: "function",
        args: ["nameOrIndex"],
        template: "Reference to mask '{nameOrIndex}'.",
        desc: "Accesses a mask on the layer.",
        returns: "Mask"
    },
    "content": {
        category: "function",
        args: ["nameOrIndex"],
        template: "Reference to shape content '{nameOrIndex}'.",
        desc: "Accesses shape layer content groups.",
        returns: "PropertyGroup"
    },

    // ─── TEXT FUNCTIONS ──────────────────────────────────────────────────────────

    "sourceRectAtTime": {
        category: "function",
        args: ["t", "includeExtents"],
        template: "Bounding box of this layer at time {t}.",
        desc: "Returns the source rectangle (top, left, width, height) of a text/shape layer.",
        returns: "Object"
    },
    "createPath": {
        category: "function",
        args: ["points", "inTangents", "outTangents", "isClosed"],
        template: "Creates a path from {points}.",
        desc: "Constructs a shape path from point arrays.",
        returns: "Path"
    },

    // ─── COLOR FUNCTIONS ─────────────────────────────────────────────────────────

    "hslToRgb": {
        category: "function",
        args: ["hsl"],
        template: "Converts HSL color {hsl} to RGB.",
        desc: "HSL to RGB color conversion.",
        returns: "Array(4)"
    },
    "rgbToHsl": {
        category: "function",
        args: ["rgb"],
        template: "Converts RGB color {rgb} to HSL.",
        desc: "RGB to HSL color conversion.",
        returns: "Array(4)"
    },
    "hexToRgb": {
        category: "function",
        args: ["hex"],
        template: "Converts hex color '{hex}' to RGB array.",
        desc: "Hex string to RGB color conversion.",
        returns: "Array(4)"
    },

    // ─── PROPERTIES ──────────────────────────────────────────────────────────────

    "position": {
        category: "property", isProp: true,
        indices: ["X", "Y", "Z"],
        template: "Spatial position coordinates.",
        desc: "The position of the layer in comp space."
    },
    "scale": {
        category: "property", isProp: true,
        indices: ["Width", "Height", "Depth"],
        template: "Scale percentage.",
        desc: "The scale of the layer."
    },
    "opacity": {
        category: "property", isProp: true,
        template: "Transparency level (0–100%).",
        desc: "The opacity of the layer."
    },
    "rotation": {
        category: "property", isProp: true,
        template: "Z-axis rotation in degrees.",
        desc: "Rotation around the Z axis."
    },
    "rotationX": {
        category: "property", isProp: true,
        template: "X-axis rotation in degrees (3D layers only).",
        desc: "Rotation around the X axis."
    },
    "rotationY": {
        category: "property", isProp: true,
        template: "Y-axis rotation in degrees (3D layers only).",
        desc: "Rotation around the Y axis."
    },
    "rotationZ": {
        category: "property", isProp: true,
        template: "Z-axis rotation in degrees (3D layers only).",
        desc: "Rotation around the Z axis."
    },
    "anchorPoint": {
        category: "property", isProp: true,
        indices: ["X", "Y", "Z"],
        template: "Anchor point (pivot) coordinates.",
        desc: "The anchor point of the layer."
    },
    "orientation": {
        category: "property", isProp: true,
        indices: ["X", "Y", "Z"],
        template: "3D orientation in degrees.",
        desc: "The 3D orientation of the layer."
    },
    "xPosition": { category: "property", isProp: true, template: "Separated X position.", desc: "X coordinate (when dimensions are separated)." },
    "yPosition": { category: "property", isProp: true, template: "Separated Y position.", desc: "Y coordinate (when dimensions are separated)." },
    "zPosition": { category: "property", isProp: true, template: "Separated Z position.", desc: "Z coordinate (when dimensions are separated)." },
    "timeRemap": { category: "property", isProp: true, template: "Time remapping value.", desc: "Controls which frame of the source is displayed." },
    "sourceText": { category: "property", isProp: true, template: "Text content of the layer.", desc: "The source text value." },

    // ─── LAYER ATTRIBUTES ────────────────────────────────────────────────────────

    "numKeys": { category: "property", isProp: true, template: "Number of keyframes on this property.", desc: "Keyframe count." },
    "numLayers": { category: "property", isProp: true, template: "Number of layers in the comp.", desc: "Layer count." },
    "inPoint": { category: "property", isProp: true, template: "Layer in-point in seconds.", desc: "Start time of the layer." },
    "outPoint": { category: "property", isProp: true, template: "Layer out-point in seconds.", desc: "End time of the layer." },
    "startTime": { category: "property", isProp: true, template: "Layer start time.", desc: "Start time offset." },
    "width": { category: "property", isProp: true, template: "Layer/comp width in pixels.", desc: "Width in pixels." },
    "height": { category: "property", isProp: true, template: "Layer/comp height in pixels.", desc: "Height in pixels." },
    "duration": { category: "property", isProp: true, template: "Comp duration in seconds.", desc: "Total duration." },
    "frameDuration": { category: "property", isProp: true, template: "Duration of one frame in seconds.", desc: "1/fps." },
    "hasParent": { category: "property", isProp: true, template: "Whether the layer has a parent.", desc: "Parent existence check." },
    "parent": { category: "property", isProp: true, template: "The parent layer.", desc: "Parent layer reference." },
    "transform": { category: "property", isProp: true, template: "Transform property group.", desc: "Contains position, scale, rotation, etc." },
    "active": { category: "property", isProp: true, template: "Whether the layer is active at current time.", desc: "Layer active state." },
    "enabled": { category: "property", isProp: true, template: "Whether the layer is enabled (eye icon).", desc: "Layer visibility." },
    "name": { category: "property", isProp: true, template: "Layer or property name.", desc: "Name string." },
    "index": { category: "global", template: "Layer index in the timeline stack.", desc: "1-based stacking order." },

    // ─── GLOBALS ─────────────────────────────────────────────────────────────────

    "time": { category: "global", template: "Current composition time in seconds.", desc: "Current playback time." },
    "value": { category: "global", template: "Current property value (before this expression modifies it).", desc: "Native property value." },
    "thisComp": { category: "global", template: "Reference to the current composition.", desc: "Host composition." },
    "thisLayer": { category: "global", template: "Reference to the current layer.", desc: "Host layer." },
    "thisProperty": { category: "global", template: "Reference to the current property.", desc: "Host property." },
    "colorDepth": { category: "global", template: "Project color depth (8, 16, or 32).", desc: "Color bit depth." },

    // ─── MATH (recognized as MemberExpression Math.xxx) ──────────────────────────

    "Math.sin": { category: "math", template: "Sine function (input in radians).", desc: "Sine." },
    "Math.cos": { category: "math", template: "Cosine function (input in radians).", desc: "Cosine." },
    "Math.tan": { category: "math", template: "Tangent function.", desc: "Tangent." },
    "Math.abs": { category: "math", template: "Absolute value (removes sign).", desc: "Absolute value." },
    "Math.floor": { category: "math", template: "Rounds down to nearest integer.", desc: "Floor." },
    "Math.ceil": { category: "math", template: "Rounds up to nearest integer.", desc: "Ceil." },
    "Math.round": { category: "math", template: "Rounds to nearest integer.", desc: "Round." },
    "Math.min": { category: "math", template: "Returns the smaller of the values.", desc: "Minimum." },
    "Math.max": { category: "math", template: "Returns the larger of the values.", desc: "Maximum." },
    "Math.pow": { category: "math", template: "Raises base to exponent power.", desc: "Power." },
    "Math.sqrt": { category: "math", template: "Square root.", desc: "Square root." },
    "Math.exp": { category: "math", template: "e raised to the given power (exponential).", desc: "Exponential." },
    "Math.log": { category: "math", template: "Natural logarithm.", desc: "Natural log." },
    "Math.atan2": { category: "math", template: "Angle in radians between positive X axis and the point (y, x).", desc: "Two-argument arctangent." },
    "Math.PI": { category: "math", template: "The constant π (3.14159…).", desc: "Pi." },
    "Math.random": { category: "math", template: "Random number 0–1 (JS native, not AE seeded).", desc: "JS random." },
    "Math.sign": { category: "math", template: "Returns -1, 0, or 1 based on the sign.", desc: "Sign function." }
};
