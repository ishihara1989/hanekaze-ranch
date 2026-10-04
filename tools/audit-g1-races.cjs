'use strict';
const fs=require('node:fs'),path=require('node:path');
const {R}=require('./lib/breeding-balance.cjs');
const {historyKey}=require('./lib/ranch-fixtures.cjs');
const {auditG1Races}=require('./lib/g1-race-balance.cjs');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const historyPath=option('--history',path.join(__dirname,'../tmp/test-fixtures',`${historyKey()}.json`));
if(!fs.existsSync(historyPath))throw Error('NPC history cache missing: supply --history FILE or prepare it with npm test.');
const audit=auditG1Races(R.initial(20260930,{},fs.readFileSync(historyPath,'utf8')),{
  generations:String(option('--generations','2,10')).split(',').map(Number),seed:Number(option('--seed',20261004)),training:Number(option('--training',.95)),
  onProgress:p=>{if(p.phase==='world'&&p.year%5===0||p.phase==='race'&&p.completed%12===0)console.error(JSON.stringify(p));}});
const f=n=>n.toFixed(2);
const lines=['# 各G1を3試行ずつ走らせた実レース検証','',
  `羽房Lv.9、${audit.generations.join('・')}世代目、全${audit.eventCount}G1 × 各3試行。初期牝羽3羽の系列を1羽ずつ使用し、良い娘の選別や競走ごとの適性選別はしない。配合時の種牡羽は期待遺伝8能力平均が最大の合法な公開種牡羽を選ぶ。NPC乱数は1通り（${audit.seed}）。`, '',
  '他牧場の世代交代と市場は前回と同じ遺伝平均順位による近似で進める。今回の対象G1は、その年の相手・実馬場・コース・羽混み・性格・枠順を使い、本番の R.race によるレース物理・着順・G1勝利記録・リプレイまで確認する。対象外の年間競走は物理計算しない。', '',
  `産駒の潜在能力、遺伝適性、成長、性格は実際の誕生抽選を保持。各調教を${f(audit.training*100)}%（NPCの重賞出走羽と同じ）、体調100・脚負担0・病気なしに置き、生来の性格を使用する。能力を遺伝平均や150に差し替えず、年齢による成長不足・衰えも本番の現在能力に反映。G1出走資格は年齢・月に応じたオープン昇級の勝利数（2歳1勝、3歳6月まで2勝、3歳7〜12月3勝、4歳以上4勝）を前提とし、その勝利数までの育成・資金繰りは回さない。`, '',
  '2歳限定は2歳、3歳限定は3歳、それ以外は5歳時点で評価し、実際の年齢・性別の出走条件を確認。誕生年から相応の年数を進めた相手と対戦する。3試行は各母系列1羽ずつで、枠順も別の決定的シードから本番処理で抽選。各試行は独立した状態コピーに戻し、連戦の疲労や4週間隔は扱わない。全37G1を1羽の同じ年の実出走予定として扱う検証ではない。', '',
  '| 世代 | 3試行以内に1勝したG1 | 総勝利数 | 3試行とも未勝利 |','|---:|---:|---:|---|',
  ...audit.stages.map(s=>`| ${s.generation} | ${s.winningEvents}/${s.rows.length} | ${s.wins}/${s.runs} | ${s.failedEvents.join('、')||'なし'} |`),'',
  '| G1 | 馬場・距離 | 評価年齢 | '+audit.stages.map(s=>`${s.generation}世代目の着順（母3系列）`).join(' | ')+' |',
  '|---|---|---:|'+audit.stages.map(()=>'---|').join(''),
  ...audit.stages[0].rows.map((r,i)=>`| ${r.name} | ${r.surface==='turf'?'芝':'ダート'}${r.distance}m | ${r.age} | ${audit.stages.map(s=>s.rows[i].attempts.map(a=>`${a.rank}着${a.finished?'':'（未完走）'}`).join(' / ')).join(' | ')} |`),'',
  '系列の順序はハルノコムギ・ミズノシズク・アカネノハネ。各試行の現在能力・潜在能力・発育率・性格・適性・枠・相手との時計差・全12羽の結果を g1-race-results.json に保存。', '',
  '再生成：`npm run balance:g1 -- --write`。`--generations 2,10 --seed 20261004 --training 0.95` で条件を指定できる。3試行の有限標本であり、安定勝率や別の乱数での全G1勝利を保証するものではない。',''];
const output=lines.join('\n');console.log(output);
if(args.includes('--write')){
  const directory=path.join(__dirname,'../docs/gamebalance');
  fs.writeFileSync(path.join(directory,'G1_RACE_VALIDATION.md'),output);
  fs.writeFileSync(path.join(directory,'g1-race-results.json'),JSON.stringify(audit,null,2)+'\n');
}
if(audit.stages.some(s=>s.failedEvents.length))process.exitCode=1;
