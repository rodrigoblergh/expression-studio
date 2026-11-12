const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const smoke=fs.readFileSync(path.join(__dirname,'../scripts/ae-smoke.jsx'),'utf8');
for (const scenario of [{name:'unsaved project with items',numItems:1,file:null},{name:'saved empty user project',numItems:0,file:{fsName:'/user/important.aep'}},{name:'same sample filename outside repository',numItems:1,file:{fsName:'/user/Expression-Studio-Acceptance.aep'}}]) {
  test('AE smoke refuses '+scenario.name+' without project changes',()=>{
    const files={};let mutations=0;
    function File(name){this.fsName=name;this.parent={parent:{fsName:'/repo'}};}
    File.prototype.open=()=>true;File.prototype.write=function(content){files[this.fsName]=content;return true;};File.prototype.close=()=>true;
    function Folder(name){this.fsName=name;this.exists=true;}
    const project={numItems:scenario.numItems,file:scenario.file,save(){mutations++;},items:{addComp(){mutations++;throw Error('User project must not be changed');}}};
    vm.runInNewContext(smoke,{File,Folder,JSON,app:{project,version:'26.0'},$:{fileName:'/repo/scripts/ae-smoke.jsx',os:'test',evalFile(){}}});
    const report=JSON.parse(files['/repo/work/ae-smoke-results.json']);
    assert.equal(report.status,'refused');assert.equal(mutations,0);assert.equal(report.checks.length,0);
  });
}
