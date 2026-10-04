'use strict';
const fs=require('node:fs'),path=require('node:path');
const {R,auditBreeding}=require('./lib/breeding-balance.cjs');
const {historyKey}=require('./lib/ranch-fixtures.cjs');
const args=process.argv.slice(2);
const option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
// Read a matching genuine history, without starting any races on a cache miss.
const historyPath=option('--history',path.join(__dirname,'../tmp/test-fixtures',`${historyKey()}.json`));
if(!fs.existsSync(historyPath))throw Error('NPC history cache missing. Supply an existing history with --history FILE or prepare it with npm test. This audit never simulates races.');
const base=R.initial(20260930,{},fs.readFileSync(historyPath,'utf8'));
const audit=auditBreeding(base,{trials:Number(option('--trials',128)),generations:Number(option('--generations',16)),seed:Number(option('--seed',20261004))});
const f=n=>n.toFixed(2),gen=n=>n===null?'未到達':`${n}世代`;
const lines=['# 他牧場との反復配合によるG1能力検証','',
  `初期牝羽3羽それぞれ${audit.trials}試行、${audit.generations}世代、シード${audit.seed}。他牧場の公開種牡羽${audit.sireCount}羽から、配合後の競走8能力の遺伝期待値平均を最大にする合法な相手を毎世代選ぶ。羽房Lv.4（通常遺伝50%）と最大Lv.9（良いアレル75%）を比較。`, '',
  '能力は遺伝子から算出し、距離・脚質補正と発現した潜性欠点を含む。性格・丈夫さ・回復力・馬場適性は8能力平均に含めない。期待値は各アレルの継承確率、クロスによる変異確率、欠点のホモ接合確率から算出し、配合プレビューの上下限の中点は使わない。産駒は本番の createBird で抽選し、性別を牝羽に指定（産み分けの実と同じ指定）。各試行で生きた娘1羽を必ず次の母にする。良い娘の選別はしない。致死卵が出た場合だけ同じ組み合わせを再試行し、回数を記録。', '',
  `比較対象は初年度の全${audit.reference.events.length}G1の他牧場出走羽（各6羽）。一般参加の弱い補充羽は除外。同じ羽の複数出走は出走ごとに集計。全G1平均 **${f(audit.reference.mean)}**、最も高い組の平均 **${f(audit.reference.strongestFieldMean)}**、最強出走羽の8能力平均 **${f(audit.reference.bestEntrant)}**。`, '',
  '既存の実競走履歴キャッシュを読み込み、G1出走羽の生成と配合だけを行う。育成・週進行・レース物理は実行しない。比較集団と種牡羽市場は固定し、契約期限・繁殖年齢・費用・世代経過による他牧場の進化は仮定から外す。これは固定集団に対する遺伝能力の確認であり、将来市場や実勝率の検証ではない。G1実績による誕生能力抽選の補正も遺伝平均には含めない。', '',
  '| 羽房 | 初期牝羽 | G1平均を超える世代 | 最も高い組の平均を超える世代 | 最強羽を超える世代 | 最終世代平均 | 最終P10〜P90 |',
  '|---|---|---:|---:|---:|---:|---:|',
  ...audit.scenarios.map(s=>{const last=s.rows.at(-1);return `| Lv.${s.level} | ${s.mother} | ${gen(s.firstAboveReference)} | ${gen(s.firstAboveStrongestField)} | ${gen(s.firstAboveBest)} | ${f(last.mean)} | ${f(last.p10)}〜${f(last.p90)} |`;}),''];
for(const scenario of audit.scenarios){
  lines.push(`## Lv.${scenario.level}・${scenario.mother}`,'',
    '| 世代 | 平均 ± 標準誤差 | P10〜P90 | G1平均を超える個体 | 最強羽を超える個体 | 主な父（回数） |','|---:|---:|---:|---:|---:|---|',
    ...scenario.rows.map(r=>`| ${r.generation} | ${f(r.mean)} ± ${f(r.standardError)} | ${f(r.p10)}〜${f(r.p90)} | ${f(r.aboveReferenceRate*100)}% | ${f(r.aboveBestRate*100)}% | ${r.sires.slice(0,3).map(s=>`${s.name} (${s.count})`).join('、')||'初期牝羽'} |`),'');
}
lines.push('再生成：`npm run balance:breeding -- --write`。試行数・世代数は `--trials N --generations N`。詳細な能力別平均、父の分布、致死卵数、各G1出走羽は breeding-results.json。','');
const output=lines.join('\n');
console.log(output);
if(args.includes('--write')){
  const directory=path.join(__dirname,'../docs/gamebalance');
  fs.writeFileSync(path.join(directory,'BREEDING_VALIDATION.md'),output);
  fs.writeFileSync(path.join(directory,'breeding-results.json'),JSON.stringify(audit,null,2)+'\n');
}
if(audit.scenarios.filter(s=>s.level===R.FACILITIES.stalls.max).some(s=>s.firstAboveReference===null))process.exitCode=1;
