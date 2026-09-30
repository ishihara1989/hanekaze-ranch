/* The new ranch lifecycle. Balance-lab abilities and physics are the source of truth. */
(function (root, factory) {
  const api = typeof module === 'object' && module.exports
    ? factory(require('./world.js'), require('./trait-mapping.js'), require('./race-physics.js'), require('./ranch-genetics.js'), require('./ranch-ground.js'), require('./ranch-race.js'))
    : factory(root.RanchWorld, root.TraitMapping, root.RacePhysics, root.RanchGenetics, root.RanchGround, root.RanchRace);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Ranch = api;
})(globalThis, function (Calendar, Mapping, Physics, Genetics, Ground, Race) {
  'use strict';
  const VERSION = 4, SAVE_KEY = 'hanekaze-ranch-v4', YEAR = 48, GESTATION = 4;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const date = week => ({...Calendar.date(((week-1)%YEAR+YEAR)%YEAR+1),year:Math.floor((week-1)/YEAR)+1});
  const when = week => { const d = date(week); return `${d.year>0?d.year+'年':'開業'+(1-d.year)+'年前'} ${d.month}月 第${d.monthWeek}週`; };
  const PERSONALITY = {grit:'根性', drive:'走る意欲', wisdom:'賢さ', control:'自制心', crowd:'羽混み耐性', fight:'闘争心'};
  const MANAGEMENT = {robustness:'丈夫さ', recovery:'回復力'};
  const TRAINING = {speed:.15, cardio:.45, power:.35, reserve:.30, legs:.45, economy:.40, start:.50, resilience:.35};
  const FACILITIES = {
    stalls:{name:'羽房',cost:12000000,max:4,description:'幼羽・競走羽の枠と、種牡羽・繁殖牝羽の枠を増やします。最大32 / 16 / 16羽。'},
    course:{name:'コース',cost:18000000,max:3,description:'走り込みと動作の練習。段階ごとに調教の効果が上がります。'},
    hill:{name:'坂路',cost:22000000,max:3,description:'瞬発力とスパート容量を育てる調教施設。'},
    pool:{name:'プール',cost:20000000,max:3,description:'脚への負担を抑えながら心肺を育てます。'},
    spa:{name:'温泉',cost:15000000,max:3,description:'休養中の体力と脚の回復を早めます。'},
    clinic:{name:'診療所',cost:16000000,max:3,description:'病気や怪我からの回復を早めます。'},
    meadow:{name:'穏やかな平原',cost:8000000,max:3,description:'自制心と賢さを育てる放牧地。最初から利用できます。'},
    forest:{name:'過酷な森',cost:8000000,max:3,description:'走る意欲と刺激への慣れを育てる放牧地。'},
    shop:{name:'グッズ販売所',cost:25000000,max:3,description:'GⅠ勝者のファンから毎月収入。引退後は5年で減衰、殿堂入りは一部継続。'},
    lab:{name:'研究所',cost:5000000,max:3,description:'Lv.1で性格、Lv.2で現在能力、Lv.3で遺伝と伸びしろを調べられます。',lock:'レース初勝利'},
    statue:{name:'銅像',cost:50000000,max:1,description:'三冠を記念する銅像。研究所の公開段階を1つ進めます。',lock:'三冠制覇'},
    museum:{name:'記念館',cost:100000000,max:1,description:'牧場で8大競走を制覇した記念館。研究所の公開段階を1つ進めます。',lock:'8大競走制覇'},
  };
  const TITLES = {
    triple:['神竜賞','チョコボダービー','オメガ賞'],
    filly:['クリスタル賞','チョコボオークス','ミスリル賞'],
    sprint:['カーバンクル記念','ラムウステークス'],
    mile:['イフリート記念','アレクサンダーカップ'],
    dirt:['タイタンステークス','ナイツ・オブ・ラウンド記念'],
    spring:['リヴァイアサン記念','オーディーン賞（春）','フェニックス記念'],
    autumn:['オーディーン賞（秋）','CRAワールドカップ','バハムート記念'],
  };
  const TITLE_NAMES = {triple:'三冠',filly:'牝羽三冠',sprint:'春秋スプリント',mile:'春秋マイル',dirt:'中央ダートダブル',spring:'春古羽三冠',autumn:'秋古羽三冠'};
  const EIGHT = ['クリスタル賞','神竜賞','チョコボオークス','チョコボダービー','オメガ賞','オーディーン賞（春）','オーディーン賞（秋）','バハムート記念'];
  const ROOT_CATALOG_VERSION = 2;
  const TRAIT_LABELS = {...Object.fromEntries(Mapping.ABILITIES.map(a=>[a.key,a.label])),...MANAGEMENT,...PERSONALITY};
  // Two primary and two supporting donors per trait. Stable order is the lineage ID.
  // See docs/ROOT_STALLIONS.md for naming sources, tradeoffs and the coverage matrix.
  const ROOTS = Object.freeze([
    ['チョコエクレア','speed','start'],
    ['カフェガナッシュ','power','speed'],
    ['メープルブレッド','cardio','legs'],
    ['ヘーゼルビスコッティ','legs','robustness'],
    ['キャラメルフォンダン','reserve','power'],
    ['ピスタチオサブレ','economy','cardio'],
    ['ジンジャースナップ','start','resilience'],
    ['カカオニブ','resilience','recovery'],
    ['ウォールナット','robustness','economy'],
    ['ハニーヨーグルト','recovery','control'],
    ['ビターブラウニー','grit','drive'],
    ['シナモンチャイ','drive','fight'],
    ['アールグレイ','wisdom','crowd'],
    ['バニラカスタード','control','wisdom'],
    ['ミルクブランマンジェ','crowd','grit'],
    ['スパイスショコラ','fight','reserve'],
    ['フランボワーズ','speed','economy'],
    ['ショコラフラン','power','reserve'],
    ['オートミール','cardio','recovery'],
    ['ライラスク','legs','resilience'],
    ['マロンパルフェ','reserve','grit'],
    ['セサミチュイル','economy','robustness'],
    ['レモンソルベ','start','control'],
    ['デーツプディング','resilience','legs'],
    ['アーモンドヌガー','robustness','crowd'],
    ['ココナッツラッシー','recovery','start'],
    ['コクトウカヌレ','grit','cardio'],
    ['オレンジコンフィ','drive','speed'],
    ['ローズマリーフォカッチャ','wisdom','power'],
    ['カモミールシフォン','control','fight'],
    ['ホワイトスフレ','crowd','wisdom'],
    ['ペッパークラッカー','fight','drive'],
  ].map(([name,primary,secondary],index)=>{
    const style = index<16?index%4:(index%4)^3;
    const [distance,release] = [[-.85,-.65],[-.85,.7],[.85,-.7],[.85,.7]][style];
    const tendency = ['短距離・持続型','短距離・末脚型','長距離・持続型','長距離・末脚型'][style];
    const inherited=Genetics.source(index),strengths=Genetics.strengths(inherited),labels={...Genetics.APTITUDES,...Genetics.DEVELOPMENT};
    return Object.freeze({lineage:`root-${index}`,name,primary,secondary,distance,release,tendency,
      strengths:Object.freeze(strengths),comment:`${TRAIT_LABELS[primary]}と${TRAIT_LABELS[secondary]}をつなぐ、${tendency}の血統。${strengths.map(key=>labels[key]).join('・')}。`});
  }));
  const own = s => s.birds.filter(b => b.owner === 'player' && !['retired','archived'].includes(b.role));
  const bird = (s, id) => s.birds.find(b => b.id === id);
  const age = (s, b) => b.kind === 'root' || b.kind === 'founder' ? null : date(s.week).year - b.birthYear;
  const random = s => { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; };
  const pick = (s, items) => items[Math.floor(random(s) * items.length)];
  const capacity = s => ({racing:8 * s.facilities.stalls, mare:4 * s.facilities.stalls, stud:4 * s.facilities.stalls});
  const racingCount = s => own(s).filter(b => ['young','racing'].includes(b.role)).length + own(s).filter(b => b.pregnancy).length;
  const labLevel = s => s.facilities.lab ? Math.min(3, s.facilities.lab + s.facilities.statue + s.facilities.museum) : 0;
  function pay(s, amount, note) {
    if (amount < 0 && s.money < -amount) throw Error('ギルが足りません。');
    s.money += amount;
    s.ledger.push({week:s.week,amount,note});
  }
  function report(s, type, title, text, extra = {}) {
    const item = {id:`report-${s.serial++}`,week:s.week,type,title,text,expression:'talk',...extra};
    s.reports.push(item);
    s.journal.push({...item});
    s.journal = s.journal.slice(-160);
    return item;
  }
  function milestone(s, key, title, text) {
    if (s.milestones[key]) return;
    s.milestones[key] = s.week;
    report(s, 'event', title, text, {expression:'overjoyed'});
  }
  function genome(s, parents, distance, release, frequency=.25) {
    const genes = {};
    for (const key of [...Mapping.ABILITIES.map(a => a.key), ...Object.keys(MANAGEMENT)]) {
      genes[key] = Array.from({length:32}, (_, i) => parents
        ? [pick(s, parents[0].genome.quality[key][i]), pick(s, parents[1].genome.quality[key][i])]
        : [Number(random(s) < frequency), Number(random(s) < frequency)]);
    }
    return {quality:genes,
      distance:parents ? [pick(s, parents[0].genome.distance), pick(s, parents[1].genome.distance)] : [distance, distance],
      release:parents ? [pick(s, parents[0].genome.release), pick(s, parents[1].genome.release)] : [release, release]};
  }
  const quality = g => Object.fromEntries(Object.entries(g.quality).map(([k, pairs]) => [k, 50 + 1.25 * pairs.flat().reduce((n, x) => n + x, 0)]));
  const mean = a => a.reduce((n, x) => n + x, 0) / a.length;
  function createBird(s, options = {}, parents = null) {
    const g = options.genome ?? genome(s, parents, options.distance ?? 0, options.release ?? 0, options.alleleFrequency ?? .25), q = quality(g);
    g.traits ??= Genetics.generate(()=>random(s),parents?.map(p=>p.genome.traits));
    const color=Genetics.expressColor(g.traits.body,g.traits.gold);
    if(color===null)return null;
    const potential = Mapping.generate({quality:q,distance:mean(g.distance),release:mean(g.release),random:() => random(s),birthBounds:parents?pedigreeBonus(s,parents[0],parents[1]):null});
    const temperament = options.inborn ?? Object.fromEntries(Object.keys(PERSONALITY).map(k => [k, clamp(parents ? mean(parents.map(p => p.inborn[k])) + (random(s) - .5) * 14 : 65 + random(s) * 30,50,150)]));
    const b = {id:`bird-${s.serial++}`,name:'名無しの幼羽',sex:random(s)<.5?'F':'M',owner:'player',role:'young',kind:'home',
      birthYear:date(s.week).year,bornWeek:s.week,parents:parents ? parents.map(p => p.id) : [],genome:g,potential,
      inborn:temperament,personality:{...temperament},management:{robustness:q.robustness,recovery:q.recovery},
      training:Object.fromEntries(Mapping.ABILITIES.map(a => [a.key, .1])),
      condition:100,strain:0,health:0,pasture:'meadow',policy:'steady',registered:false,pregnancy:null,bredYear:0,
      races:0,wins:0,g1:0,graded:0,earnings:0,fans:0,records:[],titles:[],lastRace:-100,retiredYear:null,hall:false,
      ...options,color,crest:g.traits.crest,growth:Genetics.growthLabel(g.traits)};
    if (parents) b.lineage = parents[0].lineage;
    s.birds.push(b);
    return b;
  }
  function refreshRoots(s) {
    if(s.rootCatalogVersion===ROOT_CATALOG_VERSION)return s;
    ROOTS.forEach((profile,index)=>{
      const existing=s.birds.find(b=>b.kind==='root'&&b.lineage===profile.lineage);
      // Catalog generation never consumes the ranch's random stream or changes descendants.
      const scratch={week:s.week,rng:(0x524f4f54+index)>>>0,serial:s.serial,birds:[]};
      const genes=Object.fromEntries([...Mapping.ABILITIES.map(a=>a.key),...Object.keys(MANAGEMENT)].map((key,traitIndex)=>{
        const count=key===profile.primary?20:key===profile.secondary?14:8;
        return [key,Array.from({length:32},(_,locus)=>{
          const allele=Number((locus+index*7+traitIndex*3)%32<count);
          return [allele,allele];
        })];
      }));
      const inborn=Object.fromEntries(Object.keys(PERSONALITY).map(key=>[key,key===profile.primary?112:key===profile.secondary?98:80]));
      const b=createBird(scratch,{name:profile.name,sex:'M',owner:'source',role:'stud',kind:'root',lineage:profile.lineage,
        genome:{quality:genes,distance:[profile.distance,profile.distance],release:[profile.release,profile.release],traits:Genetics.source(index)},
        inborn,comment:profile.comment,fee:600});
      if(existing)Object.assign(existing,{...b,id:existing.id});
      else {s.birds.push(b);s.serial=scratch.serial;}
    });
    s.rootCatalogVersion=ROOT_CATALOG_VERSION;
    return s;
  }
  const MAJOR_FARMS=[
    {name:'ファイア牧場',prefix:'ファイア',quality:.42},
    {name:'ブリザド牧場',prefix:'ブリザド',quality:.46},
    {name:'サンダラ牧場',prefix:'サンダラ',quality:.52},
    {name:'フレア牧場',prefix:'フレア',quality:.60},
    {name:'メテオ牧場',prefix:'メテオ',quality:.67},
    {name:'アルテマ牧場',prefix:'アルテマ',quality:.70},
  ];
  const farmName=b=>b.owner==='player'?'羽風牧場':b.farm||'他の牧場';
  const rating=value=>value<60?'X':value<80?'△':value<100?'◯':value<120?'◎':'☆';
  function profile(b) {
    const values={...b.potential,...b.management,...b.inborn};
    const sorted=Object.entries(values).sort((a,b)=>b[1]-a[1]);
    const describe=items=>items.map(([key,value])=>`${TRAIT_LABELS[key]} ${rating(value)}`).join('・');
    return {distance:mean(b.genome.distance)>.3?'長距離寄り':mean(b.genome.distance)<-.3?'短距離寄り':'距離は中間',
      style:mean(b.genome.release)>.3?'差し寄り':mean(b.genome.release)<-.3?'先行寄り':'脚質は中間',
      strengths:describe(sorted.slice(0,2)),weaknesses:describe(sorted.slice(-2).reverse())};
  }
  function searchSires(s,{query='',route='',sort='fee'}={}) {
    const routeMatch=b=>!route||b.records.some(r=>r.level==='GI'&&r.rank===1&&(route==='dirt'?r.surface==='dirt':r.surface==='turf'&&(route==='sprint'?r.distance<=1400:route==='mile'?r.distance>1400&&r.distance<=1800:route==='long'?r.distance>=2800:r.distance>1800&&r.distance<2800)));
    const text=query.trim().toLocaleLowerCase();
    const score=b=>b.potential[sort]??b.management[sort]??b.inborn[sort]??(Genetics.APTITUDES[sort]?50+100*mean(b.genome.traits.aptitude[sort]):0);
    return sires(s).filter(b=>routeMatch(b)&&`${b.name} ${farmName(b)} ${b.records.filter(r=>r.rank===1).map(r=>r.name).join(' ')}`.toLocaleLowerCase().includes(text))
      .sort((a,b)=>sort==='fee'?breedFee(a)-breedFee(b):sort==='g1'?b.g1-a.g1:score(b)-score(a));
  }
  const g1Points=e=>e.surface==='dirt'?60:e.distance<=1400?70:e.minAge===2||/オニオン|光の戦士/.test(e.name)?80:e.sex||e.sexRestricted?100:e.distance>=2800?140:/ダービー|ワールドカップ|バハムート/.test(e.name)?180:120;
  function economyEvent(e) {
    const prize={new:1000,maiden:900,c1:1400,c2:1800,c3:2200,open:2600,GIII:15000000,GII:40000000,GI:Math.max(100000000,g1Points(e)*1000000)}[e.level];
    return {...e,fee:/^G/.test(e.level)?500:e.fee,allowance:/^G/.test(e.level)?300:e.allowance,
      purse:[1,.4,.25,.15,.1,0].map(f=>Math.round(prize*f))};
  }
  const calendar=week=>Calendar.calendar(week).map(economyEvent);
  function inheritanceWeights(r) {
    // Every G1 is mapped by the demands of its surface and distance.
    if(r.surface==='dirt')return {power:1.1,resilience:1,legs:.7,start:.6};
    if(r.distance<=1400)return {speed:1.2,power:.9,reserve:.8,start:.5};
    if(r.distance<=1800)return {speed:1,reserve:1,economy:.8,start:.6};
    if(r.distance<2400)return {cardio:.9,power:.9,economy:.9,resilience:.7};
    if(r.distance<2800)return {cardio:1,legs:.9,reserve:.8,economy:.7};
    return {legs:1.2,cardio:1,economy:.7,resilience:.5};
  }
  function pedigreeBonus(s,sire,dam) {
    const bonus=Object.fromEntries(Mapping.ABILITIES.map(a=>[a.key,{lower:0,upper:0}]));
    const seen=new Set();
    function visit(b,depth) {
      if(!b||depth>3||seen.has(b.id))return;
      seen.add(b.id);
      for(const r of b.records.filter(r=>r.rank===1&&r.level==='GI'))for(const [key,weight] of Object.entries(inheritanceWeights(r))) {
        const side=b.sex==='F'?'lower':'upper';
        bonus[key][side]=Math.min(12,bonus[key][side]+weight*(g1Points(r)/100)*Math.pow(.5,depth));
      }
    }
    // Visit nearer ancestors first, so a repeated ancestor keeps its strongest contribution.
    const queue=[[sire,0],[dam,0]];
    while(queue.length){const [b,depth]=queue.shift();if(!b||depth>3||seen.has(b.id))continue;visit(b,depth);b.parents.forEach(id=>queue.push([bird(s,id),depth+1]));}
    return bonus;
  }
  function worldGroup(e) {
    if(e.level!=='GI')return `support-${e.surface}`;
    if(e.sex)return `female-${e.minAge===2?'young':e.maxAge===3?'classic':'older'}`;
    if(e.minAge===2&&e.maxAge===2)return 'juvenile';
    if(e.surface==='dirt')return 'dirt';
    if(e.distance<=1400)return 'sprint';
    if(e.maxAge===3)return e.distance>=2800?'classic-long':e.distance>=2200?'classic-derby':e.distance>=1800?'classic-middle':'classic-mile';
    if(e.distance<=1800)return 'mile';
    if(e.distance>=2800)return 'long';
    return 'middle';
  }
  function worldRoster(s,e) {
    const year=date(s.week).year,group=worldGroup(e);
    let runners=s.birds.filter(b=>b.owner==='npc'&&b.season===year&&b.worldGroup===group);
    if(!runners.length) {
      const suffix=['リーフ','ウィング','ブレイズ','クラウン','ノヴァ','ホープ'];
      runners=MAJOR_FARMS.map((farm,i)=>{
        const distance=e.distance>=2800?.9:e.distance>=2200?.5:e.distance<=1600?-.8:0;
        const routeNames={juvenile:'若葉',dirt:'砂塵',sprint:'疾風','classic-middle':'神竜','classic-mile':'新星','classic-derby':'王冠','classic-long':'大河',mile:'閃光',long:'悠久',middle:'栄光','female-young':'若姫','female-classic':'水晶','female-older':'女王','support-turf':'草原','support-dirt':'砂丘'};
        const b=createBird(s,{name:`${farm.prefix}${suffix[i]}${routeNames[group]}${year}`,owner:'npc',farm:farm.name,season:year,worldGroup:group,
          role:'racing',kind:'general',registered:true,sex:e.sex||(e.level==='GI'?'M':'F'),birthYear:year-(e.maxAge===3?3:e.maxAge===2?2:5),distance,release:-.8+random(s)*1.6,alleleFrequency:farm.quality,lineage:`root-${Math.floor(random(s)*32)}`});
        b.training=Object.fromEntries(Mapping.ABILITIES.map(a=>[a.key,.95]));
        b.genome.traits.aptitude[e.surface]=[1,1];
        b.genome.traits.development.earlyGrowth=[1,1];b.growth='early';
        return b;
      });
    }
    return runners.filter(b=>age(s,b)>=e.minAge&&age(s,b)<=e.maxAge);
  }
  function runWorldEvent(s,e,players=[]) {
    const rivals=worldRoster(s,e);
    const entrants=[...players,...rivals].slice(0,12);
    const runs=simulateField(s,entrants,e,players.length>0).sort((a,b)=>Number(b.finished)-Number(a.finished)||(a.finished?a.time-b.time:b.state.distance-a.state.distance));
    const field=runs.map(({id,name,time,finished})=>({id,name,time,finished,farm:farmName(bird(s,id))}));
    runs.forEach((run,i)=>{
      const b=bird(s,run.id);if(b.owner==='player')return;
      const rank=i+1,reward=(run.finished?e.purse[i]||0:0)+e.allowance;
      b.records.push({week:s.week,year:date(s.week).year,name:e.name,level:e.level,distance:e.distance,surface:e.surface,trackId:e.trackId,rank,reward,time:run.time,finished:run.finished,field,sexRestricted:!!e.sex});
      b.races++;b.earnings+=reward;b.lastRace=s.week;
      if(rank===1&&run.finished){b.wins++;b.graded++;if(e.level==='GI'){b.g1++;b.fans+=1200;}}
    });
    return runs;
  }
  function retireWorld(s,year) {
    // Prefer new winners. If players sweep the season, past champions may return for a
    // new five-year contract; do not invent G1 records just to fill the ten places.
    const candidates=s.birds.filter(b=>b.farm&&b.sex==='M'&&b.g1>0&&(b.retiredYear===null||year-b.retiredYear>=4)&&b.owner!=='player');
    const selected=[],groups=new Set();
    candidates.sort((a,b)=>Number(a.retiredYear!==null)-Number(b.retiredYear!==null)||b.g1-a.g1||b.earnings-a.earnings);
    for(const b of candidates)if(!groups.has(b.worldGroup)){selected.push(b);groups.add(b.worldGroup);if(selected.length===10)break;}
    for(const b of candidates)if(selected.length<10&&!selected.includes(b))selected.push(b);
    for(const b of s.birds.filter(b=>b.owner==='npc')){b.owner='archive';b.role='archived';if(b.sex==='F')b.retiredYear=year;}
    for(const b of selected){b.owner='public';b.role='stud';b.retiredYear=year+1;}
    // Non-winners remain named in the race fields; they need no full genome in saves.
    const ancestors=new Set(s.birds.flatMap(b=>b.parents));
    s.birds=s.birds.filter(b=>!(b.owner==='archive'&&b.farm&&!b.graded&&!ancestors.has(b.id)));
  }
  let historyTemplate=null;
  function ensureWorld(s) {
    if(s.worldVersion===1)return;
    if(!historyTemplate) {
      const scratch={week:1,rng:0x574f524c,serial:1,birds:[]};
      for(let year=1;year<=5;year++) {
        for(let week=(year-1)*YEAR+1;week<=year*YEAR;week++) {
          scratch.week=week;
          for(const e of calendar(week).filter(e=>/^G/.test(e.level)))runWorldEvent(scratch,e);
        }
        retireWorld(scratch,year);
      }
      historyTemplate=JSON.stringify(scratch.birds);
    }
    // Keep old lineage records, retire the former placeholder market entries.
    s.birds.filter(b=>b.owner==='public'&&!b.farm).forEach(b=>b.role='archived');
    const imported=JSON.parse(historyTemplate),ids=new Map(imported.map(b=>[b.id,`bird-${s.serial++}`]));
    const shift=date(s.week).year-6;
    for(const b of imported) {
      b.id=ids.get(b.id);b.birthYear+=shift;b.bornWeek+=shift*YEAR;b.season+=shift;
      if(b.retiredYear!==null)b.retiredYear+=shift;
      b.lastRace+=shift*YEAR;
      b.records.forEach(r=>{r.week+=shift*YEAR;r.year+=shift;r.field.forEach(x=>x.id=ids.get(x.id)||x.id);});
      s.birds.push(b);
    }
    s.worldVersion=1;
  }
  function upgradeState(s) {
    if(s.geneticsVersion!==Genetics.VERSION){
      for(const b of s.birds){
        b.genome.traits??=Genetics.legacy(b);
        b.crest=b.genome.traits.crest;
      }
      s.geneticsVersion=Genetics.VERSION;
    }
    refreshRoots(s);
    ensureWorld(s);
    return s;
  }
  function refreshMarket(s) {
    const year = date(s.week).year;
    if (s.marketYear === year) return;
    s.marketYear = year;
    s.birds.filter(b => b.owner === 'sale').forEach(b => {b.role = 'archived'; b.owner = 'archive';});
    s.sale = [
      ['ハルノコムギ',.0,-.2,'おだやかで、人の合図によく耳を傾ける子です。',2800],
      ['ミズノシズク',.8,.4,'長く歩いても、まだ先へ行きたそうですね。',3200],
      ['アカネノハネ',-.8,.65,'走り始めると、とても軽やか。少し元気いっぱいです。',3200],
    ].map(([name,distance,release,comment,price],i) => {
      const b=createBird(s,{name:year===1?name:`${name}${year}`,sex:'F',role:'mare',owner:'sale',kind:'general',birthYear:year-4,distance,release,comment,price});
      const traits=i===0?{control:98,drive:75,wisdom:86}:i===1?{drive:87,control:80}:{drive:105,control:68};
      Object.assign(b.inborn,traits);Object.assign(b.personality,traits);return b.id;
    });
    s.birds.filter(b => b.owner==='public' && b.role==='stud' && year-b.retiredYear>=5).forEach(b => b.role='archived');
    const retired=s.birds.filter(b=>b.sex==='F'&&b.farm&&b.owner==='archive'&&b.retiredYear===year-1&&b.graded>0).sort((a,b)=>b.earnings-a.earnings);
    const graduates=[...retired.filter(b=>b.g1).slice(0,2),...retired.filter(b=>!b.g1).slice(0,2)];
    for(const b of graduates){b.owner='sale';b.role='mare';b.price=marePrice(b);b.comment='他牧場で走り、重賞の実績を残した繁殖牝羽です。';s.sale.push(b.id);}
  }

  function initial(seed = 20260930) {
    const s = {version:VERSION,geneticsVersion:Genetics.VERSION,week:9,money:20000,debt:0,rng:seed>>>0,serial:1,birds:[],sale:[],marketYear:0,stage:'buy',reports:[],journal:[],ledger:[],milestones:{},awards:[],founderOffers:[],
      facilities:Object.fromEntries(Object.keys(FACILITIES).map(k => [k,['stalls','meadow'].includes(k)?1:0])),difficulty:'normal',lastAnnual:0};
    refreshRoots(s);
    ensureWorld(s);
    refreshMarket(s);
    const starter=createBird(s,{name:'ハネカゼノヒカリ',sex:'F',role:'racing',registered:true,trainer:'moogle',policy:'steady',birthYear:-1,distance:-.7,release:.7,
      potential:{speed:103,cardio:78,power:116,reserve:108,legs:73,economy:82,start:76,resilience:78},comment:'瞬発力のある2歳牝羽。モーグリが調教・休養・出走を担当します。'});
    starter.training=Object.fromEntries(Mapping.ABILITIES.map(a=>[a.key,.75]));
    starter.genome.traits.development.earlyGrowth=[1,1];starter.growth='early';
    return s;
  }
  const saleOpen = s => [2,3].includes(date(s.week).month);
  const sires = s => s.birds.filter(b => b.role==='stud' && (['root','founder'].includes(b.kind)||b.owner==='player'||date(s.week).year-b.retiredYear<5));
  const studFee = b => {
    if(b.kind==='root')return 600;
    const wins=b.records.filter(r=>r.level==='GI'&&r.rank===1);
    if(!wins.length)return 300000;
    if(wins.every(r=>r.surface==='dirt'||r.distance<=1400))return Math.min(1000000,300000+(wins.length-1)*150000);
    const prestige=wins.reduce((n,r)=>n+g1Points(r),0);
    return Math.min(80000000,3000000+prestige*100000);
  };
  const marePrice=b=>b.g1?100000000+b.records.filter(r=>r.rank===1&&r.level==='GI').reduce((n,r)=>n+g1Points(r)*1000000,0):b.graded?10000000+b.graded*5000000:2800;
  const breedFee = b => b.owner==='player'?0:studFee(b);
  function buy(s, id) {
    if (!saleOpen(s)) throw Error('繁殖牝羽セールは2月〜3月です。');
    const b=bird(s,id);
    if (!b || b.owner!=='sale' || !s.sale.includes(id)) throw Error('この繁殖牝羽は購入できません。');
    if (own(s).filter(b=>b.role==='mare').length>=capacity(s).mare) throw Error('繁殖牝羽の羽房がいっぱいです。');
    pay(s,-b.price,`${b.name}を購入`); b.owner='player';
    if (s.stage==='buy') s.stage='breed';
    milestone(s,'purchase','最初の仲間を迎えました',`${b.name}、ようこそ羽風牧場へ。次はこの子の相手を選びましょう。源流の種牡羽なら、いつでも配合をお願いできますよ。`);
    return b;
  }
  function breedingReason(s, dam, sire) {
    if (!dam || dam.owner!=='player' || dam.role!=='mare') return '繁殖牝羽を選んでください。';
    if (!sire || !sires(s).includes(sire)) return '種牡羽を選んでください。';
    if (age(s,dam)>=20) return 'この繁殖牝羽は繁殖を引退する年齢です。';
    if (dam.pregnancy) return '出産を待っています。';
    if (dam.bredYear===date(s.week).year) return '今年の配合は済んでいます。来年また会いましょう。';
    if (racingCount(s)>=capacity(s).racing) return '子どものための羽房を拡張してください。';
    if (s.money<breedFee(sire)) return '配合料金が足りません。';
    return '';
  }
  function breed(s, damId, sireId) {
    const dam=bird(s,damId),sire=bird(s,sireId),reason=breedingReason(s,dam,sire);
    if (reason) throw Error(reason);
    pay(s,-breedFee(sire),`${dam.name} × ${sire.name} 配合`);
    dam.pregnancy={sireId,due:s.week+GESTATION}; dam.bredYear=date(s.week).year;
    if (s.stage==='breed') s.stage='grow';
    milestone(s,'breeding','新しい命を、いっしょに待ちましょう',`配合が終わりました。${when(dam.pregnancy.due)}に生まれる予定です。お世話は私に任せて、まずは次の週へ進みましょう。放牧地を選ばなければ、穏やかな平原で育てます。`);
  }
  function observe(s,b) {
    const d=mean(b.genome.distance),r=mean(b.genome.release);
    const body=d>.35?'長く走ることが得意になりそう':d<-.35?'短い距離を軽やかに走れそう':'いろいろな距離を試してみたい';
    const character=b.personality.control>85?'落ち着いて合図を聞いてくれます':b.personality.drive>85?'走ることが大好きな、元気な子です':'少しずつ、人との呼吸を覚えています';
    return `${body}ですね。${r>.3?'力をためてから走り出すのが好きみたい。':''}${character}。`;
  }
  function currentAbilities(s,b) {
    const genes=Genetics.growth(b.genome.traits),birthWeek=(b.birthYear-1)*YEAR+date(Math.max(1,b.bornWeek)).week;
    const years=age(s,b)===null?genes.maturityYears:Math.max(0,(s.week-birthWeek)/YEAR);
    const maturity=clamp(years/genes.maturityYears,0,1);
    const decline=clamp(1-Math.max(0,years-genes.declineStart)*genes.declineRate,.6,1);
    return Object.fromEntries(Mapping.ABILITIES.map(({key})=>[key,50+(b.potential[key]-50)*maturity*decline*(1-TRAINING[key]+TRAINING[key]*b.training[key])]));
  }
  function facilityReason(s,key) {
    const f=FACILITIES[key];
    if (!f) return '施設が見つかりません。';
    if (s.facilities[key]>=f.max) return '最大まで拡張済みです。';
    if (key==='lab'&&!s.milestones.win) return 'レース初勝利で建設できます。';
    if (key==='statue'&&!s.birds.some(b=>b.owner==='player'&&b.titles.some(t=>/^(triple|filly):/.test(t)))) return '三冠制覇で建設できます。';
    if (key==='museum'&&!EIGHT.every(n=>s.birds.some(b=>b.owner==='player'&&b.records.some(r=>r.rank===1&&r.name===n)))) return '牧場で8大競走を制覇すると建設できます。';
    if (s.money<facilityCost(s,key)) return 'ギルが足りません。';
    return '';
  }
  const facilityCost=(s,key)=>FACILITIES[key].cost*(s.facilities[key]+1);
  function build(s,key) {const reason=facilityReason(s,key);if(reason)throw Error(reason);pay(s,-facilityCost(s,key),`${FACILITIES[key].name}を建設・拡張`);s.facilities[key]++;}
  function setPasture(s,id,value) {
    const b=bird(s,id);
    if (!b||b.owner!=='player'||b.role!=='young'||!['meadow','forest'].includes(value)) throw Error('幼羽の放牧地を選んでください。');
    if (!s.facilities[value]) throw Error('先に放牧地を整備してください。');
    b.pasture=value;
  }
  function setPolicy(s,id,value) {
    const b=bird(s,id);
    if (!b||b.owner!=='player'||!['young','racing'].includes(b.role)||!['steady','challenge'].includes(value)) throw Error('方針を選んでください。');
    b.policy=value;
  }
  function rename(s,id,name) {
    const b=bird(s,id),clean=String(name).trim();
    if (!b||b.owner!=='player'||!clean||clean.length>20) throw Error('名前は1〜20文字で入力してください。');
    b.name=clean;
  }
  function retire(s,id) {
    const b=bird(s,id);
    if (!b||b.owner!=='player'||b.role!=='racing') throw Error('競走羽を選んでください。');
    const role=b.sex==='M'?'stud':'mare';
    if (own(s).filter(b=>b.role===role).length>=capacity(s)[role]) throw Error('繁殖用の羽房を拡張してください。');
    b.role=role;b.kind='home';b.retiredYear=date(s.week).year;b.hall=b.g1>=3;
    report(s,'event',`${b.name}、次の世代へ`,`${b.races}戦${b.wins}勝。おつかれさまでした。${b.hall?'殿堂入りも決まりました。':''}これからは${role==='stud'?'種牡羽':'繁殖牝羽'}として、この牧場を支えてもらいましょう。`,{expression:'happy'});
  }
  function classFor(b) {return b.races===0?'new':b.wins===0?'maiden':b.wins===1?'c1':b.wins===2?'c2':b.wins===3?'c3':'open';}
  function eligible(s,b,e) {
    const years=age(s,b);
    if (b.role!=='racing'||!b.registered||years<e.minAge||years>e.maxAge||(e.sex&&e.sex!==b.sex)) return false;
    if (/^G/.test(e.level)) return b.wins>=2;
    return e.level===classFor(b)||(e.level==='maiden'&&b.races===0);
  }
  function nextRace(s,b) {
    if (b.role!=='racing'||!b.registered) return null;
    const preferred=mean(b.genome.distance)>.3?2400:mean(b.genome.distance)<-.3?1400:1800;
    const candidates=[];
    for(let week=s.week;week<s.week+12;week++) {
      if (week-b.lastRace<4) continue;
      for(const e of calendar(week)) if(eligible(s,b,e)) {
        const graded=/^G/.test(e.level),strength=mean(Object.values(currentAbilities(s,b)));
        if(b.policy==='steady'&&graded&&(b.wins<5||strength<80))continue;
        const footing=Ground.efficiency(b.genome.traits,e);
        candidates.push({event:e,score:Math.abs(e.distance-preferred)/800+(week-s.week)*.13+8*(1-footing.traction)-(b.policy==='challenge'&&graded?3:0)});
      }
    }
    return candidates.sort((a,b)=>a.score-b.score)[0]?.event||null;
  }
  function raceEntry(s,b,e) {
    const p=Mapping.toPhysics(currentAbilities(s,b));
    // Management state affects the physical initial state, never a distance bonus.
    const effective={...p,criticalSpeed:p.criticalSpeed*(.97+.03*b.condition/100)};
    const ground=Ground.efficiency(b.genome.traits,e);
    // Find the sustainable ground speed at unchanged aerobic power and contact losses.
    let lo=0,hi=effective.criticalSpeed;
    for(let i=0;i<35;i++){const mid=(lo+hi)/2;if(Physics.flatPower(mid,effective)<Physics.criticalPower(effective)*ground.traction)lo=mid;else hi=mid;}
    const groundCruise=(lo+hi)/2;
    const runner=Physics.createState(effective);
    runner.reserve*=.75+.25*b.condition/100;runner.fatigue=.25*b.strain/100;
    return {id:b.id,name:b.name,p:effective,parameters:p,traits:b.personality,cruise:groundCruise,state:runner,ground};
  }
  function simulateField(s,birds,e,trace=false) {
    return Race.simulate(birds.map(b=>raceEntry(s,b,e)),e,{trace});
  }
  function simulateBird(s,b,e,trace=false) {
    return simulateField(s,[b],e,trace)[0];
  }
  function race(s,b,e,sharedRuns=null) {
    e=economyEvent(e);
    if(!b||!e||e.week!==s.week||b.lastRace===s.week||!eligible(s,b,e))throw Error('この週には出走できません。');
    if(s.money<e.fee)return null;
    if(!sharedRuns&&/^G/.test(e.level)){
      if(s.birds.some(x=>x.farm&&x.records.some(r=>r.week===s.week&&r.name===e.name)))throw Error('この競走は確定済みです。');
      sharedRuns=runWorldEvent(s,e,[b]);
    }
    pay(s,-e.fee,`${b.name} 出走登録`);
    const rivals=[];
    if(!sharedRuns) {
    // Race-specific rivals use a separate seed: replay and saves never reroll the field.
    const scratch={rng:(s.rng^s.week^b.races)>>>0,serial:10000,birds:[],week:s.week};
    // Class strength is a genetic population, not a hidden race-speed multiplier.
    // Beginners meet immature novice rivals; GI fields approach quality 100.
    const frequency={new:.10,maiden:.10,c1:.22,c2:.3,c3:.38,open:.45,GIII:.50,GII:.56,GI:.625}[e.level];
    for(let i=0;i<11;i++) {
      const r=createBird(scratch,{name:`${['ファイア','ブリザド','サンダラ','フレア'][i%4]}${['リーフ','スター','ウィング'][i%3]}`,role:'racing',registered:true,birthYear:date(s.week).year-Math.max(2,e.minAge),distance:-1+2*random(scratch),release:-1+2*random(scratch),alleleFrequency:frequency});
      // Rivals are local to this race, outside the persistent bird ID namespace.
      r.id=`rival-${i}`;
      r.training=Object.fromEntries(Mapping.ABILITIES.map(a=>[a.key,b.wins===0?.25:.65]));
      rivals.push(r);
    }
    }
    const runs=(sharedRuns||simulateField(s,[b,...rivals],e,true)).sort((a,b)=>Number(b.finished)-Number(a.finished)||
      (a.finished?a.time-b.time:b.state.distance-a.state.distance));
    const rank=runs.findIndex(x=>x.id===b.id)+1,run=runs[rank-1],reward=(run.finished?e.purse[rank-1]||0:0)+e.allowance;
    pay(s,reward,`${b.name} ${e.name} ${rank}着`);
    const result={week:s.week,year:date(s.week).year,name:e.name,level:e.level,distance:e.distance,surface:e.surface,trackId:e.trackId,going:run.ground.going,cushion:run.ground.cushion,rank,reward,time:run.time,finished:run.finished,field:runs.map(({name,time,id,finished})=>({name,time,id,finished})),sexRestricted:!!e.sex,interactions:run.interactions};
    b.races++;b.lastRace=s.week;b.earnings+=reward;b.records.push(result);
    const durability=1-.1*(b.management.robustness-100)/50;
    b.condition=clamp(b.condition-durability*(4+14*run.state.energyUsed/12000+10*run.state.reserveSpent/run.parameters.reserveCapacity),0,100);
    b.strain=clamp(b.strain+durability*(3+22*run.state.fatigue),0,100);
    if(e.level==='GI') b.fans+=rank===1?1200:150;
    if(rank===1&&run.finished) {
      b.wins++;if(/^G/.test(e.level))b.graded++;
      milestone(s,'win','はじめての勝利！',`${b.name}、やったね！ 小さかったあの子が、一番で帰ってきました。研究所が解放されました。資金を貯めて、遺伝の研究を始めましょう。`);
      if(e.level==='GI') {
        b.g1++;
        milestone(s,'g1','ついに、GⅠの頂点へ',`${b.name}がGⅠ初勝利です！ 私たちの牧場から、こんな子が育つなんて。これからの配合にも、この実績が受け継がれます。`);
        if(e.name==='チョコボダービー')milestone(s,'derby','ダービーを、いっしょに勝ちました',`${b.name}がダービーを制しました。あの日、最初の一羽を迎えたときから、ここまで来たんですね。これからも、あなたとこの牧場を育てていきたいです。`);
        const multiplier={easy:1.5,normal:1,hard:.7}[s.difficulty];
        const bonus=title=>{if(!b.titles.includes(title)){b.titles.push(title);b.fans+=Math.round(1200*multiplier);milestone(s,`${b.id}:${title}`,`${b.name}の新しい記録`,`${title.replace(/:\d+$/,'')}の達成で、この子を応援する人が増えていますよ。`);}};
        for(const [key,names] of Object.entries(TITLES))if(names.every(n=>b.records.some(r=>r.rank===1&&r.name===n&&r.year===result.year))) {
          const title=`${key}:${result.year}`;
          if(!b.titles.includes(title)){b.titles.push(title);b.fans+=Math.round(2400*multiplier);milestone(s,`${b.id}:${title}`,`${TITLE_NAMES[key]}、達成！`,`${b.name}が${TITLE_NAMES[key]}を達成しました。この一年の挑戦、ずっと忘れません。`);}
        }
        if([3,5,7,9].includes(b.g1))bonus(`GⅠ${b.g1}勝`);
        if(b.sex==='F'&&!e.sex)bonus('牝羽で混合GⅠ制覇');
        if(b.color==='golden')bonus('黄金のGⅠ勝者');
        const distanceAt=(r,t)=>{const i=r.samples.findIndex(x=>x.time>=t);if(i<0)return e.distance;if(i===0)return 0;const a=r.samples[i-1],z=r.samples[i];return a.distance+(z.distance-a.distance)*(t-a.time)/(z.time-a.time);};
        const straight=run.samples.find(x=>x.distance>=e.distance-400)?.time||run.time;
        if(runs.filter(r=>distanceAt(r,straight)>distanceAt(run,straight)).length>=8)bonus('豪脚一閃');
        if(run.samples.filter(x=>x.distance>=200).every(x=>runs.every(r=>distanceAt(r,x.time)<=x.distance+.01)))bonus('逃げ切り');
      }
    }
    return result;
  }
  function founderEligible(s,b) {
    const children=s.birds.filter(x=>x.parents[0]===b.id&&x.g1>0);
    return b.owner==='player'&&b.role==='stud'&&b.kind==='home'&&!!b.lineage&&children.length>=3&&children.reduce((n,x)=>n+x.g1,0)>=7;
  }
  function promote(s,id) {
    const b=bird(s,id);
    if(!s.founderOffers.includes(id)||!b||!founderEligible(s,b))throw Error('始祖入りのオファーはまだ届いていません。');
    const previous=s.birds.find(x=>x.kind==='founder'&&x.lineage===b.lineage);
    if(previous){previous.kind='home';previous.role='archived';}
    b.kind='founder';s.founderOffers=s.founderOffers.filter(x=>x!==id);
    milestone(s,`founder:${id}`,'新しい始祖の誕生',`${b.name}が${ROOTS.find(root=>root.lineage===b.lineage)?.name||'源流'}を継ぐ始祖になりました。この血統は、これからもずっと私たちのそばにいます。`);
  }
  function annual(s,year) {
    if(s.lastAnnual===year)return;
    s.lastAnnual=year;
    const candidates=s.birds.filter(b=>b.records.some(r=>r.year===year&&r.level==='GI'&&r.rank===1));
    const categories=[['最優秀2歳',b=>year-b.birthYear===2,()=>true],['最優秀3歳',b=>year-b.birthYear===3,()=>true],['最優秀古羽',b=>year-b.birthYear>=4,()=>true],['最優秀牝羽',b=>b.sex==='F',()=>true],['最優秀短距離',()=>true,r=>r.surface==='turf'&&r.distance<=1400],['最優秀マイル',()=>true,r=>r.surface==='turf'&&r.distance>1400&&r.distance<=1800],['最優秀中距離',()=>true,r=>r.surface==='turf'&&r.distance>1800&&r.distance<2800],['最優秀長距離',()=>true,r=>r.surface==='turf'&&r.distance>=2800],['最優秀ダート',()=>true,r=>r.surface==='dirt'],['年度代表羽',()=>true,()=>true]];
    const awards=[];
    for(const [title,filter,raceFilter] of categories) {
      const score=b=>b.records.filter(r=>r.year===year&&r.rank===1&&r.level==='GI'&&raceFilter(r)).reduce((n,r)=>n+g1Points(r),0);
      const winner=candidates.filter(filter).sort((a,b)=>score(b)-score(a)||b.earnings-a.earnings||a.id.localeCompare(b.id))[0];
      if(winner&&score(winner)>0){const a={year,title,birdId:winner.id,name:winner.name,farm:farmName(winner),points:score(winner)};awards.push(a);s.awards.push(a);}
    }
    const yearBook=s.ledger.filter(l=>date(l.week).year===year),income=yearBook.filter(l=>l.amount>0).reduce((n,l)=>n+l.amount,0),expense=-yearBook.filter(l=>l.amount<0).reduce((n,l)=>n+l.amount,0);
    report(s,'annual',`${year}年の、私たちの牧場`,`${year}年もおつかれさまでした。収入は${income.toLocaleString()}ギル、支出は${expense.toLocaleString()}ギル。${awards.length?awards.map(a=>`${a.title}に${a.farm}の${a.name}（${a.points}点）`).join('、')+'が選ばれました！':'今年の表彰はありませんでした。育てた時間も、来年への大切な財産です。'}また来年も、一緒にがんばりましょう。`,{expression:'happy',income,expense,awards});
    for(const b of s.birds.filter(b=>founderEligible(s,b)))if(!s.founderOffers.includes(b.id)) {
      s.founderOffers.push(b.id);
      report(s,'founder','始祖入りのオファーが届きました',`${b.name}の産駒が3羽以上でGⅠ勝利、合計7勝以上を達成しました。源流を継ぐ始祖に推薦されています。`,{birdId:b.id,expression:'overjoyed'});
    }
  }
  function acknowledge(s, options={}) {
    const r=s.reports[0];if(!r)return;
    if(r.type==='registration')for(const id of r.birdIds){
      if(options.names?.[id]!==undefined&&(!String(options.names[id]).trim()||String(options.names[id]).trim().length>20))throw Error('名前は1〜20文字で入力してください。');
      if(options.policies?.[id]!==undefined&&!['steady','challenge'].includes(options.policies[id]))throw Error('方針を選んでください。');
    }
    if(r.type==='registration')for(const id of r.birdIds){const b=bird(s,id);if(!b)continue;if(options.names?.[id])rename(s,id,options.names[id]);if(options.policies?.[id])setPolicy(s,id,options.policies[id]);b.registered=true;b.role='racing';}
    s.reports.shift();
  }
  function advance(s) {
    if(s.reports.length)throw Error('シロマの報告を確認してから、次の週へ進みましょう。');
    if(['buy','breed'].includes(s.stage))throw Error(s.stage==='buy'?'最初の繁殖牝羽を迎えましょう。':'最初の配合をしてみましょう。');
    const oldWeek=s.week,d=date(s.week),balance=s.money,results=[],notes=[];
    ensureWorld(s);
    for(const e of calendar(s.week).filter(e=>/^G/.test(e.level))) {
      const settled=s.birds.flatMap(b=>b.records.filter(r=>r.week===s.week&&r.name===e.name&&r.rank===1).map(r=>({b,r})))[0];
      if(settled){if(e.level==='GI')notes.push(`GⅠ ${e.name}：${farmName(settled.b)}の${settled.b.name}が優勝。`);continue;}
      let funds=s.money;
      const players=own(s).filter(b=>{const ok=nextRace(s,b)?.id===e.id&&b.condition>=75&&b.strain<25&&!b.health&&funds>=e.fee;if(ok)funds-=e.fee;return ok;});
      const runs=runWorldEvent(s,e,players);
      for(const b of players){const result=race(s,b,e,runs);if(result)results.push({...result,birdId:b.id,birdName:b.name});}
      if(e.level==='GI'){const winner=bird(s,runs[0].id);notes.push(`GⅠ ${e.name}：${farmName(winner)}の${winner.name}が優勝。`);}
    }
    for(const b of own(s)) {
      if(b.role==='racing'&&age(s,b)>=10) {
        if(own(s).filter(x=>x.role===(b.sex==='M'?'stud':'mare')).length<capacity(s)[b.sex==='M'?'stud':'mare'])retire(s,b.id);
        else {b.role='retired';b.retiredYear=d.year;b.hall=b.g1>=3;notes.push(`${b.name}は競走生活を終え、余生に入りました。`);}
      }
      if(['mare','stud'].includes(b.role)&&!['root','founder'].includes(b.kind)&&age(s,b)>=20&&!b.pregnancy){b.role='retired';continue;}
      if(b.role==='young') {
        const keys=b.pasture==='forest'?['drive','crowd','fight']:['control','wisdom','grit'];
        keys.forEach(k=>b.personality[k]=clamp(b.personality[k]+.12+.04*s.facilities[b.pasture],50,150));
        for(const key in b.training)b.training[key]=clamp(b.training[key]+.005,0,1);
      }
      if(b.role==='racing'&&b.registered) {
        const e=nextRace(s,b);
        if(b.lastRace!==s.week&&e?.week===s.week&&b.condition>=75&&b.strain<25&&!b.health) {const result=race(s,b,e);if(result)results.push({...result,birdId:b.id,birdName:b.name});}
        if(b.lastRace!==s.week) {
          const rest=b.condition<85||b.strain>15||b.health>0;
          if(!rest)for(const key in b.training) {
            const bonus=(key==='cardio'?s.facilities.pool*.003:['power','reserve'].includes(key)?s.facilities.hill*.003:0);
            b.training[key]=clamp(b.training[key]+.012+s.facilities.course*.003+bonus,0,1);
          }
          if(!rest){b.personality.control=clamp(b.personality.control+.2,50,150);b.personality.grit=clamp(b.personality.grit+.15,50,150);}
          b.condition=clamp(b.condition+12+8*(b.management.recovery-50)/100+(rest?s.facilities.spa*3:0),0,100);
          b.strain=clamp(b.strain-5-5*(b.management.recovery-50)/100-(rest?s.facilities.spa*2:0),0,100);
          if(b.health)b.health=Math.max(0,b.health-1-s.facilities.clinic);
          else if(!rest&&random(s)<.002){b.health=3;notes.push(`${b.name}は脚を休めています。回復まで出走を見合わせます。`);}
        }
      }
    }
    const cost=12+own(s).reduce((n,b)=>n+(b.role==='racing'?20:b.role==='young'?4:8),0)+Object.values(s.facilities).reduce((n,x)=>n+x,0)*2;
    if(s.money>=cost)pay(s,-cost,'今週の飼料・お世話・施設維持');
    else {s.debt+=cost-s.money;pay(s,-s.money,'今週の維持費（不足分は未払）');notes.push('維持費の不足分は未払金にしました。賞金などの収入から順に精算します。');}
    if(d.monthWeek===4) {
      for(const b of s.birds.filter(b=>b.owner==='player'&&b.g1>0)) {
        if(s.facilities.shop) {
          const elapsed=b.retiredYear===null?0:d.year-b.retiredYear,decay=b.retiredYear===null?1:Math.max(b.hall?.1:0,1-elapsed/5);
          const amount=Math.round(b.fans*.035*s.facilities.shop*decay);if(amount)pay(s,amount,`${b.name}のグッズ収入`);
        }
        if(b.role==='stud'&&random(s)<.25)pay(s,studFee(b),`${b.name}への配合依頼`);
      }
      if(s.debt&&s.money){const repaid=Math.min(s.debt,s.money);pay(s,-repaid,'未払金の精算');s.debt-=repaid;}
      const book=s.ledger.filter(l=>Math.floor((l.week-1)/4)===Math.floor((oldWeek-1)/4)),income=book.filter(l=>l.amount>0).reduce((n,l)=>n+l.amount,0),expense=-book.filter(l=>l.amount<0).reduce((n,l)=>n+l.amount,0);
      report(s,'monthly',`${d.month}月の牧場だより`,`${d.month}月も、おつかれさまでした。今月の収入は${income.toLocaleString()}ギル、支出は${expense.toLocaleString()}ギルです。${own(s).some(b=>b.role==='young')?'子どもたちも、毎日少しずつ成長していますよ。':'来月の調教と出走はモーグリに任せています。'}`,{income,expense,expression:'happy'});
    }
    if(d.week===48){annual(s,d.year);retireWorld(s,d.year);}
    s.week++;
    for(const mother of own(s).filter(b=>b.pregnancy&&b.pregnancy.due<=s.week)) {
      const father=bird(s,mother.pregnancy.sireId),child=createBird(s,{name:`${mother.name}の子${s.birds.filter(b=>b.parents.includes(mother.id)).length+1}`},[father,mother]);
      mother.pregnancy=null;
      if(!child){
        report(s,'event','卵は、かえりませんでした',`${mother.name}の卵は、今回はかえりませんでした。予約していた羽房を空け、お母さんを見守ります。今年の配合は終了しています。`,{expression:'sad'});
        s.stage='running';continue;
      }
      report(s,'birth','小さな羽音が、聞こえます',`${mother.name}の子が生まれました！ ${observe(s,child)}まずは穏やかな平原で、のびのび育てますね。2歳になる年の1月に、競走羽として名前を登録しましょう。`,{birdId:child.id,expression:'overjoyed'});
      if(!s.milestones.birth)s.milestones.birth=s.week;
      s.stage='running';
    }
    if(date(s.week).week===1) {
      refreshMarket(s);
      const ids=own(s).filter(b=>b.role==='young'&&age(s,b)===2).map(b=>b.id);
      if(ids.length)report(s,'registration','いよいよ、競走羽登録です',`今年2歳になる${ids.length}羽を、モーグリに預けましょう。名前と出走方針を決めたら、調教もレース選びも任せられます。`,{birdIds:ids,expression:'happy'});
    }
    if(date(s.week).week===5&&own(s).some(b=>b.role==='mare'))notes.push('2月〜3月の繁殖牝羽セールが始まります。仲間を増やすなら、牧場手帳からどうぞ。');
    const text=results.length?results.map(r=>`${r.birdName}は${r.name}で${r.rank}着。${r.reward.toLocaleString()}ギルを獲得しました。`).join(' '):
      own(s).some(b=>b.pregnancy)?'お母さんは落ち着いて過ごしています。新しい命に会える日を、楽しみに待ちましょう。':
      own(s).some(b=>b.role==='young')?'平原で元気な羽音が聞こえました。食べて、遊んで、よく眠って。今はその積み重ねが大切ですね。':'今週の調教と休養は順調です。次のレースへ、モーグリと準備を進めています。';
    report(s,'weekly',`${d.month}月 第${d.monthWeek}週のご報告`,text,{week:oldWeek,results,notes,change:s.money-balance,expression:results.some(r=>r.rank===1)?'happy':'talk'});
    return {week:oldWeek,results,change:s.money-balance};
  }
  function validState(s) {
    const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
    if(!s||s.version!==VERSION||!Number.isInteger(s.week)||s.week<9||!Number.isInteger(s.serial)||s.serial<1||!Number.isInteger(s.rng)||!finite(s.money,0,1e15)||!finite(s.debt,0,1e15)||!['buy','breed','grow','running'].includes(s.stage)||!['easy','normal','hard'].includes(s.difficulty))return false;
    if(s.geneticsVersion!==undefined&&s.geneticsVersion!==Genetics.VERSION)return false;
    if(s.worldVersion!==undefined&&s.worldVersion!==1)return false;
    if(!Array.isArray(s.birds)||!s.birds.every(b=>b&&((s.geneticsVersion===undefined&&b.genome?.traits===undefined)||
      (Genetics.valid(b.genome?.traits)&&b.color===Genetics.expressColor(b.genome.traits.body,b.genome.traits.gold)&&b.crest===b.genome.traits.crest))))return false;
    if(!s.facilities||!Object.entries(FACILITIES).every(([k,f])=>Number.isInteger(s.facilities[k])&&s.facilities[k]>=(['stalls','meadow'].includes(k)?1:0)&&s.facilities[k]<=f.max))return false;
    if(!['birds','sale','reports','journal','ledger','awards','founderOffers'].every(k=>Array.isArray(s[k]))||!s.milestones||!Number.isInteger(s.marketYear)||!Number.isInteger(s.lastAnnual))return false;
    if(s.birds.length>50000||new Set(s.birds.map(b=>b.id)).size!==s.birds.length)return false;
    const scores=(x,keys)=>x&&keys.every(k=>finite(x[k],50,150));
    const record=r=>r&&typeof r.name==='string'&&Number.isInteger(r.week)&&Number.isInteger(r.year)&&finite(r.rank,1,12)&&finite(r.time,0,900)&&finite(r.reward,0,1e15)&&finite(r.distance,100,10000)&&['turf','dirt'].includes(r.surface)&&typeof r.level==='string'&&Array.isArray(r.field)&&r.field.every(x=>x&&typeof x.name==='string'&&typeof x.id==='string'&&finite(x.time,0,900));
    if(!s.birds.every(b=>b&&/^bird-\d+$/.test(b.id)&&typeof b.name==='string'&&b.name.length<=40&&(b.farm===undefined||typeof b.farm==='string'&&b.farm.length<=40)&&(b.season===undefined||Number.isInteger(b.season))&&(b.worldGroup===undefined||typeof b.worldGroup==='string')&&['M','F'].includes(b.sex)&&['player','sale','public','source','archive','npc'].includes(b.owner)&&['young','racing','mare','stud','retired','archived'].includes(b.role)&&['root','founder','home','general'].includes(b.kind)&&Number.isInteger(b.birthYear)&&Number.isInteger(b.bornWeek)&&Array.isArray(b.parents)&&b.parents.every(id=>s.birds.some(p=>p.id===id))&&
      scores(b.potential,Mapping.ABILITIES.map(a=>a.key))&&scores(b.personality,Object.keys(PERSONALITY))&&scores(b.inborn,Object.keys(PERSONALITY))&&scores(b.management,Object.keys(MANAGEMENT))&&b.training&&Mapping.ABILITIES.every(a=>finite(b.training[a.key],0,1))&&finite(b.condition,0,100)&&finite(b.strain,0,100)&&finite(b.health,0,100)&&['steady','challenge'].includes(b.policy)&&['meadow','forest'].includes(b.pasture)&&['early','normal','late'].includes(b.growth)&&Object.hasOwn(Genetics.COLORS,b.color)&&typeof b.registered==='boolean'&&['races','wins','g1','graded','earnings','fans','bredYear'].every(k=>finite(b[k],0,1e15))&&Number.isInteger(b.lastRace)&&Array.isArray(b.records)&&b.records.every(record)&&Array.isArray(b.titles)&&b.titles.every(t=>typeof t==='string')&&
      b.genome&&['distance','release'].every(k=>Array.isArray(b.genome[k])&&b.genome[k].length===2&&b.genome[k].every(x=>finite(x,-1,1)))&&[...Mapping.ABILITIES.map(a=>a.key),...Object.keys(MANAGEMENT)].every(k=>Array.isArray(b.genome.quality?.[k])&&b.genome.quality[k].length===32&&b.genome.quality[k].every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>x===0||x===1)))&&
      (b.pregnancy===null||(b.sex==='F'&&b.role==='mare'&&Number.isInteger(b.pregnancy.due)&&b.pregnancy.due>s.week&&s.birds.some(p=>p.id===b.pregnancy.sireId&&p.sex==='M')))))return false;
    const validReport=r=>r&&/^report-\d+$/.test(r.id)&&Number.isInteger(r.week)&&typeof r.title==='string'&&typeof r.text==='string'&&['talk','neutral','happy','overjoyed','sad','motivated','disappointed','ambiguous-smile'].includes(r.expression)&&['weekly','monthly','annual','birth','event','registration','founder'].includes(r.type)&&
      (!['birth','founder'].includes(r.type)||!!bird(s,r.birdId))&&(r.type!=='registration'||Array.isArray(r.birdIds)&&r.birdIds.every(id=>bird(s,id)))&&
      (r.results===undefined||Array.isArray(r.results)&&r.results.every(x=>record(x)&&bird(s,x.birdId)&&typeof x.birdName==='string'))&&(r.notes===undefined||Array.isArray(r.notes)&&r.notes.every(x=>typeof x==='string'))&&['income','expense','change'].every(k=>r[k]===undefined||Number.isFinite(r[k]));
    if(!s.reports.every(validReport)||!s.journal.every(validReport))return false;
    return s.ledger.every(l=>l&&Number.isInteger(l.week)&&Number.isFinite(l.amount)&&typeof l.note==='string')&&s.awards.every(a=>a&&Number.isInteger(a.year)&&typeof a.title==='string'&&typeof a.name==='string'&&bird(s,a.birdId))&&s.sale.every(id=>bird(s,id))&&s.founderOffers.every(id=>bird(s,id))&&racingCount(s)<=capacity(s).racing&&['mare','stud'].every(role=>own(s).filter(b=>b.role===role).length<=capacity(s)[role]);
  }
  return {calendar,g1Points,pedigreeBonus,rating,profile,farmName,MAJOR_FARMS,searchSires,marePrice,VERSION,SAVE_KEY,YEAR,GESTATION,PERSONALITY,MANAGEMENT,FACILITIES,ROOTS,TITLES,EIGHT,Mapping,Genetics,Ground,date,when,initial,refreshRoots,upgradeState,own,bird,age,capacity,racingCount,labLevel,quality,saleOpen,sires,studFee,breedFee,buy,breedingReason,breed,observe,currentAbilities,facilityCost,facilityReason,build,setPasture,setPolicy,rename,retire,classFor,nextRace,eligible,simulateBird,simulateField,race,founderEligible,promote,acknowledge,advance,validState};
});
