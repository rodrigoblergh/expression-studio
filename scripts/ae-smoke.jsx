/**
 * Expression Studio real After Effects acceptance smoke test (ES3).
 * Run using File > Scripts > Run Script File, or AfterFX.exe -r <this file>.
 * Refuses user projects. Only an empty unsaved project, or this repository's
 * exact work/Expression-Studio-Acceptance.aep, is accepted. Never closes a project.
 * Not part of the shipped extension runtime.
 */
var ExpressionStudioSmokeRoot = new File($.fileName).parent.parent.fsName;
$.evalFile(ExpressionStudioSmokeRoot + '/jsx/host.jsx');
(function () {
    var work = new Folder(ExpressionStudioSmokeRoot + '/work');
    if (!work.exists && !work.create()) throw new Error('Could not create acceptance results directory.');
    var resultFile = new File(work.fsName + '/ae-smoke-results.json');
    var sample = new File(work.fsName + '/Expression-Studio-Acceptance.aep');
    var report = { schemaVersion: 1, status: 'running', aeVersion: app.version, os: $.os,
        startedAt: (new Date()).toUTCString(), sampleProject: sample.fsName, checks: [] };
    function writeReport() {
        resultFile.encoding = 'UTF-8';
        if (!resultFile.open('w')) throw new Error('Could not write acceptance results: ' + resultFile.error);
        var ok = false;
        try { ok = resultFile.write(JSON.stringify(report, null, 2)); }
        finally { if (!resultFile.close()) ok = false; }
        if (!ok) throw new Error('Could not finish writing acceptance results.');
    }
    function check(name, action) {
        try { action(); report.checks.push({name: name, passed: true}); }
        catch (e) { report.checks.push({name: name, passed: false, error: String(e.message || e), line: e.line || null}); }
        writeReport();
    }
    function expect(condition, message) { if (!condition) throw new Error(message); }
    function response(text) { var r = JSON.parse(text); expect(r.success, r.error || 'Host operation failed'); return r; }
    var project = app.project;
    var currentPath = null;
    try { currentPath = project.file ? project.file.fsName : null; } catch (e) {}
    // Exact full path, not merely a matching filename: never replace somebody else's project.
    var knownSample = currentPath === sample.fsName;
    if ((!knownSample && currentPath) || (!knownSample && project.numItems > 0)) {
        report.status = 'refused';
        report.error = 'Existing user project detected. Open an empty unsaved project yourself before running this test. No project was changed.';
        writeReport(); return;
    }
    writeReport();
    var comp, source, destination, opacity, otherOpacity, baselineTarget;
    function deselectLayers() { for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false; }
    function targetFor(layer) {
        deselectLayers();
        var scan = response(scanComp('[]'));
        for (var i = 0; i < scan.layers.length; i++) {
            if (scan.layers[i].id !== layer.id) continue;
            for (var j = 0; j < scan.layers[i].expressions.length; j++) {
                var p = scan.layers[i].expressions[j];
                if (p.propRoute[p.propRoute.length - 1].matchName !== 'ADBE Opacity') continue;
                return {compId:scan.compId, layerId:p.layerId, layerName:p.layerName, propRoute:p.propRoute,
                    expectedExpression:p.expression, expectedEnabled:p.enabled};
            }
        }
        throw new Error('Scanned opacity expression missing.');
    }
    check('Create disposable composition and expression layers', function () {
        comp = project.items.addComp('Expression Studio Acceptance ' + (new Date()).getTime(), 640, 360, 1, 5, 30);
        comp.comment = 'Expression Studio automated acceptance fixture';
        source = comp.layers.addSolid([0.12,0.35,0.8], 'Source — expressão', 260, 180, 1, 5);
        destination = comp.layers.addSolid([0.8,0.35,0.12], "Destination 'quoted'", 260, 180, 1, 5);
        source.property('ADBE Transform Group').property('ADBE Position').setValue([185,180]);
        destination.property('ADBE Transform Group').property('ADBE Position').setValue([455,180]);
        opacity = source.property('ADBE Transform Group').property('ADBE Opacity');
        otherOpacity = destination.property('ADBE Transform Group').property('ADBE Opacity');
        opacity.expression = 'value * 0.75';
        otherOpacity.expression = 'value * 0.5';
        comp.openInViewer(); deselectLayers();
        expect(typeof source.id === 'number', 'Stable layer IDs unavailable; AE 2022 or newer is required for edits.');
        expect(!opacity.expressionError, opacity.expressionError);
    });
    check('Scan returns current composition, two layers and stable property identities', function () {
        var scan = response(scanComp('[]'));
        expect(scan.compId === comp.id && scan.layers.length === 2, 'Unexpected scan composition or layer count.');
        baselineTarget = targetFor(source);
        expect(baselineTarget.propRoute.length === 2 && baselineTarget.layerId === source.id, 'Property route or layer ID missing.');
    });
    check('Apply one expression and report actual stored state', function () {
        var r = response(applyOneExpression(JSON.stringify(baselineTarget), 'value * 0.8', true));
        expect(opacity.expression === r.expression && opacity.expressionEnabled === r.enabled, 'Apply result differs from AE.');
        expect(!opacity.expressionError, opacity.expressionError);
    });
    check('Reject stale expression target without changing the property', function () {
        var before = opacity.expression;
        var r = JSON.parse(applyOneExpression(JSON.stringify(baselineTarget), '0', true));
        expect(!r.success && opacity.expression === before, 'Stale target was accepted or modified the property.');
    });
    check('Toggle expression off and back on with fresh identities', function () {
        response(toggleExpression(JSON.stringify(targetFor(source)), false));
        expect(!opacity.expressionEnabled, 'Expression stayed enabled.');
        response(toggleExpression(JSON.stringify(targetFor(source)), true));
        expect(opacity.expressionEnabled, 'Expression stayed disabled.');
    });
    check('Apply batch updates to two distinct properties', function () {
        var a = targetFor(source), b = targetFor(destination);
        var r = response(applyExpressions(JSON.stringify([{key:'source',target:a,expression:'value * 0.7',enabled:true},
            {key:'destination',target:b,expression:'value * 0.6',enabled:true}])));
        expect(r.applied === 2 && r.results[0].success && r.results[1].success, 'Batch did not apply both expressions.');
    });
    check('Apply to selected layer resolves the matching property', function () {
        var t = targetFor(source); destination.selected = true;
        var r = response(applyExpressionToSelectedLayers(JSON.stringify(t), 'value * 0.9'));
        expect(r.applied === 1 && otherOpacity.expression === 'value * 0.9', 'Selected-layer apply did not target destination.');
        deselectLayers();
    });
    check('Selected-property application uses the selected opacity only', function () {
        deselectLayers(); source.selected = true; opacity.selected = true;
        var r = response(applyExpressionToSelectedProperties('value * 0.85'));
        expect(r.applied === 1 && opacity.expression === 'value * 0.85', 'Unexpected selected-property apply count or result.');
        opacity.selected = false; deselectLayers();
    });
    check('Wrong composition target is rejected without writes', function () {
        var t = targetFor(source), before = opacity.expression; t.compId = -12345;
        expect(!JSON.parse(applyOneExpression(JSON.stringify(t), '0', true)).success && opacity.expression === before, 'Wrong composition target was written.');
    });
    check('Chunked scan round trip preserves a long expression', function () {
        var longExpression = '/* ' + (new Array(5001)).join('x') + ' */\nvalue * 0.85';
        opacity.expression = longExpression;
        var begin = response(beginExpressionScan('[]')), offset = 0, chunks = '', count = 0;
        try {
            while (offset < begin.length) {
                var chunk = response(readExpressionScanChunk(begin.token, offset));
                expect(chunk.next > offset, 'Scan transfer made no progress.');
                chunks += chunk.chunk; offset = chunk.next; count++;
                expect(count < 100, 'Scan transfer exceeded expected chunk count.');
            }
            var scan = JSON.parse(chunks), found = false;
            for (var i = 0; i < scan.layers.length; i++) for (var j = 0; j < scan.layers[i].expressions.length; j++) {
                if (scan.layers[i].expressions[j].expression === opacity.expression) found = true;
            }
            expect(found && count > 1, 'Long expression did not round trip through scan chunks.');
        } finally { releaseExpressionScan(begin.token); opacity.expression = 'value * 0.85'; }
    });
    check('Script execution returns result and structured error', function () {
        expect(response(runScript('6 * 7')).result === '42', 'Script result mismatch.');
        var failure = JSON.parse(runScript('throw new Error("acceptance error")'));
        expect(!failure.success && failure.error.indexOf('acceptance error') !== -1, 'Script error missing.');
    });
    check('Unicode content and quoted Unicode file path save/read round trip', function () {
        var file = new File(work.fsName + "/Expression-Studio-a\u00e7\u00e3o-'quote'.txt");
        var content = "a\u00e7\u00e3o \u2713 'quoted' \"double\"\nSecond line";
        response(saveFileContent(file.fsName, content));
        expect(response(readFileContent(file.fsName)).content === content, 'Saved text did not round trip exactly.');
        response(saveFileContent(file.fsName, content + '\nUpdated'));
        expect(response(readFileContent(file.fsName)).content === content + '\nUpdated', 'Overwrite did not round trip exactly.');
    });
    check('Save acceptance project and expose its path in scan results', function () {
        deselectLayers(); project.save(sample);
        expect(project.file && project.file.fsName === sample.fsName, 'Project save path mismatch.');
        expect(response(scanComp('[]')).projectPath === sample.fsName, 'Scan lacks the saved project identity.');
    });
    var failures = 0;
    for (var n = 0; n < report.checks.length; n++) if (!report.checks[n].passed) failures++;
    report.status = failures ? 'failed' : 'passed';
    report.passed = report.checks.length - failures; report.failed = failures;
    report.finishedAt = (new Date()).toUTCString();
    report.note = 'Host acceptance only. Panel layout, keyboard interaction and CEP bridge UI require separate live evaluation.';
    writeReport();
})();
