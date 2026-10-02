'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Replay=require('../public/js/race-replay.js');

function harness(){
  const selectors=new Map(),events=new Map(),attributes=new Map();
  const add=(type,handler)=>{if(!events.has(type))events.set(type,new Set());events.get(type).add(handler);};
  const remove=(type,handler)=>{events.get(type)?.delete(handler);if(!events.get(type)?.size)events.delete(type);};
  const node=()=>({textContent:'',value:'',children:[],dataset:{},classList:{toggle(){}},
    append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},
    setAttribute(key,value){attributes.set(key,value);}});
  const element=selector=>{if(!selectors.has(selector))selectors.set(selector,node());return selectors.get(selector);};
  const root={querySelector:element,querySelectorAll:()=>[],
    addEventListener:add,removeEventListener:remove};
  const document={hidden:false,createElement:node,
    addEventListener(type,handler){add('document:'+type,handler);},removeEventListener(type,handler){remove('document:'+type,handler);}};
  return {root,document,element,events};
}
const record={birdId:'own',distance:1200,rank:2,time:60,finished:true,level:'open',name:'試走',
  field:[{id:'rival',name:'ライバル',time:50,finished:true},{id:'own',name:'アオバ',time:60,finished:true}],
  replay:{runners:[{id:'own',name:'アオバ',lane:0,player:true,time:60,finished:true,samples:[[0,0,20,0],[60,1200,20,0]]},
    {id:'rival',name:'ライバル',lane:1,player:false,time:50,finished:true,samples:[[0,0,24,0],[50,1200,24,0]]}]}};

test('shared playback restores controls, updates standings after a rewind, and removes every listener',async()=>{
  const original={RaceReplay:globalThis.RaceReplay,document:globalThis.document,window:globalThis.window,matchMedia:globalThis.matchMedia};
  const h=harness();Object.assign(globalThis,{RaceReplay:Replay,document:h.document,window:{speechSynthesis:{}},matchMedia:()=>({matches:false})});
  try{
    const {RacePlayback}=await import('../public/js/race-playback.js');
    const options={time:30,paused:true,rate:4,focusId:'rival',cameraMode:'follow',speaking:true};
    const viewer=new RacePlayback(h.root,record,{},options);viewer.motionPitch=1.5;viewer.updateControls();
    assert.equal(h.element('[data-viewer-speed]').value,'4');assert.equal(h.element('[data-viewer-focus]').value,'rival');
    assert.equal(h.element('[data-viewer="pause"]').textContent,'▶ 再生');
    assert.match(h.element('[data-voice-status]').textContent,/読み上げ ON/);
    assert.deepEqual(viewer.snapshot(),{...options,pitch:1.5});
    const second=new RacePlayback(h.root,record,{},viewer.snapshot());second.updateControls();
    assert.deepEqual(second.snapshot(),options);second.dispose();
    // A rewind before the first 0.2s standings refresh must clear the finish order.
    viewer.updateOverlay('race',Replay.standings(record.replay,10),10);
    assert.equal(h.element('[data-live-order]').children[0].children[1].textContent,'ライバル');
    viewer.time=0;viewer.updateOverlay('race',Replay.standings(record.replay,0),0);
    assert.equal(h.element('[data-live-order]').children[0].children[1].textContent,'アオバ');
    assert.equal(viewer.paused,true);assert.equal(h.events.size,4);
    viewer.dispose();assert.equal(viewer.disposed,true);assert.equal(h.events.size,0);
    const before=JSON.stringify(record);h.document.hidden=true;
    const hidden=new RacePlayback(h.root,record,{}, {...options,paused:false,time:1000,focusId:'missing'});
    assert.equal(hidden.paused,true);assert.equal(hidden.time,hidden.timeline.end);assert.equal(hidden.focusId,'own');hidden.dispose();
    assert.equal(JSON.stringify(record),before);
  }finally{for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('paddock controls, manual focus and renderer snapshots keep camera introductions and subtitles aligned',async()=>{
  const originals={RaceReplay:globalThis.RaceReplay,document:globalThis.document,window:globalThis.window,matchMedia:globalThis.matchMedia};
  const h=harness();Object.assign(globalThis,{RaceReplay:Replay,document:h.document,window:{},matchMedia:()=>({matches:false})});
  try{
    const {RacePlayback}=await import('../public/js/race-playback.js');
    const viewer=new RacePlayback(h.root,record,{}, {paused:true,focusId:'own'});viewer.ready=true;
    viewer.draw=()=>{const frame=viewer.readFrame();viewer.updateOverlay(frame.phase,frame.order,frame.raceTime);};viewer.draw();
    assert.equal(h.element('[data-viewer-focus]').value,'own');assert.equal(h.element('[data-paddock-controls]').hidden,false);
    viewer.control({dataset:{viewer:'paddock-next'}});
    assert.equal(viewer.time,22);assert.equal(h.element('[data-viewer-focus]').value,'rival');
    assert.equal(h.element('[data-paddock-progress]').textContent,'2 / 2羽');
    assert.match(h.element('[data-commentary-text]').textContent,/2番 ライバル/);
    const snapshot=viewer.snapshot();assert.equal(snapshot.focusId,'own','race tracking preference is retained');
    const switched=new RacePlayback(h.root,record,{},snapshot);assert.equal(switched.time,22);switched.dispose();
    viewer.seek(26);assert.equal(h.element('[data-commentary-speaker]').textContent,'サハギン / 解説');
    viewer.control({dataset:{viewer:'paddock-prev'}});assert.equal(viewer.time,6);
    assert.match(h.element('[data-commentary-text]').textContent,/1番 アオバ/);
    viewer.onChange({target:{value:'rival',matches:selector=>selector==='[data-viewer-focus]'},stopPropagation(){}});
    assert.equal(viewer.time,22);assert.equal(viewer.focusId,'rival');
    viewer.control({dataset:{viewer:'paddock-skip'}});assert.equal(viewer.time,viewer.timeline.gate);
    assert.equal(h.element('[data-paddock-controls]').hidden,true);assert.match(h.element('[data-commentary-text]').textContent,/ゲート/);
    viewer.seek(0);assert.equal(h.element('[data-viewer-focus]').value,'own');assert.equal(viewer.paused,true);
    viewer.dispose();assert.equal(h.events.size,0);
  }finally{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
