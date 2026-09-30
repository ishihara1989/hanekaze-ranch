'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const R=require('../public/js/ranch-engine.js');
function boot(saved,failSave=false){
  const elements=new Map(),handlers={},storage=new Map(saved?[[R.SAVE_KEY,saved]]:[]);
  const node=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'',focus(){},dataset:{},classList:{toggle(){}},matches(){return false;}});return elements.get(key);};
  const ctx=vm.createContext({Ranch:R,console,document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(k,f)=>handlers[k]=f,body:node('body'),activeElement:node('active')},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(failSave)throw Error('quota');storage.set(k,v);}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1;},window:{scrollTo(){},addEventListener(){}}});
  const source=fs.readFileSync(require.resolve('../public/js/ranch-ui.js'),'utf8');
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.hooks={get state(){return state},get modal(){return modal},get saveOK(){return saveOK},get page(){return page},advance,render};})();`),ctx);
  return {h:ctx.hooks,node,storage,click(action,data={}){handlers.click({target:{closest:()=>({dataset:{action,...data},disabled:false})}});},change(id,value,data={}){return handlers.change({target:{id,value,dataset:data,matches(){return false;}}});},key(key){handlers.keydown({key,preventDefault(){},target:{closest:()=>({dataset:{action:'sire-tab'}})}});}};
}
const html=g=>g.node('#app').innerHTML;
function purchase(g){g.click('buy-dialog',{id:g.h.state.sale[0]});g.click('buy-confirm',{id:g.h.state.sale[0]});g.click('ack');}
test('new UI exposes one tutorial action, hides numeric traits and renders every deliberate destination',()=>{
  const g=boot();assert.match(html(g),/牧場の、はじめの日/);assert.match(html(g),/繁殖牝羽セールへ/);assert.doesNotMatch(html(g),/最高速|遺伝品質/);
  for(const page of ['birds','market','breed','facilities','notebook','settings']){g.click('nav',{page});assert.equal(g.h.page,page);assert.match(html(g),/<h1>/);assert.doesNotMatch(html(g),/class="notice"/);}
});
test('purchase and breeding are reviewable before payment, with a clear route back to the weekly loop',async()=>{
  const g=boot(),before=g.h.state.money;g.click('nav',{page:'market'});g.click('buy-dialog',{id:g.h.state.sale[0]});assert.equal(g.h.state.money,before);assert.match(html(g),/17,200 G/);g.click('close');assert.equal(g.h.state.money,before);
  purchase(g);g.click('nav',{page:'breed'});g.click('breed-dialog');assert.match(html(g),/600 G/);g.click('breed-confirm');assert.equal(g.h.state.stage,'grow');g.click('ack');
  await g.h.advance(4);assert.equal(g.h.state.week,13);assert.ok(g.h.state.reports.some(r=>r.type==='birth'));assert.ok(R.own(g.h.state).some(b=>b.role==='young'));
  const restored=boot(g.storage.get(R.SAVE_KEY));assert.equal(restored.h.state.week,13);assert.deepEqual(JSON.parse(JSON.stringify(restored.h.state)),JSON.parse(JSON.stringify(g.h.state)));
});
test('reset cancellation preserves everything; confirmation returns to March with zero owned birds',()=>{
  const g=boot();purchase(g);const original=JSON.stringify(g.h.state);g.click('nav',{page:'settings'});g.click('reset-dialog');assert.equal(g.h.modal.type,'reset');assert.match(html(g),/取り消せません/);assert.match(html(g),/data-autofocus/);assert.equal(JSON.stringify(g.h.state),original);
  g.click('close');assert.equal(JSON.stringify(g.h.state),original);g.click('reset-confirm');assert.equal(JSON.stringify(g.h.state),original,'cannot reset without the confirmation dialog');
  g.click('reset-dialog');g.click('reset-confirm');assert.equal(g.h.state.week,9);assert.equal(g.h.state.money,20000);assert.equal(R.own(g.h.state).length,0);assert.equal(g.h.state.reports.length,0);assert.equal(g.h.state.stage,'buy');
  const reloaded=boot(g.storage.get(R.SAVE_KEY));assert.equal(R.own(reloaded.h.state).length,0);assert.equal(reloaded.h.state.week,9);
});
test('details reveal personality, current abilities and inherited quality only at the research gates',()=>{
  const g=boot();purchase(g);const id=R.own(g.h.state)[0].id;g.click('detail',{id});assert.doesNotMatch(html(g),/走る意欲|最高速|遺伝品質/);
  g.h.state.facilities.lab=1;g.h.render();assert.match(html(g),/走る意欲/);assert.doesNotMatch(html(g),/最高速|遺伝品質/);
  g.h.state.facilities.lab=2;g.h.render();assert.match(html(g),/最高速/);assert.doesNotMatch(html(g),/遺伝品質/);
  g.h.state.facilities.lab=3;g.h.render();assert.match(html(g),/遺伝品質/);
});
test('bad save stays intact until explicit reset; storage failure is visible',()=>{
  const g=boot('{bad json');assert.equal(g.storage.get(R.SAVE_KEY),'{bad json');assert.equal(g.h.saveOK,false);assert.match(html(g),/元のデータを保護/);
  g.click('reset-dialog');g.click('reset-confirm');assert.ok(R.validState(JSON.parse(g.storage.get(R.SAVE_KEY))));assert.equal(g.h.saveOK,true);
  const unavailable=boot(undefined,true);assert.equal(unavailable.h.saveOK,false);assert.match(html(unavailable),/自動保存ができません/);
});
test('bird names are escaped in dialogue and rendered detail content',()=>{
  const g=boot();purchase(g);const b=R.own(g.h.state)[0];b.name='<img src=x>';g.click('detail',{id:b.id});assert.match(html(g),/&lt;img src=x&gt;/);assert.doesNotMatch(html(g),/<img src=x>/);
});

const listedSires=g=>[...html(g).matchAll(/data-action="select-sire" data-id="([^"]+)"/g)].map(m=>R.bird(g.h.state,m[1]));
const selectedSire=g=>html(g).match(/data-action="select-sire" data-id="([^"]+)" aria-pressed="true"/)?.[1];

test('sire tabs separate source, other ranch, founder and home candidates and remember selection',()=>{
  const g=boot();purchase(g);
  const base=R.sires(g.h.state)[0];
  for(const [kind,name] of [['founder','私の始祖'],['home','私の種牡羽']])g.h.state.birds.push({...JSON.parse(JSON.stringify(base)),id:`bird-${g.h.state.serial++}`,kind,owner:'player',name});
  g.click('nav',{page:'breed'});
  assert.equal(listedSires(g).length,32);assert.ok(listedSires(g).every(b=>b.kind==='root'));
  const selected=listedSires(g)[7];g.click('select-sire',{id:selected.id});
  g.click('sire-tab',{tab:'public'});assert.equal(listedSires(g).length,2);assert.ok(listedSires(g).every(b=>b.owner==='public'));
  const publicSire=selectedSire(g);g.click('breed-dialog');assert.match(html(g),new RegExp(R.bird(g.h.state,publicSire).name));g.click('close');
  g.click('sire-tab',{tab:'founder'});assert.deepEqual(listedSires(g).map(b=>b.name),['私の始祖']);assert.match(html(g),/無料/);
  g.click('sire-tab',{tab:'home'});assert.deepEqual(listedSires(g).map(b=>b.name),['私の種牡羽']);
  g.click('sire-tab',{tab:'root'});assert.equal(selectedSire(g),selected.id);
  g.click('sire-tab',{tab:'public'});assert.equal(selectedSire(g),publicSire);
  const mother=R.own(g.h.state).find(b=>b.role==='mare'),before=g.h.state.money;
  g.click('breed-dialog');g.click('breed-confirm');assert.equal(mother.pregnancy.sireId,publicSire);assert.equal(g.h.state.money,before-R.breedFee(R.bird(g.h.state,publicSire)));
});

test('empty sire tabs clear hidden choices, explain availability and disable breeding',()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  for(const tab of ['founder','home']){
    g.click('sire-tab',{tab});assert.equal(listedSires(g).length,0);assert.equal(selectedSire(g),undefined);
    assert.match(html(g),/data-action="breed-dialog" disabled/);assert.match(html(g),/まだいません/);
    g.click('breed-dialog');assert.equal(g.h.modal,null);assert.equal(R.own(g.h.state)[0].pregnancy,null);
  }
  g.click('sire-tab',{tab:'root'});assert.equal(listedSires(g).length,32);
});

test('strength filter exposes four donors per inherited trait and tabs support arrow navigation',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  for(const trait of [...R.Mapping.ABILITIES.map(a=>a.key),...Object.keys(R.MANAGEMENT),...Object.keys(R.PERSONALITY)]){
    await g.change('root-trait',trait);assert.equal(listedSires(g).length,4);
    assert.ok(listedSires(g).every(b=>{const p=R.ROOTS.find(p=>p.lineage===b.lineage);return p.primary===trait||p.secondary===trait;}));
    assert.match(html(g),/4 \/ 32羽/);assert.doesNotMatch(html(g),/遺伝品質/);
  }
  g.key('ArrowRight');assert.ok(listedSires(g).every(b=>b.owner==='public'));assert.equal(listedSires(g).length,2);
  g.key('End');assert.match(html(g),/id="sire-tab-home"[^>]*aria-selected="true"/);
  g.key('ArrowRight');assert.match(html(g),/id="sire-tab-root"[^>]*aria-selected="true"/);assert.equal(listedSires(g).length,4);
  g.key('ArrowLeft');assert.match(html(g),/id="sire-tab-home"[^>]*aria-selected="true"/);
  g.key('Home');await g.change('root-trait','');assert.equal(listedSires(g).length,32);
});

test('loading an earlier v4 catalog upgrades to 32 sources without resetting the ranch',()=>{
  const s=R.initial();R.buy(s,s.sale[0]);delete s.rootCatalogVersion;
  s.birds=s.birds.filter(b=>b.kind!=='root'||Number(b.lineage.split('-')[1])<4);
  const original=JSON.parse(JSON.stringify(s)),g=boot(JSON.stringify(s));
  assert.equal(R.sires(g.h.state).filter(b=>b.kind==='root').length,32);assert.equal(g.h.state.money,original.money);
  assert.equal(JSON.stringify(R.own(g.h.state)),JSON.stringify(R.own(original)));
  assert.ok(R.validState(JSON.parse(g.storage.get(R.SAVE_KEY))));
});

test('new surface and growth strengths can filter sources while gold alleles remain hidden',async()=>{
  const g=boot();purchase(g);g.click('nav',{page:'breed'});
  for(const key of Object.keys(R.Genetics.APTITUDES)){
    await g.change('root-trait',key);assert.equal(listedSires(g).length,16);
    assert.ok(listedSires(g).every(b=>R.Genetics.mean(b.genome.traits.aptitude[key])===1));
  }
  for(const key of Object.keys(R.Genetics.DEVELOPMENT)){
    await g.change('root-trait',key);assert.equal(listedSires(g).length,8);
    assert.ok(listedSires(g).every(b=>R.Genetics.mean(b.genome.traits.development[key])===1));
  }
  await g.change('root-trait','');assert.match(html(g),/羽色：金 \/ 額羽：青/);
  assert.doesNotMatch(html(g),/金因子|G\/g|1\/2000/);
});

test('body and crest render separately; research reveals ground and growth at their intended stages',()=>{
  const g=boot();purchase(g);const b=R.own(g.h.state)[0];
  b.genome.traits.body=['black','white'];b.color='black';b.genome.traits.crest='rainbow';b.crest='rainbow';
  g.click('detail',{id:b.id});assert.match(html(g),/羽色：黒 \/ 額羽：虹/);assert.match(html(g),/<linearGradient id="crest-/);
  assert.match(html(g),/fill="#454653"/);assert.doesNotMatch(html(g),/成長と加齢の遺伝|<h3>羽場適性/);
  g.h.state.facilities.lab=2;g.h.render();assert.match(html(g),/<h3>羽場適性/);assert.match(html(g),/min="0" max="100"/);assert.doesNotMatch(html(g),/成熟の目安/);
  g.h.state.facilities.lab=3;g.h.render();assert.match(html(g),/成熟の目安/);assert.match(html(g),/衰え始め/);assert.match(html(g),/羽色因子/);assert.doesNotMatch(html(g),/金因子/);
});
