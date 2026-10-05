/* A quiet, report-first interface. Only deliberate purchase and breeding require decisions. */
(async () => {
  'use strict';
  const R=Ranch,L=RanchLibrary,$=selector=>document.querySelector(selector);
  const tracks=globalThis.RanchWorld?.TRACKS||{};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Math.round(n).toLocaleString('ja-JP');
  const ICONS={home:'⌂',birds:'♧',breed:'⚭',facilities:'▱',notebook:'▤',library:'▥',settings:'⚙'};
  const LABELS={home:'牧場',birds:'チョコボ',breed:'配合',facilities:'施設',notebook:'牧場手帳',library:'図書館',market:'繁殖牝羽セール',settings:'設定'};
  const SEASONS=[{id:'winter',label:'冬'},{id:'spring',label:'春'},{id:'summer',label:'夏'},{id:'autumn',label:'秋'}];
  const currentSeason=()=>SEASONS[Math.floor((R.date(state.week).month%12)/3)];
  const role=b=>b.released?'野生':({young:'幼羽',racing:'競走羽',mare:'繁殖牝羽',stud:'種牡羽',retired:'引退',archived:'記録'}[b.role]);
  const kind=b=>({root:'源流',home:'自家製',general:'一般',founder:'始祖'}[b.kind]);
  const SIRE_TABS=[['root','源流'],['public','他の牧場'],['founder','始祖'],['home','自家牧場']];
  const sireGroup=b=>b.kind==='root'?'root':b.kind==='founder'?'founder':b.owner==='player'?'home':'public';
  const traitLabels={...Object.fromEntries(R.Mapping.ABILITIES.map(a=>[a.key,a.label])),...R.MANAGEMENT,...R.PERSONALITY,...R.Genetics.APTITUDES,...R.Genetics.DEVELOPMENT};
  const abilityLabels=Object.fromEntries(R.Mapping.ABILITIES.map(a=>[a.key,a.label]));
  const statLabels={...abilityLabels,...R.MANAGEMENT,...R.PERSONALITY};
  const GENETIC_RATINGS=['☆','◎','◯','△','X'];
  const searchableGeneticTraits=()=>R.labLevel(state)>=1?traitLabels:statLabels;
  const colorText=b=>`羽色：${R.Genetics.COLORS[b.color]} / 額羽：${R.Genetics.CRESTS[b.crest]}`;
  const groundText=e=>{
    const surface=e.surface==='turf'?'芝':'ダート';
    if(Number.isFinite(e.cushion))return `${surface}・${R.Ground.GOING[e.going]||'良'}・${R.Ground.label(e.cushion)}`;
    if(!e.trackId)return surface;
    const ground=R.Ground.conditions(e);return `${surface}・${R.Ground.GOING[ground.going]}・${ground.label}`;
  };
  const sireChoices={};
  const gradeName=level=>({GI:'G1',GII:'G2',GIII:'G3'}[level]||level);
  const victoryTier=r=>r?.rank===1&&r.finished!==false?(gradeName(r.level)==='G1'?'g1':'victory'):'report';
  const isOwnAward=a=>R.bird(state,a.birdId)?.owner==='player';
  const annualAwards=reports=>reports.filter(r=>r.type==='annual').flatMap(r=>r.awards||[]);
  const pendingFounder=b=>b&&state.founderOffers.includes(b.id)&&R.founderEligible(state,b);
  const offeredFounders=reports=>[...new Set(reports.filter(r=>r.type==='founder').map(r=>r.birdId))].map(id=>R.bird(state,id)).filter(pendingFounder);
  const reportTier=reports=>{
    if(offeredFounders(reports).length)return 'founder';
    const mine=annualAwards(reports).filter(isOwnAward);
    if(mine.some(a=>a.title==='年度代表羽'))return 'annual-champion';
    if(mine.length)return 'annual-award';
    return reports.some(r=>(r.results||[]).some(x=>victoryTier(x)==='g1'))?'g1':reports.some(r=>(r.results||[]).some(x=>victoryTier(x)==='victory'))?'victory':'report';
  };
  function awardBanner(awards) {
    const mine=awards.filter(isOwnAward);
    if(!mine.length)return '';
    const champion=mine.find(a=>a.title==='年度代表羽'),featured=champion||mine[0];
    const tier=champion?'annual-champion':'annual-award';
    const winners=[...new Set(mine.map(a=>a.birdId))].sort((a,b)=>Number(b===featured.birdId)-Number(a===featured.birdId));
    const crown='<svg viewBox="0 0 120 100" fill="none" aria-hidden="true"><path d="M23 83C5 67 6 38 19 19m-3 43-9-4m7-10-8-7m11-6-8-7m88 55c18-16 17-45 4-64m3 43 9-4m-7-10 8-7m-11-6 8-7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="m28 35 17 16 15-30 15 30 17-16-7 36H35l-7-36Z" fill="currentColor"/><path d="M36 79h48" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="28" cy="31" r="5" fill="currentColor"/><circle cx="60" cy="16" r="5" fill="currentColor"/><circle cx="92" cy="31" r="5" fill="currentColor"/><path d="m60 45 4 8-4 8-4-8 4-8Z" fill="#74452b"/></svg>';
    return `<section class="award-banner celebration-${tier}" aria-label="${champion?'年度代表羽に選出！':'年度表彰、おめでとう！'}"><div class="victory-confetti award-confetti" aria-hidden="true">${Array.from({length:champion?28:16},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="award-crown">${crown}</div><span class="award-kicker">${esc(featured.year)} ANNUAL AWARDS</span><h3>${champion?'<span>年度代表羽</span><span>に選出！</span>':'<span>年度表彰、</span><span>おめでとう！</span>'}</h3><p class="award-subtitle">${champion?'一年の頂点に輝く、最高の栄誉。':'この一年の活躍に、栄冠を。'}</p><div class="award-winners">${winners.map(id=>{
      const wins=mine.filter(a=>a.birdId===id),b=R.bird(state,id),top=wins.find(a=>a.title==='年度代表羽');
      return `<article class="award-winner ${top?'award-winner-champion':''}"><div class="award-bird-art" aria-hidden="true">${birdArt(b)}</div><div class="award-winner-copy">${top?'<span class="award-champion-label">✦ 年度代表羽 ✦</span>':''}<p class="award-bird-name">${esc(wins[0].name)}</p><p class="award-farm">${esc(wins[0].farm)}</p><div class="award-titles">${wins.map(a=>`<span class="award-title ${a.title==='年度代表羽'?'champion-title':''}">${esc(a.title)}</span>`).join('')}</div>${wins.length>1?`<p class="award-count">${wins.length}部門を受賞</p>`:''}</div></article>`;
    }).join('')}</div><span class="award-sparkle" aria-hidden="true">✦</span></section>`;
  }
  function founderBanner(b) {
    if(!pendingFounder(b))return '';
    const children=state.birds.filter(child=>child.parents[0]===b.id&&child.g1>0);
    const feather='<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M78 12C48 7 20 28 24 60l13 16c32 2 56-31 41-64Z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="2"/><path d="m18 88 53-64M34 69l-3-24m14 13 24-1M47 53l-2-19m13 6 16-1" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="m17 15 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" fill="currentColor"/></svg>';
    return `<section class="founder-banner celebration-founder" aria-label="${esc(b.name)}への始祖入りオファー"><div class="founder-feathers" aria-hidden="true">${Array.from({length:20},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="founder-seal">${feather}</div><span class="founder-kicker">LEGACY OF THE BLOODLINE</span><h3><span>始祖入りの</span><span>オファー到着！</span></h3><p class="founder-subtitle">その血統を、永遠に刻む。</p><div class="founder-candidate"><div class="founder-bird-art" aria-hidden="true">${birdArt(b)}</div><p class="founder-bird-name">${esc(b.name)}</p><div class="founder-achievements"><span>GⅠ勝利産駒 <strong>${children.length}<small>羽</small></strong></span><span>産駒のGⅠ通算 <strong>${children.reduce((n,child)=>n+child.g1,0)}<small>勝</small></strong></span></div></div><div class="founder-succession">${founderOffer(b)}</div>${button('promote','✦ 始祖入りを受ける',`data-id="${b.id}"`,'button founder-accept')}<p class="founder-invitation">新たな始祖として、この源流を未来へ。</p></section>`;
  }
  function victoryBanner(results) {
    const winners=results.filter(r=>victoryTier(r)!=='report');
    if(!winners.length)return '';
    const featured=winners.find(r=>victoryTier(r)==='g1')||winners.find(r=>['G2','G3'].includes(gradeName(r.level)))||winners[0];
    const tier=victoryTier(featured),title=tier==='g1'?'G1制覇！':/^G/.test(featured.level)?'重賞制覇！':'勝利、おめでとう！';
    const trophy='<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M27 77C9 65 7 37 20 20M18 61l-9-3m8-10-10-5m12-6-8-7m12-4-5-8m55 59c18-12 20-40 7-57m2 41 9-3m-8-10 10-5m-12-6 8-7m-12-4 5-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M34 24h32v17c0 14-7 21-16 21s-16-7-16-21V24Z" fill="currentColor"/><path d="M34 29H24v8c0 9 5 13 13 13m29-21h10v8c0 9-5 13-13 13M50 62v14m-12 3h24" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="m50 32 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" fill="var(--victory-star)"/></svg>';
    return `<section class="victory-banner celebration-${tier}" aria-label="${title}">${tier==='g1'?`<div class="victory-confetti" aria-hidden="true">${Array.from({length:16},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`:''}<div class="victory-emblem">${trophy}</div><div class="victory-copy"><span class="victory-kicker">${tier==='g1'?'最高峰の栄冠':/^G/.test(featured.level)?`${gradeName(featured.level)} WINNER`:'WINNER'}</span><h3>${title}</h3><p class="victory-bird">${esc(featured.birdName)}</p><p class="victory-race">${esc(raceLabel(featured))}</p>${winners.length>1?`<p class="victory-others">${winners.filter(r=>r!==featured).map(r=>`${esc(r.birdName)} · ${esc(raceLabel(r))} 優勝`).join('<br>')}</p>`:''}</div><span class="victory-sparkle" aria-hidden="true">✦</span></section>`;
  }
  let calendarGrade='',calendarRoute='',libraryArticle='guide',libraryQuery='';
  let sireTab='root',rootTrait='',sireQuery='',sireRoute='',sireSort='fee';
  let sireGeneticFilters=[{trait:'',rating:'☆'}];
  let state,page='home',modal=null,damId='',sireId='',breedingFruit='none',busy=false,saveOK=true,saveBlocked=false,notice='',birdFilter='all',notebookTab='calendar',returnFocus=null;
  let raceViewer=null,viewerGeneration=0;
  const SAVE_SLOTS=5,SLOT_SUMMARY_VERSION=2,storage=RanchStorage.create();
  const saveKeys=[R.SAVE_KEY,...Array.from({length:SAVE_SLOTS},(_,i)=>slotKey(i+1))];
  let savedValues=new Map(),autosaveRaw=null,storageReady=false,loading=true,persisting=0;
  const slotViews=new Map();
  $('#app').innerHTML='<p class="notice" role="status">セーブデータを読み込んでいます…</p>';
  try {
    savedValues=await storage.init(saveKeys,{readKeys:[R.SAVE_KEY]});storageReady=true;
    const raw=savedValues.get(R.SAVE_KEY);autosaveRaw=raw;
    state=raw?R.deserializeState(raw):R.initial();
    if(raw===null)modal={type:"new-game",settings:{...R.DEFAULT_NAMING}};
    if(!R.validState(state))throw Error('invalid save');
    R.upgradeState(state);
    if(raw!==null)renewRandomStream(state);
  } catch {
    state=R.initial();saveBlocked=true;saveOK=false;
    notice='保存データを読み込めませんでした。元のデータを保護しています。設定からリセットすると新しく保存できます。';
    if(!storageReady) {
      notice='保存先を開けませんでした。元のデータを保護しています。ブラウザの保存設定を確認し、再読み込みしてください。';
      try{const raw=localStorage.getItem(R.SAVE_KEY),legacy=raw&&R.deserializeState(raw);if(R.validState(legacy)){state=R.upgradeState(legacy);notice+=' 設定から以前の保存データを書き出せます。';}}catch{}
    }
  }
  function renewRandomStream(restored) {
    // Resume with fresh entropy; persisted birds and reports remain snapshots.
    // Keep engine deserialization deterministic for simulations and save checks.
    const entropy=new Uint32Array(1);
    if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(entropy);
    else entropy[0]=Math.floor(Math.random()*4294967296);
    let seed=entropy[0];
    while(seed===restored.rng||seed===state?.rng)seed=(seed+1)>>>0;
    restored.rng=seed;
  }
  async function save() {
    if(saveBlocked||modal?.type==='new-game')return;
    persisting++;
    try{const raw=R.serializeState(state);await storage.write(R.SAVE_KEY,raw,autosaveRaw);autosaveRaw=raw;saveOK=true;}
    catch(e){saveOK=false;if(e.code==='changed')blockOtherTab();else notice='自動保存ができません。設定からデータを書き出してください。';}
    finally{persisting--;}
  }
  function slotKey(slot) {
    if(!Number.isInteger(slot)||slot<1||slot>SAVE_SLOTS)throw Error('セーブスロットを選んでください。');
    return `${R.SAVE_KEY}-slot-${slot}`;
  }
  function readSlot(slot) {
    if(!storageReady)throw Error('storage unavailable');
    const key=slotKey(slot),raw=savedValues.get(key);
    if(raw===undefined)throw Error('storage unavailable');
    savedValues.delete(key);
    const viewed=entry=>{slotViews.set(key,slotView(entry));return entry;};
    if(raw===null)return viewed({raw,empty:true});
    try {
      const entry=JSON.parse(raw);
      if(entry?.version!==1||typeof entry.data!=='string'||typeof entry.savedAt!=='string'||!Number.isFinite(Date.parse(entry.savedAt)))throw Error('invalid slot');
      const saved=R.deserializeState(entry.data);
      if(!R.validState(saved))throw Error('invalid state');
      return viewed({raw,savedAt:entry.savedAt,state:saved});
    }catch{return viewed({raw,invalid:true});}
  }
  function slotView(entry) {
    if(entry.empty)return null;
    if(entry.invalid)return {version:SLOT_SUMMARY_VERSION,invalid:true};
    return {version:SLOT_SUMMARY_VERSION,savedAt:entry.savedAt,week:entry.state.week,money:entry.state.money,owned:R.own(entry.state).length};
  }
  function validSlotView(value) {
    return value?.version===SLOT_SUMMARY_VERSION&&(value.invalid===true||
      typeof value.savedAt==='string'&&Number.isFinite(Date.parse(value.savedAt))&&
      Number.isInteger(value.week)&&value.week>=9&&Number.isFinite(value.money)&&value.money>=0&&
      Number.isInteger(value.owned)&&value.owned>=0);
  }
  async function writeSlot(slot,expectedRaw) {
    const key=slotKey(slot);
    try {
      const savedAt=new Date().toISOString(),view={version:SLOT_SUMMARY_VERSION,savedAt,week:state.week,money:state.money,owned:R.own(state).length};
      const raw=JSON.stringify({version:1,savedAt,data:R.serializeState(state)});
      await storage.write(key,raw,expectedRaw,view);slotViews.set(key,view);
    }catch(e){throw Error(e.code==='changed'?'このスロットは別のタブで更新されました。確認画面を閉じて選び直してください。':'セーブできませんでした。保存容量やブラウザの保存設定を確認し、必要ならデータを書き出してください。');}
    modal=null;notice=`スロット${slot}にセーブしました。`;render();
  }
  function saveSummary(saved) {
    return `${R.when(saved.week)} ・ ${money(saved.money)} G ・ 所有 ${R.own(saved).length}羽`;
  }
  function saveSlots() {
    return `<section class="paper save-slots" aria-labelledby="save-slots-title"><h2 id="save-slots-title">セーブ・ロード</h2><p class="save-slots-description">1〜5キーでロード</p>${Array.from({length:SAVE_SLOTS},(_,i)=>{
      const slot=i+1,view=slotViews.get(slotKey(slot));
      const entry=view===undefined?{unavailable:true}:view===null?{empty:true}:view;
      const description=entry.unavailable?'保存先にアクセスできません。':entry.empty?'空きスロット':entry.invalid?'データを読み込めません。上書きして保存し直せます。':`${R.when(entry.week)} ・ ${money(entry.money)} G ・ 所有 ${entry.owned}羽`;
      return `<article class="save-slot"><div class="save-slot-info"><h3>スロット${slot}</h3><p>${esc(description)}</p>${entry.savedAt?`<time datetime="${esc(entry.savedAt)}">保存日時：${esc(new Date(entry.savedAt).toLocaleString('ja-JP'))}</time>`:''}</div><div class="save-slot-actions">${button('slot-save',entry.empty?'セーブ':'上書きセーブ',`data-slot="${slot}" aria-label="スロット${slot}にセーブ" ${entry.unavailable?'disabled':''}`,'button outline')}${button('slot-load','ロード',`data-slot="${slot}" aria-label="スロット${slot}をロード" ${entry.empty||entry.invalid||entry.unavailable?'disabled':''}`,'button quiet')}</div></article>`;
    }).join('')}</section>`;
  }
  async function loadSlot(slot,expectedRaw) {
    let entry;
    try{savedValues.set(slotKey(slot),await storage.read(slotKey(slot)));entry=readSlot(slot);}catch{throw Error('保存先にアクセスできません。ブラウザの保存設定を確認してください。');}
    if(entry.raw!==expectedRaw)throw Error('このスロットは別のタブで更新されました。確認画面を閉じて選び直してください。');
    if(!entry.state)throw Error('このスロットのデータは読み込めません。');
    const restored=R.upgradeState(entry.state);
    if(!R.validState(restored))throw Error('このスロットのデータは読み込めません。');
    renewRandomStream(restored);
    // Commit the new autosave before replacing the running ranch so a failed
    // storage write leaves both the current session and its save intact.
    try{const raw=R.serializeState(restored);await storage.restore(slotKey(slot),expectedRaw,R.SAVE_KEY,raw,autosaveRaw);autosaveRaw=raw;}
    catch(e){throw Error(e.code==='changed'?'別のタブで保存データが更新されました。再読み込みして続けてください。':'ロード後の自動保存ができないため、ロードを中止しました。保存容量やブラウザの保存設定を確認してください。');}
    state=restored;saveBlocked=false;saveOK=true;modal=null;page='home';
    damId='';sireId='';breedingFruit='none';sireTab='root';rootTrait='';sireQuery='';sireRoute='';sireSort='fee';sireGeneticFilters=[{trait:'',rating:'☆'}];
    Object.keys(sireChoices).forEach(key=>delete sireChoices[key]);birdFilter='all';notebookTab='calendar';
    notice=`スロット${slot}からロードしました。`;render();window.scrollTo({top:0});
  }
  function button(action,text,extra='',className='button primary'){return `<button class="${className}" data-action="${action}" ${extra} ${busy&&['advance','advance-month'].includes(action)?'disabled':''}>${text}</button>`;}
  function heading(title,description=''){return `<div class="page-heading"><h1>${title}</h1>${description?`<p>${description}</p>`:''}</div>`;}
  function libraryLink(article,text='図書館で読む →'){return button('library-open',text,`data-article="${article}"`,'button quiet small');}
  function library(){return L.markup({articleId:libraryArticle,query:libraryQuery});}
  function searchLibrary(){libraryQuery=$('#library-query').value.trim().slice(0,100);render();$('#library-query')?.focus({preventScroll:true});}
  function portrait(expression='talk',speaker='shiroma',framing='scene') {return speaker==='moogle'?'<img class="portrait moogle" src="assets/moogle/trainer.png" alt="トレーナーのモーグリ">':RanchCharacters.markup(expression,framing);}
  function avatar(speaker='shiroma'){return `<span class="avatar">${portrait('neutral',speaker,'face')}</span>`;}
  function note(text,speaker='shiroma'){return `<div class="character-note">${avatar(speaker)}<div><span class="speaker">${speaker==='moogle'?'モーグリ':'シロマ'}</span><p>${esc(text)}</p></div></div>`;}
  function birdArt(b) {return RanchPortraits.markup(b,R.age(state,b));}
  function landscape(){return `<img class="landscape" src="assets/home-backgrounds/${currentSeason().id}-v1.webp" width="1536" height="1024" alt="" aria-hidden="true" fetchpriority="high">`;}
  function journey() {
    const index={buy:0,breed:1,grow:2,running:3}[state.stage];
    const steps=['最初の一羽','はじめての配合','誕生を待つ','育てて、走る'];
    return `<ol class="journey" aria-label="牧場のはじめ方">${steps.map((text,i)=>`<li class="${i===index?'current':i<index?'done':''}"><span>${i<index?'✓':String(i+1).padStart(2,'0')}</span>${text}</li>`).join('')}</ol>`;
  }
  function home() {
    const stage=state.stage,first=stage==='buy',pair=stage==='breed',own=R.own(state),year=R.date(state.week).year;
    const pregnancy=own.find(b=>b.pregnancy),young=own.some(b=>b.role==='young'),sale=R.saleOpen(state),sick=own.find(b=>b.role==='racing'&&b.health);
    const unbred=R.breedingOpen(state)&&own.find(b=>b.role==='mare'&&!b.pregnancy&&b.bredYear!==year);
    const text=first?`ようこそ、${state.naming.ranchName}へ！ ${own.find(b=>b.registered)?.name||'チョコボ'}も、あなたに会えてうれしそうです。`:
      pair?'新しい家族が来て、牧場がにぎやかになりましたね。':
      unbred?`${unbred.name}も、春の風が待ち遠しかったみたい。`:
      pregnancy?`${pregnancy.name}の子に会えるまで、あと${pregnancy.pregnancy.due-state.week}週です。`:
      sale?'町から、にぎやかな羽音が聞こえてきますね。':sick?`${sick.name}は療養中です。あと${sick.health}週ほどかかりそうです。`:
      young?'子どもたちは元気に育っています。':'今週も、のんびりいきましょう。';
    const action=first?button('nav','繁殖牝羽セールへ <span>→</span>','data-page="market"'):pair?button('nav','配合へ <span>→</span>','data-page="breed"'):button('advance','次の週へ <span>→</span>');
    const more=first||pair?'':button('advance-month','4週進める','','button quiet')+(unbred?button('nav','配合へ','data-page="breed"','button outline'):sale?button('nav','セールへ','data-page="market"','button outline'):'');
    return `<section class="home-scene">${landscape()}${portrait(first?'happy':'neutral')}<div class="dialogue"><div class="dialogue-top"><span class="speaker">シロマ</span></div><p>${esc(text)}</p><div class="dialogue-actions">${action}${more}</div></div></section>${!state.milestones.win?journey():''}`;
  }
  function reportModal() {
    const reports=state.reports,weekly=reports.filter(r=>r.type==='weekly'),letters=reports.filter(r=>r.type!=='weekly');
    const registrationPending=reports.some(r=>r.type==='registration');
    const multi=weekly.length>1,title=multi?`${weekly.length}週分の報告`:'シロマからの報告';
    const period=multi?`${R.when(weekly[0].week)} 〜 ${R.when(weekly.at(-1).week)}`:R.when(weekly[0]?.week??state.week);
    const tier=reportTier(reports),awards=annualAwards(reports),founders=offeredFounders(reports);
    return `<header class="report-modal-heading"><span class="eyebrow">${tier==='founder'?'FOUNDER OFFER':tier.startsWith('annual-')?'ANNUAL AWARDS':tier==='report'?'RANCH LETTER':'VICTORY LETTER'}</span><h2 id="dialog-title">${title}</h2><p>${period}</p></header>${founders.map(founderBanner).join('')}${awardBanner(awards)}${victoryBanner(reports.flatMap(r=>r.results||[]))}${letters.map(r=>reportPage(r,multi)).join('')}${multi?`<section class="weekly-digest"><h3>${weekly.length}週のダイジェスト</h3>${weekly.map(r=>`<article class="digest-entry"><header><b>${esc(r.title)}</b><span>収支 ${r.change>=0?'+':''}${money(r.change)} G</span></header><p>${esc(r.text)}</p>${r.notes?.map(n=>`<p class="soft-note">${esc(n)}</p>`).join('')||''}${reportRaces(r)}</article>`).join('')}</section>`:weekly.map(r=>reportPage(r)).join('')}<div class="report-modal-actions">${registrationPending?button('ack','登録する'):button('close','閉じる','','button outline')}${!registrationPending&&!['buy','breed'].includes(state.stage)?`${button('advance','次の週へ →')}${button('advance-month','4週進める','','button quiet')}`:''}</div>`;
  }
  function awardList(awards){return `<div class="award-list"><h4>年度表彰の結果</h4>${awards.map(a=>`<div class="list-row ${isOwnAward(a)?'award-row-mine':''} ${a.title==='年度代表羽'?'award-row-champion':''}"><span>${a.title==='年度代表羽'?'✦ ':''}${esc(a.title)}${isOwnAward(a)?'<small class="award-own-label">自牧場の受賞</small>':''}</span><b>${esc(a.name)}<small>${esc(a.farm)} ・ ${esc(a.points)}点</small></b></div>`).join('')}</div>`;}
  function reportPage(r,showDate=false) {
    // A single weekly letter is already dated by the modal heading.
    return `${r.type==='weekly'?'':`<header class="report-heading"><h3>${esc(r.title)}</h3>${showDate?`<p>${R.when(r.week)}</p>`:''}</header>`}<section class="letter"><div class="letter-body"><div class="letter-from">${avatar()}<span>シロマ</span></div><p class="letter-message">${esc(r.text)}</p>${r.notes?.map(n=>`<p class="soft-note">${esc(n)}</p>`).join('')||''}${r.income!==undefined?`<div class="finance-strip"><span>収入<strong>+ ${money(r.income)} <small>G</small></strong></span><span>支出<strong>− ${money(r.expense)} <small>G</small></strong></span><span>今のギル<strong>${money(state.money)} <small>G</small></strong></span></div>`:''}${r.type==='annual'&&r.awards?.length?awardList(r.awards):''}${r.results?.length?reportRaces(r):''}${r.type==='registration'?registration(r):''}${RanchObservation.birthGenetics(state,r)}${r.type==='birth'?`${libraryLink('breeding','誕生した素質の読み方 →')}<div class="birth-card">${birdArt(R.bird(state,r.birdId))}<div><b>${esc(R.bird(state,r.birdId).name)}</b><p>穏やかな平原でお世話しています。</p>${button('detail','この子に会う',`data-id="${r.birdId}"`,'button quiet')}</div></div>`:''}${r.type==='founder'&&!pendingFounder(R.bird(state,r.birdId))?founderOffer(R.bird(state,r.birdId)):''}<div class="letter-actions"><span>${r.change!==undefined?`今週の収支 ${r.change>=0?'+':''}${money(r.change)} G`:''}</span></div></div><div class="letter-portrait">${portrait(r.expression,'shiroma','head')}</div></section>`;
  }
  const POLICIES={steady:'着実に勝つ',challenge:'重賞に挑む'};
  function policyOptions(value){return Object.entries(POLICIES).map(([key,label])=>`<option value="${key}" ${value===key?'selected':''}>${label}</option>`).join('');}
  function replayButton(r,id,className='button outline'){
    return r.replay?button('watch-race','観戦する',`data-id="${esc(id)}" data-week="${r.week}"`,className):'';
  }
  const raceLabel=x=>/^G/.test(x.level)
    ?`${gradeName(x.level)} ${x.name} ${x.surface==='turf'?'芝':'ダート'}${x.distance}m`
    :x.name.includes(`${x.distance}m`)?x.name:`${x.name} ・ ${x.distance}m`;
  function reportRaces(r){
    return `<div class="race-results">${(r.results||[]).map(x=>`<div class="race-report-entry"><button class="result-row celebration-${victoryTier(x)}" data-action="result" data-id="${esc(x.birdId)}" data-week="${x.week}"><b class="placing">${x.rank}<small>着</small></b><span><strong>${esc(x.birdName)}</strong><small>${esc(raceLabel(x))}</small>${victoryTier(x)!=='report'?`<span class="result-victory-label">${victoryTier(x)==='g1'?'✦ G1制覇':/^G/.test(x.level)?`${gradeName(x.level)}制覇`:'優勝'}</span>`:''}</span><span>+${money(x.reward)} G <small>結果を見る ↗</small></span></button>${replayButton(x,x.birdId,'button quiet')}</div>`).join('')}</div>`;
  }
  function finishOrder(r,id){return `<ol class="finish-order">${r.field.map((x,i)=>`<li class="${x.id===id?'mine':''}"><span>${i+1}</span><b>${esc(x.name)}</b><span>${x.finished===false?'未完走':`${Math.floor(x.time/60)}:${(x.time%60).toFixed(2).padStart(5,'0')}`}</span></li>`).join('')}</ol>`;}
  function viewerMarkup(r,id){
    const awarded=r.rank===1&&r.finished!==false,playback=modal.playback||{};
    return `<div class="race-viewer"><header class="race-viewer-head"><div><h2 id="dialog-title">${esc(raceLabel(r))}</h2><p>${R.when(r.week)} / ${esc(tracks[r.trackId]?.name||'競走場')} / ${r.distance}m / ${groundText(r)}</p></div></header>
      <div class="race-stage"><div class="race-loading" role="status">競走場とチョコボを準備しています…</div><div class="race-hud"><div><span data-race-phase>パドック</span><b data-race-clock>0:00.00</b><small data-race-remaining></small><small data-race-camera>パドック</small></div><div><ol class="race-live-order" data-live-order aria-label="現在の上位5羽"></ol></div></div>
        <div class="race-commentary"><div class="race-commentator speaking" data-commentator="lamia"><img src="assets/commentators/lamia.png" alt="実況のラミア"><span>ラミア / 実況</span></div><div class="race-commentary-copy"><span data-commentary-speaker>ラミア / 実況</span><p data-commentary-text>パドックから、レースの模様をお届けします！</p></div><div class="race-commentator" data-commentator="sahagin"><img src="assets/commentators/sahagin.png" alt="解説のサハギン"><span>サハギン / 解説</span></div></div>
      </div>
      <div class="race-controls"><button class="button primary" data-viewer="pause" data-needs-viewer disabled aria-pressed="false">Ⅱ 一時停止</button><button class="button outline" data-viewer="restart" data-needs-viewer disabled>↺ 最初から</button><label>再生速度<select data-viewer-speed data-needs-viewer disabled>${[[.5,'0.5×'],[1,'1×'],[2,'2×'],[4,'4×']].map(([value,label])=>`<option value="${value}" ${value===(playback.rate??1)?'selected':''}>${label}</option>`).join('')}</select></label><label>動き<select data-viewer-pitch data-needs-viewer disabled aria-label="動きのテンポ">${[[1,'ゆったり'],[1.5,'ふつう'],[2,'きびきび']].map(([value,label])=>`<option value="${value}" ${value===(playback.pitch??2)?'selected':''}>${label}</option>`).join('')}</select></label><label>注目羽<select data-viewer-focus data-needs-viewer disabled>${r.replay.runners.slice().sort((a,b)=>a.lane-b.lane).map(x=>`<option value="${esc(x.id)}" ${x.id===(playback.focusId??id)?'selected':''}>${x.lane+1}番 ${esc(x.name)}</option>`).join('')}</select></label><div class="race-camera-controls" aria-label="カメラ切替">${[['broadcast','中継'],['follow','追走'],['overview','全景'],['finish','ゴール']].map(([key,label])=>`<button class="button quiet" data-viewer="camera" data-camera="${key}" aria-pressed="${key===(playback.cameraMode??'broadcast')}" data-needs-viewer disabled>${label}</button>`).join('')}</div></div>
      <div class="race-paddock-controls" data-paddock-controls aria-label="パドックの出走羽紹介"><button class="button quiet" data-viewer="paddock-prev" data-needs-viewer disabled>← 前の羽</button><span data-paddock-progress>1 / ${r.replay.runners.length}羽</span><button class="button quiet" data-viewer="paddock-next" data-needs-viewer disabled>次の羽 →</button><button class="button outline" data-viewer="paddock-skip" data-needs-viewer disabled>発走へ進む</button></div>
      <div class="race-seek"><input type="range" min="0" max="1" value="0" step=".1" data-viewer-seek data-needs-viewer disabled aria-label="観戦の再生位置"><span data-viewer-time>0:00.00</span></div><div class="race-chapters" aria-label="場面へ移動">${[['paddock','パドック'],['gate','出走'],['race','レース'],['result','決着'],...(awarded?[['award','表彰']]:[])].map(([key,label])=>`<button class="button quiet" data-viewer="phase" data-phase="${key}" data-needs-viewer disabled>${label}</button>`).join('')}</div>
      <div class="race-voice-controls"><button class="button outline" data-viewer="voice" aria-pressed="false">実況音声</button><small data-voice-status>実況字幕 ON / 音声 OFF</small></div>
      <details class="race-result-sheet"><summary>着順（${r.rank}着）</summary>${finishOrder(r,id)}</details></div>`;
  }
  function registration(r) {
    return `<div class="registration">${note('いよいよデビュークポ！ 胸が高鳴るクポ！','moogle')}${r.birdIds.map(id=>{const b=R.bird(state,id);return `<div class="registration-row"><label>名前<input data-register-name="${id}" value="${esc(b.name)}" minlength="2" maxlength="9" pattern="[ァ-ヺー]{2,9}" title="2〜9文字のカタカナ（長音も使用可）"></label><label>方針<select data-register-policy="${id}">${policyOptions(b.policy)}</select></label></div>`;}).join('')}<p class="muted">カタカナ2〜9文字（長音「ー」も可）。登録後は名前を変更できません。</p></div>`;
  }
  function market() {
    const birds=state.sale.map(id=>R.bird(state,id)).filter(b=>b.owner==='sale'),open=R.saleOpen(state);
    return `${heading('繁殖牝羽セール',open?'3月第4週まで':'毎年2月〜3月')}${note(open?'みんな、いい顔をしていますね。':'次に会える子たちが、楽しみですね。')}${libraryLink('economy','繁殖市場について →')}${open?`<div class="bird-grid sale-grid">${birds.map((b,i)=>`<article class="bird-card"><div class="bird-illustration ${b.color}"><span class="lot">LOT ${String(i+1).padStart(2,'0')}</span>${birdArt(b)}<span class="tag">${R.age(state,b)}歳 ・ 牝</span></div><div class="bird-card-body"><h2>${esc(b.name)}</h2><p>${esc(b.comment)}</p>${hints(b)}${career(b)}${geneticResearch(b,{open:false})}${pedigreeView(b)}<div class="card-bottom"><strong>${money(b.price)} <small>G</small></strong>${button('buy-dialog','この子を迎える',`data-id="${b.id}" ${state.money<b.price?'disabled':''}`,'button outline')}</div></div></article>`).join('')||'<div class="empty">今年のロットはすべて売れました。</div>'}</div>`:''}`;
  }
  function hints(b) {
    const p=R.profile(b),conditions=[...new Set(R.Breeding.defectSummary(b.genome,R.DEFECTS).filter(d=>d.active&&R.Breeding.SPECIAL[d.trait]).map(d=>R.DEFECT_LABELS[d.trait]))];
    return `<div class="trait-hints"><p>${esc(p.distance)} / ${esc(p.style)}</p><p><b>長所</b> ${esc(p.strengths)}</p><p><b>短所</b> ${esc(p.weaknesses)}</p>${conditions.length?`<p><b>体質</b> ${conditions.map(esc).join("・")}</p>`:""}</div>`;
  }
  function lineageView(b,{founder=false}={}) {
    const source=R.paternalRoot(state,b),current=founder&&R.lineageFounder(state,b);
    return `<div class="paternal-lineage"${source?` data-lineage="${source.lineage}"`:''}><span>源流（父系）</span><strong>${source?esc(source.name)+'系':'不明'}</strong>${current?`<small>この源流の始祖：${esc(current.name)}</small>`:''}</div>`;
  }
  function founderOffer(b) {
    const current=R.lineageFounder(state,b);
    return `${lineageView(b,{founder:true})}<p class="founder-rule">${current?`${esc(b.name)}が始祖入りすると、${esc(current.name)}と交代し、先代は供用を終えます。`:'この源流には、まだ始祖がいません。'}</p>${libraryLink('founders','始祖入りについて →')}`;
  }
  function pedigreeView(b,{compact=false,lineage=true}={}) {
    const lookup=id=>R.bird(state,id);
    function branch(id,depth,label,seen=[]){
      const p=lookup(id);
      if(!p)return `<li><span class="muted">${label}：不明</span></li>`;
      const title=`<span>${label}：${button('detail',esc(p.name),`data-id="${p.id}"`,'button quiet small')}</span>`;
      if(depth>=R.Breeding.DEPTH||!p.parents.length||seen.includes(id))return `<li>${title}</li>`;
      return `<li><details ${depth===1?'open':''}><summary>${title}</summary><ul>${[0,1].map(i=>branch(p.parents[i],depth+1,i?'母':'父',[...seen,id])).join('')}</ul></details></li>`;
    }
    const parents=compact?`<div class="parent-pair">${[0,1].map(i=>{const p=lookup(b.parents[i]);return `<div><small>${i?'母':'父'}</small>${p?button('detail',esc(p.name),`data-id="${p.id}"`,'button quiet small'):'<span class="muted">不明</span>'}</div>`;}).join('')}</div>`:'';
    return `${lineage?lineageView(b,{founder:true}):''}${parents}<details class="pedigree"><summary>5代血統</summary>${b.parents.length?`<ul class="pedigree-tree">${[0,1].map(i=>branch(b.parents[i],1,i?'母':'父')).join('')}</ul>`:`<p class="muted">${b.kind==='root'?'はじまりの血統です。':'父母は不明です。'}</p>`}</details>`;
  }
  function crossHint(sire,dam) {
    if(!sire||!dam)return '';
    const crosses=R.breedingCrosses(state,sire,dam),percent=n=>`${+(n*100).toFixed(3)}%`;
    if(!crosses.length)return '';
    return `<section class="paper cross-preview"><h3>この配合のクロス</h3>${R.crossReason(state,sire,dam)?`<p class="cross-danger" role="alert">${esc(R.crossReason(state,sire,dam))}</p>`:''}<div class="cross-scroll"><table><thead><tr><th>共通する祖先</th><th>位置</th><th>血量</th><th>長所を強める</th><th>欠点を強める</th></tr></thead><tbody>${crosses.map(c=>`<tr><th>${esc(c.name)}</th><td>${c.positions.join(' × ')}</td><td>${percent(c.blood)}</td><td>${percent(c.benefitRate)}</td><td>${percent(c.defectRate)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function career(b) {
    if(!b.races)return '';
    const wins=b.records.filter(r=>r.rank===1&&/^G/.test(r.level)),listed=wins.length>3?wins.filter(r=>r.level==='GI'):wins;
    return `<div class="career-summary"><p>${esc(R.farmName(b,state))} / ${b.races}戦 ${b.wins}勝${wins.length?` / 重賞 ${wins.length}勝`:''}${b.g1?`（GⅠ ${b.g1}勝）`:''}</p>${listed.length?`<p>${listed.map(r=>`${esc(raceLabel(r))}（${esc(R.when(r.week))}）`).join('、')}</p>`:''}</div>`;
  }
  function gradedCareer(b) {
    const wins=b.records.filter(r=>r.rank===1&&/^G/.test(r.level));
    if(!wins.length&&!b.g1)return '';
    return `<section class="graded-career"><h3>重賞成績</h3><p>GⅠ ${b.g1}勝${wins.length?` / 重賞 ${wins.length}勝`:''}</p>${wins.length?`<details><summary>勝った重賞</summary>${wins.map(r=>`<p>${esc(raceLabel(r))} <small>${esc(R.when(r.week))}</small></p>`).join('')}</details>`:''}</section>`;
  }
  function offspringCareer(b,{compact=false}={}) {
    if(b.role!=='stud'||b.kind!=='home')return '';
    const winners=state.birds.filter(child=>child.parents[0]===b.id&&child.g1>0);
    const wins=winners.reduce((total,child)=>total+child.g1,0);
    const summary=`産駒GⅠ勝利数 <b>${wins}勝</b> / GⅠ勝利産駒数 <b>${winners.length}羽</b>`;
    return compact?`<small class="offspring-career">${summary}</small>`:`<section class="graded-career offspring-career"><h3>産駒のGⅠ成績</h3><p>${summary}</p></section>`;
  }
  function breedingFamily(b) {
    if(b.sex!=='F')return '';
    const children=state.birds.filter(child=>child.parents[1]===b.id).sort((a,c)=>c.bornWeek-a.bornWeek);
    if(b.role!=='mare'&&!children.length)return '';
    const mate=b.pregnancy?R.bird(state,b.pregnancy.sireId):children.length?R.bird(state,children[0].parents[0]):null;
    return `<section class="breeding-family"><h3>配合相手・産駒</h3><div class="family-pair"><span>${b.pregnancy||!children.length?'配合相手':'最新の産駒の父'}</span>${mate?button('detail',esc(mate.name),`data-id="${mate.id}"`,'button quiet small'):`<span class="muted">${b.bredYear?'記録なし':'未配合'}</span>`}</div>${b.pregnancy?`<p class="family-due">出産予定 ${R.when(b.pregnancy.due)}</p>`:''}<details${children.length?' open':''}><summary>産駒 ${children.length}羽</summary>${children.map(child=>{const father=R.bird(state,child.parents[0]);return `<div class="offspring-row"><div>${button('detail',esc(child.name),`data-id="${child.id}"`,'button quiet small')}<small>${R.age(state,child)}歳 ・ ${child.sex==='F'?'牝':'牡'} ・ ${role(child)} / GⅠ ${child.g1}勝</small></div><div><small>父</small>${father?button('detail',esc(father.name),`data-id="${father.id}"`,'button quiet small'):'<span class="muted">不明</span>'}</div></div>`;}).join('')||'<p class="muted">まだ産駒はいません。</p>'}</details></section>`;
  }
  function bonusHint(sire,dam) {
    if(!sire||!dam)return '';
    const entries=Object.entries(R.pedigreeBonus(state,sire,dam)).filter(([,v])=>v.lower||v.upper);
    if(!entries.length)return '';
    return `<details class="soft-note"><summary>血統のGⅠ実績による補正</summary><p>${entries.map(([key,v])=>`${traitLabels[key]}：下限 +${v.lower.toFixed(1)} / 上限 +${v.upper.toFixed(1)}`).join(' ・ ')}</p></details>`;
  }
  function offspringPreview(sire,dam) {
    if(!sire||!dam)return '';
    const ranges=R.breedingPreview(state,sire,dam),level=R.labLevel(state),numeric=level>=2;
    const table=labels=>`<div class="ability-grid ${numeric?'numeric':'ratings-only'}">${Object.entries(labels).map(([key,label])=>{
      const range=ranges[key],rating=Object.hasOwn(R.Genetics.COURSE_APTITUDES,key)?R.Genetics.courseRating:R.geneticRating,low=rating(range.min),high=rating(range.max);
      const min=Math.floor(range.min),max=Math.floor(range.max);
      return `<div data-preview-trait="${key}"><span>${label}</span><b>${low===high?low:`${low}〜${high}`}${numeric?` <small data-score="${key}">${min===max?min:`${min}〜${max}`}</small>`:''}</b></div>`;
    }).join('')}</div>`;
    return `<section class="paper offspring-preview"><h3>子の予想</h3>${table(statLabels)}${level>=1?`<h4>羽場適性</h4>${table(R.Genetics.SURFACE_APTITUDES)}<h4>コーナー・直線</h4>${table(R.Genetics.COURSE_APTITUDES)}<h4>成長と加齢</h4>${table(R.Genetics.DEVELOPMENT)}`:''}</section>`;
  }
  function birdSchedule(b) {
    const editable=b.owner==='player'&&b.role==='racing'&&b.registered;
    if(!editable)return '';
    return `<section class="bird-schedule"><div class="section-title"><h3>予定</h3><span class="tag">8週</span></div><div class="schedule-list">${R.upcomingSchedule(state,b).map(row=>{
      const chosen=row.override.mode==='auto'?'auto':row.override.mode==='training'?`training:${row.override.menu}`:row.override.mode==='race'?`race:${row.override.eventId}`:'rest';
      const choices=[['auto','モーグリにおまかせ'],...Object.entries(R.TRAINING_MENUS).map(([key,menu])=>[`training:${key}`,`調教：${menu.label}`]),['rest','休養'],...R.raceOptions(state,b,row.week).map(e=>[`race:${e.id}`,`出走：${raceLabel(e)} / ${e.track.name} / ${money(e.fee)} G`])];
      const description=row.mode==='race'?raceLabel(row.event):row.mode==='rest'?'休養':R.TRAINING_MENUS[row.menu].label;
      return `<div class="schedule-row ${row.mode}" data-plan-week="${row.week}"><div><time>${R.when(row.week)}${row.week===state.week?' ・ 今週':''}</time><b>${esc(description)}</b><small>${row.manual?'指定した予定':'おまかせ'}${row.reason?` / ${esc(row.reason)}`:''}${row.event?` / ${esc(row.event.track.name)} / ${groundText(row.event)}`:''}</small></div><label><span class="sr-only">${esc(b.name)}の${R.when(row.week)}の予定</span><select data-schedule-id="${b.id}" data-week="${row.week}">${!choices.some(([key])=>key===chosen)?`<option value="${esc(chosen)}" selected disabled>指定レースは現在の条件では出走不可</option>`:''}${choices.map(([key,label])=>`<option value="${esc(key)}" ${key===chosen?'selected':''}>${esc(label)}</option>`).join('')}</select></label></div>`;
    }).join('')}</div></section>`;
  }
  function breedingFruitChoice() {
    if(R.labLevel(state)<1)return '';
    return `<section class="paper breeding-fruit"><label class="form-field" for="breeding-fruit">産み分けの実<select id="breeding-fruit">${Object.entries(R.BREEDING_FRUITS).map(([key,f])=>`<option value="${key}" ${key===breedingFruit?'selected':''}>${f.name}${f.sex?` ・ ${f.sex==='M'?'オス':'メス'}確定 ・ ${money(f.cost)}ギル`:''}</option>`).join('')}</select></label></section>`;
  }
  function sireGeneticSummary(b) {
    const filters=sireGeneticFilters.filter(f=>f.trait);
    return filters.length?`<small class="sire-genetic-match">遺伝：${filters.map(f=>`${traitLabels[f.trait]} ${R.geneticTraitRating(b,f.trait)}`).join(' / ')}</small>`:'';
  }
  function sireGeneticSearch() {
    const labels=searchableGeneticTraits();
    return `<fieldset class="sire-genetic-search"><legend>遺伝評価で絞り込む</legend><p class="muted" id="sire-genetic-help">すべての条件に一致する種牡羽を表示</p><div class="sire-genetic-rows">${sireGeneticFilters.map((filter,index)=>`<div class="sire-genetic-row"><label for="sire-genetic-trait-${index}">遺伝の項目 ${index+1}<select id="sire-genetic-trait-${index}" data-genetic-index="${index}" data-genetic-field="trait" aria-describedby="sire-genetic-help"><option value="">指定なし</option>${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${filter.trait===key?'selected':''}>${label}</option>`).join('')}</select></label><label for="sire-genetic-rating-${index}">評価 ${index+1}<select id="sire-genetic-rating-${index}" data-genetic-index="${index}" data-genetic-field="rating">${GENETIC_RATINGS.map(rating=>`<option value="${rating}" ${filter.rating===rating?'selected':''}>${rating}</option>`).join('')}</select></label>${button('remove-sire-genetic-filter','削除',`data-index="${index}" aria-label="遺伝条件${index+1}を削除"`,'button quiet small')}</div>`).join('')}</div><div class="sire-genetic-actions">${button('add-sire-genetic-filter','条件を追加','','button outline small')}${button('clear-sire-genetic-filters','遺伝条件をクリア','','button quiet small')}</div></fieldset>`;
  }
  function breedPage() {
    if(R.labLevel(state)<1)breedingFruit='none';
    const ownedMares=R.own(state).filter(b=>b.role==='mare');
    const mares=ownedMares.filter(b=>b.bredYear!==R.date(state.week).year),allSires=R.sires(state);
    if(!mares.some(b=>b.id===damId))damId=mares[0]?.id||'';
    const dam=R.bird(state,damId);
    const sires=(sireTab==='public'?R.searchSires(state,{query:sireQuery,route:sireRoute,sort:sireSort,geneticFilters:sireGeneticFilters,dam}):allSires).filter(b=>sireGroup(b)===sireTab).filter(b=>{
      if(sireTab!=='root'||!rootTrait)return true;
      const profile=R.ROOTS.find(r=>r.lineage===b.lineage);
      return profile?.primary===rootTrait||profile?.secondary===rootTrait||profile?.strengths.includes(rootTrait);
    });
    if(!sires.some(b=>b.id===sireId))sireId=sires[0]?.id||'';
    sireChoices[sireTab]=sireId;
    const sire=R.bird(state,sireId),reason=R.breedingReason(state,dam,sire,breedingFruit);
    const empty={root:'この持ち味を持つ源流はいません。',public:sireQuery||sireRoute||sireGeneticFilters.some(f=>f.trait)?'条件に一致する種牡羽が見つかりません。':'他の牧場の種牡羽はいません。',founder:'始祖はまだいません。',home:'自家製の種牡羽はまだいません。'};
    const tabs=`<div class="tabs sire-tabs" role="tablist" aria-label="種牡羽の区分">${SIRE_TABS.map(([key,label])=>button('sire-tab',`${label} <small>${allSires.filter(b=>sireGroup(b)===key).length}</small>`,`id="sire-tab-${key}" data-tab="${key}" role="tab" aria-selected="${sireTab===key}" aria-controls="sire-panel" tabindex="${sireTab===key?0:-1}"`,`tab ${sireTab===key?'active':''}`)).join('')}</div>`;
    const filter=sireTab==='root'?`<label class="sire-filter" for="root-trait">つなぎたい持ち味<select id="root-trait"><option value="">すべての持ち味</option>${Object.entries(traitLabels).map(([key,label])=>`<option value="${key}" ${rootTrait===key?'selected':''}>${label}</option>`).join('')}</select><span class="muted">${sires.length} / 32羽</span></label>`:sireTab==='public'?`<div class="sire-search"><label>名前・牧場・勝ったレース<input id="sire-query" value="${esc(sireQuery)}" placeholder="例：メテオ、ダービー">${button('search-sires','検索','','button outline small')}</label><label>GⅠ勝利路線<select id="sire-route">${[['','全路線'],['sprint','短距離'],['mile','マイル'],['middle','中距離'],['long','長距離'],['dirt','ダート']].map(([k,n])=>`<option value="${k}" ${sireRoute===k?'selected':''}>${n}</option>`).join('')}</select></label><label>並び順<select id="sire-sort">${[['fee','料金が安い順'],['g1','GⅠ勝利数'],['offspring','子の能力期待値が高い順'],...Object.entries(traitLabels).filter(([k])=>!Object.hasOwn(R.Genetics.DEVELOPMENT,k))].map(([k,n])=>`<option value="${k}" ${sireSort===k?'selected':''}>${n}</option>`).join('')}</select></label>${sireGeneticSearch()}<p class="muted" role="status">${sires.length}羽</p></div>`:'';
    const list=sires.map(b=>`<button class="sire-option ${b.id===sireId?'selected':''}" data-action="select-sire" data-id="${b.id}" aria-pressed="${b.id===sireId}"><span class="radio-mark"></span><span class="sire-info"><span class="tag">${kind(b)}</span><strong>${esc(b.name)}</strong>${lineageView(b)}<small>${esc(b.comment||R.observe(state,b))}</small><small>${colorText(b)}</small>${hints(b)}${sireTab==='public'?sireGeneticSummary(b):''}${offspringCareer(b,{compact:true})}${b.races?`<small>${esc(R.farmName(b,state))} / ${b.races}戦${b.wins}勝${b.g1?` / GⅠ ${b.g1}勝`:''}</small>`:''}</span><span class="sire-price">${R.breedFee(b)?money(R.breedFee(b))+' G':'無料'}</span></button>`).join('');
    const parent=(b,mother)=>`<section class="paper breeding-parent"><header class="breeding-parent-head">${birdArt(b)}<div><span class="eyebrow">${mother?'母':'父'}</span><h2>${esc(b.name)}</h2>${mother?`<label for="dam-choice">繁殖牝羽<select id="dam-choice">${mares.map(m=>`<option value="${m.id}" ${m.id===damId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>`:button('open-sire-picker','種牡羽を変更','','button outline small')}</div></header>${geneticResearch(b,{compact:true,showLoci:false})}${pedigreeView(b,{compact:true})}${gradedCareer(b)}${offspringCareer(b)}${mother?breedingFamily(b):''}<details class="parent-notes"><summary>持ち味・競走情報</summary><p>${esc(R.observe(state,b))}</p><p>${colorText(b)}</p>${hints(b)}${career(b)}</details></section>`;
    return `${heading('配合')}${libraryLink('breeding','配合・遺伝について →')}<div class="breeding-season ${R.breedingOpen(state)?'open':'closed'}" role="status">${R.breedingOpen(state)?'配合期間中（4月第4週まで）':'配合期間外（3月第1週から）'}</div>${!dam?`<div class="empty">${ownedMares.length?'<h2>今年の配合はすべて済んでいます。</h2>':`<h2>繁殖牝羽がいません。</h2>${button('nav','繁殖牝羽セールへ','data-page="market"')}`}</div>`:`<section class="breeding-confirm ${R.breedingOpen(state)?'':'unavailable'}"><div><h3>${esc(dam.name)} <span>×</span> ${esc(sire?.name||'種牡羽を選んでください')}</h3><p>${R.breedingOpen(state)?esc(reason)||`出産予定 ${R.when(state.week+R.GESTATION)}`:''}</p></div>${button('breed-dialog',`配合する${sire?` <span>${money(R.breedingCost(sire,breedingFruit))} G</span>`:''}`,reason?'disabled':'')}</section>${breedingFruitChoice()}<details class="paper sire-picker" id="sire-picker"><summary>種牡羽を選ぶ <span>${esc(sire?.name||'未選択')}</span></summary>${tabs}<div id="sire-panel" role="tabpanel" aria-labelledby="sire-tab-${sireTab}">${filter}<div class="sire-list">${list||`<p class="sire-empty">${empty[sireTab]}</p>`}</div></div></details>${offspringPreview(sire,dam)}${RanchObservation.locusComparison(state,sire,dam)}${crossHint(sire,dam)}<div class="breeding-layout">${parent(dam,true)}${sire?parent(sire,false):'<section class="paper"><p class="muted">種牡羽を選んでください。</p></section>'}</div>${bonusHint(sire,dam)}`}`;

  }
  function birdsPage() {
    const all=R.own(state),birds=all.filter(b=>birdFilter==='all'||b.role===birdFilter),year=R.date(state.week).year;
    const status=b=>b.pregnancy?`誕生まであと${b.pregnancy.due-state.week}週`:b.role==='young'?`${R.FACILITIES[b.pasture]?.name||'放牧地'}で成長中`:b.role==='racing'?`${b.races}戦 ${b.wins}勝${b.health?' ・ 療養中':b.condition<75||b.strain>25?' ・ 休養中':''}`:b.role==='stud'?`${kind(b)}種牡羽`:b.bredYear===year?'今年は配合済み':'配合待ち';
    const badge=b=>b.g1?`GⅠ ${b.g1}勝`:b.color==='golden'?'黄金の羽':'';
    return `${heading('チョコボ')}${capacityStrip()}<div class="tabs">${[['all','みんな'],['young','幼羽'],['racing','競走羽'],['mare','繁殖牝羽'],['stud','種牡羽']].map(([k,n])=>button('filter',`${n} <small>${all.filter(b=>k==='all'||b.role===k).length}</small>`,`data-filter="${k}" aria-pressed="${birdFilter===k}"`,`tab ${birdFilter===k?'active':''}`)).join('')}</div>${birds.length?`<div class="bird-grid">${birds.map(b=>`<button class="bird-card selectable" data-action="detail" data-id="${b.id}"><div class="bird-illustration ${b.color}"><span class="lot">${role(b)}</span>${birdArt(b)}<span class="tag">${R.age(state,b)===null?'時を超える血統':R.age(state,b)+'歳'} ・ ${b.sex==='F'?'牝':'牡'}</span></div><div class="bird-card-body"><h2>${esc(b.name)}</h2>${lineageView(b)}<p>${status(b)}</p>${badge(b)?`<div class="card-bottom"><span>${badge(b)}</span></div>`:''}</div></button>`).join('')}</div>`:`<div class="empty"><h2>${all.length?'この区分のチョコボはいません。':'まだチョコボがいません。'}</h2></div>`}`;
  }
  function capacityStrip() {
    const cap=R.capacity(state),all=R.own(state),reserved=all.filter(b=>b.pregnancy).length;
    return `<div class="capacity-strip"><span>幼羽・競走羽 <b>${R.racingCount(state)} / ${cap.racing}</b>${reserved?` <small>（うち誕生待ち ${reserved}）</small>`:''}</span><span>繁殖牝羽 <b>${all.filter(b=>b.role==='mare').length} / ${cap.mare}</b></span><span>種牡羽 <b>${all.filter(b=>b.role==='stud').length} / ${cap.stud}</b></span></div>`;
  }
  function facilityAction(key) {
    return !state.facilities[key]?'建設':key==='stalls'&&state.facilities[key]>=4?'改良':'拡張';
  }
  function facilitiesPage() {
    // CSS variables resolve relative URLs against ranch.css; use the page base before passing artwork to CSS.
    return `${heading('施設')}${libraryLink('facilities','施設の効果について →')}${capacityStrip()}<div class="facility-grid">${Object.entries(R.FACILITIES).map(([key,f])=>{const reason=R.facilityReason(state,key),level=state.facilities[key],locked=!!f.lock&&reason.includes('で建設')||reason.includes('すると建設'),art=level>0?new URL(`/assets/facilities/${key}-lv${Math.min(level,f.artMax??f.max)}-v1.webp`,document.baseURI).href:'';return `<article class="paper facility ${locked?'locked':''}${art?' has-art':''}"${art?` style="--facility-image:url('${esc(art)}')"`:''}><div class="section-title"><span class="facility-symbol">${{stalls:'⌂',course:'◎',hill:'△',pool:'≋',spa:'♨',clinic:'✚',meadow:'♧',forest:'♤',shop:'▧',lab:'⚗',statue:'♜',museum:'♛'}[key]}</span><span class="tag">${level?(key==='lab'?'完成':'Lv. '+level):locked?'未解放':'未建設'}</span></div><h2>${f.name}</h2><p>${esc(L.facilityFlavor[key])}</p><div class="card-bottom"><span>${level>=f.max?'完成':locked?f.lock:money(R.facilityCost(state,key))+' G'}</span>${button('build-dialog',facilityAction(key),`data-key="${key}" ${reason?'disabled':''}`,'button outline small')}</div></article>`;}).join('')}</div>`;
  }
  function annualProgram() {
    const year=R.date(state.week).year,start=(year-1)*R.YEAR+1;
    const all=Array.from({length:R.YEAR},(_,i)=>R.calendar(start+i)).flat().filter(e=>/^G/.test(e.level));
    const events=all.filter(e=>(!calendarGrade||e.level===calendarGrade)&&(!calendarRoute||
      (calendarRoute==='sprint'?e.surface==='turf'&&e.distance<=1400:
       calendarRoute==='dirt-sprint'?e.surface==='dirt'&&e.distance<=1600:e.surface===calendarRoute)));
    const options=(choices,value)=>choices.map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('');
    return `<section class="paper racing-program"><h2>${year}年 年間重賞番組表</h2><p class="muted">年間${all.length}競走（GⅠ ${all.filter(e=>e.level==='GI').length} / GⅡ ${all.filter(e=>e.level==='GII').length} / GⅢ ${all.filter(e=>e.level==='GIII').length}）。</p>${libraryLink('racing','出走条件について →')}<div class="program-filters"><label>格<select id="calendar-grade">${options([['','すべての格'],['GI','GⅠ'],['GII','GⅡ'],['GIII','GⅢ']],calendarGrade)}</select></label><label>路線<select id="calendar-route">${options([['','すべての路線'],['turf','芝'],['sprint','芝短距離（1400m以下）'],['dirt','ダート'],['dirt-sprint','ダート短距離・マイル（1600m以下）']],calendarRoute)}</select></label></div><p class="muted" role="status">${events.length}競走を表示</p>${Array.from({length:12},(_,i)=>{
      const month=i+1,rows=events.filter(e=>R.date(e.week).month===month);
      if(!rows.length)return '';
      return `<details class="program-month" ${month===R.date(state.week).month?'open':''}><summary>${month}月 ・ ${rows.length}競走</summary><div class="program-scroll"><table><thead><tr><th>週・格</th><th>競走</th><th>条件</th><th>1着賞金</th></tr></thead><tbody>${rows.map(e=>`<tr data-program-event="${e.id}"><td>第${R.date(e.week).monthWeek}週<br><b>${gradeName(e.level)}</b></td><td><b>${esc(raceLabel(e))}</b><small>${esc(e.track.name)}${e.circuit==='regional'?' / 地方交流':''}</small></td><td>${e.surface==='turf'?'芝':'ダート'} ${e.distance}m<small>${e.minAge===e.maxAge?e.minAge+'歳':e.minAge+'歳以上'}${e.sex?'牝羽限定':''}</small></td><td>${money(e.purse[0])} G</td></tr>`).join('')}</tbody></table></div></details>`;
    }).join('')||'<p class="muted">この条件に合う重賞はありません。</p>'}</section>`;
  }
  function firstWinRow(key,label) {
    const record=state.firstWins?.[key],week=record?.week??state.milestones[key];
    return `<div class="list-row" data-first-win="${esc(key)}"><span><b>${esc(label)}</b>${record&&!key.startsWith('g1:')?`<small>${esc(record.raceName)}</small>`:''}</span>${week?`<span>${record?`<b>${esc(record.birdName)}</b>`:''}<small>${R.when(week)}</small></span>`:'<span class="muted">未勝利</span>'}</div>`;
  }
  function notebookAchievements() {
    const labels={purchase:'最初の仲間',breeding:'はじめての配合',birth:'はじめての誕生',win:'レース初勝利',g1:'G1初勝利',derby:'ダービー初勝利'};
    const achievements=Object.entries(state.milestones).filter(([key])=>!key.includes(':'))
      .map(([key,week])=>['win','g1','derby'].includes(key)?firstWinRow(key,labels[key]):`<div class="list-row"><b>${esc(labels[key]||key)}</b><span>${R.when(week)}</span></div>`).join('');
    const g1Names=[...new Set(Array.from({length:R.YEAR},(_,i)=>R.calendar(i+1)).flat().filter(e=>e.level==='GI').map(e=>e.name))];
    return `${achievements||'<p class="muted">まだ実績はありません。</p>'}<h2 class="section-gap">初めての重賞制覇</h2>${[['graded','重賞初制覇'],['g3','G3初制覇'],['g2','G2初制覇']].map(([key,label])=>firstWinRow(key,label)).join('')}<h2 class="section-gap">各G1の初勝利</h2>${g1Names.map(name=>firstWinRow(`g1:${name}`,`${name} 初勝利`)).join('')}`;
  }
  function notebook() {
    let content='';
    if(notebookTab==='calendar') {
      const plans=R.own(state).filter(b=>b.role==='racing').map(b=>({b,e:R.nextRace(state,b)})),d=R.date(state.week),sale=R.saleOpen(state);
      const debut=R.own(state).filter(b=>b.role==='young'&&R.age(state,b)===1);
      content=`<section class="paper"><h2>これからの予定</h2>${plans.map(({b,e})=>`<div class="list-row"><span><b>${esc(b.name)}</b><small>${POLICIES[b.policy]||''}</small></span><span>${e?`${R.when(e.week)}<small>${esc(raceLabel(e))}</small><small>${esc(e.track?.name||'')} / ${groundText(e)}</small>`:'休養・調教'}</span></div>`).join('')}<div class="list-row"><span><b>繁殖牝羽セール</b><small>${sale?'開催中（3月第4週まで）':`${d.month<2?d.year:d.year+1}年2月から`}</small></span>${sale?button('nav','セールへ →','data-page="market"','button quiet'):''}</div>${debut.length?`<div class="list-row"><span><b>競走羽登録</b><small>${d.year+1}年1月第1週</small></span><span class="muted">${debut.map(b=>esc(b.name)).join('・')}</span></div>`:''}<div class="list-row"><span><b>年度表彰・始祖入りの審査</b><small>${d.year}年12月第4週</small></span></div></section>`;
      content+=annualProgram();
    } else if(notebookTab==='accounts') content=`<div class="finance-strip paper"><span>現在のギル<strong>${money(state.money)} G</strong></span><span>未払金<strong>${money(state.debt)} G</strong></span><span>ファン<strong>${money(state.birds.filter(b=>b.owner==='player').reduce((n,b)=>n+b.fans,0))} 人</strong></span></div><section class="paper"><h2>収支の記録</h2>${state.ledger.slice(-60).reverse().map(l=>`<div class="list-row"><span>${esc(l.note)}<small>${R.when(l.week)}</small></span><b class="${l.amount>0?'positive':''}">${l.amount>0?'+':''}${money(l.amount)} G</b></div>`).join('')||'<p class="muted">記録はまだありません。</p>'}</section>`;
    else if(notebookTab==='records') content=`<section class="paper"><h2>実績</h2>${notebookAchievements()}<h2 class="section-gap">年度表彰</h2>${libraryLink('awards','年度表彰について →')}${state.awards.map(a=>`<div class="list-row"><span>${a.year}年 ${esc(a.title)}</span><b>${esc(a.farm||state.naming.ranchName)} / ${esc(a.name)}<small>${a.points??''}点</small></b></div>`).join('')||'<p class="muted">まだ表彰はありません。</p>'}${state.founderOffers.length?'<h2 class="section-gap">始祖入りのオファー</h2>':''}${state.founderOffers.map(id=>founderBanner(R.bird(state,id))).join('')}</section>`;
    else content=`<section class="paper"><h2>過去の報告</h2>${state.journal.slice().reverse().map(r=>`<details class="journal-entry"><summary><span>${esc(r.title)}</span><small>${R.when(r.week)}</small></summary><p>${esc(r.text)}</p>${r.notes?.map(n=>`<p>${esc(n)}</p>`).join('')||''}${r.results?.length?reportRaces(r):''}${RanchObservation.birthGenetics(state,r)}</details>`).join('')||'<p class="muted">まだ報告はありません。</p>'}</section>`;
    return `${heading('牧場手帳')}<div class="tabs">${[['calendar','予定'],['accounts','収支'],['records','記録'],['letters','報告']].map(([k,n])=>button('notebook-tab',n,`data-tab="${k}"`,`tab ${notebookTab===k?'active':''}`)).join('')}</div>${content}`;
  }
  function settings() {return `${heading('設定')}<section class="paper settings"><div class="settings-row"><div><h2>自動保存</h2></div><span class="tag">${saveOK?'保存できています':'保存できていません'}</span></div></section>${saveSlots()}<section class="paper settings"><div class="settings-row"><div><h2>ファンのボーナス</h2><p>記録を達成したときのファンの増え方</p></div><select id="difficulty" aria-label="ファンのボーナス">${[['easy','多め'],['normal','標準'],['hard','控えめ']].map(([k,n])=>`<option value="${k}" ${state.difficulty===k?'selected':''}>${n}</option>`).join('')}</select></div><div class="settings-row"><div><h2>データの書き出し</h2></div>${button('export','書き出す','','button outline')}</div><div class="settings-row"><div><h2>データの読み込み</h2></div>${button('import','読み込む','','button outline')}<input id="import-file" type="file" accept=".json,application/json" hidden></div><div class="settings-row reset-row"><div><h2>はじめから</h2></div>${button('reset-dialog','セーブをリセット','','button danger-outline')}</div></section>`;}
  function geneticResearch(b,options) {return RanchObservation.genetics(state,b,options);}
  function research(b) {return (['mare','stud'].includes(b.role)?'':RanchObservation.status(state,b))+geneticResearch(b);}
  function breedingManagement(b) {
    if(b.owner!=='player')return '';
    if(b.role==='mare') {
      const reason=R.sellMareReason(state,b);
      return `<section class="paper"><h3>繁殖牝羽の売却</h3>${button('sell-mare-dialog',`売却する / ${money(R.marePrice(b))} G`,`data-id="${b.id}" ${reason?'disabled':''}`,'button outline danger')}${reason?`<p class="muted">${esc(reason)}</p>`:''}</section>`;
    }
    if(!R.releaseStudReason(state,b))return `<section class="paper"><h3>自家製種牡羽の管理</h3>${button('release-stud-dialog','野生に返す',`data-id="${b.id}"`,'button outline danger')}</section>`;
    return '';
  }
  function detail(b) {
    const speaker=b.registered?'moogle':'shiroma';
    return `<div class="detail-cover ${b.color}">${birdArt(b)}<div><span class="eyebrow">${role(b)} ・ ${b.sex==='F'?'牝':'牡'} ・ ${R.age(state,b)===null?kind(b):R.age(state,b)+'歳'}</span><h2 id="dialog-title">${esc(b.name)}</h2>${b.races?`<p>${b.races}戦 ${b.wins}勝${b.g1?' / GⅠ '+b.g1+'勝':''}</p>`:''}<p>${colorText(b)}</p></div></div>${lineageView(b,{founder:true})}${note(R.observe(state,b,speaker),speaker)}${hints(b)}${b.role==='young'?`<label class="form-field">放牧地<select id="pasture-choice" data-id="${b.id}"><option value="meadow" ${b.pasture==='meadow'?'selected':''}>穏やかな平原</option><option value="forest" ${b.pasture==='forest'?'selected':''} ${!state.facilities.forest?'disabled':''}>過酷な森${!state.facilities.forest?'（未整備）':''}</option></select></label>`:''}${b.role==='racing'?`<div class="wellbeing"><span>今の様子 <b>${b.health?'療養中':b.condition<75||b.strain>25?'休養中':'元気'}</b></span><span>ファン <b>${money(b.fans)}人</b></span></div><label class="form-field">方針<select id="policy-choice" data-id="${b.id}">${policyOptions(b.policy)}</select></label>`:''}${libraryLink('ratings','能力・遺伝の読み方 →')}${research(b)}${birdSchedule(b)}${pedigreeView(b,{lineage:false})}${offspringCareer(b)}${breedingFamily(b)}${breedingManagement(b)}${b.records.length?`<details class="pedigree"><summary>これまでのレース</summary>${b.records.slice().reverse().map(r=>`<div class="list-row race-record-row"><span>${esc(raceLabel(r))}<small>${R.when(r.week)}</small></span><b>${r.rank}着 / ${money(r.reward)} G</b>${button('result','結果・観戦',`data-id="${b.id}" data-week="${r.week}"`,'button outline')}</div>`).join('')}</details>`:''}${b.role==='racing'?button('retire-dialog','引退して繁殖入り',`data-id="${b.id}"`,'button quiet'):''}`;
  }
  function newGameFields() {
    const n=modal.settings;
    const stem=n.affix.length>6?'ユリ':'ローズ',example=n.position==='suffix'?`${stem}${n.affix}`:`${n.affix}${stem}`;
    return `<div class="new-game-fields"><label class="form-field" for="new-ranch-name">牧場名<input id="new-ranch-name" value="${esc(n.ranchName)}" maxlength="24" required></label><label class="form-field" for="new-affix">冠名<input id="new-affix" value="${esc(n.affix)}" minlength="1" maxlength="7" pattern="[ァ-ヺー]{1,7}" required><small class="muted">カタカナ1〜7文字（名前全体で9文字まで）</small></label><label class="form-field" for="new-affix-position">冠名をつける位置<select id="new-affix-position"><option value="prefix" ${n.position==='prefix'?'selected':''}>前につける（冠名＋名前）</option><option value="suffix" ${n.position==='suffix'?'selected':''}>後ろにつける（名前＋冠名）</option></select></label><p class="name-preview">名前の例：<b id="new-name-preview">${esc(example)}</b></p></div>`;
  }
  function updateNewGameField(el) {
    if(!['new-game','reset'].includes(modal?.type))return false;
    const key={'new-ranch-name':'ranchName','new-affix':'affix','new-affix-position':'position'}[el.id];
    if(!key)return false;
    modal.settings[key]=el.value;
    const n=modal.settings,preview=$('#new-name-preview');
    const stem=n.affix.length>6?'ユリ':'ローズ';
    if(preview)preview.textContent=n.position==='suffix'?`${stem}${n.affix}`:`${n.affix}${stem}`;
    return true;
  }
  function modalMarkup() {
    let body='',wide=false,celebration='';
    if(modal.type==='reports'){wide=true;body=reportModal();}
    if(modal.type==='slot-save')body=`<h2 id="dialog-title">スロット${modal.slot}に上書きしますか？</h2><p>${modal.entry.invalid?'読み込めない保存データ':esc(saveSummary(modal.entry.state))}を、現在の牧場の記録に置き換えます。<br>このスロットの以前の記録は取り消せません。</p><div class="reset-preview">${esc(saveSummary(state))}</div><div class="modal-actions">${button('close','キャンセル','data-autofocus','button outline')}${button('slot-save-confirm','上書きセーブ')}</div>`;
    if(modal.type==='slot-load')body=`<h2 id="dialog-title">スロット${modal.slot}をロードしますか？</h2><p>現在の牧場と自動保存を、このスロットの記録に置き換えます。残したい進行は先に別のスロットへセーブしてください。</p><div class="reset-preview">${esc(saveSummary(modal.entry.state))}</div><p class="muted">Enterでロード / Escでキャンセル</p><div class="modal-actions">${button('close','キャンセル','','button outline')}${button('slot-load-confirm','ロードして再開','data-autofocus')}</div>`;
    if(modal.type==='new-game')body=`<h2 id="dialog-title">牧場をはじめる</h2><p>牧場名と、競走羽の名前につける冠名を決めてください。</p>${newGameFields()}<div class="modal-actions">${button('start-confirm','この牧場ではじめる')}</div>`;
    if(modal.type==='reset')body=`<span class="dialog-symbol">↺</span><h2 id="dialog-title">牧場を最初から始めますか？</h2><p>現在のチョコボ・ギル・施設・記録をリセットします。<br>この操作は取り消せません。</p><div class="reset-preview"><span>1年 3月 第1週</span><span>所有 1羽（2歳牝）</span><span>20,000 G</span></div><p class="muted">残したい進行は、先に手動セーブしてください（スロットは消えません）。</p>${newGameFields()}<div class="modal-actions">${button('close','キャンセル','data-autofocus','button outline')}${button('reset-confirm','リセットして始める','','button danger')}</div>`;
    if(modal.type==='buy') {const b=R.bird(state,modal.id);body=`<h2 id="dialog-title">${esc(b.name)}を迎えますか？</h2><div class="purchase-bird">${birdArt(b)}</div><div class="price-check"><span>購入料金</span><b>${money(b.price)} G</b><span>購入後のギル</span><b>${money(state.money-b.price)} G</b></div><div class="modal-actions">${button('close','戻る','data-autofocus','button outline')}${button('buy-confirm','この子を迎える',`data-id="${b.id}"`)}</div>`;}
    if(modal.type==='breed') {const d=R.bird(state,damId),s=R.bird(state,sireId);body=`<h2 id="dialog-title">この組み合わせで配合しますか？</h2><p class="pair-names">${esc(d.name)} × ${esc(s.name)}</p><div class="price-check"><span>配合料金</span><b>${money(R.breedFee(s))} G</b><span>産み分けの実</span><b>${esc(R.BREEDING_FRUITS[breedingFruit].name)}${breedingFruit!=='none'?` ・ ${money(R.BREEDING_FRUITS[breedingFruit].cost)} G`:''}</b><span>子の性別</span><b>${breedingFruit==='none'?'ランダム':R.BREEDING_FRUITS[breedingFruit].sex==='M'?'オス（100%）':'メス（100%）'}</b>${breedingFruit!=='none'?`<span>合計</span><b>${money(R.breedingCost(s,breedingFruit))} G</b>`:''}<span>出産予定</span><b>${R.when(state.week+R.GESTATION)}</b></div><p class="muted">子の羽房を1枠予約します。</p><div class="modal-actions">${button('close','戻る','data-autofocus','button outline')}${button('breed-confirm','配合する')}</div>`;}
    if(modal.type==='build'){const key=modal.key,f=R.FACILITIES[key];body=`<h2 id="dialog-title">${f.name}を${facilityAction(key)}しますか？</h2><p>${esc(L.facilityFlavor[key])}</p>${libraryLink('facilities','施設の効果について →')}<div class="price-check"><span>費用</span><b>${money(R.facilityCost(state,key))} G</b><span>建設後の段階</span><b>Lv. ${state.facilities[key]+1}</b></div><div class="modal-actions">${button('close','戻る','data-autofocus','button outline')}${button('build-confirm',facilityAction(key)+'する',`data-key="${key}"`)}</div>`;}
    if(modal.type==='detail'){const b=R.bird(state,modal.id);if(!b)return '';wide=true;body=detail(b);}
    if(modal.type==='retire'){const b=R.bird(state,modal.id);body=`<h2 id="dialog-title">${esc(b.name)}を繁殖へ？</h2><p>競走生活を終え、${b.sex==='M'?'種牡羽':'繁殖牝羽'}になります。競走羽には戻れません。</p><div class="modal-actions">${button('close','戻る','data-autofocus','button outline')}${button('retire-confirm','繁殖入りする',`data-id="${b.id}"`)}</div>`;}
    if(modal.type==='sell-mare'){const b=R.bird(state,modal.id),price=R.marePrice(b);body=`<h2 id="dialog-title">${esc(b.name)}を売却しますか？</h2><p>売却は取り消せません。血統と戦績は記録に残ります。</p><div class="price-check"><span>売却額</span><b>${money(price)} G</b><span>売却後のギル</span><b>${money(state.money+price)} G</b></div><div class="modal-actions">${button('close','キャンセル','data-autofocus','button outline')}${button('sell-mare-confirm','売却する',`data-id="${b.id}"`,'button danger')}</div>`;}
    if(modal.type==='release-stud'){const b=R.bird(state,modal.id);body=`<h2 id="dialog-title">${esc(b.name)}を野生に返しますか？</h2><p>野生に返した羽は牧場に戻せず、配合相手にも選べなくなります。血統と戦績は記録に残ります。</p><div class="modal-actions">${button('close','キャンセル','data-autofocus','button outline')}${button('release-stud-confirm','野生に返す',`data-id="${b.id}"`,'button danger')}</div>`;}
    if(modal.type==='result'){
      const b=R.bird(state,modal.id),r=b.records.find(r=>r.week===modal.week),x=r.interactions;
      celebration=`celebration-${victoryTier(r)}`;
      const notes=x?[x.blockedSeconds>1?'前が詰まって苦しかったクポ…。':'',x.duelSeconds>1?'最後まで競り合ったクポ！':'',x.savingSeconds>1?'先頭で余力を残して走れたクポ。':'',x.crowdedSeconds>1?'羽混みでもまれたクポ。':'',x.laneChanges>1?'うまく進路を見つけたクポ。':''].filter(Boolean).join(' '):'';
      body=`<h2 id="dialog-title">${esc(raceLabel(r))}</h2><p>${R.when(r.week)} / ${r.distance}m / ${groundText(r)}</p>${victoryBanner([{...r,birdName:b.name}])}<div class="result-summary"><strong>${r.rank}<small>着</small></strong><span>${esc(b.name)}<small>獲得 ${money(r.reward)} G</small>${r.prize!==undefined?`<small>本賞金 ${money(r.prize)} / 手当 ${money(r.allowance)} / 経費 ${money(r.fee)} G</small>`:''}</span></div>${notes?note(notes,'moogle'):''}<div class="result-actions">${replayButton(r,b.id)||'<p class="race-old-note">このレースは観戦できません。</p>'}</div>${finishOrder(r,b.id)}`;
    }
    if(modal.type==='replay'){
      const b=R.bird(state,modal.id),r=b?.records.find(x=>x.week===modal.week);
      if(!r?.replay)return '';
      body=viewerMarkup(r,b.id);
    }
    if(modal.type==='import'){body=`<h2 id="dialog-title">この牧場のデータを読み込みますか？</h2><p>現在の牧場を、${R.when(modal.state.week)}・${money(modal.state.money)} Gの記録に置き換えます。</p><div class="modal-actions">${button('close','キャンセル','data-autofocus','button outline')}${button('import-confirm','読み込んで再開')}</div>`;}
    if(modal.type==='reports')celebration=`celebration-${reportTier(state.reports)}`;
    return `<div class="modal-backdrop ${celebration}"><section class="modal ${wide?'wide':''} ${modal.type==='replay'?'race-modal':modal.type==='reports'?'report-modal':''} ${celebration}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">${modal.type==='new-game'?'':'<button class="modal-close" data-action="close" aria-label="閉じる">×</button>'}${modal.error?`<p class="notice" role="alert">${esc(modal.error)}</p>`:''}${body}</section></div>`;
  }
  function render() {
    const pickerOpen=$('#sire-picker')?.open;
    raceViewer?.dispose();raceViewer=null;const generation=++viewerGeneration;
    const unread=state.reports.length;
    $('#app').innerHTML=`<div class="app-shell" ${modal?'inert':''}><aside class="sidebar"><button class="brand" data-action="nav" data-page="home"><span class="brand-feather">❧</span><span>${esc(state.naming.ranchName)}<small>WING & WIND</small></span></button><nav aria-label="メインメニュー">${['home','birds','breed','facilities','notebook','library'].map(id=>`<button data-action="nav" data-page="${id}" class="nav-item ${page===id?'active':''}" ${page===id?'aria-current="page"':''}><span>${ICONS[id]}</span>${LABELS[id]}${id==='home'&&unread?'<i class="unread-dot"></i>':''}</button>`).join('')}</nav><button class="nav-item settings-link ${page==='settings'?'active':''}" data-action="nav" data-page="settings"><span>⚙</span>設定</button><div class="save-status ${saveOK?'':'failed'}"><i></i>${saveOK?'自動保存しています':'保存できていません'}</div></aside><main><header class="topbar"><div class="date"><span class="season-mark">${currentSeason().label}</span><span>${R.when(state.week)}</span></div><div class="wallet"><span>所持ギル</span><strong>${money(state.money)}</strong><small>G</small></div></header><div class="content">${notice?`<div class="notice" role="status">${esc(notice)} ${button('dismiss','閉じる','','button quiet small')}</div>`:''}${unread?`<button class="unread-banner" data-action="reports">シロマから${unread}件の報告が届いています <span>読む →</span></button>`:''}${({home,market,birds:birdsPage,breed:breedPage,facilities:facilitiesPage,notebook,library,settings}[page]||home)()}</div></main></div>${modal?modalMarkup():''}`;
    document.body.classList.toggle('has-modal',!!modal);
    RanchPortraits.hydrate($('#app'));
    if(pickerOpen&&$('#sire-picker'))$('#sire-picker').open=true;
    if(modal?.type==='replay'){
      const b=R.bird(state,modal.id),r=b?.records.find(x=>x.week===modal.week),root=$('.race-viewer');
      const available=typeof window.CanvasRenderingContext2D!=='undefined';
      if(r?.replay&&root&&available)import('/js/race-viewer-2d.js').then(module=>{
        if(generation===viewerGeneration)raceViewer=module.mount(root,{...r,birdId:b.id},tracks[r.trackId]||{},modal.playback||{});
      }).catch(error=>{if(generation===viewerGeneration){console.error(error);const status=$('.race-loading');if(status)status.textContent='観戦を読み込めませんでした。結果は下で確認できます。';}});
      else{const status=$('.race-loading');if(status)status.textContent='このブラウザではレース観戦を表示できません。Canvas対応のブラウザで開き直してください。結果は下で確認できます。';}
    }
  }
  function openModal(value) {if(modal&&['reports','detail','result'].includes(modal.type)&&['detail','result','replay'].includes(value.type))value.parent=modal;returnFocus=document.activeElement;modal=value;render();requestAnimationFrame(()=>($('[data-autofocus]')||$('.modal-close')||$('.modal'))?.focus());}
  async function closeModal() {if(modal?.type==='new-game')return;const action=returnFocus?.dataset?.action,id=returnFocus?.dataset?.id,slot=returnFocus?.dataset?.slot;if(modal?.type==='reports'){clearInformationalReports();await save();}modal=modal?.parent||null;render();const target=[...document.querySelectorAll('[data-action]')].find(el=>el.dataset.action===action&&el.dataset.id===id&&el.dataset.slot===slot);target?.focus();}
  function ack() {
    const options={names:{},policies:{}};
    document.querySelectorAll('[data-register-name]').forEach(el=>{options.names[el.dataset.registerName]=el.value;if(!el.value.trim())throw Error('競走羽の名前を入力してください。');});
    document.querySelectorAll('[data-register-policy]').forEach(el=>options.policies[el.dataset.registerPolicy]=el.value);
    if(document.querySelectorAll('[data-register-name]').length){const index=state.reports.findIndex(r=>r.type==='registration');if(index>0)state.reports.unshift(...state.reports.splice(index,1));}
    R.acknowledge(state,options);
    if(modal?.type==='reports'&&!state.reports.length)modal=null;
  }
  function clearInformationalReports() {
    state.reports=state.reports.filter(r=>r.type==='registration');
  }
  async function advance(count=1) {
    if(busy)return;
    clearInformationalReports();
    if(state.reports.length){await save();openModal({type:'reports'});return;}
    busy=true;
    const collected=[];
    try {
      for(let i=0;i<count;i++) {
        R.advance(state);
        if(i===count-1||state.reports.some(r=>r.type==='registration'))break;
        collected.push(...state.reports);state.reports=[];
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }catch(e){notice=e.message;}
    finally {
      state.reports=[...collected,...state.reports];busy=false;await save();
      if(state.reports.length)openModal({type:'reports'});else render();
    }
  }
  document.addEventListener('click',async event=>{
    if(loading||persisting)return;
    if(event.target.classList?.contains('modal-backdrop')&&!busy){await closeModal();return;}
    await handleAction(event.target.closest('[data-action]'));
  });
  async function handleAction(target) {
    if(loading||persisting||busy||!target||target.disabled)return;
    const {action,id,key}=target.dataset;
    let storageAction=false;
    try {
      if(modal?.type==='new-game'&&action!=='start-confirm')return;
      if(action==='open-sire-picker') {const picker=$('#sire-picker');if(picker){picker.open=true;picker.scrollIntoView?.({behavior:'smooth',block:'start'});}return;}
      if(action==='nav'){if(target.dataset.page==='settings')await refreshSlots();page=target.dataset.page;modal=null;render();window.scrollTo({top:0});return;}
      if(action==='library-open'||action==='library-article'){
        if(!L.entries.some(entry=>entry.id===target.dataset.article))return;
        if(action==='library-open')libraryQuery='';
        libraryArticle=target.dataset.article;page='library';modal=null;render();
        $('#library-article')?.focus({preventScroll:true});$('#library-article')?.scrollIntoView?.({block:'start'});return;
      }
      if(action==='library-search'){searchLibrary();return;}
      if(action==='library-clear'){libraryQuery='';render();$('#library-query')?.focus({preventScroll:true});return;}
      if(action==='close'){await closeModal();return;}
      if(action==='reports'){openModal({type:'reports'});return;}
      if(action==='slot-save'||action==='slot-load') {
        const slot=Number(target.dataset.slot);let entry;
        persisting++;storageAction=true;
        try{savedValues.set(slotKey(slot),await storage.read(slotKey(slot)));entry=readSlot(slot);}catch{throw Error('保存先を確認できません。ブラウザの保存設定を確認してください。');}
        if(action==='slot-save') {
          if(entry.empty)await writeSlot(slot,entry.raw);
          else openModal({type:'slot-save',slot,entry});
        }else {
          if(!entry.state)throw Error(entry.empty?'このスロットにはセーブデータがありません。':'このスロットのデータは読み込めません。');
          openModal({type:'slot-load',slot,entry});
        }
        return;
      }
      if(action==='slot-save-confirm'){persisting++;storageAction=true;if(modal?.type==='slot-save')await writeSlot(modal.slot,modal.entry.raw);return;}
      if(action==='slot-load-confirm'){persisting++;storageAction=true;if(modal?.type==='slot-load')await loadSlot(modal.slot,modal.entry.raw);return;}
      if(action==='dismiss')notice='';
      if(action==='search-sires'){sireQuery=$('#sire-query').value;render();return;}
      if(action==='add-sire-genetic-filter'){
        sireGeneticFilters.push({trait:'',rating:'☆'});render();$(`#sire-genetic-trait-${sireGeneticFilters.length-1}`)?.focus({preventScroll:true});return;
      }
      if(action==='remove-sire-genetic-filter'){
        const index=Number(target.dataset.index);
        if(!Number.isInteger(index)||index<0||index>=sireGeneticFilters.length)return;
        sireGeneticFilters.splice(index,1);
        if(!sireGeneticFilters.length)sireGeneticFilters.push({trait:'',rating:'☆'});
        render();$(`#sire-genetic-trait-${Math.min(index,sireGeneticFilters.length-1)}`)?.focus({preventScroll:true});return;
      }
      if(action==='clear-sire-genetic-filters'){sireGeneticFilters=[{trait:'',rating:'☆'}];render();$('#sire-genetic-trait-0')?.focus({preventScroll:true});return;}
      if(action==='advance'||action==='advance-month'){await advance(action==='advance'?1:4);return;}
      if(action==='ack')ack();
      if(action==='buy-dialog'){openModal({type:'buy',id});return;}
      if(action==='buy-confirm'){R.buy(state,id);page='home';modal=null;}
      if(action==='select-sire'){
        sireId=id;if($('#sire-picker'))$('#sire-picker').open=false;render();
        $('[data-action="open-sire-picker"]')?.focus({preventScroll:true});return;
      }
      if(action==='sire-tab'&&SIRE_TABS.some(([tab])=>tab===target.dataset.tab)){sireTab=target.dataset.tab;sireId=sireChoices[sireTab]||'';render();$(`#sire-tab-${sireTab}`)?.focus();return;}
      if(action==='breed-dialog'){const reason=R.breedingReason(state,R.bird(state,damId),R.bird(state,sireId),breedingFruit);if(reason)throw Error(reason);openModal({type:'breed'});return;}
      if(action==='breed-confirm'){R.breed(state,damId,sireId,breedingFruit);breedingFruit='none';page='home';modal=null;}
      if(action==='build-dialog'){openModal({type:'build',key});return;}
      if(action==='build-confirm'){R.build(state,key);modal=null;notice=`${R.FACILITIES[key].name}がLv. ${state.facilities[key]}になりました。`;}
      if(action==='detail'){openModal({type:'detail',id});return;}
      if(action==='filter')birdFilter=target.dataset.filter;
      if(action==='notebook-tab')notebookTab=target.dataset.tab;
      if(action==='retire-dialog'){openModal({type:'retire',id});return;}
      if(action==='retire-confirm'){R.retire(state,id);modal=null;page='birds';}
      if(action==='sell-mare-dialog'||action==='release-stud-dialog'){
        const b=R.bird(state,id),reason=action==='sell-mare-dialog'?R.sellMareReason(state,b):R.releaseStudReason(state,b);
        if(reason)throw Error(reason);
        openModal({type:action==='sell-mare-dialog'?'sell-mare':'release-stud',id,parent:modal});return;
      }
      if(action==='sell-mare-confirm'||action==='release-stud-confirm'){
        const type=action==='sell-mare-confirm'?'sell-mare':'release-stud';
        if(modal?.type!==type||modal.id!==id)return;
        const b=R.bird(state,id);
        if(type==='sell-mare') {const price=R.sellMare(state,id);if(damId===id)damId='';notice=`${b.name}を${money(price)} Gで売却しました。繁殖牝羽の羽房が1枠空きました。`;}
        else {R.releaseStud(state,id);if(sireId===id)sireId='';Object.keys(sireChoices).forEach(key=>{if(sireChoices[key]===id)delete sireChoices[key];});notice=`${b.name}を野生に返しました。種牡羽の羽房が1枠空きました。`;}
        modal=null;
      }
      if(action==='promote'){R.promote(state,id);state.reports=state.reports.filter(r=>r.type!=='founder'||r.birdId!==id);page='home';}
      if(action==='result'){openModal({type:'result',id,week:Number(target.dataset.week)});return;}
      if(action==='watch-race'){
        const r=R.bird(state,id)?.records.find(x=>x.week===Number(target.dataset.week));
        if(!r?.replay)throw Error('このレースは観戦できません。');
        openModal({type:'replay',id,week:r.week});return;
      }
      if(action==='reset-dialog'){openModal({type:'reset',settings:{...R.DEFAULT_NAMING}});return;}
      if(action==='start-confirm'&&modal?.type==='new-game'||action==='reset-confirm'&&modal?.type==='reset'){state=R.initial(modal.settings);saveBlocked=false;modal=null;page='home';damId='';sireId='';breedingFruit='none';sireTab='root';rootTrait='';sireQuery='';sireRoute='';sireSort='fee';sireGeneticFilters=[{trait:'',rating:'☆'}];Object.keys(sireChoices).forEach(key=>delete sireChoices[key]);notice=action==='reset-confirm'?'新しい牧場をはじめました。':'';birdFilter='all';notebookTab='calendar';}
      if(action==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`hanekaze-${state.week}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
      if(action==='import'){$('#import-file').click();return;}
      if(action==='import-confirm'&&modal?.type==='import'){const restored=R.upgradeState(modal.state);renewRandomStream(restored);state=restored;saveBlocked=false;modal=null;page='home';damId='';sireId='';breedingFruit='none';sireTab='root';rootTrait='';sireQuery='';sireRoute='';sireSort='fee';sireGeneticFilters=[{trait:'',rating:'☆'}];Object.keys(sireChoices).forEach(key=>delete sireChoices[key]);notice='バックアップから再開しました。';}
      await save();render();
      if(['buy-confirm','breed-confirm','retire-confirm','promote'].includes(action)&&state.reports.length)openModal({type:'reports'});
      if(['ack','buy-confirm','breed-confirm','reset-confirm','import-confirm','retire-confirm','promote'].includes(action))window.scrollTo({top:0});
    } catch(e){if(modal)modal.error=e.message;else notice=e.message;render();}
    finally{if(storageAction)persisting--;}
  }
  document.addEventListener('input',event=>{if(loading||persisting||busy)return;updateNewGameField(event.target);if(event.target.id==='sire-query')sireQuery=event.target.value;});
  document.addEventListener('change',async event=>{
    if(loading||persisting||busy)return;
    const el=event.target;
    if(el.id==='library-query')return;
    if(el.id==='calendar-grade'||el.id==='calendar-route'){
      if(el.id==='calendar-grade')calendarGrade=el.value;else calendarRoute=el.value;
      render();$(`#${el.id}`)?.focus({preventScroll:true});return;
    }
    if(updateNewGameField(el))return;
    if(el.dataset?.geneticField){
      const filter=sireGeneticFilters[Number(el.dataset.geneticIndex)],field=el.dataset.geneticField;
      if(!filter)return;
      if(field==='trait')filter.trait=Object.hasOwn(searchableGeneticTraits(),el.value)?el.value:'';
      else if(field==='rating'&&GENETIC_RATINGS.includes(el.value))filter.rating=el.value;
      else return;
      render();$(`#${el.id}`)?.focus({preventScroll:true});return;
    }
    persisting++;
    try {
      if(el.dataset?.scheduleId){
        const value=el.value,plan=value==='auto'||value==='rest'?{mode:value}:value.startsWith('training:')?{mode:'training',menu:value.slice(9)}:{mode:'race',eventId:value.slice(5)};
        R.setSchedule(state,el.dataset.scheduleId,Number(el.dataset.week),plan);await save();const scroll=$('.modal')?.scrollTop;render();if($('.modal'))$('.modal').scrollTop=scroll;$(`[data-schedule-id="${el.dataset.scheduleId}"][data-week="${el.dataset.week}"]`)?.focus({preventScroll:true});return;
      }
      if(el.id==='dam-choice')damId=el.value;
      if(el.id==='breeding-fruit'&&R.labLevel(state)>=1&&Object.hasOwn(R.BREEDING_FRUITS,el.value))breedingFruit=el.value;
      if(el.id==='sire-query')sireQuery=el.value;
      if(el.id==='sire-route')sireRoute=el.value;
      if(el.id==='sire-sort')sireSort=el.value;
      if(el.id==='root-trait')rootTrait=Object.hasOwn(traitLabels,el.value)?el.value:'';
      if(el.id==='pasture-choice')R.setPasture(state,el.dataset.id,el.value);
      if(el.id==='policy-choice')R.setPolicy(state,el.dataset.id,el.value);
      if(el.id==='difficulty'&&['easy','normal','hard'].includes(el.value))state.difficulty=el.value;
      if(el.id==='import-file') {
        const file=el.files[0];if(!file)return;
        if(file.size>20*1024*1024)throw Error('読み込めるファイルは20MBまでです。');
        const imported=R.deserializeState(await file.text());
        if(!R.validState(imported))throw Error('このデータは読み込めません。新しい進行のセーブデータを選んでください。');
        openModal({type:'import',state:imported});return;
      }
      if(el.matches?.('[data-register-name], [data-register-policy]'))return;
      await save();render();
      if(el.id==='root-trait')$('#root-trait')?.focus();
    }catch(e){if(modal)modal.error=e.message;else notice=e.message;render();}
    finally{persisting--;}
  });
  document.addEventListener('keydown',async event=>{
    if(loading||persisting||busy)return;
    const shortcut=!event.defaultPrevented&&!event.isComposing&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.shiftKey;
    const editing=event.target.matches?.('input, textarea, select')||event.target.isContentEditable;
    if(shortcut&&!editing&&!modal&&/^[1-5]$/.test(event.key)) {
      event.preventDefault();await handleAction({dataset:{action:'slot-load',slot:event.key}});return;
    }
    if(!editing&&modal?.type==='slot-load'&&event.key==='Enter') {
      if(!shortcut){event.preventDefault();return;}
      if(event.target.closest?.('[data-action]')?.dataset.action==='close')return;
      event.preventDefault();await handleAction({dataset:{action:'slot-load-confirm'}});return;
    }
    if(event.target.id==='sire-query'&&event.key==='Enter'&&!event.isComposing){event.preventDefault();sireQuery=event.target.value;render();$('#sire-query')?.focus();return;}
    if(event.target.id==='library-query'&&event.key==='Enter'&&!event.isComposing){event.preventDefault();searchLibrary();return;}
    const tab=event.target.closest?.('[data-action="sire-tab"]');
    if(!modal&&tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      const index=SIRE_TABS.findIndex(([key])=>key===sireTab);
      const next=event.key==='Home'?0:event.key==='End'?SIRE_TABS.length-1:(index+(event.key==='ArrowRight'?1:-1)+SIRE_TABS.length)%SIRE_TABS.length;
      sireTab=SIRE_TABS[next][0];sireId=sireChoices[sireTab]||'';render();$(`#sire-tab-${sireTab}`)?.focus();return;
    }
    if(!modal)return;
    if(event.key==='Escape'){event.preventDefault();await closeModal();return;}
    if(event.key==='Tab') {
      const focusable=[...document.querySelectorAll('.modal button:not(:disabled), .modal input, .modal select, .modal summary')];
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  function blockOtherTab() {
    notice='別のタブで牧場が更新されました。再読み込みして続けてください。';saveBlocked=true;saveOK=false;busy=true;
  }
  async function refreshSlots() {
    persisting++;
    try{
      const keys=saveKeys.slice(1),views=storage.readSummaries?await storage.readSummaries(keys):new Map();
      for(let slot=1;slot<=SAVE_SLOTS;slot++){
        const key=slotKey(slot),view=views.get(key);
        if(view===null||validSlotView(view)){slotViews.set(key,view);continue;}
        // Revalidate older summaries, including failures cached before save compatibility fixes.
        try{
          savedValues.set(key,await storage.read(key));
          const entry=readSlot(slot),summary=slotView(entry);
          if(summary!==null&&storage.writeSummary){
            try{await storage.writeSummary(key,entry.raw,summary);}
            catch(e){if(e.code==='changed')throw e;} // A disposable summary must not prevent recovery.
          }
          slotViews.set(key,summary);
        }catch{slotViews.set(key,undefined);}
      }
    }
    catch{for(const key of saveKeys.slice(1))slotViews.set(key,undefined);}
    finally{persisting--;}
  }
  async function storageChanged(event) {
    if(event.key===R.SAVE_KEY){blockOtherTab();render();}
    else if(saveKeys.slice(1).includes(event.key)){await refreshSlots();if(page==='settings')render();}
  }
  storage.subscribe(storageChanged);
  window.addEventListener('storage',storageChanged);
  window.addEventListener('pagehide',()=>{
    if(modal?.type==='replay')modal.playback={...modal.playback,...raceViewer?.snapshot()};
    viewerGeneration++;raceViewer?.dispose();raceViewer=null;
  });
  window.addEventListener('pageshow',event=>{if(event.persisted&&modal?.type==='replay')render();});
  await save();loading=false;render();
})();
