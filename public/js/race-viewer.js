import * as THREE from 'three';
import { GLTFLoader } from '/vendor/three/GLTFLoader.js';

const R=globalThis.RaceReplay;
const palette={yellow:0xf1bf42,golden:0xe5a51e,red:0xce6356,blue:0x69a9d0,green:0x75b579,
  rose:0xe69bb8,white:0xf8f2e5,black:0x3c3a50,purple:0xa484c8,gray:0xa3aab4};
const phases={paddock:'パドック',gate:'ゲートイン',race:'レース',result:'決着',award:'表彰式'};
const format=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;

// Clone every skeleton and material: each racer owns its pose and feather color.
function cloneRacer(source){
  const clone=source.clone(true),map=new Map();
  function pair(a,b){map.set(a,b);a.children.forEach((c,i)=>pair(c,b.children[i]));}pair(source,clone);
  const materials=new Map();
  clone.traverse(o=>{
    if(o.isMesh){const copy=m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);};
      o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);o.castShadow=true;}
  });
  source.traverse(o=>{if(o.isSkinnedMesh){const target=map.get(o);target.skeleton=o.skeleton.clone();
    target.skeleton.bones=o.skeleton.bones.map(b=>map.get(b));target.bind(target.skeleton,o.bindMatrix);}});
  return clone;
}

export function mount(root,record,track){return new RaceViewer(root,record,track);}

