const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {CLIPS,RIGHT_CORNER,selectClip}=require('../public/js/chocobo-animation.js');
const Genetics=require('../public/js/ranch-genetics.js');
const dir=path.join(__dirname,'../public/assets/chocobo-v3');
const blob=fs.readFileSync(path.join(dir,'chocobo-v3.glb'));
const jsonSize=blob.readUInt32LE(12);
const gltf=JSON.parse(blob.toString('utf8',20,20+jsonSize));
const binary=blob.subarray(28+jsonSize);
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
function values(index){
  const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView];
  assert.equal(a.componentType,5126);
  const size={SCALAR:1,VEC3:3,VEC4:4}[a.type];
  assert.ok(size);
  return Array.from({length:a.count},(_,i)=>Array.from({length:size},(_,j)=>binary.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size*4)+j*4)));
}
// Angle in degrees between a bone's animated local rotation and its rest rotation.
function shoulderAngles(clip,side){
  const node=gltf.nodes.findIndex(n=>n.name==='Shoulder.'+side);
  const channel=clip.channels.find(c=>c.target.node===node&&c.target.path==='rotation');
  const rest=gltf.nodes[node].rotation||[0,0,0,1];
  return values(clip.samplers[channel.sampler].output).map(q=>2*Math.acos(Math.min(1,Math.abs(q.reduce((s,x,i)=>s+x*rest[i],0))))*180/Math.PI);
}

test('v3 GLB is one recolourable skinned character with the documented clips',()=>{
  assert.equal(blob.toString('utf8',0,4),'glTF');
  assert.equal(blob.readUInt32LE(8),blob.length);
  assert.equal(gltf.skins.length,1);
  assert.equal(gltf.skins[0].joints.length,manifest.bones);
  assert.deepEqual(gltf.animations.map(a=>a.name).sort(),Object.keys(manifest.clips).sort());
  for(const name of [...CLIPS,RIGHT_CORNER])assert.ok(manifest.clips[name],name);
  const materials=gltf.materials.map(m=>m.name);
  for(const name of [...manifest.recolor.plumage,manifest.recolor.crest,manifest.recolor.iris])assert.ok(materials.includes(name),name);
  assert.equal(gltf.images?.length||0,0,'no textures shipped; rainbow crests are generated at runtime');
  for(const m of gltf.meshes)for(const p of m.primitives)
    for(const attribute of ['JOINTS_0','WEIGHTS_0','TEXCOORD_0'])assert.ok(p.attributes[attribute]!==undefined,attribute);
});

test('v3 clips loop seamlessly at the manifest duration',()=>{
  for(const clip of gltf.animations){
    let duration=0;
    for(const sampler of clip.samplers){
      const times=values(sampler.input).flat(),frames=values(sampler.output);
      assert.ok(times.every((t,i)=>Number.isFinite(t)&&(i===0||t>times[i-1])),clip.name);
      frames[0].forEach((v,i)=>assert.ok(Math.abs(v-frames.at(-1)[i])<1e-4,`${clip.name}: loop component ${i}`));
      duration=Math.max(duration,times.at(-1)-times[0]);
    }
    assert.ok(Math.abs(duration-manifest.clips[clip.name].seconds)<1e-4,clip.name);
  }
});

test('wings stay folded from the gate through cruising and open for corners and the last spurt',()=>{
  const expected={Idle:'closed',Run_StartDash:'closed',Run_Cruise:'closed',Run_Corner:'spread',Run_Corner_R:'spread',Run_LastSpurt:'spread'};
  for(const [name,wings] of Object.entries(expected))assert.equal(manifest.clips[name].wings,wings,name);
  for(const clip of gltf.animations){
    const wings=manifest.clips[clip.name].wings;
    for(const side of ['L','R']){
      const angles=shoulderAngles(clip,side);
      if(wings==='closed')assert.ok(Math.min(...angles)>55,`${clip.name} ${side} stays folded`);
      else if(wings==='spread')assert.ok(Math.max(...angles)<40,`${clip.name} ${side} stays open`);
      else assert.ok(Math.min(...angles)>20&&Math.max(...angles)<50,`${clip.name} ${side} half open`);
    }
  }
  // The outer wing rides higher in a turn, so the two corners are mirror images.
  const corner=name=>gltf.animations.find(a=>a.name===name);
  assert.ok(Math.max(...shoulderAngles(corner('Run_Corner'),'R'))>Math.max(...shoulderAngles(corner('Run_Corner'),'L')));
  const range=a=>[Math.min(...a),Math.max(...a)].map(x=>x.toFixed(1));
  assert.deepEqual(range(shoulderAngles(corner('Run_Corner'),'L')),range(shoulderAngles(corner('Run_Corner_R'),'R')));
});

test('every plumage colour and crest from the genetics model has a v3 look',()=>{
  assert.deepEqual(Object.keys(manifest.palette).sort(),Object.keys(Genetics.COLORS).sort());
  assert.deepEqual(Object.keys(manifest.crests).sort(),Object.keys(Genetics.CRESTS).sort());
  for(const look of Object.values(manifest.palette))
    for(const key of ['main','light','dark','iris'])assert.match(look[key],/^#[0-9a-f]{6}$/);
  assert.ok(Array.isArray(manifest.crests.rainbow)&&manifest.crests.rainbow.length>=5);
});

test('race state selects left and right corner clips that the v3 model ships',()=>{
  assert.equal(selectClip({corner:true}),'Run_Corner');
  assert.equal(selectClip({corner:true,turn:'right'}),'Run_Corner_R');
  assert.equal(selectClip({spurting:true,corner:true,turn:'right'}),'Run_LastSpurt');
  assert.equal(manifest.clips.Run_Corner.turn,'left');
  assert.equal(manifest.clips.Run_Corner_R.turn,'right');
  for(const flags of [{},{waiting:true},{starting:true},{corner:true,turn:'right'},{downhill:true},{spurting:true}])
    assert.ok(gltf.animations.some(a=>a.name===selectClip(flags)),JSON.stringify(flags));
  assert.ok(manifest.clips.Run_LastSpurt.groundSpeed>manifest.clips.Run_Cruise.groundSpeed);
});
