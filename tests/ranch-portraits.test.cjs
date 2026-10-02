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
