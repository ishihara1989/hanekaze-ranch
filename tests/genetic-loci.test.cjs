'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Observation=require('../public/js/ranch-observation.js');
const Preview=require('../public/js/genetics-preview.js');
const R=require('../public/js/ranch-engine.js');
const row=(html,key)=>html.split(`data-locus-key="${key}"`)[1]?.split('<div class="gene-row"')[0];
const sequences=html=>[...html.matchAll(/<b class="gene-sequence"[^>]*>([\s\S]*?)<\/b>/g)].map(m=>m[1].replace(/<[^>]+>/g,''));

test('G1 and a built lab unlock all loci in either order without unlocking numeric scores',()=>{
  const s=Preview.createState(),b=s.birds[0],before=JSON.stringify(s);
  for(const lab of [0,1,3])for(const g1 of [0,9]){
    const context={...s,facilities:{...s.facilities,lab},milestones:{g1}},html=Observation.genetics(context,b);
    assert.equal(html.includes('遺伝の座位情報（全因子）'),Boolean(lab&&g1));
    assert.doesNotMatch(html,/data-score|成熟の目安/);
    assert.equal(Boolean(Observation.locusComparison(context,b,s.birds[1])),Boolean(lab&&g1));
  }
  assert.equal(JSON.stringify(s),before);
});

test('quality and defect strings retain every locus in order and treat both heterozygote orders identically',()=>{
  const s=Preview.createState(),b=s.birds[0];s.facilities.lab=1;s.milestones={g1:9};
  const pairs=[[0,0],[0,1],[1,0],[1,1]];
  b.genome.quality.speed=Array.from({length:32},(_,i)=>pairs[i%4]);
  const id=Object.keys(R.DEFECTS)[0],absent=Object.keys(R.DEFECTS).find(key=>!Object.hasOwn(b.genome.defects,key));
  b.genome.defects[id]=pairs;
  const before=JSON.stringify(s),html=Observation.genetics(s,b);
  assert.deepEqual(sequences(row(html,'quality.speed')),['◯◎◎☆'.repeat(8)]);
  assert.deepEqual(sequences(row(html,`defects.${id}`)),['◯△△X']);
  assert.deepEqual(sequences(row(html,`defects.${absent}`)),['◯◯◯◯']);
  for(const key of Object.keys(b.genome.quality))assert.equal(sequences(row(html,`quality.${key}`))[0].length,32);
  assert.equal(JSON.stringify(s),before,'reading genes preserves the save and RNG');
});

test('comparison aligns the father above the mother even when saved gene keys are ordered differently',()=>{
  const s=Preview.createState(),[father,mother]=s.birds;s.facilities.lab=1;s.milestones={g1:9};
  father.name='父<&>';mother.name='母<&>';
  father.genome.quality=Object.fromEntries(Object.entries(father.genome.quality).reverse());
  father.genome.quality.speed=Array.from({length:32},()=>[1,1]);
  mother.genome.quality.speed=Array.from({length:32},()=>[0,0]);
  const before=JSON.stringify(s),html=Observation.locusComparison(s,father,mother),speed=row(html,'quality.speed');
  assert.deepEqual(sequences(speed),['☆'.repeat(32),'◯'.repeat(32)]);
  assert.equal((speed.match(/class="gene-strip-scroll"/g)||[]).length,1,'both parents share horizontal scrolling');
  assert.match(speed,/<span class="gene-parent-label">父<\/span>[\s\S]*<span class="gene-parent-label">母<\/span>/);
  assert.match(html,/父：父&lt;&amp;&gt;<br>母：母&lt;&amp;&gt;/);
  assert.doesNotMatch(html,/父<&>|母<&>/);
  assert.equal((html.match(/data-locus-key="defects\./g)||[]).length,Object.keys(R.DEFECTS).length);
  assert.match(row(html,'distance'),new RegExp(father.genome.distance.join(' / ')));
  assert.match(row(html,'gold'),/g \/ g/);
  assert.equal(Observation.locusComparison(s,null,mother),'');
  assert.equal(Observation.locusComparison(s,father,null),'');
  assert.equal(JSON.stringify(s),before);
});
