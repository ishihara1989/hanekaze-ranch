const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../public/js/model.js'),W=require('../public/js/world.js');
function makeState(){return W.initial(Array.from({length:6},(_,i)=>M.initialize({id:'p'+i,name:'自羽'+i,sex:i%2?'F':'M',gen:1,age:2,genes:{distance:['S','L'],color:['B','b']},parents:[],races:0,wins:0,trainedWeek:-1,released:false,condition:100},[1,1,1],()=>.5)));}
test('48-week calendar repeats graded stakes; classics enforce age and sex',()=>{
 const s=makeState();assert.deepEqual(W.date(49),{year:2,week:1,month:1,monthWeek:1});
 for(const [week,name] of W.STAKES){assert.ok(W.calendar(week).some(e=>e.name===name));assert.ok(W.calendar(week+48).some(e=>e.name===name));}
 const ids=W.calendar(48).map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
 for(const e of W.calendar(1).concat(W.calendar(5)))assert.equal(e.surface,e.track.surface);
 const old=JSON.parse(JSON.stringify(s));old.results.push({eventId:'1:new',week:1,name:'旧',level:'new',trackId:'cornelia',rows:[]});assert.equal(W.migrate(old).results.at(-1).trackId,'tenku');
 const b=s.birds[0];b.age=3*48;b.races=3;b.wins=1;b.rating=400;
 assert.equal(W.eligibility(s,b,W.calendar(21).at(-1)),'');assert.match(W.eligibility(s,b,W.calendar(20).at(-1)),/牝/);
 b.sex='F';assert.equal(W.eligibility(s,b,W.calendar(20).at(-1)),'');b.age=4*48;assert.match(W.eligibility(s,b,W.calendar(21).at(-1)),/歳/);
});
test('class ratings are separate from purse and entry eligibility changes with career',()=>{
 const s=makeState(),b=s.birds[0];assert.equal(W.currentClass(b),'new');b.races=1;assert.equal(W.currentClass(b),'maiden');b.wins=1;
 for(const [rating,cl]of [[400,'c1'],[500,'c1'],[501,'c2'],[1000,'c2'],[1001,'c3'],[1600,'c3'],[1601,'open']]){b.rating=rating;assert.equal(W.currentClass(b),cl);}
 assert.match(W.eligibility(s,b,W.calendar(1)[0]),/未出走/);b.age=95;assert.match(W.eligibility(s,b,W.calendar(1)[5]),/歳/);
});
test('transactions transfer persistent identities; valuation uses career and parents',()=>{
 const s=makeState(),b=s.birds.find(b=>b.listed&&b.status==='young');const price=W.price(s,b),father=W.find(s,b.parents[0]);father.earnings+=10000;assert.equal(W.price(s,b),price+1000);
 const before=s.money,id=b.id,genes=JSON.stringify(b.genes),seller=W.owner(s,b.ownerId),cash=seller.money;W.buy(s,id);
 assert.equal(b.ownerId,'player');assert.equal(s.money,before-W.price(s,b));assert.equal(seller.money,cash+W.price(s,b));
 W.sell(s,id);assert.notEqual(b.ownerId,'player');assert.equal(b.id,id);assert.equal(JSON.stringify(b.genes),genes);
 const mare=s.birds[5],old=W.price(s,mare);mare.earnings+=1000;assert.ok(W.price(s,mare)>old);
 const sire=s.birds[4],fee=W.studFee(sire);sire.earnings+=10000;assert.ok(W.studFee(sire)>fee);const fee2=W.studFee(sire);sire.training.speed=0;assert.equal(W.studFee(sire),fee2);
});
test('4-week pregnancy reserves a stall and produces a foal inheriting both parents',()=>{
 const s=makeState(),father=s.birds[4],mother=s.birds[5],before=s.money;const pregnancy=W.breed(s,father.id,mother.id);
 assert.equal(pregnancy.dueWeek,5);assert.equal(W.occupied(s),7);assert.equal(s.money,before-200);assert.throws(()=>W.breed(s,father.id,mother.id),/受胎/);
 for(let i=0;i<W.GESTATION;i++)W.nextWeek(s);
 const child=W.owned(s).find(b=>b.parents.includes(mother.id));assert.ok(child);assert.equal(child.age,0);assert.equal(child.status,'young');assert.equal(child.parents[0],father.id);assert.equal(child.ownerId,'player');assert.equal(mother.pregnancy,null);
 for(const k of M.KEYS){assert.ok(father.genes[k].includes(child.genes[k][0]));assert.ok(mother.genes[k].includes(child.genes[k][1]));}
 assert.ok(W.validState(s));
});
test('age boundaries: debut 2, successful retirement 4–6, retirement 10, wild 31',()=>{
 const s=makeState(),b=s.birds[0];b.status='young';b.age=95;W.nextWeek(s);assert.equal(b.status,'racing');assert.equal(W.age(b),2);
 b.age=479;W.nextWeek(s);assert.equal(b.status,'breeding');assert.equal(W.age(b),10);
 b.age=30*48;assert.equal(W.fertile(b),true);b.age=31*48-1;W.nextWeek(s);assert.equal(b.status,'wild');assert.equal(b.released,true);assert.equal(W.fertile(b),false);
 const winner=s.birds[1];winner.age=4*48;winner.wins=4;winner.races=4;W.hire(s,'apprentice');W.nextWeek(s);assert.equal(winner.status,'breeding');assert.ok(W.validState(s));
});
test('manual mode charges costs without grants; trainer automates racing and training',()=>{
 const s=makeState(),expected=Object.values(W.maintenance(s)).reduce((a,b)=>a+b,0),before=s.money;
 W.nextWeek(s);assert.equal(s.money,before-expected);assert.equal(s.history.length,0);assert.ok(s.results.length>0);
 W.hire(s,'apprentice');const week=s.week;W.nextWeek(s);assert.ok(s.history.some(h=>h.week===week));assert.ok(s.ledger.some(l=>l.category==='調教師給与'));
 s.mode='manual';assert.equal(W.maintenance(s).trainer,0);
});
test('cash shortages become debt; loans, repayments and duplicate-entry guards work',()=>{
 const s=makeState();s.money=0;W.nextWeek(s);assert.ok(s.debt>0);assert.equal(s.money,0);W.loan(s);assert.equal(s.money,5000);const debt=s.debt;W.repay(s);assert.equal(s.debt,debt-1000);
 const e=W.calendar(s.week)[0],b=s.birds[0];W.prepareRace(s,e.id,b.id);assert.throws(()=>W.prepareRace(s,e.id,b.id),/進行中/);assert.throws(()=>W.buy(s,s.birds.find(b=>b.listed).id),/競走確定後/);
});
test('straights join corners continuously and all race distances share a finish line',()=>{
 for(const t of Object.values(W.TRACKS)){
  const e={distance:2400,track:t},points=Array.from({length:200},(_,i)=>M.trackPosition(e.distance+t.lap*i/200,e));
  assert.ok(points.some(p=>!p.corner));assert.ok(points.some(p=>p.corner));
  for(let i=1;i<points.length;i++)assert.ok(Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y)<5);
  const goal=M.trackPosition(2400,e),goal2=M.trackPosition(1200,{...e,distance:1200});assert.ok(Math.abs(goal.x-goal2.x)<.00001);assert.ok(Math.abs(goal.y-goal2.y)<.00001);
 }
});
test('trained birds run 2400m in about 2–3 minutes with speed capped at 81km/h',()=>{
 const s=makeState(),course=W.calendar(21).at(-1),b=s.birds[0];b.condition=100;
 for(const ability of [65,85]){
  const r=M.runner(b,0,()=>.5);r.stats=Object.fromEntries(M.KEYS.map(k=>[k,ability]));let time=0,top=0;
  while(r.finishedAt===null&&time<300){time+=.1;M.stepRace([r],course,time,.1,'steady');top=Math.max(top,r.velocity);}
  assert.ok(r.finishedAt>130&&r.finishedAt<190,`${ability}: ${r.finishedAt}`);assert.ok(top<=22.5);
 }
});
test('whole-year simulation preserves identities, NPC results and valid saves',()=>{
 const s=makeState(),ids=s.birds.map(b=>b.id);W.hire(s,'strategist');for(let i=0;i<48;i++)W.nextWeek(s);
 assert.equal(s.week,49);for(const id of ids)assert.ok(W.find(s,id));assert.ok(s.results.length>100);assert.ok(s.history.length>0);assert.ok(W.validState(s));assert.deepEqual(W.migrate(JSON.parse(JSON.stringify(s))),s);
});
test('v2 migration preserves identities and caps, adds only the stated transition grant',()=>{
 const s=makeState(),birds=s.birds.slice(0,6).map(b=>{const old={...b,age:2};for(const k of ['ownerId','breederId','status','earnings','rating','gradedWins','lastRaceWeek','listed','offspring','pregnancy','plan'])delete old[k];return old;});
 const old={version:2,week:3,money:456,births:0,history:[],birds},caps=birds.map(M.potential),m=W.migrate(old);
 assert.equal(m.money,6456);assert.equal(m.week,3);for(let i=0;i<6;i++){assert.equal(m.birds[i].id,birds[i].id);assert.deepEqual(M.potential(m.birds[i]),caps[i]);assert.equal(W.age(m.birds[i]),2);}
 assert.ok(W.validState(m));assert.deepEqual(W.migrate(m),m);
});
test('competitor breeding and racing continue beyond the first generation',()=>{
 const s=makeState();for(let i=0;i<12*48;i++)W.nextWeek(s);
 assert.ok(s.birds.some(b=>b.ownerId!=='player'&&b.status==='young'));
 assert.ok(s.birds.some(b=>b.ownerId!=='player'&&b.status==='racing'));
 assert.ok(s.results.at(-1).week>=s.week-2);
 assert.ok(s.birds.some(b=>b.gen>=3));assert.ok(W.validState(s));
});
test('reservations check future age and one bird per week; month summary matches the ledger',()=>{
 const s=makeState(),b=s.birds[0];b.status='young';b.age=2*48-2;
 const debut=W.calendar(3).find(e=>e.level==='new');assert.match(W.reserveReason(s,b,W.calendar(2).find(e=>e.level==='new')),/競走羽|歳/);assert.equal(W.reserveReason(s,b,debut),'');
 W.reserve(s,b.id,debut.id);assert.match(W.reserveReason(s,b,W.calendar(3).find(e=>e.level==='maiden')),/同じ週/);
 assert.match(W.reserveReason(s,s.birds[2],debut),/自牧場/);assert.match(W.reserveReason(s,b,W.calendar(1+W.RESERVE_WEEKS)[0]),/週先/);
 for(let i=0;i<4;i++)W.nextWeek(s);
 assert.equal(b.races,1);assert.equal(s.entries.length,0);
 const m=W.monthSummary(s,0),ledger=s.ledger.filter(l=>l.week<=4&&!['融資','返済'].includes(l.category)).reduce((n,l)=>n+l.amount,0);
 assert.equal(m.net,ledger);assert.equal(m.totalIncome-m.totalExpense,m.net);
 const row=m.birds.find(x=>x.bird.id===b.id);assert.equal(row.races.length,1);
 assert.ok(m.birds.some(x=>x.training.length));assert.ok(W.validState(s));
});
test('trainer keeps racers booked within four weeks and scratches tired birds',()=>{
 const s=makeState();W.hire(s,'strategist');
 for(let i=0;i<12;i++){W.nextWeek(s);for(const b of W.owned(s).filter(b=>b.status==='racing'&&b.plan.race)){const next=s.entries.filter(x=>x.birdId===b.id);assert.ok(next.length<=1);}}
 const b=W.owned(s).find(b=>s.entries.some(x=>x.birdId===b.id&&x.week===s.week));
 if(b){b.condition=40;W.dueEntries(s);assert.ok(!s.entries.some(x=>x.birdId===b.id&&x.week===s.week));assert.match(s.news.at(-1).message,/回避/);}
 W.setMode(s,'manual');assert.ok(s.entries.every(x=>x.by!=='trainer'));
});
