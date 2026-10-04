'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {R,read}=require('../tools/lib/ranch-fixtures.cjs');
const copy=structuredClone;

function neutralBird(source,loci=10){
  const b=copy(source),value=50+2.5*loci;
  b.genome.quality=Object.fromEntries(Object.keys(b.genome.quality).map(key=>[key,Array.from({length:32},(_,i)=>[Number(i<loci),Number(i<loci)])]));
  b.genome.character=Object.fromEntries(Object.keys(R.PERSONALITY).map(key=>[key,[value,value]]));
  b.genome.defects={};b.genome.distance=[0,0];b.genome.release=[0,0];
  for(const group of ['aptitude','development'])for(const key of Object.keys(b.genome.traits[group]))b.genome.traits[group][key]=[.5,.5];
  b.g1=0;b.graded=0;b.wins=0;b.records=[];
  return b;
}

test('source breeding merit stays around 3000 G and stronger inherited averages span the intermediate price bands',()=>{
  const s=R.initial(),sources=R.sires(s).filter(b=>b.kind==='root');
  for(const b of sources)assert.ok(R.marePrice(b)>=2000&&R.marePrice(b)<=4000,b.name);
  const prices=[10,15,20,25,30].map(n=>R.marePrice(neutralBird(sources[0],n)));
  for(let i=1;i<prices.length;i++)assert.ok(prices[i]>prices[i-1]);
  for(const [i,min,max] of [[1,10000,100000],[2,100000,1000000],[3,1000000,10000000]])assert.ok(prices[i]>=min&&prices[i]<max);
  const b=neutralBird(sources[0],20),price=R.marePrice(b);
  Object.keys(b.potential).forEach(key=>b.potential[key]=150);
  Object.keys(b.training).forEach(key=>b.training[key]=1);
  Object.keys(b.personality).forEach(key=>b.personality[key]=150);
  Object.assign(b,{condition:5,strain:95,health:4});
  assert.equal(R.marePrice(b),price);
});

test('aptitudes make small independent changes and dirt or sprint specialties receive lower valuations',()=>{
  const base=neutralBird(R.sires(R.initial())[0],20),price=R.marePrice(base);
  for(const key of Object.keys(R.Genetics.COURSE_APTITUDES)){
    const b=copy(base);b.genome.traits.aptitude[key]=[1,1];
    assert.ok(R.marePrice(b)>price&&R.marePrice(b)<price*1.05,key);
  }
  const dirt=copy(base);dirt.genome.traits.aptitude.dirt=[1,1];dirt.genome.traits.aptitude.turf=[0,0];
  const turf=copy(base);turf.genome.traits.aptitude.turf=[1,1];turf.genome.traits.aptitude.dirt=[0,0];
  const sprint=copy(base);sprint.genome.distance=[-1,-1];
  assert.ok(R.marePrice(dirt)<price);assert.ok(R.marePrice(turf)>price);assert.ok(R.marePrice(sprint)<price);
  const developed=copy(base);developed.genome.traits.development.slowDecline=[1,1];
  assert.ok(R.marePrice(developed)>price&&R.marePrice(developed)<price*1.03);
});

test('career premiums rise through ordinary wins to graded wins and genetic merit affects champions too',()=>{
  const base=neutralBird(R.sires(R.initial())[0],20);
  const priceFor=(level,surface='turf',distance=1800)=>{
    const b=copy(base);b.wins=1;b.graded=/^G/.test(level)?1:0;b.g1=level==='GI'?1:0;
    b.records=[{level,rank:1,finished:true,surface,distance,name:'テスト'}];return R.marePrice(b);
  };
  const prices=['new','c1','c2','c3','open','GIII','GI'].map(level=>priceFor(level));
  for(let i=1;i<prices.length;i++)assert.ok(prices[i]>prices[i-1]);
  assert.ok(priceFor('GI','dirt')<priceFor('GI'));assert.ok(priceFor('GI','turf',1400)<priceFor('GI'));
  const champion=copy(base);champion.g1=1;champion.graded=1;champion.wins=1;
  champion.records=[{level:'GI',rank:1,finished:true,surface:'turf',distance:1800,name:'テスト'}];
  const stronger=neutralBird(champion,25);Object.assign(stronger,{g1:1,graded:1,wins:1,records:copy(champion.records)});
  assert.ok(R.marePrice(stronger)>R.marePrice(champion));
});

test('sale expansion supplies affordable, tens of thousands, hundreds of thousands and millions without invented wins',()=>{
  for(const seed of [20260930,1,42,999]){
    const s=R.initial(seed),lots=s.sale.map(id=>R.bird(s,id));
    assert.ok(lots.length>7);assert.equal(new Set(s.sale).size,s.sale.length);
    for(const [min,max] of [[1000,10000],[10000,100000],[100000,1000000],[1000000,10000000],[100000000,Infinity]])
      assert.ok(lots.some(b=>b.price>=min&&b.price<max),`${seed}: ${min}`);
    const imported=lots.filter(b=>b.comment.includes('繁殖用に育て'));
    assert.equal(imported.length,6);
    for(const b of imported){
      assert.equal(b.races,0);assert.equal(b.records.length,0);assert.equal(b.g1,0);assert.equal(b.parents.length,2);
      assert.ok(b.parents.every(id=>R.bird(s,id)));assert.equal(b.price,R.marePrice(b));
    }
    assert.ok(lots.some(b=>b.races>0&&!b.graded));assert.ok(R.validState(s));
    const loaded=R.upgradeState(R.deserializeState(R.serializeState(s)));assert.deepEqual(loaded,s);
  }
});

test('legacy market expansion preserves purchased birds, original lots, money and RNG, and runs once',()=>{
  const s=R.initial(),owned=R.buy(s,s.sale[0]);read(s);
  const legacyIds=s.sale.filter((id,i)=>i<3||R.bird(s,id).graded).slice(0,7);
  for(const id of s.sale)if(!legacyIds.includes(id)){const b=R.bird(s,id);b.owner='archive';b.role='archived';}
  s.sale=legacyIds.slice();delete s.mareMarketVersion;
  for(const id of s.sale)if(R.bird(s,id).owner==='sale')R.bird(s,id).price=2800;
  const before=copy(owned),money=s.money,rng=s.rng;
  R.upgradeState(s);
  assert.deepEqual(owned,before);assert.equal(s.money,money);assert.equal(s.rng,rng);
  assert.ok(legacyIds.every(id=>s.sale.includes(id)));assert.ok(s.sale.length>legacyIds.length);
  for(const id of s.sale){const b=R.bird(s,id);if(b.owner==='sale')assert.equal(b.price,R.marePrice(b));}
  const upgraded=copy(s);R.upgradeState(s);assert.deepEqual(s,upgraded);assert.ok(R.validState(s));
});

test('annual sale replaces unsold lots while retaining their genes and ancestry',()=>{
  const s=R.initial();s.stage='running';read(s);s.week=48;
  const oldIds=s.sale.slice(),before=new Map(oldIds.map(id=>[id,copy(R.bird(s,id).genome)]));
  R.advance(s);read(s);
  assert.equal(s.marketYear,2);assert.ok(s.sale.length>=9);assert.ok(!s.sale.some(id=>oldIds.includes(id)));
  for(const id of oldIds){assert.equal(R.bird(s,id).owner,'archive');assert.deepEqual(R.bird(s,id).genome,before.get(id));}
  assert.ok(R.validState(s));
});
