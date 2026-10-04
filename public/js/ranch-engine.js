/* The new ranch lifecycle. Balance-lab abilities and physics are the source of truth. */
(function (root, factory) {
  const api = typeof module === 'object' && module.exports
    ? factory(require('./world.js'), require('./trait-mapping.js'), require('./race-physics.js'), require('./ranch-genetics.js'), require('./ranch-ground.js'), require('./ranch-race.js'), require('./ranch-breeding.js'), require('./race-replay.js'), require('./ranch-names.js'))
    : factory(root.RanchWorld, root.TraitMapping, root.RacePhysics, root.RanchGenetics, root.RanchGround, root.RanchRace, root.RanchBreeding, root.RaceReplay, root.RanchNames);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Ranch = api;
})(globalThis, function (Calendar, Mapping, Physics, Genetics, Ground, Race, Breeding, Replay, Names) {
  'use strict';
  const VERSION = 4, SAVE_KEY = 'hanekaze-ranch-v4', YEAR = 48, GESTATION = 4;
  const BREEDING_FRUITS = Object.freeze({
    none:Object.freeze({name:'実を使わない',sex:null,cost:0}),
    karabu:Object.freeze({name:'カラブの実',sex:'M',cost:1000}),
    zeio:Object.freeze({name:'ゼイオの実',sex:'F',cost:1000}),
  });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const validBirdName=name=>typeof name==='string'&&/^[ァ-ヺー]{2,9}$/.test(name);
  const NAME_ERROR='名前は2〜9文字のカタカナで入力してください（長音「ー」も使えます）。';
  const DEFAULT_NAMING=Object.freeze({ranchName:'羽風牧場',affix:'ハネカゼ',position:'prefix'});
  function namingSettings(value={}) {
    const settings={...DEFAULT_NAMING,...value};
    settings.ranchName=String(settings.ranchName).trim();settings.affix=String(settings.affix).trim();
    if(!settings.ranchName||settings.ranchName.length>24||/[\x00-\x1f\x7f]/.test(settings.ranchName))throw Error('牧場名は1〜24文字で入力してください。');
    if(!/^[ァ-ヺー]{1,7}$/.test(settings.affix))throw Error('冠名は1〜7文字のカタカナで入力してください。');
    if(!['prefix','suffix'].includes(settings.position))throw Error('冠名をつける位置を選んでください。');
    return settings;
  }
  function unavailableNames(s,excludeIds=[]) {
    const excluded=new Set(excludeIds),ancestors=new Set(s.birds.flatMap(b=>b.parents||[])),year=date(s.week).year;
    return new Set([...ROOTS.map(b=>b.name),...s.birds.filter(b=>!excluded.has(b.id)&&(
      ['young','racing','stud'].includes(b.role)||b.kind==='root'||b.kind==='founder'||b.hall||
      b.sex==='M'&&ancestors.has(b.id)||(b.records||[]).some(r=>r.level==='GI'&&r.rank===1&&r.finished!==false&&(r.year??date(r.week).year)>=year-19)
    )).map(b=>b.name)]);
  }
  function generatedName(s,prefix,preferred='',sex='M',position,excludeId) {
    const settings=s.naming||DEFAULT_NAMING,affix=prefix??settings.affix,placement=position??(prefix===undefined?settings.position:'prefix');
    if(!/^[ァ-ヺー]{1,7}$/.test(affix))throw Error('冠名は1〜7文字のカタカナで入力してください。');
    // Reserve all pending candidates too; registration and generation share the protected-name rules.
    const used=unavailableNames(s,excludeId?[excludeId]:[]),pool=Names[sex==='F'?'F':'M'],start=(s.serial||0)%pool.length;
    const combine=word=>placement==='suffix'?word+affix:affix+word;
    for(const word of [preferred,...pool.slice(start),...pool.slice(0,start)]){
      if(!word)continue;
      const name=combine(word);if(validBirdName(name)&&!used.has(name))return name;
    }
    // Only exhausted stock reaches this fallback. Preserve the affix and genetic RNG.
    const alphabet='アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワ',limit=9-affix.length;
    for(let n=0;n<alphabet.length**limit;n++){
      let value=n,code='';do{code=alphabet[value%alphabet.length]+code;value=Math.floor(value/alphabet.length);}while(value);
      const name=combine(code);if(validBirdName(name)&&!used.has(name))return name;
    }
    throw Error('登録できる名前が見つかりません。');
  }
  const date = week => ({...Calendar.date(((week-1)%YEAR+YEAR)%YEAR+1),year:Math.floor((week-1)/YEAR)+1});
  const when = week => { const d = date(week); return `${d.year>0?d.year+'年':'開業'+(1-d.year)+'年前'} ${d.month}月 第${d.monthWeek}週`; };
  const PERSONALITY = {grit:'根性', drive:'走る意欲', wisdom:'賢さ', control:'自制心', crowd:'羽混み耐性', fight:'闘争心'};
  const MANAGEMENT = {robustness:'丈夫さ', recovery:'回復力'};
  const TRAINING = {speed:.15, cardio:.45, power:.35, reserve:.30, legs:.45, economy:.40, start:.50, resilience:.35};
  const FACILITIES = {
    stalls:{name:'羽房',cost:25000,costs:[0,25000,35000,12000000,50000000,50000000,50000000,50000000,50000000],max:9,artMax:4,description:'Lv.4まで羽房が増え、幼羽・競走羽32羽、繁殖牝羽・種牡羽各16羽まで迎えられます。Lv.5以降は環境を整え、良いチョコボが少し生まれやすくなります。'},
    course:{name:'コース',cost:18000000,max:3,description:'調教の効果が上がります。'},
    hill:{name:'坂路',cost:22000000,max:3,description:'瞬発力とスパート容量を鍛えます。'},
    pool:{name:'プール',cost:20000000,max:3,description:'脚への負担を抑えながら心肺を育てます。'},
    spa:{name:'温泉',cost:15000000,max:3,description:'休養中の体力と脚の回復を早めます。'},
    clinic:{name:'診療所',cost:16000000,max:3,description:'病気や怪我からの回復を早めます。'},
    meadow:{name:'穏やかな平原',cost:8000000,max:3,description:'自制心と賢さが育つ放牧地。'},
    forest:{name:'過酷な森',cost:8000000,max:3,description:'走る意欲と刺激への慣れが育つ放牧地。'},
    shop:{name:'グッズ販売所',cost:25000000,max:3,description:'GⅠ勝者のファンから毎月グッズ収入が入ります。'},
    lab:{name:'研究所',cost:25000,max:1,description:'適性・成長・羽色の遺伝と、詳しい競走情報がわかります。GⅠ制覇で全遺伝の座位も公開。産み分けの実も使えます。',lock:'レース初勝利'},
    statue:{name:'銅像',cost:50000000,max:1,description:'三冠の記念像。研究所とあわせて遺伝の数値がわかります。記念館もそろうと能力も数値で見られます。',lock:'三冠制覇'},
    museum:{name:'記念館',cost:100000000,max:1,description:'8大競走制覇の記念館。研究所とあわせて遺伝の数値がわかります。銅像もそろうと能力も数値で見られます。',lock:'8大競走制覇'},
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
  const ROOT_CATALOG_VERSION = 4;
  const TRAIT_LABELS = {...Object.fromEntries(Mapping.ABILITIES.map(a=>[a.key,a.label])),...MANAGEMENT,...PERSONALITY};
  // Two primary and two supporting donors per trait. Stable order is the lineage ID.
  // See docs/ROOT_STALLIONS.md for naming sources, tradeoffs and the coverage matrix.
  const ROOTS = Object.freeze([
    ['チョコエクレア','speed','start'],
    ['カフェガナッシュ','power','speed'],
    ['メープルブレッド','cardio','legs'],
    ['ヘーゼルビスコット','legs','robustness'],
    ['キャラメルタルト','reserve','power'],
    ['ピスタチオサブレ','economy','cardio'],
    ['ジンジャースナップ','start','resilience'],
    ['カカオニブ','resilience','recovery'],
    ['ウォールナット','robustness','economy'],
    ['ハニーヨーグルト','recovery','control'],
    ['ビターブラウニー','grit','drive'],
    ['シナモンチャイ','drive','fight'],
    ['アールグレイ','wisdom','crowd'],
    ['バニラカスタード','control','wisdom'],
    ['ブランマンジェ','crowd','grit'],
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
    ['ハーブフォカッチャ','wisdom','power'],
    ['カモミールシフォン','control','fight'],
    ['ホワイトスフレ','crowd','wisdom'],
    ['ペッパークラッカー','fight','drive'],
  ].map(([name,primary,secondary],index)=>{
    const style = index<16?index%4:(index%4)^3;
    const [distance,release] = [[-.85,-.65],[-.85,.7],[.85,-.7],[.85,.7]][style];
    const tendency = ['短距離・持続型','短距離・末脚型','長距離・持続型','長距離・末脚型'][style];
    const inherited=Genetics.source(index),strengths=Genetics.strengths(inherited),labels={...Genetics.APTITUDES,...Genetics.DEVELOPMENT};
    return Object.freeze({lineage:`root-${index}`,name,primary,secondary,distance,release,tendency,
      strengths:Object.freeze(strengths),comment:`${TRAIT_LABELS[primary]}と${TRAIT_LABELS[secondary]}をつなぐ、${tendency}の血統。${strengths.map(key=>labels[key]).join('・')}。${Object.keys(Genetics.COURSE_APTITUDES).filter(key=>Genetics.mean(inherited.aptitude[key])<.5).map(key=>`${labels[key].replace('適性','')}は苦手。`).join('')}`});
  }));
  const DEFECTS=Object.freeze(Breeding.catalog(ROOTS));
  const DEFECT_LABELS={...TRAIT_LABELS,frailty:'虚弱体質',temper:'気性難'};
  const own = s => s.birds.filter(b => b.owner === 'player' && !['retired','archived'].includes(b.role));
  // An index lives only for one synchronous operation. External edits between
  // operations never need dirty flags; appended birds and annual array replacement
  // are picked up before a lookup within that operation.
  const birdLookups=new WeakMap();
  function withBirdLookup(s,work) {
    if(birdLookups.has(s))return work();
    const context={birds:null,length:0,byId:new Map()};birdLookups.set(s,context);
    try{return work();}finally{birdLookups.delete(s);}
  }
  function bird(s,id) {
    const context=birdLookups.get(s);
    if(!context)return s.birds.find(b=>b.id===id);
    if(context.birds!==s.birds||context.length>s.birds.length){context.birds=s.birds;context.length=0;context.byId.clear();}
    for(;context.length<s.birds.length;context.length++){
      const b=s.birds[context.length];if(!context.byId.has(b.id))context.byId.set(b.id,b);
    }
    return context.byId.get(id);
  }
  function paternalRoot(s,b,lookup=id=>bird(s,id)) {
    const seen=new Set();let source=null;
    // Follow the full male line, independently of the five-generation pedigree view.
    // Imported stock retains its source affiliation at the unknown-parent boundary.
    while(b&&!seen.has(b.id)) {
      seen.add(b.id);
      source=ROOTS.find(p=>p.lineage===b.lineage)||source;
      const father=lookup(b.parents?.[0]);
      if(b.kind==='root'||!father)return source;
      b=father;
    }
    return null;
  }
  function lineageFounder(s,b) {
    const source=paternalRoot(s,b);
    return source?s.birds.find(x=>x.kind==='founder'&&x.role==='stud'&&paternalRoot(s,x)?.lineage===source.lineage):undefined;
  }
  const age = (s, b) => b.kind === 'root' || b.kind === 'founder' ? null : date(s.week).year - b.birthYear;
  const random = s => { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; };
  const pick = (s, items) => items[Math.floor(random(s) * items.length)];
  const capacity = s => ({racing:8 * Math.min(4,s.facilities.stalls), mare:4 * Math.min(4,s.facilities.stalls), stud:4 * Math.min(4,s.facilities.stalls)});
  const favorableInheritanceRate = s => .5 + .05 * clamp((s.facilities?.stalls??1)-4,0,5);
  const racingCount = s => own(s).filter(b => ['young','racing'].includes(b.role)).length + own(s).filter(b => b.pregnancy).length;
  // Legacy lab upgrades remain saved, but disclosure now depends on the monuments.
  const labLevel = s => s.facilities.lab ? 1 + Number(s.facilities.statue > 0) + Number(s.facilities.museum > 0) : 0;
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
  function milestone(s, key, title, text, extra = {}) {
    if (s.milestones[key]) return;
    s.milestones[key] = s.week;
    report(s, 'event', title, text, {expression:'overjoyed', ...extra});
  }
  function firstWinKeys(r) {
    const keys=['win'];
    if(['GI','GII','GIII'].includes(r.level))keys.push('graded');
    if(r.level==='GIII')keys.push('g3');
    if(r.level==='GII')keys.push('g2');
    if(r.level==='GI'){
      keys.push('g1',`g1:${r.name}`);
      if(r.name==='チョコボダービー')keys.push('derby');
    }
    return keys;
  }
  function recordFirstWin(s,r,birdId,birdName) {
    if(r.rank!==1||r.finished===false)return;
    for(const key of firstWinKeys(r))if(!Object.hasOwn(s.firstWins,key))
      s.firstWins[key]={week:r.week,birdId,birdName,raceName:r.name};
  }
  function restoreFirstWins(s) {
    if(s.firstWins!==undefined)return;
    s.firstWins={};
    // Reports contain only our runners; replay ownership also survives a sale.
    const results=[...s.journal,...s.reports].flatMap(report=>report.results||[]);
    for(const b of s.birds)for(const r of b.records){
      const runner=r.replay?.runners.find(x=>x.id===b.id);
      if(runner?runner.player:!b.farm&&['player','archive'].includes(b.owner))
        results.push({...r,birdId:b.id,birdName:runner?.name||r.field.find(x=>x.id===b.id)?.name||b.name});
    }
    results.filter(r=>r.week>=9).sort((a,b)=>a.week-b.week)
      .forEach(r=>recordFirstWin(s,r,r.birdId,r.birdName));
  }
  function genome(s, parents, distance, release, frequency=.25, favorableRate=.5) {
    const genes = {};
    for (const key of [...Mapping.ABILITIES.map(a => a.key), ...Object.keys(MANAGEMENT)]) {
      genes[key] = Array.from({length:32}, (_, i) => parents
        ? parents.map(p=>Genetics.inheritAllele(p.genome.quality[key][i],()=>random(s),favorableRate))
        : [Number(random(s) < frequency), Number(random(s) < frequency)]);
    }
    return {quality:genes,
      distance:parents ? [pick(s, parents[0].genome.distance), pick(s, parents[1].genome.distance)] : [distance, distance],
      release:parents ? [pick(s, parents[0].genome.release), pick(s, parents[1].genome.release)] : [release, release]};
  }
  const quality = g => Object.fromEntries(Object.entries(g.quality).map(([k, pairs]) => [k, 50 + 1.25 * pairs.flat().reduce((n, x) => n + x, 0)]));
  const mean = a => a.reduce((n, x) => n + x, 0) / a.length;
  const crossStrengths=b=>{
    const source=b.kind==='root'&&ROOTS.find(p=>p.lineage===b.lineage);
    return source?[source.primary,source.secondary]:Object.entries({...quality(b.genome),...Object.fromEntries(Object.entries(b.genome.character||{}).map(([k,p])=>[k,mean(p)]))}).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k])=>k);
  };
  const pedigree=(s,b)=>Breeding.pedigree(b.parents,id=>bird(s,id));
  const breedingCrosses=(s,sire,dam)=>Breeding.crosses([sire,dam],id=>bird(s,id));
  const crossRisk=(s,sire,dam)=>breedingCrosses(s,sire,dam).find(c=>c.blood>Breeding.MAX_CROSS_BLOOD)||null;
  function crossReason(s,sire,dam) {
    const risk=crossRisk(s,sire,dam);
    return risk?`${risk.name}の${risk.positions.join('×')}クロス（血量${+(risk.blood*100).toFixed(3)}%）は危険なため、配合できません。クロスは2×3（37.5%）までです。`:'';
  }
  const crossPlan=(s,sire,dam)=>Breeding.mutationPlan(breedingCrosses(s,sire,dam),id=>bird(s,id),crossStrengths);
  function constitution(b) {
    const frailty=Breeding.defectSummary(b.genome,DEFECTS).filter(d=>d.trait==='frailty').reduce((n,d)=>n+d.active,0);
    return {illnessChance:Math.min(.02,.002+frailty*.0005),recoveryWeeks:3+Math.min(4,Math.ceil(frailty/4))};
  }
  function createBird(s, options = {}, parents = null) {
    const favorableRate=parents&&(options.owner??'player')==='player'&&(options.kind??'home')==='home'?favorableInheritanceRate(s):.5;
    const g = options.genome ?? genome(s, parents, options.distance ?? 0, options.release ?? 0, options.alleleFrequency ?? .25,favorableRate);
    g.traits ??= Genetics.generate(()=>random(s),parents?.map(p=>p.genome.traits),favorableRate);
    const color=Genetics.expressColor(g.traits.body,g.traits.gold);
    if(color===null)return null;
    g.defects??=parents?Breeding.inheritDefects(parents,()=>random(s)):{};
    g.character??=Object.fromEntries(Object.keys(PERSONALITY).map(k=>[k,parents?parents.map(p=>pick(s,p.genome.character?.[k]||[p.inborn[k],p.inborn[k]])):
      Array(2).fill(options.inborn?.[k]??(65+random(s)*30))]));
    if(parents)Breeding.mutate(g,crossPlan(s,...parents),()=>random(s));
    const q=quality(g),penalty=Breeding.penalties(g,DEFECTS);
    const reduce=scores=>Object.fromEntries(Object.entries(scores).map(([key,value])=>[key,clamp(value-(penalty[key]||0),50,150)]));
    const potential = reduce(Mapping.generate({quality:q,distance:mean(g.distance),release:mean(g.release),random:() => random(s),birthBounds:parents?pedigreeBonus(s,parents[0],parents[1]):null}));
    const temperament = reduce(options.inborn??Object.fromEntries(Object.keys(PERSONALITY).map(k=>[k,clamp(mean(g.character[k])+(parents?(random(s)-.5)*14:0),50,150)])));
    const rolledSex=random(s)<.5?'F':'M',sex=options.sex||rolledSex;
    const name=validBirdName(options.name)?options.name:generatedName(s,options.farm?MAJOR_FARMS.find(f=>f.name===options.farm)?.prefix:undefined,'',sex);
    const b = {id:`bird-${s.serial++}`,name,sex,owner:'player',role:'young',kind:'home',
      birthYear:date(s.week).year,bornWeek:s.week,parents:parents ? parents.map(p => p.id) : [],genome:g,potential,
      inborn:temperament,personality:{...temperament},management:reduce({robustness:q.robustness,recovery:q.recovery}),
      training:Object.fromEntries(Mapping.ABILITIES.map(a => [a.key, .1])),
      condition:100,strain:0,health:0,pasture:'meadow',policy:'steady',registered:false,pregnancy:null,bredYear:0,
      races:0,wins:0,g1:0,graded:0,earnings:0,fans:0,records:[],titles:[],lastRace:-100,retiredYear:null,hall:false,
      ...options,name,inborn:temperament,color,crest:g.traits.crest,growth:Genetics.growthLabel(g.traits)};
    if (parents) {
      const source=paternalRoot(s,parents[0]);
      if(source)b.lineage=source.lineage;
    }
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
        genome:{quality:genes,distance:[profile.distance,profile.distance],release:[profile.release,profile.release],traits:Genetics.source(index),defects:Breeding.sourceDefects(profile.lineage,DEFECTS)},
        inborn,comment:`${profile.comment} 潜性の欠点：${DEFECT_LABELS[DEFECTS[`${profile.lineage}-weak`].trait]}。`,fee:600});
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
  const farmName=(b,s)=>b?.filler||b?.temporary?'一般参加':b?.owner==='player'?(s?.naming?.ranchName||DEFAULT_NAMING.ranchName):b?.farm||'他の牧場';
  const rating=value=>value<60?'X':value<80?'△':value<100?'◯':value<120?'◎':'☆';
  const geneticRating=value=>value<65?'X':value<80?'△':value<95?'◯':value<110?'◎':'☆';
  const geneticEffectRating=value=>value<-10?'X':value<-2?'△':value<=2?'◯':value<=10?'◎':'☆';
  function geneticBreakdown(b) {
    const g=b.genome,q=quality(g),penalties=Breeding.penalties(g,DEFECTS);
    const base={...q,...Object.fromEntries(Object.entries(g.character).map(([key,pair])=>[key,mean(pair)]))};
    const effects=Object.fromEntries(Object.keys(base).map(key=>[key,-(penalties[key]||0)]));
    for(const ability of Mapping.ABILITIES)
      effects[ability.key]+=ability.distance*mean(g.distance)+ability.release*mean(g.release);
    // Include every expressed negative effect, including frailty and temperament.
    const total=Object.fromEntries(Object.entries(base).map(([key,value])=>[key,value+effects[key]]));
    return {base,effects,total};
  }
  const geneticScores=b=>geneticBreakdown(b).total;
  function breedingPreview(s,sire,dam) {
    if(!sire||!dam)return {};
    const parents=[sire,dam],plan=crossPlan(s,sire,dam);
    const mutation=(group,key,locus)=>plan.find(p=>p.group===group&&p.key===key&&p.locus===locus);
    const inherited=(pairs,p)=>{
      let low=pairs.map(pair=>Math.min(...pair)),high=pairs.map(pair=>Math.max(...pair));
      if(p?.rate>0){high=high.map(v=>Math.max(v,p.value));if(p.rate===1)low=low.map(v=>Math.max(v,p.value));}
      return [mean(low),mean(high)];
    };
    const ranges={};
    for(const key of [...Mapping.ABILITIES.map(a=>a.key),...Object.keys(MANAGEMENT)]){
      const loci=Array.from({length:32},(_,i)=>inherited(parents.map(p=>p.genome.quality[key][i]),mutation('quality',key,i)));
      ranges[key]={min:50+2.5*loci.reduce((n,p)=>n+p[0],0),max:50+2.5*loci.reduce((n,p)=>n+p[1],0)};
    }
    for(const key of Object.keys(PERSONALITY)){
      const [min,max]=inherited(parents.map(p=>p.genome.character[key]),mutation('character',key,0));
      ranges[key]={min,max};
    }
    for(const [group,labels] of [['aptitude',Genetics.APTITUDES],['development',Genetics.DEVELOPMENT]])for(const key of Object.keys(labels)){
      const [min,max]=inherited(parents.map(p=>p.genome.traits[group][key]),mutation(group,key,0));
      ranges[key]={min:50+100*min,max:50+100*max};
    }
    const distance=inherited(parents.map(p=>p.genome.distance)),release=inherited(parents.map(p=>p.genome.release));
    for(const a of Mapping.ABILITIES)for(const [weight,range] of [[a.distance,distance],[a.release,release]]){
      ranges[a.key].min+=Math.min(...range.map(v=>v*weight));
      ranges[a.key].max+=Math.max(...range.map(v=>v*weight));
    }
    for(const id of new Set([...parents.flatMap(p=>Object.keys(p.genome.defects)),...plan.filter(p=>p.group==='defects').map(p=>p.key)])){
      let minimum=0,maximum=0;
      for(let i=0;i<Breeding.DEFECT_LOCI;i++){
        const [low,high]=inherited(parents.map(p=>p.genome.defects[id]?.[i]||[0,0]),mutation('defects',id,i));
        minimum+=Number(low===1)*Breeding.DEFECT_STEP;maximum+=Number(high===1)*Breeding.DEFECT_STEP;
      }
      const trait=DEFECTS[id].trait,effects=Breeding.SPECIAL[trait]||{[trait]:1};
      for(const [key,weight] of Object.entries(effects)){ranges[key].min-=maximum*weight;ranges[key].max-=minimum*weight;}
    }
    return ranges;
  }
  function geneticLottery(b,ranges) {
    const values={...geneticScores(b)};
    for(const group of ['aptitude','development'])for(const [key,pair] of Object.entries(b.genome.traits[group]))values[key]=50+100*mean(pair);
    return Object.fromEntries(Object.entries(ranges).map(([key,range])=>[key,{...range,value:values[key]}]));
  }
  function breedingExpectation(s,sire,dam) {
    if(!sire||!dam)return {};
    const parents=[sire,dam],plan=crossPlan(s,sire,dam),rate=favorableInheritanceRate(s);
    const mutation=(group,key,locus)=>plan.find(p=>p.group===group&&p.key===key&&p.locus===locus)?.rate||0;
    const favorable=pair=>pair[0]===pair[1]?pair[0]:rate;
    const penalties={};
    for(const id of new Set([...parents.flatMap(p=>Object.keys(p.genome.defects)),...plan.filter(p=>p.group==='defects').map(p=>p.key)])){
      let penalty=0;
      for(let i=0;i<Breeding.DEFECT_LOCI;i++){
        const active=parents.map(p=>mean(p.genome.defects[id]?.[i]||[0,0])).reduce((n,p)=>n*p,1);
        const chance=mutation('defects',id,i);
        penalty+=(active*(1-chance)+chance)*Breeding.DEFECT_STEP;
      }
      const trait=DEFECTS[id].trait,effects=Breeding.SPECIAL[trait]||{[trait]:1};
      for(const [key,weight] of Object.entries(effects))penalties[key]=(penalties[key]||0)+penalty*weight;
    }
    const distance=mean(parents.map(p=>mean(p.genome.distance))),release=mean(parents.map(p=>mean(p.genome.release)));
    const bonus=pedigreeBonus(s,sire,dam);
    return Object.fromEntries(Mapping.ABILITIES.map(a=>{
      const inherited=Array.from({length:32},(_,i)=>{
        const alleles=parents.reduce((n,p)=>n+favorable(p.genome.quality[a.key][i]),0),chance=mutation('quality',a.key,i);
        return alleles*(1-chance)+2*chance;
      }).reduce((n,value)=>n+value,0);
      const center=clamp(50+1.25*inherited+a.distance*distance+a.release*release,50,150);
      // Estimate the birth lottery at its expected inherited centre. Boundary
      // rejection and individual segregation can shift the actual offspring mean.
      const value=clamp(center+(bonus[a.key].lower+bonus[a.key].upper)/2,50,150)-(penalties[a.key]||0);
      return [a.key,clamp(value,50,150)];
    }));
  }
  function profile(b) {
    const values={...b.potential,...b.management,...b.inborn};
    const sorted=Object.entries(values).sort((a,b)=>b[1]-a[1]);
    const describe=items=>items.map(([key,value])=>`${TRAIT_LABELS[key]} ${rating(value)}`).join('・');
    return {distance:mean(b.genome.distance)>.3?'長距離寄り':mean(b.genome.distance)<-.3?'短距離寄り':'距離は中間',
      style:mean(b.genome.release)>.3?'差し寄り':mean(b.genome.release)<-.3?'先行寄り':'脚質は中間',
      strengths:describe(sorted.slice(0,2)),weaknesses:describe(sorted.slice(-2).reverse())};
  }
  function geneticTraitRating(b,trait) {
    if(Object.hasOwn(TRAIT_LABELS,trait))return geneticRating(geneticScores(b)[trait]);
    const group=Object.hasOwn(Genetics.APTITUDES,trait)?'aptitude':Object.hasOwn(Genetics.DEVELOPMENT,trait)?'development':null;
    if(!group)return undefined;
    const score=50+100*mean(b.genome.traits[group][trait]);
    return (Object.hasOwn(Genetics.COURSE_APTITUDES,trait)?Genetics.courseRating:geneticRating)(score);
  }
  function searchSires(s,{query='',route='',sort='fee',geneticFilters=[],dam=null}={}) {
    const routeMatch=b=>!route||b.records.some(r=>r.level==='GI'&&r.rank===1&&(route==='dirt'?r.surface==='dirt':r.surface==='turf'&&(route==='sprint'?r.distance<=1400:route==='mile'?r.distance>1400&&r.distance<=1800:route==='long'?r.distance>=2800:r.distance>1800&&r.distance<2800)));
    const text=query.trim().toLocaleLowerCase();
    const score=b=>b.potential[sort]??b.management[sort]??b.inborn[sort]??(Genetics.APTITUDES[sort]?50+100*mean(b.genome.traits.aptitude[sort]):0);
    const filters=geneticFilters.filter(f=>f.trait);
    const geneticMatch=b=>filters.every(f=>['X','△','◯','◎','☆'].includes(f.rating)&&geneticTraitRating(b,f.trait)===f.rating);
    const candidates=sires(s).filter(b=>routeMatch(b)&&geneticMatch(b)&&`${b.name} ${farmName(b,s)} ${b.records.filter(r=>r.rank===1).map(r=>r.name).join(' ')}`.toLocaleLowerCase().includes(text));
    if(sort==='offspring'){
      if(!dam)return candidates.sort((a,b)=>breedFee(a)-breedFee(b));
      const scores=new Map(candidates.map(b=>[b.id,mean(Object.values(breedingExpectation(s,b,dam)))]));
      return candidates.sort((a,b)=>scores.get(b.id)-scores.get(a.id)||breedFee(a)-breedFee(b));
    }
    return candidates.sort((a,b)=>sort==='fee'?breedFee(a)-breedFee(b):sort==='g1'?b.g1-a.g1:score(b)-score(a));
  }
  const g1Points=e=>e.surface==='dirt'?60:e.distance<=1400?70:e.minAge===2||/オニオン|光の戦士/.test(e.name)?80:e.sex||e.sexRestricted?100:e.distance>=2800?140:/ダービー|ワールドカップ|バハムート/.test(e.name)?180:120;
  // JRA 2026 counterparts, with a 100-million floor for the game's juvenile G1s.
  const G1_PRIZES={
    'タイタンステークス':150000000,'カーバンクル記念':170000000,'リヴァイアサン記念':300000000,
    'クリスタル賞':140000000,'神竜賞':200000000,'オーディーン賞（春）':300000000,
    'CRAマイルカップ':130000000,'セイレーンカップ':130000000,'チョコボオークス':150000000,
    'チョコボダービー':300000000,'イフリート記念':180000000,'フェニックス記念':300000000,
    'ラムウステークス':170000000,'ミスリル賞':110000000,'オメガ賞':200000000,
    'オーディーン賞（秋）':300000000,'シヴァ女王杯':130000000,'アレクサンダーカップ':180000000,
    'CRAワールドカップ':500000000,'ナイツ・オブ・ラウンド記念':120000000,'バハムート記念':500000000,
    'オニオンガールステークス':100000000,'オニオンボーイステークス':100000000,'光の戦士ステークス':100000000,
  };
  const raceLoad=e=>(e.distance<=1400?.8:e.distance<=1800?1:e.distance<=2400?1.15:e.distance<2800?1.25:1.4)*(e.surface==='dirt'?.8:1);
  function economyEvent(e) {
    const load=raceLoad(e),prize=e.level==='GI'?(G1_PRIZES[e.name]||100000000):Math.round(
      {new:30000,maiden:25000,c1:45000,c2:55000,c3:65000,open:300000,GIII:5000000,GII:30000000}[e.level]*load);
    const fee=Math.round({new:400,maiden:400,c1:600,c2:800,c3:1000,open:1500,GIII:5000,GII:10000,GI:20000}[e.level]*load);
    return {...e,fee,allowance:Math.round(prize*.03),
      purse:[1,.4,.25,.15,.1,0].map(f=>Math.round(prize*f))};
  }
  function calendar(week) {
    const events=Calendar.calendar(week),month=date(week).month;
    // Each class has a suitable route every week. Preserve the original event IDs.
    return events.flatMap(e=>{
      if(/^G/.test(e.level))return [e];
      const variants=[e];
      for(const surface of ['turf','dirt']){
        const tracks=Object.values(Calendar.TRACKS).filter(t=>t.surface===surface),track=tracks[(month-1)%tracks.length];
        for(const distance of surface==='turf'?[1400,1800,2200,2400,3000]:[1400,1800,2200,2400]){
          if(e.surface===surface&&e.distance===distance)continue;
          const label=distance<=1600?'短距離':distance<=1800?'マイル':distance<2800?'中距離':'長距離';
          variants.push({...e,id:`${e.id}:${surface}:${distance}`,name:`${Calendar.CLASSES[e.level].name} ${surface==='turf'?'芝':'ダート'}${distance}m`,
            distance,surface,label,trackId:track.id,track,hill:track.hill,wind:track.wind,heat:month>=6&&month<=9?track.heat:0});
        }
      }
      // Keep established farm fields and IDs; novice routes also have a general-only field.
      if(['new','maiden'].includes(e.level))variants.push(...variants.map(r=>({...r,
        id:`${r.id}:general`,name:`${r.name}（一般参加）`,opponents:'general'})));
      return variants;
    }).map(economyEvent);
  }
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
    if(!/^G/.test(e.level))return `local-${e.level}-${e.surface}`;
    if(e.level!=='GI') {
      const ageGroup=e.maxAge===2?'young':e.maxAge===3?'classic':'older';
      const route=e.distance<=1400?'sprint':e.distance<=1800?'mile':e.distance>=2800?'long':'middle';
      return `support-${e.surface}-${ageGroup}-${route}${e.sex?'-female':''}`;
    }
    if(e.surface==='dirt') {
      const ageGroup=e.maxAge===2?'young':e.maxAge===3?'classic':'older';
      // Retain the existing older dirt division while separating new restricted routes.
      return ageGroup==='older'&&!e.sex&&e.distance>1400?'dirt':`dirt-${ageGroup}-${e.distance<=1400?'sprint':'middle'}${e.sex?'-female':''}`;
    }
    if(e.sex)return `female-${e.minAge===2?'young':e.maxAge===3?'classic':'older'}`;
    if(e.minAge===2&&e.maxAge===2)return 'juvenile';
    if(e.distance<=1400)return 'sprint';
    if(e.maxAge===3)return e.distance>=2800?'classic-long':e.distance>=2200?'classic-derby':e.distance>=1800?'classic-middle':'classic-mile';
    if(e.distance<=1800)return 'mile';
    if(e.distance>=2800)return 'long';
    return 'middle';
  }
  const eventKey=e=>`${date(e.week).week}:${e.id.replace(/^\d+:/,'')}`;
  let worldRoutes=null;
  function worldRoute(e) {
    if(!worldRoutes) {
      const stakes=Array.from({length:YEAR},(_,i)=>calendar(i+1)).flat().filter(e=>/^G/.test(e.level));
      worldRoutes=new Map(stakes.filter(e=>e.level==='GI').map(e=>[eventKey(e),e]));
      const prepared=new Set();
      // One lead-in per G1 division each year, sharing its actual racing birds.
      // All other lower grades are generated only when the player enters.
      for(const target of stakes.filter(e=>e.level==='GI')) {
        const group=worldGroup(target);
        if(prepared.has(group))continue;
        const years=target.maxAge===3?3:target.maxAge===2?2:5,sex=target.sex||'M';
        const candidates=stakes.filter(r=>r.level!=='GI'&&!worldRoutes.has(eventKey(r))&&
          target.week-r.week>=4&&target.week-r.week<=12&&r.surface===target.surface&&
          years>=r.minAge&&years<=r.maxAge&&(!r.sex||r.sex===sex)&&
          Math.abs(r.distance-target.distance)<=600&&
          !stakes.some(g=>g.level==='GI'&&worldGroup(g)===group&&Math.abs(g.week-r.week)<4));
        candidates.sort((a,b)=>Math.abs(a.distance-target.distance)-Math.abs(b.distance-target.distance)||
          Number(b.level==='GII')-Number(a.level==='GII')||b.week-a.week);
        if(candidates.length){worldRoutes.set(eventKey(candidates[0]),target);prepared.add(group);}
      }
    }
    return worldRoutes.get(eventKey(e));
  }
  const worldEvents=week=>calendar(week).filter(e=>worldRoute(e));
  const npcSource=(farm,group,sex)=>ROOTS[(MAJOR_FARMS.indexOf(farm)*5+[...group].reduce((n,c)=>n+c.charCodeAt(0),0)+(sex==='F'?1:0))%ROOTS.length];
  function npcParents(s,farm,e,birthYear,frequency=farm.quality,characterMean=null) {
    const group=`${e.surface}-${e.distance>=2600?'long':e.distance<=1800?'short':'middle'}-${/^G/.test(e.level)?'major':e.level}`;
    const distance=e.distance>=2800?.9:e.distance>=2200?.5:e.distance<=1600?-.8:0;
    const selected=[];
    for(const sex of ['M','F']){
      const candidates=s.birds.filter(b=>b.farm===farm.name&&b.breedingGroup===group&&b.sex===sex&&b.birthYear<=birthYear-3&&b.birthYear>=birthYear-20&&
        (sex==='M'||!crossRisk(s,selected[0],b)));
      candidates.sort((a,b)=>b.g1-a.g1||b.graded-a.graded||mean(Object.values(quality(b.genome)))-mean(Object.values(quality(a.genome)))||b.birthYear-a.birthYear);
      if(candidates.length){selected.push(candidates[Math.floor(random(s)*Math.min(3,candidates.length))]);continue;}
      // Imported foundation stock is the explicit unknown boundary of the pedigree.
      const release=-.8+random(s)*1.6,g=genome(s,null,distance,release,frequency);
      const source=npcSource(farm,group,sex);
      g.defects={[`${source.lineage}-weak`]:Array.from({length:Breeding.DEFECT_LOCI},()=>[0,1])};
      const base=createBird(s,{name:generatedName(s,farm.prefix,'',sex),owner:'archive',farm:farm.name,role:'archived',kind:'general',
        sex,birthYear:birthYear-5,bornWeek:(birthYear-6)*YEAR+9,genome:g,breedingGroup:group,npcFoundation:true,lineage:source.lineage,
        ...(characterMean===null?{}:{inborn:Object.fromEntries(Object.keys(PERSONALITY).map(key=>[key,characterMean-8+random(s)*16]))})});
      base.genome.traits.aptitude[e.surface]=[1,1];base.genome.traits.development.earlyGrowth=[1,1];base.growth='early';
      selected.push(base);
    }
    return selected;
  }
  function fillerRoster(s,e,major,count) {
    // Event-local identities and RNG never enter the pedigree or breeding stream.
    let seed=0x46494c4c;
    for(const char of `${e.week??s.week}:${e.id||e.name}`)seed=(Math.imul(seed,31)^char.charCodeAt(0))>>>0;
    const draw=Mapping.seededRandom(seed),used=unavailableNames(s),year=date(e.week??s.week).year;
    const scores=major.map(b=>currentAbilities(s,b));
    const minimum=Object.fromEntries(Mapping.ABILITIES.map(({key})=>[key,Math.min(80,...scores.map(a=>a[key]))]));
    return Array.from({length:count},(_,i)=>{
      const sex=e.sex||(draw()<.5?'F':'M'),pool=Names[sex],start=Math.floor(draw()*pool.length);
      let name;
      for(let n=0;n<pool.length;n++){
        const candidate=`ノラ${pool[(start+n)%pool.length]}`;
        if(validBirdName(candidate)&&!used.has(candidate)){name=candidate;break;}
      }
      // A long-lived player lineage can reserve the entire normal name stock.
      name??=generatedName({...s,serial:start,birds:[...used].map(name=>({name,role:'racing'}))},'ノラ','',sex);
      used.add(name);
      const abilities=Object.fromEntries(Mapping.ABILITIES.map(({key})=>[key,50+draw()*Math.max(0,Math.min(15,minimum[key]-65))]));
      const personality=Object.fromEntries(Object.keys(PERSONALITY).map(key=>[key,50+draw()*15]));
      return {id:`filler-${e.week??s.week}-${seed}-${i}`,name,filler:true,owner:'guest',sex,
        birthYear:year-e.minAge,abilities,personality,condition:100,strain:0,races:0,wins:0,
        color:['yellow','red','blue','green','rose','white','black','purple','gray'][Math.floor(draw()*9)],crest:'yellow',
        courseTraits:{aptitude:Object.fromEntries(Object.keys(Genetics.APTITUDES).map(key=>[key,[.5,.5]]))}};
    });
  }
  function createWorldRunners(s,e,group) {
    const year=date(s.week).year;
    return MAJOR_FARMS.map(farm=>{
      const birthYear=year-(e.maxAge===3?3:e.maxAge===2?2:5),frequency={new:.10,maiden:.10,c1:.22,c2:.3,c3:.38,open:.45}[e.level]??farm.quality;
      const parents=npcParents(s,farm,e,birthYear,frequency);
      const b=createBird(s,{name:generatedName(s,farm.prefix,'',e.sex||(e.level==='GI'?'M':'F')),owner:'npc',farm:farm.name,season:year,worldGroup:group,breedingGroup:parents[0].breedingGroup,
        role:'racing',kind:'general',registered:true,sex:e.sex||(e.level==='GI'?'M':'F'),birthYear,bornWeek:(birthYear-1)*YEAR+9},parents);
      // A failed gold egg is an absent runner, never a rerolled genotype.
      if(!b)return null;
      b.training=Object.fromEntries(Mapping.ABILITIES.map(a=>[a.key,/^G/.test(e.level)?.95:['new','maiden'].includes(e.level)?.25:.65]));
      return b;
    }).filter(Boolean);
  }
  function worldRoster(s,e,{slots=11}={}) {
    if(e.opponents==='general')return fillerRoster(s,e,[],slots);
    const route=worldRoute(e),year=date(s.week).year,group=worldGroup(route||e);
    let runners;
    if(route) {
      runners=s.birds.filter(b=>b.owner==='npc'&&b.season===year&&b.worldGroup===group);
      if(!runners.length)runners=createWorldRunners(s,route,group);
    } else {
      // An event-local stream isolates opponents from saved breeding RNG and
      // the pedigree/market. Preserve the established class strength and physics.
      let seed=0x47554553;
      for(const char of `${e.week}:${e.id}`)seed=(Math.imul(seed,31)^char.charCodeAt(0))>>>0;
      const scratch={...s,rng:seed,serial:s.serial,birds:s.birds.slice()};
      runners=createWorldRunners(scratch,e,group).map((b,i)=>({...b,
        id:`guest-${e.week}-${seed}-${i}`,owner:'guest',temporary:true,parents:[],farm:undefined}));
    }
    const major=runners.filter(b=>age(s,b)>=e.minAge&&age(s,b)<=e.maxAge&&(!e.sex||b.sex===e.sex)).slice(0,slots);
    return [...major,...fillerRoster(s,e,major,Math.max(0,slots-major.length))];
  }
  function runWorldEvent(s,e,players=[]) {
    const rivals=worldRoster(s,e,{slots:12-players.length});
    const entrants=[...players,...rivals].slice(0,12);
    const runs=simulateField(s,drawGates(s,entrants,e),e,players.length>0).sort((a,b)=>Number(b.finished)-Number(a.finished)||(a.finished?a.time-b.time:b.state.distance-a.state.distance));
    const field=runs.map(({id,name,time,finished,farm,filler})=>({id,name,time,finished,farm,...(filler?{filler:true}:{})}));
    runs.forEach((run,i)=>{
      if(run.filler||run.temporary)return;
      const b=bird(s,run.id);if(b.owner==='player')return;
      const rank=i+1,reward=(run.finished?e.purse[i]||0:0)+e.allowance;
      b.records.push({week:s.week,year:date(s.week).year,name:e.name,level:e.level,distance:e.distance,surface:e.surface,trackId:e.trackId,rank,reward,time:run.time,finished:run.finished,field,sexRestricted:!!e.sex});
      b.races++;b.earnings+=reward;b.lastRace=s.week;
      if(rank===1&&run.finished){b.wins++;if(/^G/.test(e.level))b.graded++;if(e.level==='GI'){b.g1++;b.fans+=1200;}}
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
    // Keep prospective breeding stock and every referenced ancestor.
    const ancestors=new Set(s.birds.flatMap(b=>b.parents));
    s.birds=s.birds.filter(b=>!(b.owner==='archive'&&b.farm&&!b.graded&&year-b.birthYear>23&&!ancestors.has(b.id)));
  }
  let historyTemplate=null;
  function worldHistory() {
    if(!historyTemplate) {
      const scratch={week:1,rng:0x574f524c,serial:1,birds:[]};
      for(let year=1;year<=5;year++) {
        for(let week=(year-1)*YEAR+1;week<=year*YEAR;week++) {
          scratch.week=week;
          for(const e of worldEvents(week))runWorldEvent(scratch,e);
        }
        retireWorld(scratch,year);
      }
      historyTemplate=JSON.stringify(scratch.birds);
    }
    return historyTemplate;
  }
  function ensureWorld(s,history) {
    if(s.worldVersion===1)return;
    // A caller can reuse the same genuinely simulated history across isolated runs.
    if(history!==undefined&&historyTemplate===null){
      if(typeof history!=='string'||!Array.isArray(JSON.parse(history)))throw Error('Invalid world history');
      historyTemplate=history;
    }
    // Keep old lineage records, retire the former placeholder market entries.
    s.birds.filter(b=>b.owner==='public'&&!b.farm).forEach(b=>b.role='archived');
    const imported=JSON.parse(worldHistory()),ids=new Map(imported.map(b=>[b.id,`bird-${s.serial++}`]));
    const shift=date(s.week).year-6;
    for(const b of imported) {
      b.id=ids.get(b.id);b.parents=b.parents.map(id=>ids.get(id)||id);b.birthYear+=shift;b.bornWeek+=shift*YEAR;if(b.season!==undefined)b.season+=shift;
      if(b.retiredYear!==null)b.retiredYear+=shift;
      b.lastRace+=shift*YEAR;
      b.records.forEach(r=>{r.week+=shift*YEAR;r.year+=shift;r.field.forEach(x=>x.id=ids.get(x.id)||x.id);});
      s.birds.push(b);
    }
    s.worldVersion=1;
  }
  function upgradeState(s) {
    s.naming??={...DEFAULT_NAMING};
    // Refresh the old sale introduction without changing the bird or its abilities.
    for(const b of s.birds)if(b.comment==='おだやかで、人の合図によく耳を傾ける子です。')
      b.comment='おだやかで、周りにつられず自分のペースを保てる子です。';
    if(s.geneticsVersion!==Genetics.VERSION){
      for(const b of s.birds){
        b.genome.traits??=Genetics.legacy(b);
        for(const key of Object.keys(Genetics.COURSE_APTITUDES))b.genome.traits.aptitude[key]??=[.5,.5];
        b.crest=b.genome.traits.crest;
      }
      s.geneticsVersion=Genetics.VERSION;
    }
    refreshRoots(s);
    ensureWorld(s);
    if(s.breedingVersion!==Breeding.VERSION){
      // Existing phenotypes and RNG stay intact; new genes start neutral.
      for(const b of s.birds){
        b.genome.defects??={};
        b.genome.character??=Object.fromEntries(Object.entries(b.inborn).map(([k,v])=>[k,[v,v]]));
      }
      const scratch={week:s.week,rng:0x50454449,serial:s.serial,birds:s.birds};
      for(const b of [...s.birds])if(b.farm&&!b.parents.length&&!b.npcFoundation){
        const farm=MAJOR_FARMS.find(f=>f.name===b.farm)||MAJOR_FARMS[0],record=b.records[0]||{surface:'turf',distance:1800,level:'GI'};
        b.parents=npcParents(scratch,farm,record,b.birthYear).map(p=>p.id);b.pedigreeReconstructed=true;
      }
      for(const b of s.birds)if(!b.farm&&b.kind==='general'&&b.sex==='F'&&!b.parents.length){
        const source=s.birds.find(p=>p.kind==='root'&&p.lineage===b.lineage)||s.birds.find(p=>p.kind==='root'&&p.lineage==='root-13');
        b.parents=[source.id,null];b.pedigreeReconstructed=true;
      }
      s.serial=scratch.serial;s.breedingVersion=Breeding.VERSION;
    }
    // Repair source affiliations only; saved parents, genes, abilities and RNG stay intact.
    const byId=new Map(s.birds.map(b=>[b.id,b]));
    for(const b of s.birds)if(!byId.has(b.parents[0])) {
      if(b.npcFoundation&&!ROOTS.some(p=>p.lineage===b.lineage)) {
        const recorded=ROOTS.find(p=>Object.hasOwn(b.genome.defects,`${p.lineage}-weak`));
        const farm=MAJOR_FARMS.find(f=>f.name===b.farm);
        const source=recorded||(farm&&b.breedingGroup?npcSource(farm,b.breedingGroup,b.sex):null);
        if(source)b.lineage=source.lineage;
      }
      if(!b.lineage&&b.comment==='瞬発力のある2歳牝羽。モーグリが調教・休養・出走を担当します。')b.lineage=ROOTS[1].lineage;
    }
    for(const b of s.birds) {
      const source=paternalRoot(s,b,id=>byId.get(id));
      if(source)b.lineage=source.lineage;
    }
    // Upgrade names without changing identities, pedigrees, race times or RNG.
    const renamed=new Map();
    for(const b of s.birds)if(!validBirdName(b.name)){
      const root=b.kind==='root'&&ROOTS.find(p=>p.lineage===b.lineage),farm=MAJOR_FARMS.find(f=>f.name===b.farm);
      b.name=root?root.name:generatedName(s,farm?.prefix,'',b.sex,undefined,b.id);renamed.set(b.id,b.name);
    }
    const updateRecord=r=>{
      for(const runner of r.field||[])if(renamed.has(runner.id))runner.name=renamed.get(runner.id);
      for(const runner of r.replay?.runners||[])if(renamed.has(runner.id))runner.name=renamed.get(runner.id);
      if(renamed.has(r.birdId))r.birdName=renamed.get(r.birdId);
    };
    for(const b of s.birds)for(const r of b.records)updateRecord(r);
    for(const report of [...s.reports,...s.journal])for(const r of report.results||[])updateRecord(r);
    for(const award of s.awards)if(renamed.has(award.birdId))award.name=renamed.get(award.birdId);
    restoreFirstWins(s);
    if(s.mareMarketVersion!==1)expandMareMarket(s,s.marketYear);
    // Reprice only unsold lots; purchased birds, finances and breeding RNG stay intact.
    for(const id of s.sale){const b=bird(s,id);if(b?.owner==='sale')b.price=marePrice(b);}
    return s;
  }
  function refreshMarket(s) {
    const year = date(s.week).year;
    if (s.marketYear === year) return;
    s.marketYear = year;
    s.birds.filter(b => b.owner === 'sale').forEach(b => {b.role = 'archived'; b.owner = 'archive';});
    s.sale = [
      ['ハルノコムギ',.0,-.2,'おだやかで、周りにつられず自分のペースを保てる子です。'],
      ['ミズノシズク',.8,.4,'長く歩いても、まだ先へ行きたそうですね。'],
      ['アカネノハネ',-.8,.65,'走り始めると、とても軽やか。少し元気いっぱいです。'],
    ].map(([name,distance,release,comment],i) => {
      const father=s.birds.find(b=>b.kind==='root'&&b.lineage===`root-${[13,2,1][i]}`);
      const scratch={week:s.week,rng:random(s)*4294967296,serial:1,birds:[]};
      const unknown=createBird(scratch,{distance,release});
      unknown.id=null;
      const traits=i===0?{control:98,drive:75,wisdom:86}:i===1?{drive:87,control:80}:{drive:105,control:68};
      for(const [key,value] of Object.entries(traits))unknown.genome.character[key]=Array(2).fill(clamp(2*value-mean(father.genome.character[key]),50,150));
      const b=createBird(s,{name:year===1?name:generatedName(s,'ハネカゼ','','F'),sex:'F',role:'mare',owner:'sale',kind:'general',birthYear:year-4,bornWeek:(year-5)*YEAR+9,parents:[father.id,null],comment},[father,unknown]);
      Object.assign(b.inborn,traits);Object.assign(b.personality,traits);b.price=marePrice(b);return b.id;
    });
    expandMareMarket(s,year);
    s.birds.filter(b => b.owner==='public' && b.role==='stud' && year-b.retiredYear>=5).forEach(b => b.role='archived');
  }
  function expandMareMarket(s,year) {
    // Imported breeding stock bridges the market by genetic merit alone. These
    // birds have real inherited parents and no invented racing achievements.
    const stock={...s,rng:(0x53414c45+year)>>>0};
    for(const [tier,frequency] of [.50,.65,.82].entries())for(const surface of ['turf','dirt']){
      const farm=MAJOR_FARMS[tier*2+(surface==='dirt'?1:0)],distance=surface==='dirt'?1400:2400;
      const parents=npcParents(stock,farm,{surface,distance,level:`sale-${tier}`},year-4,frequency,90+tier*10);
      const b=createBird(stock,{name:generatedName(stock,farm.prefix,'','F'),sex:'F',role:'mare',owner:'sale',kind:'general',farm:farm.name,
        birthYear:year-4,bornWeek:(year-5)*YEAR+9,comment:'他牧場で繁殖用に育てられた未出走の牝羽です。'},parents);
      if(b){b.price=marePrice(b);s.sale.push(b.id);}
    }
    s.serial=stock.serial;
    const listed=new Set(s.sale),retired=s.birds.filter(b=>!listed.has(b.id)&&b.sex==='F'&&b.farm&&b.owner==='archive'&&b.retiredYear===year-1&&b.races>0&&year-b.birthYear<20).sort((a,b)=>b.earnings-a.earnings);
    const categories=[b=>b.g1>0,b=>!b.g1&&b.graded>0,b=>!b.graded&&b.races>0];
    const graduates=categories.flatMap(matches=>retired.filter(matches).slice(0,Math.max(0,4-s.sale.map(id=>bird(s,id)).filter(matches).length)));
    for(const b of graduates){b.owner='sale';b.role='mare';b.price=marePrice(b);b.comment=b.graded?'他牧場で走り、重賞の実績を残した繁殖牝羽です。':'他牧場で競走生活を終え、繁殖入りした牝羽です。';s.sale.push(b.id);}
    s.mareMarketVersion=1;
  }

  function initial(seed = 20260930,settings={},history) {
    if(typeof seed==='object'){settings=seed;seed=20260930;}
    const s = {version:VERSION,naming:namingSettings(settings),geneticsVersion:Genetics.VERSION,breedingVersion:Breeding.VERSION,week:9,money:20000,debt:0,rng:seed>>>0,serial:1,birds:[],sale:[],marketYear:0,stage:'buy',reports:[],journal:[],ledger:[],milestones:{},firstWins:{},awards:[],founderOffers:[],
      facilities:Object.fromEntries(Object.keys(FACILITIES).map(k => [k,['stalls','meadow'].includes(k)?1:0])),difficulty:'normal',lastAnnual:0};
    refreshRoots(s);
    ensureWorld(s,history);
    refreshMarket(s);
    const starter=createBird(s,{name:generatedName(s,undefined,'ノヒカリ','F'),sex:'F',role:'racing',registered:true,trainer:'moogle',policy:'steady',birthYear:-1,distance:-.7,release:.7,lineage:ROOTS[1].lineage,
      potential:{speed:103,cardio:78,power:116,reserve:108,legs:73,economy:82,start:76,resilience:78},comment:'瞬発力のある2歳牝羽。モーグリが調教・休養・出走を担当します。'});
    starter.training=Object.fromEntries(Mapping.ABILITIES.map(a=>[a.key,.75]));
    starter.genome.traits.development.earlyGrowth=[1,1];starter.growth='early';
    return s;
  }
  const saleOpen = s => [2,3].includes(date(s.week).month);
  const breedingOpen = s => [3,4].includes(date(s.week).month);
  const sires = s => s.birds.filter(b => b.role==='stud' && (['root','founder'].includes(b.kind)||b.owner==='player'||date(s.week).year-b.retiredYear<5));
  const studFee = b => {
    if(b.kind==='root')return 600;
    const wins=b.records.filter(r=>r.level==='GI'&&r.rank===1);
    if(!wins.length)return 300000;
    if(wins.every(r=>r.surface==='dirt'||r.distance<=1400))return Math.min(1000000,300000+(wins.length-1)*150000);
    const prestige=wins.reduce((n,r)=>n+g1Points(r),0);
    return Math.min(80000000,3000000+prestige*100000);
  };
  function mareValuation(b) {
    const {base}=geneticBreakdown(b),penalties=Breeding.penalties(b.genome,DEFECTS);
    // 16 inherited body, management and character values. Birth variation,
    // training and learned character never change breeding value.
    const geneticMean=mean(Object.entries(base).map(([key,value])=>value-(penalties[key]||0)));
    const geneticValue=Math.min(80000000,3000*10**((geneticMean-76.7)/12));
    const aptitude=b.genome.traits.aptitude,development=b.genome.traits.development;
    const score=pair=>mean(pair),distance=mean(b.genome.distance);
    const surfaceFactor=1+.06*(score(aptitude.turf)-score(aptitude.dirt));
    const distanceFactor=1-.05*Math.max(0,-distance)+.03*Math.max(0,distance);
    const courseFactor=Object.keys(Genetics.COURSE_APTITUDES).reduce((n,key)=>n*(1+.04*(score(aptitude[key])-.5)*2),1);
    const cushionFactor=['lowCushion','highCushion'].reduce((n,key)=>n*(1+.02*(score(aptitude[key])-.5)*2),1);
    const developmentFactor=Object.keys(Genetics.DEVELOPMENT).reduce((n,key)=>n*(1+.02*(score(development[key])-.5)*2),1);
    const aptitudeFactor=surfaceFactor*distanceFactor*courseFactor*cushionFactor*developmentFactor;
    const wins=b.records.filter(r=>r.rank===1&&r.finished!==false),g1Wins=wins.filter(r=>r.level==='GI');
    let careerValue=0;
    if(b.g1)careerValue=100000000*(g1Wins.length?mean(g1Wins.map(r=>raceLoad(r))):1)+g1Wins.reduce((n,r)=>n+g1Points(r)*1000000,0);
    else if(b.graded){
      const graded=wins.filter(r=>/^G/.test(r.level));
      careerValue=(10000000+b.graded*5000000)*(graded.length?mean(graded.map(r=>raceLoad(r))):1);
    } else {
      const values={new:12000,maiden:10000,c1:40000,c2:150000,c3:600000,open:2000000};
      careerValue=wins.reduce((best,r)=>Math.max(best,(values[r.level]||0)*raceLoad(r)),0);
      careerValue+=Math.min(10,b.wins)*5000;
    }
    const price=Math.max(1000,Math.round((geneticValue+careerValue)*aptitudeFactor/100)*100);
    return {geneticMean,geneticValue,careerValue,aptitudeFactor,price};
  }
  const marePrice=b=>mareValuation(b).price;
  const breedFee = b => b.owner==='player'?0:studFee(b);
  function buy(s, id) {
    if (!saleOpen(s)) throw Error('繁殖牝羽セールは2月〜3月です。');
    const b=bird(s,id);
    if (!b || b.owner!=='sale' || !s.sale.includes(id)) throw Error('この繁殖牝羽は購入できません。');
    if (own(s).filter(b=>b.role==='mare').length>=capacity(s).mare) throw Error('繁殖牝羽の羽房がいっぱいです。');
    pay(s,-b.price,`${b.name}を購入`); b.owner='player';
    if (s.stage==='buy') s.stage='breed';
    milestone(s,'purchase','最初の仲間を迎えました',`${b.name}、ようこそ${s.naming?.ranchName||DEFAULT_NAMING.ranchName}へ！ この子と過ごす春が楽しみですね。`);
    return b;
  }
  function sellMareReason(s,b) {
    if(!b||b.owner!=='player'||b.role!=='mare'||b.sex!=='F')return '所有する繁殖牝羽を選んでください。';
    if(b.pregnancy)return '受胎中の繁殖牝羽は、出産後に売却できます。';
    return '';
  }
  function sellMare(s,id) {
    const b=bird(s,id),reason=sellMareReason(s,b);
    if(reason)throw Error(reason);
    const price=marePrice(b);
    pay(s,price,`${b.name}を売却`);
    b.owner='archive';b.role='archived';
    if(s.stage==='breed'&&!own(s).some(b=>b.role==='mare'))s.stage='buy';
    return price;
  }
  function releaseStudReason(s,b) {
    return !b||b.owner!=='player'||b.role!=='stud'||b.sex!=='M'||b.kind!=='home'?'所有する自家製種牡羽を選んでください。':'';
  }
  function releaseStud(s,id) {
    const b=bird(s,id),reason=releaseStudReason(s,b);
    if(reason)throw Error(reason);
    b.owner='archive';b.role='archived';b.released=true;
    s.founderOffers=s.founderOffers.filter(x=>x!==id);
    s.reports=s.reports.filter(r=>r.type!=='founder'||r.birdId!==id);
  }
  const breedingCost = (sire,fruit='none') => breedFee(sire)+BREEDING_FRUITS[fruit].cost;
  function breedingReason(s, dam, sire, fruit='none') {
    if (!breedingOpen(s)) return '配合期間は3月第1週〜4月第4週です。次の3月までお待ちください。';
    if (!dam || dam.owner!=='player' || dam.role!=='mare') return '繁殖牝羽を選んでください。';
    if (!sire || !sires(s).includes(sire)) return '種牡羽を選んでください。';
    const danger=crossReason(s,sire,dam);if(danger)return danger;
    if (age(s,dam)>=20) return 'この繁殖牝羽は繁殖を引退する年齢です。';
    if (dam.pregnancy) return '出産を待っています。';
    if (dam.bredYear===date(s.week).year) return '今年の配合は済んでいます。来年また会いましょう。';
    if (racingCount(s)>=capacity(s).racing) return '子どものための羽房を拡張してください。';
    if (!Object.hasOwn(BREEDING_FRUITS,fruit)) return '産み分けの実を選んでください。';
    if (fruit!=='none'&&labLevel(s)<1) return '産み分けの実を使うには研究所Lv1が必要です。';
    if (s.money<breedingCost(sire,fruit)) return fruit==='none'?'配合料金が足りません。':'配合料金と実の代金に必要なギルが足りません。';
    return '';
  }
  function breed(s, damId, sireId, fruit='none') {
    const dam=bird(s,damId),sire=bird(s,sireId),reason=breedingReason(s,dam,sire,fruit);
    if (reason) throw Error(reason);
    pay(s,-breedFee(sire),`${dam.name} × ${sire.name} 配合`);
    if(fruit!=='none')pay(s,-BREEDING_FRUITS[fruit].cost,`${dam.name} ${BREEDING_FRUITS[fruit].name}`);
    dam.pregnancy={sireId,due:s.week+GESTATION}; dam.bredYear=date(s.week).year;
    if(fruit!=='none')dam.pregnancy.fruit=fruit;
    if (s.stage==='breed') s.stage='grow';
    milestone(s,'breeding','新しい命を、いっしょに待ちましょう',`${when(dam.pregnancy.due)}に生まれる予定です。楽しみですね！`);
  }
  function observe(s,b,speaker='shiroma') {
    const d=mean(b.genome.distance),r=mean(b.genome.release),kupo=speaker==='moogle';
    const body=d>.35?(kupo?'長い距離が向いてそうクポ':'長く走ることが得意になりそうですね'):d<-.35?(kupo?'短い距離でスピードを活かせそうクポ':'短い距離を軽やかに走れそうですね'):(kupo?'いろんな距離を試してみたいクポ':'いろいろな距離を試してみたいですね');
    const late=r>.3?(kupo?'ためてから一気に伸びるタイプクポ。':'力をためてから走り出すのが好きみたい。'):'';
    const character=b.personality.control>85?(kupo?'いつも落ち着いてて頼もしいクポ':'落ち着いて自分のペースを保てます'):b.personality.drive>85?(kupo?'走るのが大好きで元気いっぱいクポ':'走ることが大好きな、元気な子です'):(kupo?'まわりに慌てず走れるようになってきたクポ':'少しずつ、周りに慌てず走ることを覚えています');
    return `${body}。${late}${character}${kupo?'！':'。'}`;
  }
  function abilityProgress(s,b) {
    const genes=Genetics.growth(b.genome.traits),birthWeek=(b.birthYear-1)*YEAR+date(Math.max(1,b.bornWeek)).week;
    const years=age(s,b)===null?genes.maturityYears:Math.max(0,(s.week-birthWeek)/YEAR);
    const maturity=clamp(years/genes.maturityYears,0,1);
    const decline=clamp(1-Math.max(0,years-genes.declineStart)*genes.declineRate,.6,1);
    return Object.fromEntries(Mapping.ABILITIES.map(({key})=>{
      const developed=maturity*(1-TRAINING[key]+TRAINING[key]*b.training[key]),current=developed*decline;
      return [key,{developed,current,decline:developed-current,remaining:1-developed,value:50+(b.potential[key]-50)*current}];
    }));
  }
  const currentAbilities=(s,b)=>b.filler?{...b.abilities}:Object.fromEntries(Object.entries(abilityProgress(s,b)).map(([key,p])=>[key,p.value]));
  function facilityReason(s,key) {
    const f=FACILITIES[key];
    if (!f) return '施設が見つかりません。';
    if (s.facilities[key]>=f.max) return '最大まで拡張済みです。';
    if (key==='lab'&&!s.milestones.win) return 'レース初勝利で建設できます。';
    if (key==='statue'&&!s.birds.some(b=>b.owner==='player'&&b.titles.some(t=>/^(triple|filly):/.test(t)))) return '三冠制覇で建設できます。';
    if (key==='museum'&&!EIGHT.every(n=>s.firstWins?.[`g1:${n}`])) return '牧場で8大競走を制覇すると建設できます。';
    if (s.money<facilityCost(s,key)) return 'ギルが足りません。';
    return '';
  }
  const facilityCost=(s,key)=>FACILITIES[key].costs?.[s.facilities[key]]??FACILITIES[key].cost*(s.facilities[key]+1);
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
    if (!b||b.owner!=='player'||!validBirdName(clean)) throw Error(NAME_ERROR);
    if(b.registered||b.role!=='young')throw Error('登録済みの名前は変更できません。');
    if(unavailableNames(s,[id]).has(clean))throw Error('その名前は現役羽・血統・GⅠ記録・始祖・殿堂入りなどに残っているため登録できません。');
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
  function classFor(s,b) {
    if(b.graded>0||b.g1>0||b.records.some(r=>r.rank===1&&r.finished!==false&&(r.level==='open'||/^G/.test(r.level))))return 'open';
    if(b.races===0)return 'new';
    if(b.wins===0)return 'maiden';
    const years=age(s,b),openWins=years===2?1:years===3?(date(s.week).month<=6?2:3):4;
    return b.wins>=openWins?'open':`c${b.wins}`;
  }
  function eligible(s,b,e) {
    const years=age(s,b);
    if (b.role!=='racing'||!b.registered||years<e.minAge||years>e.maxAge||(e.sex&&e.sex!==b.sex)) return false;
    const level=classFor(s,b);
    if (/^G/.test(e.level)) return level==='open';
    return e.level===level||(e.level==='maiden'&&b.races===0);
  }
  const TRAINING_MENUS={balanced:{label:'総合調教',keys:[]},speed:{label:'最高速・立ち上がり',keys:['speed','start']},stamina:{label:'心肺・脚持久力',keys:['cardio','legs']},power:{label:'瞬発力・スパート容量',keys:['power','reserve']}};
  function scheduledGap(b,week) {
    return week-b.lastRace>=4&&!Object.entries(b.schedule||{}).some(([w,p])=>p.mode==='race'&&Number(w)!==week&&Math.abs(Number(w)-week)<4);
  }
  function raceOptions(s,b,week) {
    if(!scheduledGap(b,week))return [];
    return calendar(week).filter(e=>eligible({...s,week},b,e));
  }
  function setSchedule(s,id,week,value) {
    const b=bird(s,id);
    if(!b||b.owner!=='player'||b.role!=='racing'||!b.registered)throw Error('競走羽を選んでください。');
    if(!Number.isInteger(week)||week<s.week||week>=s.week+8)throw Error('今週から8週先までの予定を選んでください。');
    if(!value||!['auto','training','rest','race'].includes(value.mode))throw Error('調教・休養・出走を選んでください。');
    if(value.mode==='training'&&!Object.hasOwn(TRAINING_MENUS,value.menu))throw Error('調教メニューを選んでください。');
    if(value.mode==='race'&&!raceOptions(s,b,week).some(e=>e.id===value.eventId))throw Error('このレースには出走できません。出走条件と4週以上の間隔を確認してください。');
    b.schedule??={};
    if(value.mode==='auto')delete b.schedule[week];
    else b.schedule[week]={mode:value.mode,...(value.mode==='training'?{menu:value.menu}:value.mode==='race'?{eventId:value.eventId}:{})};
  }
  function nextRace(s,b) {
    if (b.role!=='racing'||!b.registered) return null;
    const reserved=Object.entries(b.schedule||{}).filter(([w,p])=>Number(w)>=s.week&&p.mode==='race').sort((a,b)=>Number(a[0])-Number(b[0]));
    if(reserved.length){
      const [week,p]=reserved[0],e=raceOptions(s,b,Number(week)).find(e=>e.id===p.eventId);
      if(e)return e;
      if(Number(week)===s.week)return null;
    }
    const tendency=mean(b.genome.distance),preferred=tendency>.65?3000:tendency>.3?2400:tendency<-.3?1400:1800;
    const [minDistance,maxDistance]=tendency>.3?[2200,3600]:tendency<-.3?[1000,1600]:[1600,2200];
    const bestSurface=Math.max(mean(b.genome.traits.aptitude.turf),mean(b.genome.traits.aptitude.dirt));
    const candidates=[];
    // Include three extra weeks to compare races blocked by a late target.
    for(let week=s.week;week<s.week+15;week++) {
      if (!scheduledGap(b,week)||b.schedule?.[week]) continue;
      for(const e of calendar(week)) if(eligible({...s,week},b,e)) {
        if(e.distance<minDistance||e.distance>maxDistance||mean(b.genome.traits.aptitude[e.surface])<bestSurface-.15)continue;
        const graded=/^G/.test(e.level);
        const footing=Ground.efficiency(b.genome.traits,e);
        candidates.push({event:e,score:Math.abs(e.distance-preferred)/800+(week-s.week)*.13+8*(1-footing.traction)-(b.policy==='challenge'&&graded?3:0)-(e.opponents==='general'?.1:0)});
      }
    }
    if(b.policy==='steady')for(const c of candidates)if(/^G/.test(c.event.level))c.score-=2;
    const targets=candidates.filter(c=>c.event.week<s.week+12);
    let target;
    if(b.policy==='steady') {
      const ordinary=targets.filter(c=>!/^G/.test(c.event.level)).sort((a,b)=>a.score-b.score)[0];
      // Only assess stakes that could improve on the ordinary-race plan.
      const stakes=targets.filter(c=>/^G/.test(c.event.level)&&s.money>=c.event.fee).sort((a,b)=>a.score-b.score);
      for(const c of stakes){
        if(ordinary&&c.score>=ordinary.score)break;
        if(raceOutlook(s,b,c.event).contender){target=c;break;}
      }
      target??=ordinary;
    }else target=targets.sort((a,b)=>a.score-b.score)[0];
    if(!target)return null;
    // Higher grades can outweigh a short wait, but only when racing the target
    // would prevent entering them. A race exactly four weeks later remains open.
    const priority=c=>c.score-({GI:2,GII:1}[c.event.level]||0);
    const alternatives=candidates.filter(c=>c.event.week>=target.event.week&&c.event.week<target.event.week+4&&
      s.money>=c.event.fee&&priority(c)<priority(target)).sort((a,b)=>priority(a)-priority(b));
    for(const c of alternatives)if(b.policy!=='steady'||!/^G/.test(c.event.level)||raceOutlook(s,b,c.event).contender)return c.event;
    return target.event;
  }
  const outlookRosters=new WeakMap(),outlookTimes=new Map();
  function raceOutlook(s,b,e) {
    const snapshot={...s,week:e.week},year=date(e.week).year,route=worldRoute(e),group=worldGroup(route||e);
    let rivals=route?s.birds.filter(r=>r.owner==='npc'&&r.season===year&&r.worldGroup===group):[];
    if(!rivals.length) {
      // Preview generation may append birds, so keep it outside the real save/RNG.
      const revision=`${s.rng}:${s.serial}:${s.birds.length}`;
      let cache=outlookRosters.get(s);
      if(!cache||cache.revision!==revision){cache={revision,groups:new Map()};outlookRosters.set(s,cache);}
      const key=route?`${year}:${group}`:e.id;
      if(!cache.groups.has(key))cache.groups.set(key,worldRoster({...snapshot,birds:s.birds.slice()},e));
      rivals=cache.groups.get(key);
    }
    rivals=rivals.filter(r=>age(snapshot,r)>=e.minAge&&age(snapshot,r)<=e.maxAge&&(!e.sex||r.sex===e.sex)).slice(0,11);
    const timeFor=runner=>{
      const entry=raceEntry(snapshot,runner,e),track=e.track||Calendar.TRACKS[e.trackId]||{};
      // Compare every runner from the same inner gate, without predicting the draw.
      const key=JSON.stringify([e.distance,e.hill,track,entry.p,entry.traits,entry.aptitude,entry.cruise,entry.state,entry.ground]);
      if(!outlookTimes.has(key)){
        const run=Race.simulate([{...entry,lane:0}],e,{track})[0];
        if(outlookTimes.size>=2048)outlookTimes.delete(outlookTimes.keys().next().value);
        outlookTimes.set(key,run.finished?run.time:Infinity);
      }
      return outlookTimes.get(key);
    };
    const time=timeFor(b),bestRivalTime=Math.min(...rivals.map(timeFor));
    // Within 1% of the fastest opponent is a plausible winning contest, not a guarantee.
    return {time,bestRivalTime,contender:rivals.length>0&&Number.isFinite(time)&&Number.isFinite(bestRivalTime)&&time<=bestRivalTime*1.01};
  }
  function weeklyPlan(s,b,e=nextRace(s,b)) {
    const override=b.schedule?.[s.week],rest=b.condition<85||b.strain>15||b.health>0;
    if(e?.week===s.week&&b.condition>=75&&b.strain<25&&!b.health&&s.money>=e.fee)return {mode:'race',event:e,manual:override?.mode==='race'};
    if(override?.mode==='rest'||rest)return {mode:'rest',manual:override?.mode==='rest',reason:override?.mode==='rest'?'指定した休養':b.health?'療養中':'体調・脚の回復を優先'};
    return {mode:'training',menu:override?.mode==='training'?override.menu:'balanced',manual:override?.mode==='training',reason:override?.mode==='race'?'出走条件・体調・ギルを確認して調教に変更':''};
  }
  function upcomingSchedule(s,b) {
    const projected={...b,training:{...b.training},personality:{...b.personality}},rows=[];
    for(let week=s.week;week<s.week+8;week++){
      const snapshot={...s,week},plan=weeklyPlan(snapshot,projected);
      rows.push({week,...plan,override:b.schedule?.[week]||{mode:'auto'}});
      if(plan.mode==='race'){
        projected.lastRace=week;projected.races++;projected.condition=Math.max(0,projected.condition-20);projected.strain+=20;
      }else {
        projected.condition=clamp(projected.condition+12+8*(b.management.recovery-50)/100+(plan.mode==='rest'?s.facilities.spa*3:0),0,100);
        projected.strain=clamp(projected.strain-5-5*(b.management.recovery-50)/100-(plan.mode==='rest'?s.facilities.spa*2:0),0,100);
        if(projected.health)projected.health=Math.max(0,projected.health-1-s.facilities.clinic);
      }
    }
    return rows;
  }
  function raceEntry(s,b,e) {
    const abilities=currentAbilities(s,b),base=Mapping.toPhysics(abilities);
    // General entrants have a lower physical ceiling even when a debutant is
    // still near the minimum ability score. Results still come from simulation.
    const p=b.filler?Physics.parameters({...base,criticalSpeed:base.criticalSpeed*.8,maxSpeed:base.maxSpeed*.65}):base;
    // Management state affects the physical initial state, never a distance bonus.
    const effective={...p,criticalSpeed:p.criticalSpeed*(.97+.03*b.condition/100)};
    const courseTraits=b.filler?b.courseTraits:b.genome.traits,ground=Ground.efficiency(courseTraits,e);
    // Find the sustainable ground speed at unchanged aerobic power and contact losses.
    let lo=0,hi=effective.criticalSpeed;
    for(let i=0;i<35;i++){const mid=(lo+hi)/2;if(Physics.flatPower(mid,effective)<Physics.criticalPower(effective)*ground.traction)lo=mid;else hi=mid;}
    const groundCruise=(lo+hi)/2;
    const runner=Physics.createState(effective);
    runner.reserve*=.75+.25*b.condition/100;runner.fatigue=.25*b.strain/100;
    const paddock={abilities:{...abilities},traits:{...b.personality},condition:b.condition,strain:b.strain,
      traction:ground.traction,age:age(s,b),sex:b.sex,races:b.races,wins:b.wins};
    const aptitude=Object.fromEntries(Object.keys(Genetics.COURSE_APTITUDES).map(key=>[key,mean(courseTraits.aptitude[key]||[.5,.5])]));
    return {id:b.id,name:b.name,p:effective,parameters:p,traits:b.personality,aptitude,cruise:groundCruise,state:runner,ground,paddock};
  }
  function simulateField(s,birds,e,trace=false) {
    return Race.simulate(birds.map((b,lane)=>({...raceEntry(s,b,e),lane})),e,{trace,track:e.track||Calendar.TRACKS[e.trackId]||{}}).map((run,lane)=>
      ({...run,lane,color:birds[lane].color,crest:birds[lane].crest,player:birds[lane].owner==='player',farm:farmName(birds[lane],s),...(birds[lane].filler?{filler:true}:{}),...(birds[lane].temporary?{temporary:true}:{})}));
  }
  function simulateBird(s,b,e,trace=false) {
    return simulateField(s,[b],e,trace)[0];
  }
  function drawGates(s,birds,e) {
    // Reproduce the draw from the saved seed and event without consuming breeding RNG.
    let seed=(s.rng^Math.imul(s.week,0x9e3779b1))>>>0;
    for(const char of e.id||e.name||'')seed=(Math.imul(seed,31)^char.charCodeAt(0))>>>0;
    const draw=Mapping.seededRandom(seed),entrants=birds.slice();
    for(let i=entrants.length-1;i>0;i--){
      const j=Math.floor(draw()*(i+1));
      [entrants[i],entrants[j]]=[entrants[j],entrants[i]];
    }
    return entrants;
  }
  function race(s,b,e,sharedRuns=null) {
    return withBirdLookup(s,()=>settleRace(s,b,e,sharedRuns));
  }
  function settleRace(s,b,e,sharedRuns) {
    e=economyEvent(e);
    if(!b||!e||e.week!==s.week||b.lastRace===s.week||!eligible(s,b,e))throw Error('この週には出走できません。');
    if(s.money<e.fee)return null;
    restoreFirstWins(s);
    if(!sharedRuns){
      if(s.birds.some(x=>x.records.some(r=>r.week===s.week&&r.name===e.name)))throw Error('この競走は確定済みです。');
      sharedRuns=runWorldEvent(s,e,[b]);
    }
    pay(s,-e.fee,`${b.name} 出走経費`);
    const runs=sharedRuns.slice().sort((a,b)=>Number(b.finished)-Number(a.finished)||
      (a.finished?a.time-b.time:b.state.distance-a.state.distance));
    const rank=runs.findIndex(x=>x.id===b.id)+1,run=runs[rank-1],prize=run.finished?e.purse[rank-1]||0:0,reward=prize+e.allowance;
    pay(s,reward,`${b.name} ${e.name} ${rank}着`);
    const result={week:s.week,year:date(s.week).year,name:e.name,level:e.level,distance:e.distance,surface:e.surface,trackId:e.trackId,going:run.ground.going,cushion:run.ground.cushion,rank,prize,allowance:e.allowance,fee:e.fee,reward,time:run.time,finished:run.finished,field:runs.map(({name,time,id,finished,filler})=>({name,time,id,finished,...(filler?{filler:true}:{})})),sexRestricted:!!e.sex,interactions:run.interactions};
    result.replay=Replay.capture(runs,e);
    b.races++;b.lastRace=s.week;b.earnings+=reward;b.records.push(result);
    const durability=(1-.1*(b.management.robustness-100)/50)*raceLoad(e);
    b.condition=clamp(b.condition-durability*(4+14*run.state.energyUsed/12000+10*run.state.reserveSpent/run.parameters.reserveCapacity),0,100);
    b.strain=clamp(b.strain+durability*(3+22*run.state.fatigue),0,100);
    if(e.level==='GI') b.fans+=rank===1?1200:150;
    if(rank===1&&run.finished) {
      recordFirstWin(s,result,b.id,b.name);
      b.wins++;if(/^G/.test(e.level))b.graded++;
      milestone(s,'win','はじめての勝利！',`${b.name}、やったね！ 牧場の初勝利です！`,{notes:['研究所を建設できるようになりました。']});
      if(e.level==='GI') {
        b.g1++;
        milestone(s,'g1','ついに、GⅠの頂点へ',`${b.name}がGⅠ初勝利です！ 私たちの牧場から、こんな子が育つなんて……！`);
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
    return b.owner==='player'&&b.role==='stud'&&b.kind==='home'&&!!paternalRoot(s,b)&&children.length>=3&&children.reduce((n,x)=>n+x.g1,0)>=7;
  }
  function promote(s,id) {
    const b=bird(s,id);
    if(!s.founderOffers.includes(id)||!b||!founderEligible(s,b))throw Error('始祖入りのオファーはまだ届いていません。');
    const source=paternalRoot(s,b);
    for(const previous of s.birds.filter(x=>x.kind==='founder'&&paternalRoot(s,x)?.lineage===source.lineage)) {
      previous.kind='home';previous.role='archived';
    }
    b.lineage=source.lineage;
    b.kind='founder';s.founderOffers=s.founderOffers.filter(x=>x!==id);
    milestone(s,`founder:${id}`,'新しい始祖の誕生',`${b.name}が${source.name}を継ぐ始祖になりました。この血統は、これからもずっと私たちのそばにいます。`);
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
      if(winner&&score(winner)>0){const a={year,title,birdId:winner.id,name:winner.name,farm:farmName(winner,s),points:score(winner)};awards.push(a);s.awards.push(a);}
    }
    const yearBook=s.ledger.filter(l=>date(l.week).year===year),income=yearBook.filter(l=>l.amount>0).reduce((n,l)=>n+l.amount,0),expense=-yearBook.filter(l=>l.amount<0).reduce((n,l)=>n+l.amount,0);
    const mine=awards.filter(a=>bird(s,a.birdId)?.owner==='player');
    report(s,'annual',`${year}年の、私たちの牧場`,`${year}年もおつかれさまでした！ ${mine.length?`${mine.map(a=>`${a.title}に${a.name}`).join('、')}が選ばれました！ `:''}来年も一緒にがんばりましょう。`,{expression:'happy',income,expense,awards});
    for(const b of s.birds.filter(b=>founderEligible(s,b)))if(!s.founderOffers.includes(b.id)) {
      s.founderOffers.push(b.id);
      report(s,'founder','始祖入りのオファーが届きました',`${b.name}が、源流を継ぐ始祖に推薦されました！`,{birdId:b.id,expression:'overjoyed'});
    }
  }
  function acknowledge(s, options={}) {
    const r=s.reports[0];if(!r)return;
    const used=r.type==='registration'?unavailableNames(s,r.birdIds):new Set();
    if(r.type==='registration')for(const id of r.birdIds){
      const b=bird(s,id),name=String(options.names?.[id]??b?.name).trim();
      if(!validBirdName(name))throw Error(NAME_ERROR);
      if(!b||b.owner!=='player'||b.registered||b.role!=='young')throw Error('登録できる幼羽を選んでください。');
      if(used.has(name))throw Error('その名前はすでに使われているため登録できません。');
      used.add(name);
      if(options.policies?.[id]!==undefined&&!['steady','challenge'].includes(options.policies[id]))throw Error('方針を選んでください。');
    }
    if(r.type==='registration')for(const id of r.birdIds){const b=bird(s,id);b.name=String(options.names?.[id]??b.name).trim();if(options.policies?.[id])setPolicy(s,id,options.policies[id]);b.registered=true;b.role='racing';}
    s.reports.shift();
  }
  function advance(s) {
    return withBirdLookup(s,()=>advanceWeek(s));
  }
  function advanceWeek(s) {
    if(s.reports.length)throw Error('シロマの報告を確認してから、次の週へ進みましょう。');
    if(['buy','breed'].includes(s.stage))throw Error(s.stage==='buy'?'最初の繁殖牝羽を迎えましょう。':'最初の配合をしてみましょう。');
    const oldWeek=s.week,d=date(s.week),balance=s.money,results=[],notes=[];
    ensureWorld(s);
    // Choose once before NPC results/generation change the forecast during this week.
    const plannedRaces=new Map(own(s).map(b=>[b.id,nextRace(s,b)]));
    const events=worldEvents(s.week),settledEvents=new Map();
    if(events.length)for(const b of s.birds)for(const r of b.records)
      if(r.week===s.week&&r.rank===1&&!settledEvents.has(r.name))settledEvents.set(r.name,{b,r});
    for(const e of events) {
      const settled=settledEvents.get(e.name);
      if(settled){if(e.level==='GI')notes.push(`GⅠ ${e.name}：${farmName(settled.b,s)}の${settled.b.name}が優勝。`);continue;}
      let funds=s.money;
      const players=own(s).filter(b=>{const ok=plannedRaces.get(b.id)?.id===e.id&&b.condition>=75&&b.strain<25&&!b.health&&funds>=e.fee;if(ok)funds-=e.fee;return ok;});
      const runs=runWorldEvent(s,e,players);
      for(const b of players){const result=race(s,b,e,runs);if(result)results.push({...result,birdId:b.id,birdName:b.name});}
      if(e.level==='GI'){const winner=runs[0];notes.push(`GⅠ ${e.name}：${winner.farm}の${winner.name}が優勝。`);}
    }
    // Untracked grades and ordinary races run only with player entrants, sharing
    // one temporary field even when several player birds enter the same event.
    const playerEvents=new Map([...plannedRaces.values()].filter(e=>e?.week===s.week&&!worldRoute(e)).map(e=>[e.id,e]));
    for(const e of playerEvents.values()){
      let funds=s.money;
      const players=own(s).filter(b=>{const ok=plannedRaces.get(b.id)?.id===e.id&&b.condition>=75&&b.strain<25&&!b.health&&funds>=e.fee;if(ok)funds-=e.fee;return ok;});
      if(!players.length)continue;
      const runs=runWorldEvent(s,e,players);
      for(const b of players){const result=race(s,b,e,runs);if(result)results.push({...result,birdId:b.id,birdName:b.name});}
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
        const e=plannedRaces.get(b.id);
        if(b.lastRace!==s.week) {
          const plan=weeklyPlan(s,b,e),rest=plan.mode==='rest';
          if(!rest)for(const key in b.training) {
            const bonus=(key==='cardio'?s.facilities.pool*.003:['power','reserve'].includes(key)?s.facilities.hill*.003:0);
            const focus=TRAINING_MENUS[plan.menu||'balanced'].keys,multiplier=focus.length?(focus.includes(key)?1.8:.85):1;
            b.training[key]=clamp(b.training[key]+(.012+s.facilities.course*.003+bonus)*multiplier,0,1);
          }
          if(!rest){b.personality.control=clamp(b.personality.control+.2,50,150);b.personality.grit=clamp(b.personality.grit+.15,50,150);}
          b.condition=clamp(b.condition+12+8*(b.management.recovery-50)/100+(rest?s.facilities.spa*3:0),0,100);
          b.strain=clamp(b.strain-5-5*(b.management.recovery-50)/100-(rest?s.facilities.spa*2:0),0,100);
          if(b.health)b.health=Math.max(0,b.health-1-s.facilities.clinic);
          else if(!rest&&random(s)<constitution(b).illnessChance){b.health=constitution(b).recoveryWeeks;notes.push(`${b.name}は脚を休めています。回復まで出走を見合わせます。`);}
        }
      }
    }
    for(const b of s.birds)if(b.schedule)for(const week of Object.keys(b.schedule))if(Number(week)<=s.week)delete b.schedule[week];
    const cost=12+own(s).reduce((n,b)=>n+(b.role==='racing'?20:b.role==='young'?4:8),0)+Object.values(s.facilities).reduce((n,x)=>n+x,0)*2;
    if(s.money>=cost)pay(s,-cost,'今週の飼料・お世話・施設維持');
    else {s.debt+=cost-s.money;pay(s,-s.money,'今週の維持費（不足分は未払）');notes.push('維持費が足りず、不足分を未払金にしました。');}
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
      report(s,'monthly',`${d.month}月の牧場だより`,`${d.month}月もおつかれさまでした！${own(s).some(b=>b.role==='young')?' 子どもたちも少しずつ大きくなっています。':''}`,{income,expense,expression:'happy'});
    }
    if(d.week===48){annual(s,d.year);retireWorld(s,d.year);}
    s.week++;
    for(const mother of own(s).filter(b=>b.pregnancy&&b.pregnancy.due<=s.week)) {
      const father=bird(s,mother.pregnancy.sireId),ranges=breedingPreview(s,father,mother),fruit=BREEDING_FRUITS[mother.pregnancy.fruit||'none'];
      const child=createBird(s,fruit.sex?{sex:fruit.sex}:{},[father,mother]);
      mother.pregnancy=null;
      if(!child){
        report(s,'event','卵は、かえりませんでした',`${mother.name}の卵は、今回はかえりませんでした。また来年、がんばりましょう。`,{expression:'sad'});
        s.stage='running';continue;
      }
      report(s,'birth',`${mother.name}の子が生まれました`,observe(s,child),{birdId:child.id,expression:'overjoyed',geneticLottery:geneticLottery(child,ranges)});
      if(!s.milestones.birth)s.milestones.birth=s.week;
      s.stage='running';
    }
    if(date(s.week).week===1) {
      refreshMarket(s);
      const ids=own(s).filter(b=>b.role==='young'&&age(s,b)===2).map(b=>b.id);
      if(ids.length)report(s,'registration','競走羽登録',`今年は${ids.length}羽がデビューです。大きくなりましたね！`,{birdIds:ids,expression:'happy'});
    }
    if(date(s.week).week===5&&own(s).some(b=>b.role==='mare'))notes.push('繁殖牝羽セールが始まりました（3月第4週まで）。');
    // Short reactions only: race rows already show placings and prize money.
    const best=results.slice().sort((a,b)=>a.rank-b.rank)[0],mother=own(s).find(b=>b.pregnancy);
    const nursery=['子どもたちは平原を元気に走り回っています。','子どもたちは今日もよく食べて、よく眠っています。','子どもたちがギサールの野菜を取り合っていました。'],idle=['調教は順調です。','今週もしっかり調教しました。','みんな元気に過ごしています。'];
    const text=best?(best.rank===1?`${best.birdName}、勝ちました！`:best.rank<=3?`${best.birdName}は${best.rank}着。あと少しでしたね。`:`${best.birdName}は${best.rank}着でした。次に期待しましょう。`):
      mother?`${mother.name}の子に会えるまで、あと${mother.pregnancy.due-s.week}週です。`:
      own(s).some(b=>b.role==='young')?nursery[s.week%nursery.length]:idle[s.week%idle.length];
    report(s,'weekly',`${d.month}月 第${d.monthWeek}週`,text,{week:oldWeek,results,notes,change:s.money-balance,expression:results.some(r=>r.rank===1)?'happy':'talk'});
    return {week:oldWeek,results,change:s.money-balance};
  }
  function validState(s) {
    if(s?.naming!==undefined){try{const checked=namingSettings(s.naming);if(Object.keys(DEFAULT_NAMING).some(k=>checked[k]!==s.naming[k]))return false;}catch{return false;}}
    const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
    if(!s||s.version!==VERSION||!Number.isInteger(s.week)||s.week<9||!Number.isInteger(s.serial)||s.serial<1||!Number.isInteger(s.rng)||!finite(s.money,0,1e15)||!finite(s.debt,0,1e15)||!['buy','breed','grow','running'].includes(s.stage)||!['easy','normal','hard'].includes(s.difficulty))return false;
    if(s.geneticsVersion!==undefined&&![1,Genetics.VERSION].includes(s.geneticsVersion))return false;
    if(s.worldVersion!==undefined&&s.worldVersion!==1)return false;
    if(s.breedingVersion!==undefined&&s.breedingVersion!==Breeding.VERSION)return false;
    if(!Array.isArray(s.birds)||!s.birds.every(b=>b&&((s.geneticsVersion===undefined&&b.genome?.traits===undefined)||
      (Genetics.valid(b.genome?.traits,{allowLegacyCourse:s.geneticsVersion!==Genetics.VERSION})&&b.color===Genetics.expressColor(b.genome.traits.body,b.genome.traits.gold)&&b.crest===b.genome.traits.crest))))return false;
    if(!s.facilities||!Object.entries(FACILITIES).every(([k,f])=>Number.isInteger(s.facilities[k])&&s.facilities[k]>=(['stalls','meadow'].includes(k)?1:0)&&s.facilities[k]<=(k==='lab'?3:f.max)))return false;
    if(!['birds','sale','reports','journal','ledger','awards','founderOffers'].every(k=>Array.isArray(s[k]))||!s.milestones||!Number.isInteger(s.marketYear)||!Number.isInteger(s.lastAnnual))return false;
    if(s.birds.length>50000||new Set(s.birds.map(b=>b.id)).size!==s.birds.length)return false;
    const byId=new Map(s.birds.map(b=>[b.id,b]));
    if(s.firstWins!==undefined&&(!s.firstWins||typeof s.firstWins!=='object'||Array.isArray(s.firstWins)||
      !Object.entries(s.firstWins).every(([key,r])=>(['win','graded','g3','g2','g1','derby'].includes(key)||key.startsWith('g1:')&&key.length<=100)&&
        r&&Number.isInteger(r.week)&&r.week>=9&&r.week<=s.week&&byId.has(r.birdId)&&
        typeof r.birdName==='string'&&r.birdName.length>0&&r.birdName.length<=40&&typeof r.raceName==='string'&&r.raceName.length<=100)))return false;
    if(!s.birds.every(b=>Array.isArray(b.parents)&&b.parents.length<=2&&b.parents.every(id=>id===null||byId.has(id))))return false;
    const visited=new Set(),active=new Set();
    for(const b of s.birds){
      const stack=[[b.id,false]];
      while(stack.length){const [id,done]=stack.pop();if(done){active.delete(id);visited.add(id);continue;}
        if(active.has(id))return false;if(visited.has(id))continue;active.add(id);stack.push([id,true]);
        for(const parent of byId.get(id).parents)if(parent!==null)stack.push([parent,false]);
      }
    }
    if(!s.birds.every(b=>b.genome&&(s.breedingVersion===undefined&&b.genome.defects===undefined||Breeding.validDefects(b.genome,DEFECTS))&&
      (s.breedingVersion===undefined&&b.genome.character===undefined||Object.keys(PERSONALITY).every(k=>Array.isArray(b.genome.character?.[k])&&b.genome.character[k].length===2&&b.genome.character[k].every(v=>finite(v,50,150))))))return false;
    const scores=(x,keys)=>x&&keys.every(k=>finite(x[k],50,150));
    const schedule=plans=>plans===undefined||plans&&typeof plans==='object'&&!Array.isArray(plans)&&Object.keys(plans).length<=8&&Object.entries(plans).every(([week,p])=>
      /^\d+$/.test(week)&&Number.isSafeInteger(Number(week))&&Number(week)>=s.week&&Number(week)<s.week+8&&p&&['training','rest','race'].includes(p.mode)&&
      (p.mode!=='training'||Object.hasOwn(TRAINING_MENUS,p.menu))&&(p.mode!=='race'||typeof p.eventId==='string'&&calendar(Number(week)).some(e=>e.id===p.eventId)));
    const record=r=>r&&typeof r.name==='string'&&Number.isInteger(r.week)&&Number.isInteger(r.year)&&finite(r.rank,1,12)&&finite(r.time,0,900)&&finite(r.reward,0,1e15)&&['prize','allowance','fee'].every(k=>r[k]===undefined||finite(r[k],0,1e15))&&finite(r.distance,100,10000)&&['turf','dirt'].includes(r.surface)&&typeof r.level==='string'&&Array.isArray(r.field)&&r.field.every(x=>x&&typeof x.name==='string'&&typeof x.id==='string'&&finite(x.time,0,900))&&(r.replay===undefined||Replay.valid(r.replay,r));
    if(!s.birds.every(b=>b&&/^bird-\d+$/.test(b.id)&&typeof b.name==='string'&&b.name.length<=40&&(b.farm===undefined||typeof b.farm==='string'&&b.farm.length<=40)&&(b.season===undefined||Number.isInteger(b.season))&&(b.worldGroup===undefined||typeof b.worldGroup==='string')&&['M','F'].includes(b.sex)&&['player','sale','public','source','archive','npc'].includes(b.owner)&&['young','racing','mare','stud','retired','archived'].includes(b.role)&&['root','founder','home','general'].includes(b.kind)&&Number.isInteger(b.birthYear)&&Number.isInteger(b.bornWeek)&&
      scores(b.potential,Mapping.ABILITIES.map(a=>a.key))&&scores(b.personality,Object.keys(PERSONALITY))&&scores(b.inborn,Object.keys(PERSONALITY))&&scores(b.management,Object.keys(MANAGEMENT))&&b.training&&Mapping.ABILITIES.every(a=>finite(b.training[a.key],0,1))&&schedule(b.schedule)&&finite(b.condition,0,100)&&finite(b.strain,0,100)&&finite(b.health,0,100)&&['steady','challenge'].includes(b.policy)&&['meadow','forest'].includes(b.pasture)&&['early','normal','late'].includes(b.growth)&&Object.hasOwn(Genetics.COLORS,b.color)&&typeof b.registered==='boolean'&&['races','wins','g1','graded','earnings','fans','bredYear'].every(k=>finite(b[k],0,1e15))&&Number.isInteger(b.lastRace)&&Array.isArray(b.records)&&b.records.every(record)&&Array.isArray(b.titles)&&b.titles.every(t=>typeof t==='string')&&
      b.genome&&['distance','release'].every(k=>Array.isArray(b.genome[k])&&b.genome[k].length===2&&b.genome[k].every(x=>finite(x,-1,1)))&&[...Mapping.ABILITIES.map(a=>a.key),...Object.keys(MANAGEMENT)].every(k=>Array.isArray(b.genome.quality?.[k])&&b.genome.quality[k].length===32&&b.genome.quality[k].every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>x===0||x===1)))&&
      (b.pregnancy===null||(b.sex==='F'&&b.role==='mare'&&Number.isInteger(b.pregnancy.due)&&b.pregnancy.due>s.week&&(b.pregnancy.fruit===undefined||Object.hasOwn(BREEDING_FRUITS,b.pregnancy.fruit))&&s.birds.some(p=>p.id===b.pregnancy.sireId&&p.sex==='M')))))return false;
    const lotteryKeys=[...Mapping.ABILITIES.map(a=>a.key),...Object.keys(MANAGEMENT),...Object.keys(PERSONALITY),...Object.keys(Genetics.APTITUDES),...Object.keys(Genetics.DEVELOPMENT)];
    // Earlier hatch reports retain their original 23-row snapshot after upgrade.
    const validLottery=rows=>rows&&typeof rows==='object'&&!Array.isArray(rows)&&
      [lotteryKeys,lotteryKeys.filter(key=>!Object.hasOwn(Genetics.COURSE_APTITUDES,key))].some(keys=>Object.keys(rows).length===keys.length&&keys.every(key=>{
      const row=rows[key];
      return row&&['min','max','value'].every(k=>Number.isFinite(row[k]))&&row.min<=row.max&&row.value>=row.min-1e-8&&row.value<=row.max+1e-8;
    }));
    const validReport=r=>r&&/^report-\d+$/.test(r.id)&&Number.isInteger(r.week)&&typeof r.title==='string'&&typeof r.text==='string'&&['talk','neutral','happy','overjoyed','sad','motivated','disappointed','ambiguous-smile'].includes(r.expression)&&['weekly','monthly','annual','birth','event','registration','founder'].includes(r.type)&&
      (!['birth','founder'].includes(r.type)||!!bird(s,r.birdId))&&(r.type!=='registration'||Array.isArray(r.birdIds)&&r.birdIds.every(id=>bird(s,id)))&&
      (r.geneticLottery===undefined||r.type==='birth'&&validLottery(r.geneticLottery))&&
      (r.results===undefined||Array.isArray(r.results)&&r.results.every(x=>record(x)&&bird(s,x.birdId)&&typeof x.birdName==='string'))&&(r.notes===undefined||Array.isArray(r.notes)&&r.notes.every(x=>typeof x==='string'))&&['income','expense','change'].every(k=>r[k]===undefined||Number.isFinite(r[k]));
    if(!s.reports.every(validReport)||!s.journal.every(validReport))return false;
    return s.ledger.every(l=>l&&Number.isInteger(l.week)&&Number.isFinite(l.amount)&&typeof l.note==='string')&&s.awards.every(a=>a&&Number.isInteger(a.year)&&typeof a.title==='string'&&typeof a.name==='string'&&bird(s,a.birdId))&&s.sale.every(id=>bird(s,id))&&s.founderOffers.every(id=>bird(s,id))&&racingCount(s)<=capacity(s).racing&&['mare','stud'].every(role=>own(s).filter(b=>b.role===role).length<=capacity(s)[role]);
  }
  // Full pedigrees retain more birds. Pack binary loci and repeated race fields
  // only at the storage boundary; the simulation always uses ordinary arrays.
  function serializeState(s) {
    const fields=[],indices=new Map(),replays=[],replayIndices=new Map(),pack=loci=>loci.map(p=>p[0]*2+p[1]).join('');
    // Identity avoids serializing the same shared value repeatedly. Content
    // deduplication still handles equal but independent copies from old saves.
    // These maps are discarded after each full save, so later edits are included.
    const fieldObjects=new Map(),replayObjects=new Map();
    const intern=(value,objects,byContent,values)=>{
      if(objects.has(value))return objects.get(value);
      const key=JSON.stringify(value);let index=byContent.get(key);
      if(index===undefined){index=values.length;byContent.set(key,index);values.push(value);}
      objects.set(value,index);return index;
    };
    const record=r=>{
      const result={...r,field:intern(r.field,fieldObjects,indices,fields)};
      if(r.replay)result.replay=intern(r.replay,replayObjects,replayIndices,replays);
      return result;
    };
    const birds=s.birds.map(b=>({...b,genome:{...b.genome,
      quality:Object.fromEntries(Object.entries(b.genome.quality).map(([k,p])=>[k,pack(p)])),
      defects:Object.fromEntries(Object.entries(b.genome.defects||{}).map(([k,p])=>[k,pack(p)]))},records:b.records.map(record)}));
    const packReports=reports=>reports.map(r=>({...r,...(r.results?{results:r.results.map(record)}:{})}));
    return JSON.stringify({...s,birds,reports:packReports(s.reports),journal:packReports(s.journal),packedGenomes:1,raceFields:fields,raceReplays:replays});
  }
  function deserializeState(raw) {
    const s=JSON.parse(raw);
    if(s?.packedGenomes===undefined)return s;
    if(s.packedGenomes!==1||!Array.isArray(s.raceFields)||!Array.isArray(s.birds))throw Error('invalid packed save');
    const unpack=(value,length)=>{
      if(typeof value!=='string'||value.length!==length||/[^0-3]/.test(value))throw Error('invalid packed genes');
      return [...value].map(c=>[Number(c)>>1,Number(c)&1]);
    };
    const unpackRecord=r=>{
      if(Number.isInteger(r.field)){if(!Array.isArray(s.raceFields[r.field]))throw Error('invalid race field');r.field=s.raceFields[r.field].map(x=>({...x}));}
      else if(!Array.isArray(r.field))throw Error('invalid race field');
      if(r.replay!==undefined){if(!Number.isInteger(r.replay)||!s.raceReplays?.[r.replay])throw Error('invalid race replay');r.replay=s.raceReplays[r.replay];}
    };
    for(const b of s.birds){
      b.genome.quality=Object.fromEntries(Object.entries(b.genome.quality).map(([k,p])=>[k,unpack(p,32)]));
      b.genome.defects=Object.fromEntries(Object.entries(b.genome.defects).map(([k,p])=>[k,unpack(p,Breeding.DEFECT_LOCI)]));
      for(const r of b.records)unpackRecord(r);
    }
    for(const report of [...(s.reports||[]),...(s.journal||[])])for(const r of report.results||[])unpackRecord(r);
    delete s.packedGenomes;delete s.raceFields;delete s.raceReplays;return s;
  }
  return {worldHistory,raceOutlook,geneticTraitRating,paternalRoot,lineageFounder,BREEDING_FRUITS,breedingCost,Names,DEFAULT_NAMING,namingSettings,unavailableNames,breedingExpectation,breedingPreview,breedingOpen,abilityProgress,TRAINING_MENUS,raceOptions,setSchedule,weeklyPlan,upcomingSchedule,validBirdName,generatedName,crossRisk,crossReason,constitution,serializeState,deserializeState,Breeding,DEFECTS,DEFECT_LABELS,pedigree,breedingCrosses,crossPlan,createBird,worldRoster,calendar,g1Points,pedigreeBonus,rating,geneticRating,geneticEffectRating,geneticBreakdown,geneticScores,profile,farmName,MAJOR_FARMS,searchSires,marePrice,VERSION,SAVE_KEY,YEAR,GESTATION,PERSONALITY,MANAGEMENT,FACILITIES,ROOTS,TITLES,EIGHT,Mapping,Genetics,Ground,date,when,initial,refreshRoots,upgradeState,own,bird,age,capacity,racingCount,labLevel,quality,saleOpen,sires,studFee,breedFee,buy,sellMareReason,sellMare,releaseStudReason,releaseStud,breedingReason,breed,observe,currentAbilities,facilityCost,facilityReason,build,setPasture,setPolicy,rename,retire,classFor,nextRace,eligible,simulateBird,simulateField,race,founderEligible,promote,acknowledge,advance,validState};
});
