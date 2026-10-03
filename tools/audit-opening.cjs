'use strict';
const fs=require('node:fs'),path=require('node:path');
const {auditOpening}=require('./lib/opening-balance.cjs');
const audit=auditOpening(),{rows,blocked}=audit;
const winning=rows.filter(r=>r.canWin),failed=rows.filter(r=>!r.canWin);
const output=`# 初期配合の勝利経路検証

固定シード${audit.seed}、初期牝羽3羽 × 源流32種のうち許可される${rows.length}通りを、実際の配合・産駒生成処理で一度ずつ抽選。禁止配合${blocked.length}通りを除外します。

産駒の遺伝・潜在能力・生来の性格を保持し、監査用コピーだけを成熟時点に移して、各現在能力を max(50, 潜在能力 × ${audit.abilityRatio}) に設定します。性格の追加学習は仮定せず、体調100・脚負担0。新羽・未勝利それぞれで適性距離に近い芝とダートの計4競走を選び、一般参加11羽と実レース物理で対戦します。産駒は外枠に置きます。

150週の育成や他牧場の重賞進行は実行しません。この監査は成熟時の勝利経路を確認するもので、初勝利の期限、実際の育成期間や週々の資金維持を保証するものではありません。誕生・登録・自動出走・精算は通常テストで、他牧場の6年進行は npm run test:long で別途検証します。

一般参加だけの組は各週の新羽・未勝利にあり、既存の他牧場が出る組も残します。同等の適性・時期なら自動出走は一般参加の組を優先。上位クラスと重賞の難易度は本監査の対象外です。

| 母 | 源流 | 勝てた対象競走 |
|---|---|---|
${rows.map(r=>`| ${r.mother} | ${r.sire} | ${r.races.filter(e=>e.finished&&e.rank===1).map(e=>e.name).join('、')||'なし'} |`).join('\n')}

勝利経路あり：${winning.length}/${rows.length}通り。再実行は npm run balance:opening -- --write。検証条件と各産駒の潜在能力・仮想現在能力・レース結果は opening-results.json に保存します。
`;
if(process.argv.includes('--write')){
  fs.writeFileSync(path.join(__dirname,'../docs/gamebalance/OPENING_VALIDATION.md'),output);
  fs.writeFileSync(path.join(__dirname,'../docs/gamebalance/opening-results.json'),JSON.stringify(audit,null,2)+'\n');
}
console.log(output);
if(failed.length){console.error('No winning route:',failed.map(r=>r.mother+'/'+r.sire).join(', '));process.exitCode=1;}
