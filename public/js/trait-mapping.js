/* Proposed mature ability mapping for the balance lab; not connected to game saves. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./race-physics.js') : root.RacePhysics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TraitMapping = api;
})(globalThis, function (Physics) {
  'use strict';
  // D: endurance (+) / explosive (-). R: late release (+) / early sustained effort (-).
  const ABILITIES = Object.freeze([
    ['speed', '最高速', -18, 6], ['cardio', '心肺', 12, -5],
    ['power', '瞬発力', -14, 10], ['reserve', 'スパート容量', -20, 12],
    ['legs', '脚持久力', 16, -3], ['economy', '走行効率', 4, -1],
    ['start', '立ち上がり', -4, -14], ['resilience', '疲労耐性', 7, -14],
  ].map(([key, label, distance, release]) => Object.freeze({key, label, distance, release})));
  function bounded(value, lo, hi, name) {
    if (!Number.isFinite(value) || value < lo || value > hi) throw new RangeError(`${name}: ${lo}..${hi}`);
    return value;
  }
  function seededRandom(seed = 1) {
    let state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function normal(random) {
    const u = bounded(random(), 0, 1, 'random');
    const v = bounded(random(), 0, 1, 'random');
    return Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, u))) * Math.cos(2 * Math.PI * v);
  }
  function generate({quality = 100, distance = 0, release = 0, deviation = 10, random = Math.random} = {}) {
    bounded(distance, -1, 1, 'distance');
    bounded(release, -1, 1, 'release');
    bounded(deviation, 0, 20, 'deviation');
    const scores = {};
    for (const ability of ABILITIES) {
      const q = typeof quality === 'number' ? quality : quality[ability.key];
      bounded(q, 50, 130, `quality.${ability.key}`);
      const center = q + ability.distance * distance + ability.release * release;
      if (!deviation) scores[ability.key] = bounded(center, 50, 150, `center.${ability.key}`);
      else {
        // Rejection sampling, not clipping: no artificial pileup at 50 or 150.
        let sample;
        let attempts = 0;
        do {
          sample = center + deviation * normal(random);
          if (++attempts > 10000) throw new RangeError('Unable to sample bounded normal');
        } while (sample < 50 || sample > 150);
        scores[ability.key] = sample;
      }
    }
    return scores;
  }
  function toPhysics(scores) {
    const z = {};
    for (const {key} of ABILITIES) z[key] = (bounded(scores[key], 50, 150, key) - 100) / 50;
    const linearCost = 2.2 * Math.exp(-.09 * z.economy);
    const cubicCost = .004;
    const aerobicPower = 64 * Math.exp(.18 * z.cardio);
    let lo = 0, hi = 30;
    // Economy must improve speed at fixed aerobic supply, rather than also lowering supply.
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (linearCost * mid + cubicCost * mid ** 3 < aerobicPower) lo = mid;
      else hi = mid;
    }
    return Physics.parameters({
      criticalSpeed: (lo + hi) / 2, maxSpeed: 23 + 2 * z.speed,
      reserveCapacity: 2400 * Math.exp(.5 * z.reserve),
      anaerobicPower: 56 * Math.exp(.45 * z.power), maxForce: 9.4 + 1.3 * z.power,
      legEndurance: 430 * Math.exp(.5 * z.legs),
      fatigueCost: .45 * Math.exp(-.5 * z.resilience),
      anaerobicFatigue: .30 * Math.exp(-.65 * z.resilience),
      cardioTau: 9 * Math.exp(-.5 * z.start), initialAerobic: .4 + .1 * z.start,
      recoveryRate: .06 + .02 * z.cardio, linearCost, cubicCost,
    });
  }
  return Object.freeze({ABILITIES, generate, toPhysics, seededRandom});
});
