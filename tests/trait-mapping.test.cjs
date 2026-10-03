'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/js/trait-mapping.js');
const P = require('../public/js/race-physics.js');
const uniform = value => Object.fromEntries(M.ABILITIES.map(({key}) => [key, value]));

test('mapping is valid and fatigue remains costly at every 50/150 corner', () => {
  for (let mask = 0; mask < 256; mask++) {
    const abilities = Object.fromEntries(M.ABILITIES.map(({key}, i) => [key, mask & 1 << i ? 150 : 50]));
    const p = M.toPhysics(abilities);
    assert.ok(p.fatigueCost >= .27 && p.anaerobicFatigue >= .15);
    assert.ok(p.maxSpeed >= p.criticalSpeed);
    assert.ok(p.maxForce > p.linearCost);
    const expectedSupply = 64 * Math.exp(.18 * (abilities.cardio - 100) / 50);
    assert.ok(Math.abs(P.criticalPower(p) - expectedSupply) < 1e-10);
  }
});

test('economy improves sustainable speed without reducing aerobic supply', () => {
  const low = M.toPhysics({...uniform(100), economy: 50});
  const high = M.toPhysics({...uniform(100), economy: 150});
  assert.ok(high.criticalSpeed > low.criticalSpeed);
  assert.ok(Math.abs(P.criticalPower(high) - P.criticalPower(low)) < 1e-10);
  assert.ok(P.flatPower(18, high) < P.flatPower(18, low));
});

test('conditional scores are reproducible bounded normal draws without endpoint clipping', () => {
  const a = M.seededRandom(42), b = M.seededRandom(42);
  for (let i = 0; i < 100; i++) assert.deepEqual(M.generate({random: a}), M.generate({random: b}));
  const random = M.seededRandom(20260930);
  const scores = Array.from({length: 10000}, () => M.generate({random}));
  const xs = scores.map(s => s.speed);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean - 100) < .3);
  assert.ok(Math.abs(sd - 10) < .3);
  for (const quality of [50, 70, 130]) for (let i = 0; i < 300; i++) {
    const s = M.generate({quality, distance: random() * 2 - 1, release: random() * 2 - 1, random});
    assert.ok(Object.values(s).every(x => x > 50 && x < 150));
  }
});

test('pedigree birth lotteries remain reachable with extreme inherited body tradeoffs', () => {
  const bounds=Object.fromEntries(M.ABILITIES.map(({key})=>[key,{lower:0,upper:0}]));
  for(const quality of [50,130])for(const distance of [-1,1])for(const release of [-1,1]){
    const options={quality,distance,release,birthBounds:bounds};
    const a=M.seededRandom(42),b=M.seededRandom(42);
    for(let i=0;i<100;i++){
      const scores=M.generate({...options,random:a});
      assert.deepEqual(scores,M.generate({...options,random:b}));
      assert.ok(Object.values(scores).every(value=>value>50&&value<150));
    }
  }
});

test('same-quality explosive and endurance types exchange advantage across distance and time steps', () => {
  const sprint = M.toPhysics(M.generate({distance: -1, deviation: 0}));
  const endurance = M.toPhysics(M.generate({distance: 1, deviation: 0}));
  assert.ok(sprint.maxSpeed > endurance.maxSpeed && sprint.reserveCapacity > endurance.reserveCapacity);
  assert.ok(endurance.criticalSpeed > sprint.criticalSpeed && endurance.legEndurance > sprint.legEndurance);
  for (const dt of [.1, .05]) {
    const s1200 = P.optimize(sprint, {distance: 1200, dt});
    const e1200 = P.optimize(endurance, {distance: 1200, dt});
    const s3600 = P.optimize(sprint, {distance: 3600, dt});
    const e3600 = P.optimize(endurance, {distance: 3600, dt});
    assert.ok(s1200.time < e1200.time - 2);
    assert.ok(e3600.time < s3600.time - 3);
    assert.ok([s1200, e1200, s3600, e3600].every(r => r.finished));
  }
});

test('release tradeoff produces faster finishing kick but more expensive early full effort', () => {
  const early = M.toPhysics(M.generate({release: -1, deviation: 0}));
  const late = M.toPhysics(M.generate({release: 1, deviation: 0}));
  const samePace = p => P.simulate(p, {distance: 2400, strategy: {pace: 17 / p.criticalSpeed, kickAt: 400}});
  const a = samePace(early), b = samePace(late);
  assert.ok(b.splits.at(-1).duration < a.splits.at(-1).duration - .3);
  const allout = p => P.simulate(p, {distance: 2400, strategy: {kickAt: 2400}});
  assert.ok(allout(early).time < allout(late).time - 3);
});

test('positive quality improvements preserve same-type progress', () => {
  for (const distanceGene of [-.5, .5]) {
    const low = M.toPhysics(M.generate({quality: 70, distance: distanceGene, deviation: 0}));
    const high = M.toPhysics(M.generate({quality: 100, distance: distanceGene, deviation: 0}));
    for (const distance of [1200, 2400, 3600]) {
      assert.ok(P.optimize(high, {distance}).time < P.optimize(low, {distance}).time);
    }
  }
});

test('malformed abilities and genetics are rejected', () => {
  for (const value of [NaN, Infinity, 49, 151]) assert.throws(() => M.toPhysics({...uniform(100), speed: value}), RangeError);
  assert.throws(() => M.toPhysics({}), RangeError);
  assert.throws(() => M.generate({distance: 2}), RangeError);
  assert.throws(() => M.generate({quality: 40}), RangeError);
  assert.throws(() => M.generate({deviation: -1}), RangeError);
});
