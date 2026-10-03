'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const R=require('../public/js/ranch-engine.js'),W=require('../public/js/world.js');
const RanchObservation=require('../public/js/ranch-observation.js');
const RanchPortraits={...require('../public/js/ranch-portraits.js'),hydrate(){}};
function boot(saved,failSave=false,failRead=false){
  const elements=new Map(),handlers={},windowHandlers={},queryLists={},storage=new Map(saved instanceof Map?saved:saved?[[R.SAVE_KEY,saved]]:[]);
  const node=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'',focus(){},dataset:{},classList:{toggle(){}},matches(){return false;}});return elements.get(key);};
  const ctx=vm.createContext({Ranch:R,RanchObservation,RanchPortraits,RanchWorld:W,console,document:{querySelector:node,querySelectorAll:selector=>queryLists[selector]||[],addEventListener:(k,f)=>handlers[k]=f,body:node('body'),activeElement:node('active')},localStorage:{getItem:k=>{if(typeof failRead==='function'?failRead(k):failRead)throw Error('denied');return storage.get(k)??null;},setItem:(k,v)=>{if(typeof failSave==='function'?failSave(k):failSave)throw Error('quota');storage.set(k,v);}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1;},window:{scrollTo(){},addEventListener:(k,f)=>windowHandlers[k]=f}});
  const source=fs.readFileSync(require.resolve('../public/js/ranch-ui.js'),'utf8');
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.hooks={get state(){return state},get modal(){return modal},get saveOK(){return saveOK},get page(){return page},setViewer(value){raceViewer=value},advance,render};})();`),ctx);
  return {h:ctx.hooks,node,storage,setQuery(selector,values){queryLists[selector]=values;},backdrop(){handlers.click({target:{classList:{contains:name=>name==='modal-backdrop'},closest:()=>null}});},inside(){handlers.click({target:{classList:{contains:()=>false},closest:()=>null}});},windowEvent(type,event={}){windowHandlers[type]?.(event);},click(action,data={}){handlers.click({target:{closest:()=>({dataset:{action,...data},disabled:false})}});},change(id,value,data={}){return handlers.change({target:{id,value,dataset:data,matches(){return false;}}});},key(key){handlers.keydown({key,preventDefault(){},target:{closest:()=>({dataset:{action:'sire-tab'}})}});}};
}
const html=g=>g.node('#app').innerHTML;
const slotKey=slot=>`${R.SAVE_KEY}-slot-${slot}`;
function purchase(g){g.click('buy-dialog',{id:g.h.state.sale[0]});g.click('buy-confirm',{id:g.h.state.sale[0]});g.click('ack');}

test('settings offer exactly five independent manual saves and disable empty loads',()=>{
  const g=boot();g.click('nav',{page:'settings'});
  assert.equal((html(g).match(/class="save-slot"/g)||[]).length,5);
  assert.equal((html(g).match(/data-action="slot-load"[^>]*disabled/g)||[]).length,5);
  const autosave=g.storage.get(R.SAVE_KEY);
  for(let slot=1;slot<=5;slot++){
    g.h.state.money=20000+slot;g.click('slot-save',{slot:String(slot)});
    const entry=JSON.parse(g.storage.get(slotKey(slot)));
    assert.ok(Number.isFinite(Date.parse(entry.savedAt)));
    assert.equal(R.deserializeState(entry.data).money,20000+slot);
    assert.match(html(g),/保存日時：/);
    assert.equal(g.storage.get(R.SAVE_KEY),autosave,'manual saves do not write autosave');
  }
  const restored=boot(g.storage);restored.click('nav',{page:'settings'});
  assert.equal((html(restored).match(/data-action="slot-load"[^>]*disabled/g)||[]).length,0);
  assert.match(html(restored),/20,001 G/);assert.match(html(restored),/20,005 G/);
});

test('overwriting a slot requires confirmation and cancellation preserves its snapshot',()=>{
  const g=boot();g.click('slot-save',{slot:'1'});const original=g.storage.get(slotKey(1));
  purchase(g);g.click('slot-save',{slot:'1'});
  assert.equal(g.h.modal.type,'slot-save');assert.equal(g.storage.get(slotKey(1)),original);
  assert.match(html(g),/上書きしますか/);g.click('close');
  g.click('slot-save-confirm');assert.equal(g.storage.get(slotKey(1)),original);
  g.click('slot-save',{slot:'1'});g.click('slot-save-confirm');
  assert.equal(g.h.modal,null);assert.equal(R.deserializeState(JSON.parse(g.storage.get(slotKey(1))).data).money,g.h.state.money);
  assert.notEqual(g.storage.get(slotKey(1)),original);
});

test('loading restores the full ranch and autosave while retaining all five snapshots through reset',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});g.click('breed-dialog');g.click('breed-confirm');g.click('ack');await g.h.advance(1);
  const snapshot=JSON.stringify(g.h.state);
  for(let slot=1;slot<=5;slot++)g.click('slot-save',{slot:String(slot)});
  const slots=Array.from({length:5},(_,i)=>g.storage.get(slotKey(i+1)));
  while(g.h.state.reports.length)g.click('ack');await g.h.advance(1);
  const current=JSON.stringify(g.h.state),autosave=g.storage.get(R.SAVE_KEY);
  g.click('slot-load',{slot:'1'});assert.equal(g.h.modal.type,'slot-load');
  assert.equal(JSON.stringify(g.h.state),current);assert.equal(g.storage.get(R.SAVE_KEY),autosave);
  g.click('close');g.click('slot-load-confirm');assert.equal(JSON.stringify(g.h.state),current);
  g.click('slot-load',{slot:'1'});g.click('slot-load-confirm');
  assert.equal(JSON.stringify(g.h.state),snapshot);assert.equal(g.h.page,'home');assert.equal(g.h.modal,null);
  assert.equal(JSON.stringify(R.deserializeState(g.storage.get(R.SAVE_KEY))),snapshot);
  const reloaded=boot(g.storage);assert.equal(JSON.stringify(reloaded.h.state),snapshot);
  g.click('reset-dialog');g.click('reset-confirm');assert.equal(g.h.state.stage,'buy');
  assert.deepEqual(Array.from({length:5},(_,i)=>g.storage.get(slotKey(i+1))),slots);
  g.click('slot-load',{slot:'5'});g.click('slot-load-confirm');assert.equal(JSON.stringify(g.h.state),snapshot);
});

test('corrupted slots remain protected until explicit overwrite and cannot replace the running ranch',()=>{
  const g=boot(),current=JSON.stringify(g.h.state),autosave=g.storage.get(R.SAVE_KEY);
  for(const raw of ['', '{bad',JSON.stringify({version:1,savedAt:new Date().toISOString(),data:'{}'})]){
    g.storage.set(slotKey(2),raw);g.click('nav',{page:'settings'});assert.match(html(g),/データを読み込めません/);
    g.click('slot-load',{slot:'2'});assert.equal(g.h.modal,null);assert.equal(JSON.stringify(g.h.state),current);assert.equal(g.storage.get(R.SAVE_KEY),autosave);
    g.click('slot-save',{slot:'2'});assert.equal(g.h.modal.type,'slot-save');assert.equal(g.storage.get(slotKey(2)),raw);
    g.click('close');assert.equal(g.storage.get(slotKey(2)),raw);
  }
  g.click('slot-save',{slot:'2'});g.click('slot-save-confirm');
  assert.ok(R.validState(R.deserializeState(JSON.parse(g.storage.get(slotKey(2))).data)));
  for(const slot of ['0','6','1.5','bad']){g.click('slot-save',{slot});assert.equal(g.storage.has(slotKey(slot)),false);}
});

test('failed slot writes and failed load autosaves preserve prior saves and current progress',()=>{
  let deny=false;const g=boot(undefined,key=>deny&&key===slotKey(1));
  g.click('slot-save',{slot:'1'});const raw=g.storage.get(slotKey(1));purchase(g);
  deny=true;g.click('slot-save',{slot:'1'});g.click('slot-save-confirm');
  assert.equal(g.storage.get(slotKey(1)),raw);assert.equal(g.h.modal.type,'slot-save');assert.match(html(g),/セーブできませんでした/);
  const failedLoad=boot(g.storage,key=>key===R.SAVE_KEY),current=JSON.stringify(failedLoad.h.state),autosave=failedLoad.storage.get(R.SAVE_KEY);
  failedLoad.click('slot-load',{slot:'1'});failedLoad.click('slot-load-confirm');
  assert.equal(JSON.stringify(failedLoad.h.state),current);assert.equal(failedLoad.storage.get(R.SAVE_KEY),autosave);
  assert.equal(failedLoad.h.modal.type,'slot-load');assert.match(html(failedLoad),/ロードを中止/);
});

test('unreadable storage disables manual saves and an intact slot recovers a corrupted autosave',()=>{
  const denied=boot(undefined,false,key=>key===slotKey(1));denied.click('nav',{page:'settings'});
  assert.match(html(denied),/data-action="slot-save" data-slot="1"[^>]*disabled/);
  denied.click('slot-save',{slot:'1'});assert.equal(denied.storage.has(slotKey(1)),false);
  const g=boot();purchase(g);g.click('slot-save',{slot:'3'});g.storage.set(R.SAVE_KEY,'{bad');
  const recovered=boot(g.storage);assert.equal(recovered.storage.get(R.SAVE_KEY),'{bad');
  recovered.click('slot-load',{slot:'3'});recovered.click('slot-load-confirm');
  assert.equal(recovered.h.saveOK,true);assert.equal(JSON.stringify(recovered.h.state),JSON.stringify(g.h.state));
  assert.ok(R.validState(R.deserializeState(recovered.storage.get(R.SAVE_KEY))));
});

test('slot confirmation detects another tab changing its data instead of overwriting or loading it',()=>{
  const g=boot();g.click('slot-save',{slot:'1'});purchase(g);g.click('slot-save',{slot:'2'});
  const original=g.storage.get(slotKey(1)),updated=g.storage.get(slotKey(2));
  for(const action of ['slot-save','slot-load']){
    g.storage.set(slotKey(1),original);g.click(action,{slot:'1'});g.storage.set(slotKey(1),updated);
    const current=JSON.stringify(g.h.state);g.click(`${action}-confirm`);
    assert.equal(g.storage.get(slotKey(1)),updated);assert.equal(JSON.stringify(g.h.state),current);
    assert.match(html(g),/別のタブで更新されました/);g.click('close');
  }
  g.click('nav',{page:'settings'});g.storage.delete(slotKey(1));g.windowEvent('storage',{key:slotKey(1)});
  assert.match(html(g),/data-action="slot-load" data-slot="1"[^>]*disabled/);
  g.click('slot-save',{slot:'1'});assert.ok(g.storage.has(slotKey(1)),'slot updates do not block the running ranch');
});

test('list and status portraits follow calendar age and show inherited crest only on adults',()=>{
  const g=boot(),b=R.own(g.h.state)[0];b.color='blue';b.crest='rainbow';
  for(const [age,stage] of [[0,'chick'],[1,'yearling'],[2,'adult']]){
    b.birthYear=R.date(g.h.state.week).year-age;
    g.click('nav',{page:'birds'});
    assert.match(html(g),new RegExp(`data-portrait-stage="${stage}" data-portrait-color="blue" data-portrait-crest="${age<2?'blue':'rainbow'}"`));
    g.click('detail',{id:b.id});
    assert.match(html(g),new RegExp(`<div class="detail-cover blue"><span[^>]+data-portrait-stage="${stage}"`));g.click('close');
  }
});

test('race results explain observed pack behavior, retain old records and distinguish nonfinishers',()=>{
  const g=boot();purchase(g);const b=R.own(g.h.state)[0];
  const r={week:9,name:'試走',distance:1600,surface:'turf',rank:1,reward:100,
    field:[{id:b.id,name:b.name,time:100,finished:true},{id:'rival',name:'相手',time:900,finished:false}],
    interactions:{crowdedSeconds:5,duelSeconds:12,savingSeconds:3,extraEnergy:30,laneChanges:3,blockedSeconds:2}};
  b.records.push(r);g.click('result',{id:b.id,week:'9'});
  assert.match(html(g),/羽混みの中を走る場面/);assert.match(html(g),/近くの相手と競り合い/);
  assert.match(html(g),/余力を温存しました/);assert.match(html(g),/未完走/);assert.match(html(g),/1:40.00/);
  assert.match(html(g),/周囲を見ながら進路を変えました/);assert.match(html(g),/前の羽に進路を塞がれ/);
  delete r.interactions;g.h.render();
  assert.doesNotMatch(html(g),/羽混みの中を走る場面|余力を温存しました/);assert.match(html(g),/1:40.00/);
});

test('rename inputs explain and enforce the same katakana limits as registration',()=>{
  const g=boot(),b=R.own(g.h.state)[0],original=b.name;
  g.click('detail',{id:b.id});assert.match(html(g),/minlength="2" maxlength="9" pattern="\[ァ-ヺー\]\{2,9\}"/);
  g.node('#bird-name').value='漢字123';g.click('rename',{id:b.id});assert.equal(b.name,original);
  g.node('#bird-name').value='アオバ';g.click('rename',{id:b.id});assert.equal(b.name,'アオバ');
});

test('weekly reports, career results and old letters open a replay without changing the ranch',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});g.click('breed-dialog');g.click('breed-confirm');g.click('ack');await g.h.advance(1);
  const b=R.own(g.h.state).find(b=>b.records.length),r=b.records.at(-1);
  while(g.h.state.reports[0]?.type!=='weekly')g.click('ack');
  assert.match(html(g),/[23]Dでレースを見る/);const before=JSON.stringify(g.h.state);
  g.click('watch-race',{id:b.id,week:String(r.week)});
  assert.equal(g.h.modal.type,'replay');assert.match(html(g),/パドック/);assert.match(html(g),/実況のラミア/);assert.match(html(g),/解説のサハギン/);assert.match(html(g),/1× リアルタイム/);
  assert.match(html(g),/data-phase="award"/);assert.equal(JSON.stringify(g.h.state),before);
  g.click('close');assert.equal(g.h.modal.type,'reports');assert.equal(JSON.stringify(g.h.state),before);
  g.click('detail',{id:b.id});assert.match(html(g),/結果・観戦/);g.click('result',{id:b.id,week:String(r.week)});assert.match(html(g),/[23]Dでレースを見る/);
  g.click('close');g.click('ack');g.click('nav',{page:'notebook'});g.click('notebook-tab',{tab:'letters'});assert.match(html(g),/[23]Dでレースを見る/);
  const restored=boot(g.storage.get(R.SAVE_KEY));restored.click('watch-race',{id:b.id,week:String(r.week)});assert.equal(restored.h.modal.type,'replay');
});

test('losing races omit the podium chapter and pre-feature records explain unavailable playback',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});g.click('breed-dialog');g.click('breed-confirm');g.click('ack');await g.h.advance(1);
  const b=R.own(g.h.state).find(b=>b.records.length),r=b.records.at(-1);r.rank=2;
  g.click('watch-race',{id:b.id,week:String(r.week)});assert.doesNotMatch(html(g),/data-phase="award"/);
  assert.doesNotMatch(html(g),/横方向の進路が保存されていない/);
  g.click('close');r.replay.version=1;r.replay.runners.forEach(runner=>runner.samples=runner.samples.map(sample=>sample.slice(0,4)));
  const legacy=JSON.stringify(g.h.state);g.click('watch-race',{id:b.id,week:String(r.week)});
  assert.match(html(g),/横方向の進路が保存されていない/);assert.equal(JSON.stringify(g.h.state),legacy);
  g.click('close');delete r.replay;g.click('result',{id:b.id,week:String(r.week)});assert.match(html(g),/走行データがありません/);assert.doesNotMatch(html(g),/data-action="watch-race"/);
});

test('all venue records open 2D and can switch renderer without changing a saved race',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});g.click('breed-dialog');g.click('breed-confirm');g.click('ack');await g.h.advance(1);
  const b=R.own(g.h.state).find(b=>b.records.length),r=b.records.at(-1);r.trackId='tenku';
  g.click('result',{id:b.id,week:String(r.week)});assert.match(html(g),/2Dでレースを見る/);
  const before=JSON.stringify(g.h.state);g.click('watch-race',{id:b.id,week:String(r.week)});
  assert.doesNotMatch(html(g),/2D 試作|data-viewer="section"/);assert.match(html(g),/data-renderer="2d" aria-pressed="true"/);
  assert.match(html(g),/data-viewer-pitch/);assert.match(html(g),/value="2" selected/);
  g.click('watch-mode',{renderer:'3d'});assert.doesNotMatch(html(g),/data-viewer-pitch/);
  assert.match(html(g),/data-renderer="3d" aria-pressed="true"/);assert.equal(JSON.stringify(g.h.state),before);
  g.click('watch-mode',{renderer:'2d'});assert.match(html(g),/data-viewer-pitch/);assert.equal(JSON.stringify(g.h.state),before);
  for(const trackId of ['oukyu','sunahama','haikou','mitsurin','iseki']){
    g.click('close');r.trackId=trackId;r.surface=['mitsurin','iseki'].includes(trackId)?'turf':'dirt';const saved=JSON.stringify(g.h.state);
    g.click('watch-race',{id:b.id,week:String(r.week)});
    assert.match(html(g),/data-renderer="2d" aria-pressed="true"/);assert.match(html(g),/data-viewer-pitch/);
    assert.equal(JSON.stringify(g.h.state),saved);
  }
  g.click('close');delete r.trackId;g.click('watch-race',{id:b.id,week:String(r.week)});
  assert.match(html(g),/data-renderer="2d" aria-pressed="true"/,'records without venue metadata use the 2D fallback');
});

test('renderer changes and page navigation retain playback choices, dispose the viewer and never save the ranch',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});g.click('breed-dialog');g.click('breed-confirm');g.click('ack');await g.h.advance(1);
  const b=R.own(g.h.state).find(b=>b.records.length),r=b.records.at(-1);
  g.click('watch-race',{id:b.id,week:String(r.week)});
  const before=JSON.stringify(g.h.state),saved=g.storage.get(R.SAVE_KEY),focusId=r.replay.runners[1].id;
  const playback={time:51.25,paused:true,rate:4,focusId,cameraMode:'follow',speaking:true,pitch:1.5};
  let disposed=0;g.h.setViewer({ready:true,snapshot:()=>playback,dispose(){disposed++;}});
  g.click('watch-mode',{renderer:'2d'});assert.equal(disposed,0,'the active renderer is not restarted');
  g.click('watch-mode',{renderer:'3d'});assert.equal(disposed,1);
  assert.deepEqual(JSON.parse(JSON.stringify(g.h.modal.playback)),playback);
  assert.match(html(g),/value="4" selected/);assert.match(html(g),new RegExp(`value="${focusId}" selected`));
  assert.match(html(g),/data-camera="follow" aria-pressed="true"/);
  const second={...playback,time:52,rate:2,cameraMode:'finish'};delete second.pitch;
  g.h.setViewer({ready:true,snapshot:()=>second,dispose(){disposed++;}});
  g.click('watch-mode',{renderer:'2d'});assert.equal(disposed,2);
  assert.equal(g.h.modal.playback.pitch,1.5);assert.equal(g.h.modal.playback.time,52);
  assert.match(html(g),/value="1.5" selected/);assert.match(html(g),/data-camera="finish" aria-pressed="true"/);
  g.h.setViewer({snapshot:()=>({...playback,time:65}),dispose(){disposed++;}});
  g.windowEvent('pagehide');assert.equal(disposed,3);assert.equal(g.h.modal.playback.time,65);
  g.windowEvent('pageshow',{persisted:true});assert.equal(g.h.modal.type,'replay');
  assert.equal(JSON.stringify(g.h.state),before);assert.equal(g.storage.get(R.SAVE_KEY),saved);
});
test('new UI exposes one tutorial action, hides numeric traits and renders every deliberate destination',()=>{
  const g=boot();assert.match(html(g),/牧場の、はじめの日/);assert.match(html(g),/繁殖牝羽セールへ/);assert.doesNotMatch(html(g),/最高速|遺伝品質/);
  for(const page of ['birds','market','breed','facilities','notebook','settings']){g.click('nav',{page});assert.equal(g.h.page,page);assert.match(html(g),/<h1>/);assert.doesNotMatch(html(g),/class="notice"/);}
});
test('purchase and breeding are reviewable before payment, with a clear route back to the weekly loop',async()=>{
  const g=boot(),before=g.h.state.money;g.click('nav',{page:'market'});g.click('buy-dialog',{id:g.h.state.sale[0]});assert.equal(g.h.state.money,before);assert.match(html(g),/17,200 G/);g.click('close');assert.equal(g.h.state.money,before);
  purchase(g);g.click('nav',{page:'breed'});g.click('breed-dialog');assert.match(html(g),/600 G/);g.click('breed-confirm');assert.equal(g.h.state.stage,'grow');g.click('ack');
  await g.h.advance(4);assert.equal(g.h.state.week,13,'monthly letters and first wins are included without stopping the four-week advance');assert.equal(g.h.modal.type,'reports');assert.equal(g.h.state.reports.filter(r=>r.type==='weekly').length,4);assert.ok(g.h.state.reports.some(r=>r.type==='monthly'));assert.ok(g.h.state.reports.some(r=>r.type==='birth'));assert.ok(R.own(g.h.state).some(b=>b.role==='young'));assert.match(html(g),/4週のダイジェスト/);
  const restored=boot(g.storage.get(R.SAVE_KEY));assert.equal(restored.h.state.week,13);assert.deepEqual(JSON.parse(JSON.stringify(restored.h.state)),JSON.parse(JSON.stringify(g.h.state)));
});
test('reset cancellation preserves everything; confirmation returns to March with the automated racing filly',()=>{
  const g=boot();purchase(g);const original=JSON.stringify(g.h.state);g.click('nav',{page:'settings'});g.click('reset-dialog');assert.equal(g.h.modal.type,'reset');assert.match(html(g),/取り消せません/);assert.match(html(g),/data-autofocus/);assert.equal(JSON.stringify(g.h.state),original);
  g.click('close');assert.equal(JSON.stringify(g.h.state),original);g.click('reset-confirm');assert.equal(JSON.stringify(g.h.state),original,'cannot reset without the confirmation dialog');
  g.click('reset-dialog');g.click('reset-confirm');assert.equal(g.h.state.week,9);assert.equal(g.h.state.money,20000);assert.equal(R.own(g.h.state).length,1);assert.equal(g.h.state.reports.length,0);assert.equal(g.h.state.stage,'buy');
  const reloaded=boot(g.storage.get(R.SAVE_KEY));assert.equal(R.own(reloaded.h.state).length,1);assert.equal(reloaded.h.state.week,9);
});
test('details disclose ratings, racing traits, all genetic loci and current numbers at four facility stages',()=>{
  const g=boot(),b=R.own(g.h.state)[0];g.click('detail',{id:b.id});
  const status=()=>html(g).match(/<section class="research status-record">([\s\S]*?)<\/section>/)[1];
  assert.match(status(),/現在の身体能力|走る意欲|最高速/);assert.match(html(g),/ステータスへの遺伝効果/);
  assert.doesNotMatch(status(),/data-score|<meter/);assert.doesNotMatch(html(g),/得意羽場：|遺伝の座位情報|金因子/);
  g.h.state.facilities.lab=1;g.h.render();
  assert.match(html(g),/得意羽場：|成長と加齢の遺伝/);assert.doesNotMatch(html(g),/data-score|<meter|<summary>遺伝の座位情報|金因子/);
  for(const monument of ['museum','statue']){
    g.h.state.facilities[monument]=1;g.h.render();
    assert.match(html(g),/遺伝の座位情報（全因子）|座位 32|金因子|潜性の欠点の全座位/);
    assert.doesNotMatch(status(),/data-score|<meter|成熟したときの伸びしろ/);
    g.h.state.facilities[monument]=0;
  }
  g.h.state.facilities.museum=1;g.h.state.facilities.statue=1;g.h.render();
  assert.match(status(),/data-score="power"|成熟したときの伸びしろ|脚の負担/);assert.doesNotMatch(html(g),/公開段階|研究所を建てると|遺伝評価：|評価：X|（合算）/);
});
test('zero and one year olds show development speed ratings; two year olds show current abilities',()=>{
  const g=boot(),s=g.h.state,b=R.createBird(s,{name:'コワカバ'});
  const status=()=>html(g).match(/<section class="research status-record">([\s\S]*?)<\/section>/)[1];
  for(const years of [0,1]){
    b.birthYear=R.date(s.week).year-years;g.click('detail',{id:b.id});
    assert.match(status(),/成長率|早い成長|遅い衰え始め|緩やかな衰え/);
    assert.doesNotMatch(status(),/現在の身体能力|data-trait="power"|data-score|<meter/);
  }
  b.birthYear=R.date(s.week).year-2;g.h.render();
  assert.match(status(),/現在のステータス|data-trait="power"/);assert.doesNotMatch(status(),/成長率/);
});
test('both breeding parents show aggregate genetic ratings before building research',()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  assert.equal((html(g).match(/<summary>繁殖担当の遺伝情報/g)||[]).length,2);
  assert.match(html(g),/ステータスへの遺伝効果/);assert.doesNotMatch(html(g),/data-score|<meter|遺伝の座位情報/);
  g.h.state.facilities.lab=1;g.h.state.facilities.museum=1;g.h.render();
  assert.equal((html(g).match(/遺伝の座位情報（全因子）/g)||[]).length,2);
});
test('details, sale and parents show only aggregate genetics and retain the numeric gate',()=>{
  const g=boot(),b=R.own(g.h.state)[0];
  const check=()=>{
    assert.match(html(g),/ステータスへの遺伝効果/);
    assert.doesNotMatch(html(g),/基礎遺伝|遺伝補正|data-genetic-part|data-genetic-value/);
    assert.doesNotMatch(html(g),/data-score/);
  };
  g.click('detail',{id:b.id});check();g.click('close');
  g.click('nav',{page:'market'});check();
  assert.equal((html(g).match(/<details class="research genetics">/g)||[]).length,g.h.state.sale.length);
  assert.doesNotMatch(html(g),/<details class="research genetics" open>/);
  purchase(g);g.click('nav',{page:'breed'});check();
  g.h.state.facilities.lab=1;g.h.state.facilities.statue=1;g.h.render();
  assert.match(html(g),/data-score="power"/);assert.doesNotMatch(html(g),/data-genetic-part/);
});
test('legacy upgraded labs keep saved levels but cannot bypass the monument gates',()=>{
  const s=R.initial();s.facilities.lab=3;
  const g=boot(R.serializeState(s)),b=R.own(g.h.state)[0];g.click('detail',{id:b.id});
  assert.equal(g.h.state.facilities.lab,3);assert.equal(R.labLevel(g.h.state),1);
  assert.match(html(g),/得意羽場：/);assert.doesNotMatch(html(g),/data-score|<summary>遺伝の座位情報/);
});
test('bad save stays intact until explicit reset; storage failure is visible',()=>{
  const g=boot('{bad json');assert.equal(g.storage.get(R.SAVE_KEY),'{bad json');assert.equal(g.h.saveOK,false);assert.match(html(g),/元のデータを保護/);
  g.click('reset-dialog');g.click('reset-confirm');assert.ok(R.validState(R.deserializeState(g.storage.get(R.SAVE_KEY))));assert.equal(g.h.saveOK,true);
  const unavailable=boot(undefined,true);assert.equal(unavailable.h.saveOK,false);assert.match(html(unavailable),/自動保存ができません/);
});
test('bird names are escaped in dialogue and rendered detail content',()=>{
  const g=boot();purchase(g);const b=R.own(g.h.state)[0];b.name='<img src=x>';g.click('detail',{id:b.id});assert.match(html(g),/&lt;img src=x&gt;/);assert.doesNotMatch(html(g),/<img src=x>/);
});

const listedSires=g=>[...html(g).matchAll(/data-action="select-sire" data-id="([^"]+)"/g)].map(m=>R.bird(g.h.state,m[1]));
const selectedSire=g=>html(g).match(/data-action="select-sire" data-id="([^"]+)" aria-pressed="true"/)?.[1];

test('breeding prioritizes the action and parent genetics while omitting inactive crosses and rating explanations',()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  const s=g.h.state,dam=R.own(s).find(b=>b.role==='mare');
  const sire=R.sires(s).find(b=>b.kind==='root'&&!R.breedingCrosses(s,b,dam).length);
  g.click('select-sire',{id:sire.id});
  assert.doesNotMatch(html(g),/cross-preview|対象となるクロス|公開段階|研究所を建てると|記念館か銅像を建てると|遺伝評価：|評価：X|（合算）/);
  assert.ok(html(g).indexOf('data-action="breed-dialog"')<html(g).indexOf('class="breeding-layout"'));
  for(const parent of html(g).split('<section class="paper breeding-parent">').slice(1)){
    assert.ok(parent.indexOf('ステータスへの遺伝効果')<parent.indexOf('class="parent-pair"'));
    assert.ok(parent.indexOf('class="parent-pair"')<parent.indexOf('重賞成績'));
    assert.ok(parent.indexOf('重賞成績')<parent.indexOf('持ち味・競走情報'));
  }
  g.click('breed-dialog');assert.equal(g.h.modal.type,'breed');
  assert.doesNotMatch(html(g),/cross-preview/);
});

test('the sire picker stays open while browsing and closes on selection',()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  g.click('open-sire-picker');assert.equal(g.node('#sire-picker').open,true);
  g.click('sire-tab',{tab:'public'});assert.equal(g.node('#sire-picker').open,true);
  g.click('select-sire',{id:listedSires(g)[1].id});assert.equal(g.node('#sire-picker').open,false);
});

test('mares show the current or latest mate and all offspring with their actual fathers',()=>{
  const g=boot();purchase(g);const s=g.h.state,dam=R.own(s).find(b=>b.role==='mare'),[first,last,current]=R.sires(s);
  const oldest=R.createBird(s,{name:'コハネ',bornWeek:1,owner:'public'},[first,dam]);
  const youngest=R.createBird(s,{name:'ワカバ',bornWeek:5},[last,dam]);
  const family=()=>html(g).match(/<section class="breeding-family">([\s\S]*?)<\/section>/)[1];
  g.click('nav',{page:'breed'});
  assert.match(family(),/最新の産駒の父/);assert.match(family(),/産駒 2羽/);
  assert.ok(family().indexOf(`data-id="${last.id}"`)<family().indexOf('産駒 2羽'));
  assert.ok(family().indexOf(`data-id="${youngest.id}"`)<family().indexOf(`data-id="${oldest.id}"`));
  assert.match(family(),new RegExp(`data-id="${first.id}"`));
  dam.pregnancy={sireId:current.id,due:s.week+R.GESTATION};g.h.render();
  assert.ok(family().indexOf(`data-id="${current.id}"`)<family().indexOf('産駒 2羽'));
  assert.match(family(),/出産予定/);assert.doesNotMatch(family(),/最新の産駒の父/);
  g.click('detail',{id:dam.id});assert.match(html(g),/配合相手・産駒/);
  g.click('detail',{id:youngest.id});assert.equal(g.h.modal.id,youngest.id);
});

test('public sire search combines text, winning route and ability order with visible parent hints',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});g.click('sire-tab',{tab:'public'});
  const farm=R.searchSires(g.h.state,{route:'dirt'})[0].farm;
  g.node('#sire-query').value=farm;g.click('search-sires');
  await g.change('sire-route','dirt');await g.change('sire-sort','power');
  const candidates=listedSires(g);assert.ok(candidates.length);
  assert.ok(candidates.every(b=>b.farm===farm));
  assert.ok(candidates.every((b,i)=>!i||candidates[i-1].potential.power>=b.potential.power));
  assert.match(html(g),/長所/);assert.match(html(g),/短所/);assert.match(html(g),/重賞成績/);assert.match(html(g),/乱数の下限/);
  g.node('#sire-query').value='見つからない名前';g.click('search-sires');
  assert.equal(listedSires(g).length,0);assert.match(html(g),/data-action="breed-dialog" disabled/);
});

test('sire tabs separate source, other ranch, founder and home candidates and remember selection',()=>{
  const g=boot();purchase(g);
  const base=R.sires(g.h.state)[0];
  for(const [kind,name] of [['founder','私の始祖'],['home','私の種牡羽']])g.h.state.birds.push({...JSON.parse(JSON.stringify(base)),id:`bird-${g.h.state.serial++}`,kind,owner:'player',name});
  g.click('nav',{page:'breed'});
  assert.equal(listedSires(g).length,32);assert.ok(listedSires(g).every(b=>b.kind==='root'));
  const selected=listedSires(g)[7];g.click('select-sire',{id:selected.id});
  g.click('sire-tab',{tab:'public'});assert.equal(listedSires(g).length,50);assert.ok(listedSires(g).every(b=>b.owner==='public'));
  g.h.state.money=100000000;const publicSire=selectedSire(g);g.click('breed-dialog');assert.match(html(g),new RegExp(R.bird(g.h.state,publicSire).name));g.click('close');
  g.click('sire-tab',{tab:'founder'});assert.deepEqual(listedSires(g).map(b=>b.name),['私の始祖']);assert.match(html(g),/無料/);
  g.click('sire-tab',{tab:'home'});assert.deepEqual(listedSires(g).map(b=>b.name),['私の種牡羽']);
  g.click('sire-tab',{tab:'root'});assert.equal(selectedSire(g),selected.id);
  g.click('sire-tab',{tab:'public'});assert.equal(selectedSire(g),publicSire);
  const mother=R.own(g.h.state).find(b=>b.role==='mare'),before=g.h.state.money;
  g.click('breed-dialog');g.click('breed-confirm');assert.equal(mother.pregnancy.sireId,publicSire);assert.equal(g.h.state.money,before-R.breedFee(R.bird(g.h.state,publicSire)));
});

test('empty sire tabs clear hidden choices, explain availability and disable breeding',()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  for(const tab of ['founder','home']){
    g.click('sire-tab',{tab});assert.equal(listedSires(g).length,0);assert.equal(selectedSire(g),undefined);
    assert.match(html(g),/data-action="breed-dialog" disabled/);assert.match(html(g),/まだいません/);
    g.click('breed-dialog');assert.equal(g.h.modal,null);assert.equal(R.own(g.h.state)[0].pregnancy,null);
  }
  g.click('sire-tab',{tab:'root'});assert.equal(listedSires(g).length,32);
});

test('strength filter exposes four donors per inherited trait and tabs support arrow navigation',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  for(const trait of [...R.Mapping.ABILITIES.map(a=>a.key),...Object.keys(R.MANAGEMENT),...Object.keys(R.PERSONALITY)]){
    await g.change('root-trait',trait);assert.equal(listedSires(g).length,4);
    assert.ok(listedSires(g).every(b=>{const p=R.ROOTS.find(p=>p.lineage===b.lineage);return p.primary===trait||p.secondary===trait;}));
    assert.match(html(g),/4 \/ 32羽/);assert.doesNotMatch(html(g),/遺伝品質/);
  }
  g.key('ArrowRight');assert.ok(listedSires(g).every(b=>b.owner==='public'));assert.equal(listedSires(g).length,50);
  g.key('End');assert.match(html(g),/id="sire-tab-home"[^>]*aria-selected="true"/);
  g.key('ArrowRight');assert.match(html(g),/id="sire-tab-root"[^>]*aria-selected="true"/);assert.equal(listedSires(g).length,4);
  g.key('ArrowLeft');assert.match(html(g),/id="sire-tab-home"[^>]*aria-selected="true"/);
  g.key('Home');await g.change('root-trait','');assert.equal(listedSires(g).length,32);
});

test('loading an earlier v4 catalog upgrades to 32 sources without resetting the ranch',()=>{
  const s=R.initial();R.buy(s,s.sale[0]);delete s.rootCatalogVersion;
  s.birds=s.birds.filter(b=>b.kind!=='root'||Number(b.lineage.split('-')[1])<4);
  for(const b of s.birds)b.parents=b.parents.map(id=>R.bird(s,id)?id:null);
  const original=JSON.parse(JSON.stringify(s)),g=boot(JSON.stringify(s));
  assert.equal(R.sires(g.h.state).filter(b=>b.kind==='root').length,32);assert.equal(g.h.state.money,original.money);
  assert.equal(JSON.stringify(R.own(g.h.state)),JSON.stringify(R.own(original)));
  assert.ok(R.validState(R.deserializeState(g.storage.get(R.SAVE_KEY))));
});

test('new surface and growth strengths can filter sources while gold alleles remain hidden',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  for(const key of Object.keys(R.Genetics.APTITUDES)){
    await g.change('root-trait',key);assert.equal(listedSires(g).length,16);
    assert.ok(listedSires(g).every(b=>R.Genetics.mean(b.genome.traits.aptitude[key])===1));
  }
  for(const key of Object.keys(R.Genetics.DEVELOPMENT)){
    await g.change('root-trait',key);assert.equal(listedSires(g).length,8);
    assert.ok(listedSires(g).every(b=>R.Genetics.mean(b.genome.traits.development[key])===1));
  }
  await g.change('root-trait','');assert.match(html(g),/羽色：金 \/ 額羽：青/);
  assert.doesNotMatch(html(g),/金因子|G\/g|1\/2000/);
});

test('body and crest render separately; genetics and ground appear after research and factors after a monument',()=>{
  const g=boot();purchase(g);const b=R.own(g.h.state)[0];
  b.genome.traits.body=['black','white'];b.color='black';b.genome.traits.crest='rainbow';b.crest='rainbow';
  g.click('detail',{id:b.id});assert.match(html(g),/羽色：黒 \/ 額羽：虹/);
  assert.match(html(g),/data-portrait-color="black" data-portrait-crest="rainbow"/);assert.doesNotMatch(html(g),/成長と加齢の遺伝|<h3>羽場適性/);
  g.h.state.facilities.lab=1;g.h.render();assert.match(html(g),/<h3>羽場適性/);assert.doesNotMatch(html(g),/min="50" max="150"|成熟の目安|金因子/);
  g.h.state.facilities.museum=1;g.h.render();assert.match(html(g),/成熟の目安/);assert.match(html(g),/衰え始め/);assert.match(html(g),/羽色因子/);assert.match(html(g),/金因子/);
});

test('pedigree and cross preview show a source backcross but prohibit it without charging',()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  const s=g.h.state,dam=R.bird(s,s.sale[0]),sire=R.bird(s,dam.parents[0]),money=s.money,rng=s.rng;
  g.click('select-sire',{id:sire.id});
  assert.match(html(g),/父と母、その先の5代血統/);assert.match(html(g),/母：不明/);
  assert.match(html(g),/1 × 2/);assert.match(html(g),/75%/);assert.match(html(g),/37.5%/);
  assert.match(html(g),/危険なため、配合できません/);assert.match(html(g),/2×3（37.5%）まで/);
  assert.match(html(g),/data-action="breed-dialog" disabled/);
  g.click('breed-dialog');assert.equal(g.h.modal,null);assert.equal(s.money,money);assert.equal(s.rng,rng);assert.equal(dam.pregnancy,null);
  g.click('detail',{id:sire.id});assert.doesNotMatch(html(g),/id="bird-name"/);
  s.facilities.lab=1;s.facilities.statue=1;g.h.render();assert.match(html(g),/潜性の欠点因子/);assert.match(html(g),/aa 4座/);assert.match(html(g),/Aa 4座/);
});

test('home always links to the mare sale; off-season breeding is greyed out while its forecast stays visible',()=>{
  const g=boot();purchase(g);g.h.state.week=17;g.click('nav',{page:'home'});
  assert.match(html(g),/class="home-quick-links"[\s\S]*data-page="market"/);assert.match(html(g),/次の開催は2月〜3月/);
  g.click('nav',{page:'breed'});assert.match(html(g),/breeding-season closed|breeding-confirm unavailable/);
  assert.match(html(g),/data-action="breed-dialog" disabled/);assert.match(html(g),/生まれる子の遺伝効果|data-preview-trait="power"/);
  const before=JSON.stringify(g.h.state);g.click('breed-dialog');assert.equal(g.h.modal,null);assert.equal(JSON.stringify(g.h.state),before);
});

test('breeding forecasts use five-level ranges and update when either parent changes without consuming randomness',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});const s=g.h.state,rng=s.rng;
  const forecast=()=>html(g).match(/<section class="paper offspring-preview">([\s\S]*?)<\/section>/)[1];
  assert.equal((forecast().match(/data-preview-trait=/g)||[]).length,16);assert.doesNotMatch(forecast(),/data-score|<meter/);
  const before=forecast();g.click('select-sire',{id:R.sires(s)[1].id});assert.notEqual(forecast(),before);assert.equal(s.rng,rng);
  g.click('nav',{page:'market'});g.click('buy-dialog',{id:s.sale[1]});g.click('buy-confirm',{id:s.sale[1]});g.click('nav',{page:'breed'});
  const first=forecast();await g.change('dam-choice',s.sale[1]);assert.notEqual(forecast(),first);assert.equal(s.rng,rng);
});

test('breeding forecasts disclose aptitudes and growth with the lab and numeric ranges with either monument',()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});const s=g.h.state;
  const forecast=()=>html(g).match(/<section class="paper offspring-preview">([\s\S]*?)<\/section>/)[1];
  const traits={...R.Genetics.APTITUDES,...R.Genetics.DEVELOPMENT};
  for(const lab of [0,1,3])for(const museum of [0,1])for(const statue of [0,1]){
    Object.assign(s.facilities,{lab,museum,statue});const before=JSON.stringify(s);g.h.render();
    assert.equal(JSON.stringify(s),before);
    const output=forecast();
    assert.equal((output.match(/data-preview-trait=/g)||[]).length,lab?23:16);
    for(const [key,label] of Object.entries(traits)){
      const row=new RegExp(`data-preview-trait="${key}"><span>${label}</span>`);
      if(lab)assert.match(output,row);else assert.doesNotMatch(output,row);
    }
    if(lab&&(museum||statue)){
      assert.equal((output.match(/data-score=/g)||[]).length,23);
      const dam=R.own(s).find(b=>b.role==='mare'),sire=R.bird(s,selectedSire(g));
      const ranges=R.breedingPreview(s,sire,dam);
      for(const [key,range] of Object.entries(ranges)){
        const min=Math.floor(range.min),max=Math.floor(range.max);
        assert.ok(output.includes(`<small data-score="${key}">${min===max?min:`${min}〜${max}`}</small>`),key);
      }
    }else assert.doesNotMatch(output,/data-score/);
  }
});

test('hatch comparisons appear in reports and saved letters, with details gated by research stages',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});g.click('breed-dialog');g.click('breed-confirm');g.click('ack');
  await g.h.advance(4);
  const s=g.h.state,report=s.reports.find(r=>r.type==='birth');assert.ok(report.geneticLottery);
  const comparison=()=>html(g).match(/<section class="birth-genetics">([\s\S]*?)<\/section>/)[1];
  for(const lab of [0,1,3])for(const museum of [0,1])for(const statue of [0,1]){
    Object.assign(s.facilities,{lab,museum,statue});const before=JSON.stringify(s);g.h.render();
    assert.equal(JSON.stringify(s),before);
    const output=comparison(),level=R.labLevel(s);
    assert.equal((output.match(/data-birth-trait=/g)||[]).length,lab?23:16);
    assert.equal((output.match(/data-birth-score=/g)||[]).length,level>=2?23:0);
    assert.equal((output.match(/class="birth-position"/g)||[]).length,level===3?23:0);
    assert.match(output,/結果 \/ 可能範囲/);
    for(const [key,row] of Object.entries(report.geneticLottery)){
      if(level>=2)assert.ok(output.includes(`<small data-birth-score="${key}">${Math.floor(row.value)} / ${Math.floor(row.min)}～${Math.floor(row.max)}</small>`),key);
    }
  }
  g.click('close');g.click('nav',{page:'notebook'});g.click('notebook-tab',{tab:'letters'});
  const original=comparison();
  const restored=boot(g.storage);restored.click('nav',{page:'notebook'});restored.click('notebook-tab',{tab:'letters'});
  assert.equal(restored.node('#app').innerHTML.match(/<section class="birth-genetics">([\s\S]*?)<\/section>/)[1],original);
  assert.deepEqual(restored.h.state.journal.find(r=>r.id===report.id).geneticLottery,report.geneticLottery);
});

test('bird schedule changes save immediately, preserve the detail modal, and reload with the same chosen menu',async()=>{
  const g=boot(),b=R.own(g.h.state)[0];g.click('detail',{id:b.id});assert.equal((html(g).match(/data-plan-week=/g)||[]).length,8);
  await g.change('', 'training:power',{scheduleId:b.id,week:String(g.h.state.week)});
  assert.equal(g.h.modal.type,'detail');assert.equal(b.schedule[g.h.state.week].menu,'power');assert.match(html(g),/指定した予定/);
  const restored=boot(g.storage.get(R.SAVE_KEY));assert.equal(R.bird(restored.h.state,b.id).schedule[g.h.state.week].menu,'power');
  await g.change('', 'auto',{scheduleId:b.id,week:String(g.h.state.week)});assert.equal(b.schedule[g.h.state.week],undefined);
});

test('report overlays keep the chosen page, preserve all four weekly letters and support repeated advancing',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});g.click('breed-dialog');g.click('breed-confirm');g.click('close');g.click('nav',{page:'birds'});
  await g.h.advance(4);assert.equal(g.h.page,'birds');assert.equal(g.h.modal.type,'reports');assert.equal(g.h.state.week,13);
  assert.match(html(g),/4週のダイジェスト|3月の牧場だより|レース初勝利|小さな羽音/);
  assert.equal(g.h.state.reports.filter(r=>r.type==='weekly').length,4);assert.match(html(g),/一羽ずつ、違う物語/);
  const journal=JSON.stringify(g.h.state.journal);g.backdrop();assert.equal(g.h.modal,null);assert.equal(g.h.state.reports.length,0);assert.equal(JSON.stringify(g.h.state.journal),journal);
  await g.h.advance(1);assert.equal(g.h.page,'birds');assert.equal(g.h.modal.type,'reports');assert.equal(g.h.state.week,14);
  await g.h.advance(4);assert.equal(g.h.state.week,18);assert.equal(g.h.state.reports.filter(r=>r.type==='weekly').length,4);
});

test('four-week advance stops for January registration and backdrop dismissal keeps the required choices pending',async()=>{
  const g=boot(),s=g.h.state;s.stage='running';s.week=47;
  const child=R.createBird(s,{name:'コトリ',birthYear:0,bornWeek:9});
  await g.h.advance(4);assert.equal(s.week,49);assert.equal(g.h.modal.type,'reports');assert.ok(s.reports.some(r=>r.type==='registration'));
  g.backdrop();assert.equal(g.h.modal,null);assert.equal(s.reports.length,1);assert.equal(s.reports[0].type,'registration');assert.equal(child.registered,false);
  await g.h.advance(4);assert.equal(s.week,49);assert.equal(g.h.modal.type,'reports');
  g.setQuery('[data-register-name]',[{dataset:{registerName:child.id},value:'ハルノユメ'}]);
  g.setQuery('[data-register-policy]',[{dataset:{registerPolicy:child.id},value:'challenge'}]);
  g.click('ack');assert.equal(child.name,'ハルノユメ');assert.equal(child.policy,'challenge');assert.equal(child.registered,true);assert.equal(child.role,'racing');
  g.setQuery('[data-register-name]',[]);g.setQuery('[data-register-policy]',[]);
  await g.h.advance(1);assert.equal(s.week,50);
});

test('only clicking the backdrop closes a dialog; nested bird views return to their previous modal',()=>{
  const g=boot(),b=R.own(g.h.state)[0];g.click('detail',{id:b.id});g.inside();assert.equal(g.h.modal.type,'detail');
  g.backdrop();assert.equal(g.h.modal,null);
  g.click('buy-dialog',{id:g.h.state.sale[0]});const before=JSON.stringify(g.h.state);g.backdrop();assert.equal(g.h.modal,null);assert.equal(JSON.stringify(g.h.state),before);
  g.click('detail',{id:b.id});g.click('detail',{id:R.sires(g.h.state)[0].id});g.backdrop();assert.equal(g.h.modal.id,b.id);g.backdrop();assert.equal(g.h.modal,null);
});
