'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {R}=require('../tools/lib/ranch-fixtures.cjs');
const B=require('../tools/lib/opening-balance.cjs');

test('all permitted starter offspring can win a general-only debut or maiden at 90% of potential',()=>{
  const audit=B.auditOpening();
  assert.equal(audit.rows.length,93);assert.equal(audit.blocked.length,3);
  for(const row of audit.rows){
    const label=`${row.mother}/${row.sire}`;
    assert.ok(!row.failedBirth,label);assert.ok(row.canWin,label);
    assert.equal(row.races.length,4,label);
    assert.ok(row.races.every(r=>r.fieldSize===12&&r.generalOnly&&r.allFinished),label);
    for(const [key,value] of Object.entries(row.abilities))
      assert.ok(Math.abs(value-Math.max(50,row.maximum[key]*.9))<1e-8,`${label}/${key}`);
  }
});

test('birth and virtual training preserve parental inheritance and the actual offspring lottery',()=>{
  const base=B.openingState(),before=structuredClone(base),{s,child}=B.generateOffspring(base,0,0);
  assert.deepEqual(base,before);assert.ok(R.validState(s));
  const original=structuredClone(child),parents=child.parents.map(id=>R.bird(s,id));
  for(const [key,loci] of Object.entries(child.genome.quality))for(let i=0;i<loci.length;i++){
    assert.ok(parents[0].genome.quality[key][i].includes(loci[i][0]));
    assert.ok(parents[1].genome.quality[key][i].includes(loci[i][1]));
  }
  const projected=B.projectAbilities(s,child);
  assert.deepEqual(child,original);assert.deepEqual(projected.b.genome,child.genome);
  assert.deepEqual(projected.b.personality,child.inborn);
  assert.equal(projected.b.condition,100);assert.equal(projected.b.strain,0);
});
