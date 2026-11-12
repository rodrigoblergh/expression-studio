const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sources = ['jsx/host.jsx', 'script_editor/jsx/host.jsx'];
function host(source, extra = {}) {
  function CompItem() {}
  const comp = new CompItem();
  comp.id = 1; comp.selectedLayers = [];
  const calls = { begin: 0, end: 0 };
  const context = vm.createContext({CompItem, JSON, PropertyType: { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 },
    app: { project: { activeItem: comp }, beginUndoGroup() { calls.begin++; }, endUndoGroup() { calls.end++; } }, ...extra});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', source), 'utf8'), context);
  return { context, comp, calls };
}
function property() {
  let expression = 'old';
  return { name: 'Opacity', matchName: 'ADBE Opacity', propertyType: 1, canSetExpression: true,
    expressionEnabled: true, writes: 0,
    get expression() { return expression; }, set expression(value) { expression = value; this.writes++; } };
}
for (const source of sources) {
  test(source + ': closes undo group after host selection access throws', () => {
    const h = host(source);
    h.comp.selectedLayers = [{name:'Layer', get selectedProperties(){throw new Error('stale property');}}];
    const result = JSON.parse(h.context.applyExpressionToSelectedProperties('value'));
    assert.equal(result.success, false); assert.match(result.error, /stale/);
    assert.equal(h.calls.begin, 1); assert.equal(h.calls.end, 1);
  });
  test(source + ': overlapping group and child selection writes each property once', () => {
    const h = host(source), p = property();
    const group = {name:'Transform', propertyType:3, numProperties:1, property(){return p;}};
    h.comp.selectedLayers = [{name:'Layer', selectedProperties:[group,p]}];
    const result = JSON.parse(h.context.applyExpressionToSelectedProperties('value'));
    assert.equal(result.success, true); assert.equal(result.applied, 1); assert.equal(p.writes, 1);
    assert.equal(h.calls.end, 1);
  });
  test(source + ': rejects empty and non-string expressions without mutation', () => {
    const h = host(source), p = property(); h.comp.selectedLayers=[{name:'Layer',selectedProperties:[p]}];
    for(const input of ['', null, 123]) assert.equal(JSON.parse(h.context.applyExpressionToSelectedProperties(input)).success,false);
    assert.equal(p.writes,0); assert.equal(h.calls.begin,0);
  });
  test(source + ': locked layers are not changed', () => {
    const h=host(source),p=property();h.comp.selectedLayers=[{name:'Locked',locked:true,selectedProperties:[p]}];
    const r=JSON.parse(h.context.applyExpressionToSelectedProperties('value'));
    assert.equal(r.success,false);assert.match(r.error,/locked/);assert.equal(p.writes,0);assert.equal(h.calls.end,1);
  });
  test(source + ': property traversal failures are surfaced', () => {
    const h=host(source);h.comp.selectedLayers=[{name:'Layer',selectedProperties:[{name:'Group',propertyType:3,numProperties:1,property(){throw new Error('unavailable');}}]}];
    const r=JSON.parse(h.context.applyExpressionToSelectedProperties('value'));
    assert.equal(r.success,false);assert.match(r.error,/unavailable/);assert.equal(h.calls.end,1);
  });
}
test('readFileContent rejects partial reads with an ExtendScript file error and closes file', () => {
  let closed=0;
  function File(){this.exists=true;this.error='disk read failed';this.open=()=>true;this.read=()=>'partial';this.close=()=>{closed++;return true;};}
  const h=host(sources[0],{File});const result=JSON.parse(h.context.readFileContent('test.jsx'));
  assert.equal(result.success,false);assert.match(result.error,/disk read failed/);assert.equal(closed,1);
});
test('readWrittenFile refuses verification when read returns content plus an error', () => {
  const h=host(sources[0]); let closed=0;
  assert.equal(h.context.readWrittenFile({error:'read failure',open:()=>true,read:()=>'partial',close:()=>{closed++;return true;}}),null);
  assert.equal(closed,1);
});
test('failed save cannot claim restoration merely because copy returned true', () => {
  const data = {'original.jsx':'old'};
  function File(name){this.fsName=name;this.error='';}
  Object.defineProperty(File.prototype,'exists',{get(){return Object.hasOwn(data,this.fsName);}});
  File.prototype.open=function(mode){if(mode==='w')data[this.fsName]='';return true;};
  File.prototype.write=function(value){data[this.fsName]=value;return true;};
  File.prototype.read=function(){return data[this.fsName];};File.prototype.close=()=>true;
  File.prototype.copy=function(dest){data[dest]=dest==='original.jsx'?'corrupt':data[this.fsName];return true;};
  File.prototype.remove=function(){delete data[this.fsName];return true;};
  const h=host(sources[0],{File});const result=h.context.writeFileSafely(new File('original.jsx'),'new');
  assert.equal(result.success,false);assert.doesNotMatch(result.error,/was restored/);assert.match(result.error,/Original backup:/);
  assert.equal(Object.values(data).includes('old'),true);
});
function targetFixture() {
  const h=host(sources[0]),p=property();
  const layer={id:5,name:'Layer',numProperties:1,property(){return p;}};
  h.comp.numLayers=1;h.comp.layer=()=>layer;
  const target={compId:1,layerId:5,layerName:'Layer',propRoute:[{index:1,name:p.name,matchName:p.matchName}],expectedExpression:'old',expectedEnabled:true};
  return {...h,p,layer,target};
}
test('editing refuses a different composition',()=>{
  const h=targetFixture();h.target.compId=2;
  const r=JSON.parse(h.context.applyOneExpression(JSON.stringify(h.target),'new',true));
  assert.equal(r.success,false);assert.equal(h.p.writes,0);assert.equal(h.calls.begin,0);
});
test('editing refuses stale expressions',()=>{
  const h=targetFixture();h.target.expectedExpression='outdated';
  const r=JSON.parse(h.context.applyOneExpression(JSON.stringify(h.target),'new',true));
  assert.equal(r.success,false);assert.equal(h.p.writes,0);
});
test('editing refuses ambiguous duplicate property routes',()=>{
  const h=targetFixture();h.layer.numProperties=2;
  const r=JSON.parse(h.context.applyOneExpression(JSON.stringify(h.target),'new',true));
  assert.equal(r.success,false);assert.match(r.error,/Duplicate/);assert.equal(h.p.writes,0);
});
