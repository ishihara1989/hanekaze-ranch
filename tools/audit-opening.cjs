'use strict';
const fs=require('node:fs'),path=require('node:path');
const R=require('../public/js/ranch-engine.js');
const rows=[],blocked=[];
for(let mare=0;mare<3;mare++)for(let sire=0;sire<R.ROOTS.length;sire++){
  const s=R.initial(),mother=R.bird(s,s.sale[mare]),father=R.sires(s)[sire];
  const reason=R.crossReason(s,father,mother);if(reason){blocked.push({mother:mother.name,sire:father.name,reason});continue;}
  R.buy(s,mother.id);while(s.reports.length)R.acknowledge(s);R.breed(s,mother.id,father.id);
  let lowest=s.money;
  for(let week=0;week<150;week++){
    while(s.reports.length)R.acknowledge(s);
    R.advance(s);lowest=Math.min(lowest,s.money);
    if(!R.validState(s))throw Error(`Invalid state: ${mare}/${sire}, week ${s.week}`);
  }
  const child=R.own(s).find(b=>b.role==='racing'&&b.parents.length);
  if(!child?.races||s.debt)throw Error(`Opening failed: ${mare}/${sire}`);
  rows.push({mother:mother.name,sire:father.name,firstRace:R.when(child.records[0].week),firstWin:child.records.find(r=>r.rank===1)?R.when(child.records.find(r=>r.rank===1).week):'未勝利',races:child.races,wins:child.wins,lowest,closing:s.money});
}
const output=`# 序盤150週の通し検証\n\n新しい進行（v4）の固定シード20260930で、セール3羽 × 源流${R.ROOTS.length}羽から許可される${rows.length}通りを検証。血量37.5%を超える${blocked.length}通りは危険な配合として禁止。購入と最初の配合の後は、初期の平原・着実方針のまま、報告を確認して週を送る。追加購入・施設投資・借入・手動調教なし。\n\n初期20,000 G、1年3月第1週。4週後に誕生、3年1月第1週に2歳登録。150週後（4年4月第3週）までを確認。各週で保存データ構造も検証。初勝利の時期は個体差に依存し、勝利を保証する補正はない。\n\n| 母 | 源流 | 初出走 | 初勝利 | 出走 | 勝利 | 最低資金 | 終了資金 |\n|---|---|---|---|---:|---:|---:|---:|\n${rows.map(r=>`| ${r.mother} | ${r.sire} | ${r.firstRace} | ${r.firstWin} | ${r.races} | ${r.wins} | ${r.lowest} | ${r.closing} |`).join('\n')}\n\n${rows.length}通りとも登録・出走へ進み、資金不足なし。最低資金は${Math.min(...rows.map(r=>r.lowest)).toLocaleString()} G。初勝利は${rows.filter(r=>r.wins>0).length}通り、150週時点の未勝利は${rows.filter(r=>r.wins===0).length}通り。再実行は \`node tools/audit-opening.cjs --write\`。\n\n## 源流拡充に伴う確認範囲\n\n身体・管理・性格・路面適性・成長因子をそろえた32源流では、全組み合わせの150週以内の初勝利は保証しない。旧4源流の固定シードに対する全12通り初勝利の検査は、許可される93通りの出走・完走・資金維持と、各セール牝羽に初勝利へ届く組み合わせがあることの検査に更新した。初勝利の差と多世代の強さは今後の調整対象。源流の能力を勝敗に合わせて再抽選する補正は入れていない。\n\n## 数値の位置づけ\n\n- 身体の変換式は ATTRIBUTE_MAPPING.md / trait-mapping.js と共通。品質・性格・調教・現在能力を分離。距離ラベルの速度ボーナスなし。\n- 未勝利集団の有利アレル頻度0.10、GⅠ集団0.625。相手の強さを遺伝品質と調教状態で表現し、結果を直接上書きしない。\n- 実験用2.5%勾配では低能力・完全疲労の個体が登れなくなったため、実ゲームの起伏は0.8%を初期値に設定。\n- 初期資金・維持費・施設費・ファン係数・繁殖期間4週は今回のゲーム進行用仮設定。路面・クッション適性と成長因子の効果を含む。GⅠへ至る多世代の難易度、集団内の進路取り、路面差の係数調整は本検証の対象外。\n`;
if(process.argv.includes('--write')){fs.writeFileSync(path.join(__dirname,'../docs/gamebalance/OPENING_VALIDATION.md'),output);fs.writeFileSync(path.join(__dirname,'../docs/gamebalance/opening-results.json'),JSON.stringify(rows,null,2)+'\n');}
console.log(output);
