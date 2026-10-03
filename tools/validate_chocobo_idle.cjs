'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PNG}=require(require.resolve('pngjs',{paths:[__dirname,process.env.NODE_PATH,
  path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean)}));
const P=require('../public/js/ranch-portraits.js');
const report=[];
for(const stage of ['chick','yearling','adult']){
  const image=PNG.sync.read(fs.readFileSync(path.join(__dirname,`../public/assets/chocobo-portraits/${stage}-idle-v3.png`)));
  assert.equal(image.width,image.height);assert.equal(image.width%2,0);
  const frames=[],cells=P.spriteCells(stage,image.width,image.height);
  for(let f=0;f<4;f++){
    const c=cells[f],pixels=new Uint8ClampedArray(c.width*c.height*4);
    for(let y=0;y<c.height;y++)pixels.set(image.data.subarray(((c.y+y)*image.width+c.x)*4,
      ((c.y+y)*image.width+c.x+c.width)*4),y*c.width*4);
    const bounds=P.frameBounds(pixels,c.width,c.height);
    let transparent=0,body=0,crest=0;
    for(let i=0;i<pixels.length;i+=4){
      if(!pixels[i+3]){transparent++;continue;}
      if(pixels[i]-pixels[i+1]>35&&pixels[i+2]-pixels[i+1]>20)crest++;
      else if(Math.max(...pixels.subarray(i,i+3))-Math.min(...pixels.subarray(i,i+3))<25)body++;
    }
    assert.ok(transparent>c.width*c.height*.35,'Each frame has real transparency');
    assert.ok(body>10000,'Each frame has recolorable feathers');
    assert.ok(stage==='adult'?crest>1000:crest<100,'Only adult frames have forehead masks');
    assert.ok(bounds.left>0&&bounds.top>0&&bounds.right<c.width-1&&bounds.bottom<c.height-1,'Full character is inside its cell');
    const before=Buffer.from(pixels);P.recolor(pixels,c.width,c.height,'blue','rainbow',stage,bounds.footTop);
    for(let i=0;i<pixels.length;i+=4){
      assert.equal(pixels[i+3],before[i+3],'Recoloring preserves alpha');
      if(before[i+3]>=128&&Math.floor(i/4/c.width)>=bounds.footTop)assert.deepEqual([...pixels.subarray(i,i+3)],[...before.subarray(i,i+3)],'Feet and ivory claws retain their colors');
      if(before[i]-before[i+1]>35&&before[i+2]-before[i+1]>20&&stage==='adult')
        assert.notDeepEqual([...pixels.subarray(i,i+3)],[...before.subarray(i,i+3)],'Every forehead pixel is recolored');
    }
    frames.push({frame:f,bounds,transparent,body,crest});
  }
  const poses=P.registration(frames.map(f=>f.bounds),512);
  const grounds=poses.map((p,i)=>p.y+frames[i].bounds.bottom*p.scale);
  assert.ok(Math.max(...grounds)-Math.min(...grounds)<1e-8,'Feet remain on the same ground');
  report.push({stage,width:image.width,height:image.height,frames,poses});
}
console.log(JSON.stringify(report,null,2));
