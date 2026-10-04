/* Shared observations for the ranch UI and the source genetics preview. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./ranch-engine.js'):root.Ranch);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RanchObservation=api;
})(globalThis,function(R){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mean=a=>a.reduce((n,x)=>n+x,0)/a.length;
  const abilityLabels=Object.fromEntries(R.Mapping.ABILITIES.map(a=>[a.key,a.label]));
  const statLabels={...abilityLabels,...R.MANAGEMENT,...R.PERSONALITY};
  const traitLabels={...statLabels,...R.Genetics.APTITUDES,...R.Genetics.DEVELOPMENT};
  const colorText=b=>`羽色：${R.Genetics.COLORS[b.color]} / 額羽：${R.Genetics.CRESTS[b.crest]}`;
  function defectResearch(b) {
    const rows=R.Breeding.defectSummary(b.genome,R.DEFECTS);
    return `<h3>潜性の欠点因子</h3>${rows.length?rows.map(d=>`<div class="list-row"><span>${esc(R.DEFECT_LABELS[d.trait])}<small>${esc(R.ROOTS.find(p=>p.lineage===d.source)?.name)}</small></span><span>aa ${d.active}座 / Aa ${d.carried}座 / AA ${R.Breeding.DEFECT_LOCI-d.active-d.carried}座</span></div>`).join(''):'<p class="muted">確認された欠点因子はありません。</p>'}`;
  }
  function ratingTable(scores,labels,{numeric=false,genetic=false}={}) {
    return `<div class="ability-grid ${numeric?'numeric':'ratings-only'}">${Object.entries(labels).map(([key,label])=>`<div data-trait="${key}"><span>${label}</span><b>${(Object.hasOwn(R.Genetics.COURSE_APTITUDES,key)?R.Genetics.courseRating:genetic?R.geneticRating:R.rating)(scores[key])}${numeric?` <small data-score="${key}">${Math.floor(scores[key])}</small>`:''}</b>${numeric?`<meter min="50" max="150" value="${scores[key]}">${Math.floor(scores[key])}</meter>`:''}</div>`).join('')}</div>`;
  }
  function abilityGauges(state,b,numeric) {
    const progress=R.abilityProgress(state,b),approx=value=>Math.round(value*20)*5;
    return `<div class="ability-legend"><span><i class="current"></i>現在の能力</span><span><i class="decline"></i>加齢で低下</span><span><i class="remaining"></i>伸びしろ</span></div><div class="ability-grid ability-progress">${Object.entries(abilityLabels).map(([key,label])=>{
      const p=progress[key],limit=b.potential[key],loss=(limit-50)*p.decline,remaining=(limit-50)*p.remaining;
      const current=approx(p.value/limit),lost=approx(loss/limit),declineText=loss>0?(lost?`加齢で約${lost}%低下`:'加齢でわずかに低下'):'';
      const description=`${label}：この子の能力上限に対して約${current}%${declineText?`、${declineText}`:''}。共通の最大目盛りは150です。`;
      return `<div data-trait="${key}"><span>${label}</span><b>${R.rating(p.value)}${numeric?` <small data-score="${key}">${Math.floor(p.value)}</small>`:''}</b><div class="ability-gauge" role="meter" aria-label="${label}の育ち具合" aria-valuemin="0" aria-valuemax="150" aria-valuenow="${numeric?Math.floor(p.value):Math.round(p.value/5)*5}" aria-valuetext="${description}"><div class="ability-capacity" style="width:${limit/150*100}%"><span class="current" style="width:${p.value/limit*100}%"></span><span class="decline" style="width:${loss/limit*100}%"></span><span class="remaining" style="width:${remaining/limit*100}%"></span></div></div></div>`;
    }).join('')}</div>`;
  }
  const traitScores=group=>Object.fromEntries(Object.entries(group).map(([key,pair])=>[key,50+mean(pair)*100]));
  function geneLoci(b) {
    const g=b.genome;
    const pair=(values,format=value=>String(value))=>values.map(value=>esc(format(value))).join(' / ');
    const loci=(label,pairs,format)=>`<details class="gene-group"><summary>${esc(label)} <small>${pairs.length}座位</small></summary><ol class="gene-loci">${pairs.map((values,index)=>`<li><span>座位 ${String(index+1).padStart(2,'0')}</span><b>${pair(values,format)}</b></li>`).join('')}</ol></details>`;
    const traitPairs=(group,labels)=>Object.entries(labels).map(([key,label])=>loci(label,[group[key]])).join('');
    return `<details class="gene-details"><summary>遺伝の座位情報（全因子）</summary><h3>身体・管理の遺伝品質</h3>${Object.entries(g.quality).map(([key,pairs])=>loci(traitLabels[key],pairs,value=>value?'A':'a')).join('')}<h3>生来の性格</h3>${traitPairs(g.character,R.PERSONALITY)}<h3>体質と出力配分</h3>${loci('筋・代謝構成',[g.distance])}${loci('出力配分',[g.release])}<h3>羽場・コースと成長</h3>${traitPairs(g.traits.aptitude,R.Genetics.APTITUDES)}${traitPairs(g.traits.development,R.Genetics.DEVELOPMENT)}<h3>羽色因子</h3>${loci('通常羽色',[g.traits.body],color=>R.Genetics.COLORS[color])}${loci('金因子',[g.traits.gold])}<p class="muted">額羽の継承因子：${esc(R.Genetics.CRESTS[g.traits.crest])}</p><h3>潜性の欠点の全座位</h3>${Object.entries(R.DEFECTS).map(([id,d])=>loci(`${R.DEFECT_LABELS[d.trait]}（${R.ROOTS.find(p=>p.lineage===d.source).name}）`,g.defects[id]||Array.from({length:R.Breeding.DEFECT_LOCI},()=>[0,0]),value=>value?'a':'A')).join('')}</details>`;
  }
  function geneticResearch(state,b,{open=true,compact=false}={}) {
    const level=R.labLevel(state),traits=b.genome.traits,growth=R.Genetics.growth(traits);
    const numeric=level>=2;
    const extra=`${level>=1?`<h3>羽色の遺伝</h3><p class="muted">${colorText(b)}</p><p class="muted">${R.profile(b).distance} / ${R.profile(b).style} / 成長型：${{early:'早熟',normal:'普通',late:'晩成'}[b.growth]}</p>`:''}${numeric?`<p class="muted">成熟の目安 ${growth.maturityYears.toFixed(1)}歳 / 衰え始め ${growth.declineStart.toFixed(1)}歳 / 以後の低下 年${(growth.declineRate*100).toFixed(1)}%</p>${defectResearch(b)}${geneLoci(b)}`:''}`;
    return `<details class="research genetics"${open?' open':''}><summary>遺伝</summary><h3>能力の遺伝</h3>${ratingTable(R.geneticScores(b),statLabels,{numeric,genetic:true})}${level>=1?`<h3>羽場適性の遺伝</h3>${ratingTable(traitScores(traits.aptitude),R.Genetics.SURFACE_APTITUDES,{numeric,genetic:true})}<h3>コーナー・直線適性の遺伝</h3>${ratingTable(traitScores(traits.aptitude),R.Genetics.COURSE_APTITUDES,{numeric,genetic:true})}<h3>成長と加齢の遺伝</h3>${ratingTable(traitScores(traits.development),R.Genetics.DEVELOPMENT,{numeric,genetic:true})}`:''}${compact&&extra?`<details class="genetic-notes"><summary>羽色・体質・遺伝因子</summary>${extra}</details>`:extra}</details>`;
  }
  function status(state,b) {
    const level=R.labLevel(state),numeric=level===3,years=R.age(state,b),young=years!==null&&years<=1;
    const traits=b.genome.traits,aptitude=traits.aptitude;
    const preference=(a,c,left,right)=>mean(a)===mean(c)?'どちらも同程度':mean(a)>mean(c)?left:right;
    return `<section class="research status-record"><h3>${young?'成長率':'現在のステータス'}</h3>${young?`${ratingTable(traitScores(traits.development),R.Genetics.DEVELOPMENT,{numeric})}`:`<h3>現在の身体能力</h3>${abilityGauges(state,b,numeric)}<h3>管理の資質</h3>${ratingTable(b.management,R.MANAGEMENT,{numeric})}<h3>現在の性格</h3>${ratingTable(b.personality,R.PERSONALITY,{numeric})}`}${level>=1?`<details class="race-traits" open><summary>詳しい競走情報</summary><p class="muted">${R.profile(b).distance} / ${R.profile(b).style}</p><p>得意羽場：${preference(aptitude.turf,aptitude.dirt,'芝','ダート')} / 得意なクッション：${preference(aptitude.lowCushion,aptitude.highCushion,'柔らかめ','硬め')}</p><h3>羽場適性</h3>${ratingTable(traitScores(aptitude),R.Genetics.SURFACE_APTITUDES,{numeric})}<h3>コーナー・直線適性</h3>${ratingTable(traitScores(aptitude),R.Genetics.COURSE_APTITUDES,{numeric})}</details>`:''}${numeric?`<h3>成熟したときの伸びしろ</h3>${ratingTable(b.potential,abilityLabels,{numeric:true})}${b.role==='racing'?`<div class="wellbeing"><span>体調 <b>${Math.floor(b.condition)} / 100</b></span><span>脚の負担 <b>${Math.floor(b.strain)} / 100</b></span>${b.health?`<span>療養 <b>あと${b.health}週</b></span>`:''}</div>`:''}`:''}</section>`;
  }
  function birthGenetics(state,report) {
    if(report.type!=='birth'||!report.geneticLottery)return '';
    const level=R.labLevel(state),numeric=level>=2,position=level>=3;
    const table=labels=>`<div class="ability-grid birth-genetic-grid">${Object.entries(labels).filter(([key])=>report.geneticLottery[key]).map(([key,label])=>{
      const {min,max,value}=report.geneticLottery[key],rating=Object.hasOwn(R.Genetics.COURSE_APTITUDES,key)?R.Genetics.courseRating:R.geneticRating,low=rating(min),high=rating(max);
      const fixed=max===min,fraction=fixed?null:Math.max(0,Math.min(1,(value-min)/(max-min))),percent=fixed?null:Math.round(fraction*100);
      const fewVariants=Object.hasOwn(R.Genetics.APTITUDES,key)||Object.hasOwn(R.Genetics.DEVELOPMENT,key);
      const tone=fixed?'':fewVariants?(fraction>=1-1e-12?'blue':fraction<=1e-12?'red':''):
        fraction>=.9-1e-12?'rainbow':fraction>=.7-1e-12?'blue':fraction<.3-1e-12?'red':'';
      const result=`<span class="birth-result${tone?` birth-result-${tone}`:''}">${rating(value)}</span>`;
      const range=`${low}～${high}`,numbers=`${Math.floor(value)} / ${Math.floor(min)}～${Math.floor(max)}`;
      const location=fixed?'固定（抽選幅なし）':`下限から${percent}%`;
      return `<div data-birth-trait="${key}"><span>${label}</span><b aria-label="${label}：結果 ${rating(value)}、可能範囲 ${range}">${result} <span class="birth-range">/ ${range}</span></b>${numeric?`<small data-birth-score="${key}">${numbers}</small>`:''}${position?`<small class="birth-position">${location}</small>${fixed?'':`<meter min="0" max="100" value="${percent}" aria-label="${label}の可能範囲内の位置" aria-valuetext="${location}（下限0%、上限100%）">${percent}%</meter>`}`:''}</div>`;
    }).join('')}</div>`;
    return `<section class="birth-genetics"><h4>生まれ持った素質</h4><p class="muted">結果 / 範囲</p><h5>身体・管理・性格</h5>${table(statLabels)}${level>=1?`<h5>羽場適性</h5>${table(R.Genetics.SURFACE_APTITUDES)}${Object.keys(R.Genetics.COURSE_APTITUDES).some(key=>report.geneticLottery[key])?`<h5>コーナー・直線適性</h5>${table(R.Genetics.COURSE_APTITUDES)}`:''}<h5>成長と加齢</h5>${table(R.Genetics.DEVELOPMENT)}`:''}</section>`;
  }
  return Object.freeze({genetics:geneticResearch,status,birthGenetics});
});
