'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {R,racer}=require('../tools/lib/ranch-fixtures.cjs');

test('shared world history preserves seed-dependent initial states and isolates nested career data',()=>{
  const first=R.initial(123),same=R.initial(123),different=R.initial(456);
  assert.deepEqual(first,same);assert.notEqual(first.rng,different.rng);
  assert.notDeepEqual(R.bird(first,first.sale[0]).genome,R.bird(different,different.sale[0]).genome);
  const sire=R.sires(first).find(b=>b.farm),other=R.bird(same,sire.id);
  const record=structuredClone(other.records[0]);
  sire.records[0].field[0].name='テスト';sire.genome.quality.speed[0][0]^=1;
  assert.deepEqual(other.records[0],record);
  assert.notDeepEqual(sire.genome.quality.speed,other.genome.quality.speed);
});

test('registered offspring fixtures are independent and use real January registration',()=>{
  const first=racer(),second=racer();
  assert.equal(first.s.week,97);assert.ok(first.b.registered);assert.equal(first.b.role,'racing');
  assert.deepEqual(first,second);assert.ok(R.validState(first.s));
  first.b.training.speed=0;first.s.money=0;
  assert.equal(second.b.training.speed,.9);assert.ok(second.s.money>0);
});
