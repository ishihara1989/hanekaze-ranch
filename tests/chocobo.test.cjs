const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {CLIPS,selectClip}=require('../public/js/chocobo-animation.js');
const dir=path.join(__dirname,'../public/assets/chocobo');
const blob=fs.readFileSync(path.join(dir,'chocobo-racer.glb'));
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
test('GLB ships a skinned, recolorable character and precisely six authored clips',()=>{
  assert.equal(blob.toString('utf8',0,4),'glTF');
  assert.equal(blob.readUInt32LE(4),2);
  assert.equal(blob.readUInt32LE(8),blob.length);
  assert.deepEqual(gltf.animations.map(a=>a.name).sort(),[...CLIPS].sort());
  assert.equal(gltf.skins.length,1);
  assert.equal(gltf.skins[0].joints.length,14);
  for(const name of ['Plumage_Gold','Plumage_Light','Plumage_Shadow'])assert.ok(gltf.materials.some(m=>m.name===name));
  assert.equal(gltf.images?.length||0,0,'no external textures needed');
  for(const m of gltf.meshes)for(const p of m.primitives){assert.ok(p.attributes.JOINTS_0!==undefined);assert.ok(p.attributes.WEIGHTS_0!==undefined);}
});
test('every clip loops without a pose jump and uses the documented duration',()=>{
  for(const clip of gltf.animations){
    let duration=0;
    for(const sampler of clip.samplers){
      const times=values(sampler.input).flat(),frames=values(sampler.output);
      assert.ok(times.every((t,i)=>Number.isFinite(t)&&(i===0||t>times[i-1])),clip.name);
      assert.ok(frames.flat().every(Number.isFinite),clip.name);
      frames[0].forEach((v,i)=>assert.ok(Math.abs(v-frames.at(-1)[i])<1e-4,`${clip.name}: loop component ${i}`));
      duration=Math.max(duration,times.at(-1)-times[0]);
    }
    assert.ok(Math.abs(duration-manifest.clips[clip.name].seconds)<1e-4,clip.name);
  }
});
test('cruise folds wings; all four race events spread wings, with deterministic precedence',()=>{
  assert.equal(selectClip(),'Run_Cruise');
  for(const [flag,name] of [['corner','Run_Corner'],['downhill','Run_Downhill'],['starting','Run_StartDash'],['spurting','Run_LastSpurt']]){
    const clip=selectClip({[flag]:true});assert.equal(clip,name);assert.equal(manifest.clips[clip].wings,'spread');
  }
  assert.equal(selectClip({waiting:true,starting:true}),'Idle');
  assert.equal(selectClip({finished:true,spurting:true}),'Idle');
  assert.equal(selectClip({spurting:true,corner:true}),'Run_LastSpurt');
  assert.equal(manifest.clips.Run_Cruise.wings,'closed');
});
