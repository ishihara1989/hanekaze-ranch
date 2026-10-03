'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const engine=require('../../public/js/ranch-engine.js');
let history,registered;
const copy=structuredClone;

function historyKey(){
  const files=new Set();
  function visit(module){
    if(!module||files.has(module.filename))return;
    files.add(module.filename);module.children.forEach(visit);
  }
  visit(require.cache[require.resolve('../../public/js/ranch-engine.js')]);
  const hash=crypto.createHash('sha256').update('ranch-world-history-v1');
  for(const file of [...files].sort())hash.update(path.basename(file)).update(fs.readFileSync(file));
  return hash.digest('hex');
}
function prepareWorld(){
  if(history!==undefined)return history;
  const file=path.join(__dirname,'../../tmp/test-fixtures',`${historyKey()}.json`);
  try{history=fs.readFileSync(file,'utf8');}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    history=engine.worldHistory();
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const temporary=`${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary,history);
    try{fs.renameSync(temporary,file);}
    catch(error){if(!fs.existsSync(file))throw error;fs.unlinkSync(temporary);}
  }
  return history;
}
const R={...engine,initial:(seed,settings)=>engine.initial(seed,settings,prepareWorld())};
const read=s=>{while(s.reports.length)R.acknowledge(s);};
const progress=(s,weeks)=>{for(let i=0;i<weeks;i++){read(s);R.advance(s);}};
function founded(seed=20260930,mare=0,sire=0){
  const s=R.initial(seed);R.buy(s,s.sale[mare]);read(s);
  R.breed(s,R.own(s).find(b=>b.role==='mare').id,R.sires(s).find(b=>b.lineage===R.ROOTS[sire].lineage&&b.kind==='root').id);read(s);
  return s;
}
function racer(){
  if(!registered){
    const s=founded();progress(s,R.GESTATION);read(s);
    const child=R.own(s).find(b=>b.role==='young');
    // Test setup jumps to the registration boundary; actual registration/advance still run.
    s.week=96;R.advance(s);read(s);
    Object.assign(child,{condition:100,strain:0,health:0});
    for(const key in child.training)child.training[key]=.9;
    registered={s,id:child.id};
  }
  const s=copy(registered.s);return {s,b:R.bird(s,registered.id)};
}
module.exports={R,prepareWorld,historyKey,read,progress,founded,racer};
