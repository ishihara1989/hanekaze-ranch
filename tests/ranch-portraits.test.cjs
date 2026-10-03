'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../public/js/ranch-portraits.js'),G=require('../public/js/ranch-genetics.js');
test('portrait age boundaries use adults for ageless bloodlines and hide juvenile crest differences',()=>{
  for(const [age,stage] of [[0,'chick'],[1,'yearling'],[2,'adult'],[12,'adult'],[null,'adult']])assert.equal(P.stageFor(age),stage);
  for(const age of [0,1]){
    assert.equal(P.markup({color:'blue',crest:'rainbow'},age),P.markup({color:'blue',crest:'black'},age));
    assert.doesNotMatch(P.markup({color:'blue',crest:'rainbow'},age),/額羽/);
  }
  assert.match(P.markup({color:'blue',crest:'rainbow'},2),/額羽：虹/);
  assert.equal(P.appearance({color:'bad',crest:'bad'},null).color,'yellow');
});
test('all inherited colors shade feathers while alpha, amber beak and dark eyes survive',()=>{
  for(const color of Object.keys(G.COLORS)){
    const pixels=new Uint8ClampedArray([240,239,236,201,255,159,30,255,25,24,23,255,0,0,0,0]);
    P.recolor(pixels,4,1,color,'yellow','adult');
    assert.equal(pixels[3],201);assert.deepEqual([...pixels.slice(4,12)],[255,159,30,255,25,24,23,255]);assert.deepEqual([...pixels.slice(12)],[0,0,0,0]);
    assert.ok(pixels[0]>20);assert.notDeepEqual([...pixels.slice(0,3)],[240,239,236]);
  }
  const shade=new Uint8ClampedArray([240,240,240,255,150,150,150,255]);P.recolor(shade,2,1,'blue','yellow','chick');assert.ok(shade[2]>shade[6]);
});
test('adult forehead is independently recolored, with a spatial rainbow and no magenta residue',()=>{
  for(const crest of Object.keys(G.CRESTS)){
    const pixels=new Uint8ClampedArray([230,40,200,255,230,40,200,200]);P.recolor(pixels,1,2,'blue',crest,'adult');
    assert.deepEqual([pixels[3],pixels[7]],[255,200]);
    assert.notDeepEqual([...pixels.slice(0,3)],[230,40,200]);
    if(crest==='rainbow')assert.notDeepEqual([...pixels.slice(0,3)],[...pixels.slice(4,7)]);
  }
});
test('rainbow forehead spans all six podium hues despite faint magenta speckles',()=>{
  const pixels=new Uint8ClampedArray(8*4*4);
  for(let x=1;x<=6;x++)pixels.set([240,40,210,255],(8+x)*4);
  pixels.set([255,0,255,1],(3*8)*4);
  pixels.set([240,240,240,255],0);
  const solid=pixels.slice();P.recolor(solid,8,4,'blue','red','adult');
  P.recolor(pixels,8,4,'blue','rainbow','adult');
  const rgb=x=>[...pixels.slice((8+x)*4,(8+x)*4+3)];
  const [purple,blue,green,yellow,orange,red]=[1,2,3,4,5,6].map(rgb);
  assert.ok(purple[2]>purple[0]&&purple[0]>purple[1]);
  assert.ok(blue[2]>blue[1]&&blue[1]>blue[0]);
  assert.ok(green[1]>green[0]*1.5&&green[1]>green[2]*1.5);
  assert.ok(yellow[0]>yellow[2]*2&&yellow[1]>yellow[2]*2);
  assert.ok(orange[0]>orange[1]&&orange[1]>orange[2]*2);
  assert.ok(red[0]>red[1]*2&&red[0]>red[2]*2);
  assert.deepEqual([...pixels.slice(0,4)],[...solid.slice(0,4)]);
  assert.equal(pixels[3*8*4+3],1);
});
test('four breathing poses share planted feet without flattening their height differences',()=>{
  const bounds=[
    {left:10,right:90,top:12,bottom:95,footX:45},
    {left:18,right:98,top:19,bottom:103,footX:53},
    {left:4,right:84,top:4,bottom:89,footX:39},
    {left:13,right:93,top:14,bottom:98,footX:48}
  ];
  const aligned=P.registration(bounds,512);
  assert.equal(P.SPRITE.frames,4);
  const ground=aligned[0].y+bounds[0].bottom*aligned[0].scale;
  const foot=aligned[0].x+bounds[0].footX*aligned[0].scale;
  aligned.forEach((a,i)=>{
    assert.equal(a.scale,aligned[0].scale);
    assert.ok(Math.abs(a.y+bounds[i].bottom*a.scale-ground)<1e-8);
    assert.ok(Math.abs(a.x+bounds[i].footX*a.scale-foot)<1e-8);
    assert.ok(a.y+bounds[i].top*a.scale>=512*.079);
  });
  assert.ok(aligned[2].y+bounds[2].top*aligned[2].scale<aligned[0].y+bounds[0].top*aligned[0].scale);
});
test('sprite registration anchors amber feet and ignores nearly transparent edge noise',()=>{
  const pixels=new Uint8ClampedArray(10*10*4);
  const put=(x,y,r,g,b,a=255)=>pixels.set([r,g,b,a],(y*10+x)*4);
  put(0,0,255,0,0,30);put(2,2,240,240,240);put(7,5,200,200,200);
  put(3,8,240,140,30);put(5,9,240,140,30);
  assert.deepEqual(P.frameBounds(pixels,10,10),{left:2,right:7,top:2,bottom:9,footX:4,footTop:8});
  assert.throws(()=>P.frameBounds(new Uint8ClampedArray(16),2,2),/Empty portrait/);
});
test('near-white toenails retain the podium style when feathers change color',()=>{
  const pixels=new Uint8ClampedArray([240,239,236,255,250,243,227,255]);
  P.recolor(pixels,1,2,'blue','red','adult',1);
  assert.ok(pixels[2]>pixels[0]);
  assert.deepEqual([...pixels.slice(4)],[250,243,227,255]);
});
test('adult source cells contain the full tail before registration and mirroring',()=>{
  const cells=P.spriteCells('adult',1254,1254);
  assert.deepEqual(cells[0],{x:0,y:0,width:660,height:627});
  assert.deepEqual(cells[3],{x:660,y:627,width:594,height:627});
  assert.equal(cells[0].width+cells[1].width,1254);
  assert.deepEqual(P.spriteCells('chick',1254,1254)[3],{x:627,y:627,width:627,height:627});
});
