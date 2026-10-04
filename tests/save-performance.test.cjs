'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {R,read}=require('../tools/lib/ranch-fixtures.cjs');

// The former storage boundary is an oracle for exact on-disk compatibility.
function previousSerialize(s){
  const fields=[],indices=new Map(),replays=[],replayIndices=new Map(),pack=loci=>loci.map(p=>p[0]*2+p[1]).join('');
  const record=r=>{
    const key=JSON.stringify(r.field);let index=indices.get(key);
    if(index===undefined){index=fields.length;indices.set(key,index);fields.push(r.field);}
    const result={...r,field:index};
    if(r.replay){const key=JSON.stringify(r.replay);let index=replayIndices.get(key);
      if(index===undefined){index=replays.length;replayIndices.set(key,index);replays.push(r.replay);}result.replay=index;}
    return result;
  };
  const birds=s.birds.map(b=>({...b,genome:{...b.genome,
    quality:Object.fromEntries(Object.entries(b.genome.quality).map(([k,p])=>[k,pack(p)])),
    defects:Object.fromEntries(Object.entries(b.genome.defects||{}).map(([k,p])=>[k,pack(p)]))},records:b.records.map(record)}));
  const packReports=reports=>reports.map(r=>({...r,...(r.results?{results:r.results.map(record)}:{})}));
  return JSON.stringify({...s,birds,reports:packReports(s.reports),journal:packReports(s.journal),packedGenomes:1,raceFields:fields,raceReplays:replays});
}

function racingState(){
  const s=R.initial();s.stage='running';s.money=1000000;read(s);
  const b=R.own(s)[0],options=R.raceOptions(s,b,s.week),e=options.find(e=>e.distance===1200)||options[0];
  const r=R.race(s,b,e);
  const report={id:`report-${s.serial++}`,type:'weekly',title:'保存検証',text:'保存検証',expression:'talk',week:s.week,results:[{...r,birdId:b.id,birdName:b.name}]};
  s.reports.push(report);s.journal.push({...report});return {s,b,r};
}

test('full serialization is byte-identical for shared values, separate equal copies and loaded saves',()=>{
  const {s,b,r}=racingState();
  for(const state of [s,structuredClone(s),R.deserializeState(previousSerialize(s))]){
    assert.equal(R.serializeState(state),previousSerialize(state));
    assert.deepEqual(R.deserializeState(R.serializeState(state)),state);
  }
  // An equal independent replay still merges, just as it did before.
  const duplicate=structuredClone(r);duplicate.week++;b.records.push(duplicate);
  assert.equal(R.serializeState(s),previousSerialize(s));
  assert.equal(JSON.parse(R.serializeState(s)).raceReplays.length,1);
  // No cache survives a save, even when the same nested objects are edited.
  r.field[0].name='ハネカゼノツバサ';r.replay.runners[0].samples[1][2]+=.01;
  b.genome.quality.speed[0][0]=1-b.genome.quality.speed[0][0];
  assert.equal(R.serializeState(s),previousSerialize(s));
  assert.equal(JSON.parse(R.serializeState(s)).raceReplays.length,2);
});

test('indexed weekly advancement matches linear lookup through births, annual pruning and new rosters',()=>{
  const file=require.resolve('../public/js/ranch-engine.js');
  const source=fs.readFileSync(file,'utf8')
    .replace('return context.byId.get(id);','return s.birds.find(b=>b.id===id);')
    .replace('const settled=settledEvents.get(e.name);',
      'const settled=s.birds.flatMap(b=>b.records.filter(r=>r.week===s.week&&r.name===e.name&&r.rank===1).map(r=>({b,r})))[0];');
  const context=vm.createContext({module:{exports:{}},require:createRequire(file)});
  vm.runInContext(source,context,{filename:file});const linear=context.module.exports;
  const s=R.initial();s.week=48;s.stage='running';s.money=1000000;read(s);
  R.own(s)[0].policy='challenge';
  const mother=R.bird(s,s.sale[0]);mother.owner='player';mother.role='mare';
  mother.pregnancy={sireId:R.sires(s)[0].id,due:49,fruit:'karabu'};
  const obsolete=structuredClone(mother);Object.assign(obsolete,{id:`bird-${s.serial++}`,owner:'archive',role:'archived',farm:R.MAJOR_FARMS[0].name,birthYear:-30,pregnancy:null,parents:[],graded:0});
  s.birds.push(obsolete);const baseline=structuredClone(s);
  for(let i=0;i<12;i++){
    read(s);while(baseline.reports.length)linear.acknowledge(baseline);
    assert.equal(JSON.stringify(R.advance(s)),JSON.stringify(linear.advance(baseline)));
    assert.equal(JSON.stringify(s),JSON.stringify(baseline),`week ${s.week}`);
  }
  assert.ok(!R.bird(s,obsolete.id));assert.ok(R.own(s).some(b=>b.role==='young'));
  assert.ok(R.validState(s));
  // Lookup indices cannot leak into a later operation, including a failed one.
  assert.throws(()=>R.advance(s),/報告/);read(s);
  const first=R.own(s)[0],replacement=structuredClone(first);replacement.name='ハネカゼノツバサ';
  s.birds[s.birds.indexOf(first)]=replacement;assert.equal(R.bird(s,first.id),replacement);
  R.advance(s);assert.ok(R.validState(s));
});

test('a pre-settled background event is not simulated or paid again on weekly advancement',()=>{
  const s=R.initial();s.stage='running';s.money=1000000;read(s);
  const b=R.own(s)[0];Object.assign(b,{birthYear:-2,wins:3,races:3});
  let event;
  for(let week=s.week;week<=48&&!event;week++){
    event=R.calendar(week).find(e=>e.level==='GI'&&R.eligible({...s,week},b,e));
    if(event)s.week=week;
  }
  assert.ok(event);R.race(s,b,event);read(s);
  const records=()=>s.birds.flatMap(b=>b.records.filter(r=>r.week===event.week&&r.name===event.name));
  const snapshot=JSON.stringify(records()),races=b.races,earnings=b.earnings;
  R.advance(s);
  assert.equal(JSON.stringify(records()),snapshot);assert.equal(b.races,races);assert.equal(b.earnings,earnings);
  assert.ok(R.validState(s));
});
