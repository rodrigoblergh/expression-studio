// AE IntelliSense for CodeMirror

(function(CodeMirror) {
    "use strict";

    function aeHint(cm, options) {
        var cur = cm.getCursor();
        var token = cm.getTokenAt(cur);
        var start = token.start;
        var end = token.end;
        var prefix = token.string.slice(0, Math.max(0, cur.ch - start));
        if (token.type && /(?:^|\s)(?:comment|string)(?:\s|$)/.test(token.type)) {
            return { list: [], from: cur, to: cur };
        }
        
        if (/[^\w$_]/.test(prefix)) {
            prefix = "";
            start = end = cur.ch;
        }

        var list = [];
        var before = cm.getLine(cur.line).slice(0, start);
        var mathMember = /\bMath\.$/.test(before);
        var lookupPrefix = (mathMember ? "Math." : "") + prefix;
        
        // 1. Add AE Docs
        if (typeof AEDocs !== "undefined") {
            for (var key in AEDocs) {
                if (key.toLowerCase().startsWith(lookupPrefix.toLowerCase())) {
                    var entry = AEDocs[key];
                    var isFunction = (entry.category === "function" || entry.args || (entry.category === "math" && key !== "Math.PI"));
                    var insertKey = mathMember ? key.slice(5) : key;
                    var argsDisplay = "";
                    if (entry.args) {
                        argsDisplay = entry.args.map(function(a) { return a.split("=")[0]; }).join(", ");
                    }
                    
                    list.push({
                        text: isFunction ? (insertKey + "()") : insertKey,
                        displayText: "🪄 " + (isFunction ? (key + "(" + argsDisplay + ")") : key)
                    });
                }
            }
        }

        if (mathMember) {
            return { list: list, from: CodeMirror.Pos(cur.line, start), to: CodeMirror.Pos(cur.line, end) };
        }
        
        // 2. Add basic JS keywords fallback if needed
        var keywords = ("break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield").split(" ");
        keywords.forEach(function(kw) {
            if (kw.startsWith(prefix) && !list.find(function(i) { return i.text === kw; })) {
                list.push({ text: kw, displayText: kw });
            }
        });

        // 3. Add words from the document
        var words = cm.getValue().match(/[\w$_]+/g) || [];
        var uniqueWords = Object.create(null);
        words.forEach(function(w) { uniqueWords[w] = true; });
        for (var w in uniqueWords) {
            if (w !== prefix && w.toLowerCase().startsWith(prefix.toLowerCase()) && !list.find(function(i) { return i.text === w || i.text === w + "()"; })) {
                list.push({ text: w, displayText: w });
            }
        }

        return {
            list: list,
            from: CodeMirror.Pos(cur.line, start),
            to: CodeMirror.Pos(cur.line, end)
        };
    }

    CodeMirror.registerHelper("hint", "ae", aeHint);
})(CodeMirror);
