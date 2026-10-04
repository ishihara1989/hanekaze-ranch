const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/css/style.css':'css/style.css','/js/game.js':'js/game.js','/js/model.js':'js/model.js','/js/world.js':'js/world.js','/js/world-views.js':'js/world-views.js'};
for (const file of ['chocobo-preview.html','js/chocobo-preview.js','js/chocobo-animation.js',
  'js/ranch-portraits.js','css/ranch-portraits.css','js/ranch-characters.js','css/ranch-characters.css','chocobo-portrait-preview.html','js/chocobo-portrait-preview.js',
  ...['adult','yearling','chick'].map(stage=>`assets/chocobo-portraits/${stage}-v1.png`),
  ...['adult','yearling','chick'].map(stage=>`assets/chocobo-portraits/${stage}-idle-v3.png`),
  'chocobo-sprite-preview.html',...['run-yellow.png','run-blue.png','run-rainbow-crest.png'].map(file=>`assets/chocobo-sprite-study/${file}`),
  'js/chocobo-sprite-preview.js',...['run-yellow-v2.png','regions-v2.png','run-yellow-v3.png','regions-v3.png','run-yellow-v4.png','regions-v4.png','run-golden-metallic-v1.png'].map(file=>`assets/chocobo-sprite-study/${file}`),
  ...['v2','v3','v4','v5'].flatMap(revision=>['manifest.json','body-mask.png','crest-mask.png',
    ...['yellow','red','blue','green','rose','white','black','purple','gray','golden'].map(color=>`body-${color}.png`),
    ...['yellow','red','blue','white','black','rainbow'].map(color=>`crest-${color}.png`)].map(file=>`assets/chocobo-sprite-study/${revision}/${file}`)),
  ...['run-spurt-yellow-v1.png','regions-spurt-v1.png','run-spurt-golden-metallic-v1.png'].map(file=>`assets/chocobo-sprite-study/${file}`),
  ...['manifest.json','body-mask.png','crest-mask.png',
    ...['yellow','red','blue','green','rose','white','black','purple','gray','golden'].map(color=>`body-${color}.png`),
    ...['yellow','red','blue','white','black','rainbow'].map(color=>`crest-${color}.png`)].map(file=>`assets/chocobo-sprite-study/v5/spurt/${file}`),
  ...['walk-yellow-v1.png','regions-walk-v1.png','walk-golden-metallic-v1.png'].map(file=>`assets/chocobo-sprite-study/${file}`),
  ...['walk-yellow-v2.png','regions-walk-v2.png','walk-golden-metallic-v2.png'].map(file=>`assets/chocobo-sprite-study/${file}`),
  ...['manifest.json','body-mask.png','crest-mask.png',
    ...['yellow','red','blue','green','rose','white','black','purple','gray','golden'].map(color=>`body-${color}.png`),
    ...['yellow','red','blue','white','black','rainbow'].map(color=>`crest-${color}.png`)].map(file=>`assets/chocobo-sprite-study/v5/walk/${file}`),
  ...['podium-yellow-v1.png','regions-podium-v1.png','podium-golden-metallic-v1.png'].map(file=>`assets/chocobo-sprite-study/${file}`),
  ...['manifest.json','body-mask.png','crest-mask.png',
    ...['yellow','red','blue','green','rose','white','black','purple','gray','golden'].map(color=>`body-${color}.png`),
    ...['yellow','red','blue','white','black','rainbow'].map(color=>`crest-${color}.png`)].map(file=>`assets/chocobo-sprite-study/v5/podium/${file}`),
  'genetics-preview.html','js/genetics-preview.js','css/genetics-preview.css','js/ranch-observation.js',
  'css/ranch.css','js/ranch-engine.js','js/ranch-ui.js','js/ranch-library.js','js/ranch-storage.js','js/ranch-names.js','js/trait-mapping.js','js/ranch-genetics.js','js/ranch-ground.js','js/race-course.js','js/ranch-race.js','js/ranch-breeding.js',
  'css/race-viewer.css','js/race-replay.js','js/race-viewer.js','js/race-playback.js',
  'race-2d-preview.html','race-2d-backgrounds.html',...['manifest-v1.json','prompts-v1.json',...['tenku','oukyu','mitsurin','sunahama','iseki','haikou'].map(id=>id+'-v1.png')].map(file=>'assets/race-2d-backgrounds/'+file),'js/race-2d-course.js','js/race-2d-graphics.js','js/race-viewer-2d.js','js/race-2d-preview.js','css/race-2d-preview.css',
  'assets/commentators/lamia.png','assets/commentators/sahagin.png',
  'assets/moogle/trainer.png',
  'assets/home-backgrounds/preview.html',
  ...['spring','summer','autumn','winter'].map(season=>`assets/home-backgrounds/${season}-v1.webp`),
  ...Object.entries(require('./public/js/ranch-engine.js').FACILITIES).flatMap(([key,f])=>Array.from({length:f.max},(_,i)=>`assets/facilities/${key}-lv${i+1}-v1.webp`)),
  ...['neutral','talk','happy','motivated','sad','disappointed','overjoyed','ambiguous-smile'].map(expression=>`assets/shiroma/shiroma-${expression}.png`),
  'balance-lab.html','css/balance-lab.css','js/race-physics.js','js/balance-presets.js','js/balance-runner.js','js/balance-worker.js','js/balance-lab.js',
  'vendor/three/three.module.js','vendor/three/GLTFLoader.js','vendor/three/OrbitControls.js','vendor/three/BufferGeometryUtils.js',
  'assets/chocobo/chocobo-racer.glb','assets/chocobo/chocobo-racer.blend','assets/chocobo/manifest.json',
  'assets/chocobo/preview-cruise.png','assets/chocobo/preview-spread.png',
  ...['chocobo-v3.glb','chocobo-v3.blend','manifest.json',...['idle','cruise','corner','spurt','front','side','back','colors'].map(view=>`preview-${view}.png`)]
    .map(file=>`assets/chocobo-v3/${file}`)]) files['/'+file]=file;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.glb':'model/gltf-binary','.blend':'application/octet-stream','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp'};
const port = Number(process.env.PORT || 4173);
http.createServer((req,res)=>{
  const file=files[new URL(req.url,'http://localhost').pathname];
  if(!file){res.writeHead(404);res.end('Not found');return;}
  fs.readFile(path.join(__dirname,'public',file),(error,data)=>{
    if(error){res.writeHead(500);res.end('Cannot read file');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});res.end(data);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Hanekaze Ranch: http://127.0.0.1:${port}`));
