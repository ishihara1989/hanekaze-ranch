'use strict';
const {R,score,expectationCalculator,selectSire}=require('./breeding-balance.cjs');
const {evolveWorld}=require('./evolving-breeding-balance.cjs');
const Race=require('../../public/js/ranch-race.js');
const Replay=require('../../public/js/race-replay.js');

const eventAge=e=>e.maxAge===2?2:e.maxAge===3?3:Math.max(e.minAge,Math.min(5,e.maxAge));
const key=(year,name)=>`${year}:${name}`;
function generateLines(base,world,{generations=[2,10],seed=20261004,level=9}={}){
  const expected=expectationCalculator(level),lines=[];
  for(let motherIndex=0;motherIndex<3;motherIndex++){
    let dam=R.bird(base,base.sale[motherIndex]),children=[],rng=(seed+Math.imul(1,2654435761))>>>0,serial=1000000;
    const mother=dam.name;
    for(let generation=1;generation<=Math.max(...generations);generation++){
      const birthYear=R.date(base.week).year+(generation-1)*3,market=world.markets.get(birthYear);
      if(!market)throw Error(`No breeding market for ${birthYear}`);
      for(const b of children)Object.assign(b,b===dam?{role:'mare'}:{owner:'archive',role:'archived'});
      const s={...market,week:(birthYear-1)*R.YEAR+9,rng,serial,birds:[...market.birds,...children],facilities:{...market.facilities,stalls:level}};
      const sires=R.sires(s).filter(b=>b.owner==='public'&&b.farm),selected=selectSire(s,dam,sires,expected);
      s.week+=R.GESTATION;
      const child=R.createBird(s,{sex:'F',name:'テスト'},[selected.sire,dam]);
      if(!child)throw Error(`Lethal egg in ${mother}, generation ${generation}; no reroll`);
      if(generations.includes(generation))lines.push({motherIndex,mother,generation,sire:selected.sire.name,
        expected:selected.expected,bird:structuredClone(child)});
      children.push(child);dam=child;rng=s.rng;serial=s.serial;
    }
  }
  return lines;
}
function prepareEntrant(child,{training=.95}={}){
  if(!Number.isFinite(training)||training<0||training>1)throw Error('Training must be in 0..1');
  const b=structuredClone(child);
  Object.assign(b,{owner:'player',role:'racing',registered:true,wins:2,races:2,g1:0,graded:0,earnings:0,
    records:[],titles:[],lastRace:-100,condition:100,strain:0,health:0,retiredYear:null});
  for(const ability of Object.keys(b.training))b.training[ability]=training;
  // Retain the real birth lottery, inherited aptitudes, growth and inborn traits.
  b.personality={...b.inborn};
  return b;
}
function raceAttempt(base,line,fixture,{training=.95,seed=20261004}={}){
  const b=prepareEntrant(line.bird,{training}),e=fixture.event;
  const s={...base,week:e.week,rng:(seed^Math.imul(line.generation,0x9e3779b9)^Math.imul(line.motherIndex+1,0x85ebca6b))>>>0,
    money:1e12,birds:[...structuredClone(fixture.rivals),b],sale:[],reports:[],journal:[],ledger:[],awards:[],
    firstWins:{},milestones:{},founderOffers:[],stage:'running',facilities:{...base.facilities,stalls:9}};
  const years=R.age(s,b);
  b.wins=b.races=years===2?1:years===3?(R.date(e.week).month<=6?2:3):4;
  if(!R.eligible(s,b,e))throw Error(`Ineligible entrant for ${e.name}: age ${years}, sex ${b.sex}`);
  const abilities=R.currentAbilities(s,b),progress=R.abilityProgress(s,b),before=JSON.stringify({line,fixture});
  // This invokes production field generation, gate draw, shared-clock physics,
  // replay capture and settlement, with no audit ranking substitution active.
  const result=R.race(s,b,e);
  if(!result||!Replay.valid(result.replay,result))throw Error(`Invalid physical race/replay: ${e.name}`);
  if(b.g1!==Number(result.finished&&result.rank===1))throw Error('G1 victory was not settled');
  if(before!==JSON.stringify({line,fixture}))throw Error('Race attempt changed its input fixtures');
  const player=result.replay.runners.find(r=>r.id===b.id),winner=result.field[0];
  return {mother:line.mother,sire:line.sire,generation:line.generation,age:R.age(s,b),birthYear:b.birthYear,
    raceYear:R.date(s.week).year,seed:s.rng,lane:player.lane,rank:result.rank,finished:result.finished,
    time:result.time,winner:winner.name,winnerTime:winner.time,gap:result.finished?result.time-winner.time:null,
    fieldSize:result.field.length,abilities,potential:{...b.potential},geneticScore:score(b),
    personality:{...b.personality},aptitudes:structuredClone(b.genome.traits.aptitude),growth:R.Genetics.growth(b.genome.traits),
    development:Object.fromEntries(Object.entries(progress).map(([k,p])=>[k,p.current])),
    going:result.going,cushion:result.cushion,interactions:result.interactions,
    field:result.field,g1Recorded:b.g1,validReplay:true};
}
function auditG1Races(base,{generations=[2,10],seed=20261004,training=.95,eventNames=null,onProgress=()=>{}}={}){
  if(!generations.length||generations.some(g=>!Number.isInteger(g)||g<1))throw Error('Positive generations required');
  const templates=Array.from({length:R.YEAR},(_,i)=>R.calendar(i+1)).flat().filter(e=>e.level==='GI'&&(!eventNames||eventNames.includes(e.name)));
  if(!templates.length)throw Error('No G1 races selected');
  if(templates.some(e=>e.sex&&e.sex!=='F'))throw Error('A female breeding line cannot enter male-only races');
  const startYear=R.date(base.week).year,maximum=Math.max(...generations);
  const breedingYears=Array.from({length:maximum},(_,i)=>startYear+i*3),raceYears=new Set();
  for(const generation of generations)for(const e of templates)raceYears.add(startYear+(generation-1)*3+eventAge(e));
  const fixtures=new Map(),realSimulate=Race.simulate;
  const world=evolveWorld(base,{years:Math.max(...raceYears)-startYear+1,seed,breedingYears,
    onYear:p=>onProgress({phase:'world',...p}),onG1:(s,e)=>{
      const year=R.date(s.week).year;
      if(raceYears.has(year)&&templates.some(t=>t.name===e.name)){
        // Keep only the farm birds. R.race adds exactly the normal five fillers
        // for a twelve-bird field when the actual player enters.
        fixtures.set(key(year,e.name),{event:{...e},rivals:structuredClone(R.worldRoster(s,e,{slots:11}).filter(b=>!b.filler))});
      }
    }});
  if(Race.simulate!==realSimulate)throw Error('Synthetic NPC ranking leaked into physical races');
  const lines=generateLines(base,world,{generations,seed}),stages=[];
  let completed=0;
  for(const generation of generations){
    const entrants=lines.filter(line=>line.generation===generation),rows=[];
    for(const template of templates){
      const attempts=entrants.map(line=>{
        const year=line.bird.birthYear+eventAge(template),fixture=fixtures.get(key(year,template.name));
        if(!fixture)throw Error(`Missing contemporaneous rivals: ${year}/${template.name}`);
        const attempt=raceAttempt(base,line,fixture,{training,seed});
        onProgress({phase:'race',completed:++completed,total:templates.length*3*generations.length,generation,name:template.name,rank:attempt.rank});
        return attempt;
      });
      rows.push({name:template.name,surface:template.surface,distance:template.distance,age:eventAge(template),sex:template.sex,
        wins:attempts.filter(a=>a.finished&&a.rank===1).length,bestRank:Math.min(...attempts.map(a=>a.rank)),attempts});
    }
    stages.push({generation,rows,winningEvents:rows.filter(r=>r.wins>0).length,failedEvents:rows.filter(r=>!r.wins).map(r=>r.name),
      wins:rows.reduce((n,r)=>n+r.wins,0),runs:rows.length*3});
  }
  return {seed,training,generations,attemptsPerEvent:3,eventCount:templates.length,lastWorldYear:Math.max(...raceYears),
    npcModel:'same genetic-ranking world progression as evolving breeding audit; tested G1 races use unmodified production physics and settlement',
    abilityPreparation:'actual birth potential, inherited growth and aptitudes, training 0.95, inborn personality, condition 100, strain 0; age/month-specific open-class qualifying wins assumed',
    stages};
}
module.exports={eventAge,generateLines,prepareEntrant,raceAttempt,auditG1Races};
