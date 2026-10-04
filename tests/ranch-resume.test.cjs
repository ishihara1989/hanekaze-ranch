'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const R=require('../tools/lib/ranch-fixtures.cjs').R,W=require('../public/js/world.js');
const RanchObservation=require('../public/js/ranch-observation.js');
const RanchLibrary=require('../public/js/ranch-library.js');
const RanchCharacters=require('../public/js/ranch-characters.js');
const RanchPortraits={...require('../public/js/ranch-portraits.js'),hydrate(){}};
const Storage=require('../public/js/ranch-storage.js');
const slotKey=slot=>`${R.SAVE_KEY}-slot-${slot}`;
const snapshot=s=>JSON.stringify({...s,rng:0});

async function boot(raw,seeds=[12345,67890,13579],slots=new Map()){
  let entropyCalls=0;
  const elements=new Map(),handlers={};
  const node=key=>{
    if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'',focus(){},dataset:{},classList:{toggle(){}},matches(){return false;}});
    return elements.get(key);
  };
  const storage=Storage.create({indexedDB:new IDBFactory(),legacyStorage:()=>({getItem:key=>key===R.SAVE_KEY?raw:slots.get(key)??null}),channelFactory:()=>null});
  const ctx=vm.createContext({Ranch:R,RanchWorld:W,RanchObservation,RanchLibrary,RanchCharacters,RanchPortraits,RanchStorage:{create:()=>storage},console,
    crypto:{getRandomValues(values){values[0]=seeds[entropyCalls++]??24680;return values;}},
    document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>handlers[name]=fn,body:node('body'),activeElement:node('active')},
    requestAnimationFrame:fn=>fn(),setTimeout:fn=>{fn();return 1;},window:{scrollTo(){},addEventListener(){}}});
  const source=fs.readFileSync(require.resolve('../public/js/ranch-ui.js'),'utf8');
  await vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.hooks={get state(){return state},get modal(){return modal},render};})();`),ctx);
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

test('settings redraw and refresh use slot summaries; loading still validates the full snapshot',async()=>{
  const g=await boot(R.serializeState(R.initial()));
  for(let slot=1;slot<=5;slot++)await g.click('slot-save',{slot:String(slot)});
  const deserialize=R.deserializeState,valid=R.validState;let decoded=0,validated=0;
  R.deserializeState=(...args)=>{decoded++;return deserialize(...args);};
  R.validState=(...args)=>{validated++;return valid(...args);};
  try{
    await g.click('nav',{page:'settings'});g.h.render();g.h.render();
    await g.click('nav',{page:'settings'});
    assert.equal(decoded,0);assert.equal(validated,0);
    await g.click('slot-load',{slot:'1'});assert.equal(decoded,1);assert.equal(validated,1);
    await g.click('slot-load-confirm');assert.ok(decoded>=2);assert.ok(validated>=3);
  }finally{R.deserializeState=deserialize;R.validState=valid;g.storage.close();}
});

test('legacy slot summaries are backfilled once without rewriting good or damaged snapshots',async()=>{
  const raw=R.serializeState(R.initial()),slot=JSON.stringify({version:1,savedAt:'2026-10-04T00:00:00Z',data:raw});
  const g=await boot(raw,undefined,new Map([[slotKey(1),slot],[slotKey(2),'{damaged']]));
  const deserialize=R.deserializeState;let decoded=0;
  R.deserializeState=(...args)=>{decoded++;return deserialize(...args);};
  try{
    await g.click('nav',{page:'settings'});assert.equal(decoded,1);
    await g.click('nav',{page:'settings'});g.h.render();assert.equal(decoded,1);
    assert.equal(await g.storage.read(slotKey(1)),slot);assert.equal(await g.storage.read(slotKey(2)),'{damaged');
    const views=await g.storage.readSummaries([slotKey(1),slotKey(2)]);
    assert.equal(views.get(slotKey(1)).week,9);assert.equal(views.get(slotKey(2)).invalid,true);
  }finally{R.deserializeState=deserialize;g.storage.close();}
});

test('damaged or unwritable summary metadata cannot prevent loading an intact snapshot',async()=>{
  const raw=R.serializeState(R.initial()),slot=JSON.stringify({version:1,savedAt:'2026-10-04T00:00:00Z',data:raw});
  const g=await boot(raw);
  await g.storage.write(slotKey(1),slot,null,{version:1,week:'damaged'});
  g.storage.writeSummary=async()=>{throw Error('quota');};
  await g.click('nav',{page:'settings'});
  assert.equal(await g.storage.read(slotKey(1)),slot);
  await g.click('slot-load',{slot:'1'});assert.equal(g.h.modal.type,'slot-load');
  await g.click('slot-load-confirm');assert.ok(R.validState(g.h.state));
  assert.equal(await g.storage.read(slotKey(1)),slot);g.storage.close();
});
