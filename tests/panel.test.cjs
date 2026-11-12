const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function panel(script = 'js/panel.js') {
  const c = vm.createContext({document: {addEventListener() {}, querySelector() {return null;}, getElementById() {return {addEventListener() {}};}}, setTimeout, clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', script), 'utf8'), c);
  c.withHost = fn => fn(); c.setStatus = c.setOutput = msg => {c.message = msg;};
  c.updateActionBar = () => {}; c.getNode = () => null;
  return c;
}
function expression(c) {
  const expr = {layerId: 2, layerIndex: 1, layerName: 'Layer', propRoute: [{index: 1}], propPath: 'Opacity', expression: 'old', enabled: true};
  c.scanData = {compId: 1, layers: [{expressions: [expr]}]}; c.scanByKey = {'id2:1': expr};
  return expr;
}
test('scan completion preserves edits made while host was reading', () => {
  const c = panel(); expression(c); let complete;
  c.requestScanData = (_, fn) => {complete = fn;}; c.doScan();
  c.editRevision++; c.pending['id2:1'] = {expression: 'new'};
  complete(null, {success: true, layers: []});
  assert.equal(c.pending['id2:1'].expression, 'new'); assert.equal(c.scanGeneration, 0);
  assert.match(c.message, /Edits changed/);
});
test('older scan response cannot replace a newer request', () => {
  const c = panel(); const old = expression(c); const callbacks = [];
  c.requestScanData = (_, fn) => callbacks.push(fn); c.doScan(); c.doScan();
  callbacks[0](null, {success: true, layers: []});
  assert.equal(c.scanByKey['id2:1'], old); assert.equal(c.scanGeneration, 0);
});
test('undo response cannot change a replacement scan', () => {
  const c = panel(); expression(c); let complete;
  c.history['id2:1'] = [{expression:'before', enabled:true}];
  c.csInterface = {evalScript(_, fn) {complete = fn;}};
  c.undoOne('id2:1'); c.scanGeneration++;
  const replacement = expression(c); replacement.expression = 'other'; c.history = {};
  complete(JSON.stringify({success:true, expression:'before', enabled:true}));
  assert.equal(replacement.expression, 'other'); assert.match(c.message, /earlier scan/);
});
test('undo preserves typing started while the host was responding', () => {
  const c = panel(); const expr = expression(c); let complete;
  c.history['id2:1'] = [{expression:'before', enabled:true}];
  c.csInterface = {evalScript(_, fn) {complete = fn;}};
  c.undoOne('id2:1');
  c.pending['id2:1'] = {expression:'typing', original:'old'};
  c.editors['id2:1'] = {setValue() {assert.fail('new typing must not be replaced');}};
  complete(JSON.stringify({success:true, expression:'before', enabled:true}));
  assert.equal(expr.expression, 'before'); assert.equal(c.pending['id2:1'].expression, 'typing');
  assert.equal(c.pending['id2:1'].original, 'before');
});
test('copy honors a deliberately empty editor', () => {
  const c = panel(); expression(c); c.editors['id2:1'] = {getValue: () => ''};
  c.copyTextToClipboard = value => {c.copied = value;}; c.copyExpr('id2:1');
  assert.equal(c.copied, '');
});
test('recovery confirmation cannot replace edits made after it opened', () => {
  const c = panel('script_editor/js/panel.js'); let confirm;
  c.editor = {getValue: () => 'draft'}; c.isDirty = true;
  c.modeDocuments.script = {revision:0};
  c.recoveryDrafts = [{mode:'script', content:'recovered', name:'Recovery'}];
  c.showConfirm = (_, __, fn) => {confirm = fn;};
  c.replaceCurrentDocument = () => assert.fail('must preserve newer edits');
  c.restoreRecoveryDraft(0); c.modeDocuments.script.revision++; confirm();
  assert.match(c.message, /Editor changed/);
});


test('toggle response cannot modify pending edits in a replacement scan', () => {
  const c = panel(); const expr = expression(c); let complete;
  c.csInterface = {evalScript(_, fn) {complete = fn;}};
  c.doToggle(expr, {}); c.scanGeneration++;
  c.pending['id2:1'] = {expression:'new draft', enabled:true, origEnabled:true};
  complete(JSON.stringify({success:true, enabled:false}));
  assert.equal(c.pending['id2:1'].enabled, true); assert.equal(c.pending['id2:1'].origEnabled, true);
  assert.match(c.message, /earlier scan/);
});
