import { RacePlayback } from './race-playback.js';
import { themeFor, loadBackdrop, drawBackdropImage, drawDirtBackdrop, drawTrackTexture } from './race-2d-graphics.js';

const R=globalThis.RaceReplay,C=globalThis.Race2DCourse;
const directory='/assets/chocobo-sprite-study/v5/';
const mod=(v,n)=>((v%n)+n)%n;
const crestFallback={golden:'yellow',green:'yellow',rose:'red',purple:'blue',gray:'white'};
let manifestPromise;
const spriteImages=new Map();
function loadManifest(){
  return manifestPromise??=fetch(directory+'manifest.json').then(response=>{
    if(!response.ok)throw Error('Sprite manifest is unavailable');return response.json();
  }).catch(error=>{manifestPromise=null;throw error;});
}
function loadSprite(file){
  if(!spriteImages.has(file))spriteImages.set(file,new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{spriteImages.delete(file);reject(Error(file));};img.src=directory+file;
  }));
  return spriteImages.get(file);
}
export function mount(root,record,track,options={}){return new RaceViewer2D(root,record,track,options);}
// Traffic and routing labels can temporarily hide the underlying final effort.
export function spriteMotion(state,phase,finishDistance){
  if(phase==='paddock')return 'walk';
  if(phase!=='race'||state.stopped||state.finished)return 'run';
  if(state.mode==='スパート')return 'spurt';
  const remaining=finishDistance-state.distance;
  return remaining>=0&&remaining<=400&&['競り合い','羽混み','内へ進路変更','進路確保','前詰まり'].includes(state.mode)?'spurt':'run';
}

