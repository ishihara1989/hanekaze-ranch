'use strict';
importScripts('race-physics.js', 'balance-runner.js', 'balance-presets.js');
self.onmessage = ({data}) => {
  const {id, type, presets, options} = data;
  try {
    if (type === 'pacing-example') {
      self.postMessage({id, type, comparison:BalanceRunner.comparePacing(BalancePresets.PACING_EXAMPLE.parameters,
        {distance:BalancePresets.PACING_EXAMPLE.distance})});
    } else if (type === 'matrix') {
      const columns = [];
      for (const distance of data.distances) {
        columns.push(BalanceRunner.column(presets, distance, options));
        self.postMessage({id, type:'progress', done:columns.length, total:data.distances.length});
      }
      self.postMessage({id, type, columns});
    } else if (type === 'traces') {
      const results = presets.map(p => ({id:p.id, ...RacePhysics.simulate(p.parameters,
        {...options, distance:data.distance, strategy:data.strategies[p.id], trace:true})}));
      self.postMessage({id, type, results});
    } else throw new Error('Unknown worker request');
  } catch (error) {
    self.postMessage({id, type:'error', message:error.message});
  }
};
