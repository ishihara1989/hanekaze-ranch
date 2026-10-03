'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const R=require('../public/js/ranch-engine.js'),W=require('../public/js/world.js');
const RanchObservation=require('../public/js/ranch-observation.js');
const RanchPortraits={...require('../public/js/ranch-portraits.js'),hydrate(){}};
const Storage=require('../public/js/ranch-storage.js');
const slotKey=slot=>`${R.SAVE_KEY}-slot-${slot}`;
const snapshot=s=>JSON.stringify({...s,rng:0});

async function boot(raw,seeds=[12345,67890,13579]){
  let entropyCalls=0;
  const elements=new Map(),handlers={};
  const node=key=>{
    if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'',focus(){},dataset:{},classList:{toggle(){}},matches(){return false;}});
    return elements.get(key);
  };
  const storage=Storage.create({indexedDB:new IDBFactory(),legacyStorage:()=>({getItem:key=>key===R.SAVE_KEY?raw:null}),channelFactory:()=>null});
  const ctx=vm.createContext({Ranch:R,RanchWorld:W,RanchObservation,RanchPortraits,RanchStorage:{create:()=>storage},console,
    crypto:{getRandomValues(values){values[0]=seeds[entropyCalls++]??24680;return values;}},
    document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>handlers[name]=fn,body:node('body'),activeElement:node('active')},
    requestAnimationFrame:fn=>fn(),setTimeout:fn=>{fn();return 1;},window:{scrollTo(){},addEventListener(){}}});
  const source=fs.readFileSync(require.resolve('../public/js/ranch-ui.js'),'utf8');
  await vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.hooks={get state(){return state},get modal(){return modal}};})();`),ctx);
  return {h:ctx.hooks,storage,get entropyCalls(){return entropyCalls;},
    async click(action,data={}){await handlers.click({target:{closest:()=>({dataset:{action,...data},disabled:false})}});},
    async import(raw){await handlers.change({target:{id:'import-file',value:'',dataset:{},files:[{size:raw.length,text:async()=>raw}],matches(){return false;}}});}};
}

function hatchSave(){
  const s=R.initial(20261003),read=()=>{while(s.reports.length)R.acknowledge(s);};
  R.buy(s,s.sale[0]);read();R.breed(s,R.own(s).find(b=>b.role==='mare').id,R.sires(s)[0].id);
  for(let week=0;week<3;week++){read();R.advance(s);}read();
  return R.serializeState(s);
}
function hatch(s){
  R.advance(s);
  const report=s.reports.find(r=>r.type==='birth');
  assert.ok(report);assert.ok(R.validState(s));
  return R.bird(s,report.birdId);
}

test('confirmed reloads of the same pre-hatch slot reroll offspring and retain the saved snapshot',async()=>{
  const raw=hatchSave(),saved=R.deserializeState(raw),g=await boot(raw);
  await g.click('slot-save',{slot:'1'});const slot=await g.storage.read(slotKey(1)),children=[];
  for(let attempt=0;attempt<2;attempt++){
    const current=JSON.stringify(g.h.state),calls=g.entropyCalls;
    await g.click('slot-load',{slot:'1'});
    assert.equal(JSON.stringify(g.h.state),current);assert.equal(g.entropyCalls,calls);
    await g.click('close');assert.equal(g.entropyCalls,calls);
    await g.click('slot-load',{slot:'1'});await g.click('slot-load-confirm');
    assert.equal(g.entropyCalls,calls+1);assert.equal(snapshot(g.h.state),snapshot(saved));
    assert.equal(JSON.stringify(R.deserializeState(await g.storage.read(R.SAVE_KEY))),JSON.stringify(g.h.state));
    children.push(hatch(g.h.state));assert.equal(await g.storage.read(slotKey(1)),slot);
  }
  assert.notDeepEqual(children[0].genome,children[1].genome);
  assert.notDeepEqual(children[0].potential,children[1].potential);
});

test('autosave resumes reroll future hatches and preserve existing birds and reports',async()=>{
  const raw=hatchSave(),children=[];
  for(const seed of [12345,67890]){
    const g=await boot(raw,[seed]);assert.equal(g.h.state.rng,seed);
    children.push(hatch(g.h.state));
    const reloaded=await boot(R.serializeState(g.h.state));
    assert.equal(snapshot(reloaded.h.state),snapshot(g.h.state));
  }
  assert.notDeepEqual(children[0].genome,children[1].genome);
});

test('JSON import previews preserve RNG, while confirmed imports reroll future hatches',async()=>{
  const raw=hatchSave(),g=await boot(raw),children=[];
  for(let attempt=0;attempt<2;attempt++){
    const current=JSON.stringify(g.h.state),calls=g.entropyCalls;
    await g.import(raw);
    assert.equal(g.h.modal.type,'import');assert.equal(JSON.stringify(g.h.state),current);assert.equal(g.entropyCalls,calls);
    await g.click('import-confirm');assert.equal(g.entropyCalls,calls+1);
    assert.equal(snapshot(g.h.state),snapshot(R.deserializeState(raw)));children.push(hatch(g.h.state));
  }
  assert.notDeepEqual(children[0].genome,children[1].genome);
});

test('resume seeds differ from both saved and running RNG even if the entropy repeats',async()=>{
  const raw=hatchSave(),saved=R.deserializeState(raw),g=await boot(raw,[saved.rng,saved.rng,saved.rng]);
  assert.notEqual(g.h.state.rng,saved.rng);
  await g.click('slot-save',{slot:'1'});
  const prior=g.h.state.rng;
  await g.click('slot-load',{slot:'1'});await g.click('slot-load-confirm');
  assert.notEqual(g.h.state.rng,prior);assert.ok(R.validState(g.h.state));
});
