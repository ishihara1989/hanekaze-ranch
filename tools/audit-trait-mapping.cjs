'use strict';
const fs = require('node:fs');
const path = require('node:path');
const M = require('../public/js/trait-mapping.js');
const P = require('../public/js/race-physics.js');
const Runner = require('../public/js/balance-runner.js');
const distances = [1200, 1600, 2000, 2400, 2800, 3200, 3600];
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = xs => {const center = mean(xs); return Math.sqrt(mean(xs.map(x => (x - center) ** 2)));};
const correlation = (xs, ys) => {
  const mx = mean(xs), my = mean(ys);
  return mean(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sd(xs) / sd(ys);
};
const rounded = x => Number(x.toFixed(3));
const compact = run => ({time: run.time, finished: run.finished, strategy: run.strategy,
  reserveFraction: run.state.reserve / run.parameters.reserveCapacity, fatigue: run.state.fatigue});
function run() {
  const report = {seed: 20260930, dt: .1, distances, distribution: [], cohorts: [], canonical: [], release: []};
  const random = M.seededRandom(report.seed);
  for (const quality of [70, 100]) {
    const scores = Array.from({length: 10000}, () => M.generate({quality, random}));
    report.distribution.push({quality, n: scores.length, fixedGenetics: {distance: 0, release: 0}, abilities:
      M.ABILITIES.map(({key, label}) => {
        const values = scores.map(s => s[key]);
        return {key, label, mean: rounded(mean(values)), sd: rounded(sd(values)), min: rounded(Math.min(...values)), max: rounded(Math.max(...values))};
      })});
    const birds = Array.from({length: 84}, (_, id) => {
      const distanceGene = random() * 2 - 1, releaseGene = random() * 2 - 1;
      const abilities = M.generate({quality, distance: distanceGene, release: releaseGene, random});
      const parameters = M.toPhysics(abilities);
      return {id, distanceGene, releaseGene, abilities, parameters,
        races: distances.map(distance => compact(P.optimize(parameters, {distance, dt: report.dt})))};
    });
    const ranks = birds.map(() => []);
    const byDistance = distances.map((distance, i) => {
      const ordered = birds.slice().sort((a, b) => a.races[i].time - b.races[i].time);
      ordered.forEach((bird, rank) => {ranks[bird.id][i] = rank + 1;});
      return {distance, minTime: rounded(ordered[0].races[i].time), meanTime: rounded(mean(ordered.map(b => b.races[i].time))),
        maxTime: rounded(ordered.at(-1).races[i].time), topQuartileMeanD: rounded(mean(ordered.slice(0, 21).map(b => b.distanceGene))),
        topQuartileMeanR: rounded(mean(ordered.slice(0, 21).map(b => b.releaseGene)))};
    });
    const statCorr = (a, b) => rounded(correlation(birds.map(bird => bird.abilities[a]), birds.map(bird => bird.abilities[b])));
    report.cohorts.push({quality, n: birds.length, byDistance,
      finishers: birds.reduce((n, b) => n + b.races.filter(r => r.finished).length, 0),
      speedCardioCorrelation: statCorr('speed', 'cardio'), powerLegsCorrelation: statCorr('power', 'legs'),
      distanceRankShiftCorrelation: rounded(correlation(birds.map(b => b.distanceGene), ranks.map(rs => rs[0] - rs.at(-1)))),
      birds});
  }
  for (const distanceGene of [-1, -.6666666667, -.3333333333, 0, .3333333333, .6666666667, 1]) {
    const abilities = M.generate({distance: distanceGene, release: 0, deviation: 0});
    const parameters = M.toPhysics(abilities);
    report.canonical.push({distanceGene, abilities, parameters,
      races: distances.map(distance => compact(P.optimize(parameters, {distance, dt: report.dt})))});
  }
  for (const releaseGene of [-1, 1]) {
    const abilities = M.generate({release: releaseGene, deviation: 0});
    const parameters = M.toPhysics(abilities);
    const comparison = Runner.comparePacing(parameters, {distance: 2400, dt: report.dt});
    const matched = P.simulate(parameters, {distance: 2400, dt: report.dt, strategy: {pace: 17 / parameters.criticalSpeed, kickAt: 400}});
    report.release.push({releaseGene, abilities, parameters,
      fineSearch: comparison.results.map(r => ({id: r.id, ...compact(r)})),
      commonPace: {targetSpeed: 17, kickAt: 400, time: matched.time, final400: matched.splits.at(-1).duration}});
  }
  const corners = Array.from({length: 256}, (_, mask) => {
    const abilities = Object.fromEntries(M.ABILITIES.map(({key}, i) => [key, mask & 1 << i ? 150 : 50]));
    const parameters = M.toPhysics(abilities);
    return distances.map(distance => P.optimize(parameters, {distance, dt: .2}).finished);
  });
  report.boundary = {abilityCorners: 256, dt: .2, runs: 256 * 7, finishers: corners.flat().filter(Boolean).length};
  return report;
}
function markdown(r) {
  const lines = ['# 能力マッピングの試走結果', '',
    '生成: `node tools/audit-trait-mapping.cjs --write`。係数の意味と未実装範囲は [ATTRIBUTE_MAPPING.md](ATTRIBUTE_MAPPING.md)。', '',
    `乱数seed=${r.seed}。平地・単独走・健康状態良好。通常dt=${r.dt}秒、全256隅の境界確認のみ0.2秒。作戦は共通139候補から最速を選ぶ。`,
    '性格・集団走・馬場・調教・実際の交配は含まない。時計はこの架空モデルの値で、実馬の記録との校正はしていない。', '',
    '## 能力分布（D=R=0固定、各10,000羽）', '',
    '| 品質中心 | 能力 | 実測平均 | 実測標準偏差 | 実測最小–最大 |', '|---:|---|---:|---:|---:|'];
  for (const d of r.distribution) for (const a of d.abilities) lines.push(`| ${d.quality} | ${a.label} | ${a.mean} | ${a.sd} | ${a.min}–${a.max} |`);
  lines.push('', '潜在正規分布のσは10。50〜150の外を棄却するため、下限に近い品質70では平均が少し上がり、標準偏差は少し縮む。遺伝型が混ざった集団全体のσが10という意味ではない。', '',
    '## ランダム集団（各84羽、D/Rは独立一様分布）', '',
    '| 品質中心 | 距離 | 最速 / 平均 / 最遅（秒） | 上位25%の平均D | 上位25%の平均R |', '|---:|---:|---|---:|---:|');
  for (const c of r.cohorts) for (const d of c.byDistance) lines.push(`| ${c.quality} | ${d.distance}m | ${d.minTime} / ${d.meanTime} / ${d.maxTime} | ${d.topQuartileMeanD} | ${d.topQuartileMeanR} |`);
  lines.push('', '| 品質中心 | 完走 / 総試走 | 最高速↔心肺の相関 | 瞬発力↔脚持久力の相関 | D↔長距離での順位改善の相関 |', '|---:|---:|---:|---:|---:|');
  for (const c of r.cohorts) lines.push(`| ${c.quality} | ${c.finishers} / ${c.n * 7} | ${c.speedCardioCorrelation} | ${c.powerLegsCorrelation} | ${c.distanceRankShiftCorrelation} |`);
  lines.push('', 'Dは正が持久型、負が瞬発型。順位改善は「1200m順位−3600m順位」。小集団の検査値であり出走集団・遺伝分布を変えた保証ではない。品質70と100は独立した標本なので世代差の厳密な因果比較には使わない。', '',
    '## 同品質・偏差なしでDだけを変える', '', '| D | ' + r.distances.map(d => `${d}m`).join(' | ') + ' |', '|---:|' + r.distances.map(() => '---:').join('|') + '|');
  for (const b of r.canonical) lines.push(`| ${b.distanceGene.toFixed(2)} | ${b.races.map(x => x.time.toFixed(2)).join(' | ')} |`);
  lines.push('', '各距離に必ず専用の勝者を作る制約は課していない。中間距離で極端型以外が勝てるかも、この表で確認する。', '',
    '## 持続型と放出型（D=0、品質100、偏差なし）', '',
    '| R | 巡航→スパート最速 | 一定目標最速 | 発走から全力 | 序盤35秒加速 | 共通17m/s→ラスト400mの最終400m |', '|---:|---:|---:|---:|---:|---:|');
  for (const b of r.release) {
    const times = ['spurt', 'constant', 'allout', 'opening'].map(id => b.fineSearch.find(x => x.id === id).time.toFixed(3));
    lines.push(`| ${b.releaseGene} | ${times.join(' | ')} | ${b.commonPace.final400.toFixed(3)} |`);
  }
  lines.push('', '2400m。詳細探索は巡航倍率0.65〜1.45を0.005刻み、スパート残距離50m刻み。R=−1が持続型、+1が放出型。共通ペースの比較は両者に同じ17m/sを要求する別条件であり、最速時計とは比較しない。',
    'Rだけで「逃げ・差し」が決まったとは扱わない。単独走では位置取りが存在せず、両型とも巡航→スパートが最速になりうる。相手との駆け引きによる脚質の成立は次の検証課題。', '',
    '## 入力範囲の境界', '', `${r.boundary.abilityCorners}通りの50/150の組合せ × 7距離で ${r.boundary.finishers}/${r.boundary.runs} 完走。疲労コストは全組合せで正。最高速≥巡航速度などの物理入力制約も満たす。`, '',
    '境界で完走することは、150にそろえた個体が出現しやすい・普通の時計になる、という意味ではない。極端な坂・馬場・低体力での安全性はこの検査の対象外。', '');
  return lines.join('\n');
}
if (require.main === module) {
  const result = run();
  const md = markdown(result);
  if (process.argv.includes('--write')) {
    const dir = path.join(__dirname, '../docs/gamebalance');
    fs.writeFileSync(path.join(dir, 'MAPPING_RESULTS.md'), md);
    fs.writeFileSync(path.join(dir, 'mapping-results.json'), JSON.stringify(result, null, 2) + '\n');
  }
  process.stdout.write(md);
}
module.exports = {run, markdown};
