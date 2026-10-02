/* Recessive defects and first-cross mutations, shared by every ranch. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RanchBreeding=api;
})(globalThis,function(){
  'use strict';
  const VERSION=1,DEPTH=5,MAX_CROSS_BLOOD=3/8,DEFECT_LOCI=4,DEFECT_STEP=2;
  const TARGETS=['speed','power','cardio','legs','reserve','economy','start','resilience','robustness','recovery','grit','drive','wisdom','control','crowd','fight','frailty','temper'];
  const SPECIAL={frailty:{robustness:1,recovery:1},temper:{control:1,crowd:1}};
  const effects=key=>SPECIAL[key]||{[key]:1};
  const empty=()=>Array.from({length:DEFECT_LOCI},()=>[0,0]); // 0=A (healthy), 1=a.
  const expressed=pair=>pair[0]===1&&pair[1]===1;
  function catalog(roots){
    return Object.fromEntries(roots.flatMap((p,i)=>{
      const avoid=new Set([p.primary,p.secondary]);
      const choices=TARGETS.filter(k=>Object.keys(effects(k)).every(t=>!avoid.has(t)));
      const special=i%8===6?'frailty':i%8===7?'temper':null;
      const weakness=choices.includes(special)?special:choices[(i+5)%choices.length];
      const alternatives=choices.filter(k=>k!==weakness),carrier=alternatives[(i+6)%alternatives.length];
      return [[`${p.lineage}-weak`,{trait:weakness,source:p.lineage,carrier:false}],
        [`${p.lineage}-latent`,{trait:carrier,source:p.lineage,carrier:true}]];
    }));
  }
  function sourceDefects(lineage,definitions){
    return Object.fromEntries(Object.entries(definitions).filter(([,d])=>d.source===lineage)
      .map(([id,d])=>[id,Array.from({length:DEFECT_LOCI},()=>d.carrier?[0,1]:[1,1])]));
  }
  function inheritDefects(parents,random){
    const result={};
    for(const id of new Set(parents.flatMap(p=>Object.keys(p.genome.defects||{})))){
      const loci=Array.from({length:DEFECT_LOCI},(_,i)=>parents.map(p=>(p.genome.defects?.[id]?.[i]||[0,0])[random()<.5?0:1]));
      if(loci.some(p=>p.includes(1)))result[id]=loci;
    }
    return result;
  }
  function defectSummary(g,definitions){
    return Object.entries(g.defects||{}).map(([id,loci])=>({id,...definitions[id],
      active:loci.filter(expressed).length,carried:loci.filter(p=>p[0]!==p[1]).length}));
  }
  function penalties(g,definitions){
    const result={};
    for(const d of defectSummary(g,definitions))for(const [key,weight] of Object.entries(effects(d.trait)))
      result[key]=(result[key]||0)+d.active*DEFECT_STEP*weight;
    return result;
  }
  function validDefects(g,definitions){
    return !!g.defects&&typeof g.defects==='object'&&!Array.isArray(g.defects)&&Object.entries(g.defects).every(([id,loci])=>
      Object.hasOwn(definitions,id)&&Array.isArray(loci)&&loci.length===DEFECT_LOCI&&loci.every(p=>Array.isArray(p)&&p.length===2&&p.every(a=>a===0||a===1)));
  }
  function pedigree(parents,lookup,depth=DEPTH){
    const rows=[];
    function visit(id,path,ancestors){
      if(path.length>depth)return;
      const b=lookup(id);
      rows.push({id:b?.id||null,name:b?.name||'不明',depth:path.length,path,ancestors});
      if(!b||ancestors.includes(b.id))return;
      for(let i=0;i<2;i++)if(b.parents.length)visit(b.parents[i],path+String(i),[...ancestors,b.id]);
    }
    parents.forEach((p,i)=>visit(p?.id||p,String(i),[]));
    return rows;
  }
  function crosses(parents,lookup,depth=DEPTH){
    const groups=new Map();
    for(const row of pedigree(parents,lookup,depth))if(row.id){
      if(!groups.has(row.id))groups.set(row.id,[]);
      groups.get(row.id).push(row);
    }
    const repeated=new Set([...groups].filter(([,rows])=>rows.length>1).map(([id])=>id));
    return [...groups].filter(([id])=>repeated.has(id)).flatMap(([id,rows])=>{
      // A target needs a path that reaches it before any other repeated bird.
      // An independent occurrence restores ALL positions (e.g. 4 x 4 x 5).
      if(!rows.some(row=>!row.ancestors.some(a=>repeated.has(a))))return [];
      const positions=rows.map(r=>r.depth).sort((a,b)=>a-b),blood=positions.reduce((n,d)=>n+2**-d,0);
      return [{id,name:lookup(id).name,positions,blood,benefitRate:Math.min(1,blood*2),defectRate:Math.min(1,blood/2)}];
    }).sort((a,b)=>b.blood-a.blood||a.id.localeCompare(b.id));
  }
  function mutationPlan(crosses,lookup,strengths){
    const plan=new Map();
    function add(group,key,locus,value,rate){
      const id=`${group}:${key}:${locus}`,entry=plan.get(id)||{group,key,locus,value,rate:0};
      entry.rate=Math.min(1,entry.rate+rate);entry.value=Math.max(entry.value,value);plan.set(id,entry);
    }
    for(const cross of crosses){
      const b=lookup(cross.id),g=b.genome;
      for(const key of strengths(b)){
        if(g.quality[key])g.quality[key].forEach((pair,i)=>{if(pair.includes(1))add('quality',key,i,1,cross.blood*2);});
        if(g.character?.[key])add('character',key,0,Math.max(...g.character[key]),cross.blood*2);
      }
      for(const group of ['aptitude','development'])for(const [key,pair] of Object.entries(g.traits[group]))
        if((pair[0]+pair[1])/2>=.75)add(group,key,0,Math.max(...pair),cross.blood*2);
      for(const [key,loci] of Object.entries(g.defects||{}))loci.forEach((pair,i)=>{
        if(expressed(pair))add('defects',key,i,1,cross.blood/2);
      });
    }
    return [...plan.values()];
  }
  function mutate(g,plan,random){
    for(const p of plan){
      const group=['aptitude','development'].includes(p.group)?g.traits[p.group]:g[p.group];
      const loci=['quality','defects'].includes(p.group),pair=loci?group[p.key]?.[p.locus]:group[p.key];
      if(pair?.every(a=>a>=p.value))continue;
      if(random()>=p.rate)continue;
      if(loci){group[p.key]??=empty();group[p.key][p.locus]=[p.value,p.value];}
      else group[p.key]=pair.map(a=>Math.max(a,p.value));
    }
    return g;
  }
  return {VERSION,DEPTH,MAX_CROSS_BLOOD,DEFECT_LOCI,DEFECT_STEP,SPECIAL,catalog,sourceDefects,inheritDefects,defectSummary,penalties,validDefects,pedigree,crosses,mutationPlan,mutate};
});
