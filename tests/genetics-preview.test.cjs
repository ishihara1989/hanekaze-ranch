'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const Observation=require('../public/js/ranch-observation.js');
const Preview=require('../public/js/genetics-preview.js');

test('preview uses all 32 real sources and preserves catalog state while switching stages',()=>{
  const s=Preview.createState(),before=JSON.stringify(s);
  assert.equal(s.birds.length,32);
  assert.deepEqual(s.birds.map(b=>b.name),R.ROOTS.map(b=>b.name));
  for(const b of s.birds)for(let i=0;i<Preview.STAGES.length;i++){
    const stage=Preview.STAGES[i],context={...s,milestones:{g1:stage.g1?s.week:0},facilities:{...s.facilities,lab:stage.lab,museum:stage.museum,statue:stage.statue}};
    const html=Preview.view(s,b,i);
    assert.ok(html.includes(Observation.genetics(context,b)),'preview renders the same observations as the game');
    assert.doesNotMatch(html,/data-genetic-part|基礎遺伝|遺伝補正/);
    if(i<3)assert.doesNotMatch(html,/data-score/);
    else assert.match(html,/data-score="power"/);
    if(i<2)assert.doesNotMatch(html,/<summary>遺伝の座位情報/);
    else assert.match(html,/遺伝の座位情報（全因子）|32座位|金因子/);
  }
  assert.equal(JSON.stringify(s),before);
});
test('comparison shows five stages and current status numbers appear only in the final stage',()=>{
  const s=Preview.createState(),b=s.birds[0],html=Preview.view(s,b,0,{compare:true,showStatus:true});
  assert.equal((html.match(/data-preview-stage="/g)||[]).length,5);
  const cards=html.split(/<article class="paper preview-stage"/).slice(1);
  assert.equal(cards.length,5);
  cards.forEach((card,i)=>{
    const current=card.match(/<section class="research status-record">([\s\S]*?)<\/section>/)[1];
    if(i===4)assert.match(current,/data-score="power"|成熟したときの伸びしろ/);
    else assert.doesNotMatch(current,/data-score|<meter/);
  });
});
