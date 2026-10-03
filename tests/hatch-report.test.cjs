'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../public/js/ranch-engine.js');
const Observation=require('../public/js/ranch-observation.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const read=s=>{while(s.reports.length)R.acknowledge(s);};

function prepare({cross=false}={}) {
  const s=R.initial(20261003),dam=R.bird(s,s.sale[0]);
  let sire=s.birds.find(b=>b.kind==='root'&&b.id!==dam.parents[0]&&b.color!=='golden');
  if(cross){
    const source=R.bird(s,dam.parents[0]);
    sire=R.createBird(s,{sex:'M',role:'stud',owner:'public',retiredYear:1,fee:600},[source,R.bird(s,s.sale[1])]);
    const intermediary=R.createBird(s,{sex:'M',owner:'archive',role:'archived'},[source,R.bird(s,s.sale[2])]);
    dam.parents=[intermediary.id,null];
  }
  s.money=1000000;R.buy(s,dam.id);read(s);R.breed(s,dam.id,sire.id);
  for(let i=0;i<3;i++){read(s);R.advance(s);}read(s);
  return {s,dam,sire};
}

test('hatch reports snapshot actual genetic effects and pre-hatch ranges, including crossed inheritance',()=>{
  for(const cross of [false,true]){
    const {s,dam,sire}=prepare({cross}),ranges=R.breedingPreview(s,sire,dam),restored=R.deserializeState(R.serializeState(s));
    const rng=s.rng;R.breedingPreview(s,sire,dam);assert.equal(s.rng,rng);
    R.advance(s);R.advance(restored);assert.deepEqual(s,restored);
    const report=s.reports.find(r=>r.type==='birth'),child=R.bird(s,report.birdId),rows=report.geneticLottery;
    assert.equal(Object.keys(rows).length,23);assert.ok(R.validState(s));
    const values=R.geneticScores(child);
    for(const group of ['aptitude','development'])for(const [key,pair] of Object.entries(child.genome.traits[group]))values[key]=50+100*R.Genetics.mean(pair);
    for(const [key,row] of Object.entries(rows)){
      assert.deepEqual(row,{...ranges[key],value:values[key]},key);
      assert.ok(row.value>=row.min-1e-8&&row.value<=row.max+1e-8,key);
    }
    const snapshot=copy(rows);sire.genome.quality.speed=Array.from({length:32},()=>[1,1]);
    dam.genome.character.grit=[150,150];child.personality.grit=150;
    Object.assign(s.facilities,{lab:1,museum:1,statue:1});
    const before=JSON.stringify(s);Observation.birthGenetics(s,report);assert.equal(JSON.stringify(s),before);
    assert.deepEqual(report.geneticLottery,snapshot);
    assert.deepEqual(s.journal.find(r=>r.id===report.id).geneticLottery,snapshot);
    const reloaded=R.deserializeState(R.serializeState(s));assert.ok(R.validState(reloaded));
    assert.deepEqual(reloaded.reports.find(r=>r.id===report.id).geneticLottery,snapshot);
    assert.deepEqual(reloaded.journal.find(r=>r.id===report.id).geneticLottery,snapshot);
  }
});

test('range position shows endpoints and fixed inheritance without implying probability',()=>{
  const {s}=prepare();R.advance(s);Object.assign(s.facilities,{lab:1,museum:1,statue:1});
  const report=copy(s.reports.find(r=>r.type==='birth'));
  report.geneticLottery.speed={value:90,min:70,max:105};
  report.geneticLottery.power={value:70,min:70,max:105};
  report.geneticLottery.cardio={value:105,min:70,max:105};
  report.geneticLottery.legs={value:90,min:90,max:90};
  const html=Observation.birthGenetics(s,report),row=key=>html.match(new RegExp(`data-birth-trait="${key}"([\\s\\S]*?)</div>`))[1];
  assert.match(row('speed'),/◯ <span class="birth-range">\/ △～◎/);
  assert.match(row('speed'),/90 \/ 70～105/);assert.match(row('speed'),/下限から57%/);
  assert.match(row('power'),/<meter min="0" max="100" value="0"/);
  assert.match(row('cardio'),/<meter min="0" max="100" value="100"/);
  assert.match(row('legs'),/固定（抽選幅なし）/);assert.doesNotMatch(row('legs'),/<meter|NaN|Infinity/);
  assert.match(html,/抽選の確率や順位を表すものではありません/);
});

test('legacy birth reports still load and malformed lottery snapshots cannot load',()=>{
  const {s}=prepare();R.advance(s);
  const legacy=copy(s);
  for(const report of [...legacy.reports,...legacy.journal])delete report.geneticLottery;
  assert.ok(R.validState(legacy));assert.equal(Observation.birthGenetics(legacy,legacy.reports.find(r=>r.type==='birth')),'');
  for(const invalid of [null,[],{}, {...s.reports.find(r=>r.type==='birth').geneticLottery,speed:{min:90,max:80,value:85}},
    {...s.reports.find(r=>r.type==='birth').geneticLottery,speed:{min:70,max:105,value:106}}]){
    for(const collection of ['reports','journal']){
      const bad=copy(s);bad[collection].find(r=>r.type==='birth').geneticLottery=invalid;
      assert.equal(R.validState(bad),false,collection);
    }
  }
});
