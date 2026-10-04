'use strict';
const R=require('../../public/js/ranch-engine.js');
const ABILITIES=R.Mapping.ABILITIES.map(a=>a.key);
const mean=values=>values.reduce((n,x)=>n+x,0)/values.length;
const alleleMean=pair=>mean(pair);
const favorableRate=level=>.5+.05*Math.max(0,Math.min(5,level-4));
const inheritedMean=(pair,rate)=>rate*Math.max(...pair)+(1-rate)*Math.min(...pair);
const score=b=>{const scores=R.geneticScores(b);return mean(ABILITIES.map(key=>scores[key]));};

// Cache immutable parental gamete expectations. Never use preview-range midpoints:
// a heterozygous parent transmits its favorable allele 75% of the time at Lv.9.
function expectationCalculator(level){
  const rate=favorableRate(level),cache=new WeakMap();
  function gametes(b){
    if(!cache.has(b))cache.set(b,Object.fromEntries(ABILITIES.map(key=>[key,
      b.genome.quality[key].reduce((n,p)=>n+inheritedMean(p,rate),0)])));
    return cache.get(b);
  }
  return function expectedScores(s,sire,dam,providedPlan){
    const parents=[sire,dam],a=gametes(sire),b=gametes(dam),plan=providedPlan??R.crossPlan(s,sire,dam);
    const distance=mean(parents.map(p=>alleleMean(p.genome.distance)));
    const release=mean(parents.map(p=>alleleMean(p.genome.release)));
    const scores=Object.fromEntries(R.Mapping.ABILITIES.map(def=>[def.key,
      50+1.25*(a[def.key]+b[def.key])+def.distance*distance+def.release*release]));
    for(const p of plan.filter(p=>p.group==='quality'&&ABILITIES.includes(p.key))){
      const before=parents.reduce((n,b)=>n+inheritedMean(b.genome.quality[p.key][p.locus],rate),0);
      scores[p.key]+=1.25*p.rate*(2*p.value-before);
    }
    const mutations=new Map(plan.filter(p=>p.group==='defects').map(p=>[`${p.key}:${p.locus}`,p]));
    const ids=new Set([...parents.flatMap(p=>Object.keys(p.genome.defects)),...plan.filter(p=>p.group==='defects').map(p=>p.key)]);
    for(const id of ids){
      let active=0;
      for(let i=0;i<R.Breeding.DEFECT_LOCI;i++){
        const probability=parents.reduce((n,b)=>n*alleleMean(b.genome.defects[id]?.[i]||[0,0]),1);
        const mutation=mutations.get(`${id}:${i}`);
        active+=mutation?mutation.rate+(1-mutation.rate)*probability:probability;
      }
      const trait=R.DEFECTS[id].trait,effects=R.Breeding.SPECIAL[trait]||{[trait]:1};
      for(const [key,weight] of Object.entries(effects))if(ABILITIES.includes(key))scores[key]-=active*R.Breeding.DEFECT_STEP*weight;
    }
    return scores;
  };
}
function selectSire(s,dam,sires,expectedScores){
  let best=null;
  // Long-running NPC worlds contain thousands of ancestors. Index once per
  // selection and share one pedigree traversal between legality and mutations.
  const index=new Map(s.birds.map(b=>[b.id,b])),lookup=id=>index.get(id),strengthCache=new Map();
  const strengths=b=>{
    if(!strengthCache.has(b)){
      // Same donor rule as ranch-engine crossStrengths, using its public quality
      // decoding and source catalog; mutations themselves remain production code.
      const source=b.kind==='root'&&R.ROOTS.find(p=>p.lineage===b.lineage);
      strengthCache.set(b,source?[source.primary,source.secondary]:Object.entries({...R.quality(b.genome),
        ...Object.fromEntries(Object.entries(b.genome.character||{}).map(([k,p])=>[k,mean(p)]))})
        .sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k])=>k));
    }
    return strengthCache.get(b);
  };
  for(const sire of sires){
    const crosses=R.Breeding.crosses([sire,dam],lookup);
    if(crosses.some(c=>c.blood>R.Breeding.MAX_CROSS_BLOOD))continue;
    const plan=R.Breeding.mutationPlan(crosses,lookup,strengths);
    const scores=expectedScores(s,sire,dam,plan),expected=mean(Object.values(scores));
    if(!best||expected>best.expected)best={sire,expected,scores};
  }
  if(!best)throw Error('No legal external sire');
  return best;
}
function g1Reference(base){
  const s={...base,birds:base.birds.slice()},events=[];
  const year=R.date(base.week).year;
  for(let w=1;w<=R.YEAR;w++){
    s.week=(year-1)*R.YEAR+w;
    for(const e of R.calendar(s.week).filter(e=>e.level==='GI')){
      const field=R.worldRoster(s,e).filter(b=>!b.filler&&!b.temporary);
      if(!field.length)throw Error(`No farm entrants: ${e.name}`);
      const values=field.map(score);
      events.push({name:e.name,surface:e.surface,distance:e.distance,sex:e.sex||null,
        fieldSize:field.length,mean:mean(values),best:Math.max(...values),
        entrants:field.map((b,i)=>({id:b.id,name:b.name,farm:b.farm,score:values[i]}))});
    }
  }
  return {events,mean:mean(events.map(e=>e.mean)),strongestFieldMean:Math.max(...events.map(e=>e.mean)),
    bestEntrant:Math.max(...events.map(e=>e.best))};
}
function summarize(values){
  const sorted=values.slice().sort((a,b)=>a-b),average=mean(values);
  const variance=values.length>1?values.reduce((n,x)=>n+(x-average)**2,0)/(values.length-1):0;
  return {mean:average,p10:sorted[Math.floor((sorted.length-1)*.1)],p90:sorted[Math.floor((sorted.length-1)*.9)],
    standardError:Math.sqrt(variance/values.length)};
}
function auditBreeding(base,{trials=128,generations=16,seed=20261004,levels=[4,R.FACILITIES.stalls.max]}={}){
  if(!Number.isInteger(trials)||trials<1||!Number.isInteger(generations)||generations<1)throw Error('Positive trials and generations required');
  const sires=R.sires(base).filter(b=>b.owner==='public'&&b.farm&&b.sex==='M');
  if(!sires.length)throw Error('No external public sires');
  const reference=g1Reference(base),mares=base.sale.slice(0,3).map(id=>R.bird(base,id));
  if(mares.length!==3||mares.some(b=>!b||b.sex!=='F'))throw Error('Three opening mares required');
  const scenarios=[];
  for(const level of levels){
    const expectedScores=expectationCalculator(level);
    for(const mother of mares){
      const buckets=Array.from({length:generations+1},()=>({values:[],abilities:[],above:0,aboveBest:0,failedEggs:0,sires:new Map()}));
      for(let trial=0;trial<trials;trial++){
        // One line per trial; no offspring ranking or best-of-many selection.
        const s={...base,week:base.week,rng:(seed+Math.imul(trial+1,2654435761))>>>0,
          birds:base.birds.slice(),facilities:{...base.facilities,stalls:level}};
        let dam=mother;
        for(let generation=0;generation<=generations;generation++){
          const bucket=buckets[generation],value=score(dam);
          bucket.values.push(value);bucket.abilities.push(R.geneticScores(dam));
          bucket.above+=Number(value>reference.mean);bucket.aboveBest+=Number(value>reference.bestEntrant);
          if(generation===generations)break;
          const selected=selectSire(s,dam,sires,expectedScores),next=buckets[generation+1];
          next.sires.set(selected.sire.name,(next.sires.get(selected.sire.name)||0)+1);
          let child=null,attempts=0;
          // Repeat this pairing only after a lethal egg; record every failure.
          while(!child){
            child=R.createBird(s,{sex:'F',name:'テスト'},[selected.sire,dam]);
            if(!child)next.failedEggs++;
            if(++attempts>100)throw Error('Repeated lethal eggs');
          }
          dam=child;
        }
      }
      const rows=buckets.map((b,generation)=>({generation,...summarize(b.values),
        abilities:Object.fromEntries(ABILITIES.map(key=>[key,mean(b.abilities.map(a=>a[key]))])),
        aboveReferenceRate:b.above/trials,aboveBestRate:b.aboveBest/trials,failedEggs:b.failedEggs,
        sires:[...b.sires].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))}));
      scenarios.push({level,favorableRate:favorableRate(level),mother:mother.name,rows,
        firstAboveReference:rows.find(r=>r.mean>reference.mean)?.generation??null,
        firstAboveStrongestField:rows.find(r=>r.mean>reference.strongestFieldMean)?.generation??null,
        firstAboveBest:rows.find(r=>r.mean>reference.bestEntrant)?.generation??null});
    }
  }
  return {seed,trials,generations,metric:'mean of eight genetic scores including distance/release and recessive penalties',
    stationaryMarket:true,sireCount:sires.length,reference,scenarios};
}
module.exports={R,ABILITIES,mean,score,favorableRate,inheritedMean,expectationCalculator,selectSire,g1Reference,summarize,auditBreeding};
