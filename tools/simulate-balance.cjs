const fs = require('node:fs');
const path = require('node:path');
const R = require('../public/js/race-physics.js');
const B = require('../public/js/balance-presets.js');
const Runner = require('../public/js/balance-runner.js');

const options = {dt:.1, course:'flat', policy:'search'};
const columns = B.DISTANCES.map(distance => Runner.column(B.PRESETS, distance, options));
const at = (column, preset) => column.results.find(r => r.id === preset.id);
const lines = [
  '# 距離別シミュレーションの実測例', '',
  '`node tools/simulate-balance.cjs --write`（または `npm run balance:report`）で再生成。平地・静止発走・乱数なし・刻み0.1秒。単独走の時計を比較。',
  '全個体・全距離で同じ作戦候補を探索した最速時計（全戦略の大域的最適解ではない）。太字は各距離の最速。', '',
  '| 個体 | ' + B.DISTANCES.map(d => `${d}m`).join(' | ') + ' |',
  '|---|' + B.DISTANCES.map(() => '---:|').join(''),
  ...B.PRESETS.map(p => '| ' + p.name + ' | ' + columns.map(c => {
    const r = at(c, p), value = `${r.time.toFixed(2)}秒 / ${r.rank}位`;
    return r.rank === 1 ? `**${value}**` : value;
  }).join(' | ') + ' |'), '',
  '## 最速個体と2位との差', '',
  '| 距離 | 最速個体 | 2位との差 | 巡航指示倍率 | スパート開始（残りm） |',
  '|---:|---|---:|---:|---:|',
  ...columns.map(c => {
    const [first, second] = [...c.results].sort((a, b) => a.time - b.time);
    return `| ${c.distance} | ${first.name} | ${(second.time - first.time).toFixed(2)}秒 | ${first.strategy.pace} | ${first.strategy.kickAt} |`;
  }), '',
  '## 内部パラメータ', '',
  '| パラメータ | ' + B.PRESETS.map(p => p.name).join(' | ') + ' |',
  '|---|' + B.PRESETS.map(() => '---:|').join(''),
  ...R.PARAMS.map(def => `| ${def.key} (${def.unit || '係数'}) | ` + B.PRESETS.map(p => R.parameters(p.parameters)[def.key]).join(' | ') + ' |'), '',
  '## オーバーペースの例', '',
];
const example = B.PRESETS[0];
const steady = Runner.run(example.parameters, {distance:2800, policy:'steady'});
const rush = Runner.run(example.parameters, {distance:2800, policy:'rush'});
lines.push(`${example.name}・2800m。巡航→残り400mスパートに対し、同じ指示に「最初の35秒だけ巡航速度×1.35」を追加。`, '',
  '| 作戦 | 最初の400m | 最後の400m | 全体 | ゴール時の脚疲労 |', '|---|---:|---:|---:|---:|',
  ...[['通常', steady], ['序盤を飛ばす', rush]].map(([label, r]) =>
    `| ${label} | ${r.splits[0].duration.toFixed(2)}秒 | ${r.splits.at(-1).duration.toFixed(2)}秒 | ${r.time.toFixed(2)}秒 | ${(r.state.fatigue * 100).toFixed(1)}% |`), '',
  '設定・数式・解釈の制約は [README](README.md) を参照。これは7羽の比較例であり、任意の相手・コースで得意距離を保証する補正ではない。', '');

console.log(lines.join('\n'));
if (process.argv.includes('--write')) {
  const directory = path.join(__dirname, '../docs/gamebalance');
  fs.mkdirSync(directory, {recursive:true});
  fs.writeFileSync(path.join(directory, 'RESULTS.md'), lines.join('\n'));
  fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({modelVersion:2, options, presets:B.PRESETS, columns,
    overpace:{id:example.id, distance:2800, steady, rush}}, null, 2) + '\n');
  const csv = ['distance_m,id,name,time_s,rank,gap_s,pace,kick_at_m,reserve_j_per_kg,leg_fatigue',
    ...columns.flatMap(c => c.results.map(r => [c.distance,r.id,r.name,r.time.toFixed(4),r.rank,r.gap.toFixed(4),
      r.strategy.pace,r.strategy.kickAt,r.state.reserve.toFixed(3),r.state.fatigue.toFixed(5)].join(',')))];
  fs.writeFileSync(path.join(directory, 'results.csv'), '\uFEFF' + csv.join('\n') + '\n');
}
