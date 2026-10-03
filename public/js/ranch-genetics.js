/* Inherited surface, course, development and feather traits for the v4 ranch. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RanchGenetics=api;
})(globalThis,function(){
  'use strict';
  const VERSION=2;
  const SURFACE_APTITUDES={turf:'芝適性',dirt:'ダート適性',lowCushion:'低クッション適性',highCushion:'高クッション適性'};
  const COURSE_APTITUDES={rightTurn:'右回り適性',leftTurn:'左回り適性',straight:'直線適性'};
  const APTITUDES={...SURFACE_APTITUDES,...COURSE_APTITUDES};
  const DEVELOPMENT={earlyGrowth:'早い成長',lateDecline:'遅い衰え始め',slowDecline:'緩やかな衰え'};
  const COLORS={yellow:'黄',red:'赤',blue:'青',green:'緑',rose:'ピンク',white:'白',black:'黒',purple:'紫',gray:'灰',golden:'金'};
  const CRESTS={yellow:'黄',red:'赤',blue:'青',white:'白',black:'黒',rainbow:'虹'};
  // User's explicit order takes precedence over the original game's white > black.
  const DOMINANCE={yellow:0,red:1,blue:1,green:2,rose:2,white:3,black:4};
  const GOLD_MUTATION_RATE=1/2000;
  const mean=pair=>(pair[0]+pair[1])/2;
  // Course aptitude is centered on ordinary (=100), with no weak straight grade.
  const courseRating=score=>score<65?'X':score<90?'△':score<=110?'◯':score<140?'◎':'☆';
  const pick=(items,random)=>items[Math.floor(random()*items.length)];
  const pairs=(labels,value=.5)=>Object.fromEntries(Object.keys(labels).map(key=>[key,[value,value]]));
  function basePair(color){
    return color==='purple'?['red','blue']:color==='gray'?['green','rose']:color==='golden'?['yellow','yellow']:[color,color];
  }
  function expressColor(body,gold){
    if(gold.every(a=>a==='G'))return null; // Embryonic lethal, never a living bird.
    if(gold.includes('G'))return 'golden';
    const [a,b]=body;
    if(a!==b&&DOMINANCE[a]===DOMINANCE[b])return DOMINANCE[a]===2?'gray':'purple';
    return DOMINANCE[a]>=DOMINANCE[b]?a:b;
  }
  function legacy(b){
    const maturity={early:1,normal:.5,late:0}[b.growth]??.5;
    return {aptitude:pairs(APTITUDES),development:{earlyGrowth:[maturity,maturity],lateDecline:[.5,.5],slowDecline:[.5,.5]},
      body:basePair(b.color||'yellow'),gold:b.color==='golden'?['G','g']:['g','g'],crest:'yellow'};
  }
  function generate(random,parents=null){
    if(parents){
      // Each pair receives exactly one allele from each parent.
      const aptitude=Object.fromEntries(Object.keys(APTITUDES).map(key=>[key,parents.map(p=>pick(p.aptitude[key],random))]));
      const development=Object.fromEntries(Object.keys(DEVELOPMENT).map(key=>[key,parents.map(p=>pick(p.development[key],random))]));
      const body=parents.map(p=>pick(p.body,random)),gold=parents.map(p=>pick(p.gold,random));
      // A single rare de novo mutation; no repeated expression lottery on reload.
      if(!gold.includes('G')&&random()<GOLD_MUTATION_RATE)gold[random()<.5?0:1]='G';
      return {aptitude,development,body,gold,crest:pick(parents,random).crest};
    }
    const alleles=key=>key==='straight'?[.5,.5,.5,.5,.5,.5,.5,1]:Object.hasOwn(COURSE_APTITUDES,key)?[0,.5,.5,.5,.5,.5,.5,1]:[0,.5,1];
    return {aptitude:Object.fromEntries(Object.keys(APTITUDES).map(key=>[key,[pick(alleles(key),random),pick(alleles(key),random)]])),
      development:Object.fromEntries(Object.keys(DEVELOPMENT).map(key=>[key,[pick([0,.5,1],random),pick([0,.5,1],random)]])),
      body:[pick(['yellow','yellow','red','blue','green','rose','white','black'],random),pick(Object.keys(DOMINANCE),random)],gold:['g','g'],crest:pick(Object.keys(CRESTS),random)};
  }
  function growth(g){
    return {maturityYears:4.5-2*mean(g.development.earlyGrowth),declineStart:5.5+3*mean(g.development.lateDecline),declineRate:.10-.08*mean(g.development.slowDecline)};
  }
  function growthLabel(g){const years=growth(g).maturityYears;return years<=3?'early':years>=4?'late':'normal';}
  function valid(g,{allowLethal=false,allowLegacyCourse=false}={}){
    const pair=(p,test)=>Array.isArray(p)&&p.length===2&&p.every(test);
    return !!g&&Object.keys(APTITUDES).every(k=>(allowLegacyCourse&&Object.hasOwn(COURSE_APTITUDES,k)&&g.aptitude?.[k]===undefined)||
      pair(g.aptitude?.[k],x=>Number.isFinite(x)&&x>=(k==='straight'?.5:0)&&x<=1))&&
      Object.keys(DEVELOPMENT).every(k=>pair(g.development?.[k],x=>Number.isFinite(x)&&x>=0&&x<=1))&&
      pair(g.body,x=>Object.hasOwn(DOMINANCE,x))&&pair(g.gold,x=>x==='G'||x==='g')&&Object.hasOwn(CRESTS,g.crest)&&
      (allowLethal||expressColor(g.body,g.gold)!==null);
  }
  const ROOT_BODY=[['yellow','yellow'],['red','yellow'],['blue','yellow'],['green','yellow'],['rose','red'],['white','blue'],['black','yellow'],['red','blue'],
    ['green','rose'],['yellow','yellow'],['red','red'],['blue','blue'],['green','green'],['rose','rose'],['white','white'],['black','black'],
    ['yellow','yellow'],['red','blue'],['blue','yellow'],['green','rose'],['yellow','red'],['white','green'],['black','blue'],['red','red'],
    ['green','yellow'],['rose','yellow'],['white','rose'],['black','white'],['red','blue'],['green','rose'],['white','yellow'],['black','rose']];
  // right / left / straight: .5 is ordinary; straight has no unfavorable allele.
  // Corner donors favor endurance, economy and calm intelligence; straight donors
  // are a minority of sprinters/closers. Order follows the stable 32 lineages.
  const ROOT_COURSE=[
    [0,.5,1],[.5,.5,1],[1,1,.5],[1,.5,.5],
    [.5,0,1],[.5,.5,.5],[.5,1,.5],[.5,.5,.5],
    [.5,.5,.5],[1,.5,.5],[0,.5,.5],[.5,0,.5],
    [1,1,.5],[1,1,.5],[.5,1,.5],[0,0,.5],
    [.5,.5,1],[.5,.5,.5],[.5,.5,.5],[.5,.5,.5],
    [.5,.5,.5],[1,1,.5],[.5,.5,1],[.5,.5,.5],
    [1,.5,.5],[.5,1,.5],[.5,.5,1],[.5,.5,1],
    [1,.5,.5],[.5,1,.5],[.5,.5,1],[0,0,.5],
  ];
  function source(index){
    const surface=index%2?'dirt':'turf',cushion=Math.floor(index/2)%2?'highCushion':'lowCushion';
    const aptitude=pairs(SURFACE_APTITUDES,.25);aptitude[surface]=[1,1];aptitude[cushion]=[1,1];
    Object.keys(COURSE_APTITUDES).forEach((key,i)=>aptitude[key]=Array(2).fill(ROOT_COURSE[index][i]));
    const development=pairs(DEVELOPMENT),focus=Object.keys(DEVELOPMENT)[Math.floor(index/4)%4];
    if(focus)development[focus]=[1,1];
    return {aptitude,development,body:[...ROOT_BODY[index]],gold:index===20?['G','g']:['g','g'],crest:Object.keys(CRESTS)[index%6]};
  }
  const strengths=g=>[...Object.keys(APTITUDES).filter(k=>mean(g.aptitude[k])>=.75),...Object.keys(DEVELOPMENT).filter(k=>mean(g.development[k])>=.75)];
  return {VERSION,SURFACE_APTITUDES,COURSE_APTITUDES,APTITUDES,DEVELOPMENT,COLORS,CRESTS,DOMINANCE,GOLD_MUTATION_RATE,mean,courseRating,expressColor,legacy,generate,growth,growthLabel,valid,source,strengths};
});
