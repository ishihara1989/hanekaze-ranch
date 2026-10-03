/* Four-frame idle sprites. Feather colors are applied once per frame and cached. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RanchPortraits=api;
})(globalThis,function(){
  'use strict';
  const DIRECTORY='/assets/chocobo-portraits/';
  const SPRITE={columns:2,rows:2,frames:4,cellSize:512};
  const COLORS={yellow:[239,197,67],red:[207,82,64],blue:[87,157,212],green:[112,167,83],rose:[228,142,173],white:[246,244,237],black:[61,65,78],purple:[151,112,191],gray:[156,165,176],golden:[227,172,39]};
  const LABELS={yellow:'黄',red:'赤',blue:'青',green:'緑',rose:'ピンク',white:'白',black:'黒',purple:'紫',gray:'灰',golden:'金',rainbow:'虹'};
  // Same six hues and plume direction as the running and podium sprites.
  const RAINBOW=[[224,71,79],[240,154,58],[242,210,74],[108,194,106],[77,158,224],[155,111,214]];
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
    return `<span class="chocobo-art chocobo-portrait" role="img" aria-label="${label}" data-portrait-stage="${a.stage}" data-portrait-color="${a.color}" data-portrait-crest="${a.crest}"><span class="chocobo-portrait-shadow" aria-hidden="true"></span><span class="chocobo-portrait-frame" aria-hidden="true"><img class="chocobo-portrait-image" alt="" hidden></span><span class="chocobo-portrait-loading" aria-hidden="true">羽を整えています…</span></span>`;
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
  function recolor(data,width,height,color,crest,stage,footTop=height){
    let crestTop=height,crestBottom=0,crestLeft=width,crestRight=0;
    if(stage==='adult')for(let i=0;i<data.length;i+=4){
      // Nearly transparent generation speckles must not stretch the gradient
      // across the whole bird and squeeze every visible feather into red/orange.
      if(data[i+3]>=128&&data[i]-data[i+1]>35&&data[i+2]-data[i+1]>20){
        const x=i/4%width,y=Math.floor(i/4/width);
        crestLeft=Math.min(crestLeft,x);crestRight=Math.max(crestRight,x);
        crestTop=Math.min(crestTop,y);crestBottom=Math.max(crestBottom,y);
      }
    }
    const body=COLORS[validColor(color)];
    for(let i=0;i<data.length;i+=4){
      if(!data[i+3])continue;
      const r=data[i],g=data[i+1],b=data[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b),luma=.2126*r+.7152*g+.0722*b;
      const forehead=stage==='adult'&&r-g>35&&b-g>20;
      const neutral=Math.floor(i/4/width)>=footTop?0:clamp((.19-(max-min)/Math.max(1,max))/.08)*clamp((luma-45)/45);
      if(!forehead&&!neutral)continue;
      const rainbowPosition=crestRight>crestLeft?(crestRight-i/4%width)/(crestRight-crestLeft):
        (Math.floor(i/4/width)-crestTop)/Math.max(1,crestBottom-crestTop);
      const target=forehead?(crest==='rainbow'?rainbowAt(rainbowPosition):COLORS[validColor(crest)]):body;
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
  function frameBounds(data,width,height){
    let left=width,right=0,top=height,bottom=0,footLeft=width,footRight=0,footTop=height;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      if(data[i+3]<128)continue;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(left>right)throw Error('Empty portrait frame');
    // Look below the character's belly, rather than below a fixed canvas row:
    // the chick's large beak must not be mistaken for a bare amber foot.
    for(let y=Math.ceil(top+(bottom-top)*.72);y<=bottom;y++)for(let x=left;x<=right;x++){
      const i=(y*width+x)*4;
      if(data[i+3]>=128&&data[i]>100&&data[i+1]>50&&data[i]>data[i+1]*1.15&&data[i+1]-data[i+2]>30){
        footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);footTop=Math.min(footTop,y);
      }
    }
    return {left,right,top,bottom,footTop,footX:footLeft<=footRight?(footLeft+footRight)/2:(left+right)/2};
  }
  function registration(bounds,size){
    const left=Math.max(...bounds.map(b=>b.footX-b.left)),right=Math.max(...bounds.map(b=>b.right-b.footX));
    const height=Math.max(...bounds.map(b=>b.bottom-b.top));
    const scale=Math.min(size*.82/(left+right),size*.82/height);
    const footX=size/2+(left-right)*scale/2;
    return bounds.map(b=>({x:footX-b.footX*scale,y:size*.9-b.bottom*scale,scale}));
  }
  function spriteCells(stage,width,height){
    // Adult tail tips extend a little beyond the nominal middle column;
    // the actual transparent gutter is at x=660 in its 1254px source.
    const split=height/2,column=stage==='adult'?Math.round(width*660/1254):width/2;
    return Array.from({length:4},(_,frame)=>({x:frame%2?column:0,y:frame<2?0:split,
      width:frame%2?width-column:column,height:frame<2?split:height-split}));
  }
  function prepareSprite(img,stage){
    const size=SPRITE.cellSize,cells=spriteCells(stage,img.naturalWidth,img.naturalHeight);
    const tile=document.createElement('canvas');tile.width=Math.max(...cells.map(c=>c.width));tile.height=Math.max(...cells.map(c=>c.height));
    const t=tile.getContext('2d',{willReadFrequently:true});
    if(!t)throw Error('Canvas 2D unavailable');
    const bounds=[];
    for(const c of cells){
      t.clearRect(0,0,tile.width,tile.height);
      t.drawImage(img,c.x,c.y,c.width,c.height,0,0,c.width,c.height);
      bounds.push(frameBounds(t.getImageData(0,0,c.width,c.height).data,c.width,c.height));
    }
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size*2;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D unavailable');
    registration(bounds,size).forEach(({x,y,scale},frame)=>{
      const cx=frame%2*size,cy=Math.floor(frame/2)*size,c=cells[frame];
      ctx.save();ctx.beginPath();ctx.rect(cx,cy,size,size);ctx.clip();
      ctx.drawImage(img,c.x,c.y,c.width,c.height,cx+x,cy+y,c.width*scale,c.height*scale);
      ctx.restore();
    });
    return canvas;
  }
  function source(stage){
    if(!sources.has(stage))sources.set(stage,new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>{try{resolve(prepareSprite(img,stage));}catch(error){sources.delete(stage);reject(error);}};
      img.onerror=()=>{sources.delete(stage);reject(Error('Portrait unavailable: '+stage));};img.src=DIRECTORY+stage+'-idle-v3.png';
    }));
    return sources.get(stage);
  }
  function variant(stage,color,crest){
    const key=[stage,color,crest].join(':');
    if(!variants.has(key))variants.set(key,source(stage).then(img=>{
      const canvas=document.createElement('canvas'),size=SPRITE.cellSize;
      canvas.width=size*SPRITE.columns;canvas.height=size*SPRITE.rows;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas 2D unavailable');
      // Each frame has its own forehead bounds, so rainbow colors follow the
      // moving plume rather than running across both rows of the sprite sheet.
      const sw=img.width/SPRITE.columns,sh=img.height/SPRITE.rows;
      for(let frame=0;frame<SPRITE.frames;frame++){
        const x=frame%SPRITE.columns,y=Math.floor(frame/SPRITE.columns);
        ctx.drawImage(img,x*sw,y*sh,sw,sh,x*size,y*size,size,size);
        const pixels=ctx.getImageData(x*size,y*size,size,size);
        // Ivory claws belong to the fixed foot region, even when nearly white.
        recolor(pixels.data,size,size,color,crest,stage,frameBounds(pixels.data,size,size).footTop);
        ctx.putImageData(pixels,x*size,y*size);
      }
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
        img.src=url;await img.decode();
        if(!node.isConnected)return;
        img.hidden=false;status.hidden=true;node.dataset.portraitReady='true';
      }catch(error){
        if(node.isConnected){status.textContent='画像を読み込めませんでした';node.dataset.portraitReady='error';}
        console.error(error);
      }
    }));
  }
  return {COLORS,SPRITE,stageFor,appearance,markup,recolor,frameBounds,registration,spriteCells,hydrate};
});
