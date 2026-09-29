import * as THREE from 'three';
import { GLTFLoader } from '/vendor/three/GLTFLoader.js';
import { OrbitControls } from '/vendor/three/OrbitControls.js';

const stage=document.querySelector('#stage'), status=document.querySelector('#status');
const descriptions={
  Idle:['待機 — スタートを待つひととき。','羽を閉じて呼吸する待機姿勢。ゲート内やモデルの確認に使えます。'],
  Run_Cruise:['巡航 — 翼をたたんで、軽やかに。','翼を体に寄せた、安定した走り。通常の直線区間で使う基本モーションです。'],
  Run_Corner:['カーブ — 翼でバランスをとる。','両翼を広げ、体を傾けて走ります。左カーブ用の傾きなので、右カーブでは傾きを反転して使います。'],
  Run_Downhill:['下り坂 — 風に乗って駆け下りる。','翼を広げ、少し前傾して走ります。コースの勾配に合わせた全体の傾きは、レース側で加えます。'],
  Run_StartDash:['スタートダッシュ — 大きく踏み出す。','翼を開き、深い前傾姿勢と大きな歩幅で加速。加速区間で繰り返せる走行ループです。'],
  Run_LastSpurt:['ラストスパート — 最後の直線へ。','翼を大きく広げ、速いピッチで全力疾走。通常の巡航から滑らかに切り替わります。'],
};
const palette={gold:[0xffc72c,0xffdf49,0xec990d],blue:[0x437acb,0x80b9ed,0x284c9c],red:[0xd94736,0xf57855,0x9c2d29],green:[0x529361,0x8dc580,0x326445],white:[0xebe8dc,0xfffbee,0xb9c5c3],black:[0x303541,0x565d6b,0x1c202a]};
let mixer, actions, active, paused=false, rate=1, plumage=[];
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
  reset();document.querySelector('#reset').onclick=reset;
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
  loader.load('/assets/chocobo/chocobo-racer.glb',gltf=>{
    scene.add(gltf.scene);
    gltf.scene.traverse(o=>{
      if(o.isMesh){o.castShadow=true;o.receiveShadow=true;
        for(const m of (Array.isArray(o.material)?o.material:[o.material])){
          if(m.name.startsWith('Plumage_')&&!plumage.includes(m))plumage.push(m);
        }
      }
    });
    mixer=new THREE.AnimationMixer(gltf.scene);
    actions=Object.fromEntries(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
    const missing=Object.keys(descriptions).filter(name=>!actions[name]);
    if(missing.length){status.textContent='アニメーションが見つかりません: '+missing.join(', ');return;}
    play('Run_Cruise');status.hidden=true;
    document.querySelectorAll('[data-clip]').forEach(b=>b.onclick=()=>play(b.dataset.clip));
    document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{
      const colors=palette[b.dataset.color];
      for(const m of plumage)m.color.setHex(colors[m.name==='Plumage_Gold'?0:m.name==='Plumage_Light'?1:2]);
      document.querySelectorAll('[data-color]').forEach(other=>other.setAttribute('aria-pressed',String(other===b)));
    });
    // Read-only diagnostics for checking the shipped GLB in the browser.
    window.chocoboPreview={scene:gltf.scene,mixer,actions,get activeClip(){return active?.getClip().name;}};
  },undefined,error=>{console.error(error);status.textContent='モデルを読み込めませんでした。node server.cjs で起動して開いてください。';});
  function play(name){
    const next=actions[name];if(next===active)return;
    const previous=active;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if(previous)previous.crossFadeTo(next,.22,true);
    active=next;
    document.querySelectorAll('[data-clip]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.clip===name)));
    document.querySelector('#mode-label').textContent=descriptions[name][0];
    document.querySelector('#description').textContent=descriptions[name][1];
  }
  document.querySelector('#pause').onclick=e=>{paused=!paused;e.currentTarget.textContent=paused?'再生する':'一時停止';e.currentTarget.setAttribute('aria-pressed',String(paused));};
  document.querySelector('#speed').oninput=e=>{rate=Number(e.target.value);document.querySelector('#speed-value').textContent=rate.toFixed(2)+' ×';};
  const clock=new THREE.Clock();
  renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);if(mixer&&!paused)mixer.update(dt*rate);controls.update();renderer.render(scene,camera);});
} catch(error) {
  console.error(error);status.textContent='3D表示を開始できませんでした。WebGL対応のブラウザで開いてください。';
}
