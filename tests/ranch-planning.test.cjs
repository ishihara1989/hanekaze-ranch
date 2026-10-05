'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const Observation=require('../public/js/ranch-observation.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const read=s=>{while(s.reports.length)R.acknowledge(s);};
const ranch=()=>{const s=R.initial();s.stage='running';return {s,b:R.own(s)[0]};};
const openContender=()=>{
  const {s,b}=ranch();Object.assign(s,{week:11,money:1000000000,reports:[]});
  Object.assign(b,{birthYear:-3,wins:4,races:4,lastRace:7});
  b.genome.distance=[0,0];b.genome.traits.aptitude.turf=[1,1];b.genome.traits.aptitude.dirt=[0,0];
  Object.assign(b.potential,{speed:80,cardio:120,power:60,reserve:80,legs:150,economy:140,start:150,resilience:150});
  for(const key in b.training)b.training[key]=1;
  for(const key in b.personality)b.personality[key]=100;
  for(const key in b.genome.traits.aptitude)b.genome.traits.aptitude[key]=[.5,.5];
  b.genome.traits.aptitude.turf=[1,1];b.genome.traits.aptitude.dirt=[0,0];
  return {s,b,g2:R.calendar(11).find(e=>e.name==='天空大賞典'),g1:R.calendar(13).find(e=>e.name==='リヴァイアサン記念')};
};

test('breeding only permits all eight spring weeks, including boundaries and later years',()=>{
  for(const week of [8,9,12,13,16,17,48,49,56,57,64,65]){
    const s=R.initial(),dam=R.buy(s,s.sale[0]),sire=R.sires(s)[0];read(s);s.week=week;
    const open=[3,4].includes(R.date(week).month),before=JSON.stringify(s);
    assert.equal(R.breedingOpen(s),open);
    if(open){assert.equal(R.breedingReason(s,dam,sire),'');R.breed(s,dam.id,sire.id);assert.equal(dam.pregnancy.due,week+4);}
    else {assert.match(R.breedingReason(s,dam,sire),/3月第1週〜4月第4週/);assert.throws(()=>R.breed(s,dam.id,sire.id),/配合期間/);assert.equal(JSON.stringify(s),before);}
  }
});

test('inheritance forecast includes body allocation and recessive defects without sampling or changing the save',()=>{
  const s=R.initial(),sire=R.sires(s)[0],dam=R.bird(s,s.sale[0]);
  for(const parent of [sire,dam]){
    parent.genome.quality.power=Array.from({length:32},()=>[0,1]);
    parent.genome.distance=[-1,1];parent.genome.release=[-1,1];
    parent.genome.character.control=[60,100];
  }
  const defect=Object.keys(R.DEFECTS).find(id=>R.DEFECTS[id].trait==='power');
  for(const parent of [sire,dam])parent.genome.defects[defect]=Array.from({length:4},()=>[0,1]);
  const before=JSON.stringify(s),ranges=R.breedingPreview(s,sire,dam);
  assert.equal(JSON.stringify(s),before);assert.deepEqual(ranges.power,{min:50-24-8,max:130+24});
  assert.deepEqual(ranges.control,{min:60,max:100});
  for(let i=0;i<100;i++){
    const child=R.createBird(s,{},[sire,dam]),scores=R.geneticScores(child);
    for(const [key,score] of Object.entries(scores))assert.ok(score>=ranges[key].min-1e-9&&score<=ranges[key].max+1e-9,`${key}: ${score}`);
  }
});

test('cross mutation forecasts contain the actual inherited effects of crossed children',()=>{
  const s=R.initial(),root=R.sires(s)[0],other=R.sires(s)[4],base=R.bird(s,s.sale[1]);
  const sire=R.createBird(s,{sex:'M',role:'stud'},[root,base]);
  const middle=R.createBird(s,{},[root,base]),dam=R.createBird(s,{sex:'F',role:'mare'},[other,middle]);
  assert.equal(R.crossReason(s,sire,dam),'');assert.ok(R.crossPlan(s,sire,dam).length);
  const before=JSON.stringify(s),ranges=R.breedingPreview(s,sire,dam);assert.equal(JSON.stringify(s),before);
  for(let i=0;i<100;i++){
    const child=R.createBird(s,{},[sire,dam]),scores=R.geneticScores(child);
    for(const group of ['aptitude','development'])for(const [key,pair] of Object.entries(child.genome.traits[group]))
      scores[key]=50+100*R.Genetics.mean(pair);
    for(const [key,score] of Object.entries(scores))
      assert.ok(score>=ranges[key].min-1e-9&&score<=ranges[key].max+1e-9,`${key}: ${score}`);
  }
});

