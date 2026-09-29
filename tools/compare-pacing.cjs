const fs = require('node:fs');
const path = require('node:path');
const R = require('../public/js/race-physics.js');
const B = require('../public/js/balance-presets.js');
const X = require('../public/js/balance-runner.js');
const example = B.PACING_EXAMPLE;
const comparison = X.comparePacing(example.parameters, {distance:example.distance});
const spurt = comparison.results.find(r => r.id === 'spurt');
const lines = [
  '# 巡航からラストスパートする方が速い例', '',
  '`node tools/compare-pacing.cjs --write` で再生成。平地・2400m・同じ個体「ユウナギ」・刻み0.1秒。',
  '元の7羽とは独立した追加例。無酸素エネルギー使用で増える脚疲労と、脚疲労による走行コスト増を使用する。距離やスパート時期への直接のボーナスはない。', '',
  `目標速度の倍率0.65〜1.45（0.005刻み）と、残り50〜2350m（50m刻み）を探索。一定の目標速度も探索し、実際には全力走になる重複を除いた${comparison.search.candidates}候補を比較する。全ペース配分の大域的な最適解を証明するものではない。`, '',
  '| 作戦 | 全体時計 | 最初の400m | 最後の400m | ゴール時の脚疲労 |',
  '|---|---:|---:|---:|---:|',
  ...comparison.results.map(r => `| ${r.name} | ${r.time.toFixed(3)}秒 | ${r.splits[0].duration.toFixed(3)}秒 | ${r.splits.at(-1).duration.toFixed(3)}秒 | ${(r.state.fatigue * 100).toFixed(1)}% |`), '',
  `スパート作戦は巡航倍率${spurt.strategy.pace}、目標${(spurt.parameters.criticalSpeed * spurt.strategy.pace).toFixed(2)}m/s、残り${spurt.strategy.kickAt}mで最高速を要求。`, '',
  '| 通過地点 | 400m区間時計 | 通過速度 | 予備容量 | 脚疲労 |',
  '|---:|---:|---:|---:|---:|',
  ...spurt.splits.map(s => `| ${s.distance}m | ${s.duration.toFixed(3)}秒 | ${s.speed.toFixed(2)}m/s | ${s.reserve.toFixed(1)}J/kg | ${(s.fatigue * 100).toFixed(1)}% |`), '',
  '最後の400mが直前の巡航区間より速い。一方、ゴール直前にはWが尽きて減速している。ゴールまで最高速を維持した例とは区別する。', '',
  '## パラメータ', '', '| パラメータ | 値 |', '|---|---:|',
  ...R.PARAMS.map(def => `| ${def.key} | ${comparison.parameters[def.key]} ${def.unit} |`), '',
  '## なぜ序盤を抑える方が速いか', '',
  '- 無酸素エネルギーの使用量に応じて脚疲労Lが増える。Wを早く使い切ると、その後も高いLで走り続ける。',
  '- 脚疲労は推進力だけでなく、同じ速度を出すための消費出力も増やす。序盤の高速走が、中盤の巡航まで重くする。',
  '- 巡航中にWと脚を残し、終盤に使えば、その追加負担を受ける残り距離が短い。',
  '- 一定の目標速度よりも速いことを細かい探索で確認。単に「全力よりまし」なだけの比較にはしていない。', '',
  'これはゲーム用のモデル仮説。単独走の例であり、風よけ・集団の位置取り・進路や相手の反応は含まない。元の7羽では追加2パラメータを0にしており、既存の距離別結果を保っている。', '',
  '[モデルの設計](README.md) / [元の7羽の距離別比較](RESULTS.md)', '',
];
console.log(lines.join('\n'));
if (process.argv.includes('--write')) {
  const directory = path.join(__dirname, '../docs/gamebalance');
  fs.mkdirSync(directory, {recursive:true});
  fs.writeFileSync(path.join(directory, 'PACING.md'), lines.join('\n'));
  fs.writeFileSync(path.join(directory, 'pacing.json'), JSON.stringify({modelVersion:2, example, comparison}, null, 2) + '\n');
}
