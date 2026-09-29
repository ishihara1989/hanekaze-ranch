const {test} = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/js/race-physics.js');
const B = require('../public/js/balance-presets.js');
const X = require('../public/js/balance-runner.js');

test('each preset wins only its intended distance, without reading aptitude metadata', () => {
  assert.deepEqual(B.DISTANCES, [1200,1600,2000,2400,2800,3200,3600]);
  const anonymous = B.PRESETS.map((p, i) => ({id:p.id, name:String(i), parameters:p.parameters}));
  for (const distance of B.DISTANCES) {
    const results = X.column(anonymous, distance).results.sort((a,b) => a.time - b.time);
    assert.ok(results.every(r => r.finished));
    assert.equal(results[0].id, B.PRESETS.find(p => p.exampleDistance === distance).id);
    assert.ok(results[1].time - results[0].time > .4, `${distance}: winning margin`);
  }
});

test('halving the timestep preserves all seven winners and close finish times', () => {
  for (const distance of B.DISTANCES) {
    const normal = X.column(B.PRESETS, distance).results;
    const fine = X.column(B.PRESETS, distance, {dt:.05}).results;
    assert.equal(fine.find(r => r.rank === 1).id, normal.find(r => r.rank === 1).id);
    for (let i = 0; i < fine.length; i++) assert.ok(Math.abs(fine[i].time - normal[i].time) < .4,
      `${distance}/${fine[i].id}: ${fine[i].time} vs ${normal[i].time}`);
  }
});

test('power costs grow nonlinearly; faster cruise needs more absolute energy', () => {
  const p = R.parameters();
  assert.ok(R.flatPower(22,p) - R.flatPower(20,p) > R.flatPower(17,p) - R.flatPower(15,p));
  assert.ok(R.criticalPower({...p,criticalSpeed:19}) > R.criticalPower({...p,criticalSpeed:16}));
});

test('settled running below critical speed does not drain W; exceeding supply does', () => {
  const p = R.parameters(), speed = 15;
  const state = {...R.createState(p), speed, aerobic:R.flatPower(speed,p)};
  const easy = R.step(state,p,.1,speed);
  assert.equal(easy.reserve,p.reserveCapacity);
  const accelerated = R.step(state,p,.1,22);
  assert.ok(accelerated.reserve < easy.reserve);
  assert.ok(accelerated.power > easy.power);
  const slow = R.parameters({criticalSpeed:15}), fast = R.parameters({criticalSpeed:19});
  const effort = p => R.step({...R.createState(p),speed:19,aerobic:R.criticalPower(p)},p,.1,19);
  assert.ok(effort(slow).reserve < slow.reserveCapacity);
  assert.equal(effort(fast).reserve,fast.reserveCapacity);
});

test('warmup lag consumes reserve; low demand recovers it slowly within capacity', () => {
  const p = R.parameters();
  const warm = {...R.createState(p),speed:17,aerobic:R.criticalPower(p)};
  const cold = {...warm,aerobic:10};
  assert.ok(R.step(cold,p,.1,17).reserve < R.step(warm,p,.1,17).reserve);
  const recovery = R.step({...warm,speed:10,reserve:1000},p,.1,10);
  assert.ok(recovery.reserve > 1000 && recovery.reserve < 1001);
  assert.equal(R.step({...warm,speed:10},p,.1,10).reserve, p.reserveCapacity);
});

test('capacity and discharge rate are independent: doubling W does not double acceleration', () => {
  const p = R.parameters({anaerobicPower:10}), big = {...p,reserveCapacity:p.reserveCapacity*2};
  const start = p => ({...R.createState(p),speed:18,aerobic:R.criticalPower(p)});
  const a = R.step(start(p),p,.1,23), b = R.step(start(big),big,.1,23);
  assert.equal(a.speed,b.speed);
  const powerful = {...p,anaerobicPower:90};
  assert.ok(R.step(start(powerful),powerful,.1,23).speed > a.speed);
});

test('empty reserve limits power; tired legs limit acceleration even with reserve left', () => {
  const p = R.parameters(), ready = {...R.createState(p),speed:17,aerobic:R.criticalPower(p)};
  const fresh = R.step(ready,p,.1,23), empty = R.step({...ready,reserve:0},p,.1,23);
  const tired = R.step({...ready,fatigue:.9},p,.1,23);
  assert.ok(empty.speed < fresh.speed);
  assert.ok(tired.speed < ready.speed);
  assert.ok(tired.reserve > p.reserveCapacity*.95);
});

test('uphill costs more power, downhill costs less but still fatigues legs', () => {
  const p = R.parameters(), state = {...R.createState(p),speed:17,aerobic:R.criticalPower(p)};
  const flat = R.step(state,p,.1,17,0), up = R.step(state,p,.1,17,.025), down = R.step(state,p,.1,17,-.025);
  assert.ok(up.power > flat.power && flat.power > down.power);
  assert.ok(up.reserve < flat.reserve);
  assert.ok(down.fatigue > 0);
  assert.equal(R.courseSlope('hills',400),.025);
  assert.equal(R.courseSlope('hills',800),-.025);
  assert.equal(R.courseSlope('hills',1600),.025);
});

test('front loading effort gains an early lead but loses the long race through fatigue', () => {
  const p = B.PRESETS[0].parameters;
  const steady = X.run(p,{distance:2800,policy:'steady'}), rush = X.run(p,{distance:2800,policy:'rush'});
  assert.ok(rush.splits[0].time < steady.splits[0].time - 5);
  assert.ok(rush.splits.at(-1).duration > steady.splits.at(-1).duration + 20);
  assert.ok(rush.time > steady.time + 20);
});

