const test = require('node:test');
const assert = require('node:assert/strict');
const updates = require('../js/updates.js');
const repo = 'https://github.com/rodrigoblergh/expression-studio';
function release() { return {draft:false, prerelease:false, tag_name:'v1.1.0', html_url:repo+'/releases/tag/v1.1.0', assets:[{name:'Expression-Studio-1.1.0.zip', browser_download_url:repo+'/releases/download/v1.1.0/Expression-Studio-1.1.0.zip', state:'uploaded', size:123}]}; }
test('update version matches extension package', () => assert.equal(updates.currentVersion, require('../package.json').version));
test('stable versions compare numerically', () => {assert.equal(updates.compareVersions('1.10.0','1.2.0'),1);assert.equal(updates.compareVersions('1.0.1','1.0.1'),0);assert.equal(updates.compareVersions('1.0.0','2.0.0'),-1);});
test('malformed and prerelease versions are rejected', () => {for(const value of ['01.0.0','1.0.0-beta','1.0','1.0.0/evil','999999999999999999.0.0',null]) assert.throws(()=>updates.compareVersions(value,'1.0.0'));});
test('valid public stable release is offered', () => assert.equal(updates.readResponse(200, JSON.stringify(release())).kind,'update'));
test('private and draft releases are rejected', () => {for(const flag of ['draft','prerelease']) {const r=release();r[flag]=true;assert.throws(()=>updates.validateRelease(r));}});
test('foreign, redirected-looking, and malformed package links are rejected', () => {for(const url of ['https://evil.test/package.zip',repo+'.evil.test/file',repo+'/releases/download/v1.1.0/../evil.zip',repo+'/releases/download/v1.1.0/Expression-Studio-1.1.0.zip?redirect=evil']) {const r=release();r.assets[0].browser_download_url=url;assert.throws(()=>updates.validateRelease(r));}});
test('release page address must match the pinned repository and tag', () => {const r=release();r.html_url='https://evil.test';assert.throws(()=>updates.validateRelease(r));});
test('missing packages and unfinished uploads are rejected', () => {const r=release();r.assets[0].state='new';assert.throws(()=>updates.validateRelease(r));r.assets=[];assert.throws(()=>updates.validateRelease(r));});
test('404 means no public stable release, network and rate limits are distinct errors', () => {assert.equal(updates.readResponse(404,'').kind,'unpublished');assert.throws(()=>updates.readResponse(0,''),/HTTP 0/);assert.throws(()=>updates.readResponse(403,''),/limited/);assert.throws(()=>updates.readResponse(200,'{broken'));});
test('update checking is opt-in and restores the button after a timeout', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  let initialize, click, request, requests = 0;
  const button = {disabled:false, addEventListener(_, callback) {click=callback;}};
  const status = {textContent:''};
  const context = {document:{addEventListener(_, callback){initialize=callback;},getElementById(id){return id==='check-updates'?button:status;}},XMLHttpRequest:function(){requests++;request=this;this.open=()=>{};this.setRequestHeader=()=>{};this.send=()=>{};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/updates.js'),'utf8'),context);
  initialize(); assert.equal(requests,0); click(); assert.equal(requests,1); assert.equal(button.disabled,true);
  assert.equal(request.timeout,15000); request.ontimeout(); assert.equal(button.disabled,false); assert.match(status.textContent,/timed out/);
});
