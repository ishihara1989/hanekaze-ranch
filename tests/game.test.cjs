const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const M=require('../public/js/model.js'),W=require('../public/js/world.js');
function boot(saved){
 const elements=new Map(),handlers={},storage=new Map(saved?[['hanekaze-ranch-v1',saved]]:[]);
 const node=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){}},focus(){},contains(){return false;}});return elements.get(key);};
 let id=0;
 const ctx=vm.createContext({RanchModel:M,RanchWorld:W,document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto:{randomUUID:()=>`player-${++id}`},performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:f=>{f();return 1;},clearTimeout(){},window:{scrollTo(){}},confirm:()=>true,console});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/world-views.js'),'utf8'),ctx);
 const source=fs.readFileSync(path.join(__dirname,'../public/js/game.js'),'utf8');
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.hooks={get state(){return state},get race(){return race},get result(){return lastResult},get waiting(){return weekWait},get modal(){return modal},get busy(){return busyWeeks},active,render,progressWeeks,setEntrant(id,event){entrant=id;course=event},setParents(a,b){sire=a;dam=b}};})();`),ctx);
 return {h:ctx.hooks,node,storage,click(action,extra={}){handlers.click({target:{closest:()=>({dataset:{action,...extra},disabled:false})}});}};
}
// Advances weeks, answering each race-day prompt with the given action.
async function advance(g,weeks,answer='results-only'){
 const run=g.h.progressWeeks(weeks);
 for(let i=0;i<5000&&g.h.busy;i++){await new Promise(r=>setImmediate(r));if(g.h.waiting&&!g.h.race)g.click(answer);}
 await run;
}
test('all management screens render with persistent world data',()=>{
 const g=boot();assert.equal(g.h.active().length,6);assert.equal(g.h.state.owners.length,7);assert.ok(W.validState(g.h.state));
 for(const page of ['ranch','calendar','market','staff','accounts','world','records','help','breed','race']){g.click('nav',{page});assert.ok(g.node('#app').innerHTML.length>1000,page);}
});
test('manual race pays entry once, resolves all registered competitors, and cannot pay twice',()=>{
 const g=boot(),b=g.h.active()[0],e=W.calendar(g.h.state.week)[0],before=g.h.state.money;
 g.h.setEntrant(b.id,e.id);g.click('race');assert.ok(g.h.race);assert.equal(g.h.state.money,before-e.fee);
 assert.ok(g.h.state.pendingRace);g.click('skip');assert.equal(g.h.race,null);assert.equal(b.races,1);
 assert.equal(g.h.state.money,before-e.fee+g.h.result.reward);const after=g.h.state.money;g.click('skip');assert.equal(g.h.state.money,after);
 assert.ok(W.validState(g.h.state));
});
test('pending race restores deterministically and is settled once after a reload',()=>{
 const g=boot(),b=g.h.active()[0],e=W.calendar(1)[0];g.h.setEntrant(b.id,e.id);g.click('race');
 const saved=g.storage.get('hanekaze-ranch-v1'),restored=boot(saved);assert.equal(restored.h.state.pendingRace,null);
 g.click('skip');assert.equal(restored.h.state.money,g.h.state.money);
 assert.equal(JSON.stringify(restored.h.state.results),JSON.stringify(g.h.state.results));
 const again=boot(restored.storage.get('hanekaze-ranch-v1'));assert.equal(again.h.state.money,restored.h.state.money);
});
test('UI supports breeding, weekly progress, hiring, purchases and sales',async()=>{
 const g=boot(),bs=g.h.active(),s=g.h.state;g.h.setParents(bs[4].id,bs[5].id);g.click('breed');assert.ok(bs[5].pregnancy);assert.equal(g.h.active().length,6);
 g.click('hire',{id:'apprentice'});assert.equal(s.mode,'auto');const firstAge=bs[0].age;
 await advance(g,4);assert.equal(s.week,5);assert.equal(bs[0].age,firstAge+4);assert.ok(s.results.length>0);
 const b=s.birds.find(b=>b.listed&&W.age(b)<2);g.click('buy',{id:b.id});assert.equal(b.ownerId,'player');g.click('sell',{id:b.id});assert.notEqual(b.ownerId,'player');assert.ok(W.validState(s));
});
test('batch progress tolerates funded loans but stops on a new cash shortfall',async()=>{
 const funded=boot();funded.click('loan');const debt=funded.h.state.debt;
 await advance(funded,4);assert.equal(funded.h.state.week,5);assert.equal(funded.h.state.debt,debt);
 const broke=boot();broke.h.state.money=0;await advance(broke,4);
 assert.equal(broke.h.state.week,2);assert.ok(broke.h.state.debt>0);
});
test('new ranch starts with a trainer who books races; advancing asks before race day',async()=>{
 const g=boot(),s=g.h.state;assert.equal(s.mode,'auto');assert.ok(s.entries.some(x=>x.week===1));
 const due=s.entries.filter(x=>x.week===1).length,run=g.h.progressWeeks(1);await new Promise(r=>setImmediate(r));
 assert.equal(g.h.modal.type,'race-call');assert.equal(s.week,1);assert.match(g.node('#app').innerHTML,/今週の出走/);
 g.click('cancel-week');await run;assert.equal(s.week,1);assert.equal(s.entries.filter(x=>x.week===1).length,due);
 await advance(g,1);assert.equal(s.week,2);assert.equal(s.history.filter(h=>h.week===1).length,due);assert.ok(W.validState(s));
});
test('watching a booked race settles it once and then continues the week',async()=>{
 const g=boot(),s=g.h.state,run=g.h.progressWeeks(1);await new Promise(r=>setImmediate(r));
 const item=g.h.waiting.items[0];g.click('watch-entry',{index:'0'});assert.ok(g.h.race);assert.equal(g.h.race.pending.ids[0],item.birdId);
 g.click('skip');assert.equal(g.h.race,null);const races=s.history.length,money=s.money;
 for(let i=0;i<50&&g.h.busy;i++){await new Promise(r=>setImmediate(r));if(g.h.waiting&&!g.h.race)g.click(g.h.modal?.type==='race-call'?'results-only':'resume-week');}
 await run;assert.equal(s.week,2);assert.equal(s.history.filter(h=>h.birdId===item.birdId&&h.week===1).length,1);assert.ok(s.history.length>=races);assert.ok(W.validState(s));
});
test('crossing a month opens the overall and per-bird summary',async()=>{
 const g=boot(),s=g.h.state;await advance(g,4);assert.equal(s.week,5);
 assert.deepEqual({type:g.h.modal.type,month:g.h.modal.month},{type:'summary',month:0});
 const html=g.node('#app').innerHTML;assert.match(html,/1年1月のまとめ/);assert.match(html,/獲得資金/);assert.match(html,/経費/);
 g.click('summary-tab',{tab:'birds'});const birds=g.node('#app').innerHTML;
 for(const t of ['出走結果','調教内容','来月の出走予定'])assert.match(birds,new RegExp(t));
 assert.match(birds,new RegExp(g.h.active().find(b=>b.status==='racing').name));
});
test('calendar reservations run on the booked week in manual mode',async()=>{
 const g=boot(),s=g.h.state;g.click('mode',{mode:'manual'});assert.equal(s.entries.length,0);
 const b=g.h.active()[0],e=W.calendar(3).find(e=>!W.reserveReason(s,b,e));W.reserve(s,b.id,e.id);
 await advance(g,2);assert.equal(b.races,0);assert.ok(s.trainingLog.some(t=>t.birdId===b.id&&t.by==='staff'));
 await advance(g,1);assert.equal(b.races,1);assert.equal(s.history.at(-1).week,3);assert.ok(W.validState(s));
});