test('aptitude and development forecasts include segregation and possible or guaranteed cross mutations',()=>{
  const s=R.initial(),root=R.sires(s)[0];
  const sire=R.createBird(s,{sex:'M'}),dam=R.createBird(s,{sex:'F'}),middle=R.createBird(s,{});
  const keys=[...Object.keys(R.Genetics.APTITUDES),...Object.keys(R.Genetics.DEVELOPMENT)];
  for(const group of ['aptitude','development'])for(const key of Object.keys(root.genome.traits[group])){
    root.genome.traits[group][key]=[1,1];
    sire.genome.traits[group][key]=key==='straight'?[.5,.75]:[0,.5];
    dam.genome.traits[group][key]=key==='straight'?[.5,.75]:[.25,.75];
  }
  const check=expected=>{
    const before=JSON.stringify(s),ranges=R.breedingPreview(s,sire,dam);
    assert.equal(JSON.stringify(s),before);
    for(const key of keys)assert.deepEqual(ranges[key],key==='straight'&&expected.min<100?
      {min:100,max:expected.max===112.5?125:150}:expected,key);
  };
  check({min:62.5,max:112.5});
  sire.parents=[root.id,null];middle.parents=[root.id,null];dam.parents=[middle.id,null];
  check({min:62.5,max:150});
  dam.parents=[root.id,null];
  check({min:150,max:150});
});

test('offspring expectation accounts for favorable inheritance, body traits, latent defects and honours without sampling',()=>{
  const s=R.initial(),sire=R.sires(s)[0],dam=R.bird(s,s.sale[0]);
  sire.parents=[];dam.parents=[];sire.records=[];dam.records=[];
  for(const parent of [sire,dam]){
    parent.genome.defects={};parent.genome.distance=[0,0];parent.genome.release=[0,0];
    for(const {key} of R.Mapping.ABILITIES)parent.genome.quality[key]=Array.from({length:32},()=>[0,1]);
  }
  const before=JSON.stringify(s),base=R.breedingExpectation(s,sire,dam);
  assert.equal(JSON.stringify(s),before);
  for(const {key} of R.Mapping.ABILITIES)assert.equal(base[key],90);
  s.facilities.stalls=9;
  assert.equal(R.breedingExpectation(s,sire,dam).power,110);
  s.facilities.stalls=1;
  const defect=Object.keys(R.DEFECTS).find(id=>R.DEFECTS[id].trait==='power');
  for(const parent of [sire,dam])parent.genome.defects[defect]=Array.from({length:4},()=>[0,1]);
  assert.equal(R.breedingExpectation(s,sire,dam).power,88,'each latent locus has a 25% expression chance');
  sire.genome.release=[1,1];dam.genome.distance=[1,1];
  assert.equal(R.breedingExpectation(s,sire,dam).power,86,'body effects use expected inherited alleles');
  sire.records=[{rank:1,level:'GI',surface:'turf',distance:1200,name:'テスト杯'}];
  const bonus=R.pedigreeBonus(s,sire,dam).power;
  assert.equal(R.breedingExpectation(s,sire,dam).power,86+(bonus.lower+bonus.upper)/2);
});

test('offspring expectation weights cross mutations by probability instead of preview extremes',()=>{
  const s=R.initial(),root=R.sires(s)[0],sire=R.createBird(s,{sex:'M'}),dam=R.createBird(s,{sex:'F'}),middle=R.createBird(s,{});
  const key=R.ROOTS.find(p=>p.lineage===root.lineage).primary;
  for(const parent of [sire,dam]){
    parent.records=[];parent.genome.defects={};parent.genome.distance=[0,0];parent.genome.release=[0,0];
    parent.genome.quality[key]=Array.from({length:32},()=>[0,0]);
  }
  root.records=[];middle.records=[];
  sire.parents=[root.id,null];middle.parents=[root.id,null];dam.parents=[middle.id,null];
  const plan=R.crossPlan(s,sire,dam),bonus=R.pedigreeBonus(s,sire,dam)[key];
  const expected=50+plan.filter(p=>p.group==='quality'&&p.key===key).reduce((n,p)=>n+2.5*p.rate,0)+(bonus.lower+bonus.upper)/2;
  assert.ok(expected>50);assert.equal(R.breedingExpectation(s,sire,dam)[key],expected);
});

