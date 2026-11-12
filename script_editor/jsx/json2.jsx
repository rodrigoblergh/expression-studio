"use strict";
if (typeof JSON !== "object") {
    var JSON = {};
}

(function () {
    var rx_one = /^[\],:{}\s]*$/;
    var rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
    var rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
    var rx_four = /(?:^|:|,)(?:\s*\[)+/g;

    function f(n) { return n < 10 ? "0" + n : n; }

    if (typeof JSON.parse !== "function") {
        JSON.parse = function (text, reviver) {
            var j;
            text = String(text);
            if (rx_one.test(text.replace(rx_two, "@").replace(rx_three, "]").replace(rx_four, ""))) {
                j = eval("(" + text + ")");
                return typeof reviver === "function" ? (function walk(holder, key) {
                    var k, v, value = holder[key];
                    if (value && typeof value === "object") {
                        for (k in value) {
                            if (Object.prototype.hasOwnProperty.call(value, k)) {
                                v = walk(value, k);
                                if (v !== undefined) { value[k] = v; } else { delete value[k]; }
                            }
                        }
                    }
                    return reviver.call(holder, key, value);
                }({"": j}, "")) : j;
            }
            throw new SyntaxError("JSON.parse");
        };
    }

    if (typeof JSON.stringify !== "function") {
        var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
        var meta = { "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r", '"': '\\"', "\\": "\\\\" };

        function quote(string) {
            escapable.lastIndex = 0;
            return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
                var c = meta[a];
                return typeof c === "string" ? c : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' : '"' + string + '"';
        }

        JSON.stringify = function (value, replacer, space) {
            function str(key, holder) {
                var i, k, v, length, partial, value = holder[key];
                if (value && typeof value === "object" && typeof value.toJSON === "function") { value = value.toJSON(key); }
                switch (typeof value) {
                case "string": return quote(value);
                case "number": return isFinite(value) ? String(value) : "null";
                case "boolean":
                case "null": return String(value);
                case "object":
                    if (!value) { return "null"; }
                    partial = [];
                    if (Object.prototype.toString.apply(value) === "[object Array]") {
                        length = value.length;
                        for (i = 0; i < length; i += 1) { partial[i] = str(i, value) || "null"; }
                        v = partial.length === 0 ? "[]" : "[" + partial.join(",") + "]";
                        return v;
                    }
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = str(k, value);
                            if (v) { partial.push(quote(k) + ":" + v); }
                        }
                    }
                    v = partial.length === 0 ? "{}" : "{" + partial.join(",") + "}";
                    return v;
                }
            }
            return str("", {"": value});
        };
    }
}());
