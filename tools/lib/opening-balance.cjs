'use strict';
const {R,read}=require('./ranch-fixtures.cjs');
const DEFAULT_SEED=20260930,ABILITY_RATIO=.9;

function openingState(seed=DEFAULT_SEED){
  const s=R.initial(seed);
  // Source/starting-mare ancestry has no dependency on simulated farm careers.
  s.birds=s.birds.filter(b=>!b.farm);s.sale=s.sale.filter(id=>R.bird(s,id));
  return s;
}
function generateOffspring(base,mare,sire){
  const s=structuredClone(base),mother=R.bird(s,s.sale[mare]);
  const father=s.birds.find(b=>b.kind==='root'&&b.lineage===R.ROOTS[sire].lineage);
  const reason=R.crossReason(s,father,mother);
  if(reason)return {blocked:true,mother:mother.name,sire:father.name,reason};
  R.buy(s,mother.id);read(s);R.breed(s,mother.id,father.id);read(s);
  s.week=mother.pregnancy.due;
  // Invoke the production birth lottery exactly once; no weekly world races or rerolls.
  const child=R.createBird(s,{},[father,mother]);
  mother.pregnancy=null;s.stage='running';
  return {s,child,mother:mother.name,sire:father.name};
}
function projectAbilities(s,child,ratio=ABILITY_RATIO){
  const b=structuredClone(child),maximum={...child.potential};
  const birthWeek=(b.birthYear-1)*R.YEAR+R.date(Math.max(1,b.bornWeek)).week;
  s.week=birthWeek+Math.ceil(R.Genetics.growth(b.genome.traits).maturityYears*R.YEAR);
  // This is an explicit hypothetical current-ability projection, not simulated upbringing.
  // Only the copy's ceiling changes, so inherited genes and the real birth roll stay intact.
  b.potential=Object.fromEntries(Object.entries(maximum).map(([key,value])=>[key,Math.max(50,value*ratio)]));
  b.training=Object.fromEntries(Object.keys(b.training).map(key=>[key,1]));
  Object.assign(b,{role:'racing',registered:true,condition:100,strain:0,health:0});
  return {b,maximum,abilities:R.currentAbilities(s,b)};
}
function targetRaces(s,b){
  const tendency=b.genome.distance.reduce((sum,x)=>sum+x,0)/2;
  const distance=tendency>.65?3000:tendency>.3?2400:tendency<-.3?1400:1800;
  const events=R.raceOptions(s,b,s.week).filter(e=>e.opponents==='general');
  return ['new','maiden'].flatMap(level=>['turf','dirt'].map(surface=>events
    .filter(e=>e.level===level&&e.surface===surface)
    .sort((a,b)=>Math.abs(a.distance-distance)-Math.abs(b.distance-distance))[0]));
}
function evaluatePairing(base,mare,sire){
  const generated=generateOffspring(base,mare,sire);
  if(generated.blocked)return generated;
  const {s,child,mother}=generated;
  if(!child)return {mother,sire:generated.sire,failedBirth:true,races:[],canWin:false};
  const {b,maximum,abilities}=projectAbilities(s,child),before=structuredClone(s);
  const targets=targetRaces(s,b);
  if(targets.some(e=>!e))throw Error(`Missing beginner route: ${mare}/${sire}`);
  const races=targets.map(e=>{
    // Use the outermost gate for the offspring rather than selecting a lucky draw.
    const rivals=R.worldRoster(s,e),runs=R.simulateField(s,[...rivals,b],e)
      .sort((a,b)=>Number(b.finished)-Number(a.finished)||(a.finished?a.time-b.time:b.state.distance-a.state.distance));
    const run=runs.find(r=>r.id===b.id);
    return {name:e.name,level:e.level,surface:e.surface,distance:e.distance,rank:runs.indexOf(run)+1,
      finished:run.finished,time:run.time,fieldSize:runs.length,generalOnly:rivals.every(r=>r.filler),allFinished:runs.every(r=>r.finished)};
  });
  if(JSON.stringify(s)!==JSON.stringify(before))throw Error('Balance projection changed the ranch state');
  return {mother,sire:generated.sire,maximum,abilities,races,canWin:races.some(r=>r.finished&&r.rank===1)};
}
function auditOpening(seed=DEFAULT_SEED){
  const base=openingState(seed),rows=[],blocked=[];
  for(let mare=0;mare<3;mare++)for(let sire=0;sire<R.ROOTS.length;sire++){
    const result=evaluatePairing(base,mare,sire);
    (result.blocked?blocked:rows).push(result);
  }
  return {seed,abilityRatio:ABILITY_RATIO,rows,blocked};
}
module.exports={DEFAULT_SEED,ABILITY_RATIO,openingState,generateOffspring,projectAbilities,targetRaces,evaluatePairing,auditOpening};