test('ability progress separates development, age loss and remaining potential and keeps the value calculation',()=>{
  const {s,b}=ranch(),original=copy(b.genome),genes=R.Genetics.growth(b.genome.traits);
  b.birthYear=1;b.bornWeek=9;s.week=Math.ceil(genes.maturityYears*48)+9;
  for(const key of Object.keys(b.training))b.training[key]=1;
  const peak=R.abilityProgress(s,b);assert.equal(peak.power.decline,0);assert.equal(peak.power.current,1);
  s.week=Math.ceil((genes.declineStart+2)*48)+9;
  const older=R.abilityProgress(s,b),abilities=R.currentAbilities(s,b);
  for(const [key,p] of Object.entries(older)){
    assert.ok(p.decline>0);assert.ok(p.current<peak[key].current);assert.ok(Math.abs(p.current+p.decline+p.remaining-1)<1e-9);
    assert.equal(p.value,abilities[key]);assert.ok(p.value>=50&&p.value<=b.potential[key]);
  }
  const html=Observation.status(s,b);assert.match(html,/ability-gauge|加齢で約/);assert.doesNotMatch(html,/data-score/);assert.deepEqual(b.genome,original);
  b.training.power=.1;assert.ok(R.abilityProgress(s,b).power.remaining>0);
});

test('eight-week plans preserve state and randomness; edits round-trip and invalid backup plans fail validation',()=>{
  const {s,b}=ranch(),before=JSON.stringify(s),rows=R.upcomingSchedule(s,b);
  assert.equal(JSON.stringify(s),before);assert.equal(rows.length,8);assert.deepEqual(rows.map(r=>r.week),Array.from({length:8},(_,i)=>s.week+i));
  R.setSchedule(s,b.id,s.week,{mode:'rest'});R.setSchedule(s,b.id,s.week+7,{mode:'training',menu:'power'});
  assert.ok(R.validState(s));assert.deepEqual(R.deserializeState(R.serializeState(s)),s);
  const snapshot=JSON.stringify(s);
  for(const [week,plan] of [[s.week-1,{mode:'rest'}],[s.week+8,{mode:'rest'}],[s.week,{mode:'training',menu:'missing'}],[s.week,{mode:'race',eventId:'missing'}]]){
    assert.throws(()=>R.setSchedule(s,b.id,week,plan));assert.equal(JSON.stringify(s),snapshot);
  }
  for(const plans of [[],null,{[s.week]:{mode:'bad'}},{[s.week+8]:{mode:'rest'}},{[s.week]:{mode:'race',eventId:'missing'}}]){
    const bad=copy(s);R.bird(bad,b.id).schedule=plans;assert.equal(R.validState(bad),false);
  }
  R.setSchedule(s,b.id,s.week,{mode:'auto'});assert.equal(b.schedule[s.week],undefined);
});

test('ability gauge caps share the absolute 150 scale and age loss occupies the same scale',()=>{
  const {s,b}=ranch();b.potential.speed=75;b.potential.power=150;
  const gauge=(html,key)=>html.match(new RegExp(`data-trait="${key}"([\\s\\S]*?)</div></div></div>`))[1];
  const html=Observation.status(s,b);assert.match(gauge(html,'speed'),/class="ability-capacity" style="width:50%"/);
  assert.match(gauge(html,'power'),/class="ability-capacity" style="width:100%"/);assert.match(html,/aria-valuemax="150"/);
  s.week=450;const p=R.abilityProgress(s,b).speed,older=gauge(Observation.status(s,b),'speed');
  assert.match(older,/class="ability-capacity" style="width:50%"/,'age never changes the inherited cap');
  const current=Number(older.match(/class="current" style="width:([\d.]+)%"/)[1]);
  const loss=Number(older.match(/class="decline" style="width:([\d.]+)%"/)[1]);
  const remaining=Number(older.match(/class="remaining" style="width:([\d.]+)%"/)[1]);
  assert.ok(Math.abs(current/100*.5-p.value/150)<1e-9);assert.ok(loss>0);
  assert.ok(Math.abs((current+loss+remaining)-100)<1e-9);
});

test('manual rest suppresses races and training; focus training grows chosen abilities; health overrides training',()=>{
  const {s,b}=ranch(),training=copy(b.training),races=b.races;
  R.setSchedule(s,b.id,s.week,{mode:'rest'});assert.notEqual(R.nextRace(s,b)?.week,s.week);R.advance(s);
  assert.equal(b.races,races);assert.deepEqual(b.training,training);assert.equal(Object.keys(b.schedule).length,0);read(s);
  const baseline=copy(b.training);R.setSchedule(s,b.id,s.week,{mode:'training',menu:'power'});R.advance(s);
  assert.ok(b.training.power-baseline.power>b.training.speed-baseline.speed);assert.equal(b.races,races);read(s);
  b.health=2;const sick=copy(b.training);R.setSchedule(s,b.id,s.week,{mode:'training',menu:'speed'});R.advance(s);
  assert.deepEqual(b.training,sick);assert.equal(b.health,1);assert.ok(R.validState(s));
});

