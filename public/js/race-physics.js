/* Experimental race model. No dependency on breeding, UI stats or distance aptitude. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RacePhysics = api;
})(globalThis, function () {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  // Specific units: power W/kg, reserve J/kg, force N/kg, velocity m/s.
  const DEFAULTS = Object.freeze({
    criticalSpeed: 17, maxSpeed: 23, reserveCapacity: 1800,
    anaerobicPower: 45, maxForce: 9, cardioTau: 10,
    legEndurance: 210, recoveryRate: .08, fatigueCost: 0, anaerobicFatigue: 0,
    linearCost: 2.2, cubicCost: .004, initialAerobic: .35,
  });
  const PARAMS = Object.freeze([
    ['criticalSpeed', '巡航速度', 'm/s', 8, 25, .05],
    ['maxSpeed', '最高速度', 'm/s', 10, 32, .05],
    ['reserveCapacity', '無酸素容量', 'J/kg', 100, 10000, 10],
    ['anaerobicPower', '無酸素の最大出力', 'W/kg', 1, 200, 1],
    ['maxForce', '最大推進力', 'N/kg', 4, 20, .1],
    ['cardioTau', '心肺の立ち上がり時間', 's', 1, 40, .5],
    ['legEndurance', '脚の耐久時間', 's', 40, 1000, 1],
    ['fatigueCost', '脚疲労による走行コスト増', '倍', 0, 5, .05],
    ['anaerobicFatigue', '無酸素エネルギー使用による脚疲労', '比率', 0, 1, .05],
    ['recoveryRate', '予備容量の回復効率', '倍', 0, .5, .01],
    ['linearCost', '走行コスト（一次係数）', '', .5, 5, .05],
    ['cubicCost', '走行コスト（三次係数）', '', .001, .015, .0001],
    ['initialAerobic', '発走時の有酸素出力', '比率', 0, 1, .05],
  ].map(([key, label, unit, min, max, step]) => Object.freeze({key, label, unit, min, max, step})));
  function parameters(input = {}) {
    const p = {...DEFAULTS};
    for (const def of PARAMS) {
      if (input[def.key] !== undefined) p[def.key] = input[def.key];
      if (!Number.isFinite(p[def.key]) || p[def.key] < def.min || p[def.key] > def.max)
        throw new RangeError(`${def.key} must be between ${def.min} and ${def.max}`);
    }
    if (p.maxSpeed < p.criticalSpeed) throw new RangeError('maxSpeed must be >= criticalSpeed');
    if (p.maxForce <= p.linearCost) throw new RangeError('maxForce must exceed linearCost');
    return p;
  }
  const flatPower = (speed, p) => p.linearCost * speed + p.cubicCost * speed ** 3;
  const resistance = (speed, p) => p.linearCost + p.cubicCost * speed ** 2;
  const criticalPower = p => flatPower(p.criticalSpeed, p);
  function createState(p) {
    return {time: 0, distance: 0, speed: 0, aerobic: criticalPower(p) * p.initialAerobic,
      reserve: p.reserveCapacity, fatigue: 0, energyUsed: 0, reserveSpent: 0,
      reserveRecovered: 0, power: 0, force: 0, acceleration: 0, slope: 0};
  }
  function courseSlope(course, distance) {
    if (typeof course === 'number') return course;
    if (!course || course === 'flat') return 0;
    if (course === 'hills') {
      // Repeated 1200 m lap, with equal elevation gain/loss; independent of race length.
      const x = distance % 1200;
      return x >= 300 && x < 600 ? .025 : x >= 750 && x < 1050 ? -.025 : 0;
    }
    if (Array.isArray(course)) {
      const segment = course.find(s => distance >= s.from && distance < s.to);
      return segment ? segment.slope : 0;
    }
    throw new TypeError('Unknown course');
  }
  function validateCourse(course) {
    if (course === 'flat' || course === 'hills') return;
    const validSlope = x => Number.isFinite(x) && Math.abs(x) <= .2;
    if (typeof course === 'number' && validSlope(course)) return;
    if (Array.isArray(course) && course.every(s => s && Number.isFinite(s.from) && s.from >= 0 &&
      Number.isFinite(s.to) && s.to > s.from && validSlope(s.slope)) &&
      course.every((s, i) => i === 0 || s.from >= course[i - 1].to)) return;
    throw new RangeError('Course must have ordered, non-overlapping segments and slopes within ±0.2');
  }
  // A target speed is a rider request, not a direct velocity assignment.
  function step(state, p, dt, targetSpeed, slope = 0, traction = 1, effortCost = 1) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > .5 || !Number.isFinite(targetSpeed) ||
        !Number.isFinite(slope) || Math.abs(slope) > .2 || !Number.isFinite(traction) || traction < .7 || traction > 1 ||
        !Number.isFinite(effortCost) || effortCost < 1 || effortCost > 1.5) throw new RangeError('Invalid step');
    const v = state.speed;
    const demandAcceleration = clamp((clamp(targetSpeed, 0, p.maxSpeed) - v) / 1.5, -4, 6);
    const load = resistance(v, p) + 9.81 * slope;
    const requestedForce = Math.max(0, load + demandAcceleration);
    // Retain a small locomotion force even at full fatigue, so exhaustion means slowing.
    const forceLimit = Math.max(p.linearCost + .15, p.maxForce * traction * (1 - .88 * state.fatigue ** 2));
    const wantedForce = Math.min(requestedForce, forceLimit);
    // Mid-step speed prices start-up acceleration even when current velocity is zero.
    const workSpeed = Math.max(.5, v + .5 * Math.max(0, wantedForce - load) * dt);
    // Tired legs may also lose efficiency, so early fatigue has a continuing cost.
    // Force is effective ground thrust; muscle work pays for energy lost at contact.
    // Tension and unnecessary movements cost work, never grant extra aerobic supply.
    const workCost = workSpeed * (1 + p.fatigueCost * state.fatigue ** 2) / traction * effortCost;
    const requestedPower = wantedForce * workCost;
    const maxAerobic = criticalPower(p);
    const aerobicTarget = Math.min(maxAerobic, requestedPower);
    const nextAerobic = state.aerobic + (aerobicTarget - state.aerobic) * (1 - Math.exp(-dt / p.cardioTau));
    const supply = (state.aerobic + nextAerobic) / 2;
    const availablePower = supply + Math.min(p.anaerobicPower, state.reserve / dt);
    const force = Math.min(wantedForce, availablePower / workCost);
    const power = force * workCost;
    const spent = Math.max(0, power - supply) * dt;
    const recovered = Math.min(p.reserveCapacity - state.reserve, Math.max(0, supply - power) * p.recoveryRate * dt);
    const acceleration = Math.max(-4, demandAcceleration < 0 ? Math.min(force - load, demandAcceleration) : force - load);
    const speed = clamp(v + acceleration * dt, 0, p.maxSpeed);
    // Fixed reference load keeps high-force sprinters from automatically gaining endurance.
    const legLoad = (force / (4 * traction)) ** 3 + .04 * Math.max(0, acceleration) ** 2 +
      .03 * Math.max(0, -slope) * v ** 2;
    return {time: state.time + dt, distance: state.distance + (v + speed) * .5 * dt,
      speed, aerobic: nextAerobic, reserve: clamp(state.reserve - spent + recovered, 0, p.reserveCapacity),
      fatigue: clamp(state.fatigue + legLoad / p.legEndurance * dt + p.anaerobicFatigue * spent / p.reserveCapacity, 0, 1),
      energyUsed: state.energyUsed + power * dt, reserveSpent: state.reserveSpent + spent,
      reserveRecovered: state.reserveRecovered + recovered,
      power, force, acceleration: (speed - v) / dt, slope};
  }
  const DEFAULT_STRATEGY = Object.freeze({pace: 1, kickAt: 400, openingBoost: 0, openingDuration: 18});
  function strategy(input = {}) {
    const s = {...DEFAULT_STRATEGY, ...input};
    for (const [key, min, max] of [['pace', .65, 1.45], ['kickAt', 0, 3600],
      ['openingBoost', 0, .5], ['openingDuration', 0, 120]]) {
      if (!Number.isFinite(s[key]) || s[key] < min || s[key] > max) throw new RangeError(`Invalid strategy: ${key}`);
    }
    return s;
  }
  function targetFor(state, p, s, distance) {
    if (distance - state.distance <= s.kickAt) return p.maxSpeed;
    const boost = state.time < s.openingDuration ? s.openingBoost : 0;
    return Math.min(p.maxSpeed, p.criticalSpeed * (s.pace + boost));
  }
  function interpolate(a, b, fraction) {
    return Object.fromEntries(Object.keys(a).map(key => [key, a[key] + (b[key] - a[key]) * fraction]));
  }
  function simulate(input, options = {}) {
    const p = parameters(input), s = strategy(options.strategy);
    const {distance = 2000, dt = .1, course = 'flat', trace = false, sampleEvery = .5, maxTime = 1200} = options;
    if (!Number.isFinite(distance) || distance < 100 || distance > 10000 || !Number.isFinite(dt) ||
        dt < .025 || dt > .5 || !Number.isFinite(sampleEvery) || sampleEvery < dt ||
        !Number.isFinite(maxTime) || maxTime <= 0 || maxTime > 10000) throw new RangeError('Invalid simulation options');
    validateCourse(course);
    let state = createState(p), nextSample = sampleEvery, nextSplit = 400;
    const samples = trace ? [{...state}] : [], splits = [];
    while (state.distance < distance && state.time < maxTime) {
      const before = state;
      state = step(before, p, Math.min(dt, maxTime - before.time), targetFor(before, p, s, distance), courseSlope(course, before.distance));
      if (state.distance >= distance) {
        state = interpolate(before, state, (distance - before.distance) / (state.distance - before.distance));
        state.distance = distance;
      }
      while (nextSplit <= distance && state.distance >= nextSplit) {
        const at = interpolate(before, state, (nextSplit - before.distance) / (state.distance - before.distance));
        const previous = splits.length ? splits[splits.length - 1].time : 0;
        splits.push({distance: nextSplit, time: at.time, duration: at.time - previous,
          speed: at.speed, reserve: at.reserve, fatigue: at.fatigue});
        nextSplit += 400;
      }
      if (trace && (state.time >= nextSample || state.distance >= distance)) {
        samples.push({...state});
        nextSample += sampleEvery;
      }
    }
    if (trace && samples[samples.length - 1].time !== state.time) samples.push({...state});
    return {finished: state.distance >= distance, time: state.distance >= distance ? state.time : null,
      distance, parameters: p, strategy: s, state, splits, samples};
  }
  // Identical candidate policies for every bird and every distance. No preset labels are read.
  const SEARCH_PACES = Object.freeze(Array.from({length: 23}, (_, i) => Number((.85 + i * .025).toFixed(3))));
  const SEARCH_KICKS = Object.freeze([0, 200, 400, 600, 800, 1200]);
  function optimize(input, options = {}) {
    const distance = options.distance || 2000;
    let best = simulate(input, {...options, strategy: {kickAt: Math.min(distance, 3600)}, trace: false});
    let furthest = best;
    if (!best.finished) best = null;
    for (const pace of SEARCH_PACES) for (const kickAt of SEARCH_KICKS) {
      if (kickAt > (options.distance || 2000)) continue;
      const result = simulate(input, {...options, strategy: {pace, kickAt}, trace: false});
      if (result.state.distance > furthest.state.distance) furthest = result;
      if (result.finished && (!best || result.time < best.time)) best = result;
    }
    // A failed experiment is data too; do not discard the other finishers in a matrix.
    if (!best) best = furthest;
    return options.trace ? simulate(input, {...options, strategy: best.strategy}) : best;
  }
  return {DEFAULTS, PARAMS, DEFAULT_STRATEGY, SEARCH_PACES, SEARCH_KICKS, parameters,
    flatPower, resistance, criticalPower, createState, courseSlope, step, targetFor, simulate, optimize};
});
