'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const manifest = require('../public/assets/chocobo-sprite-study/v5/manifest.json');
test('podium holds the greeting poses and reproduces both directions after seeking', async () => {
  const { podiumFrame, RaceViewer2D } = await import('../public/js/race-viewer-2d.js'), m = manifest.motions.podium;
  const samples = [[0, 0], [.401, 0], [.601, 1], [.801, 2], [1.401, 3], [1.601, 4], [2.201, 5], [2.401, 6], [3.001, 7], [3.201, 0]];
  for (const [time, expected] of samples) assert.equal(podiumFrame(m, time), expected);
  assert.equal(podiumFrame(m, -5), 0);
  const calls = [], plaques = [], own = { id: 'winner', name: 'アオバ', color: 'blue', crest: 'red' }, view = { width: 720, height: 440, dir: -1 };
  const viewer = Object.assign(Object.create(RaceViewer2D.prototype), {
    ctx: { fillRect() {} }, $: () => ({ getBoundingClientRect: () => ({ height: 88 }) }), replay: { runners: [own] }, record: { birdId: own.id }, manifest,
    timeline: { award: 100 }, decor: { title: '優勝', confetti: 0 }, bird(...args) { calls.push(args); }, plaque(...args) { plaques.push(args); }
  });
  for (const elapsed of [0, .801, 2.401, .801, 3.201]) {
    viewer.time = 100 + elapsed; viewer.podium(view, 0);
    const call = calls.at(-1);
    assert.equal(call[0], own); assert.equal(call[2].dir, 1);
    assert.equal(call[3], podiumFrame(m, elapsed)); assert.equal(call[5], false); assert.equal(call[6], 'podium');
    assert.ok(call[1].y < view.height - 88, 'the podium bird stays above commentary');
    assert.ok(plaques.at(-2)[2] < call[1].y - call[4] * m.anchor.y, 'the title stays above the crest');
    assert.ok(plaques.at(-1)[2] < view.height - 88, 'the winner name stays above commentary');
  }
  assert.equal(view.dir, -1, 'the course camera must keep its own direction');
  assert.deepEqual(calls[1], calls[3], 'rewinding reproduces the same pose and position');
});