test('manual race bookings respect four-week spacing and execute the chosen race, including graded shared fields',()=>{
  for(const graded of [false,true]){
    const {s,b}=ranch();if(graded){s.week=12;b.wins=5;b.races=8;b.birthYear=-3;s.money=10000000;}
    const event=R.raceOptions(s,b,s.week).find(e=>/^G/.test(e.level)===graded);assert.ok(event);
    R.setSchedule(s,b.id,s.week,{mode:'race',eventId:event.id});assert.equal(R.nextRace(s,b).id,event.id);
    assert.equal(R.raceOptions(s,b,s.week+3).length,0);assert.ok(R.raceOptions(s,b,s.week+4).length);
    assert.throws(()=>R.setSchedule(s,b.id,s.week+2,{mode:'race',eventId:R.calendar(s.week+2)[0].id}),/間隔/);
    R.advance(s);assert.equal(b.lastRace,event.week);assert.equal(b.records.at(-1).name,event.name);assert.equal(b.records.at(-1).distance,event.distance);assert.ok(R.validState(s));
  }
});

test('resting this week still exposes a later booking without permitting an automatic race today',()=>{
  const {s,b}=ranch(),event=R.raceOptions(s,b,s.week+4)[0];
  R.setSchedule(s,b.id,s.week+4,{mode:'race',eventId:event.id});R.setSchedule(s,b.id,s.week,{mode:'rest'});
  assert.equal(R.nextRace(s,b).id,event.id);assert.equal(R.weeklyPlan(s,b).mode,'rest');
  assert.equal(R.upcomingSchedule(s,b)[4].event.id,event.id);
});

test('both policies skip an earlier G2 for a suitable G1 blocked by the four-week interval',()=>{
  for(const policy of ['steady','challenge']){
    const {s,b,g2,g1}=openContender();b.policy=policy;
    assert.equal(R.raceOutlook(s,b,g1).contender,true);
    const before=JSON.stringify(s),rows=R.upcomingSchedule(s,b);
    assert.equal(R.nextRace(s,b).id,g1.id);assert.equal(JSON.stringify(s),before);
    assert.deepEqual(rows.slice(0,3).map(r=>r.mode),['training','training','race']);assert.equal(rows[2].event.id,g1.id);
    const loaded=R.deserializeState(R.serializeState(s));assert.equal(R.nextRace(loaded,R.bird(loaded,b.id)).id,g1.id);
    R.advance(s);read(s);assert.equal(b.lastRace,7);assert.equal(b.races,4);
    assert.equal(R.nextRace(s,b).id,g1.id);R.advance(s);read(s);R.advance(s);
    assert.equal(b.lastRace,g1.week);assert.equal(b.records.at(-1).name,g1.name);
    assert.ok(!b.records.some(r=>r.name===g2.name));
  }
});

test('a G1 three weeks away replaces G2, but an exact four-week gap keeps both races available',()=>{
  for(const policy of ['steady','challenge']){
    const {s,b,g1}=openContender();b.policy=policy;s.week=10;
    assert.equal(R.nextRace(s,b).id,g1.id,'three weeks after the earlier target');
    s.week=9;b.lastRace=5;
    const prep=R.raceOptions(s,b,9).find(e=>e.level==='GII');
    R.setSchedule(s,b.id,9,{mode:'race',eventId:prep.id});
    assert.equal(R.nextRace(s,b).id,prep.id);
    b.lastRace=9;s.week=10;assert.equal(R.nextRace(s,b).id,g1.id,'four weeks after the prep');
  }
});

test('steady policy keeps a winnable G2 when the upcoming G1 has stronger rivals',()=>{
  const {s,b,g2,g1}=openContender();s.week=g1.week;
  for(const rival of R.worldRoster(s,g1).filter(r=>!r.filler)){
    for(const key in rival.potential){rival.potential[key]=150;rival.training[key]=1;}
    rival.genome.traits.aptitude.turf=[1,1];
  }
  s.week=g2.week;
  assert.equal(R.raceOutlook(s,b,g1).contender,false);assert.equal(R.raceOutlook(s,b,g2).contender,true);
  const before=JSON.stringify(s);assert.equal(R.nextRace(s,b).id,g2.id);assert.equal(JSON.stringify(s),before);
});

test('automatic upgrades preserve manual bookings and ignore unavailable G1 races',()=>{
  for(const policy of ['steady','challenge']){
    const {s,b,g2,g1}=openContender();b.policy=policy;
    R.setSchedule(s,b.id,g2.week,{mode:'race',eventId:g2.id});assert.equal(R.nextRace(s,b).id,g2.id);
    R.setSchedule(s,b.id,g2.week,{mode:'auto'});
    R.setSchedule(s,b.id,g1.week,{mode:'rest'});assert.equal(R.nextRace(s,b).id,g2.id);
    R.setSchedule(s,b.id,g1.week,{mode:'auto'});
    s.money=g2.fee;assert.ok(s.money<g1.fee);assert.equal(R.nextRace(s,b).id,g2.id);
  }
});
