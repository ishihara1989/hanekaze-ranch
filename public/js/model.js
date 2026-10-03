/* Shared, DOM-independent breeding / training / race rules. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.RanchModel = model;
})(globalThis, function () {
  'use strict';
  const DEFINITIONS = [
    ['gate', 'ゲート', 'physical', 'ゲートが開いてから走り始めるまでの時間を短縮。'],
    ['speed', '巡航速度', 'physical', 'スパートしていないときの目標速度。'],
    ['acceleration', '加速', 'physical', 'スタートやスパートで目標速度に近づく速さ。'],
    ['stamina', 'スタミナ', 'physical', 'レース中に使える体力の総量。'],
    ['burst', '瞬発力', 'physical', 'スパート中の最大速度を引き上げる。'],
    ['sustain', '持続力', 'physical', 'スパートを維持できる時間。'],
    ['versatility', '自在', 'physical', '得意なペースの幅。流れが変わっても消耗しにくい。'],
    ['mud', '悪路', 'physical', '重い羽場での速度低下を軽減。'],
    ['dirt', 'ダート', 'physical', '砂のコースで速度を発揮する適性。'],
    ['turf', '芝', 'physical', '芝のコースで速度を発揮する適性。'],
    ['precocity', '早熟', 'physical', '若い時期の自然成長と調教による伸びを増やす。'],
    ['longevity', '長命', 'physical', '能力の維持期を延ばし、週経過による衰えを遅らせる。'],
    ['legs', '脚部', 'physical', '調教と出走による脚の負担を抑える。'],
    ['health', '丈夫さ', 'physical', '調教・出走時のコンディション消費を抑える。'],
    ['economy', '燃費', 'physical', '同じペースで走るときの体力消費を減らす。'],
    ['recovery', '回復力', 'physical', '週を進めたときのコンディションと脚の回復を増やす。'],
    ['balance', 'バランス', 'physical', '悪路・コーナーで姿勢を保ち、減速を抑える。'],
    ['corner', 'コーナー', 'physical', 'カーブでの減速を抑える。'],
    ['hill', '登坂', 'physical', '坂道での速度低下を軽減。'],
    ['wind', '耐風', 'physical', '向かい風による速度低下を軽減。'],
    ['heat', '耐暑', 'physical', '暑い日の追加体力消費を軽減。'],
    ['temper', '落ち着き', 'mental', '前へ行きたい気持ちを抑え、自分のペースを保つ力。'],
    ['grit', '根性', 'mental', '競り合い中や体力切れの際の粘り。'],
    ['crowd', '羽混み', 'mental', '前後に囲まれた状況での速度低下を抑える。'],
    ['leader', 'リーダー', 'mental', '前に行きたがる気質。高いと先行志向、低いと後方志向。'],
    ['focus', '集中力', 'mental', 'ゲート反応と走行中の速度のむらを抑える。'],
    ['courage', '度胸', 'mental', 'スタートの緊張による遅れ、羽混みでの萎縮を抑える。'],
    ['learning', '学習力', 'mental', 'すべての調教メニューでの能力の伸びを増やす。'],
    ['adaptability', '順応性', 'mental', '得意でない距離やペースでの不利を軽減。'],
    ['competitive', '闘争心', 'mental', '近くの相手を追うときに速度を上げるが、体力も使う。'],
  ].map(([key, label, group, description]) => ({ key, label, group, description }));
  const KEYS = DEFINITIONS.map(d => d.key);
  const LABELS = Object.fromEntries(DEFINITIONS.map(d => [d.key, d.label]));
  const GROUPS = {physical: 'フィジカル', mental: '性格'};
  const SEX_VARIATION = {M: [-3, 7], F: [-3, 3]};
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const roll = (lo, hi, random = Math.random) => lo + Math.floor(random() * (hi - lo + 1));
  const allelePair = n => n === 2 ? ['A', 'A'] : n === 1 ? ['A', 'a'] : ['a', 'a'];
  const geneticBase = pair => 40 + pair.filter(a => a === 'A').length * 22;
  const baseStats = b => Object.fromEntries(KEYS.map(k => [k, geneticBase(b.genes[k])]));
  const potential = b => Object.fromEntries(KEYS.map(k => [k, clamp(geneticBase(b.genes[k]) + b.talent[k], 1, 99)]));
  const capFor = (b,k) => clamp(geneticBase(b.genes[k])+b.talent[k],1,99);
  const startingValue = (b, k) => Math.floor(capFor(b,k) * .55);
  function stats(b) {
    const caps = potential(b);
    return Object.fromEntries(KEYS.map(k => [k, Math.min(caps[k], Math.floor(caps[k] * .55) + b.training[k])]));
  }
  const trainingRoom = (b, k) => Math.max(0,capFor(b,k)-startingValue(b,k)-b.training[k]);
  function initialize(b, levels, random = Math.random, trained = true) {
    b.genes ||= {}; b.talent = {}; b.training = {}; b.strain = 0;
    for (const k of KEYS) {
      const index = ['speed', 'stamina', 'temper'].indexOf(k);
      b.genes[k] = allelePair(index >= 0 ? levels[index] : roll(0, 2, random));
      b.talent[k] = roll(...SEX_VARIATION[b.sex], random);
    }
    const caps = potential(b);
    for (const k of KEYS) b.training[k] = trained ? Math.floor(caps[k] * .85) - Math.floor(caps[k] * .55) : 0;
    return b;
  }
  function inherit(child, sire, dam, random = Math.random) {
    for (const k of [...KEYS, 'distance', 'color']) child.genes[k] = [sire.genes[k][roll(0, 1, random)], dam.genes[k][roll(0, 1, random)]];
    for (const k of KEYS) {
      child.talent[k] = roll(...SEX_VARIATION[child.sex], random);
      child.training[k] = 0;
    }
    child.strain = 0;
    return child;
  }
  const MENUS = [
    {key:'sprint', name:'短距離練習', traits:['gate','speed','acceleration','burst','focus'], cost:13, load:10},
    {key:'endurance', name:'持久走', traits:['stamina','sustain','economy','grit','heat'], cost:15, load:11},
    {key:'terrain', name:'地形トレーニング', traits:['mud','dirt','turf','hill','wind'], cost:14, load:12},
    {key:'agility', name:'隊列・旋回練習', traits:['versatility','balance','corner','crowd','adaptability'], cost:12, load:8},
    {key:'care', name:'基礎づくり', traits:['precocity','longevity','legs','health','recovery'], cost:8, load:3},
    {key:'mental', name:'ふれあい・併走', traits:['temper','leader','courage','learning','competitive'], cost:9, load:4},
    {key:'balanced', name:'総合トレーニング', traits:KEYS, cost:18, load:9, multiplier:.4},
  ];
  function trainingGain(b, multiplier = 1) {
    const s = stats(b);
    return Math.max(1, Math.round((2 + s.learning * .04 + (b.age < 4*48 ? s.precocity * .035 : 0)) * multiplier));
  }
  function trainingCost(b, menu) { return Math.max(3, Math.round(menu.cost * (1.2 - stats(b).health * .006))); }
  function train(b, menuKey, week, target) {
    const menu = MENUS.find(m => m.key === menuKey);
    if (b.status && (b.age<48 || !['young','racing'].includes(b.status))) return null;
    if (!menu || b.released || b.trainedWeek === week || b.strain >= 70) return null;
    const keys = target ? menu.traits.filter(k => k === target) : menu.traits;
    if (!keys.length || keys.every(k => trainingRoom(b,k) === 0)) return null;
    const cost = trainingCost(b, menu);
    if (b.condition < cost) return null;
    const s = stats(b), gain = trainingGain(b, target ? 1.5 : menu.multiplier || 1), gains = {};
    for (const k of keys) { gains[k] = Math.min(trainingRoom(b,k), gain); b.training[k] += gains[k]; }
    b.condition -= cost;
    b.strain = clamp(b.strain + Math.round(menu.load * (1.1 - s.legs * .009)), 0, 100);
    b.trainedWeek = week;
    return { gains, cost };
  }
  const peakUntil = b => 4*48 + Math.round(stats(b).longevity * 1.1);
  function nextWeek(b) {
    const s = stats(b);
    b.age++;
    b.condition = clamp(b.condition + 15 + Math.round(s.recovery * .25), 0, 100);
    b.strain = clamp(b.strain - 10 - Math.round(s.recovery * .3), 0, 100);
    if (b.age <= 2*48 && b.age%4===0) {
      const growth = 1 + Math.floor(s.precocity / 35);
      for (const k of KEYS) b.training[k] += Math.min(trainingRoom(b,k), growth);
    } else if (b.age > peakUntil(b) && b.age % 8 === 0) {
      // Potential and inherited genes never deteriorate. Training can restore current ability.
      for (const k of KEYS) if (k !== 'longevity') b.training[k] = Math.max(0, b.training[k] - 1);
    }
  }
  function afterRace(b, course) {
    const s = stats(b);
    b.condition = clamp(b.condition - Math.round((course.distance >= 2000 ? 25 : 21) * (1.25 - s.health * .006)), 0, 100);
    b.strain = clamp(b.strain + Math.round((course.surface === 'dirt' ? 16 : 12) * (1.15 - s.legs * .009)), 0, 100);
  }
  const COURSES = {
    short:{name:'若葉スプリント',distance:1200,label:'短距離',surface:'turf',going:'good',hill:0,wind:0,heat:0,purse:[400,240,150,90,60,40]},
    long:{name:'風渡りクラシック',distance:2400,label:'長距離',surface:'turf',going:'good',hill:.7,wind:.7,heat:0,purse:[500,300,180,100,70,50]},
    dirt:{name:'砂丘ダート杯',distance:1800,label:'万能',surface:'dirt',going:'good',hill:.4,wind:.3,heat:1,purse:[450,270,170,95,65,45]},
    rain:{name:'雨音チャレンジ',distance:2000,label:'長距離',surface:'turf',going:'heavy',hill:.3,wind:.5,heat:0,purse:[480,290,175,100,70,50]},
  };
  const aptitude = b => b.genes.distance.every(a => a === 'S') ? '短距離' : b.genes.distance.every(a => a === 'L') ? '長距離' : '万能';
  const gateDelay = (s, random = Math.random) => .15 + (100-s.gate)*.016 + (100-s.focus)*.003 + (100-s.courage)*.003 + random()*.12;
  function runner(b, index, random = Math.random) {
    const s = stats(b);
    return {bird:b,index,stats:s,distance:0,energy:100,velocity:0,finishedAt:null,gate:gateDelay(s,random),spurtTime:0,spurtStarted:false,mode:'ゲート待機',form:.97+random()*.06,phaseSeed:random()*Math.PI*2};
  }
  function factors(r, runners, course, time) {
    const s=r.stats, p=r.distance/course.distance;
    const nearby=runners.filter(o=>o!==r&&o.finishedAt===null&&Math.abs(o.distance-r.distance)<24);
    const ahead=nearby.some(o=>o.distance>r.distance), behind=nearby.some(o=>o.distance<=r.distance);
    const crowded=ahead&&behind;
    const preferred=.9+s.leader*.002;
    const control=.2+s.temper*.008;
    const pace=preferred+(1-preferred)*control;
    const paceStress=Math.max(0,Math.abs(pace-preferred)-(.015+s.versatility*.0015))*(1-s.adaptability*.006);
    const apt=aptitude(r.bird);
    const suitability=apt==='万能'||course.label==='万能'?1:apt===course.label?1.035:.90+s.adaptability*.00085;
    const surface=.87+s[course.surface]*.0016;
    const rough=course.going==='heavy'?.77+s.mud*.0018+s.balance*.0005:1;
    const onCorner=course.track?trackPosition(r.distance,course).corner:Math.abs(Math.sin(p*Math.PI*4))>.6;
    const turn=onCorner?.85+s.corner*.0011+s.balance*.00045:1;
    const hill=1-course.hill*(1-s.hill/100)*.16;
    const wind=1-course.wind*(1-s.wind/100)*.12;
    const crowd=crowded?.80+s.crowd*.0015+s.courage*.0004:1;
    const grit=nearby.length?1+s.grit*.00025:1;
    const chase=ahead?1+s.competitive*.0003:1;
    const concentration=1-Math.abs(Math.sin(time*1.7+r.phaseSeed))*(100-s.focus)*.0006;
    const duration=5+s.sustain*.24;
    const spurtThreshold=.82-(s.leader-50)*.0003;
    const spurt=(p>=spurtThreshold||r.spurtStarted)&&r.spurtTime<duration&&r.energy>3;
    const exhausted=r.energy<20?Math.max(.60,1-(20-r.energy)*.018+s.grit*.0005):1;
    const condition=.78+r.bird.condition*.0022-r.bird.strain*.001;
    const cruise=14+s.speed*.03;
    // burst controls the speed ceiling, sustain its duration, acceleration the ramp.
    const target=Math.min(22.5,(cruise+(spurt?1.2+s.burst*.028:0))*pace*surface*rough*turn*hill*wind*crowd*grit*chase*concentration*suitability*condition*r.form*exhausted);
    const drain=(.57/(.65+s.stamina*.013))*(1.35-s.economy*.007)*(1+Math.max(0,pace-1)*3+paceStress*6)*(spurt?1.9:1)*(ahead?1+s.competitive*.002:1)*(1+course.heat*(1-s.heat/100)*.5);
    return {target,drain,spurt,crowded,ahead,pace,paceStress,duration};
  }
  // A circuit with two true straights and two semicircular turns. Finish is at the end of the home straight.
  function trackPosition(distance,course){
    const track=course.track||{lap:2000,straight:500},straight=track.straight;
    const radius=(track.lap-2*straight)/(2*Math.PI),arc=Math.PI*radius;
    let q=((track.lap-(course.distance%track.lap)+distance)%track.lap+track.lap)%track.lap;
    let x,y,angle,corner=false;
    if(q<arc){angle=Math.PI/2+q/radius;x=radius*Math.cos(angle);y=radius*Math.sin(angle);corner=true;}
    else if(q<arc+straight){x=q-arc;y=-radius;angle=0;}
    else if(q<2*arc+straight){angle=-Math.PI/2+(q-arc-straight)/radius;x=straight+radius*Math.cos(angle);y=radius*Math.sin(angle);corner=true;}
    else{x=straight-(q-2*arc-straight);y=radius;angle=Math.PI;}
    const dx=corner?-Math.sin(angle):Math.cos(angle),dy=corner?Math.cos(angle):0;
    return {x:8+(x+radius)/(straight+2*radius)*84,y:16+(y+radius)/(2*radius)*68,corner,dx,dy,lap:Math.floor((track.lap-(course.distance%track.lap)+distance)/track.lap)+1};
  }
  function stepRace(runners, course, time, dt) {
    // Snapshot before moving anyone prevents update-order bias in pack interactions.
    const snapshot=runners.map(r=>({...r}));
    runners.forEach((r,i)=>{
      if(r.finishedAt!==null)return;
      const activeDt=Math.min(dt,Math.max(0,time-r.gate));
      if(activeDt<=0){r.mode='ゲート待機';return;}
      const f=factors(snapshot[i],snapshot,course,time);
      r.mode=f.spurt?'スパート':f.crowded?'羽混み':f.ahead?'追走':'巡航';
      if(f.spurt){r.spurtStarted=true;r.spurtTime+=activeDt;}
      const previousVelocity=r.velocity;
      const accel=1.4+r.stats.acceleration*.04;
      r.velocity += clamp(f.target-r.velocity,-accel*1.5*activeDt,accel*activeDt);
      r.energy=clamp(r.energy-f.drain*activeDt,0,100);
      const oldDistance=r.distance;
      const distance=(previousVelocity+r.velocity)*.5*activeDt;
      r.distance+=distance;
      if(r.distance>=course.distance) {
        r.finishedAt=time-activeDt+activeDt*(course.distance-oldDistance)/distance;
        r.distance=course.distance;
        r.mode='ゴール';
      }
    });
  }
  function finite(n, lo, hi) { return Number.isFinite(n)&&n>=lo&&n<=hi; }
  function validBird(b, legacy=false) {
    const keys=legacy?['speed','stamina','temper']:KEYS;
    if(!b||typeof b.id!=='string'||typeof b.name!=='string'||!['M','F'].includes(b.sex)||!Number.isInteger(b.age)||b.age<0||!Number.isInteger(b.gen)||b.gen<1||!finite(b.condition,0,100)||!Array.isArray(b.parents)||!b.parents.every(p=>typeof p==='string')||!Number.isInteger(b.races)||b.races<0||!Number.isInteger(b.wins)||b.wins<0||b.wins>b.races||!Number.isInteger(b.trainedWeek)||b.trainedWeek< -1||typeof b.released!=='boolean')return false;
    if(!keys.every(k=>Array.isArray(b.genes?.[k])&&b.genes[k].length===2&&b.genes[k].every(a=>['A','a'].includes(a))&&Number.isInteger(b.talent?.[k])&&finite(b.talent[k],-3,legacy?3:SEX_VARIATION[b.sex][1])&&Number.isInteger(b.training?.[k])&&finite(b.training[k],0,legacy?12:99)))return false;
    if(!['distance','color'].every(k=>Array.isArray(b.genes[k])&&b.genes[k].length===2&&b.genes[k].every(a=>(k==='distance'?['S','L']:['B','C','b']).includes(a))))return false;
    if(!legacy&&(!finite(b.strain,0,100)||KEYS.some(k=>b.training[k]>potential(b)[k]-startingValue(b,k))))return false;
    return true;
  }
  function validState(s, legacy=false) {
    return s?.version===(legacy?1:2)&&Number.isInteger(s.week)&&s.week>=1&&finite(s.money,0,Number.MAX_SAFE_INTEGER)&&Number.isInteger(s.births)&&s.births>=0&&Array.isArray(s.birds)&&s.birds.length>=2&&s.birds.every(b=>validBird(b,legacy))&&s.birds.filter(b=>!b.released).length<=12&&s.birds.every(b=>b.parents.length===0||(b.parents.length===2&&b.parents.every(id=>s.birds.some(p=>p.id===id&&p.gen<b.gen))))&&new Set(s.birds.map(b=>b.id)).size===s.birds.length&&Array.isArray(s.history)&&s.history.every(h=>typeof h.name==='string'&&typeof h.course==='string'&&Number.isInteger(h.rank)&&h.rank>=1&&h.rank<=6&&Number.isInteger(h.week)&&h.week>=1&&finite(h.reward,0,Number.MAX_SAFE_INTEGER))&&s.birds.some(b=>!b.released&&b.sex==='M')&&s.birds.some(b=>!b.released&&b.sex==='F');
  }
  function seeded(seed) {
    let n=2166136261;
    for(const ch of seed)n=Math.imul(n^ch.charCodeAt(0),16777619);
    return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  }
  function migrate(input) {
    if(input?.version===2){if(!validState(input))throw Error('Invalid save');return input;}
    if(!validState(input,true))throw Error('Invalid legacy save');
    const s=JSON.parse(JSON.stringify(input));
    for(const b of s.birds){
      const random=seeded(b.id), old=JSON.parse(JSON.stringify(b));
      initialize(b,['speed','stamina','temper'].map(k=>old.genes[k].filter(a=>a==='A').length),random);
      for(const k of ['speed','stamina','temper']){
        b.genes[k]=old.genes[k];b.talent[k]=old.talent[k];
        const cap=potential(b)[k];
        b.training[k]=cap-startingValue(b,k);
      }
      // Existing genealogy must remain valid for newly added loci as well.
    }
    for(const b of [...s.birds].sort((a,b)=>a.gen-b.gen)){
      if(!b.parents.length)continue;
      const [father,mother]=b.parents.map(id=>s.birds.find(p=>p.id===id)), random=seeded(b.id+'ancestry');
      for(const k of KEYS.filter(k=>!['speed','stamina','temper'].includes(k))){
        b.genes[k]=[father.genes[k][roll(0,1,random)],mother.genes[k][roll(0,1,random)]];
        const cap=potential(b)[k];b.training[k]=Math.floor(cap*.85)-Math.floor(cap*.55);
      }
    }
    s.version=2;
    if(!validState(s))throw Error('Migration failed');
    return s;
  }
  return {DEFINITIONS,KEYS,LABELS,GROUPS,SEX_VARIATION,MENUS,COURSES,geneticBase,baseStats,potential,stats,startingValue,trainingRoom,initialize,inherit,trainingGain,trainingCost,train,peakUntil,nextWeek,afterRace,gateDelay,runner,factors,trackPosition,stepRace,validBird,validState,migrate};
});
