import * as THREE from 'three';
import { GLTFLoader } from '/vendor/three/GLTFLoader.js';
import { OrbitControls } from '/vendor/three/OrbitControls.js';

const $=selector=>document.querySelector(selector);
const stage=$('#stage'), status=$('#status');
const Genetics=globalThis.RanchGenetics;
const WINGS={closed:'羽を閉じる',spread:'羽を広げる',half:'羽を半開き'};
const ORDER=['Idle','Run_StartDash','Run_Cruise','Run_Corner','Run_Corner_R','Run_Downhill','Run_LastSpurt'];
// [button label, caption, description]
const MODELS={
  v3:{base:'/assets/chocobo-v3/',glb:'chocobo-v3.glb',blend:'chocobo-v3.blend',eyebrow:'RACER No. 03 / ANIMATED MODEL',headline:'翼をたたみ、風を待つ。',clips:{
    Idle:['待機','待機 — ゲートで出番を待つ。','羽を閉じて呼吸し、きょろきょろと周りを見ます。ときどき小さく鳴きます。'],
    Run_StartDash:['スタートダッシュ','スタートダッシュ — 翼をたたんで一気に加速。','深い前傾と大きな歩幅で加速します。スタートから巡航まで、翼は体に沿わせたままです。'],
    Run_Cruise:['巡航','巡航 — 翼をたたんで、リズムよく。','翼を閉じた基本の走り。体が弾んでも頭は揺れを抑えて前を見続けます。'],
    Run_Corner:['カーブ（左）','カーブ — 翼を広げてバランスをとる。','体を内側へ傾け、外側の翼を高く上げて左右に揺らしながらバランスをとります。左カーブ用です。'],
    Run_Corner_R:['カーブ（右）','カーブ — 翼を広げてバランスをとる。','右カーブ用。左カーブと左右対称の動きです。'],
    Run_Downhill:['下り坂','下り坂 — 翼を半分ひらいて姿勢を保つ。','上体を起こし、翼を半開きにして駆け下ります。坂の傾きはレース側でモデル全体に加えます。'],
    Run_LastSpurt:['ラストスパート','ラストスパート — 翼を大きく広げて全力疾走。','一歩ごとに翼を羽ばたかせ、くちばしを開いて最後の直線を駆け抜けます。'],
  }},
  v2:{base:'/assets/chocobo/',glb:'chocobo-racer.glb',blend:'chocobo-racer.blend',eyebrow:'RACER No. 02 / ANIMATED MODEL',headline:'風をつかむ、小さな翼。',clips:{
    Idle:['待機','待機 — スタートを待つひととき。','羽を閉じて呼吸する待機姿勢。ゲート内やモデルの確認に使えます。'],
    Run_Cruise:['巡航','巡航 — 翼をたたんで、軽やかに。','翼を体に寄せた、安定した走り。通常の直線区間で使う基本モーションです。'],
    Run_Corner:['カーブ','カーブ — 翼でバランスをとる。','両翼を広げ、体を傾けて走ります。左カーブ用の傾きなので、右カーブでは傾きを反転して使います。'],
    Run_Downhill:['下り坂','下り坂 — 風に乗って駆け下りる。','翼を広げ、少し前傾して走ります。コースの勾配に合わせた全体の傾きは、レース側で加えます。'],
    Run_StartDash:['スタートダッシュ','スタートダッシュ — 大きく踏み出す。','翼を開き、深い前傾姿勢と大きな歩幅で加速。加速区間で繰り返せる走行ループです。'],
    Run_LastSpurt:['ラストスパート','ラストスパート — 最後の直線へ。','翼を大きく広げ、速いピッチで全力疾走。通常の巡航から滑らかに切り替わります。'],
  },
  // Plumage_Gold / Plumage_Light / Plumage_Shadow
  palette:{yellow:[0xffc72c,0xffdf49,0xec990d],blue:[0x437acb,0x80b9ed,0x284c9c],red:[0xd94736,0xf57855,0x9c2d29],green:[0x529361,0x8dc580,0x326445],white:[0xebe8dc,0xfffbee,0xb9c5c3],black:[0x303541,0x565d6b,0x1c202a]}},
};
const state={model:new URLSearchParams(location.search).get('model')==='v2'?'v2':'v3',clip:'Run_Cruise',color:'yellow',crest:'yellow'};
let current=null, active=null, paused=false, rate=1, loadSerial=0, rainbow=null;

