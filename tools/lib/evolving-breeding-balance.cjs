'use strict';
const {R,ABILITIES,mean,score,expectationCalculator,selectSire,summarize}=require('./breeding-balance.cjs');
const Race=require('../../public/js/ranch-race.js');

function fieldSummary(e,field){
  const entrants=field.map(b=>({id:b.id,name:b.name,farm:b.farm,score:score(b)}));
  return {name:e.name,week:e.week,surface:e.surface,distance:e.distance,minAge:e.minAge,maxAge:e.maxAge,sex:e.sex||null,
    fieldSize:entrants.length,mean:mean(entrants.map(b=>b.score)),best:Math.max(...entrants.map(b=>b.score)),entrants};
}
function reference(events,{age=3,sex='F'}={}){
  const eligible=events.filter(e=>e.minAge<=age&&e.maxAge>=age&&(!e.sex||e.sex===sex));
  if(!eligible.length)throw Error('No eligible G1 fields');
  return {allMean:mean(events.map(e=>e.mean)),mean:mean(eligible.map(e=>e.mean)),
    strongestFieldMean:Math.max(...eligible.map(e=>e.mean)),best:Math.max(...eligible.map(e=>e.best)),eventCount:eligible.length};
}
function snapshot(s){
  // A later expiry must not edit an earlier market snapshot. Genomes are immutable;
  // NPC careers are one season, but copy records/counters as well as ownership.
  return {...s,birds:s.birds.map(b=>({...b,parents:b.parents.slice(),records:b.records.slice()})),
    facilities:{...s.facilities},sale:s.sale.slice(),reports:[],journal:[],ledger:[],awards:[]};
}
function evolveWorld(base,{years=31,seed=20261004,breedingYears=[],onYear=()=>{},onG1=()=>{}}={}){
  const s=structuredClone(base),markets=new Map(),seasons=[];
  // Isolate the NPC world from the audit's offspring and all player racing.
  s.birds=s.birds.filter(b=>b.owner!=='player');s.stage='running';s.rng=seed>>>0;s.money=1e12;
  const start=R.date(s.week).year,until=(start+years-1)*R.YEAR;
  const realSimulate=Race.simulate;
  let season=null,rankedEvents=0;
  // Synchronous, audit-local substitution. Synthetic ordering feeds the real
  // NPC wins, earnings, parent selection, retirement and market expiration.
  // The synthetic times have no physical interpretation and are never exported
  // as a save or presented as actual race results.
  Race.simulate=(entries,event)=>{
    const field=entries.map(entry=>R.bird(s,entry.id)).filter(b=>b?.farm);
    const values=new Map(field.map(b=>[b.id,score(b)]));
    if(event.level==='GI'){
      season.events.push(fieldSummary(event,field));
      onG1(s,event,field);
    }
    rankedEvents++;
    return entries.map(entry=>({...entry,time:200-(values.get(entry.id)??mean(Object.values(entry.paddock.abilities))),
      finished:true,state:{...entry.state,distance:event.distance}}));
  };
  try{
    while(s.week<=until){
      const d=R.date(s.week);
      if(!season||season.year!==d.year){season={year:d.year,events:[]};seasons.push(season);}
      if(d.week===9&&breedingYears.includes(d.year))markets.set(d.year,snapshot(s));
      s.reports=[];R.advance(s);
      if(d.week===48){
        season.reference=reference(season.events);
        season.market=R.sires(s).filter(b=>b.owner==='public'&&b.farm).map(b=>({id:b.id,name:b.name,score:score(b),retiredYear:b.retiredYear}));
        onYear({year:d.year,reference:season.reference,sires:season.market.length});
      }
    }
  }finally{Race.simulate=realSimulate;}
  return {seed,rankedEvents,markets,seasons};
}
function auditEvolvingBreeding(base,{worlds=4,trials=32,generations=10,generationYears=3,racingAge=3,seed=20261004,levels=[4,9],onProgress=()=>{}}={}){
  for(const [name,value] of Object.entries({worlds,trials,generations,generationYears,racingAge}))
    if(!Number.isInteger(value)||value<1)throw Error(`Positive integer ${name} required`);
  if(generationYears<3)throw Error('Mares must be at least three years old');
  const startYear=R.date(base.week).year;
  const breedingYears=Array.from({length:generations},(_,i)=>startYear+i*generationYears);
  const lastYear=breedingYears.at(-1)+racingAge;
  const mares=base.sale.slice(0,3).map(id=>R.bird(base,id)),results=[];
  const accumulators=levels.flatMap(level=>mares.map(mother=>({level,mother:mother.name,rows:Array.from({length:generations},()=>[])})));
  for(let worldIndex=0;worldIndex<worlds;worldIndex++){
    const worldSeed=(seed+Math.imul(worldIndex,0x9e3779b9))>>>0;
    onProgress({phase:'world',world:worldIndex+1,worlds});
    const world=evolveWorld(base,{years:lastYear-startYear+1,seed:worldSeed,breedingYears,
      onYear:progress=>onProgress({phase:'year',world:worldIndex+1,worlds,...progress})});
    const seasons=new Map(world.seasons.map(s=>[s.year,s]));
    for(const accumulator of accumulators){
      const mother=mares.find(b=>b.name===accumulator.mother),expected=expectationCalculator(accumulator.level);
      for(let trial=0;trial<trials;trial++){
        let dam=mother,children=[],rng=(worldSeed+Math.imul(trial+1,2654435761))>>>0;
        // Separate IDs cannot collide with any present/future NPC snapshot.
        let serial=1000000+worldIndex*100000+trial*100;
        for(let i=0;i<generations;i++){
          const birthYear=breedingYears[i],market=world.markets.get(birthYear),raceYear=birthYear+racingAge;
          // At the next breeding season only the current mother is retained in
          // an active breeding role; older dams stay solely as pedigree records.
          for(const b of children)Object.assign(b,b===dam?{role:'mare'}:{owner:'archive',role:'archived'});
          const s={...market,week:(birthYear-1)*R.YEAR+9,rng,serial,
            facilities:{...market.facilities,stalls:accumulator.level},birds:[...market.birds,...children]};
          if(R.age(s,dam)<3||R.age(s,dam)>=20)throw Error('Invalid mare breeding age');
          const sires=R.sires(s).filter(b=>b.owner==='public'&&b.farm),selected=selectSire(s,dam,sires,expected);
          if(R.breedingReason({...s,money:1e12}, {...dam,owner:'player',role:'mare',bredYear:0,pregnancy:null},selected.sire))
            throw Error('Breeding rejected by production rules');
          let child=null;
          // Match production hatching time rather than assigning all offspring
          // the old founding year. Record and stop a failed line; do not reroll.
          s.week+=R.GESTATION;
          child=R.createBird(s,{sex:'F',name:'テスト'},[selected.sire,dam]);
          if(!child){
            // Preserve this lost generation rather than silently rerolling it.
            accumulator.rows[i].push({world:worldIndex+1,trial,failedEggs:1,failed:true});
            break;
          }
          const target=reference(seasons.get(raceYear).events,{age:racingAge,sex:'F'}),value=score(child),abilities=R.geneticScores(child);
          accumulator.rows[i].push({world:worldIndex+1,trial,birthYear,raceYear,score:value,
            abilities:Object.fromEntries(ABILITIES.map(key=>[key,abilities[key]])),
            reference:target,delta:value-target.mean,deltaStrongestField:value-target.strongestFieldMean,
            deltaBest:value-target.best,sire:selected.sire.name,sireId:selected.sire.id,marketSize:sires.length,failedEggs:0});
          children.push(child);dam=child;rng=s.rng;serial=s.serial;
        }
      }
    }
    results.push({seed:worldSeed,rankedEvents:world.rankedEvents,seasons:world.seasons});
    onProgress({phase:'complete',world:worldIndex+1,worlds});
  }
  const scenarios=accumulators.map(a=>({...a,rows:a.rows.map((samples,i)=>{
    const living=samples.filter(x=>!x.failed),sires=new Map();
    for(const x of living)sires.set(x.sire,(sires.get(x.sire)||0)+1);
    if(!living.length)return {generation:i+1,sampleCount:0,failedEggs:samples.length};
    const worldMeanGaps=Array.from({length:worlds},(_,w)=>mean(living.filter(x=>x.world===w+1).map(x=>x.delta)));
    return {generation:i+1,birthYear:living[0].birthYear,raceYear:living[0].raceYear,sampleCount:living.length,
      ...summarize(living.map(x=>x.score)),referenceMean:mean(living.map(x=>x.reference.mean)),
      strongestFieldMean:mean(living.map(x=>x.reference.strongestFieldMean)),bestReference:mean(living.map(x=>x.reference.best)),
      gap:summarize(living.map(x=>x.delta)),gapToStrongestField:summarize(living.map(x=>x.deltaStrongestField)),
      gapToBest:summarize(living.map(x=>x.deltaBest)),aboveRate:living.filter(x=>x.delta>0).length/living.length,
      worldMeanGaps,worstWorldMeanGap:Math.min(...worldMeanGaps),
      aboveStrongestFieldRate:living.filter(x=>x.deltaStrongestField>0).length/living.length,
      aboveBestRate:living.filter(x=>x.deltaBest>0).length/living.length,
      abilities:Object.fromEntries(ABILITIES.map(key=>[key,mean(living.map(x=>x.abilities[key]))])),
      failedEggs:samples.filter(x=>x.failed).length,
      sires:[...sires].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))};
  })}));
  return {seed,worlds,trials,generations,generationYears,racingAge,lastYear,
    model:'production NPC progression with genetic mean ranking replacing race physics; independent NPC world per seed; no player racing',
    stationaryMarket:false,results,scenarios};
}
module.exports={fieldSummary,reference,snapshot,evolveWorld,auditEvolvingBreeding};
