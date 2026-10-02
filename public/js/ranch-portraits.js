/* Generated age portraits. Feather colors are applied once and cached, before display. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RanchPortraits=api;
})(globalThis,function(){
  'use strict';
  const DIRECTORY='/assets/chocobo-portraits/';
  const COLORS={yellow:[239,197,67],red:[207,82,64],blue:[87,157,212],green:[112,167,83],rose:[228,142,173],white:[246,244,237],black:[61,65,78],purple:[151,112,191],gray:[156,165,176],golden:[227,172,39]};
  const LABELS={yellow:'黄',red:'赤',blue:'青',green:'緑',rose:'ピンク',white:'白',black:'黒',purple:'紫',gray:'灰',golden:'金',rainbow:'虹'};
  const RAINBOW=[[226,83,91],[239,193,64],[98,174,96],[83,154,211],[166,106,198]];
  // A pale reflection band beside a darker gold band makes the feather relief
  // read as polished metal, while the deepest folds retain warm bronze shadows.
  const GOLD_STOPS=[[0,[55,27,7]],[.55,[130,72,12]],[.76,[201,137,24]],
    [.86,[237,192,66]],[.92,[255,246,196]],[.97,[235,191,62]],[1,[255,246,182]]];
  const sources=new Map(),variants=new Map();
  const stageFor=age=>age===null||age===undefined||age>=2?'adult':age>=1?'yearling':'chick';
  const validColor=value=>Object.hasOwn(COLORS,value)?value:'yellow';
  function appearance(b,age){
    const stage=stageFor(age),color=validColor(b.color);
    return {stage,color,crest:stage==='adult'?(b.crest==='rainbow'?'rainbow':validColor(b.crest)):color};
  }
  function markup(b,age){
    const a=appearance(b,age),label=`${a.stage==='adult'?'成羽':a.stage==='yearling'?'1歳の幼羽':'0歳のヒナ'}・羽色：${LABELS[a.color]}${a.stage==='adult'?` / 額羽：${LABELS[a.crest]}`:''}`;
    return `<span class="chocobo-art chocobo-portrait" role="img" aria-label="${label}" data-portrait-stage="${a.stage}" data-portrait-color="${a.color}" data-portrait-crest="${a.crest}"><span class="chocobo-portrait-shadow" aria-hidden="true"></span><img class="chocobo-portrait-image" alt="" aria-hidden="true" hidden><span class="chocobo-portrait-loading" aria-hidden="true">羽を整えています…</span></span>`;
  }
  const clamp=value=>Math.max(0,Math.min(1,value));
  function rainbowAt(t){
    const pos=clamp(t)*(RAINBOW.length-1),index=Math.min(RAINBOW.length-2,Math.floor(pos)),blend=pos-index;
    return RAINBOW[index].map((v,i)=>v+(RAINBOW[index+1][i]-v)*blend);
  }
  function metallicGold(shade){
    const t=clamp(shade),upper=GOLD_STOPS.findIndex(stop=>stop[0]>=t);
    if(upper<=0)return GOLD_STOPS[0][1];
    const [lo,a]=GOLD_STOPS[upper-1],[hi,b]=GOLD_STOPS[upper],blend=(t-lo)/(hi-lo);
    return a.map((v,i)=>v+(b[i]-v)*blend);
  }
  // Neutral feathers form the body mask, magenta forms the adult forehead mask.
  // Amber beak, bare legs, brown iris and dark eye pixels retain the source colors.
  function recolor(data,width,height,color,crest,stage){
    let crestTop=height,crestBottom=0;
    if(stage==='adult')for(let i=0;i<data.length;i+=4){
      if(data[i+3]&&data[i]-data[i+1]>35&&data[i+2]-data[i+1]>20){const y=Math.floor(i/4/width);crestTop=Math.min(crestTop,y);crestBottom=Math.max(crestBottom,y);}
    }
    const body=COLORS[validColor(color)];
    for(let i=0;i<data.length;i+=4){
      if(!data[i+3])continue;
      const r=data[i],g=data[i+1],b=data[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b),luma=.2126*r+.7152*g+.0722*b;
      const forehead=stage==='adult'&&r-g>35&&b-g>20;
      const neutral=clamp((.19-(max-min)/Math.max(1,max))/.08)*clamp((luma-45)/45);
      if(!forehead&&!neutral)continue;
      const target=forehead?(crest==='rainbow'?rainbowAt((Math.floor(i/4/width)-crestTop)/Math.max(1,crestBottom-crestTop)):COLORS[validColor(crest)]):body;
      const shade=forehead?clamp((max-25)/215):luma/255;
      const gold=!forehead&&color==='golden'?metallicGold(shade):null;
      for(let c=0;c<3;c++){
        const v=gold?gold[c]:target[c]*(.22+.78*shade);
        const weight=forehead?1:neutral;
        data[i+c]=Math.round(data[i+c]*(1-weight)+Math.min(255,v)*weight);
      }
    }
    return data;
  }
  function source(stage){
    if(!sources.has(stage))sources.set(stage,new Promise((resolve,reject)=>{
      const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{sources.delete(stage);reject(Error('Portrait unavailable: '+stage));};img.src=DIRECTORY+stage+'-v1.png';
    }));
    return sources.get(stage);
  }
  function variant(stage,color,crest){
    const key=[stage,color,crest].join(':');
    if(!variants.has(key))variants.set(key,source(stage).then(img=>{
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas 2D unavailable');
      // Fit the whole generated canvas; padding also protects the adult's tall plume.
      ctx.drawImage(img,20,20,472,472);
      const pixels=ctx.getImageData(0,0,512,512);recolor(pixels.data,512,512,color,crest,stage);ctx.putImageData(pixels,0,0);
      return canvas.toDataURL('image/png');
    }).catch(error=>{variants.delete(key);throw error;}));
    return variants.get(key);
  }
  function hydrate(container){
    return Promise.all([...container.querySelectorAll('[data-portrait-stage]')].map(async node=>{
      const {portraitStage:stage,portraitColor:color,portraitCrest:crest}=node.dataset;
      const img=node.querySelector('img'),status=node.querySelector('.chocobo-portrait-loading');
      try{
        const url=await variant(stage,color,crest);
        if(!node.isConnected)return;
        img.onload=()=>{img.hidden=false;status.hidden=true;node.dataset.portraitReady='true';};img.src=url;
      }catch(error){
        if(node.isConnected){status.textContent='画像を読み込めませんでした';node.dataset.portraitReady='error';}
        console.error(error);
      }
    }));
  }
  return {COLORS,stageFor,appearance,markup,recolor,hydrate};
});
