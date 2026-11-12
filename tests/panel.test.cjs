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
function memoryStorage() {
  const values = new Map();
  return {get length(){return values.size;},key(i){return [...values.keys()][i];},getItem(k){return values.has(k)?values.get(k):null;},setItem(k,v){values.set(k,String(v));},removeItem(k){values.delete(k);}};
}
function draftFixture(c, storage = memoryStorage()) {
  const expr=expression(c); c.scanData.projectPath='C:/Projects/A.aep'; c.localStorage=storage;
  c.pending['id2:1']={original:'old',origEnabled:true,expression:'new draft',enabled:true};
  return expr;
}
test('expression drafts survive panel restart only for the exact saved project and baseline', () => {
  const c=panel();draftFixture(c);c.persistExpressionDrafts();assert.equal(c.localStorage.length,1);
  const reopened=panel();draftFixture(reopened,c.localStorage);reopened.pending={};
  assert.equal(reopened.restoreExpressionDrafts(),1);assert.equal(reopened.pending['id2:1'].expression,'new draft');
  reopened.pending={};reopened.scanData.projectPath='C:/Projects/B.aep';
  assert.equal(reopened.restoreExpressionDrafts(),0);
  reopened.scanData.projectPath='C:/Projects/A.aep';reopened.scanByKey['id2:1'].expression='changed in AE';
  assert.equal(reopened.restoreExpressionDrafts(),0);assert.equal(c.localStorage.length,1);assert.match(reopened.panelStorageWarning,/Conflicting/);
});
test('recovery refuses changed property route and composition identity', () => {
  const c=panel();draftFixture(c);c.persistExpressionDrafts();c.pending={};
  c.scanData.compId=8;assert.equal(c.restoreExpressionDrafts(),0);c.scanData.compId=1;
  c.scanByKey['id2:1'].propRoute=[{index:1,matchName:'Different property'}];
  assert.equal(c.restoreExpressionDrafts(),0);assert.equal(c.localStorage.length,1);
});
test('unsaved projects never persist unsafe cross-session identities', () => {
  const c=panel();draftFixture(c);c.scanData.projectPath=null;c.persistExpressionDrafts();
  assert.equal(c.localStorage.length,0);assert.match(c.panelStorageWarning,/Save the AE project/);
});
test('restoring drafts never replaces newer pending typing', () => {
  const c=panel();draftFixture(c);c.persistExpressionDrafts();c.pending['id2:1'].expression='newer typing';
  assert.equal(c.restoreExpressionDrafts(),0);assert.equal(c.pending['id2:1'].expression,'newer typing');
});
test('resolving an edit removes only its own draft and retains other project drafts', () => {
  const c=panel();draftFixture(c);c.persistExpressionDrafts();
  c.localStorage.setItem('ae-expression-draft-v1:other','retained');
  c.pending={};c.persistExpressionDrafts();assert.equal(c.localStorage.length,1);
  assert.equal(c.localStorage.getItem('ae-expression-draft-v1:other'),'retained');
});
test('storage quota failures preserve existing drafts and show a persistent notice', () => {
  const c=panel();draftFixture(c);c.persistExpressionDrafts();const before=c.localStorage.getItem(c.localStorage.key(0));
  c.localStorage.setItem=()=>{throw new Error('quota');};c.pending['id2:1'].expression='new typing';
  c.persistExpressionDrafts();assert.equal(c.localStorage.getItem(c.localStorage.key(0)),before);
  assert.equal(c.pending['id2:1'].expression,'new typing');assert.match(c.panelStorageWarning,/unavailable or full/);
});
test('malformed saved drafts are retained without blocking valid recovery', () => {
  const c=panel();draftFixture(c);c.persistExpressionDrafts();c.localStorage.setItem('ae-expression-draft-v1:broken','{');c.pending={};
  assert.equal(c.restoreExpressionDrafts(),1);assert.equal(c.localStorage.getItem('ae-expression-draft-v1:broken'),'{');
  assert.match(c.panelStorageWarning,/could not be read/);
});
for(const script of ['js/panel.js','script_editor/js/panel.js']) {
  test(script+': concurrent host activity stays pending until all callbacks finish', () => {
    const c=panel(script),callbacks=[];let indicator;
    c.document.createElement=()=>({style:{},setAttribute(k,v){this[k]=v;}});c.document.body={appendChild(el){indicator=el;}};
    c.csInterface={evalScript(_,callback){callbacks.push(callback);}};c.installHostActivityIndicator();
    c.csInterface.evalScript('one',()=>{});c.csInterface.evalScript('two',()=>{});
    assert.equal(indicator['aria-busy'],'true');callbacks[0]('ok');assert.match(indicator.textContent,/working/);
    callbacks[1]('ok');assert.equal(indicator['aria-busy'],'false');assert.equal(indicator.textContent,'');
  });
  test(script+': storage write errors are reported rather than thrown away', () => {
    const c=panel(script);c.localStorage={setItem(){throw new Error('blocked');}};
    assert.equal(c.writePanelStorage('draft','text'),false);assert.match(c.panelStorageWarning,/storage is unavailable/);
  });
}

test('unreadable script document storage is retained instead of overwritten by new defaults', () => {
  const c=panel('script_editor/js/panel.js');c.localStorage=memoryStorage();c.localStorage.setItem('ae-editor-documents-v1','{broken');
  c.loadDocuments();c.persistDocuments();assert.equal(c.localStorage.getItem('ae-editor-documents-v1'),'{broken');
  assert.match(c.panelStorageWarning,/will not be overwritten/);
});
test('unreadable recovery storage is retained when recording another draft', () => {
  const c=panel('script_editor/js/panel.js');c.localStorage=memoryStorage();c.localStorage.setItem('ae-editor-recovery-v1','{broken');
  c.loadRecoveryDrafts();assert.equal(c.writePanelStorage('ae-editor-recovery-v1','[]'),false);
  assert.equal(c.localStorage.getItem('ae-editor-recovery-v1'),'{broken');
});