export class RaceViewer2D extends RacePlayback {
  constructor(root,record,track,options={}){
    super(root,record,track,options);
    this.motionPitch=C.motionPitch(options.pitch??this.$('[data-viewer-pitch]')?.value??2);
    this.theme=themeFor(track,record.surface);
    this.onPitch=e=>{if(e.target.matches('[data-viewer-pitch]')){e.stopPropagation();this.motionPitch=C.motionPitch(e.target.value);this.draw(0,true);}};
    root.addEventListener('change',this.onPitch);
    const pitchSelect=this.$('[data-viewer-pitch]');if(pitchSelect)pitchSelect.value=String(this.motionPitch);
    this.course=R.course(record,track);this.images=new Map();
    this.paths=new Map(this.replay.runners.map(r=>[r.id,C.gaitPath(r,record,track)]));
    this.stage.classList.add('race-stage-2d');
    this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label','コース外側から映す2Dのレース観戦映像');
    this.stage.prepend(this.canvas);this.ctx=this.canvas.getContext('2d');
    this.init().catch(error=>{
      if(this.disposed)return;console.error(error);this.status.hidden=false;this.status.setAttribute('role','alert');
      this.status.textContent='2D観戦を開始できませんでした。「2D」を選び直すか、3Dに切り替えてください。結果は下で確認できます。';
    });
  }
  async init(){
    if(!this.ctx)throw Error('Canvas 2D is unavailable');
    this.manifest=await loadManifest();if(this.disposed)return;
    const motions=[['',this.manifest],...Object.entries(this.manifest.motions||{}).map(([name,m])=>[name+':',m])];
    const keys=new Set(this.replay.runners.flatMap(r=>['body:'+r.color,'crest:'+this.crest(r.crest)]));
    const artwork=loadBackdrop(this.track).then(image=>{if(!this.disposed)this.backdropImage=image;});
    await Promise.all([artwork,...motions.flatMap(([prefix,m])=>[...keys].map(async key=>{
      const [kind,color]=key.split(':'),entry=m[kind][color]||m[kind].yellow;
      const img=await loadSprite(entry.file);if(!this.disposed)this.images.set(prefix+key,img);
    }))]);
    if(this.disposed)return;
    this.observer=new ResizeObserver(()=>this.draw(0,true));this.observer.observe(this.stage);
    this.$('[data-viewer-seek]').max=this.timeline.end;
    this.root.querySelectorAll('[data-needs-viewer]').forEach(el=>el.disabled=false);
    this.root.querySelectorAll('[data-section]').forEach(el=>el.disabled=C.sectionDistance(el.dataset.section,this.record,this.track)===null);
    this.ready=true;this.status.hidden=true;this.updateControls();this.draw(0,true);
    this.lastFrame=performance.now();
    const tick=now=>{
      if(this.disposed)return;
      const dt=Math.max(0,(now-this.lastFrame)/1000);this.lastFrame=now;
      if(!this.paused&&!document.hidden)this.time=Math.min(this.timeline.end,this.time+dt*this.rate);
      if(this.time>=this.timeline.end&&!this.paused){this.paused=true;this.cancelSpeech();this.updateControls();}
      this.draw(dt);this.animation=requestAnimationFrame(tick);
    };
    this.animation=requestAnimationFrame(tick);
  }
  crest(key){return crestFallback[key]||key;}
  control(button){
    if(button.dataset.viewer==='section'){
      if(!this.ready)return;
      const distance=C.sectionDistance(button.dataset.section,this.record,this.track),
        leader=this.replay.runners.find(r=>r.id===this.record.field[0].id),
        offset=['entry','exit'].includes(button.dataset.section)?40:12,
        time=distance===null?null:C.timeAtDistance(leader,Math.min(distance+offset,this.record.distance));
      if(time!==null){this.cameraMode='broadcast';this.seek(this.timeline.race+time);this.updateControls();}
      return;
    }
    super.control(button);
  }
  view(frame,width,height){
    const {order,phase,runners}=frame,leader=order[0],
      first=runners.find(r=>r.entry.id===leader.id).state,
      focus=runners.find(r=>r.entry.id===this.focusId)?.state||first,samples=runners.map(r=>r.state);
    let distance=first.distance-8,span=58;
    if(this.cameraMode==='follow'){distance=focus.distance;span=46;}
    if(this.cameraMode==='overview'){
      const lo=Math.min(...samples.map(s=>s.distance)),hi=Math.max(...samples.map(s=>s.distance));
      distance=(lo+hi)/2;span=Math.max(65,(hi-lo+16)*this.motionPitch);
    }
    if(this.cameraMode==='finish'){distance=this.record.distance;span=58;}
    if(phase==='gate'||phase==='paddock'){distance=0;span=58;}
    if(phase==='award'){distance=this.record.distance;span=58;}
    // Depth has enough room for all twelve original lanes at narrow widths.
    const viewport={width,height,pitch:this.motionPitch,span:Math.max(span,width/Math.max(5,height/16))};
    if(this.cameraMode==='broadcast'&&['race','result'].includes(phase))return C.broadcastCamera(first.distance,this.record,this.track,viewport);
    return C.camera(distance,this.record,this.track,viewport);
  }
  draw(){
    if(!this.ready||this.disposed)return;
    const rect=this.stage.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
    const ratio=Math.min(window.devicePixelRatio||1,2),w=rect.width,h=rect.height;
    if(this.canvas.width!==Math.round(w*ratio)||this.canvas.height!==Math.round(h*ratio)){
      this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);
    }
    const ctx=this.ctx;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    const frame=this.readFrame(),{phase,raceTime,order,runners}=frame,view=this.view(frame,w,h);
    this.currentView=view;
    if(phase==='paddock')this.paddockScene(view);
    else if(phase==='award'){this.backdrop(view);this.podium(view,raceTime);}
    else{
      this.backdrop(view);
      this.trackSurface(view);
      this.rail(view,-.5,false);
      const birds=runners.map(({entry,state,position})=>
        ({entry,state,p:C.projectPosition(position,state.distance,this.record,this.track,view)}))
        .sort((a,b)=>a.p.depth-b.p.depth||a.entry.lane-b.entry.lane);
      const showGates=phase==='gate'||phase==='race'&&raceTime<8;
      if(showGates)this.gates(view,phase,raceTime,false);
      const edges=[[],[]];
      for(const bird of birds){
        if(bird.p.x<-35||bird.p.x>w+35){edges[bird.p.x<0?0:1].push(bird);continue;}
        const travelled=C.travelled(bird.entry,raceTime,bird.state,this.paths.get(bird.entry.id));
        if(this.theme.dirt&&!bird.state.stopped)this.dust(bird.p,view,travelled,bird.state.speed);
        this.bird(bird.entry,bird.p,view,bird.state.stopped?0:C.frame(travelled,this.motionPitch),null,phase!=='gate',spriteMotion(bird.state,phase,this.record.distance));
      }
      if(showGates)this.gates(view,phase,raceTime,true);
      this.rail(view,11.5,true);
      this.edges(edges,view);
    }
    if(phase!=='paddock')this.minimap(view,runners);
    const selected=C.section(view.distance,this.record,this.track);
    const mode=view.finishLocked?'ゴール定点・後続の入線':{broadcast:'外側から中継',follow:'注目羽を追走',overview:'全羽の位置',finish:'ゴール・真横'}[this.cameraMode];
    const paddock=R.paddockAt(this.record,this.time);
    this.$('[data-race-camera]').textContent=phase==='paddock'?`${paddock.runner.lane+1}番を紹介 / ${paddock.index+1}・${paddock.total}羽`:`${this.course.right?'右回り ←':'左回り →'} / ${mode} / ${C.SECTIONS[selected]}`;
    this.root.querySelectorAll('[data-section]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.section===selected&&phase==='race')));
    this.stage.dataset.section=selected;this.stage.dataset.direction=this.course.right?'left':'right';
    this.stage.dataset.finishLocked=String(!!view.finishLocked);
    this.stage.dataset.motionPitch=String(this.motionPitch);this.stage.dataset.venue=this.theme.key;
    this.stage.dataset.backdrop=this.backdropImage?'image':'fallback';
    this.stage.dataset.phase=phase;
    if(phase==='paddock')this.stage.dataset.paddockId=paddock.runner.id;else delete this.stage.dataset.paddockId;
    this.updateOverlay(phase,order,raceTime);
  }
  paddockScene(view){
    const ctx=this.ctx,{width:w,height:h}=view,shot=R.paddockAt(this.record,this.time),
      walk=this.manifest.motions?.walk||this.manifest,travel=this.time*46,
      ground=h*.79,size=Math.min(h*.64,w*.58,310),x=w<560?w*.53:w*.5;
    // Track the walking bird: rails and paving move while the subject stays
    // large in frame. All motion derives from the playback clock, so seeking
    // and changing renderer preserve the introduction and gait.
    const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#87b8bf');sky.addColorStop(.55,'#e8efda');sky.addColorStop(1,'#d0d6b1');
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#9ab28a';ctx.fillRect(0,h*.38,w,h*.26);
    for(let i=-1;i<w/180+2;i++){
      const tx=i*180-mod(travel*.18,180);ctx.fillStyle=i%2?'#79977b':'#89a382';ctx.beginPath();ctx.ellipse(tx,h*.37,88,36,0,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='#426951';ctx.fillRect(0,h*.49,w,h*.14);
    ctx.fillStyle='#678456';ctx.fillRect(0,h*.6,w,h*.07);
    ctx.fillStyle='#cbbd99';ctx.fillRect(0,h*.67,w,h*.33);
    ctx.fillStyle='#e4d6b1';ctx.fillRect(0,h*.68,w,4);
    ctx.strokeStyle='#9b89682b';ctx.lineWidth=1;
    for(let i=-1;i<w/85+2;i++){
      const px=i*85-mod(travel,85);ctx.beginPath();ctx.moveTo(px,h*.69);ctx.lineTo(px-40,h);ctx.stroke();
    }
    ctx.strokeStyle='#fcf1d2';ctx.lineWidth=4;
    for(const y of [.54,.61]){ctx.beginPath();ctx.moveTo(0,h*y);ctx.lineTo(w,h*y);ctx.stroke();}
    for(let i=-1;i<w/100+2;i++){
      const px=i*100-mod(travel,100);ctx.fillStyle='#eadcba';ctx.fillRect(px-3,h*.52,6,h*.15);
    }
    const gait=Math.floor((this.time+shot.index*.17)*walk.recommendedFps)%walk.frameCount;
    this.bird(shot.runner,{x,y:ground},{...view,dir:1},gait,size,false,'walk');
    const nameSize=w<560?15:20,number=`${shot.runner.lane+1}番`,p=shot.runner.paddock;
    ctx.fillStyle='#294b3e';ctx.font=`600 ${nameSize}px sans-serif`;ctx.textAlign='center';
    ctx.fillText(`${number}  ${shot.runner.name}`,x,h*.91,Math.max(160,w-36));
    ctx.font='11px sans-serif';ctx.fillStyle='#5e654c';
    ctx.fillText(R.validPaddock(p)?`${p.age}歳 ${p.sex==='M'?'牡羽':'牝羽'}  ·  ${p.races}戦 ${p.wins}勝${shot.runner.player?'  ·  自家牧場':''}`:`出走羽 ${shot.index+1} / ${shot.total}`,x,h*.96);
    // A quiet progress strip marks how long this entrant remains on screen.
    const progress=shot.intro?0:Math.min(1,shot.elapsed/R.PADDOCK.runnerSeconds);
    ctx.fillStyle='#687f542b';ctx.fillRect(w*.25,h-4,w*.5,3);ctx.fillStyle='#a89450';ctx.fillRect(w*.25,h-4,w*.5*progress,3);
  }
  backdrop(view){
    if(this.backdropImage){drawBackdropImage(this.ctx,view,this.backdropImage,this.motionPitch);return;}
    if(this.theme.dirt){drawDirtBackdrop(this.ctx,view,this.theme,this.motionPitch);return;}
    const {width:w,height:h,distance,dir}=view,ctx=this.ctx;
    const travel=C.sceneryDistance(distance,this.motionPitch);
    const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#78b9cc');sky.addColorStop(.48,'#d8eeee');sky.addColorStop(1,'#f6eed8');
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    const sun=ctx.createRadialGradient(w*.72,h*.17,4,w*.72,h*.17,h*.46);
    sun.addColorStop(0,'#fff9decc');sun.addColorStop(1,'#fff9de00');ctx.fillStyle=sun;ctx.fillRect(0,0,w,h);
    for(let layer=0;layer<3;layer++)for(let i=0;i<7;i++){
      const x=mod(i*243-dir*travel*(.18+layer*.19),w+440)-220,y=h*(.18+layer*.12)+Math.sin(i*3.7)*18;
      ctx.fillStyle=['#ffffff70','#ffffff8c','#ffffffb0'][layer];ctx.beginPath();
      ctx.ellipse(x,y,120+layer*40,15+layer*8,0,0,Math.PI*2);ctx.ellipse(x+45,y-12,65,24,0,0,Math.PI*2);ctx.fill();
    }
    // Floating sanctuaries form a slower, distant layer; track objects below
    // share the same projection as the runners.
    for(let i=0;i<6;i++){
      const x=mod(i*310-dir*travel*.7,w+370)-185,y=h*.47+Math.sin(i*2.1)*18;
      const size=i%2?.72:1;this.temple(x,y,size);
    }
    ctx.fillStyle='#eef4e1';ctx.beginPath();ctx.moveTo(0,h*.58);
    for(let x=0;x<=w+40;x+=40)ctx.lineTo(x,h*.57+Math.sin(x*.013+distance*.001)*9);
    ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();
  }
  temple(x,y,size){
    const ctx=this.ctx;ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    ctx.fillStyle='#9cb6b6';ctx.beginPath();ctx.moveTo(-83,7);ctx.lineTo(-20,67);ctx.lineTo(48,43);ctx.lineTo(92,7);ctx.closePath();ctx.fill();
    ctx.fillStyle='#b9cbbf';ctx.fillRect(-86,-6,176,16);
    ctx.fillStyle='#e3d9bb';ctx.fillRect(-69,-17,140,13);ctx.fillRect(-61,-28,124,11);
    ctx.fillStyle='#f8ecd2';ctx.fillRect(-62,-98,125,11);
    for(let i=0;i<5;i++){
      const cx=-49+i*25;ctx.fillStyle='#d6cdb3';ctx.fillRect(cx,-89,12,59);
      ctx.fillStyle='#fff3d9';ctx.fillRect(cx,-89,4,59);ctx.fillRect(cx-3,-36,18,8);ctx.fillRect(cx-3,-89,18,7);
    }
    ctx.fillStyle='#6c9296';ctx.beginPath();ctx.moveTo(-77,-99);ctx.lineTo(0,-132);ctx.lineTo(78,-99);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#eed7a3';ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle='#f4dfa5';ctx.beginPath();ctx.arc(0,-113,5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  point(d,lane,view){return C.project(d,lane,this.record,this.track,view);}
  path(view,lane,start,end){
    const ctx=this.ctx;ctx.beginPath();
    for(let i=0;i<=100;i++){const p=this.point(start+(end-start)*i/100,lane,view);if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
  }
  band(view,inner,outer,color){
    const ctx=this.ctx,reach=(view.width/view.scale*.85+55)/view.pitch,start=view.distance-reach,end=view.distance+reach;
    this.path(view,inner,start,end);
    for(let i=100;i>=0;i--){const p=this.point(start+(end-start)*i/100,outer,view);ctx.lineTo(p.x,p.y);}
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
  trackSurface(view){
    const ctx=this.ctx,dirt=this.theme.dirt;
    this.band(view,-2,13,dirt?'#bda47d':'#d6ceb5');this.band(view,-1,12,dirt?'#ead4af':'#f8f1d9');
    for(let i=0;i<6;i++)this.band(view,-.5+i*2,1.5+i*2,dirt?this.theme.soil[i]:(i%2?'#8eac72':'#a0ba7e'));
    const reach=(view.width/view.scale+30)/view.pitch;
    drawTrackTexture(this,view,this.theme,this.motionPitch);
    // Surface features, goal, posts and runners all stay on the same course.
    const marks=C.sceneryPattern(view.distance,reach,20,this.motionPitch);
    for(let i=marks.first;i<=marks.last;i++){
      const d=i*marks.spacing,a=this.point(d,-.6,view),b=this.point(d,-1.3,view);
      ctx.strokeStyle='#ddd0a2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    const goalDistance=this.record.distance+Math.round((view.distance-this.record.distance)/this.course.lap)*this.course.lap;
    if(Math.abs(view.distance-goalDistance)<reach){
      const a=this.point(goalDistance,-.5,view),b=this.point(goalDistance,11.5,view);
      ctx.strokeStyle='#fbf6de';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      const goal=this.point(goalDistance,-1.2,view);ctx.fillStyle='#345b54';ctx.fillRect(goal.x-2,goal.y-63,4,63);
      this.plaque('GOAL',goal.x,goal.y-63,'#294d47','#f9e4a9');
    }
    const flags=C.sceneryPattern(view.distance,reach,40,this.motionPitch);
    for(let i=flags.first;i<=flags.last;i++){
      const d=i*flags.spacing;
      const p=this.point(d,-4.5,view);if(p.x<-30||p.x>view.width+30)continue;
      ctx.fillStyle='#c8c6ad';ctx.fillRect(p.x-4,p.y-48,8,48);ctx.fillStyle='#f3e9ca';ctx.fillRect(p.x-5,p.y-49,10,7);
      ctx.fillStyle=this.theme.flag;ctx.beginPath();ctx.moveTo(p.x-8,p.y-47);ctx.lineTo(p.x+8,p.y-47);ctx.lineTo(p.x+8,p.y-25);ctx.lineTo(p.x,p.y-20);ctx.lineTo(p.x-8,p.y-25);ctx.fill();
    }
  }
  rail(view,lane,near){
    const ctx=this.ctx,reach=(view.width/view.scale+45)/view.pitch,start=view.distance-reach,end=view.distance+reach;
    ctx.save();ctx.strokeStyle=this.theme.dirt?(near?'#947756':'#ead9b9'):(near?'#eae1be':'#f7f0d6');ctx.lineWidth=near?3:2;
    this.path(view,lane,start,end);ctx.stroke();
    ctx.beginPath();
    for(let i=0;i<=100;i++){const p=this.point(start+(end-start)*i/100,lane,view);const y=p.y-view.scale*.8;if(!i)ctx.moveTo(p.x,y);else ctx.lineTo(p.x,y);}ctx.stroke();
    const spacing=C.SCENERY.postSpacing,posts=C.sceneryPattern(view.distance,reach,spacing,this.motionPitch);
    for(let i=posts.first;i<=posts.last;i++){const p=this.point(i*posts.spacing,lane,view);
      ctx.beginPath();ctx.moveTo(p.x,p.y+2);ctx.lineTo(p.x,p.y-view.scale*1.05);ctx.stroke();}
    ctx.restore();
  }
  bird(entry,p,view,frame,size=null,showNumber=true,motion='run'){
    const m=this.manifest.motions?.[motion]||this.manifest,prefix=m===this.manifest?'':motion+':',
      ctx=this.ctx,body=this.images.get(prefix+'body:'+entry.color),crest=this.images.get(prefix+'crest:'+this.crest(entry.crest));
    const s=size??R.METRES.birdHeight/.89*view.scale;
    ctx.fillStyle='#3e543333';ctx.beginPath();ctx.ellipse(p.x,p.y-1,s*.33,s*.042,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(view.dir,1);
    const sx=frame%m.columns*m.cellWidth,sy=Math.floor(frame/m.columns)*m.cellHeight;
    for(const img of [body,crest])if(img)ctx.drawImage(img,sx,sy,m.cellWidth,m.cellHeight,-s*.5,-s*.94,s,s);
    ctx.restore();
    const own=entry.id===this.focusId||entry.player;
    if(own){ctx.strokeStyle='#f3d779';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y+1,s*.39,s*.065,0,0,Math.PI*2);ctx.stroke();}
    if(showNumber)this.plaque(String(entry.lane+1),p.x,p.y-s*.98,own?'#334f47':'#516959',own?'#ffe69c':'#fff5dd',own?13:11);
  }
  dust(p,view,travelled,speed){
    if(speed<2)return;
    const ctx=this.ctx,s=view.scale,cycle=C.sceneryDistance(travelled,this.motionPitch)/8;
    ctx.save();
    for(let i=0;i<7;i++){
      const age=mod(cycle+i*.173,1),x=p.x-view.dir*s*(.6+age*2.1),y=p.y-s*(.025+age*.21)+Math.sin(i*7)*s*.035;
      ctx.globalAlpha=(1-age)*Math.min(.36,speed/65);ctx.fillStyle=i%2?'#f1d8a7':'#ad895f';ctx.beginPath();ctx.ellipse(x,y,s*(.055+age*.13),s*(.025+age*.08),0,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  plaque(text,x,y,bg,fg,fontSize=11){
    const ctx=this.ctx;ctx.font=`600 ${fontSize}px sans-serif`;const width=ctx.measureText(text).width+12;
    ctx.fillStyle=bg;ctx.fillRect(x-width/2,y-fontSize-5,width,fontSize+8);ctx.fillStyle=fg;ctx.textAlign='center';ctx.fillText(text,x,y-2);
  }
  gates(view,phase,raceTime,foreground){
    const ctx=this.ctx,size=view.scale,unit=1/view.pitch,open=phase==='race'?Math.min(1,raceTime/.45):0;
    for(const entry of this.replay.runners.slice().sort((a,b)=>a.lane-b.lane)){
      const p=this.point(0,entry.lane,view),rear=this.point(-2.2*unit,entry.lane,view),front=this.point(2.2*unit,entry.lane,view);
      if(Math.max(rear.x,front.x)<-30||Math.min(rear.x,front.x)>view.width+30)continue;
      if(!foreground){
        // Each stall remains at the start while its runner accelerates away.
        const left=Math.min(rear.x,front.x),width=Math.abs(front.x-rear.x),top=p.y-size*3.65;
        ctx.fillStyle='#264e43';ctx.fillRect(left,top,width,size*.24);
        ctx.strokeStyle='#426e59';ctx.lineWidth=Math.max(2,size*.12);
        for(const q of [rear,front]){ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x,q.y-size*3.65);ctx.stroke();}
        ctx.strokeStyle='#709179';ctx.lineWidth=1.5;
        for(const height of [.7,1.5,2.3]){ctx.beginPath();ctx.moveTo(rear.x,rear.y-size*height);ctx.lineTo(front.x,front.y-size*height);ctx.stroke();}
      }else{
        // Two front leaves swing forward from the edges of the lane.
        for(const side of [-1,1]){
          const hinge=this.point(2.2*unit,entry.lane+side*.44,view),
            tip=this.point((2.2+Math.sin(open*Math.PI/2)*1.8)*unit,entry.lane+side*.44*(1-Math.cos(open*Math.PI/2)),view),height=size*2.7;
          ctx.fillStyle='#64887688';ctx.strokeStyle='#c2d2ad';ctx.lineWidth=1.5;
          ctx.beginPath();ctx.moveTo(hinge.x,hinge.y);ctx.lineTo(hinge.x,hinge.y-height);ctx.lineTo(tip.x,tip.y-height);ctx.lineTo(tip.x,tip.y);ctx.closePath();ctx.fill();ctx.stroke();
          for(const fraction of [.25,.5,.75]){ctx.beginPath();ctx.moveTo(hinge.x,hinge.y-height*fraction);ctx.lineTo(tip.x,tip.y-height*fraction);ctx.stroke();}
        }
        this.plaque(String(entry.lane+1),front.x+view.dir*size*.55,p.y-size*1.6,'#274f42','#ffe5a2',Math.min(11,size*.5));
      }
    }
  }
  edges(edges,view){
    for(const [side,birds] of edges.entries())for(const [i,bird] of birds.sort((a,b)=>b.state.distance-a.state.distance).slice(0,3).entries()){
      this.plaque(`${side?'→':'←'} ${bird.entry.lane+1}番`,side?view.width-30:30,view.height*.56+i*24,'#36574ce0','#fff0c0');
    }
  }
  minimap(view,runners){
    const ctx=this.ctx,c=this.course,compact=view.width<560,w=Math.min(compact?152:182,view.width*(compact ? .44 : .28)),h=compact?40:58,x=(view.width-w)/2,y=compact?134:19,
      scale=(w-30)/(c.straight+2*(c.radius+c.width)),cx=x+w/2,cy=y+h/2;
    ctx.fillStyle=this.theme.dirt?'#584a3aba':'#244c4bba';ctx.fillRect(x-7,y-8,w+14,h+26);
    ctx.strokeStyle='#d6e4c4';ctx.lineWidth=4;ctx.beginPath();
    for(let i=0;i<=160;i++){const p=R.position(this.record.distance+this.course.lap*i/160,5.5,this.record,this.track),
      px=cx+(p.x+(c.right?-1:1)*c.finishOffset)*scale,py=cy+p.z*scale*.57;
      if(!i)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.stroke();
    for(const {entry,position:p} of runners){
      ctx.fillStyle=entry.player?'#ffdc72':'#f7f4de';ctx.beginPath();ctx.arc(cx+(p.x+(c.right?-1:1)*c.finishOffset)*scale,cy+p.z*scale*.57,entry.player?3:1.8,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#f5eed3';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(`${this.track.name||'競走場'} / ${c.right?'右回り':'左回り'}`,cx,y+h+10);
  }
  podium(view,raceTime){
    const ctx=this.ctx,x=view.width/2,y=view.height*.84;
    ctx.fillStyle='#d9d2b5';ctx.fillRect(x-150,y-24,300,24);ctx.fillStyle='#bba76b';ctx.fillRect(x-60,y-55,120,55);
    const own=this.replay.runners.find(r=>r.id===this.record.birdId)||this.replay.runners[0];
    this.bird(own,{x,y:y-55},view,0,Math.min(140,view.height*.3));
    this.plaque(this.decor.title,x,view.height*.44,'#2e554e','#f8e1a4',16);
    this.plaque(own.name,x,y+21,'#31564e','#f8e1a4',14);
    const elapsed=this.time-this.timeline.award;
    for(let i=0;i<this.decor.confetti;i++){
      const age=mod(elapsed+i*1.73,6);ctx.fillStyle=['#e9c86d','#f8eee0','#8fa8bc'][i%3];
      ctx.fillRect(x+Math.sin(i*12.98)*210+Math.sin(age+i)*15,view.height*.3+age*view.height*.085,4,3);
    }
  }
  dispose(){
    if(this.disposed)return;super.dispose();this.root.removeEventListener('change',this.onPitch);cancelAnimationFrame(this.animation);this.observer?.disconnect();this.canvas.remove();this.stage.classList.remove('race-stage-2d');this.images.clear();
  }
}
