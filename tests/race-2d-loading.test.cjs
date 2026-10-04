'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Replay=require('../public/js/race-replay.js'),Course=require('../public/js/race-2d-course.js');
const manifest=require('../public/assets/chocobo-sprite-study/v5/manifest.json');
const motionCount=1+Object.keys(manifest.motions||{}).length,baseImageCount=1+2*motionCount;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function root(){
  const nodes=new Map(),listeners=new Set();
  const node=()=>({value:'2',dataset:{},classList:{add(){},remove(){}},prepend(){},setAttribute(){}});
  return {listeners,querySelector(key){if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);},querySelectorAll:()=>[],
    addEventListener(type,handler){listeners.add(handler);},removeEventListener(type,handler){listeners.delete(handler);}};
}
const runner={id:'own',name:'アオバ',lane:0,player:true,color:'yellow',crest:'yellow',time:30,finished:true,samples:[[0,0,20,0],[30,600,20,0]]};
const record={birdId:'own',distance:600,rank:1,time:30,finished:true,level:'open',surface:'turf',name:'試走',field:[runner],replay:{runners:[runner]}};

test('closing during asset loading cannot revive a viewer; cached art is shared and failed sprites retry',async()=>{
  const keys=['RaceReplay','Race2DCourse','document','window','matchMedia','fetch','Image','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),errors=[],oldError=console.error;
  let resolveManifest,fetches=0,observers=0,draws=0;const images=[],frames=new Set(),documentListeners=new Set();
  Object.assign(globalThis,{RaceReplay:Replay,Race2DCourse:Course,window:{},matchMedia:()=>({matches:false}),
    document:{hidden:false,createElement:()=>({setAttribute(){},getContext:()=>({}),remove(){}}),
      addEventListener(type,handler){documentListeners.add(handler);},removeEventListener(type,handler){documentListeners.delete(handler);}},
    fetch:()=>{fetches++;return new Promise(resolve=>{resolveManifest=()=>resolve({ok:true,json:async()=>manifest});});},
    Image:class{set src(path){this.path=path;images.push(this);}},
    ResizeObserver:class{observe(){observers++;}disconnect(){observers--; }},
    requestAnimationFrame:callback=>{frames.add(callback);return callback;},cancelAnimationFrame:callback=>frames.delete(callback)});
  console.error=error=>errors.push(error);
  let prototype,draw;
  try{
    const {RaceViewer2D}=await import('../public/js/race-viewer-2d.js');prototype=RaceViewer2D.prototype;draw=prototype.draw;prototype.draw=()=>{draws++;};
    const track={id:'tenku'},before=JSON.stringify(record),firstRoot=root();
    const first=new RaceViewer2D(firstRoot,record,track);first.dispose();resolveManifest();await flush();
    assert.equal(images.length,0);assert.equal(firstRoot.listeners.size,0);assert.equal(first.ready,false);
    const secondRoot=root(),second=new RaceViewer2D(secondRoot,record,track);await flush();
    assert.equal(images.length,baseImageCount,'one backdrop and two layers for each motion');second.dispose();
    images.forEach(image=>image.onload());await flush();
    assert.equal(second.images.size,0);assert.equal(second.backdropImage,undefined);assert.equal(draws,0);assert.equal(observers,0);assert.equal(frames.size,0);
    const thirdRoot=root(),third=new RaceViewer2D(thirdRoot,record,track);await flush();
    assert.equal(third.ready,true);assert.equal(third.status.hidden,true);assert.equal(fetches,1);assert.equal(images.length,baseImageCount);
    assert.equal(observers,1);assert.equal(frames.size,1);third.dispose();assert.equal(observers,0);assert.equal(frames.size,0);
    const blue={...record,replay:{runners:[{...runner,color:'blue'}]}},failedRoot=root(),failed=new RaceViewer2D(failedRoot,blue,track);await flush();
    assert.equal(images.length,baseImageCount+motionCount);const broken=images.find(image=>image.path.endsWith('/v5/body-blue.png'));
    broken.onerror();images.filter(image=>image!==broken&&image.path.endsWith('body-blue.png')).forEach(image=>image.onload());await flush();
    assert.equal(failed.ready,false);assert.equal(errors.filter(error=>error instanceof Error&&error.message==='body-blue.png').length,1);
    assert.match(failed.status.textContent,/レース観戦を開始できません/);assert.doesNotMatch(failed.status.textContent,/3D|選び直す/);failed.dispose();
    const retryRoot=root(),retry=new RaceViewer2D(retryRoot,blue,track);await flush();
    assert.equal(images.length,baseImageCount+motionCount+1,'only failed art is fetched again');images.at(-1).onload();await flush();
    assert.equal(retry.ready,true);retry.dispose();
    const red={...record,replay:{runners:[{...runner,color:'red'}]}},spurtRoot=root(),spurtFailed=new RaceViewer2D(spurtRoot,red,track);await flush();
    assert.equal(images.length,baseImageCount+2*motionCount+1);const brokenSpurt=images.find(image=>image.path.endsWith('/spurt/body-red.png'));
    brokenSpurt.onerror();images.filter(image=>image!==brokenSpurt&&image.path.endsWith('body-red.png')).forEach(image=>image.onload());await flush();
    assert.equal(spurtFailed.ready,false);assert.match(spurtFailed.status.textContent,/レース観戦を開始できません/);spurtFailed.dispose();
    const spurtRetryRoot=root(),spurtRetry=new RaceViewer2D(spurtRetryRoot,red,track);await flush();
    assert.equal(images.length,baseImageCount+2*motionCount+2,'failed last-spurt art retries without reloading other motions');images.at(-1).onload();await flush();
    assert.equal(spurtRetry.ready,true);spurtRetry.dispose();
    const green={...record,replay:{runners:[{...runner,color:'green'}]}},walkRoot=root(),walkFailed=new RaceViewer2D(walkRoot,green,track);await flush();
    assert.equal(images.length,baseImageCount+3*motionCount+2);const brokenWalk=images.find(image=>image.path.endsWith('/walk/body-green.png'));
    brokenWalk.onerror();images.filter(image=>image!==brokenWalk&&image.path.endsWith('body-green.png')).forEach(image=>image.onload());await flush();
    assert.equal(walkFailed.ready,false);walkFailed.dispose();
    const walkRetryRoot=root(),walkRetry=new RaceViewer2D(walkRetryRoot,green,track);await flush();
    assert.equal(images.length,baseImageCount+3*motionCount+3,'walking art retries independently');images.at(-1).onload();await flush();
    assert.equal(walkRetry.ready,true);walkRetry.dispose();
    for(const r of [firstRoot,secondRoot,thirdRoot,failedRoot,retryRoot,spurtRoot,spurtRetryRoot,walkRoot,walkRetryRoot])assert.equal(r.listeners.size,0);
    assert.equal(documentListeners.size,0);assert.equal(JSON.stringify(record),before);
  }finally{
    if(prototype)prototype.draw=draw;console.error=oldError;
    for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  }
});
