/* Shared experiment protocol for browser worker, CLI and regression tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./race-physics.js'));
  else root.BalanceRunner = factory(root.RacePhysics);
})(globalThis, function (R) {
  'use strict';
  const POLICIES = Object.freeze({search:'共通候補から最速を探索', steady:'巡航 → 残り400mでスパート',
    rush:'序盤35秒を飛ばす → 残り400m', allout:'発走から最高速を要求'});
  function run(parameters, options = {}) {
    const {policy = 'search', ...settings} = options;
    if (!(policy in POLICIES)) throw new RangeError('Unknown policy');
    if (policy === 'search') return R.optimize(parameters, settings);
    const strategy = policy === 'allout' ? {kickAt:settings.distance || 2000} :
      policy === 'rush' ? {pace:1, kickAt:400, openingBoost:.35, openingDuration:35} : {pace:1, kickAt:400};
    return R.simulate(parameters, {...settings, strategy});
  }
  function rank(results) {
    const order = [...results].filter(r => r.finished).sort((a, b) => a.time - b.time);
    return results.map(result => ({...result, rank: result.finished ? order.filter(r => r.time < result.time - 1e-9).length + 1 : null,
      gap:result.finished ? result.time - order[0].time : null}));
  }
  function column(presets, distance, options = {}) {
    return {distance, results:rank(presets.map(preset => ({id:preset.id, name:preset.name,
      ...run(preset.parameters, {...options, distance})})))};
  }
  function comparePacing(parameters, options = {}) {
    const {distance = 2400, dt = .1, course = 'flat'} = options;
    const p = R.parameters(parameters), settings = {distance, dt, course};
    if (!Number.isFinite(distance) || distance < 400 || distance > 3600) throw new RangeError('Pacing comparison distance must be 400–3600m');
    let constant = null, spurt = null, candidates = 0;
    // Fine search includes constant target speeds and early as well as late kicks.
    // No phase is awarded a bonus; every candidate calls the same simulator.
    for (let i = 650; i <= 1450; i += 5) {
      const pace = i / 1000;
      const result = R.simulate(p, {...settings, strategy:{pace, kickAt:0}});
      candidates++;
      if (result.finished && (!constant || result.time < constant.time)) constant = result;
      if (p.criticalSpeed * pace >= p.maxSpeed) continue;
      for (let kickAt = 50; kickAt < distance; kickAt += 50) {
        const result = R.simulate(p, {...settings, strategy:{pace, kickAt}});
        candidates++;
        if (result.finished && (!spurt || result.time < spurt.time)) spurt = result;
      }
    }
    if (!constant || !spurt) throw new Error('No pacing candidate finished');
    const allout = run(p, {...settings, policy:'allout'});
    const opening = run(p, {...settings, policy:'rush'});
    const cases = [
      {id:'spurt', name:'巡航 → スパート（詳細探索）', color:'#16867b', result:spurt},
      {id:'constant', name:'一定の目標速度（詳細探索）', color:'#4a71bb', result:constant},
      {id:'allout', name:'発走から最高速を要求', color:'#bc482c', result:allout},
      {id:'opening', name:'序盤35秒を飛ばす → 残り400m', color:'#ac710e', result:opening},
    ];
    return {parameters:p, distance, dt, course, search:{paceMin:.65, paceMax:1.45, paceStep:.005, kickStep:50, candidates},
      results:rank(cases.map(({result,...info}) => ({...info,
        ...R.simulate(p, {...settings, strategy:result.strategy, trace:true})})))};
  }
  return {POLICIES, run, rank, column, comparePacing};
});
