'use strict';
const fs=require('node:fs'),path=require('node:path');
const {R}=require('./lib/breeding-balance.cjs');
const {historyKey}=require('./lib/ranch-fixtures.cjs');
const {auditEvolvingBreeding}=require('./lib/evolving-breeding-balance.cjs');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const historyPath=option('--history',path.join(__dirname,'../tmp/test-fixtures',`${historyKey()}.json`));
if(!fs.existsSync(historyPath))throw Error('NPC history cache missing: supply --history FILE or prepare it with npm test. No race physics is run by this audit.');
const base=R.initial(20260930,{},fs.readFileSync(historyPath,'utf8'));
const audit=auditEvolvingBreeding(base,{worlds:Number(option('--worlds',4)),trials:Number(option('--trials',32)),
  generations:Number(option('--generations',10)),seed:Number(option('--seed',20261004)),
  onProgress:p=>{if(p.phase==='year'&&p.year%5===0||p.phase==='complete')console.error(JSON.stringify(p));}});
const f=n=>Number.isFinite(n)?n.toFixed(2):'—';
const lines=['# 世代交代・市場更新を含む配合能力検証','',
  `NPC乱数${audit.worlds}通り × 初期牝羽3羽 × 各${audit.trials}試行 × 羽房Lv.4/Lv.9。${audit.generations}世代、${audit.lastYear}年目まで。他牧場の世界は試行ごとのプレイヤー配合とは独立して進める。`, '',
  'NPCの親選び、3〜20歳の親候補、各牧場の通常遺伝、クロス変異、欠点、年末の種牡羽選出、毎年の市場更新と5年契約は本番エンジンの進行処理を使う。レース物理だけを監査内で置き換え、遺伝8能力の平均が高い順に仮の着順をつける。この仮の着順を実績・賞金に反映し、翌年以降の親選びに使う。仮の時計に物理的な意味はない。実際の勝敗や将来の本番セーブを再現した検証ではない。', '',
  `プレイヤーは羽房最大Lv.9または対照Lv.4。${audit.generationYears}年ごとに娘を3歳で次の母にする。各配合時点で公開中の他牧場種牡羽から、遺伝期待8能力平均が最大の合法な相手を選ぶ。産駒は本番の生成処理で牝羽1羽を抽選し、良い娘の選別はしない。G1実績による誕生能力抽選の補正は遺伝指標に含めない。費用と育成、プレイヤーによるNPCの勝利阻止は扱わない。致死卵が出た試行は打ち切り、再抽選しない。`, '',
  `産駒を誕生年の相手ではなく、${audit.racingAge}歳となる年のG1相手と比較する。年齢・牝羽の条件に合うG1を対象とし、一般参加の補充羽は除外。1世代目は1年目に誕生して4年目の相手と比較、最終世代は${1+(audit.generations-1)*audit.generationYears}年目に誕生して${audit.lastYear}年目の相手と比較する。能力平均には距離・脚質補正と発現欠点を含む。性格・馬場適性・育成は含めない。`, '',
  '集計のP10〜P90は産駒個体の分布。NPC乱数ごとの平均差も保存し、同じNPC世界を共有する試行の独立性を仮定した信頼区間は判定に使わない。',''];
for(const scenario of audit.scenarios){
  lines.push(`## Lv.${scenario.level}・${scenario.mother}`,'',
    '| 世代 | 誕生年→比較年 | 産駒平均 | G1相手平均 | 平均差 | NPC世界別の最小平均差 | 個体P10〜P90 | 相手平均を超える個体 | 最強組の平均との差 | 最強相手との差 |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...scenario.rows.map(r=>r.sampleCount?`| ${r.generation} | ${r.birthYear}→${r.raceYear} | ${f(r.mean)} | ${f(r.referenceMean)} | ${f(r.gap.mean)} | ${f(r.worstWorldMeanGap)} | ${f(r.p10)}〜${f(r.p90)} | ${f(r.aboveRate*100)}% | ${f(r.gapToStrongestField.mean)} | ${f(r.gapToBest.mean)} |`:`| ${r.generation} | 打ち切り | — | — | — | — | — | — | — | — |`),'');
}
const failed=audit.scenarios.reduce((n,s)=>n+s.rows.reduce((n,r)=>n+r.failedEggs,0),0);
lines.push(`致死卵による打ち切り：${failed}試行。乱数ごとの年次出走羽、公開市場、能力別平均と父の分布は evolving-breeding-results.json。`, '',
  '再生成：`npm run balance:breeding:years -- --write`。設定は `--worlds N --trials N --generations N --seed N`。既存のNPC履歴キャッシュを読み込む。','');
const output=lines.join('\n');console.log(output);
if(args.includes('--write')){
  const directory=path.join(__dirname,'../docs/gamebalance');
  fs.writeFileSync(path.join(directory,'EVOLVING_BREEDING_VALIDATION.md'),output);
  fs.writeFileSync(path.join(directory,'evolving-breeding-results.json'),JSON.stringify(audit,null,2)+'\n');
}
if(audit.scenarios.filter(s=>s.level===9).some(s=>!s.rows.some(r=>r.worstWorldMeanGap>0)))process.exitCode=1;