test('trace, laps and energy accounting remain finite, bounded and deterministic', () => {
  for (const course of ['flat','hills']) for (const preset of [...B.PRESETS, B.PACING_EXAMPLE]) {
    const p = R.parameters(preset.parameters);
    const result = X.run(p,{distance:3600,policy:'rush',course,trace:true});
    assert.equal(result.samples.at(-1).time, result.state.time);
    for (const state of result.samples) {
      assert.ok(Object.values(state).every(Number.isFinite));
      assert.ok(state.speed >= 0 && state.speed <= p.maxSpeed);
      assert.ok(state.reserve >= 0 && state.reserve <= p.reserveCapacity);
      assert.ok(state.aerobic >= 0 && state.aerobic <= R.criticalPower(p) + 1e-10);
      assert.ok(state.fatigue >= 0 && state.fatigue <= 1);
      assert.ok(Math.abs(state.reserve - (p.reserveCapacity - state.reserveSpent + state.reserveRecovered)) < 1e-7);
    }
    if (result.finished) {
      assert.equal(result.splits.length,9); assert.equal(result.state.distance,3600);
      assert.ok(Math.abs(result.splits.reduce((sum,s) => sum+s.duration,0) - result.time) < 1e-8);
    }
  }
  const options = {distance:1200,trace:true};
  assert.deepEqual(R.simulate(B.PRESETS[0].parameters,options),R.simulate(B.PRESETS[0].parameters,options));
});

test('DNF is explicit and unranked, even when no candidate finishes', () => {
  const r = R.optimize(B.PRESETS[0].parameters,{distance:1200,maxTime:1,trace:true});
  assert.equal(r.finished,false); assert.equal(r.time,null); assert.equal(r.state.time,1);
  assert.equal(r.samples.at(-1).time,1);
  const results = X.rank([{id:'fail',...r},{id:'finish',finished:true,time:60}]);
  assert.equal(results[0].rank,null); assert.equal(results[0].gap,null); assert.equal(results[1].rank,1);
  const tied = X.rank([{id:'a',finished:true,time:60},{id:'b',finished:true,time:60},{id:'c',finished:true,time:61}]);
  assert.deepEqual(tied.map(r => r.rank),[1,1,3]);
});

test('invalid parameters, integration steps, policies and courses fail explicitly', () => {
  for (const input of [{criticalSpeed:NaN},{maxSpeed:12},{reserveCapacity:-1},{cardioTau:0},{maxForce:4,linearCost:5}])
    assert.throws(() => R.parameters(input),RangeError);
  for (const options of [{distance:0},{dt:0},{dt:1},{sampleEvery:0},{maxTime:0},{course:.3},
    {course:[{from:0,to:100,slope:0},{from:90,to:150,slope:.02}]}])
    assert.throws(() => R.simulate({},options),RangeError);
  assert.throws(() => X.run({},{policy:'unknown'}),RangeError);
});

test('anaerobic use adds fatigue and existing fatigue raises energy cost at the same speed', () => {
  const p = R.parameters(), ready = {...R.createState(p),speed:19,aerobic:R.criticalPower(p)};
  const base = R.step(ready,p,.1,19);
  const coupled = R.step(ready,{...p,anaerobicFatigue:.6},.1,19);
  assert.equal(coupled.speed,base.speed); assert.equal(coupled.reserve,base.reserve);
  assert.ok(coupled.fatigue > base.fatigue);
  const tired = {...ready,speed:16,aerobic:R.flatPower(16,p),fatigue:.4};
  const efficient = R.step(tired,p,.1,16), expensive = R.step(tired,{...p,fatigueCost:.5},.1,16);
  assert.equal(expensive.speed,efficient.speed);
  assert.ok(expensive.power > efficient.power);
  assert.ok(expensive.reserve < efficient.reserve);
});

test('late spurt beats both all-out and finely tuned constant targets, with a genuinely faster final lap', () => {
  const p = B.PACING_EXAMPLE.parameters;
  const comparison = X.comparePacing(p,{distance:2400});
  const spurt = comparison.results.find(r => r.id === 'spurt');
  const constant = comparison.results.find(r => r.id === 'constant');
  const allout = comparison.results.find(r => r.id === 'allout');
  assert.ok(comparison.search.candidates > 6000);
  assert.ok(spurt.time < constant.time - 1);
  // Rule out a coarse constant-pace grid creating a false last-spurt advantage.
  let finerConstant = Infinity;
  for (let i = 1300; i <= 2900; i++) finerConstant = Math.min(finerConstant,
    R.simulate(p,{distance:2400,strategy:{pace:i/2000,kickAt:0}}).time);
  assert.ok(spurt.time < finerConstant - 1);
  assert.ok(spurt.time < allout.time - 10);
  assert.ok(spurt.strategy.kickAt >= 200 && spurt.strategy.kickAt <= 600);
  assert.ok(spurt.splits.at(-1).duration < spurt.splits.at(-2).duration - 2);
  assert.ok(Math.max(...spurt.samples.map(s => s.speed)) > spurt.splits[3].speed + 3);
  assert.equal(spurt.rank,1);
  const fine = R.simulate(p,{distance:2400,dt:.05,strategy:spurt.strategy});
  assert.ok(Math.abs(fine.time - spurt.time) < .15);
});

test('fine pacing search preserves the late-spurt advantage with half-sized integration steps', () => {
  const comparison = X.comparePacing(B.PACING_EXAMPLE.parameters,{distance:2400,dt:.05});
  const spurt = comparison.results.find(r => r.id === 'spurt');
  const constant = comparison.results.find(r => r.id === 'constant');
  assert.equal(spurt.rank,1);
  assert.ok(spurt.time < constant.time - 1);
  assert.ok(spurt.splits.at(-1).duration < spurt.splits.at(-2).duration - 2);
});
