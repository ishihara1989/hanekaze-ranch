// Generated venue panoramas sit behind the shared code-drawn track.
// All track objects and runners share one projection; race timing is separate.
const mod=(v,n)=>((v%n)+n)%n;
const noise=seed=>mod(Math.sin(seed*12.9898+78.233)*43758.5453,1);
const THEMES=Object.freeze({
  temple:Object.freeze({key:'temple',dirt:false,sky:['#78b9cc','#d8eeee','#f6eed8'],apron:'#eef4e1',flag:'#769e96'}),
  jungle:Object.freeze({key:'jungle',dirt:false,sky:['#819f9b','#c9d8c0','#d4dfb5'],apron:'#a0ac78',flag:'#9d8053'}),
  ruins:Object.freeze({key:'ruins',dirt:false,sky:['#93b3c0','#d8e3df','#e3e8da'],apron:'#ccd5bb',flag:'#8194a0'}),
  city:Object.freeze({key:'city',dirt:true,sky:['#8cbed5','#dce4d6','#f6e3bd'],apron:'#d2c395',flag:'#955967',soil:['#d3b082','#cdA878','#c9a170','#c59b68','#c09966','#b99161']}),
  coast:Object.freeze({key:'coast',dirt:true,sky:['#7abdd7','#e0efe4','#f8e5c5'],apron:'#e1cda2',flag:'#477f87',soil:['#ddc19a','#d9ba8e','#d6b687','#d0af80','#caa879','#c6a171']}),
  mine:Object.freeze({key:'mine',dirt:true,sky:['#8ca9ba','#d1d6cb','#e6d2b2'],apron:'#b9ad8b',flag:'#79766a',soil:['#baa080','#b89a76','#b2956f','#ad8f69','#a98a65','#a48561']})
});
export function themeFor(track={},surface='turf'){
  if(surface!=='dirt')return track.id==='mitsurin'?THEMES.jungle:track.id==='iseki'?THEMES.ruins:THEMES.temple;
  return track.id==='sunahama'?THEMES.coast:track.id==='haikou'?THEMES.mine:THEMES.city;
}
export const BACKGROUNDS=Object.freeze(Object.fromEntries(['tenku','oukyu','mitsurin','sunahama','iseki','haikou'].map(id=>[id,`/assets/race-2d-backgrounds/${id}-v1.png`])));
const backdropImages=new Map();
export function loadBackdrop(track){
  const path=BACKGROUNDS[track.id];if(!path)return Promise.resolve(null);
  if(!backdropImages.has(path))backdropImages.set(path,new Promise(resolve=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{backdropImages.delete(path);resolve(null);};image.src=path;
  }));
  return backdropImages.get(path);
}
export function drawBackdropImage(ctx,view,image,pitch){
  const h=view.height,w=h*image.naturalWidth/image.naturalHeight,
    travel=globalThis.Race2DCourse.sceneryDistance(view.distance,pitch)*view.scale*.1*view.dir,
    first=Math.floor(travel/w)-1,last=first+Math.ceil(view.width/w)+2;
  // Alternating mirrored tiles join identical edge pixels, even for artwork
  // whose two original edges are not a perfect repeat.
  for(let tile=first;tile<=last;tile++){
    const x=tile*w-travel;ctx.save();ctx.translate(x+(mod(tile,2)?w:0),0);
    if(mod(tile,2))ctx.scale(-1,1);ctx.drawImage(image,0,0,w,h);ctx.restore();
  }
}
function polygon(ctx,points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
function clouds(ctx,view,travel){
  for(let layer=0;layer<2;layer++)for(let i=0;i<6;i++){
    const x=mod(i*259-view.dir*travel*(.16+layer*.12),view.width+360)-180,y=view.height*(.16+layer*.11)+Math.sin(i*2.7)*12;
    ctx.fillStyle=layer?'#fff7df85':'#ffffff65';ctx.beginPath();ctx.ellipse(x,y,110,14+layer*5,0,0,Math.PI*2);ctx.ellipse(x+35,y-9,57,21,0,0,Math.PI*2);ctx.fill();
  }
}
function hills(ctx,view,travel,rocky=false){
  for(let layer=0;layer<3;layer++){
    const base=view.height*(.49+layer*.035),shift=mod(-view.dir*travel*(.06+layer*.055),220);
    const points=[[-250,view.height*.65]];
    for(let i=-2;i<Math.ceil(view.width/110)+3;i++){
      const x=i*110+shift,peak=base-(rocky?75:28)-noise(i+layer*19)*(rocky?105:30);
      points.push([x,base],[x+53,peak],[x+110,base]);
    }
    points.push([view.width+300,view.height*.65]);polygon(ctx,points,rocky?['#adbcba','#92a49c','#748c80'][layer]:['#b9c7b0','#a7b99d','#91a688'][layer]);
  }
}
function palace(ctx,x,y,scale){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.fillStyle='#bba885';ctx.fillRect(-127,-82,254,82);ctx.fillStyle='#e2d3b0';ctx.fillRect(-111,-112,222,106);
  for(const side of [-1,1]){
    ctx.fillStyle='#c9ba99';ctx.fillRect(side*119-21,-144,42,144);ctx.fillStyle='#e9dcb9';ctx.fillRect(side*119-19,-144,10,139);
    polygon(ctx,[[side*119-31,-145],[side*119,-198],[side*119+31,-145]],'#687d84');
    ctx.fillStyle='#edcc83';ctx.fillRect(side*119-2,-211,4,15);
    ctx.fillStyle='#769293';ctx.fillRect(side*119-5,-126,10,22);
  }
  polygon(ctx,[[-130,-114],[0,-159],[130,-114]],'#7c8f87');ctx.strokeStyle='#e2c795';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#baaa89';ctx.fillRect(-38,-161,76,156);
  polygon(ctx,[[-48,-162],[0,-202],[48,-162]],'#6c8189');
  ctx.fillStyle='#f0d397';ctx.beginPath();ctx.arc(0,-139,8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#678079';ctx.beginPath();ctx.arc(0,-35,19,Math.PI,0);ctx.lineTo(19,-5);ctx.lineTo(-19,-5);ctx.fill();
  for(const side of [-1,1])for(let i=0;i<3;i++){
    ctx.fillStyle='#89978a';ctx.fillRect(side*(57+i*20)-4,-94,8,17);ctx.fillRect(side*(57+i*20)-4,-58,8,17);
  }
  ctx.fillStyle='#af9975';ctx.fillRect(-147,-6,294,9);ctx.restore();
}
function town(ctx,view,travel){
  const baseline=view.height*.565;
  for(let i=0;i<Math.ceil(view.width/95)+2;i++){
    const x=mod(i*101-view.dir*travel*.44,view.width+200)-100,height=34+noise(i)*28;
    ctx.fillStyle=i%2?'#c7b58c':'#d0bc96';ctx.fillRect(x,baseline-height,91,height);
    polygon(ctx,[[x-5,baseline-height],[x+44,baseline-height-29],[x+97,baseline-height]],i%2?'#91796b':'#9c8c72');
    ctx.fillStyle='#8c9b87';for(let j=0;j<3;j++)ctx.fillRect(x+15+j*23,baseline-height+12,8,12);
  }
  for(let i=0;i<3;i++){const x=mod(i*590-view.dir*travel*.24,view.width+600)-300;palace(ctx,x,baseline-8,.78);}
  // A lower promenade wall puts the palace behind the actual track rail.
  ctx.fillStyle='#bcac87';ctx.fillRect(0,baseline-7,view.width,32);ctx.fillStyle='#dfcfaa';ctx.fillRect(0,baseline-9,view.width,6);
  for(let i=-1;i<view.width/48+1;i++){
    const x=i*48-mod(view.dir*travel*.9,48);ctx.strokeStyle='#aa997b';ctx.lineWidth=1;ctx.strokeRect(x,baseline+7,47,15);
  }
}
function palm(ctx,x,y,size){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.strokeStyle='#9b7a51';ctx.lineWidth=7;
  ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(12,-41,6,-88);ctx.stroke();
  for(let i=0;i<7;i++){
    const angle=(i/6*Math.PI)-Math.PI*.08,side=i%2?1:-1;
    ctx.strokeStyle=i%2?'#527d62':'#678e65';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(6,-88);
    ctx.quadraticCurveTo(6+Math.cos(angle)*34,-94-Math.sin(angle)*23,6+side*(24+i*3),-68+i%3*8);ctx.stroke();
  }
  ctx.restore();
}
function coast(ctx,view,travel){
  const sea=view.height*.43,shore=view.height*.56;
  ctx.fillStyle='#86b6b9';ctx.fillRect(0,sea,view.width,shore-sea);
  for(let i=0;i<5;i++){
    const y=sea+12+i*13;ctx.strokeStyle=i%2?'#e4f0df90':'#b8d8cd';ctx.lineWidth=2;ctx.beginPath();
    for(let x=-80;x<view.width+80;x+=20){const py=y+Math.sin((x+view.dir*travel*.5)*.015+i)*2;if(x===-80)ctx.moveTo(x,py);else ctx.lineTo(x,py);}ctx.stroke();
  }
  polygon(ctx,[[0,shore-2],[view.width,shore-9],[view.width,view.height],[0,view.height]],'#e1cda2');
  for(let i=0;i<5;i++){const x=mod(i*321-view.dir*travel*.45,view.width+350)-175;palm(ctx,x,shore+12,i%2?.68:.9);}
  const boatX=mod(180-view.dir*travel*.09,view.width+150)-75;
  polygon(ctx,[[boatX-27,sea+42],[boatX+28,sea+42],[boatX+15,sea+52],[boatX-17,sea+52]],'#798b83');
  polygon(ctx,[[boatX,sea+10],[boatX,sea+40],[boatX+23,sea+40]],'#f5edd2');
}
function mine(ctx,view,travel){
  const baseline=view.height*.57;
  for(let i=0;i<4;i++){
    const x=mod(i*395-view.dir*travel*.39,view.width+420)-210;
    ctx.fillStyle='#8b8267';ctx.fillRect(x-47,baseline-58,94,58);
    polygon(ctx,[[x-58,baseline-57],[x,baseline-83],[x+57,baseline-57]],'#646f67');
    ctx.fillStyle='#4d625b';ctx.fillRect(x-24,baseline-35,48,35);
    ctx.strokeStyle='#79694f';ctx.lineWidth=5;
    for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(x+side*80,baseline);ctx.lineTo(x+side*60,baseline-113);ctx.stroke();}
    ctx.beginPath();ctx.moveTo(x-61,baseline-110);ctx.lineTo(x+61,baseline-110);ctx.moveTo(x-73,baseline-25);ctx.lineTo(x+63,baseline-99);ctx.stroke();
    ctx.fillStyle='#c8b48a';ctx.fillRect(x-74,baseline-116,148,8);
  }
}
export function drawDirtBackdrop(ctx,view,theme,pitch){
  const {width:w,height:h}=view,travel=view.distance*pitch;
  const sky=ctx.createLinearGradient(0,0,0,h);theme.sky.forEach((color,i)=>sky.addColorStop([0,.5,1][i],color));ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  clouds(ctx,view,travel);
  const sun=ctx.createRadialGradient(w*.76,h*.17,1,w*.76,h*.17,h*.44);sun.addColorStop(0,'#fff1c875');sun.addColorStop(1,'#fff1c800');ctx.fillStyle=sun;ctx.fillRect(0,0,w,h);
  if(theme.key==='coast'){coast(ctx,view,travel);return;}
  hills(ctx,view,travel,theme.key==='mine');
  ctx.fillStyle=theme.apron;ctx.fillRect(0,h*.56,w,h*.44);
  if(theme.key==='mine')mine(ctx,view,travel);else town(ctx,view,travel);
}
export function drawTrackTexture(viewer,view,theme,pitch){
  const ctx=viewer.ctx,reach=(view.width/view.scale+30)/view.pitch,
    {spacing:step,first:start,last:end}=globalThis.Race2DCourse.sceneryPattern(view.distance,reach,theme.dirt?2:3,pitch);
  if(theme.dirt){
    ctx.strokeStyle='#7f542c22';ctx.lineWidth=1;
    for(let lane=0;lane<12;lane++){viewer.path(view,lane,view.distance-reach,view.distance+reach);ctx.stroke();}
  }
  for(let i=start;i<=end;i++)for(let lane=0;lane<12;lane++){
    const seed=i*19+lane*73,n=noise(seed),d=i*step+n*.85/view.pitch,
      p=viewer.point(d,lane-.25+noise(seed+2)*.5,view),length=(theme.dirt?2:1.3)+n*3.5*pitch;
    if(p.x<-12||p.x>view.width+12)continue;
    ctx.strokeStyle=theme.dirt?(n>.65?'#f1d4a273':'#87643e5c'):(n>.65?'#d7ddb44b':'#58714745');ctx.lineWidth=n>.75?1.3:.8;
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-view.dir*length,p.y+.5);ctx.stroke();
    if(theme.dirt&&n>.83){ctx.fillStyle='#84664765';ctx.fillRect(p.x+2,p.y-1,1.5,1.2);}
  }
}