class RaceViewer {
  constructor(root,record,track){
    this.root=root;this.record=record;this.track=track;this.replay=record.replay;
    this.timeline=R.timeline(record);this.cues=R.commentary(record);this.time=0;this.rate=1;
    this.paused=matchMedia('(prefers-reduced-motion: reduce)').matches;this.cameraMode='broadcast';
    this.focusId=record.birdId||this.replay.runners.find(r=>r.player)?.id||this.replay.runners[0].id;
    this.speaking=false;this.lastCue=-1;this.disposed=false;this.ready=false;
    this.$=s=>root.querySelector(s);this.stage=this.$('.race-stage');this.status=this.$('.race-loading');
    this.onClick=e=>{const button=e.target.closest('[data-viewer]');if(!button)return;e.stopPropagation();this.control(button);};
    this.onInput=e=>{if(e.target.matches('[data-viewer-seek]')){e.stopPropagation();this.seek(Number(e.target.value));}};
    this.onChange=e=>{
      if(e.target.matches('[data-viewer-speed]')){e.stopPropagation();this.rate=Number(e.target.value);this.cancelSpeech();}
      if(e.target.matches('[data-viewer-focus]')){e.stopPropagation();this.focusId=e.target.value;}
      if(e.target.matches('[data-viewer-seek]'))e.stopPropagation();
    };
    this.onVisibility=()=>{if(document.hidden){this.paused=true;this.cancelSpeech();this.updateControls();}};
    root.addEventListener('click',this.onClick);root.addEventListener('input',this.onInput);root.addEventListener('change',this.onChange);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.init().catch(error=>{
      if(this.disposed)return;
      console.error(error);this.status.hidden=false;
      this.ready=false;
      this.root.querySelectorAll('[data-needs-3d]').forEach(el=>el.disabled=true);
      this.status.textContent='3D観戦を開始できませんでした。WebGL対応のブラウザで開き直してください。結果は下で確認できます。';
      this.status.setAttribute('role','alert');this.releaseGraphics();
    });
  }
  async init(){
    const renderer=this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.stage.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','3Dのレース観戦映像');
    const scene=this.scene=new THREE.Scene();scene.background=new THREE.Color(0xb5d9df);
    scene.fog=new THREE.Fog(0xb5d9df,1100,2600);
    const camera=this.camera=new THREE.PerspectiveCamera(30,1,1,4000);
    this.look=new THREE.Vector3();this.desired=new THREE.Vector3();
    scene.add(new THREE.HemisphereLight(0xfff4d7,0x547144,2.1));
    const sun=this.sun=new THREE.DirectionalLight(0xffe7c0,3.2);sun.position.set(25,90,45);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:180});
    sun.shadow.normalBias=.08;scene.add(sun,sun.target);
    this.course=R.course(this.record,this.track);this.buildVenue();this.buildCeremony();
    this.resize=()=>{if(this.disposed)return;const {width,height}=this.stage.getBoundingClientRect();
      renderer.setSize(width,height);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();};
    this.observer=new ResizeObserver(this.resize);this.observer.observe(this.stage);this.resize();
    this.onContextLost=e=>{e.preventDefault();this.paused=true;this.ready=false;this.status.hidden=false;
      this.status.textContent='3D表示が中断しました。一度閉じて、もう一度観戦を開いてください。';this.cancelSpeech();this.updateControls();};
    renderer.domElement.addEventListener('webglcontextlost',this.onContextLost);
    // Newer project models expose the crest separately and both corner directions.
    let manifest=null;
    try{const response=await fetch('/assets/chocobo-v3/manifest.json');if(response.ok)manifest=await response.json();}catch{}
    if(this.disposed)return;
    const gltf=await new GLTFLoader().loadAsync(manifest?.revision===3?'/assets/chocobo-v3/chocobo-v3.glb':'/assets/chocobo/chocobo-racer.glb');
    if(this.disposed){this.disposeObject(gltf.scene);return;}
    this.template=gltf.scene;
    gltf.scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(gltf.scene),height=bounds.max.y-bounds.min.y;
    this.modelScale=R.METRES.birdHeight/height;this.groundOffset=-bounds.min.y*this.modelScale;
    this.racers=this.replay.runners.map(entry=>{
      const model=cloneRacer(gltf.scene);model.scale.setScalar(this.modelScale);scene.add(model);
      model.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){
        if(m.name.startsWith('Plumage_')){const tone=m.name==='Plumage_Light'?'light':['Plumage_Shadow','Plumage_Dark'].includes(m.name)?'dark':'main';
          if(manifest?.palette?.[entry.color])m.color.set(manifest.palette[entry.color][tone]);
          else{const color=new THREE.Color(palette[entry.color]);if(tone==='light')color.lerp(new THREE.Color(0xffffff),.28);if(tone==='dark')color.multiplyScalar(.77);m.color.copy(color);}}
        if(m.name==='Iris'&&manifest?.palette?.[entry.color])m.color.set(manifest.palette[entry.color].iris);
        if(m.name==='Crest_Plume'){
          if(entry.crest==='rainbow'){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=4;const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,256,0);
            (manifest.crests.rainbow||[]).forEach((color,i,colors)=>gradient.addColorStop(i/(colors.length-1),color));ctx.fillStyle=gradient;ctx.fillRect(0,0,256,4);
            m.map=new THREE.CanvasTexture(canvas);m.map.colorSpace=THREE.SRGBColorSpace;m.color.set(0xffffff);
          }else m.color.set(manifest?.crests?.[entry.crest]||palette[entry.crest]);
        }
      }});
      const mixer=new THREE.AnimationMixer(model),actions=Object.fromEntries(gltf.animations.map(c=>[c.name,mixer.clipAction(c)]));
      const wings=[];model.traverse(o=>{if(o.isBone&&(manifest?.revision===3?/^Shoulder/:/^Wing[^T]/).test(o.name))wings.push({bone:o,rest:o.quaternion.clone()});});
      const label=this.label(String(entry.lane+1),entry.player?'#f5c857':'#f4f3e8',.72,.48);label.position.y=bounds.max.y+.35/this.modelScale;model.add(label);
      const racer={entry,model,mixer,actions,wings};this.setClip(racer,'Idle',0);return racer;
    });
    this.ready=true;this.status.hidden=true;this.$('[data-viewer-seek]').max=this.timeline.end;
    this.root.querySelectorAll('[data-needs-3d]').forEach(el=>el.disabled=false);
    this.updateControls();this.draw(0,true);this.lastFrame=performance.now();
    renderer.setAnimationLoop(now=>{
      if(this.disposed||!this.ready)return;
      const dt=Math.max(0,(now-this.lastFrame)/1000);this.lastFrame=now;
      if(!this.paused&&!document.hidden)this.time=Math.min(this.timeline.end,this.time+dt*this.rate);
      if(this.time===this.timeline.end&&!this.paused){this.paused=true;this.cancelSpeech();this.updateControls();}
      this.draw(Math.min(dt,.1));
    });
  }
  material(color){return new THREE.MeshStandardMaterial({color,roughness:.85});}
  box(group,x,y,z,w,h,d,color){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.material(color));
    mesh.position.set(x,y,z);mesh.receiveShadow=true;group.add(mesh);return mesh;}
  label(text,color='#f7efd4',width=5,height=1){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#203e35';ctx.fillRect(0,0,768,192);
    ctx.strokeStyle='#cdb770';ctx.lineWidth=10;ctx.strokeRect(10,10,748,172);
    ctx.fillStyle=color;ctx.font='bold 68px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,100,720);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    return this.sprite(texture,width,height);
  }
  sprite(texture,width,height){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture}));sprite.scale.set(width,height,1);return sprite;}
  ribbon(lane,width,color){
    const vertices=[],indices=[];
    for(let i=0;i<=240;i++)for(const side of [-1,1]){
      const p=R.position(this.record.distance+this.course.lap*i/240,lane+side*width/(2*this.course.laneWidth),this.record,this.track);
      vertices.push(p.x,.025,p.z);
    }
    for(let i=0;i<240;i++){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));mesh.receiveShadow=true;return mesh;
  }
  buildVenue(){
    const scene=this.scene,c=this.course,dir=c.right?-1:1,centreX=-dir*c.finishOffset;
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),this.material(0x779260));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
    if(this.record.surface==='dirt')scene.add(this.ribbon(5.5,c.width,0xc6ab80));
    else for(let i=0;i<4;i++)scene.add(this.ribbon(1+i*3,c.width/4,i%2?0x93b16d:0x9ab876));
    for(const lane of [-.5,11.5]){
      const points=Array.from({length:241},(_,i)=>{const p=R.position(this.record.distance+c.lap*i/240,lane,this.record,this.track);return new THREE.Vector3(p.x,1.15,p.z);});
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),240,.08,4,true),this.material(0xf4ebd2)));
      for(let i=0;i<240;i+=2){const p=points[i];this.box(scene,p.x,.575,p.z,.12,1.15,.12,0xf4ebd2);}
    }
    this.box(scene,0,.038,-c.radius-c.width/2,.35,.02,c.width,0xf7f3dc);
    for(const z of [-c.radius+1,-c.radius-c.width-1]){
      const finish=new THREE.Group();finish.position.set(0,0,z);scene.add(finish);
      if(z>-c.radius)this.nearFinishPole=finish;
      this.box(finish,0,3.5,0,.35,7,.35,0xf4ecdc);const finishText=this.label('GOAL','#f5d778',4,1);finishText.position.set(0,7,0);finish.add(finishText);
    }
    for(const remaining of [100,200,400]){
      const p=R.position(this.record.distance-remaining,11.8,this.record,this.track),sign=this.label(String(remaining),'#f7e6a9',3,1.2);
      this.box(scene,p.x,1.5,p.z,.18,3,.18,0xf4ebd2);sign.position.set(p.x,3.5,p.z);scene.add(sign);
    }
    const standZ=-c.radius-c.width-35;
    this.box(scene,centreX,1,standZ,c.straight+12,2,24,0xd8d3bd);
    for(let row=0;row<10;row++)this.box(scene,centreX,2+row*.8,standZ-row*1.4,c.straight+10,.8,2,0x738977);
    this.box(scene,centreX,12,standZ-5,c.straight+17,.6,35,0x314c44);
    for(const x of [-c.straight/2,c.straight/2])this.box(scene,centreX+x,6,standZ,.6,12,.6,0xe7dec8);
    const audience=new THREE.InstancedMesh(new THREE.SphereGeometry(.24,6,4),this.material(0xffffff),2000);
    const matrix=new THREE.Matrix4();
    for(let i=0;i<2000;i++){matrix.makeTranslation(centreX+(i%200-99.5)*(c.straight+5)/200,2.9+Math.floor(i/200)*.8,standZ-Math.floor(i/200)*1.4);
      audience.setMatrixAt(i,matrix);audience.setColorAt(i,new THREE.Color([0xe4a067,0x6d9eb2,0xd7c481,0x9a8cbd,0xeddfc7][i%5]));}
    scene.add(audience);
    const banner=this.label('WING & WIND  /  CHOCOBO RACING','#f1df9a',c.straight*.65,2);banner.position.set(centreX,4.4,standZ+12);scene.add(banner);
    for(let i=0;i<38;i++){
      const angle=i/38*Math.PI*2,x=centreX+Math.cos(angle)*(c.straight/2+c.radius+c.width+80),z=Math.sin(angle)*(c.radius+c.width+100);
      this.box(scene,x,1.4,z,.45,2.8,.45,0x846847);
      const tree=new THREE.Mesh(new THREE.ConeGeometry(2.4,7,7),this.material(i%2?0x466951:0x597c54));tree.position.set(x,5,z);scene.add(tree);
    }
    // Distant course landmarks give each venue its own skyline.
    for(let i=0;i<7;i++){
      const x=centreX+(i-3)*50,z=c.radius+c.width+100;
      if(['tenku','oukyu','iseki'].includes(this.track.id)){
        this.box(scene,x,7,z,5,14,5,this.track.id==='iseki'?0xa2aa91:0xe5d9ba);
        const roof=new THREE.Mesh(new THREE.ConeGeometry(4,5,4),this.material(0x6c8673));roof.position.set(x,16,z);scene.add(roof);
      }else{
        const mountain=new THREE.Mesh(new THREE.ConeGeometry(15,22+i%3*5,6),this.material(0x849987));mountain.position.set(x,9,z);scene.add(mountain);
      }
    }
    this.paddock=new THREE.Vector3(centreX-c.straight/2-c.radius-c.width-40,0,0);
    const ring=new THREE.Mesh(new THREE.RingGeometry(8,13,64),this.material(0xc7b894));ring.rotation.x=-Math.PI/2;ring.position.copy(this.paddock).y=.04;scene.add(ring);
    const flower=new THREE.Mesh(new THREE.CylinderGeometry(5,5,.25,32),this.material(0x557e53));flower.position.copy(this.paddock).y=.12;scene.add(flower);
    const paddockSign=this.label('PADDOCK','#f5df9d',7,1.6);paddockSign.position.copy(this.paddock).add(new THREE.Vector3(0,4,-14));scene.add(paddockSign);
    this.gates=new THREE.Group();this.doors=[];scene.add(this.gates);
    for(const runner of this.replay.runners){
      const p=R.position(0,runner.lane,this.record,this.track),gate=new THREE.Group();gate.position.set(p.x,0,p.z);gate.rotation.y=p.heading;this.gates.add(gate);
      for(const side of [-1,1]){
        for(const end of [-1,1])this.box(gate,side*1.85,1.65,end*1.8,.15,3.3,.15,0x536e60);
        for(const y of [1,2,3.25])this.box(gate,side*1.85,y,0,.12,.12,3.6,0x536e60);
      }
      for(const end of [-1,1])this.box(gate,0,3.25,end*1.8,3.85,.15,.18,0xd9c985);
      const door=new THREE.Group();gate.add(door);this.doors.push(door);
      for(const x of [-1.65,-.8,0,.8,1.65])this.box(door,x,1.3,1.8,.08,2.6,.08,0x789885);
      for(const y of [.1,1.25,2.6])this.box(door,0,y,1.8,3.55,.08,.08,0x789885);
      const sign=this.label(String(runner.lane+1),'#ffe5a0',1,.45);sign.position.set(0,3.65,1.8);gate.add(sign);
    }
  }
  buildCeremony(){
    const group=this.awardGroup=new THREE.Group();this.scene.add(group);
    const decor=this.decor=R.ceremony(this.record.level);
    this.box(group,0,.6,0,3.7,1.2,3,0xc4a251);this.box(group,-3,.3,0,2.1,.6,2.5,0xb4bcac);this.box(group,3,.2,0,2.1,.4,2.5,0xbfa286);
    const one=this.label('1','#f7e9a8',.8,.6);one.position.set(0,.65,1.56);group.add(one);
    this.box(group,0,3,-4.5,12,6,.22,decor.tier===3?0x234a45:0x4d7355);
    const title=this.label(decor.title,'#f7dfa3',10,1.5);title.position.set(0,5,-4.28);group.add(title);
    for(const side of [-1,1]){
      this.box(group,side*6,.3,0,2,.6,2,0xc8c1a4);
      const bush=new THREE.Mesh(new THREE.SphereGeometry(1.05,12,8),this.material(0x6b965f));bush.position.set(side*6,1,0);group.add(bush);
    }
    this.flashes=[];
    for(let i=0;i<decor.cameras;i++){
      const angle=-1.3+i/Math.max(1,decor.cameras-1)*2.6,x=Math.sin(angle)*6,z=4+Math.cos(angle)*4;
      this.box(group,x,.8,z,.1,1.6,.1,0x384c49);const camera=this.box(group,x,1.65,z,.65,.42,.5,0x30463f);camera.rotation.y=Math.atan2(-x,-z);
      const flash=new THREE.Mesh(new THREE.SphereGeometry(.17,8,6),new THREE.MeshBasicMaterial({color:0xffffff}));flash.position.set(x,1.85,z-.26);group.add(flash);this.flashes.push(flash);
    }
    this.crackers=[];
    for(let i=0;i<decor.crackers;i++){
      const x=(i%2?1:-1)*(3.6+Math.floor(i/2)*.5);
      const cracker=new THREE.Mesh(new THREE.ConeGeometry(.18,.65,12),this.material(i%2?0xa75a87:0xd3ad4c));cracker.position.set(x,.65,2);cracker.rotation.z=(i%2?1:-1)*.45;group.add(cracker);this.crackers.push(cracker);
    }
    const positions=new Float32Array(decor.confetti*3),colors=new Float32Array(decor.confetti*3);
    for(let i=0;i<decor.confetti;i++){const color=new THREE.Color([0xffd86b,0xf293a7,0x7ad4e5,0xe7f1c6][i%4]);colors.set([color.r,color.g,color.b],i*3);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    this.confetti=new THREE.Points(geometry,new THREE.PointsMaterial({size:.12,vertexColors:true}));group.add(this.confetti);group.visible=false;
    const burstGeometry=new THREE.BufferGeometry();burstGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(decor.crackers*18*3),3));
    this.bursts=new THREE.Points(burstGeometry,new THREE.PointsMaterial({color:0xffdb82,size:.14}));group.add(this.bursts);
  }
  setClip(racer,name,time){
    if(racer.clip!==name){Object.values(racer.actions).forEach(a=>a.stop());racer.actions[name]?.play();racer.clip=name;}
    racer.mixer.setTime(time);
  }
  draw(dt,snap=false){
    const phase=R.phase(this.record,this.time),raceTime=Math.max(0,this.time-this.timeline.race);
    const order=R.standings(this.replay,raceTime);
    this.gates.visible=['gate','race'].includes(phase)&&raceTime<3;
    this.doors.forEach(door=>door.visible=phase==='gate');this.awardGroup.visible=phase==='award';
    for(const racer of this.racers){
      const {entry,model}=racer,s=R.visualSample(entry,raceTime),p=R.position(s.distance,s.lateral,this.record,this.track);
      model.visible=phase!=='award'||entry.id===this.record.birdId;
      if(phase==='paddock'){
        const a=entry.lane/this.replay.runners.length*Math.PI*2+this.time*.08;
        p.x=this.paddock.x+Math.cos(a)*10.4;p.z=this.paddock.z+Math.sin(a)*10.4;p.heading=-a;p.y=0;
        this.setClip(racer,'Run_Cruise',this.time*.42+entry.lane*.12);
      }else if(phase==='gate'){
        Object.assign(p,R.position(0,entry.lane,this.record,this.track));this.setClip(racer,'Idle',this.time);
      }else if(phase==='award'){
        p.x=0;p.z=0;p.y=1.2;p.heading=0;
        const elapsed=this.time-this.timeline.award;this.setClip(racer,'Idle',elapsed);
        for(const [i,w]of racer.wings.entries()){
          w.bone.quaternion.copy(w.rest).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.sin(elapsed*3)*.08,(i%2?1:-1)*(.45+.45*(.5+.5*Math.sin(elapsed*5))))));
        }
      }else{
        const next=R.visualSample(entry,raceTime+.1),q=R.position(next.distance,next.lateral,this.record,this.track);
        if(Math.hypot(q.x-p.x,q.z-p.z)>.001)p.heading=Math.atan2(q.x-p.x,q.z-p.z);
        const corner=this.course.right&&racer.actions.Run_Corner_R?'Run_Corner_R':'Run_Corner';
        const clip=s.stopped?'Idle':raceTime<4?'Run_StartDash':p.corner?corner:
          s.finished&&raceTime>=entry.time+2?'Run_Cruise':this.record.distance-s.distance<=400?'Run_LastSpurt':'Run_Cruise';
        // A distance-based gait keeps moving forward while the run-out slows.
        const duration=racer.actions[clip]?.getClip().duration||.75;
        this.setClip(racer,clip,s.stopped?this.time:s.distance/(R.METRES.birdHeight*3.2)*duration);
      }
      model.position.set(p.x,p.y+this.groundOffset,p.z);model.rotation.y=p.heading;
    }
    if(phase==='award'){
      const elapsed=this.time-this.timeline.award,positions=this.confetti.geometry.attributes.position;
      for(let i=0;i<this.decor.confetti;i++){
        const age=(elapsed+(i*1.733)%6)%6;
        positions.setXYZ(i,Math.sin(i*12.98)*5+Math.sin(age+i)*.7,8-age*1.38,Math.cos(i*7.31)*3.5);
      }positions.needsUpdate=true;
      this.flashes.forEach((f,i)=>f.visible=elapsed>.5&&(elapsed+i*.27)%1.5<.09);
      this.crackers.forEach((c,i)=>c.scale.setScalar(elapsed>1+i*.18?1.15:1));
      const bursts=this.bursts.geometry.attributes.position;
      for(let i=0;i<bursts.count;i++){
        const cracker=this.crackers[Math.floor(i/18)],age=elapsed-1-Math.floor(i/18)*.24;
        if(age<0||age>3){bursts.setXYZ(i,0,-100,0);continue;}
        const side=cracker.position.x>0?-1:1;
        bursts.setXYZ(i,cracker.position.x+(side*1.5+Math.sin(i*3)*.7)*age,
          cracker.position.y+(4+(i%7)*.45)*age-2.5*age*age,cracker.position.z+Math.cos(i*2)*1.4*age);
      }bursts.needsUpdate=true;
    }
    this.cameraView(phase,dt,snap);
    const target=this.look;this.sun.position.set(target.x+25,90,target.z+45);this.sun.target.position.set(target.x,0,target.z);this.sun.target.updateMatrixWorld();
    this.renderer.render(this.scene,this.camera);
    this.updateOverlay(phase,order,raceTime);
  }
  cameraView(phase,dt,snap){
    const camera=this.camera,desired=this.desired,target=new THREE.Vector3();
    let key=phase,label=phases[phase],fov=34;
    if(phase==='paddock'){target.copy(this.paddock).y=1.25;desired.copy(target).add(new THREE.Vector3(22,17,23));}
    else if(phase==='award'){target.set(0,2.7,0);desired.set(Math.sin((this.time-this.timeline.award)*.13)*3,4.2,10);}
    else if(phase==='gate'){
      const positions=this.replay.runners.map(r=>R.position(0,r.lane,this.record,this.track));
      positions.forEach(p=>target.add(new THREE.Vector3(p.x,1.25,p.z)));target.divideScalar(positions.length);
      const heading=positions[Math.floor(positions.length/2)].heading;
      desired.copy(target).add(new THREE.Vector3(Math.sin(heading)*40+Math.cos(heading)*55,13,Math.cos(heading)*40-Math.sin(heading)*55));
    }else{
      const shot=R.cameraShot(this.record,this.track,this.time,this.cameraMode,this.focusId,camera.aspect);
      key=shot.key;label=shot.label;fov=shot.fov;
      desired.set(shot.position.x,shot.position.y,shot.position.z);target.set(shot.target.x,shot.target.y,shot.target.z);
    }
    const changed=key!==this.previousShot||phase!==this.previousPhase||this.cameraMode!==this.previousCamera,
      blend=snap||changed?1:1-Math.exp(-dt*6*this.rate);
    camera.position.lerp(desired,blend);this.look.lerp(target,blend);camera.fov+=(fov-camera.fov)*blend;
    camera.updateProjectionMatrix();camera.lookAt(this.look);
    // The finish camera has a clear view across the line, like a photo booth.
    this.nearFinishPole.visible=key!=='finish';
    this.$('[data-race-camera]').textContent=label;
    this.previousShot=key;this.previousPhase=phase;this.previousCamera=this.cameraMode;
  }
  updateOverlay(phase,order,raceTime){
    this.$('[data-race-phase]').textContent=phases[phase];
    this.$('[data-race-clock]').textContent=phase==='race'?format(raceTime):phase==='award'?this.decor.title:phase==='gate'?`${Math.ceil(this.timeline.race-this.time)}秒後に発走`:'RACE REPLAY';
    this.$('[data-race-remaining]').textContent=phase==='race'?`残り ${Math.ceil(Math.max(0,this.record.distance-order[0].distance))}m`:phase==='paddock'?`${this.replay.runners.length}羽の出走をお届けします`:phase==='result'?`${this.record.rank}着 / ${format(this.record.time)}`:'';
    if(this.time-(this.lastListTime??-1)>=.2||phase!==this.listPhase){
      const list=this.$('[data-live-order]');list.replaceChildren();
      const racing=['race','result','award'].includes(phase),shown=racing?order:order.slice().sort((a,b)=>a.lane-b.lane);
      list.setAttribute('aria-label',racing?'現在の上位5羽':'出走羽');
      shown.slice(0,5).forEach((r,i)=>{const row=document.createElement('li');row.className=r.player?'is-player':'';
        const rank=document.createElement('span');rank.textContent=String(i+1);const name=document.createElement('b');name.textContent=r.name;
        const gap=document.createElement('small');gap.textContent=!racing?`${r.lane+1}番`:r.finished?'入線':i===0?'先頭':`${Math.max(0,order[0].distance-r.distance).toFixed(1)}m`;
        row.append(rank,name,gap);list.append(row);});this.lastListTime=this.time;this.listPhase=phase;
    }
    this.$('[data-viewer-seek]').value=this.time;
    this.$('[data-viewer-time]').textContent=`${format(this.time)} / ${format(this.timeline.end)}`;
    const index=this.cues.findLastIndex(c=>c.at<=this.time);
    if(index!==this.lastCue){
      this.lastCue=index;const cue=this.cues[index];
      if(cue){this.root.querySelectorAll('[data-commentator]').forEach(el=>el.classList.toggle('speaking',el.dataset.commentator===cue.speaker));
        this.$('[data-commentary-speaker]').textContent=cue.speaker==='lamia'?'ラミア / 実況':'サハギン / 解説';
        this.$('[data-commentary-text]').textContent=cue.text;
        if(this.speaking&&!this.paused)this.speak(cue);}
    }
  }
  speak(cue){
    if(!('speechSynthesis'in window))return;this.cancelSpeech();
    const utterance=new SpeechSynthesisUtterance(cue.text);utterance.lang='ja-JP';utterance.rate=Math.min(1.7,(cue.speaker==='lamia'?1.14:1)*Math.sqrt(this.rate));
    utterance.pitch=cue.speaker==='lamia'?1.3:.72;
    const voices=speechSynthesis.getVoices().filter(v=>v.lang.startsWith('ja'));
    utterance.voice=voices[cue.speaker==='lamia'?0:Math.min(1,voices.length-1)]||null;
    utterance.onend=()=>{this.utterance=null;};this.utterance=utterance;speechSynthesis.speak(utterance);
  }
  cancelSpeech(){if(this.utterance&&'speechSynthesis'in window){speechSynthesis.cancel();this.utterance=null;}}
  control(button){
    const action=button.dataset.viewer;if(!this.ready&&action!=='voice')return;
    if(action==='pause'){if(this.time>=this.timeline.end)this.seek(0);this.paused=!this.paused;this.cancelSpeech();
      if(this.speaking&&!this.paused&&this.cues[this.lastCue])this.speak(this.cues[this.lastCue]);}
    if(action==='restart'){this.paused=false;this.seek(0);}
    if(action==='phase')this.seek(this.timeline[button.dataset.phase]);
    if(action==='camera')this.cameraMode=button.dataset.camera;
    if(action==='voice'){
      if(!('speechSynthesis'in window)){this.$('[data-voice-status]').textContent='このブラウザでは字幕のみで実況します。';return;}
      this.speaking=!this.speaking;this.cancelSpeech();
      this.$('[data-voice-status]').textContent=this.speaking?'日本語読み上げ ON（声はブラウザの設定に従います）':'実況字幕 ON / 音声 OFF';
      if(this.speaking&&!this.paused&&this.cues[this.lastCue])this.speak(this.cues[this.lastCue]);
    }
    this.updateControls();if(this.ready)this.draw(0,true);
  }
  updateControls(){
    const pause=this.$('[data-viewer="pause"]');pause.textContent=this.paused?'▶ 再生':'Ⅱ 一時停止';pause.setAttribute('aria-pressed',String(this.paused));
    this.$('[data-viewer="voice"]').setAttribute('aria-pressed',String(this.speaking));
    this.root.querySelectorAll('[data-camera]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.camera===this.cameraMode)));
  }
  seek(time){if(!this.ready)return;this.time=Math.max(0,Math.min(this.timeline.end,time));this.lastCue=-1;this.lastListTime=-1;this.cancelSpeech();this.draw(0,true);}
  disposeObject(object){
    const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
    object?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);
      for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);if(m.map)textures.add(m.map);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());skeletons.forEach(s=>s.dispose());
  }
  releaseGraphics(){
    this.renderer?.setAnimationLoop(null);this.observer?.disconnect();
    if(this.renderer){this.renderer.domElement.removeEventListener('webglcontextlost',this.onContextLost);this.renderer.dispose();this.renderer.domElement.remove();this.renderer=null;}
    this.disposeObject(this.scene);this.disposeObject(this.template);
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.cancelSpeech();
    this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('input',this.onInput);this.root.removeEventListener('change',this.onChange);
    document.removeEventListener('visibilitychange',this.onVisibility);
    this.racers?.forEach(r=>{r.mixer.stopAllAction();r.mixer.uncacheRoot(r.model);});this.releaseGraphics();
  }
}
