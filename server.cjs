const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/css/style.css':'css/style.css','/js/game.js':'js/game.js','/js/model.js':'js/model.js','/js/world.js':'js/world.js','/js/world-views.js':'js/world-views.js'};
for (const file of ['chocobo-preview.html','js/chocobo-preview.js','js/chocobo-animation.js',
  'genetics-preview.html','js/genetics-preview.js','css/genetics-preview.css','js/ranch-observation.js',
  'css/ranch.css','js/ranch-engine.js','js/ranch-ui.js','js/trait-mapping.js','js/ranch-genetics.js','js/ranch-ground.js','js/race-course.js','js/ranch-race.js','js/ranch-breeding.js',
  'css/race-viewer.css','js/race-replay.js','js/race-viewer.js','assets/commentators/lamia.png','assets/commentators/sahagin.png',
  'assets/moogle/trainer.png',
  ...['neutral','talk','happy','motivated','sad','disappointed','overjoyed','ambiguous-smile'].map(expression=>`assets/shiroma/shiroma-${expression}.png`),
  'balance-lab.html','css/balance-lab.css','js/race-physics.js','js/balance-presets.js','js/balance-runner.js','js/balance-worker.js','js/balance-lab.js',
  'vendor/three/three.module.js','vendor/three/GLTFLoader.js','vendor/three/OrbitControls.js','vendor/three/BufferGeometryUtils.js',
  'assets/chocobo/chocobo-racer.glb','assets/chocobo/chocobo-racer.blend','assets/chocobo/manifest.json',
  'assets/chocobo/preview-cruise.png','assets/chocobo/preview-spread.png',
  ...['chocobo-v3.glb','chocobo-v3.blend','manifest.json',...['idle','cruise','corner','spurt','front','side','back','colors'].map(view=>`preview-${view}.png`)]
    .map(file=>`assets/chocobo-v3/${file}`)]) files['/'+file]=file;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.glb':'model/gltf-binary','.blend':'application/octet-stream','.json':'application/json; charset=utf-8','.png':'image/png'};
const port = Number(process.env.PORT || 4173);
http.createServer((req,res)=>{
  const file=files[new URL(req.url,'http://localhost').pathname];
  if(!file){res.writeHead(404);res.end('Not found');return;}
  fs.readFile(path.join(__dirname,'public',file),(error,data)=>{
    if(error){res.writeHead(500);res.end('Cannot read file');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});res.end(data);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Hanekaze Ranch: http://127.0.0.1:${port}`));
