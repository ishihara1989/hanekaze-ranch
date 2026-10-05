'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const R=require('../tools/lib/ranch-fixtures.cjs').R,W=require('../public/js/world.js');
const RanchObservation=require('../public/js/ranch-observation.js');
const RanchLibrary=require('../public/js/ranch-library.js');
const RanchCharacters=require('../public/js/ranch-characters.js');
const uiBase=process.env.RANCH_UI_BASE_URI||'http://localhost/';
const uiSource=process.env.RANCH_UI_SOURCE||require.resolve('../public/js/ranch-ui.js');
const RanchPortraits={...require('../public/js/ranch-portraits.js'),hydrate(){}};
async function boot(saved,failSave=false,failRead=false,autoStart=true){
  const elements=new Map(),handlers={},windowHandlers={},queryLists={},storage=new Map(saved instanceof Map?saved:saved?[[R.SAVE_KEY,saved]]:[]);
  const node=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'',focus(){},dataset:{},classList:{toggle(){}},matches(){return false;}});return elements.get(key);};

  const read=async key=>{if(typeof failRead==='function'?failRead(key):failRead)throw Error('denied');return storage.get(key)??null;};
  const write=async (key,value,expected)=>{if(expected!==undefined&&(storage.get(key)??null)!==expected)throw Object.assign(Error('changed'),{code:'changed'});if(typeof failSave==='function'?failSave(key):failSave)throw Error('quota');storage.set(key,value);};
  const store={init:async keys=>new Map(await Promise.all(keys.map(async key=>[key,await read(key)]))),read,readAll:async keys=>new Map(await Promise.all(keys.map(async key=>{try{return [key,await read(key)];}catch{return [key,undefined];}}))),write,restore:async (slot,expected,key,value,expectedAutosave)=>{if(await read(slot)!==expected)throw Object.assign(Error('changed'),{code:'changed'});await write(key,value,expectedAutosave);},subscribe(){}};
  const ctx=vm.createContext({RanchStorage:{create:()=>store},Ranch:R,RanchObservation,RanchLibrary,RanchCharacters,RanchPortraits,RanchWorld:W,console,URL,document:{baseURI:uiBase,querySelector:node,querySelectorAll:selector=>queryLists[selector]||[],addEventListener:(k,f)=>handlers[k]=f,body:node('body'),activeElement:node('active')},localStorage:{getItem:k=>{if(typeof failRead==='function'?failRead(k):failRead)throw Error('denied');return storage.get(k)??null;},setItem:(k,v)=>{if(typeof failSave==='function'?failSave(k):failSave)throw Error('quota');storage.set(k,v);}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1;},window:{scrollTo(){},addEventListener:(k,f)=>windowHandlers[k]=f}});
  const source=fs.readFileSync(uiSource,'utf8');
  await vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.hooks={get state(){return state},get modal(){return modal},get saveOK(){return saveOK},get page(){return page},setViewer(value){raceViewer=value},advance,render};})();`),ctx);
  if(autoStart&&ctx.hooks.modal?.type==='new-game')await handlers.click({target:{closest:()=>({dataset:{action:'start-confirm'},disabled:false})}});
  return {h:ctx.hooks,node,storage,store,setQuery(selector,values){queryLists[selector]=values;},backdrop(){return handlers.click({target:{classList:{contains:name=>name==='modal-backdrop'},closest:()=>null}});},inside(){return handlers.click({target:{classList:{contains:()=>false},closest:()=>null}});},windowEvent(type,event={}){return windowHandlers[type]?.(event);},click(action,data={}){return handlers.click({target:{closest:()=>({dataset:{action,...data},disabled:false})}});},change(id,value,data={}){return handlers.change({target:{id,value,dataset:data,matches(){return false;}}});},key(key,options={}){return handlers.keydown({key,preventDefault(){},target:{closest:()=>({dataset:{action:'sire-tab'}})},...options});}};
}
const html=g=>g.node('#app').innerHTML;
const slotKey=slot=>`${R.SAVE_KEY}-slot-${slot}`;
const ranchSnapshot=s=>JSON.stringify({...s,rng:0});

test('reports celebrate completed wins at two levels while ordinary reports and unfinished races stay quiet',async()=>{
  const g=await boot(),s=g.h.state,b=R.own(s)[0];
  for(const [level,rank,finished,tier] of [['GI',2,true,'report'],['GI',1,false,'report'],['maiden',1,true,'victory'],['GIII',1,true,'victory'],['GII',1,true,'victory'],['GI',1,true,'g1'],['G1',1,undefined,'g1']]){
    s.reports=[{id:'tier-report',type:'weekly',week:s.week,title:'今週の報告',text:'おつかれさまでした。',results:[{birdId:b.id,birdName:'アオバ<&>',week:s.week,name:'羽風杯',level,rank,finished,distance:1600,surface:'turf',reward:1200}]}];
    const before=JSON.stringify(s);await g.click('reports');
    assert.match(html(g),new RegExp(`class="modal wide report-modal celebration-${tier}"`));
    if(tier==='report')assert.doesNotMatch(html(g),/victory-banner|result-victory-label/);
    else {
      assert.match(html(g),new RegExp(`class="victory-banner celebration-${tier}"`));
      assert.match(html(g),/アオバ&lt;&amp;&gt;/);assert.doesNotMatch(html(g),/アオバ<&>/);
      assert.equal(html(g).includes('victory-confetti'),tier==='g1');
    }
    assert.equal(JSON.stringify(s),before,'rendering celebration must not alter game data');
  }
  s.reports=[{id:'quiet-report',type:'monthly',week:s.week,title:'牧場だより',text:'元気に育っています。',expression:'overjoyed'}];
  await g.click('reports');assert.match(html(g),/report-modal celebration-report/);assert.doesNotMatch(html(g),/victory-banner/);
});

test('annual awards celebrate only our winners, with the representative above other awards and race wins',async()=>{
  const g=await boot(),s=g.h.state,b=R.own(s)[0],other=s.birds.find(x=>x.owner!=='player');
  const award=(bird,title)=>({year:1,title,birdId:bird.id,name:bird===b?'アオバ<&>':bird.name,farm:'牧場<&>',points:180});
  const annual=awards=>({id:'annual',type:'annual',week:s.week,title:'一年の報告',text:'おつかれさまでした。',awards});
  for(const [awards,tier] of [
    [[award(other,'年度代表羽')],'report'],
    [[award(b,'最優秀3歳'),award(other,'年度代表羽')],'annual-award'],
    [[award(b,'最優秀3歳'),award(other,'最優秀ダート'),award(b,'年度代表羽')],'annual-champion']
  ]){
    s.reports=[annual(awards)];const before=JSON.stringify(s);await g.click('reports');
    assert.match(html(g),new RegExp(`report-modal celebration-${tier}`));
    assert.equal(html(g).includes('award-banner'),tier!=='report');
    assert.equal(html(g).includes('award-winner-champion'),tier==='annual-champion');
    assert.match(html(g),/年度表彰の結果/);
    if(tier!=='report'){
      const banner=html(g).match(/<section class="award-banner[\s\S]*?<\/section>/)[0];
      assert.match(banner,/アオバ&lt;&amp;&gt;/);assert.match(banner,/牧場&lt;&amp;&gt;/);
      assert.doesNotMatch(banner,/最優秀ダート/);
      assert.equal([...banner.matchAll(/class="award-winner /g)].length,1,'combine multiple awards for the same bird');
      if(tier==='annual-champion')assert.match(banner,/2部門を受賞/);
    }
    assert.equal(JSON.stringify(s),before,'celebrating awards must not change saved data');
  }
  const second=R.createBird(s);second.owner='player';second.name='ヒカリ';
  s.reports=[{id:'weekly',type:'weekly',week:s.week,title:'今週',text:'報告',results:[{birdId:b.id,birdName:b.name,week:s.week,name:'羽風杯',level:'GI',rank:1,distance:1600,surface:'turf',reward:1200}]},annual([award(second,'最優秀牝羽'),award(b,'年度代表羽')])];
  await g.click('reports');assert.match(html(g),/report-modal celebration-annual-champion/);
  assert.ok(html(g).indexOf('award-banner')<html(g).indexOf('victory-banner'));
  const banner=html(g).match(/<section class="award-banner[\s\S]*?<\/section>/)[0];
  assert.ok(banner.indexOf('アオバ&lt;&amp;&gt;')<banner.indexOf('ヒカリ'),'feature the representative first');
  assert.equal([...banner.matchAll(/class="award-winner /g)].length,2);
});

test('multi-week reports feature the greatest victory and each result keeps its own celebration when opened',async()=>{
  const g=await boot(),s=g.h.state,b=R.own(s)[0];
  const result=(level,rank,week,name)=>({birdId:b.id,birdName:b.name,week,name,level,rank,finished:true,distance:1600,surface:'turf',reward:1200,field:[{id:b.id,name:b.name,time:90}]});
  const results=[result('GIII',1,s.week,'小さな重賞'),result('GI',2,s.week+1,'惜しいG1'),result('GI',1,s.week+2,'最高峰の杯'),result('maiden',1,s.week+3,'はじめの一歩')];
  b.records=results;s.reports=results.map((r,i)=>({id:`week-${i}`,type:'weekly',week:r.week,title:`第${i+1}週`,text:'今週の報告です。',change:1200,results:[r]}));
  const before=JSON.stringify(s);await g.click('reports');
  assert.match(html(g),/4週のダイジェスト/);
  const banner=html(g).match(/<section class="victory-banner[\s\S]*?<\/section>/)[0];
  assert.match(banner,/G1制覇！/);assert.match(banner,/class="victory-race">G1 最高峰の杯/);
  assert.match(banner,/小さな重賞/);assert.match(banner,/はじめの一歩/);assert.doesNotMatch(banner,/惜しいG1/);
  assert.equal([...html(g).matchAll(/result-row celebration-g1/g)].length,1);
  assert.equal([...html(g).matchAll(/result-row celebration-victory/g)].length,2);
  for(const [index,tier] of [[0,'victory'],[1,'report'],[2,'g1']]){
    await g.click('result',{id:b.id,week:String(results[index].week)});
    assert.match(html(g),new RegExp(`class="modal\\s+celebration-${tier}"`));
    assert.equal(html(g).includes('victory-banner'),tier!=='report');
    await g.click('close');assert.equal(g.h.modal.type,'reports');
  }
  assert.equal(JSON.stringify(s),before);
});
test('notebook shows annual grades and filters short and regional dirt programs without altering the save',async()=>{
  const g=await boot(),before=JSON.stringify(g.h.state);
  await g.click('nav',{page:'notebook'});
  assert.match(html(g),/年間重賞番組表/);assert.match(html(g),/年間179競走/);
  assert.equal([...html(g).matchAll(/data-program-event=/g)].length,179);
  await g.change('calendar-grade','GIII');await g.change('calendar-route','dirt-sprint');
  assert.ok([...html(g).matchAll(/data-program-event=/g)].length>0);
  assert.match(html(g),/地方交流/);assert.doesNotMatch(html(g),/地方交流参考/);assert.match(html(g),/王宮スプリント/);
  assert.doesNotMatch(html(g),/王宮帝王賞|天空大賞典|芝 1200m/);
  await g.change('calendar-route','sprint');
  assert.match(html(g),/シルクロードカーバンクル杯/);assert.doesNotMatch(html(g),/ダート 1200m/);
  assert.equal(JSON.stringify(g.h.state),before);
});
async function purchase(g){await g.click('buy-dialog',{id:g.h.state.sale[0]});await g.click('buy-confirm',{id:g.h.state.sale[0]});await g.click('ack');}

test('library follows the notebook and reading every article leaves ranch, RNG and autosave untouched',async()=>{
  const g=await boot(),before=JSON.stringify(g.h.state),saved=g.storage.get(R.SAVE_KEY);
  await g.click('nav',{page:'library'});
  assert.match(html(g),/data-page="notebook"[\s\S]*data-page="library"/);
  assert.match(html(g),/<h1>図書館<\/h1>/);assert.match(html(g),/2\. 競走羽を増やして賞金を稼ぐ/);
  for(const entry of RanchLibrary.entries){
    await g.click('library-article',{article:entry.id});
    assert.match(html(g),new RegExp(`data-article="${entry.id}" aria-current="true"`));
    assert.equal(g.h.page,'library');assert.equal(JSON.stringify(g.h.state),before);
  }
  assert.equal(g.storage.get(R.SAVE_KEY),saved);
  await g.click('library-article',{article:'unknown'});assert.equal(g.storage.get(R.SAVE_KEY),saved);
});

test('library search supports body text, multiple terms, Enter, clearing and safe empty results',async()=>{
  const g=await boot(),before=JSON.stringify(g.h.state),saved=g.storage.get(R.SAVE_KEY);
  await g.click('nav',{page:'library'});
  g.node('#library-query').value='始祖 7勝';await g.click('library-search');
  assert.match(html(g),/1項目/);assert.match(html(g),/id="library-title">始祖入りの条件/);
  assert.match(html(g),/合計7勝以上/);
  g.node('#library-query').value='GⅠ 3羽';
  await g.key('Enter',{target:{id:'library-query',value:'GⅠ 3羽',matches:()=>true}});
  assert.match(html(g),/始祖入りの条件/);
  g.node('#library-query').value='<script>"&';await g.click('library-search');
  assert.match(html(g),/該当する項目がありません/);assert.match(html(g),/&lt;script&gt;&quot;&amp;/);
  assert.doesNotMatch(html(g),/<script>/);
  await g.change('library-query','');assert.equal(g.storage.get(R.SAVE_KEY),saved);
  await g.click('library-clear');assert.match(html(g),/16項目/);
  assert.equal(JSON.stringify(g.h.state),before);assert.equal(g.storage.get(R.SAVE_KEY),saved);
});

test('rule explanations live in the library and contextual links open the right article without spending',async()=>{
  const g=await boot(),before=JSON.stringify(g.h.state),saved=g.storage.get(R.SAVE_KEY);
  assert.doesNotMatch(html(g),/まずはセールで|次は、お父さん/);
  await g.click('nav',{page:'market'});
  assert.doesNotMatch(html(g),/価格は遺伝する能力の平均/);
  await g.click('library-open',{article:'economy'});assert.match(html(g),/価格は遺伝する能力の平均/);
  await g.click('nav',{page:'notebook'});assert.doesNotMatch(html(g),/2歳は1勝、3歳6月/);
  await g.click('library-open',{article:'racing'});assert.match(html(g),/オープンに必要な勝利数/);
  await g.click('nav',{page:'facilities'});await g.click('build-dialog',{key:'stalls'});
  assert.equal(g.h.modal.type,'build');assert.doesNotMatch(html(g),/有利な因子を受け継ぐ/);
  await g.click('library-open',{article:'facilities'});
  assert.equal(g.h.modal,null);assert.equal(g.h.page,'library');assert.match(html(g),/Lv\.5で55%/);
  assert.equal(JSON.stringify(g.h.state),before);assert.equal(g.storage.get(R.SAVE_KEY),saved);
});

test('notebook lists all G1 first victories and shows saved winner names and dates for grade achievements',async()=>{
  const g=await boot(),s=g.h.state,b=R.own(s)[0];
  const first={week:9,birdId:b.id,birdName:'ハジメノヒカリ',raceName:'チョコボダービー'};
  s.firstWins={graded:first,g2:{...first,raceName:'G2競走'},g1:first,derby:first,'g1:チョコボダービー':first};
  s.milestones.g1=9;s.milestones.derby=9;
  const before=JSON.stringify(s);
  await g.click('nav',{page:'notebook'});await g.click('notebook-tab',{tab:'records'});
  assert.match(html(g),/重賞初制覇/);assert.match(html(g),/G3初制覇/);assert.match(html(g),/G2初制覇/);
  assert.match(html(g),/ハジメノヒカリ/);assert.match(html(g),/1年 3月 第1週/);
  const row=key=>html(g).match(new RegExp(`<div class="list-row" data-first-win="${key}">([\\s\\S]*?)<\\/div>`))[1];
  assert.match(row('g3'),/未勝利/);assert.match(row('g1:チョコボダービー'),/ハジメノヒカリ/);
  assert.match(row('g1:神竜賞'),/未勝利/);
  const names=new Set(Array.from({length:R.YEAR},(_,i)=>R.calendar(i+1)).flat().filter(e=>e.level==='GI').map(e=>e.name));
  assert.equal([...html(g).matchAll(/data-first-win="g1:/g)].length,names.size);
  assert.equal(JSON.stringify(s),before);
  s.firstWins.graded.birdName='<script>危険</script>';g.h.render();
  assert.doesNotMatch(html(g),/<script>危険<\/script>/);assert.match(html(g),/&lt;script&gt;危険&lt;\/script&gt;/);
});

test('paternal source is always visible on owned cards, details, sale cards and every sire tab without research',async()=>{
  const g=await boot(),s=g.h.state,starter=R.own(s)[0];
  const source=R.paternalRoot(s,starter),rng=s.rng;
  await g.click('nav',{page:'birds'});
  assert.match(html(g),new RegExp(`data-lineage="${source.lineage}"`));assert.match(html(g),/源流（父系）/);
  await g.click('detail',{id:starter.id});
  assert.match(html(g),new RegExp(`${source.name}系`));assert.equal(s.rng,rng);
  await g.click('close');await g.click('nav',{page:'market'});
  for(const id of s.sale)assert.match(html(g),new RegExp(`${R.paternalRoot(s,R.bird(s,id)).name}系`));
  await purchase(g);await g.click('nav',{page:'breed'});
  assert.match(html(g),/源流（父系）/);
  await g.click('sire-tab',{tab:'public'});
  const options=[...html(g).matchAll(/<button class="sire-option[\s\S]*?<\/button>/g)].map(m=>m[0]);
  assert.ok(options.length);
  for(const option of options){assert.match(option,/源流（父系）/);assert.match(option,/data-lineage="root-\d+"/);assert.doesNotMatch(option,/源流（父系）<\/span><strong>不明/);}
  assert.equal(s.facilities.lab,0);
});

test('founder offers show their source and the predecessor being replaced in the report and notebook',async()=>{
  const g=await boot(),s=g.h.state,source=R.sires(s).find(b=>b.kind==='root');
  const add=options=>{const b={...JSON.parse(JSON.stringify(source)),id:`bird-${s.serial++}`,owner:'player',...options};s.birds.push(b);return b;};
  const previous=add({kind:'founder',name:'センパイ'}),candidate=add({kind:'home',name:'コウケイ',parents:[source.id]});
  for(let i=0;i<3;i++)add({kind:'home',role:'retired',parents:[candidate.id],g1:i===0?5:1});
  s.founderOffers.push(candidate.id);
  const report={id:`report-${s.serial++}`,week:s.week,type:'founder',title:'始祖入りのオファー',text:'推薦されました。',birdId:candidate.id,expression:'overjoyed'};
  s.reports.push(report);s.journal.push({...report});
  await g.click('nav',{page:'notebook'});await g.click('notebook-tab',{tab:'records'});
  assert.match(html(g),new RegExp(`${source.name}系`));assert.match(html(g),/data-action="library-open" data-article="founders"/);
  assert.match(html(g),/コウケイが始祖入りすると、センパイと交代し、先代は供用を終えます/);
  await g.click('nav',{page:'home'});await g.click('reports');
  assert.match(html(g),/この源流の始祖：センパイ/);assert.match(html(g),/センパイと交代/);
  await g.click('promote',{id:candidate.id});
  assert.equal(previous.role,'archived');assert.equal(candidate.kind,'founder');
  await g.click('close');await g.click('detail',{id:candidate.id});
  assert.match(html(g),/この源流の始祖：コウケイ/);
});

test('pending founder offers lead mixed reports, celebrate each candidate and stop after acceptance',async()=>{
  const g=await boot(),s=g.h.state,roots=R.sires(s).filter(b=>b.kind==='root');
  const add=(source,options)=>{const b={...JSON.parse(JSON.stringify(source)),id:`bird-${s.serial++}`,owner:'player',...options};s.birds.push(b);return b;};
  const candidates=roots.slice(0,2).map((root,index)=>{
    const b=add(root,{kind:'home',name:index?'ツギノツバサ':'コウケイ<&>',parents:[root.id]});
    for(let i=0;i<3;i++)add(root,{kind:'home',role:'retired',parents:[b.id],g1:i?1:5});
    s.founderOffers.push(b.id);return b;
  });
  const award={year:1,title:'年度代表羽',birdId:candidates[0].id,name:candidates[0].name,farm:s.naming.ranchName,points:180};
  s.reports=[{id:'annual',type:'annual',week:s.week,title:'年末',text:'おめでとう！',awards:[award]},...candidates.map(b=>({id:`offer-${b.id}`,type:'founder',week:s.week,title:'始祖入りのオファー',text:'推薦されました。',birdId:b.id,expression:'overjoyed'}))];
  // Repeated reports must never duplicate an offer or its acceptance control.
  s.reports.push({...s.reports[1],id:'duplicate-offer'});
  const before=JSON.stringify(s),saved=g.storage.get(R.SAVE_KEY);
  await g.click('reports');
  assert.match(html(g),/report-modal celebration-founder/);assert.match(html(g),/FOUNDER OFFER/);
  assert.ok(html(g).indexOf('founder-banner')<html(g).indexOf('award-banner'));
  assert.equal([...html(g).matchAll(/class="founder-banner /g)].length,2);
  assert.equal([...html(g).matchAll(/data-action="promote"/g)].length,2);
  assert.match(html(g),/コウケイ&lt;&amp;&gt;/);assert.doesNotMatch(html(g),/コウケイ<&>/);
  assert.match(html(g),/GⅠ勝利産駒 <strong>3<small>羽/);assert.match(html(g),/産駒のGⅠ通算 <strong>7<small>勝/);
  assert.match(html(g),/この源流には、まだ始祖がいません/);
  assert.equal(JSON.stringify(s),before);assert.equal(g.storage.get(R.SAVE_KEY),saved);
  await g.click('promote',{id:candidates[0].id});
  assert.match(html(g),/report-modal celebration-founder/);
  assert.equal([...html(g).matchAll(/class="founder-banner /g)].length,1);
  await g.click('promote',{id:candidates[1].id});
  assert.match(html(g),/report-modal celebration-annual-champion/);
  assert.doesNotMatch(html(g),/founder-banner|data-action="promote"/);
  // A retained old offer report is informational after the candidate became a founder.
  s.reports=[{id:'old-offer',type:'founder',week:s.week,title:'過去のオファー',text:'推薦されました。',birdId:candidates[0].id}];
  await g.click('reports');assert.match(html(g),/report-modal celebration-report/);
  assert.doesNotMatch(html(g),/founder-banner|data-action="promote"/);
});

test('research unlocks optional sex-selection fruit, updates the total and reviews it before payment',async()=>{
  for(const [fruit,label,sex] of [['karabu','カラブの実','M'],['zeio','ゼイオの実','F']]) {
    const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});
    assert.doesNotMatch(html(g),/id="breeding-fruit"/);
    g.h.state.facilities.lab=1;g.h.render();
    assert.match(html(g),/id="breeding-fruit"/);assert.match(html(g),/value="none" selected/);
    assert.match(html(g),/カラブの実 ・ オス確定 ・ 1,000ギル/);assert.match(html(g),/ゼイオの実 ・ メス確定 ・ 1,000ギル/);
    const money=g.h.state.money,rng=g.h.state.rng;
    await g.change('breeding-fruit',fruit);
    assert.match(html(g),/配合する <span>1,600 G/);
    assert.equal(g.h.state.money,money);assert.equal(g.h.state.rng,rng);
    await g.click('breed-dialog');assert.match(html(g),new RegExp(label));
    assert.match(html(g),/合計<\/span><b>1,600 G/);assert.match(html(g),sex==='M'?/オス（100%）/:/メス（100%）/);
    await g.click('close');assert.equal(g.h.state.money,money);
    g.h.state.money=1599;g.h.render();assert.match(html(g),/配合料金と実の代金に必要なギルが足りません/);
    await g.click('breed-dialog');assert.equal(g.h.modal,null);
    await g.change('breeding-fruit','none');assert.match(html(g),/配合する <span>600 G/);
    g.h.state.money=money;await g.change('breeding-fruit',fruit);await g.click('breed-dialog');await g.click('breed-confirm');
    assert.equal(g.h.state.money,money-1600);
    const dam=R.own(g.h.state).find(b=>b.pregnancy);assert.equal(dam.pregnancy.fruit,fruit);
    const saved=R.deserializeState(g.storage.get(R.SAVE_KEY));assert.equal(R.bird(saved,dam.id).pregnancy.fruit,fruit);
    await g.click('ack');await g.click('nav',{page:'breed'});assert.doesNotMatch(html(g),/id="breeding-fruit"/);
  }
});

test('mare sale requires the matching confirmation, supports cancellation and persists the proceeds and vacant stall',async()=>{
  const g=await boot();await purchase(g);const b=R.own(g.h.state).find(b=>b.role==='mare');
  await g.click('nav',{page:'birds'});await g.click('detail',{id:b.id});
  const price=R.marePrice(b);assert.match(html(g),/data-action="sell-mare-dialog"/);assert.ok(html(g).includes(`${price.toLocaleString()} G`));
  const before=JSON.stringify(g.h.state),saved=g.storage.get(R.SAVE_KEY),money=g.h.state.money;
  await g.click('sell-mare-confirm',{id:b.id});assert.equal(JSON.stringify(g.h.state),before);
  await g.click('sell-mare-dialog',{id:b.id});assert.equal(g.h.modal.type,'sell-mare');
  assert.match(html(g),/売却後のギル/);assert.match(html(g),/血統と戦績/);assert.match(html(g),/data-action="close" data-autofocus/);
  assert.equal(JSON.stringify(g.h.state),before);assert.equal(g.storage.get(R.SAVE_KEY),saved);
  await g.key('Escape');assert.equal(g.h.modal.type,'detail');assert.equal(JSON.stringify(g.h.state),before);
  await g.click('sell-mare-dialog',{id:b.id});await g.click('close');assert.equal(g.h.modal.type,'detail');
  await g.click('sell-mare-dialog',{id:b.id});await g.click('sell-mare-confirm',{id:g.h.state.sale[1]});assert.equal(JSON.stringify(g.h.state),before);
  await g.click('sell-mare-confirm',{id:b.id});assert.equal(g.h.modal,null);assert.equal(g.h.page,'birds');
  assert.equal(g.h.state.money,money+price);assert.ok(!R.own(g.h.state).includes(b));assert.match(html(g),/羽房が1枠空きました/);
  const loaded=await boot(g.storage);assert.equal(loaded.h.state.money,money+price);assert.ok(!R.own(loaded.h.state).some(x=>x.id===b.id));
  const after=JSON.stringify(g.h.state);await g.click('sell-mare-confirm',{id:b.id});assert.equal(JSON.stringify(g.h.state),after);
});

test('pregnant mares explain why selling is disabled and other birds have no sale action',async()=>{
  const g=await boot();await purchase(g);const b=R.own(g.h.state).find(b=>b.role==='mare');
  R.breed(g.h.state,b.id,R.sires(g.h.state)[0].id);await g.click('detail',{id:b.id});
  assert.match(html(g),/data-action="sell-mare-dialog"[^>]*disabled/);assert.match(html(g),/出産後に売却/);
  const before=JSON.stringify(g.h.state);await g.click('sell-mare-dialog',{id:b.id});assert.equal(g.h.modal.type,'detail');assert.equal(JSON.stringify(g.h.state),before);
  for(const bird of [R.own(g.h.state).find(b=>b.role==='racing'),R.bird(g.h.state,g.h.state.sale[1])]) {
    await g.click('detail',{id:bird.id});assert.doesNotMatch(html(g),/data-action="sell-mare-dialog"/);
  }
});

test('home stud information totals direct offspring G1 wins and distinct winners across careers and owners',async()=>{
  const g=await boot();await purchase(g);
  const s=g.h.state,sire=R.createBird(s,{sex:'M',role:'stud',kind:'home',g1:9});
  const summary=()=>html(g).match(/<section class="graded-career offspring-career">[\s\S]*?<\/section>/)?.[0];
  await g.click('detail',{id:sire.id});
  assert.match(summary(),/産駒GⅠ勝利数 <b>0勝<\/b> \/ GⅠ勝利産駒数 <b>0羽<\/b>/);
  const child=(options,parents=[sire.id])=>R.createBird(s,{parents,...options});
  const winner=child({sex:'F',role:'racing',g1:3});
  child({sex:'M',role:'retired',owner:'public',g1:2});
  child({sex:'F',role:'archived',owner:'archive',g1:1});
  child({sex:'M',role:'racing',g1:0,graded:4,wins:4});
  child({g1:7},[winner.id]);
  child({g1:8},[winner.id,sire.id]);
  const before=JSON.stringify(s);
  await g.click('detail',{id:sire.id});
  assert.match(summary(),/産駒GⅠ勝利数 <b>6勝<\/b> \/ GⅠ勝利産駒数 <b>3羽<\/b>/);
  await g.click('close');await g.click('nav',{page:'breed'});await g.click('sire-tab',{tab:'home'});
  await g.click('select-sire',{id:sire.id});
  assert.match(summary(),/産駒GⅠ勝利数 <b>6勝<\/b> \/ GⅠ勝利産駒数 <b>3羽<\/b>/);
  assert.match(html(g),/<small class="offspring-career">産駒GⅠ勝利数 <b>6勝<\/b> \/ GⅠ勝利産駒数 <b>3羽<\/b><\/small>/);
  assert.equal(JSON.stringify(s),before,'viewing offspring totals must not change saved data');
  winner.g1++;
  await g.click('detail',{id:sire.id});
  assert.match(summary(),/産駒GⅠ勝利数 <b>7勝<\/b> \/ GⅠ勝利産駒数 <b>3羽<\/b>/);
  await g.click('close');await g.click('nav',{page:'birds'});
  for(const b of [winner,R.sires(s).find(b=>b.kind==='root'),R.sires(s).find(b=>b.owner==='public')]){
    await g.click('detail',{id:b.id});assert.equal(summary(),undefined);
  }
});

test('releasing a home stud requires confirmation, cancels without changes and survives reload',async()=>{
  const g=await boot(),s=g.h.state,b=R.createBird(s,{sex:'M',role:'stud',kind:'home'});
  await g.click('nav',{page:'birds'});await g.click('detail',{id:b.id});assert.match(html(g),/data-action="release-stud-dialog"/);
  const before=JSON.stringify(s),money=s.money;
  await g.click('release-stud-confirm',{id:b.id});assert.equal(JSON.stringify(s),before);
  await g.click('release-stud-dialog',{id:b.id});assert.equal(g.h.modal.type,'release-stud');assert.match(html(g),/配合相手にも選べなく/);
  assert.equal(JSON.stringify(s),before);await g.backdrop();assert.equal(g.h.modal.type,'detail');assert.equal(JSON.stringify(s),before);
  await g.click('release-stud-dialog',{id:b.id});await g.click('release-stud-confirm',{id:s.sale[0]});assert.equal(JSON.stringify(s),before);
  await g.click('release-stud-confirm',{id:b.id});assert.equal(g.h.modal,null);assert.equal(s.money,money);assert.ok(!R.sires(s).includes(b));assert.ok(!R.own(s).includes(b));
  const loaded=await boot(g.storage);assert.equal(R.bird(loaded.h.state,b.id).released,true);assert.ok(!R.sires(loaded.h.state).some(x=>x.id===b.id));
  await g.click('detail',{id:b.id});assert.match(html(g),/野生 ・ 牡/);assert.doesNotMatch(html(g),/data-action="release-stud-dialog"/);
});

test('public studs, sources and owned founders have no release action',async()=>{
  const g=await boot(),s=g.h.state,founder=R.createBird(s,{sex:'M',role:'stud',kind:'founder'});
  for(const b of [founder,R.sires(s).find(b=>b.kind==='root'),R.sires(s).find(b=>b.owner==='public'),R.own(s).find(b=>b.role==='racing')]) {
    await g.click('detail',{id:b.id});assert.doesNotMatch(html(g),/data-action="release-stud-dialog"/);
  }
});

test('pending save blocks repeated actions and reports success only after the write commits',async()=>{
  const g=await boot();await g.click('nav',{page:'settings'});
  const before=JSON.stringify(g.h.state),write=g.store.write;
  let release,started;
  const waiting=new Promise(resolve=>{started=resolve;});
  g.store.write=(...args)=>new Promise(resolve=>{release=()=>resolve(write(...args));started();});
  const pending=g.click('slot-save',{slot:'2'});await waiting;
  assert.equal(g.storage.has(slotKey(2)),false);assert.doesNotMatch(html(g),/スロット2にセーブしました/);
  await g.click('slot-save',{slot:'3'});await g.click('reset-dialog');await g.key('Escape');
  assert.equal(g.h.modal,null);assert.equal(JSON.stringify(g.h.state),before);
  release();await pending;
  assert.equal(g.storage.has(slotKey(2)),true);assert.equal(g.storage.has(slotKey(3)),false);
  assert.match(html(g),/スロット2にセーブしました/);
});

test('first play collects ranch name, affix and its placement before creating an autosave',async()=>{
  const g=await boot(undefined,false,false,false);
  assert.equal(g.h.modal.type,'new-game');assert.equal(g.storage.has(R.SAVE_KEY),false);
  assert.match(html(g),/牧場名/);assert.match(html(g),/後ろにつける（名前＋冠名）/);
  await g.click('close');await g.backdrop();await g.key('Escape');await g.click('nav',{page:'settings'});assert.equal(g.h.modal.type,'new-game');
  await g.change('new-ranch-name','星空牧場');await g.change('new-affix','ホシ');await g.change('new-affix-position','suffix');
  assert.equal(g.node('#new-name-preview').textContent,'ローズホシ');
  await g.click('start-confirm');assert.equal(g.h.modal,null);
  assert.deepEqual(g.h.state.naming,{ranchName:'星空牧場',affix:'ホシ',position:'suffix'});
  assert.ok(R.own(g.h.state)[0].name.endsWith('ホシ'));assert.match(html(g),/ようこそ、星空牧場へ/);
  assert.doesNotMatch(html(g),/ようこそ、羽風牧場へ|2歳牝羽ハネカゼノヒカリ/);
  const reloaded=await boot(g.storage);assert.equal(reloaded.h.modal,null);assert.deepEqual(reloaded.h.state.naming,g.h.state.naming);
});

test('invalid setup keeps its input and resetting collects fresh settings without overwriting until confirmed',async()=>{
  const g=await boot(),before=JSON.stringify(g.h.state),autosave=g.storage.get(R.SAVE_KEY);
  await g.click('reset-dialog');await g.change('new-ranch-name','新しい牧場');await g.change('new-affix','ひらがな');await g.click('reset-confirm');
  assert.equal(JSON.stringify(g.h.state),before);assert.equal(g.storage.get(R.SAVE_KEY),autosave);
  assert.equal(g.h.modal.settings.affix,'ひらがな');assert.match(html(g),/冠名は1〜7文字のカタカナ/);
  await g.click('close');assert.equal(JSON.stringify(g.h.state),before);
  await g.click('reset-dialog');await g.change('new-ranch-name','朝日牧場');await g.change('new-affix','アサヒ');await g.change('new-affix-position','prefix');await g.click('reset-confirm');
  assert.equal(g.h.state.naming.ranchName,'朝日牧場');assert.ok(R.own(g.h.state)[0].name.startsWith('アサヒ'));
  await g.click('buy-dialog',{id:g.h.state.sale[0]});assert.equal(g.h.modal.type,'buy');assert.match(html(g),/<span>朝日牧場<small>/);
});

test('settings offer exactly five independent manual saves and disable empty loads',async()=>{
  const g=await boot();await g.click('nav',{page:'settings'});
  assert.equal((html(g).match(/class="save-slot"/g)||[]).length,5);
  assert.equal((html(g).match(/data-action="slot-load"[^>]*disabled/g)||[]).length,5);
  const autosave=g.storage.get(R.SAVE_KEY);
  for(let slot=1;slot<=5;slot++){
    g.h.state.money=20000+slot;await g.click('slot-save',{slot:String(slot)});
    const entry=JSON.parse(g.storage.get(slotKey(slot)));
    assert.ok(Number.isFinite(Date.parse(entry.savedAt)));
    assert.equal(R.deserializeState(entry.data).money,20000+slot);
    assert.match(html(g),/保存日時：/);
    assert.equal(g.storage.get(R.SAVE_KEY),autosave,'manual saves do not write autosave');
  }
  const restored=await boot(g.storage);await restored.click('nav',{page:'settings'});
  assert.equal((html(restored).match(/data-action="slot-load"[^>]*disabled/g)||[]).length,0);
  assert.match(html(restored),/20,001 G/);assert.match(html(restored),/20,005 G/);
});

test('number keys open the matching load dialog from any page, Enter restores and Escape cancels',async()=>{
  const g=await boot();
  for(let slot=1;slot<=5;slot++){
    g.h.state.money=21000+slot;await g.click('slot-save',{slot:String(slot)});
  }
  for(const [index,page] of ['home','birds','breed','facilities','notebook'].entries()){
    const slot=index+1;await g.click('nav',{page});g.h.state.money=12345;
    const current=JSON.stringify(g.h.state),autosave=g.storage.get(R.SAVE_KEY);
    await g.key(String(slot));assert.equal(g.h.modal.type,'slot-load');assert.equal(g.h.modal.slot,slot);
    assert.match(html(g),/data-action="slot-load-confirm" data-autofocus/);
    assert.equal(JSON.stringify(g.h.state),current);assert.equal(g.storage.get(R.SAVE_KEY),autosave);
    await g.key('Escape');await g.key('Enter');
    assert.equal(g.h.modal,null);assert.equal(JSON.stringify(g.h.state),current);
    await g.key(String(slot));await g.key('Enter');
    assert.equal(g.h.modal,null);assert.equal(g.h.page,'home');assert.equal(g.h.state.money,21000+slot);
    assert.equal(R.deserializeState(g.storage.get(R.SAVE_KEY)).money,21000+slot);
  }
});

test('load shortcuts ignore editing, modifiers, composition, repeats and other dialogs',async()=>{
  const g=await boot();await g.click('slot-save',{slot:'1'});
  const ignored=[{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{isComposing:true},{repeat:true},{defaultPrevented:true},
    ...['input','textarea','select'].map(tag=>({target:{matches:selector=>selector.split(', ').includes(tag)}})),
    {target:{isContentEditable:true}}];
  for(const options of ignored){await g.key('1',options);assert.equal(g.h.modal,null);}
  for(const key of ['0','6','9']){await g.key(key);assert.equal(g.h.modal,null);}
  await g.click('reset-dialog');const reset=g.h.modal;await g.key('1');await g.key('Enter');assert.equal(g.h.modal,reset);
  await g.key('Escape');await g.key('1');const load=g.h.modal;
  for(const options of ignored){await g.key('Enter',options);assert.equal(g.h.modal,load);}
  for(const options of ignored.filter(options=>!options.target)){
    let prevented=false;await g.key('Enter',{...options,preventDefault(){prevented=true;}});
    assert.equal(prevented,true,'suppress native Enter activation for held keys and modified shortcuts');
  }
  await g.key('2');assert.equal(g.h.modal,load);
  await g.key('Enter',{target:{closest:()=>({dataset:{action:'close'}})}});assert.equal(g.h.modal,load,'focused cancel retains native button handling');
  await g.key('Escape');assert.equal(g.h.modal,null);
});

test('keyboard load preserves progress for empty, corrupt, changed or unwritable saves',async()=>{
  const g=await boot();await g.click('slot-save',{slot:'1'});
  const current=JSON.stringify(g.h.state),autosave=g.storage.get(R.SAVE_KEY);
  await g.key('2');assert.equal(g.h.modal,null);assert.match(html(g),/セーブデータがありません/);
  g.storage.set(slotKey(2),'{bad');await g.key('2');assert.equal(g.h.modal,null);assert.match(html(g),/データは読み込めません/);
  await g.key('1');g.storage.delete(slotKey(1));await g.key('Enter');
  assert.equal(g.h.modal.type,'slot-load');assert.match(html(g),/別のタブで更新されました/);
  assert.equal(JSON.stringify(g.h.state),current);assert.equal(g.storage.get(R.SAVE_KEY),autosave);
  await g.key('Escape');await g.click('slot-save',{slot:'1'});
  const denied=await boot(g.storage,key=>key===R.SAVE_KEY),before=JSON.stringify(denied.h.state);
  await denied.key('1');await denied.key('Enter');
  assert.equal(denied.h.modal.type,'slot-load');assert.match(html(denied),/ロードを中止/);
  assert.equal(JSON.stringify(denied.h.state),before);assert.equal(denied.storage.get(R.SAVE_KEY),autosave);
});

test('keyboard shortcuts cannot start another operation while a slot read or restore is pending',async()=>{
  const g=await boot();await g.click('slot-save',{slot:'1'});
  const read=g.store.read;let release,started;
  const reading=new Promise(resolve=>{started=resolve;});
  g.store.read=(...args)=>new Promise(resolve=>{release=()=>resolve(read(...args));started();});
  const opening=g.key('1');await reading;await g.key('2');await g.key('Enter');assert.equal(g.h.modal,null);
  release();await opening;g.store.read=read;assert.equal(g.h.modal.slot,1);
  const restore=g.store.restore;let calls=0;
  const restoring=new Promise(resolve=>{started=resolve;});
  g.store.restore=(...args)=>new Promise(resolve=>{calls++;release=()=>resolve(restore(...args));started();});
  const loading=g.key('Enter');await restoring;await g.key('Enter');await g.key('Escape');await g.key('2');
  assert.equal(calls,1);assert.equal(g.h.modal.slot,1);release();await loading;assert.equal(g.h.modal,null);
});

test('overwriting a slot requires confirmation and cancellation preserves its snapshot',async()=>{
  const g=await boot();await g.click('slot-save',{slot:'1'});const original=g.storage.get(slotKey(1));
  await purchase(g);await g.click('slot-save',{slot:'1'});
  assert.equal(g.h.modal.type,'slot-save');assert.equal(g.storage.get(slotKey(1)),original);
  assert.match(html(g),/上書きしますか/);await g.click('close');
  await g.click('slot-save-confirm');assert.equal(g.storage.get(slotKey(1)),original);
  await g.click('slot-save',{slot:'1'});await g.click('slot-save-confirm');
  assert.equal(g.h.modal,null);assert.equal(R.deserializeState(JSON.parse(g.storage.get(slotKey(1))).data).money,g.h.state.money);
  assert.notEqual(g.storage.get(slotKey(1)),original);
});

test('loading restores the full ranch and autosave while retaining all five snapshots through reset',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('breed-dialog');await g.click('breed-confirm');await g.click('ack');await g.h.advance(1);
  const snapshot=ranchSnapshot(g.h.state),savedRng=g.h.state.rng;
  for(let slot=1;slot<=5;slot++)await g.click('slot-save',{slot:String(slot)});
  const slots=Array.from({length:5},(_,i)=>g.storage.get(slotKey(i+1)));
  while(g.h.state.reports.length)await g.click('ack');await g.h.advance(1);
  const current=JSON.stringify(g.h.state),autosave=g.storage.get(R.SAVE_KEY);
  await g.click('slot-load',{slot:'1'});assert.equal(g.h.modal.type,'slot-load');
  assert.equal(JSON.stringify(g.h.state),current);assert.equal(g.storage.get(R.SAVE_KEY),autosave);
  await g.click('close');await g.click('slot-load-confirm');assert.equal(JSON.stringify(g.h.state),current);
  await g.click('slot-load',{slot:'1'});await g.click('slot-load-confirm');
  assert.equal(ranchSnapshot(g.h.state),snapshot);assert.notEqual(g.h.state.rng,savedRng);assert.equal(g.h.page,'home');assert.equal(g.h.modal,null);
  assert.equal(JSON.stringify(R.deserializeState(g.storage.get(R.SAVE_KEY))),JSON.stringify(g.h.state));
  const reloaded=await boot(g.storage);assert.equal(ranchSnapshot(reloaded.h.state),snapshot);assert.notEqual(reloaded.h.state.rng,g.h.state.rng);
  await g.click('reset-dialog');await g.click('reset-confirm');assert.equal(g.h.state.stage,'buy');
  assert.deepEqual(Array.from({length:5},(_,i)=>g.storage.get(slotKey(i+1))),slots);
  await g.click('slot-load',{slot:'5'});await g.click('slot-load-confirm');assert.equal(ranchSnapshot(g.h.state),snapshot);
});

test('corrupted slots remain protected until explicit overwrite and cannot replace the running ranch',async()=>{
  const g=await boot(),current=JSON.stringify(g.h.state),autosave=g.storage.get(R.SAVE_KEY);
  for(const raw of ['', '{bad',JSON.stringify({version:1,savedAt:new Date().toISOString(),data:'{}'})]){
    g.storage.set(slotKey(2),raw);await g.click('nav',{page:'settings'});assert.match(html(g),/データを読み込めません/);
    await g.click('slot-load',{slot:'2'});assert.equal(g.h.modal,null);assert.equal(JSON.stringify(g.h.state),current);assert.equal(g.storage.get(R.SAVE_KEY),autosave);
    await g.click('slot-save',{slot:'2'});assert.equal(g.h.modal.type,'slot-save');assert.equal(g.storage.get(slotKey(2)),raw);
    await g.click('close');assert.equal(g.storage.get(slotKey(2)),raw);
  }
  await g.click('slot-save',{slot:'2'});await g.click('slot-save-confirm');
  assert.ok(R.validState(R.deserializeState(JSON.parse(g.storage.get(slotKey(2))).data)));
  for(const slot of ['0','6','1.5','bad']){await g.click('slot-save',{slot});assert.equal(g.storage.has(slotKey(slot)),false);}
});

test('failed slot writes and failed load autosaves preserve prior saves and current progress',async()=>{
  let deny=false;const g=await boot(undefined,key=>deny&&key===slotKey(1));
  await g.click('slot-save',{slot:'1'});const raw=g.storage.get(slotKey(1));await purchase(g);
  deny=true;await g.click('slot-save',{slot:'1'});await g.click('slot-save-confirm');
  assert.equal(g.storage.get(slotKey(1)),raw);assert.equal(g.h.modal.type,'slot-save');assert.match(html(g),/セーブできませんでした/);
  const failedLoad=await boot(g.storage,key=>key===R.SAVE_KEY),current=JSON.stringify(failedLoad.h.state),autosave=failedLoad.storage.get(R.SAVE_KEY);
  await failedLoad.click('slot-load',{slot:'1'});await failedLoad.click('slot-load-confirm');
  assert.equal(JSON.stringify(failedLoad.h.state),current);assert.equal(failedLoad.storage.get(R.SAVE_KEY),autosave);
  assert.equal(failedLoad.h.modal.type,'slot-load');assert.match(html(failedLoad),/ロードを中止/);
});

test('unreadable storage disables manual saves and an intact slot recovers a corrupted autosave',async()=>{
  const denied=await boot(undefined,false,key=>key===slotKey(1));await denied.click('nav',{page:'settings'});
  assert.match(html(denied),/data-action="slot-save" data-slot="1"[^>]*disabled/);
  await denied.click('slot-save',{slot:'1'});assert.equal(denied.storage.has(slotKey(1)),false);
  const g=await boot();await purchase(g);await g.click('slot-save',{slot:'3'});g.storage.set(R.SAVE_KEY,'{bad');
  const recovered=await boot(g.storage);assert.equal(recovered.storage.get(R.SAVE_KEY),'{bad');
  await recovered.click('slot-load',{slot:'3'});await recovered.click('slot-load-confirm');
  assert.equal(recovered.h.saveOK,true);assert.equal(ranchSnapshot(recovered.h.state),ranchSnapshot(g.h.state));
  assert.ok(R.validState(R.deserializeState(recovered.storage.get(R.SAVE_KEY))));
});

test('slot confirmation detects another tab changing its data instead of overwriting or loading it',async()=>{
  const g=await boot();await g.click('slot-save',{slot:'1'});await purchase(g);await g.click('slot-save',{slot:'2'});
  const original=g.storage.get(slotKey(1)),updated=g.storage.get(slotKey(2));
  for(const action of ['slot-save','slot-load']){
    g.storage.set(slotKey(1),original);await g.click(action,{slot:'1'});g.storage.set(slotKey(1),updated);
    const current=JSON.stringify(g.h.state);await g.click(`${action}-confirm`);
    assert.equal(g.storage.get(slotKey(1)),updated);assert.equal(JSON.stringify(g.h.state),current);
    assert.match(html(g),/別のタブで更新されました/);await g.click('close');
  }
  await g.click('nav',{page:'settings'});g.storage.delete(slotKey(1));await g.windowEvent('storage',{key:slotKey(1)});
  assert.match(html(g),/data-action="slot-load" data-slot="1"[^>]*disabled/);
  await g.click('slot-save',{slot:'1'});assert.ok(g.storage.has(slotKey(1)),'slot updates do not block the running ranch');
});

test('list and status portraits follow calendar age and show inherited crest only on adults',async()=>{
  const g=await boot(),b=R.own(g.h.state)[0];b.color='blue';b.crest='rainbow';
  for(const [age,stage] of [[0,'chick'],[1,'yearling'],[2,'adult']]){
    b.birthYear=R.date(g.h.state.week).year-age;
    await g.click('nav',{page:'birds'});
    assert.match(html(g),new RegExp(`data-portrait-stage="${stage}" data-portrait-color="blue" data-portrait-crest="${age<2?'blue':'rainbow'}"`));
    await g.click('detail',{id:b.id});
    assert.match(html(g),new RegExp(`<div class="detail-cover blue"><span[^>]+data-portrait-stage="${stage}"`));await g.click('close');
  }
});

test('race results explain observed pack behavior, retain old records and distinguish nonfinishers',async()=>{
  const g=await boot();await purchase(g);const b=R.own(g.h.state)[0];
  const r={week:9,name:'試走',distance:1600,surface:'turf',rank:1,reward:100,
    field:[{id:b.id,name:b.name,time:100,finished:true},{id:'rival',name:'相手',time:900,finished:false}],
    interactions:{crowdedSeconds:5,duelSeconds:12,savingSeconds:3,extraEnergy:30,laneChanges:3,blockedSeconds:2}};
  b.records.push(r);await g.click('result',{id:b.id,week:'9'});
  assert.match(html(g),/羽混みでもまれたクポ/);assert.match(html(g),/最後まで競り合ったクポ/);
  assert.match(html(g),/先頭で余力を残して走れたクポ/);assert.match(html(g),/未完走/);assert.match(html(g),/1:40.00/);
  assert.match(html(g),/うまく進路を見つけたクポ/);assert.match(html(g),/前が詰まって苦しかったクポ/);
  delete r.interactions;g.h.render();
  assert.doesNotMatch(html(g),/羽混みでもまれたクポ|先頭で余力を残して走れたクポ/);assert.match(html(g),/1:40.00/);
});

test('bird details offer no renaming controls and registration explains immutable names',async()=>{
  const g=await boot(),b=R.own(g.h.state)[0],original=b.name;
  await g.click('detail',{id:b.id});assert.doesNotMatch(html(g),/id="bird-name"|data-action="rename"|名前を保存/);
  g.node('#bird-name').value='漢字123';await g.click('rename',{id:b.id});assert.equal(b.name,original);
  g.node('#bird-name').value='アオバ';await g.click('rename',{id:b.id});assert.equal(b.name,original);
  const young=R.createBird(g.h.state);g.h.state.reports=[{id:`report-${g.h.state.serial++}`,type:'registration',title:'登録',text:'登録',birdIds:[young.id]}];
  await g.click('reports');assert.match(html(g),/minlength="2" maxlength="9" pattern="\[ァ-ヺー\]\{2,9\}"/);assert.match(html(g),/登録後は名前を変更できません/);
});

test('weekly reports, career results and old letters open a replay without changing the ranch',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('breed-dialog');await g.click('breed-confirm');await g.click('ack');await g.h.advance(1);
  const b=R.own(g.h.state).find(b=>b.records.length),r=b.records.at(-1);
  while(g.h.state.reports[0]?.type!=='weekly')await g.click('ack');
  assert.match(html(g),/観戦する/);const before=JSON.stringify(g.h.state);
  await g.click('watch-race',{id:b.id,week:String(r.week)});
  assert.equal(g.h.modal.type,'replay');assert.match(html(g),/パドック/);assert.match(html(g),/実況のラミア/);assert.match(html(g),/解説のサハギン/);assert.match(html(g),/value="1" selected>1×</);
  if(r.rank===1&&r.finished!==false)assert.match(html(g),/data-phase="award"/);
  else assert.doesNotMatch(html(g),/data-phase="award"/);
  assert.equal(JSON.stringify(g.h.state),before);
  await g.click('close');assert.equal(g.h.modal.type,'reports');assert.equal(JSON.stringify(g.h.state),before);
  await g.click('detail',{id:b.id});assert.match(html(g),/結果・観戦/);await g.click('result',{id:b.id,week:String(r.week)});assert.match(html(g),/観戦する/);
  await g.click('close');await g.click('ack');await g.click('nav',{page:'notebook'});await g.click('notebook-tab',{tab:'letters'});assert.match(html(g),/観戦する/);
  const restored=await boot(g.storage.get(R.SAVE_KEY));await restored.click('watch-race',{id:b.id,week:String(r.week)});assert.equal(restored.h.modal.type,'replay');
});

test('losing races omit the podium chapter and pre-feature records still play or report unavailable playback',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('breed-dialog');await g.click('breed-confirm');await g.click('ack');await g.h.advance(1);
  const b=R.own(g.h.state).find(b=>b.records.length),r=b.records.at(-1);r.rank=2;
  await g.click('watch-race',{id:b.id,week:String(r.week)});assert.doesNotMatch(html(g),/data-phase="award"/);
  assert.doesNotMatch(html(g),/横方向の進路が保存されていない/);
  await g.click('close');r.replay.version=1;r.replay.runners.forEach(runner=>runner.samples=runner.samples.map(sample=>sample.slice(0,4)));
  const legacy=JSON.stringify(g.h.state);await g.click('watch-race',{id:b.id,week:String(r.week)});
  assert.equal(g.h.modal.type,'replay');assert.doesNotMatch(html(g),/横方向の進路が保存されていない/);assert.equal(JSON.stringify(g.h.state),legacy);
  await g.click('close');delete r.replay;await g.click('result',{id:b.id,week:String(r.week)});assert.match(html(g),/観戦できません/);assert.doesNotMatch(html(g),/data-action="watch-race"/);
});

test('all venue records open 2D without renderer controls or changes to a saved race',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('breed-dialog');await g.click('breed-confirm');await g.click('ack');await g.h.advance(1);
  const b=R.own(g.h.state).find(b=>b.records.length),r=b.records.at(-1);r.trackId='tenku';
  await g.click('result',{id:b.id,week:String(r.week)});assert.match(html(g),/観戦する/);
  const before=JSON.stringify(g.h.state);await g.click('watch-race',{id:b.id,week:String(r.week)});
  assert.doesNotMatch(html(g),/2D 試作|data-viewer="section"|data-renderer|watch-mode|3D/);
  assert.match(html(g),/data-viewer-pitch/);assert.match(html(g),/value="2" selected/);
  assert.equal(JSON.stringify(g.h.state),before);
  for(const trackId of ['oukyu','sunahama','haikou','mitsurin','iseki']){
    await g.click('close');r.trackId=trackId;r.surface=['mitsurin','iseki'].includes(trackId)?'turf':'dirt';const saved=JSON.stringify(g.h.state);
    await g.click('watch-race',{id:b.id,week:String(r.week)});
    assert.doesNotMatch(html(g),/data-renderer|watch-mode|3D/);assert.match(html(g),/data-viewer-pitch/);
    assert.equal(JSON.stringify(g.h.state),saved);
  }
  await g.click('close');delete r.trackId;await g.click('watch-race',{id:b.id,week:String(r.week)});
  assert.match(html(g),/data-viewer-pitch/,'records without venue metadata use the 2D fallback');
  assert.doesNotMatch(g.node('.race-loading').textContent,/別の表示方式/);
});

test('page navigation retains 2D playback choices, disposes the viewer and never saves the ranch',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('breed-dialog');await g.click('breed-confirm');await g.click('ack');await g.h.advance(1);
  const b=R.own(g.h.state).find(b=>b.records.length),r=b.records.at(-1);
  await g.click('watch-race',{id:b.id,week:String(r.week)});
  const before=JSON.stringify(g.h.state),saved=g.storage.get(R.SAVE_KEY),focusId=r.replay.runners[1].id;
  const playback={time:51.25,paused:true,rate:4,focusId,cameraMode:'follow',speaking:true,pitch:1.5};
  let disposed=0;g.h.setViewer({ready:true,snapshot:()=>playback,dispose(){disposed++;}});
  await g.windowEvent('pagehide');assert.equal(disposed,1);
  assert.deepEqual(JSON.parse(JSON.stringify(g.h.modal.playback)),playback);
  await g.windowEvent('pageshow',{persisted:true});assert.equal(g.h.modal.type,'replay');
  assert.match(html(g),/value="4" selected/);assert.match(html(g),new RegExp(`value="${focusId}" selected`));
  assert.match(html(g),/data-camera="follow" aria-pressed="true"/);
  assert.match(html(g),/value="1.5" selected/);
  const second={...playback,time:52,rate:2,cameraMode:'finish',pitch:2};
  g.h.setViewer({ready:true,snapshot:()=>second,dispose(){disposed++;}});
  await g.windowEvent('pagehide');assert.equal(disposed,2);
  await g.windowEvent('pageshow',{persisted:true});
  assert.equal(g.h.modal.playback.pitch,2);assert.equal(g.h.modal.playback.time,52);
  assert.match(html(g),/value="2" selected/);assert.match(html(g),/data-camera="finish" aria-pressed="true"/);
  assert.match(html(g),/value="2" selected>2×/);
  g.h.setViewer({dispose(){disposed++;}});await g.click('close');assert.equal(disposed,3);
  assert.notEqual(g.h.modal?.type,'replay');
  assert.equal(JSON.stringify(g.h.state),before);assert.equal(g.storage.get(R.SAVE_KEY),saved);
});
test('new UI exposes one tutorial action, hides numeric traits and renders every deliberate destination',async()=>{
  const g=await boot();assert.match(html(g),/ようこそ、羽風牧場へ/);assert.match(html(g),/繁殖牝羽セールへ/);assert.doesNotMatch(html(g),/最高速|遺伝品質/);
  for(const page of ['birds','market','breed','facilities','notebook','settings']){await g.click('nav',{page});assert.equal(g.h.page,page);assert.match(html(g),/<h1>/);assert.doesNotMatch(html(g),/class="notice"/);}
});
test('facility art follows initial, constructed and upgraded levels while empty sites stay plain',async()=>{
  const g=await boot();await g.click('nav',{page:'facilities'});
  const cards=()=>[...html(g).matchAll(/<article class="paper facility [\s\S]*?<\/article>/g)].map(m=>m[0]);
  assert.equal(cards().length,12);
  assert.equal(cards().filter(c=>c.includes('has-art')).length,2);
  for(const key of ['stalls','meadow'])assert.ok(html(g).includes(`/assets/facilities/${key}-lv1-v1.webp`));
  for(const c of cards().filter(c=>/未建設|未解放/.test(c)))assert.doesNotMatch(c,/has-art|facility-image/);
  g.h.state.money=1e12;
  await g.click('build-dialog',{key:'course'});await g.click('build-confirm',{key:'course'});
  assert.ok(html(g).includes('/assets/facilities/course-lv1-v1.webp'));
  await g.click('build-dialog',{key:'stalls'});await g.click('build-confirm',{key:'stalls'});
  assert.ok(html(g).includes('/assets/facilities/stalls-lv2-v1.webp'));
  for(const [key,f] of Object.entries(R.FACILITIES)){
    for(let level=1;level<=f.max;level++){
      g.h.state.facilities[key]=level;g.h.render();
      const file=`assets/facilities/${key}-lv${Math.min(level,f.artMax??f.max)}-v1.webp`;
      const card=cards().find(c=>c.includes(file)),art=card.match(/--facility-image:url\('([^']+)'\)/)[1];
      const expected=new URL(file,uiBase).href;
      assert.equal(art,expected,`${key} Lv${level}: image must use the page directory`);
      assert.equal(new URL(art,new URL('css/ranch.css',uiBase)).href,expected,'external CSS must keep the same asset URL');
    }
  }
  g.h.state.facilities.lab=3;g.h.render();
  assert.ok(html(g).includes('/assets/facilities/lab-lv1-v1.webp'));
  assert.doesNotMatch(html(g),/lab-lv3/);
});

test('late stall improvements show a fixed price, unchanged capacity and a link to the library',async()=>{
  const g=await boot();g.h.state.money=1e9;g.h.state.facilities.stalls=4;
  await g.click('nav',{page:'facilities'});
  for(let level=5;level<=9;level++){
    await g.click('build-dialog',{key:'stalls'});
    assert.match(html(g),/羽房を改良しますか？/);
    assert.match(html(g),/50,000,000 G/);assert.match(html(g),new RegExp(`Lv\\. ${level}`));
    assert.match(html(g),/ふかふかの寝床/);assert.match(html(g),/data-action="library-open" data-article="facilities"/);
    assert.doesNotMatch(html(g),/55[%％]|75[%％]|有利な因子|遺伝座位/);
    await g.click('build-confirm',{key:'stalls'});
    assert.equal(g.h.state.facilities.stalls,level);
    assert.deepEqual(JSON.parse(JSON.stringify(R.capacity(g.h.state))),{racing:32,mare:16,stud:16});
    assert.ok(html(g).includes('/assets/facilities/stalls-lv4-v1.webp'));
  }
  const stalls=html(g).match(/<article class="paper facility [\s\S]*?<h2>羽房<\/h2>[\s\S]*?<\/article>/)[0];
  assert.match(stalls,/Lv\. 9/);assert.match(stalls,/disabled/);
});

test('purchase and breeding are reviewable before payment, with a clear route back to the weekly loop',async()=>{
  const g=await boot(),before=g.h.state.money,price=R.bird(g.h.state,g.h.state.sale[0]).price;await g.click('nav',{page:'market'});await g.click('buy-dialog',{id:g.h.state.sale[0]});assert.equal(g.h.state.money,before);assert.ok(html(g).includes(`${(before-price).toLocaleString()} G`));await g.click('close');assert.equal(g.h.state.money,before);
  await purchase(g);await g.click('nav',{page:'breed'});await g.click('breed-dialog');assert.match(html(g),/600 G/);await g.click('breed-confirm');assert.equal(g.h.state.stage,'grow');await g.click('ack');
  await g.h.advance(4);assert.equal(g.h.state.week,13,'monthly letters and first wins are included without stopping the four-week advance');assert.equal(g.h.modal.type,'reports');assert.equal(g.h.state.reports.filter(r=>r.type==='weekly').length,4);assert.ok(g.h.state.reports.some(r=>r.type==='monthly'));assert.ok(g.h.state.reports.some(r=>r.type==='birth'));assert.ok(R.own(g.h.state).some(b=>b.role==='young'));assert.match(html(g),/4週のダイジェスト/);
  const restored=await boot(g.storage.get(R.SAVE_KEY));assert.equal(restored.h.state.week,13);assert.equal(ranchSnapshot(restored.h.state),ranchSnapshot(g.h.state));assert.notEqual(restored.h.state.rng,g.h.state.rng);
});
test('reset cancellation preserves everything; confirmation returns to March with the automated racing filly',async()=>{
  const g=await boot();await purchase(g);const original=JSON.stringify(g.h.state);await g.click('nav',{page:'settings'});await g.click('reset-dialog');assert.equal(g.h.modal.type,'reset');assert.match(html(g),/取り消せません/);assert.match(html(g),/data-autofocus/);assert.equal(JSON.stringify(g.h.state),original);
  await g.click('close');assert.equal(JSON.stringify(g.h.state),original);await g.click('reset-confirm');assert.equal(JSON.stringify(g.h.state),original,'cannot reset without the confirmation dialog');
  await g.click('reset-dialog');await g.click('reset-confirm');assert.equal(g.h.state.week,9);assert.equal(g.h.state.money,20000);assert.equal(R.own(g.h.state).length,1);assert.equal(g.h.state.reports.length,0);assert.equal(g.h.state.stage,'buy');
  const reloaded=await boot(g.storage.get(R.SAVE_KEY));assert.equal(R.own(reloaded.h.state).length,1);assert.equal(reloaded.h.state.week,9);
});
test('details disclose ratings, racing traits, all genetic loci and current numbers at four facility stages',async()=>{
  const g=await boot(),b=R.own(g.h.state)[0];await g.click('detail',{id:b.id});
  const status=()=>html(g).match(/<section class="research status-record">([\s\S]*?)<\/section>/)[1];
  assert.match(status(),/現在の身体能力|走る意欲|最高速/);assert.match(html(g),/能力の遺伝/);
  assert.doesNotMatch(status(),/data-score|<meter/);assert.doesNotMatch(html(g),/得意羽場：|遺伝の座位情報|金因子/);
  g.h.state.facilities.lab=1;g.h.render();
  assert.match(html(g),/得意羽場：|成長と加齢の遺伝/);assert.doesNotMatch(html(g),/data-score|<meter|<summary>遺伝の座位情報|金因子/);
  for(const monument of ['museum','statue']){
    g.h.state.facilities[monument]=1;g.h.render();
    assert.match(html(g),/遺伝の座位情報（全因子）|32座位|金因子|潜性の欠点の全座位/);
    assert.doesNotMatch(status(),/data-score|<meter|成熟したときの伸びしろ/);
    g.h.state.facilities[monument]=0;
  }
  g.h.state.facilities.museum=1;g.h.state.facilities.statue=1;g.h.render();
  assert.match(status(),/data-score="power"|成熟したときの伸びしろ|脚の負担/);assert.doesNotMatch(html(g),/公開段階|研究所を建てると|遺伝評価：|評価：X|（合算）/);
});
test('zero and one year olds show development speed ratings; two year olds show current abilities',async()=>{
  const g=await boot(),s=g.h.state,b=R.createBird(s,{name:'コワカバ'});
  const status=()=>html(g).match(/<section class="research status-record">([\s\S]*?)<\/section>/)[1];
  for(const years of [0,1]){
    b.birthYear=R.date(s.week).year-years;await g.click('detail',{id:b.id});
    assert.match(status(),/成長率|早い成長|遅い衰え始め|緩やかな衰え/);
    assert.doesNotMatch(status(),/現在の身体能力|data-trait="power"|data-score|<meter/);
  }
  b.birthYear=R.date(s.week).year-2;g.h.render();
  assert.match(status(),/現在のステータス|data-trait="power"/);assert.doesNotMatch(status(),/成長率/);
});
test('both breeding parents show aggregate genetic ratings before building research',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});
  assert.equal((html(g).match(/<summary>遺伝<\/summary>/g)||[]).length,2);
  assert.match(html(g),/能力の遺伝/);assert.doesNotMatch(html(g),/data-score|<meter|遺伝の座位情報/);
  g.h.state.facilities.lab=1;g.h.state.facilities.museum=1;g.h.render();
  assert.equal((html(g).match(/父母の遺伝座位を比較/g)||[]).length,1);
  assert.doesNotMatch(html(g),/遺伝の座位情報（全因子）/);
});
test('G1 research shows one shared locus comparison and updates the father and mother on selection',async()=>{
  const g=await boot();await purchase(g);const s=g.h.state;
  s.money=100000000;
  const second=s.sale.find(id=>R.bird(s,id).owner==='sale');
  await g.click('buy-dialog',{id:second});await g.click('buy-confirm',{id:second});await g.click('ack');
  await g.click('nav',{page:'breed'});
  s.milestones.g1=9;g.h.render();assert.doesNotMatch(html(g),/gene-comparison/);
  s.facilities.lab=1;g.h.render();
  const sequences=()=>{
    const speed=html(g).split('data-locus-key="quality.speed"')[1].split('<div class="gene-row"')[0];
    return [...speed.matchAll(/<b class="gene-sequence"[^>]*>([\s\S]*?)<\/b>/g)].map(m=>m[1].replace(/<[^>]+>/g,''));
  };
  const symbols=b=>b.genome.quality.speed.map(pair=>['◯','◎','☆'][pair[0]+pair[1]]).join('');
  const mares=R.own(s).filter(b=>b.role==='mare'),sires=R.sires(s).filter(b=>b.kind==='root');
  const before=JSON.stringify(s);
  assert.equal((html(g).match(/class="paper gene-comparison"/g)||[]).length,1);
  assert.deepEqual(sequences(),[symbols(sires[0]),symbols(mares[0])]);
  assert.doesNotMatch(html(g),/data-score|遺伝の座位情報（全因子）/);
  await g.click('select-sire',{id:sires[1].id});
  assert.deepEqual(sequences(),[symbols(sires[1]),symbols(mares[0])]);
  await g.change('dam-choice',mares[1].id);
  assert.deepEqual(sequences(),[symbols(sires[1]),symbols(mares[1])]);
  assert.equal(JSON.stringify(s),before);
  await g.click('detail',{id:mares[1].id});assert.match(html(g),/遺伝の座位情報（全因子）/);
  await g.click('close');await g.click('nav',{page:'market'});assert.match(html(g),/遺伝の座位情報（全因子）/);
  assert.doesNotMatch(html(g),/data-score/);
});
test('details, sale and parents show only aggregate genetics and retain the numeric gate',async()=>{
  const g=await boot(),b=R.own(g.h.state)[0];
  const check=()=>{
    assert.match(html(g),/能力の遺伝/);
    assert.doesNotMatch(html(g),/基礎遺伝|遺伝補正|data-genetic-part|data-genetic-value/);
    assert.doesNotMatch(html(g),/data-score/);
  };
  await g.click('detail',{id:b.id});check();await g.click('close');
  await g.click('nav',{page:'market'});check();
  assert.equal((html(g).match(/<details class="research genetics">/g)||[]).length,g.h.state.sale.length);
  assert.doesNotMatch(html(g),/<details class="research genetics" open>/);
  await purchase(g);await g.click('nav',{page:'breed'});check();
  g.h.state.facilities.lab=1;g.h.state.facilities.statue=1;g.h.render();
  assert.match(html(g),/data-score="power"/);assert.doesNotMatch(html(g),/data-genetic-part/);
});
test('legacy upgraded labs keep saved levels but cannot bypass the monument gates',async()=>{
  const s=R.initial();s.facilities.lab=3;
  const g=await boot(R.serializeState(s)),b=R.own(g.h.state)[0];await g.click('detail',{id:b.id});
  assert.equal(g.h.state.facilities.lab,3);assert.equal(R.labLevel(g.h.state),1);
  assert.match(html(g),/得意羽場：/);assert.doesNotMatch(html(g),/data-score|<summary>遺伝の座位情報/);
});
test('bad save stays intact until explicit reset; storage failure is visible',async()=>{
  const g=await boot('{bad json');assert.equal(g.storage.get(R.SAVE_KEY),'{bad json');assert.equal(g.h.saveOK,false);assert.match(html(g),/元のデータを保護/);
  await g.click('reset-dialog');await g.click('reset-confirm');assert.ok(R.validState(R.deserializeState(g.storage.get(R.SAVE_KEY))));assert.equal(g.h.saveOK,true);
  const unavailable=await boot(undefined,true);assert.equal(unavailable.h.saveOK,false);assert.match(html(unavailable),/自動保存ができません/);
});
test('bird names are escaped in dialogue and rendered detail content',async()=>{
  const g=await boot();await purchase(g);const b=R.own(g.h.state)[0];b.name='<img src=x>';await g.click('detail',{id:b.id});assert.match(html(g),/&lt;img src=x&gt;/);assert.doesNotMatch(html(g),/<img src=x>/);
});

const listedSires=g=>[...html(g).matchAll(/data-action="select-sire" data-id="([^"]+)"/g)].map(m=>R.bird(g.h.state,m[1]));
const selectedSire=g=>html(g).match(/data-action="select-sire" data-id="([^"]+)" aria-pressed="true"/)?.[1];

test('mare choices exclude this year’s bred mares after birth and restore them next year',async()=>{
  const g=await boot();await purchase(g);const s=g.h.state;
  s.money=1000000;await g.click('buy-dialog',{id:s.sale[1]});await g.click('buy-confirm',{id:s.sale[1]});
  while(s.reports.length)await g.click('ack');
  const [first,second]=R.own(s).filter(b=>b.role==='mare');
  const choices=()=>[...html(g).match(/<select id="dam-choice">([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]);
  await g.click('nav',{page:'breed'});assert.deepEqual(choices(),[first.id,second.id]);
  await g.click('breed-dialog');await g.click('breed-confirm');
  while(s.reports.length)await g.click('ack');
  await g.click('nav',{page:'breed'});assert.deepEqual(choices(),[second.id]);
  await g.click('breed-dialog');assert.match(html(g),new RegExp(`${second.name} ×`));await g.click('close');
  await g.h.advance(R.GESTATION);
  while(s.reports.length)await g.click('ack');
  assert.equal(first.pregnancy,null);await g.click('nav',{page:'breed'});assert.deepEqual(choices(),[second.id]);
  s.week=R.YEAR+9;g.h.render();assert.deepEqual(choices(),[first.id,second.id]);
});

test('when every mare has bred this year the breeding page explains waiting until next year',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('breed-dialog');await g.click('breed-confirm');
  while(g.h.state.reports.length)await g.click('ack');
  await g.click('nav',{page:'breed'});
  assert.match(html(g),/今年の配合はすべて済んでいます。/);
  assert.doesNotMatch(html(g),/id="dam-choice"|data-action="breed-dialog"|繁殖牝羽がいません/);
  const before=JSON.stringify(g.h.state);await g.click('breed-dialog');assert.equal(g.h.modal,null);assert.equal(JSON.stringify(g.h.state),before);
});

test('breeding prioritizes the action and parent genetics while omitting inactive crosses and rating explanations',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});
  const s=g.h.state,dam=R.own(s).find(b=>b.role==='mare');
  const sire=R.sires(s).find(b=>b.kind==='root'&&!R.breedingCrosses(s,b,dam).length);
  await g.click('select-sire',{id:sire.id});
  assert.doesNotMatch(html(g),/cross-preview|対象となるクロス|公開段階|研究所を建てると|記念館か銅像を建てると|遺伝評価：|評価：X|（合算）/);
  assert.ok(html(g).indexOf('data-action="breed-dialog"')<html(g).indexOf('class="breeding-layout"'));
  for(const parent of html(g).split('<section class="paper breeding-parent">').slice(1)){
    assert.ok(parent.indexOf('能力の遺伝')<parent.indexOf('class="parent-pair"'));
    assert.ok(parent.indexOf('class="parent-pair"')<parent.indexOf('持ち味・競走情報'));
    assert.ok(!parent.includes('重賞成績'));
  }
  await g.click('breed-dialog');assert.equal(g.h.modal.type,'breed');
  assert.doesNotMatch(html(g),/cross-preview/);
});

test('the sire picker stays open while browsing and closes on selection',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});
  await g.click('open-sire-picker');assert.equal(g.node('#sire-picker').open,true);
  await g.click('sire-tab',{tab:'public'});assert.equal(g.node('#sire-picker').open,true);
  await g.click('select-sire',{id:listedSires(g)[1].id});assert.equal(g.node('#sire-picker').open,false);
});

test('mares show the current or latest mate and all offspring with their actual fathers',async()=>{
  const g=await boot();await purchase(g);const s=g.h.state,dam=R.own(s).find(b=>b.role==='mare'),[first,last,current]=R.sires(s);
  const oldest=R.createBird(s,{name:'コハネ',bornWeek:1,owner:'public'},[first,dam]);
  const youngest=R.createBird(s,{name:'ワカバ',bornWeek:5},[last,dam]);
  const family=()=>html(g).match(/<section class="breeding-family">([\s\S]*?)<\/section>/)[1];
  await g.click('nav',{page:'breed'});
  assert.match(family(),/最新の産駒の父/);assert.match(family(),/産駒 2羽/);
  assert.ok(family().indexOf(`data-id="${last.id}"`)<family().indexOf('産駒 2羽'));
  assert.ok(family().indexOf(`data-id="${youngest.id}"`)<family().indexOf(`data-id="${oldest.id}"`));
  assert.match(family(),new RegExp(`data-id="${first.id}"`));
  dam.pregnancy={sireId:current.id,due:s.week+R.GESTATION};g.h.render();
  assert.ok(family().indexOf(`data-id="${current.id}"`)<family().indexOf('産駒 2羽'));
  assert.match(family(),/出産予定/);assert.doesNotMatch(family(),/最新の産駒の父/);
  await g.click('detail',{id:dam.id});assert.match(html(g),/配合相手・産駒/);
  await g.click('detail',{id:youngest.id});assert.equal(g.h.modal.id,youngest.id);
});

test('public sire search combines text, winning route and ability order with visible parent hints',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('sire-tab',{tab:'public'});
  const farm=R.searchSires(g.h.state,{route:'dirt'})[0].farm;
  g.node('#sire-query').value=farm;await g.click('search-sires');
  await g.change('sire-route','dirt');await g.change('sire-sort','power');
  const candidates=listedSires(g);assert.ok(candidates.length);
  assert.ok(candidates.every(b=>b.farm===farm));
  assert.ok(candidates.every((b,i)=>!i||candidates[i-1].potential.power>=b.potential.power));
  assert.match(html(g),/長所/);assert.match(html(g),/短所/);assert.match(html(g),/重賞成績/);assert.match(html(g),/血統のGⅠ実績による補正/);assert.match(html(g),/下限 \+/);
  g.node('#sire-query').value='見つからない名前';await g.click('search-sires');
  assert.equal(listedSires(g).length,0);assert.match(html(g),/data-action="breed-dialog" disabled/);
});

test('public offspring order uses the current mother and updates when she changes while preserving the sire',async()=>{
  const g=await boot();await purchase(g);
  const s=g.h.state,first=R.own(s).find(b=>b.role==='mare');
  const second=R.createBird(s,{sex:'F',role:'mare'},[R.sires(s).find(b=>b.owner==='public'),first]);
  await g.click('nav',{page:'breed'});await g.click('sire-tab',{tab:'public'});
  assert.match(html(g),/<option value="offspring"[^>]*>子の能力期待値が高い順<\/option>/);
  const selected=selectedSire(g),rng=s.rng;
  await g.change('sire-sort','offspring');
  const expected=dam=>R.searchSires(s,{sort:'offspring',dam}).filter(b=>b.owner==='public').map(b=>b.id);
  const firstOrder=expected(first);
  assert.deepEqual(listedSires(g).map(b=>b.id),firstOrder);assert.equal(selectedSire(g),selected);
  assert.doesNotMatch(html(g),/選択中の母との配合で、競走能力8項目/);assert.match(html(g),/data-action="library-open" data-article="breeding"/);
  await g.change('dam-choice',second.id);
  const secondOrder=expected(second);assert.notDeepEqual(secondOrder,firstOrder);
  assert.deepEqual(listedSires(g).map(b=>b.id),secondOrder);assert.equal(selectedSire(g),selected);
  await g.click('sire-tab',{tab:'root'});assert.equal(listedSires(g).length,32);
  await g.click('sire-tab',{tab:'public'});assert.deepEqual(listedSires(g).map(b=>b.id),secondOrder);
  second.bredYear=R.date(s.week).year;g.h.render();
  assert.deepEqual(listedSires(g).map(b=>b.id),firstOrder,'the available mother is resolved before sorting');
  assert.equal(s.rng,rng);
});

test('public sire genetic filters can be added, combined, edited, removed and cleared without saving',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('sire-tab',{tab:'public'});
  const candidates=listedSires(g),target=candidates.find(b=>R.geneticRating(R.geneticScores(b).power)==='☆');
  assert.ok(target);
  const snapshot=JSON.stringify(g.h.state),saved=g.storage.get(R.SAVE_KEY);
  const change=(index,field,value)=>g.change(`sire-genetic-${field}-${index}`,value,{geneticIndex:String(index),geneticField:field});
  await change(0,'trait','power');
  const stars=listedSires(g);assert.ok(stars.length>0&&stars.length<candidates.length);
  assert.match(html(g),/class="sire-genetic-match">遺伝：瞬発力 ☆/);
  assert.ok(stars.every(b=>R.geneticRating(R.geneticScores(b).power)==='☆'));
  await g.click('add-sire-genetic-filter');assert.equal(listedSires(g).length,stars.length,'blank rows are ignored');
  const rating=R.geneticRating(R.geneticScores(target).recovery);
  await change(1,'rating',rating);await change(1,'trait','recovery');
  assert.deepEqual(listedSires(g).map(b=>b.id),stars.filter(b=>R.geneticRating(R.geneticScores(b).recovery)===rating).map(b=>b.id));
  await g.click('sire-tab',{tab:'root'});assert.equal(listedSires(g).length,32);
  await g.click('sire-tab',{tab:'public'});assert.match(html(g),/id="sire-genetic-trait-1"/);
  await g.click('add-sire-genetic-filter');await change(2,'rating','X');await change(2,'trait','power');
  assert.equal(listedSires(g).length,0);assert.match(html(g),/条件に一致する種牡羽が見つかりません/);assert.match(html(g),/data-action="breed-dialog" disabled/);
  await g.click('remove-sire-genetic-filter',{index:'2'});assert.ok(listedSires(g).includes(target));
  await g.click('remove-sire-genetic-filter',{index:'0'});
  assert.ok(listedSires(g).every(b=>R.geneticRating(R.geneticScores(b).recovery)===rating));
  await g.click('clear-sire-genetic-filters');assert.deepEqual(listedSires(g).map(b=>b.id),candidates.map(b=>b.id));
  await g.click('remove-sire-genetic-filter',{index:'0'});assert.match(html(g),/id="sire-genetic-trait-0"/);
  assert.equal(JSON.stringify(g.h.state),snapshot);assert.equal(g.storage.get(R.SAVE_KEY),saved);
});

test('genetic filters follow research disclosure and combine with existing public sire search',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('sire-tab',{tab:'public'});
  const select=()=>html(g).match(/<select id="sire-genetic-trait-0"[\s\S]*?<\/select>/)[0];
  assert.doesNotMatch(select(),/芝適性|右回り適性|早い成長/);
  g.h.state.facilities.lab=1;g.h.render();assert.match(select(),/芝適性/);assert.match(select(),/右回り適性/);assert.match(select(),/早い成長/);
  const candidate=listedSires(g).find(b=>b.records.some(r=>r.level==='GI'&&r.rank===1&&r.surface==='dirt'));
  g.node('#sire-query').value=candidate.farm;await g.click('search-sires');await g.change('sire-route','dirt');await g.change('sire-sort','power');
  const rating=R.geneticTraitRating(candidate,'rightTurn');
  await g.change('sire-genetic-rating-0',rating,{geneticIndex:'0',geneticField:'rating'});
  await g.change('sire-genetic-trait-0','rightTurn',{geneticIndex:'0',geneticField:'trait'});
  const result=listedSires(g);assert.ok(result.includes(candidate));assert.ok(result.every(b=>b.farm===candidate.farm&&R.geneticTraitRating(b,'rightTurn')===rating));
  assert.ok(result.every((b,i)=>!i||result[i-1].potential.power>=b.potential.power));
  await g.click('reset-dialog');await g.click('reset-confirm');await purchase(g);await g.click('nav',{page:'breed'});await g.click('sire-tab',{tab:'public'});
  assert.equal(listedSires(g).length,50);assert.doesNotMatch(select(),/右回り適性/);
});

test('sire tabs separate source, other ranch, founder and home candidates and remember selection',async()=>{
  const g=await boot();await purchase(g);
  const base=R.sires(g.h.state)[0];
  for(const [kind,name] of [['founder','私の始祖'],['home','私の種牡羽']])g.h.state.birds.push({...JSON.parse(JSON.stringify(base)),id:`bird-${g.h.state.serial++}`,kind,owner:'player',name});
  await g.click('nav',{page:'breed'});
  assert.equal(listedSires(g).length,32);assert.ok(listedSires(g).every(b=>b.kind==='root'));
  const selected=listedSires(g)[7];await g.click('select-sire',{id:selected.id});
  await g.click('sire-tab',{tab:'public'});assert.equal(listedSires(g).length,50);assert.ok(listedSires(g).every(b=>b.owner==='public'));
  g.h.state.money=100000000;const publicSire=selectedSire(g);await g.click('breed-dialog');assert.match(html(g),new RegExp(R.bird(g.h.state,publicSire).name));await g.click('close');
  await g.click('sire-tab',{tab:'founder'});assert.deepEqual(listedSires(g).map(b=>b.name),['私の始祖']);assert.match(html(g),/無料/);
  await g.click('sire-tab',{tab:'home'});assert.deepEqual(listedSires(g).map(b=>b.name),['私の種牡羽']);
  await g.click('sire-tab',{tab:'root'});assert.equal(selectedSire(g),selected.id);
  await g.click('sire-tab',{tab:'public'});assert.equal(selectedSire(g),publicSire);
  const mother=R.own(g.h.state).find(b=>b.role==='mare'),before=g.h.state.money;
  await g.click('breed-dialog');await g.click('breed-confirm');assert.equal(mother.pregnancy.sireId,publicSire);assert.equal(g.h.state.money,before-R.breedFee(R.bird(g.h.state,publicSire)));
});

test('empty sire tabs clear hidden choices, explain availability and disable breeding',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});
  for(const tab of ['founder','home']){
    await g.click('sire-tab',{tab});assert.equal(listedSires(g).length,0);assert.equal(selectedSire(g),undefined);
    assert.match(html(g),/data-action="breed-dialog" disabled/);assert.match(html(g),/まだいません/);
    await g.click('breed-dialog');assert.equal(g.h.modal,null);assert.equal(R.own(g.h.state)[0].pregnancy,null);
  }
  await g.click('sire-tab',{tab:'root'});assert.equal(listedSires(g).length,32);
});

test('strength filter exposes four donors per inherited trait and tabs support arrow navigation',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});
  for(const trait of [...R.Mapping.ABILITIES.map(a=>a.key),...Object.keys(R.MANAGEMENT),...Object.keys(R.PERSONALITY)]){
    await g.change('root-trait',trait);assert.equal(listedSires(g).length,4);
    assert.ok(listedSires(g).every(b=>{const p=R.ROOTS.find(p=>p.lineage===b.lineage);return p.primary===trait||p.secondary===trait;}));
    assert.match(html(g),/4 \/ 32羽/);assert.doesNotMatch(html(g),/遺伝品質/);
  }
  await g.key('ArrowRight');assert.ok(listedSires(g).every(b=>b.owner==='public'));assert.equal(listedSires(g).length,50);
  await g.key('End');assert.match(html(g),/id="sire-tab-home"[^>]*aria-selected="true"/);
  await g.key('ArrowRight');assert.match(html(g),/id="sire-tab-root"[^>]*aria-selected="true"/);assert.equal(listedSires(g).length,4);
  await g.key('ArrowLeft');assert.match(html(g),/id="sire-tab-home"[^>]*aria-selected="true"/);
  await g.key('Home');await g.change('root-trait','');assert.equal(listedSires(g).length,32);
});

test('loading an earlier v4 catalog upgrades to 32 sources without resetting the ranch',async()=>{
  const s=R.initial();R.buy(s,s.sale[0]);delete s.rootCatalogVersion;
  s.birds=s.birds.filter(b=>b.kind!=='root'||Number(b.lineage.split('-')[1])<4);
  for(const b of s.birds)b.parents=b.parents.map(id=>R.bird(s,id)?id:null);
  const original=JSON.parse(JSON.stringify(s)),g=await boot(JSON.stringify(s));
  assert.equal(R.sires(g.h.state).filter(b=>b.kind==='root').length,32);assert.equal(g.h.state.money,original.money);
  assert.equal(JSON.stringify(R.own(g.h.state)),JSON.stringify(R.own(original)));
  assert.ok(R.validState(R.deserializeState(g.storage.get(R.SAVE_KEY))));
});

test('new surface and growth strengths can filter sources while gold alleles remain hidden',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});
  for(const key of Object.keys(R.Genetics.APTITUDES)){
    await g.change('root-trait',key);assert.equal(listedSires(g).length,Object.hasOwn(R.Genetics.COURSE_APTITUDES,key)?8:16);
    assert.ok(listedSires(g).every(b=>R.Genetics.mean(b.genome.traits.aptitude[key])===1));
  }
  for(const key of Object.keys(R.Genetics.DEVELOPMENT)){
    await g.change('root-trait',key);assert.equal(listedSires(g).length,8);
    assert.ok(listedSires(g).every(b=>R.Genetics.mean(b.genome.traits.development[key])===1));
  }
  await g.change('root-trait','');assert.match(html(g),/羽色：金 \/ 額羽：青/);
  assert.doesNotMatch(html(g),/金因子|G\/g|1\/2000/);
});

test('body and crest render separately; genetics and ground appear after research and factors after a monument',async()=>{
  const g=await boot();await purchase(g);const b=R.own(g.h.state)[0];
  b.genome.traits.body=['black','white'];b.color='black';b.genome.traits.crest='rainbow';b.crest='rainbow';
  await g.click('detail',{id:b.id});assert.match(html(g),/羽色：黒 \/ 額羽：虹/);
  assert.match(html(g),/data-portrait-color="black" data-portrait-crest="rainbow"/);assert.doesNotMatch(html(g),/成長と加齢の遺伝|<h3>羽場適性/);
  g.h.state.facilities.lab=1;g.h.render();assert.match(html(g),/<h3>羽場適性/);assert.doesNotMatch(html(g),/min="50" max="150"|成熟の目安|金因子/);
  g.h.state.facilities.museum=1;g.h.render();assert.match(html(g),/成熟の目安/);assert.match(html(g),/衰え始め/);assert.match(html(g),/羽色因子/);assert.match(html(g),/金因子/);
});

test('pedigree and cross preview show a source backcross but prohibit it without charging',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});
  const s=g.h.state,dam=R.bird(s,s.sale[0]),sire=R.bird(s,dam.parents[0]),money=s.money,rng=s.rng;
  await g.click('select-sire',{id:sire.id});
  assert.match(html(g),/5代血統/);assert.match(html(g),/母：不明/);
  assert.match(html(g),/1 × 2/);assert.match(html(g),/75%/);assert.match(html(g),/37.5%/);
  assert.match(html(g),/危険なため、配合できません/);assert.match(html(g),/2×3（37.5%）まで/);
  assert.match(html(g),/data-action="breed-dialog" disabled/);
  await g.click('breed-dialog');assert.equal(g.h.modal,null);assert.equal(s.money,money);assert.equal(s.rng,rng);assert.equal(dam.pregnancy,null);
  await g.click('detail',{id:sire.id});assert.doesNotMatch(html(g),/id="bird-name"/);
  s.facilities.lab=1;s.facilities.statue=1;g.h.render();assert.match(html(g),/潜性の欠点因子/);assert.match(html(g),/aa 4座/);assert.match(html(g),/Aa 4座/);
});

test('home links to the mare sale only while it is open; off-season breeding is greyed out while its forecast stays visible',async()=>{
  const g=await boot();await purchase(g);const s=g.h.state;s.week=17;await g.click('nav',{page:'home'});
  assert.doesNotMatch(html(g),/data-page="market"/);
  s.stage='running';s.week=R.YEAR+5;g.h.render();
  assert.match(html(g),/町から、にぎやかな羽音/);assert.match(html(g),/class="home-scene"[\s\S]*data-page="market"/);
  s.stage='breed';s.week=17;g.h.render();
  await g.click('nav',{page:'breed'});assert.match(html(g),/breeding-season closed|breeding-confirm unavailable/);
  assert.match(html(g),/data-action="breed-dialog" disabled/);assert.match(html(g),/生まれる子の遺伝効果|data-preview-trait="power"/);
  const before=JSON.stringify(g.h.state);await g.click('breed-dialog');assert.equal(g.h.modal,null);assert.equal(JSON.stringify(g.h.state),before);
});

test('breeding forecasts use five-level ranges and update when either parent changes without consuming randomness',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});const s=g.h.state,rng=s.rng;
  const forecast=()=>html(g).match(/<section class="paper offspring-preview">([\s\S]*?)<\/section>/)[1];
  assert.equal((forecast().match(/data-preview-trait=/g)||[]).length,16);assert.doesNotMatch(forecast(),/data-score|<meter/);
  const before=forecast();await g.click('select-sire',{id:R.sires(s)[1].id});assert.notEqual(forecast(),before);assert.equal(s.rng,rng);
  await g.click('nav',{page:'market'});await g.click('buy-dialog',{id:s.sale[1]});await g.click('buy-confirm',{id:s.sale[1]});await g.click('nav',{page:'breed'});
  const first=forecast();await g.change('dam-choice',s.sale[1]);assert.notEqual(forecast(),first);assert.equal(s.rng,rng);
});

test('breeding forecasts disclose aptitudes and growth with the lab and numeric ranges with either monument',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});const s=g.h.state;
  const forecast=()=>html(g).match(/<section class="paper offspring-preview">([\s\S]*?)<\/section>/)[1];
  const traits={...R.Genetics.APTITUDES,...R.Genetics.DEVELOPMENT};
  for(const lab of [0,1,3])for(const museum of [0,1])for(const statue of [0,1]){
    Object.assign(s.facilities,{lab,museum,statue});const before=JSON.stringify(s);g.h.render();
    assert.equal(JSON.stringify(s),before);
    const output=forecast();
    assert.equal((output.match(/data-preview-trait=/g)||[]).length,lab?26:16);
    for(const [key,label] of Object.entries(traits)){
      const row=new RegExp(`data-preview-trait="${key}"><span>${label}</span>`);
      if(lab)assert.match(output,row);else assert.doesNotMatch(output,row);
    }
    if(lab&&(museum||statue)){
      assert.equal((output.match(/data-score=/g)||[]).length,26);
      const dam=R.own(s).find(b=>b.role==='mare'),sire=R.bird(s,selectedSire(g));
      const ranges=R.breedingPreview(s,sire,dam);
      for(const [key,range] of Object.entries(ranges)){
        const min=Math.floor(range.min),max=Math.floor(range.max);
        assert.ok(output.includes(`<small data-score="${key}">${min===max?min:`${min}〜${max}`}</small>`),key);
      }
    }else assert.doesNotMatch(output,/data-score/);
  }
});

test('hatch comparisons appear in reports and saved letters, with details gated by research stages',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('breed-dialog');await g.click('breed-confirm');await g.click('ack');
  await g.h.advance(4);
  const s=g.h.state,report=s.reports.find(r=>r.type==='birth');assert.ok(report.geneticLottery);
  const comparison=()=>html(g).match(/<section class="birth-genetics">([\s\S]*?)<\/section>/)[1];
  for(const lab of [0,1,3])for(const museum of [0,1])for(const statue of [0,1]){
    Object.assign(s.facilities,{lab,museum,statue});const before=JSON.stringify(s);g.h.render();
    assert.equal(JSON.stringify(s),before);
    const output=comparison(),level=R.labLevel(s);
    assert.equal((output.match(/data-birth-trait=/g)||[]).length,lab?26:16);
    assert.equal((output.match(/data-birth-score=/g)||[]).length,level>=2?26:0);
    assert.equal((output.match(/class="birth-position"/g)||[]).length,level===3?26:0);
    assert.match(output,/結果 \/ 範囲/);
    for(const [key,row] of Object.entries(report.geneticLottery)){
      if(level>=2)assert.ok(output.includes(`<small data-birth-score="${key}">${Math.floor(row.value)} / ${Math.floor(row.min)}～${Math.floor(row.max)}</small>`),key);
    }
  }
  await g.click('close');await g.click('nav',{page:'notebook'});await g.click('notebook-tab',{tab:'letters'});
  const original=comparison();
  const restored=await boot(g.storage);await restored.click('nav',{page:'notebook'});await restored.click('notebook-tab',{tab:'letters'});
  assert.equal(restored.node('#app').innerHTML.match(/<section class="birth-genetics">([\s\S]*?)<\/section>/)[1],original);
  assert.deepEqual(restored.h.state.journal.find(r=>r.id===report.id).geneticLottery,report.geneticLottery);
});

test('bird schedule changes save immediately, preserve the detail modal, and reload with the same chosen menu',async()=>{
  const g=await boot(),b=R.own(g.h.state)[0];await g.click('detail',{id:b.id});assert.equal((html(g).match(/data-plan-week=/g)||[]).length,8);
  await g.change('', 'training:power',{scheduleId:b.id,week:String(g.h.state.week)});
  assert.equal(g.h.modal.type,'detail');assert.equal(b.schedule[g.h.state.week].menu,'power');assert.match(html(g),/指定した予定/);
  const restored=await boot(g.storage.get(R.SAVE_KEY));assert.equal(R.bird(restored.h.state,b.id).schedule[g.h.state.week].menu,'power');
  await g.change('', 'auto',{scheduleId:b.id,week:String(g.h.state.week)});assert.equal(b.schedule[g.h.state.week],undefined);
});

test('report overlays keep the chosen page, preserve all four weekly letters and support repeated advancing',async()=>{
  const g=await boot();await purchase(g);await g.click('nav',{page:'breed'});await g.click('breed-dialog');await g.click('breed-confirm');await g.click('close');await g.click('nav',{page:'birds'});
  await g.h.advance(4);assert.equal(g.h.page,'birds');assert.equal(g.h.modal.type,'reports');assert.equal(g.h.state.week,13);
  assert.match(html(g),/4週のダイジェスト|3月の牧場だより|レース初勝利|小さな羽音/);
  assert.equal(g.h.state.reports.filter(r=>r.type==='weekly').length,4);assert.match(html(g),/<h1>チョコボ<\/h1>/);
  const journal=JSON.stringify(g.h.state.journal);await g.backdrop();assert.equal(g.h.modal,null);assert.equal(g.h.state.reports.length,0);assert.equal(JSON.stringify(g.h.state.journal),journal);
  await g.h.advance(1);assert.equal(g.h.page,'birds');assert.equal(g.h.modal.type,'reports');assert.equal(g.h.state.week,14);
  await g.h.advance(4);assert.equal(g.h.state.week,18);assert.equal(g.h.state.reports.filter(r=>r.type==='weekly').length,4);
});

test('four-week advance stops for January registration and backdrop dismissal keeps the required choices pending',async()=>{
  const g=await boot(),s=g.h.state;s.stage='running';s.week=47;
  const child=R.createBird(s,{name:'コトリ',birthYear:0,bornWeek:9});
  await g.h.advance(4);assert.equal(s.week,49);assert.equal(g.h.modal.type,'reports');assert.ok(s.reports.some(r=>r.type==='registration'));
  await g.backdrop();assert.equal(g.h.modal,null);assert.equal(s.reports.length,1);assert.equal(s.reports[0].type,'registration');assert.equal(child.registered,false);
  await g.h.advance(4);assert.equal(s.week,49);assert.equal(g.h.modal.type,'reports');
  g.setQuery('[data-register-name]',[{dataset:{registerName:child.id},value:'ハルノユメ'}]);
  g.setQuery('[data-register-policy]',[{dataset:{registerPolicy:child.id},value:'challenge'}]);
  await g.click('ack');assert.equal(child.name,'ハルノユメ');assert.equal(child.policy,'challenge');assert.equal(child.registered,true);assert.equal(child.role,'racing');
  g.setQuery('[data-register-name]',[]);g.setQuery('[data-register-policy]',[]);
  await g.h.advance(1);assert.equal(s.week,50);
});

test('only clicking the backdrop closes a dialog; nested bird views return to their previous modal',async()=>{
  const g=await boot(),b=R.own(g.h.state)[0];await g.click('detail',{id:b.id});await g.inside();assert.equal(g.h.modal.type,'detail');
  await g.backdrop();assert.equal(g.h.modal,null);
  await g.click('buy-dialog',{id:g.h.state.sale[0]});const before=JSON.stringify(g.h.state);await g.backdrop();assert.equal(g.h.modal,null);assert.equal(JSON.stringify(g.h.state),before);
  await g.click('detail',{id:b.id});await g.click('detail',{id:R.sires(g.h.state)[0].id});await g.backdrop();assert.equal(g.h.modal.id,b.id);await g.backdrop();assert.equal(g.h.modal,null);
});