function rainbowTexture(stops){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=4;
  const g=canvas.getContext('2d'),grad=g.createLinearGradient(0,0,256,0);
  stops.forEach((color,i)=>grad.addColorStop(i/(stops.length-1),color));
  g.fillStyle=grad;g.fillRect(0,0,256,4);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
function swatch(container,value,color,label,pressed,onClick){
  const b=document.createElement('button');
  b.className='swatch';b.style.setProperty('--color',color);b.setAttribute('aria-label',label);b.title=label;
  b.setAttribute('aria-pressed',String(pressed));b.dataset.value=value;
  b.onclick=()=>{container.querySelectorAll('.swatch').forEach(o=>o.setAttribute('aria-pressed',String(o===b)));onClick();};
  container.append(b);
}
const hex=n=>'#'+n.toString(16).padStart(6,'0');

try {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.22;
  stage.prepend(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(37,1,.1,100);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,1.5,0);controls.enableDamping=true;
  controls.minDistance=3.7;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.49;
  controls.enablePan=false;
  const reset=()=>{camera.position.set(4.3,2.9,6.5);controls.target.set(0,1.5,0);controls.update();};
  reset();$('#reset').onclick=reset;
  scene.add(new THREE.HemisphereLight(0xfff3d5,0x344b3e,2.1));
  const key=new THREE.DirectionalLight(0xffecd1,3.2);key.position.set(3,7,5);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-4,right:4,top:5,bottom:-4,near:.5,far:20});
  key.shadow.bias=-.0004;key.shadow.normalBias=.02;scene.add(key);
  const rim=new THREE.DirectionalLight(0xffd381,2.3);rim.position.set(-3,4,-4);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(2.45,96),new THREE.MeshStandardMaterial({color:0x344638,roughness:.92}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.018;floor.receiveShadow=true;scene.add(floor);
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.35,2.365,96),new THREE.MeshBasicMaterial({color:0x9caa7a,transparent:true,opacity:.4,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.y=-.015;scene.add(ring);
  const resize=()=>{const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(stage);resize();
  const loader=new GLTFLoader();

  async function load(modelId){
    const serial=++loadSerial, model=MODELS[modelId];
    status.hidden=false;status.textContent='3Dモデルを読み込んでいます…';
    document.querySelectorAll('[data-model]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.model===modelId)));
    const [manifest,gltf]=await Promise.all([
      fetch(model.base+'manifest.json').then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}),
      loader.loadAsync(model.base+model.glb),
    ]);
    if(serial!==loadSerial)return;
    if(current){scene.remove(current.root);current.mixer.stopAllAction();}
    const materials=new Map();
    gltf.scene.traverse(o=>{
      if(!o.isMesh)return;
      o.castShadow=true;o.receiveShadow=true;
      for(const m of [o.material].flat()){materials.set(m.name,m);m.userData.base??={metalness:m.metalness,roughness:m.roughness};}
    });
    scene.add(gltf.scene);
    const mixer=new THREE.AnimationMixer(gltf.scene);
    const actions=Object.fromEntries(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
    current={id:modelId,model,manifest,root:gltf.scene,mixer,actions,materials};
    active=null;state.model=modelId;
    history.replaceState(null,'',modelId==='v3'?location.pathname:'?model='+modelId);
    $('#eyebrow').textContent=model.eyebrow;$('#headline').textContent=model.headline;
    $('#glb-link').href=model.base+model.glb;$('#blend-link').href=model.base+model.blend;
    buildControls();
    play(actions[state.clip]?state.clip:'Run_Cruise');
    status.hidden=true;
    // Read-only diagnostics for checking the shipped GLB in the browser.
    window.chocoboPreview={get model(){return current.id;},scene:gltf.scene,mixer,actions,materials,manifest,
      get activeClip(){return active?.getClip().name;},get look(){return {color:state.color,crest:state.crest};}};
  }

  function buildControls(){
    const {model,manifest,actions}=current;
    const motions=$('#motions');motions.replaceChildren();
    for(const name of ORDER.filter(n=>actions[n])){
      const b=document.createElement('button');
      b.className='motion';b.dataset.clip=name;b.setAttribute('aria-pressed','false');
      const small=document.createElement('small');small.textContent=WINGS[manifest.clips[name]?.wings]||'';
      b.append(model.clips[name]?.[0]||name,small);b.onclick=()=>play(name);
      motions.append(b);
    }
    const plumage=$('#plumage');plumage.replaceChildren();
    const crest=$('#crest');crest.replaceChildren();
    if(current.id==='v3'){
      if(!manifest.palette[state.color])state.color='yellow';
      for(const [key,label] of Object.entries(Genetics.COLORS))
        swatch(plumage,key,manifest.palette[key].main,label,key===state.color,()=>{state.color=key;paint();});
      for(const [key,label] of Object.entries(Genetics.CRESTS)){
        const c=manifest.crests[key];
        swatch(crest,key,Array.isArray(c)?`linear-gradient(135deg,${c.join(',')})`:c,label,key===state.crest,()=>{state.crest=key;paint();});
      }
    } else {
      if(!model.palette[state.color])state.color='yellow';
      const labels={yellow:'黄',blue:'青',red:'赤',green:'緑',white:'白',black:'黒'};
      for(const [key,colors] of Object.entries(model.palette))
        swatch(plumage,key,hex(colors[0]),labels[key],key===state.color,()=>{state.color=key;paint();});
    }
    $('#crest-section').hidden=current.id!=='v3';
    paint();
  }

  function paint(){
    const {materials,manifest,model}=current;
    const set=(name,color)=>materials.get(name)?.color.set(color);
    if(current.id==='v3'){
      const p=manifest.palette[state.color],golden=state.color==='golden';
      set('Plumage_Main',p.main);set('Plumage_Light',p.light);set('Plumage_Dark',p.dark);set('Iris',p.iris);
      for(const name of manifest.recolor.plumage){
        const m=materials.get(name);if(!m)continue;
        m.metalness=golden?.45:m.userData.base.metalness;m.roughness=golden?.36:m.userData.base.roughness;
      }
      const crestMat=materials.get(manifest.recolor.crest),c=manifest.crests[state.crest];
      if(Array.isArray(c)){rainbow??=rainbowTexture(c);crestMat.map=rainbow;crestMat.color.set(0xffffff);}
      else {crestMat.map=null;crestMat.color.set(c);}
      crestMat.needsUpdate=true;
      $('#plumage-label').textContent='羽色：'+Genetics.COLORS[state.color];
      $('#crest-label').textContent='額羽：'+Genetics.CRESTS[state.crest];
    } else {
      const colors=model.palette[state.color];
      set('Plumage_Gold',colors[0]);set('Plumage_Light',colors[1]);set('Plumage_Shadow',colors[2]);
      $('#plumage-label').textContent='';
    }
  }

  function play(name){
    const next=current.actions[name];if(!next||next===active)return;
    const previous=active;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if(previous)previous.crossFadeTo(next,.22,true);
    active=next;state.clip=name;
    document.querySelectorAll('[data-clip]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.clip===name)));
    const text=current.model.clips[name]||[name,name,''];
    $('#mode-label').textContent=text[1];$('#description').textContent=text[2];
    const {manifest}=current,clip=manifest.clips[name];
    $('#meta').textContent=`${manifest.bones} bones · ${Object.keys(manifest.clips).length} animations · ${manifest.triangles.toLocaleString()} tris`+
      (clip?.groundSpeed?` · 等倍で地面速度 ${clip.groundSpeed} m/s 相当`:'')+' · その場で走るループ';
  }

  document.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>{
    if(b.dataset.model!==current?.id)load(b.dataset.model).catch(fail);
  });
  $('#pause').onclick=e=>{paused=!paused;e.currentTarget.textContent=paused?'再生する':'一時停止';e.currentTarget.setAttribute('aria-pressed',String(paused));};
  $('#speed').oninput=e=>{rate=Number(e.target.value);$('#speed-value').textContent=rate.toFixed(2)+' ×';};
  const fail=error=>{console.error(error);status.hidden=false;status.textContent='モデルを読み込めませんでした。node server.cjs で起動して開いてください。';};
  load(state.model).catch(fail);
  const clock=new THREE.Clock();
  renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);if(current&&!paused)current.mixer.update(dt*rate);controls.update();renderer.render(scene,camera);});
} catch(error) {
  console.error(error);status.textContent='3D表示を開始できませんでした。WebGL対応のブラウザで開いてください。';
}
