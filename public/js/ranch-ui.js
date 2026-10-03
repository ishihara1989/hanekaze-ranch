/* A quiet, report-first interface. Only deliberate purchase and breeding require decisions. */
(() => {
  'use strict';
  const R=Ranch,$=selector=>document.querySelector(selector);
  const tracks=globalThis.RanchWorld?.TRACKS||{};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Math.round(n).toLocaleString('ja-JP');
  const ICONS={home:'⌂',birds:'♧',breed:'⚭',facilities:'▱',notebook:'▤',settings:'⚙'};
  const LABELS={home:'今週の牧場',birds:'チョコボ',breed:'配合',facilities:'施設',notebook:'牧場手帳',market:'繁殖牝羽セール',settings:'設定'};
  const role=b=>({young:'幼羽',racing:'競走羽',mare:'繁殖牝羽',stud:'種牡羽',retired:'引退',archived:'記録'}[b.role]);
  const kind=b=>({root:'源流',home:'自家製',general:'一般',founder:'始祖'}[b.kind]);
  const SIRE_TABS=[['root','源流'],['public','他の牧場'],['founder','始祖'],['home','自家牧場']];
  const sireGroup=b=>b.kind==='root'?'root':b.kind==='founder'?'founder':b.owner==='player'?'home':'public';
  const traitLabels={...Object.fromEntries(R.Mapping.ABILITIES.map(a=>[a.key,a.label])),...R.MANAGEMENT,...R.PERSONALITY,...R.Genetics.APTITUDES,...R.Genetics.DEVELOPMENT};
  const abilityLabels=Object.fromEntries(R.Mapping.ABILITIES.map(a=>[a.key,a.label]));
  const statLabels={...abilityLabels,...R.MANAGEMENT,...R.PERSONALITY};
  const colorText=b=>`羽色：${R.Genetics.COLORS[b.color]} / 額羽：${R.Genetics.CRESTS[b.crest]}`;
  const groundText=e=>{
    const surface=e.surface==='turf'?'芝':'ダート';
    if(Number.isFinite(e.cushion))return `${surface}・${R.Ground.GOING[e.going]||'良'}・${R.Ground.label(e.cushion)}`;
    if(!e.trackId)return surface;
    const ground=R.Ground.conditions(e);return `${surface}・${R.Ground.GOING[ground.going]}・${ground.label}`;
  };
  const sireChoices={};
  let sireTab='root',rootTrait='',sireQuery='',sireRoute='',sireSort='fee';
  let state,page='home',modal=null,damId='',sireId='',busy=false,saveOK=true,saveBlocked=false,notice='',birdFilter='all',notebookTab='calendar',returnFocus=null;
  let raceViewer=null,viewerGeneration=0;
  try {
    const raw=localStorage.getItem(R.SAVE_KEY);
    state=raw?R.deserializeState(raw):R.initial();
    if(!R.validState(state))throw Error('invalid save');
    R.upgradeState(state);
  } catch {
    state=R.initial();saveBlocked=true;saveOK=false;
    notice='保存データを読み込めませんでした。元のデータを保護しています。設定からリセットすると新しく保存できます。';
  }
  function save() {
    if(saveBlocked)return;
    try{localStorage.setItem(R.SAVE_KEY,R.serializeState(state));saveOK=true;}
    catch{saveOK=false;notice='自動保存ができません。設定からデータを書き出してください。';}
  }
  const SAVE_SLOTS=5;
  function slotKey(slot) {
    if(!Number.isInteger(slot)||slot<1||slot>SAVE_SLOTS)throw Error('セーブスロットを選んでください。');
    return `${R.SAVE_KEY}-slot-${slot}`;
  }
  function readSlot(slot) {
    const raw=localStorage.getItem(slotKey(slot));
    if(raw===null)return {raw,empty:true};
    try {
      const entry=JSON.parse(raw);
      if(entry?.version!==1||typeof entry.data!=='string'||typeof entry.savedAt!=='string'||!Number.isFinite(Date.parse(entry.savedAt)))throw Error('invalid slot');
      const saved=R.deserializeState(entry.data);
      if(!R.validState(saved))throw Error('invalid state');
      return {raw,savedAt:entry.savedAt,state:saved};
    }catch{return {raw,invalid:true};}
  }
  function writeSlot(slot,expectedRaw) {
    const key=slotKey(slot);
    try {
      if(localStorage.getItem(key)!==expectedRaw)throw Error('changed');
    }catch(e){throw Error(e.message==='changed'?'このスロットは別のタブで更新されました。確認画面を閉じて選び直してください。':'保存先を確認できません。ブラウザの保存設定を確認してください。');}
    try {
      localStorage.setItem(key,JSON.stringify({version:1,savedAt:new Date().toISOString(),data:R.serializeState(state)}));
    }catch{throw Error('セーブできませんでした。保存容量やブラウザの保存設定を確認し、必要ならデータを書き出してください。');}
    modal=null;notice=`スロット${slot}にセーブしました。`;render();
  }
  function saveSummary(saved) {
    return `${R.when(saved.week)} ・ ${money(saved.money)} G ・ 所有 ${R.own(saved).length}羽`;
  }
  function saveSlots() {
    return `<section class="paper save-slots" aria-labelledby="save-slots-title"><span class="eyebrow">SAVE & LOAD</span><h2 id="save-slots-title">セーブ・ロード</h2><p class="save-slots-description">手動セーブは5つまで残せます。自動保存・週送り・牧場のリセットでは上書きされません。</p>${Array.from({length:SAVE_SLOTS},(_,i)=>{
      const slot=i+1;let entry;
      try{entry=readSlot(slot);}catch{entry={unavailable:true};}
      const description=entry.unavailable?'保存先にアクセスできません。':entry.empty?'空きスロット':entry.invalid?'データを読み込めません。上書きして保存し直せます。':saveSummary(entry.state);
      return `<article class="save-slot"><div class="save-slot-info"><h3>スロット${slot}</h3><p>${esc(description)}</p>${entry.savedAt?`<time datetime="${esc(entry.savedAt)}">保存日時：${esc(new Date(entry.savedAt).toLocaleString('ja-JP'))}</time>`:''}</div><div class="save-slot-actions">${button('slot-save',entry.empty?'セーブ':'上書きセーブ',`data-slot="${slot}" aria-label="スロット${slot}にセーブ" ${entry.unavailable?'disabled':''}`,'button outline')}${button('slot-load','ロード',`data-slot="${slot}" aria-label="スロット${slot}をロード" ${!entry.state?'disabled':''}`,'button quiet')}</div></article>`;
    }).join('')}</section>`;
  }
  function loadSlot(slot,expectedRaw) {
    let entry;
    try{entry=readSlot(slot);}catch{throw Error('保存先にアクセスできません。ブラウザの保存設定を確認してください。');}
    if(entry.raw!==expectedRaw)throw Error('このスロットは別のタブで更新されました。確認画面を閉じて選び直してください。');
    if(!entry.state)throw Error('このスロットのデータは読み込めません。');
    const restored=R.upgradeState(entry.state);
    if(!R.validState(restored))throw Error('このスロットのデータは読み込めません。');
    // Commit the new autosave before replacing the running ranch so a failed
    // storage write leaves both the current session and its save intact.
    try{localStorage.setItem(R.SAVE_KEY,R.serializeState(restored));}
    catch{throw Error('ロード後の自動保存ができないため、ロードを中止しました。保存容量やブラウザの保存設定を確認してください。');}
    state=restored;saveBlocked=false;saveOK=true;modal=null;page='home';
    damId='';sireId='';sireTab='root';rootTrait='';sireQuery='';sireRoute='';sireSort='fee';
    Object.keys(sireChoices).forEach(key=>delete sireChoices[key]);birdFilter='all';notebookTab='calendar';
    notice=`スロット${slot}からロードしました。`;render();window.scrollTo({top:0});
  }
  function button(action,text,extra='',className='button primary'){return `<button class="${className}" data-action="${action}" ${extra} ${busy&&['advance','advance-month'].includes(action)?'disabled':''}>${text}</button>`;}
  function heading(kicker,title,description=''){return `<div class="page-heading"><span class="eyebrow">${kicker}</span><h1>${title}</h1>${description?`<p>${description}</p>`:''}</div>`;}
  function portrait(expression='talk',speaker='shiroma') {return `<img class="portrait ${speaker}" src="assets/${speaker==='moogle'?'moogle/trainer.png':`shiroma/shiroma-${expression}.png`}" alt="${speaker==='moogle'?'トレーナーのモーグリ':'シロマ'}">`;}
  function avatar(speaker='shiroma'){return `<span class="avatar">${portrait('neutral',speaker)}</span>`;}
  function note(text,speaker='shiroma'){return `<div class="character-note">${avatar(speaker)}<div><span class="speaker">${speaker==='moogle'?'モーグリ / トレーナー':'シロマ / 牧場のパートナー'}</span><p>${esc(text)}</p></div></div>`;}
  function birdArt(b) {return RanchPortraits.markup(b,R.age(state,b));}
  function landscape(){return `<svg class="landscape" viewBox="0 0 1200 570" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#dce8db"/><stop offset="1" stop-color="#f4edd4"/></linearGradient><linearGradient id="field" x2="0" y2="1"><stop stop-color="#adb88a"/><stop offset="1" stop-color="#7b936b"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1200v570H0z"/><circle cx="925" cy="100" r="43" fill="#fff5d2" opacity=".8"/><path d="M0 280Q140 160 330 251T720 231T1200 184V570H0" fill="#c9d5bb"/><path d="M0 335Q183 254 348 294T698 273T1200 295V570H0" fill="#b8c69e"/><path d="M0 385Q220 290 434 346T780 310T1200 352V570H0" fill="url(#field)"/><path d="M594 330q-42 96 90 240h152Q587 394 623 332" fill="#d9d5b7" opacity=".8"/><g fill="#698560"><ellipse cx="183" cy="310" rx="50" ry="66"/><ellipse cx="127" cy="323" rx="40" ry="57"/><ellipse cx="1070" cy="299" rx="62" ry="84"/></g><g fill="#8d7560"><path d="M178 322h7v73h-7zM124 341h7v65h-7zM1065 327h9v72h-9z"/><path d="M424 300h114v73H424" fill="#e3dbc0"/><path d="m410 304 70-57 73 57" fill="#92796a"/><path d="M468 331h26v42h-26" fill="#7b7c60"/><path d="M438 324h16v19h-16m53-19h17v19h-17" fill="#abae83"/></g><g stroke="#e5e3c9" stroke-width="5" fill="none" opacity=".85"><path d="M40 410v64m75-79v62m75-80v65m75-76v60m75-70v61m-300-28 300-42m-300 65 300-42M838 378v63m78-64v69m79-63v72m76-66v71m75-63v72m-308-75 308 24m-308 3 308 26"/></g><g fill="#e8e7bf" opacity=".8"><circle cx="390" cy="439" r="2"/><circle cx="422" cy="470" r="3"/><circle cx="315" cy="484" r="2"/><circle cx="230" cy="512" r="3"/><circle cx="976" cy="511" r="3"/><circle cx="935" cy="484" r="2"/></g></svg>`;}
  function journey() {
    const index={buy:0,breed:1,grow:2,running:3}[state.stage];
    const steps=['最初の一羽','はじめての配合','誕生を待つ','育てて、走る'];
    return `<ol class="journey" aria-label="牧場のはじめ方">${steps.map((text,i)=>`<li class="${i===index?'current':i<index?'done':''}"><span>${i<index?'✓':String(i+1).padStart(2,'0')}</span>${text}</li>`).join('')}</ol>`;
  }
  function home() {
    const stage=state.stage,first=stage==='buy',pair=stage==='breed',pregnancy=R.own(state).find(b=>b.pregnancy),young=R.own(state).find(b=>b.role==='young');
    const title=first?'ここから、\n私たちの牧場。':pair?'次の世代へ、\n小さなはじまり。':pregnancy?'新しい命に、\n会える日を待って。':young?'ゆっくり育つ、\n大きな夢。':'今週も、\nいっしょに育てよう。';
    const text=first?'ようこそ、羽風牧場へ。瞬発力が持ち味の2歳牝羽ハネカゼノヒカリは、モーグリに預けてあります。調教・休養・出走はおまかせです。まずはセールで、お母さんになる一羽を迎えましょう。':pair?'いい子を迎えられましたね。次は、お父さんを選びましょう。血統の細かなことは、少しずつわかれば大丈夫です。':pregnancy?`${pregnancy.name}は穏やかに過ごしています。${R.when(pregnancy.pregnancy.due)}には、新しい家族に会えそうですよ。`:
      young?'子どもたちのお世話は私に任せてください。2歳になる年の1月に、名前を登録してモーグリに預けましょう。育つ間も、先輩の競走羽がモーグリとレースへ向かいます。':'モーグリが調教と出走予定を考えてくれています。気になることがあれば手帳を開いて、なければ次の週へ進みましょう。';
    const action=first?button('nav','繁殖牝羽セールへ <span>→</span>','data-page="market"'):pair?button('nav','はじめての配合へ <span>→</span>','data-page="breed"'):button('advance','次の週へ <span>→</span>');
    return `${heading('OUR LITTLE RANCH',first?'牧場の、はじめの日。':'おかえりなさい。',R.when(state.week)+' ・ '+season())}<section class="home-scene">${landscape()}<div class="scene-copy"><span class="eyebrow">${first?'A NEW BEGINNING':'WING & WIND'}</span><h2>${title.replace('\n','<br>')}</h2><p>ひとつの出会いから、<br>いつか、ダービーの夢へ。</p></div>${portrait(first?'happy':'neutral')}<div class="dialogue"><div class="dialogue-top"><span class="speaker">シロマ</span><span>あなたと牧場を育てるパートナー</span></div><p>${esc(text)}</p><div class="dialogue-actions">${action}${!first&&!pair?button('advance-month','4週まとめて進める','','button quiet'):''}</div></div></section>${!state.milestones.win?journey():''}<div class="home-quick-links">${button('nav','繁殖牝羽セールへ <span>→</span>','data-page="market"','button outline')}<span>${R.saleOpen(state)?'開催中 ・ 毎年2月〜3月':'次の開催は2月〜3月'}</span></div><div class="home-bottom"><div><span class="eyebrow">THIS WEEK</span><h3>${first?'まずは、ひとつだけ。':pair?'相手を選んだら、あとは見守る。':pregnancy?`出産まで、あと${pregnancy.pregnancy.due-state.week}週。`:young?'今は、のびのび育つ時間。':'調教も出走も、おまかせで。'}</h3><p>${first?'2月〜3月のセールで、繁殖牝羽を迎えます。':pair?'配合は3月第1週〜4月第4週。自家製種牡羽の配合料金は無料です。':'週を進めると、シロマが出来事をお知らせします。'}</p></div><button class="notebook-link" data-action="nav" data-page="notebook"><span>▤</span><div>牧場手帳をひらく<small>予定・収支・これまでの記録</small></div><b>↗</b></button></div>`;
  }
  function season(){const m=R.date(state.week).month;return m>=3&&m<=5?'春のやわらかな風':m>=6&&m<=8?'夏のまぶしい草原':m>=9&&m<=11?'秋の澄んだ空気':'冬の静かな牧場';}
  function reportModal() {
    const reports=state.reports,weekly=reports.filter(r=>r.type==='weekly'),letters=reports.filter(r=>r.type!=='weekly');
    const registrationPending=reports.some(r=>r.type==='registration');
    const title=weekly.length>1?`${weekly.length}週分の牧場報告`:'シロマからの報告';
    return `<header class="report-modal-heading"><span class="eyebrow">RANCH LETTERS</span><h2 id="dialog-title">${title}</h2><p>${weekly.length?`${R.when(weekly[0].week)} 〜 ${R.when(weekly.at(-1).week)}`:R.when(state.week)}</p></header>${letters.map(r=>reportPage(r)).join('')}${weekly.length>1?`<section class="weekly-digest"><h3>${weekly.length}週のダイジェスト</h3>${weekly.map(r=>`<article class="digest-entry"><header><b>${esc(r.title)}</b><span>収支 ${r.change>=0?'+':''}${money(r.change)} G</span></header><p>${esc(r.text)}</p>${r.notes?.map(n=>`<p class="soft-note">${esc(n)}</p>`).join('')||''}${reportRaces(r)}</article>`).join('')}</section>`:weekly.map(r=>reportPage(r)).join('')}<div class="report-modal-actions">${registrationPending?button('ack','この名前と方針で、モーグリに任せる'):button('close','報告を閉じる','','button outline')}${!registrationPending&&!['buy','breed'].includes(state.stage)?`${button('advance','次の週へ →')}${button('advance-month','4週まとめて進める','','button quiet')}`:''}</div>`;
  }
  function reportPage(r) {
    const type={weekly:'WEEKLY LETTER',monthly:'MONTHLY LETTER',annual:'A YEAR TO REMEMBER',event:'OUR MEMORIES',birth:'A NEW LIFE',registration:'READY TO RUN',founder:'A NEW LEGACY'}[r.type];
    return `<header class="report-heading"><span class="eyebrow">${type}</span><h3>${esc(r.title)}</h3><p>${R.when(r.week)}</p></header><section class="letter"><div class="letter-body"><div class="letter-from">${avatar()}<span>シロマから、あなたへ</span><span class="stamp">W & W</span></div><p class="letter-message">${esc(r.text)}</p>${r.notes?.map(n=>`<p class="soft-note">${esc(n)}</p>`).join('')||''}${r.income!==undefined?`<div class="finance-strip"><span>収入<strong>+ ${money(r.income)} <small>G</small></strong></span><span>支出<strong>− ${money(r.expense)} <small>G</small></strong></span><span>今のギル<strong>${money(state.money)} <small>G</small></strong></span></div>`:''}${r.results?.length?reportRaces(r):''}${r.type==='registration'?registration(r):''}${RanchObservation.birthGenetics(state,r)}${r.type==='birth'?`<div class="birth-card">${birdArt(R.bird(state,r.birdId))}<div><b>${esc(R.bird(state,r.birdId).name)}</b><p>穏やかな平原でお世話しています。</p>${button('detail','この子に会う',`data-id="${r.birdId}"`,'button quiet')}</div></div>`:''}<div class="letter-actions">${r.type==='founder'?button('promote','始祖入りを受ける',`data-id="${r.birdId}"`):''}<span>${r.change!==undefined?`今週の収支 ${r.change>=0?'+':''}${money(r.change)} G`:''}</span></div></div><div class="letter-portrait">${portrait(r.expression)}<span>SHIROMA</span></div></section>`;
  }
  function policyOptions(value){return `<option value="steady" ${value==='steady'?'selected':''}>着実に勝ちを積み上げる</option><option value="challenge" ${value==='challenge'?'selected':''}>積極的に重賞へ挑む</option>`;}
  function replayButton(r,id,className='button outline'){
    return r.replay?button('watch-race','2Dでレースを見る',`data-id="${esc(id)}" data-week="${r.week}"`,className):'';
  }
  function reportRaces(r){
    return `<div class="race-results">${(r.results||[]).map(x=>`<div class="race-report-entry"><button class="result-row" data-action="result" data-id="${esc(x.birdId)}" data-week="${x.week}"><b class="placing">${x.rank}<small>着</small></b><span><strong>${esc(x.birdName)}</strong><small>${esc(x.name)} ・ ${x.distance}m</small></span><span>+${money(x.reward)} G <small>結果を見る ↗</small></span></button>${replayButton(x,x.birdId,'button quiet')}</div>`).join('')}</div>`;
  }
  function finishOrder(r,id){return `<ol class="finish-order">${r.field.map((x,i)=>`<li class="${x.id===id?'mine':''}"><span>${i+1}</span><b>${esc(x.name)}</b><span>${x.finished===false?'未完走':`${Math.floor(x.time/60)}:${(x.time%60).toFixed(2).padStart(5,'0')}`}</span></li>`).join('')}</ol>`;}
  function viewerMarkup(r,id){
    const awarded=r.rank===1&&r.finished!==false,mode=modal.renderer||'2d',playback=modal.playback||{};
    return `<div class="race-viewer"><header class="race-viewer-head"><div><span class="eyebrow">WING & WIND / RACE THEATER</span><h2 id="dialog-title">${esc(r.name)}</h2><p>${R.when(r.week)} / ${esc(tracks[r.trackId]?.name||'競走場')} / ${r.distance}m / ${groundText(r)}</p></div><div class="race-renderer-controls" aria-label="観戦の表示方式">${[['2d','2D'],['3d','3D']].map(([key,label])=>`<button class="button quiet" data-action="watch-mode" data-renderer="${key}" aria-pressed="${mode===key}">${label}</button>`).join('')}</div></header>
      ${r.replay.version===1?'<p class="race-old-note">この走行記録には横方向の進路が保存されていないため、枠位置で表示します。新しい出走では内寄せ・進路変更も記録します。</p>':''}
      <div class="race-stage"><div class="race-loading" role="status">競走場とチョコボを準備しています…</div><div class="race-hud"><div><span data-race-phase>パドック</span><b data-race-clock>RACE REPLAY</b><small data-race-remaining></small><small data-race-camera>パドック</small></div><div><ol class="race-live-order" data-live-order aria-label="現在の上位5羽"></ol></div></div>
        <div class="race-commentary"><div class="race-commentator speaking" data-commentator="lamia"><img src="assets/commentators/lamia.png" alt="実況のラミア"><span>ラミア / 実況</span></div><div class="race-commentary-copy"><span data-commentary-speaker>ラミア / 実況</span><p data-commentary-text>パドックから、レースの模様をお届けします！</p></div><div class="race-commentator" data-commentator="sahagin"><img src="assets/commentators/sahagin.png" alt="解説のサハギン"><span>サハギン / 解説</span></div></div>
      </div>
      <div class="race-controls"><button class="button primary" data-viewer="pause" data-needs-viewer disabled aria-pressed="false">Ⅱ 一時停止</button><button class="button outline" data-viewer="restart" data-needs-viewer disabled>↺ 最初から</button><label>再生速度<select data-viewer-speed data-needs-viewer disabled>${[[.5,'0.5×'],[1,'1× リアルタイム'],[2,'2×'],[4,'4×']].map(([value,label])=>`<option value="${value}" ${value===(playback.rate??1)?'selected':''}>${label}</option>`).join('')}</select></label>${mode==='2d'?`<label>動き<select data-viewer-pitch data-needs-viewer disabled aria-label="動きのテンポ">${[[1,'ゆったり'],[1.5,'ふつう'],[2,'きびきび']].map(([value,label])=>`<option value="${value}" ${value===(playback.pitch??2)?'selected':''}>${label}</option>`).join('')}</select></label>`:''}<label>注目羽<select data-viewer-focus data-needs-viewer disabled>${r.replay.runners.slice().sort((a,b)=>a.lane-b.lane).map(x=>`<option value="${esc(x.id)}" ${x.id===(playback.focusId??id)?'selected':''}>${x.lane+1}番 ${esc(x.name)}</option>`).join('')}</select></label><div class="race-camera-controls" aria-label="カメラ切替">${[['broadcast','中継'],['follow','追走'],['overview','全景'],['finish','ゴール']].map(([key,label])=>`<button class="button quiet" data-viewer="camera" data-camera="${key}" aria-pressed="${key===(playback.cameraMode??'broadcast')}" data-needs-viewer disabled>${label}</button>`).join('')}</div></div>
      <div class="race-paddock-controls" data-paddock-controls aria-label="パドックの出走羽紹介"><button class="button quiet" data-viewer="paddock-prev" data-needs-viewer disabled>← 前の羽</button><span data-paddock-progress>1 / ${r.replay.runners.length}羽</span><button class="button quiet" data-viewer="paddock-next" data-needs-viewer disabled>次の羽 →</button><button class="button outline" data-viewer="paddock-skip" data-needs-viewer disabled>発走へ進む</button></div>
      <div class="race-seek"><input type="range" min="0" max="1" value="0" step=".1" data-viewer-seek data-needs-viewer disabled aria-label="観戦の再生位置"><span data-viewer-time>0:00.00</span></div><div class="race-chapters" aria-label="場面へ移動">${[['paddock','パドック'],['gate','出走'],['race','レース'],['result','決着'],...(awarded?[['award','表彰']]:[])].map(([key,label])=>`<button class="button quiet" data-viewer="phase" data-phase="${key}" data-needs-viewer disabled>${label}</button>`).join('')}</div>
      <div class="race-voice-controls"><button class="button outline" data-viewer="voice" aria-pressed="false">実況音声</button><small data-voice-status>実況字幕 ON / 音声 OFF</small></div>
      <details class="race-result-sheet"><summary>確定した結果・着順を見る（${r.rank}着）</summary>${finishOrder(r,id)}</details></div>`;
  }
  function registration(r) {
    return `<div class="registration">${note('名前と方針が決まったら、調教とレース選びは任せるクポ！ 疲れたときには、ちゃんと休ませるクポ。','moogle')}${r.birdIds.map(id=>{const b=R.bird(state,id);return `<div class="registration-row"><label>競走羽の名前<input data-register-name="${id}" value="${esc(b.name)}" minlength="2" maxlength="9" pattern="[ァ-ヺー]{2,9}" title="2〜9文字のカタカナ（長音も使用可）"></label><label>トレーナーへの方針<select data-register-policy="${id}">${policyOptions(b.policy)}</select></label></div>`;}).join('')}<p class="muted">名前は2〜9文字のカタカナ（長音「ー」も可）。名前・方針はチョコボ画面から後で変更できます。</p></div>`;
  }
  function market() {
    const birds=state.sale.map(id=>R.bird(state,id)).filter(b=>b.owner==='sale');
    return `${heading('MARE SALE','最初の出会いを、ここで。','繁殖牝羽セール / 毎年2月〜3月')}${note(R.saleOpen(state)?'気になる子を一羽、選んでみましょう。どの子も源流との配合ができます。購入後の配合やお世話のために、ギルは少し残しておきたいですね。':'今年のセールはお休みです。次は2月に開かれますよ。')}${R.saleOpen(state)?`<div class="bird-grid sale-grid">${birds.map((b,i)=>`<article class="bird-card"><div class="bird-illustration ${b.color}"><span class="lot">LOT ${String(i+1).padStart(2,'0')}</span>${birdArt(b)}<span class="tag">${R.age(state,b)}歳 ・ 牝</span></div><div class="bird-card-body"><h2>${esc(b.name)}</h2><p>${esc(b.comment)}</p>${hints(b)}${career(b)}${geneticResearch(b,{open:false})}${pedigreeView(b)}<div class="card-bottom"><strong>${money(b.price)} <small>G</small></strong>${button('buy-dialog','この子を迎える',`data-id="${b.id}" ${state.money<b.price?'disabled':''}`,'button outline')}</div></div></article>`).join('')||'<div class="empty">今年のセールの子は、みんな牧場に迎えられました。</div>'}</div><p class="page-footnote">購入はこのあと確認できます。源流の配合料金は600 Gです。</p>`:'<div class="empty">春のセールで、また新しい出会いを。</div>'}`;
  }
  function hints(b) {
    const p=R.profile(b),conditions=[...new Set(R.Breeding.defectSummary(b.genome,R.DEFECTS).filter(d=>d.active&&R.Breeding.SPECIAL[d.trait]).map(d=>R.DEFECT_LABELS[d.trait]))];
    return `<div class="trait-hints"><p>${esc(p.distance)} / ${esc(p.style)}</p><p><b>長所</b> ${esc(p.strengths)}</p><p><b>短所</b> ${esc(p.weaknesses)}</p>${conditions.length?`<p><b>体質</b> ${conditions.map(esc).join("・")}</p>`:""}</div>`;
  }
  function pedigreeView(b,{compact=false}={}) {
    const lookup=id=>R.bird(state,id);
    function branch(id,depth,label,seen=[]){
      const p=lookup(id);
      if(!p)return `<li><span class="muted">${label}：不明</span></li>`;
      const title=`<span>${label}：${button('detail',esc(p.name),`data-id="${p.id}"`,'button quiet small')}</span>`;
      if(depth>=R.Breeding.DEPTH||!p.parents.length||seen.includes(id))return `<li>${title}</li>`;
      return `<li><details ${depth===1?'open':''}><summary>${title}</summary><ul>${[0,1].map(i=>branch(p.parents[i],depth+1,i?'母':'父',[...seen,id])).join('')}</ul></details></li>`;
    }
    const parents=compact?`<div class="parent-pair">${[0,1].map(i=>{const p=lookup(b.parents[i]);return `<div><small>${i?'母':'父'}</small>${p?button('detail',esc(p.name),`data-id="${p.id}"`,'button quiet small'):'<span class="muted">不明</span>'}</div>`;}).join('')}</div>`:'';
    return `${parents}<details class="pedigree"><summary>父と母、その先の5代血統</summary>${b.pedigreeReconstructed?'<p class="muted">旧記録の不明な血統を補完した個体です。</p>':''}${b.parents.length?`<ul class="pedigree-tree">${[0,1].map(i=>branch(b.parents[i],1,i?'母':'父')).join('')}</ul>`:`<p class="muted">${b.kind==='root'?'はじまりの血統です。':'導入以前の父母は不明です。'}</p>`}</details>`;
  }
  function crossHint(sire,dam) {
    if(!sire||!dam)return '';
    const crosses=R.breedingCrosses(state,sire,dam),percent=n=>`${+(n*100).toFixed(3)}%`;
    if(!crosses.length)return '';
    return `<section class="paper cross-preview"><h3>この配合のクロス</h3>${R.crossReason(state,sire,dam)?`<p class="cross-danger" role="alert">${esc(R.crossReason(state,sire,dam))}</p>`:''}<div class="cross-scroll"><table><thead><tr><th>共通する祖先</th><th>位置</th><th>血量</th><th>長所を強める</th><th>欠点を強める</th></tr></thead><tbody>${crosses.map(c=>`<tr><th>${esc(c.name)}</th><td>${c.positions.join(' × ')}</td><td>${percent(c.blood)}</td><td>${percent(c.benefitRate)}</td><td>${percent(c.defectRate)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function career(b) {
    const wins=b.records.filter(r=>r.rank===1&&/^G/.test(r.level));
    return `<div class="career-summary"><p>${esc(R.farmName(b))} / ${b.races}戦 ${b.wins}勝 / GⅠ ${b.g1}勝</p>${wins.length?`<p>${wins.map(r=>`${esc(r.level)} ${esc(r.name)}（${esc(R.when(r.week))}）`).join('、')}</p>`:'<p>重賞勝利はまだありません</p>'}</div>`;
  }
  function gradedCareer(b) {
    const wins=b.records.filter(r=>r.rank===1&&/^G/.test(r.level));
    return `<section class="graded-career"><h3>重賞成績</h3><p>GⅠ ${b.g1}勝${wins.length?` / 重賞 ${wins.length}勝`:''}</p>${wins.length?`<details><summary>勝った重賞</summary>${wins.map(r=>`<p>${esc(r.level)} ${esc(r.name)} <small>${esc(R.when(r.week))}</small></p>`).join('')}</details>`:''}</section>`;
  }
  function breedingFamily(b) {
    if(b.sex!=='F')return '';
    const children=state.birds.filter(child=>child.parents[1]===b.id).sort((a,c)=>c.bornWeek-a.bornWeek);
    const mate=b.pregnancy?R.bird(state,b.pregnancy.sireId):children.length?R.bird(state,children[0].parents[0]):null;
    return `<section class="breeding-family"><h3>配合相手・産駒</h3><div class="family-pair"><span>${b.pregnancy||!children.length?'配合相手':'最新の産駒の父'}</span>${mate?button('detail',esc(mate.name),`data-id="${mate.id}"`,'button quiet small'):`<span class="muted">${b.bredYear?'記録なし':'未配合'}</span>`}</div>${b.pregnancy?`<p class="family-due">出産予定 ${R.when(b.pregnancy.due)}</p>`:''}<details${children.length?' open':''}><summary>産駒 ${children.length}羽</summary>${children.map(child=>{const father=R.bird(state,child.parents[0]);return `<div class="offspring-row"><div>${button('detail',esc(child.name),`data-id="${child.id}"`,'button quiet small')}<small>${R.age(state,child)}歳 ・ ${child.sex==='F'?'牝':'牡'} ・ ${role(child)} / GⅠ ${child.g1}勝</small></div><div><small>父</small>${father?button('detail',esc(father.name),`data-id="${father.id}"`,'button quiet small'):'<span class="muted">不明</span>'}</div></div>`;}).join('')||'<p class="muted">まだ産駒はいません。</p>'}</details></section>`;
  }
  function bonusHint(sire,dam) {
    if(!sire||!dam)return '';
    const entries=Object.entries(R.pedigreeBonus(state,sire,dam)).filter(([,v])=>v.lower||v.upper);
    if(!entries.length)return '';
    return `<details class="soft-note"><summary>血統のGⅠ実績と誕生時の補正</summary><p>血統内の牝羽は乱数の下限、牡羽は上限を引き上げます。父母から4世代を参照し、遠い祖先ほど小さく反映します。</p><p>${entries.map(([key,v])=>`${traitLabels[key]}：下限 +${v.lower.toFixed(1)} / 上限 +${v.upper.toFixed(1)}`).join(' ・ ')}</p></details>`;
  }
  function offspringPreview(sire,dam) {
    if(!sire||!dam)return '';
    const ranges=R.breedingPreview(state,sire,dam),level=R.labLevel(state),numeric=level>=2;
    const table=labels=>`<div class="ability-grid ${numeric?'numeric':'ratings-only'}">${Object.entries(labels).map(([key,label])=>{
      const range=ranges[key],low=R.geneticRating(range.min),high=R.geneticRating(range.max);
      const min=Math.floor(range.min),max=Math.floor(range.max);
      return `<div data-preview-trait="${key}"><span>${label}</span><b>${low===high?low:`${low}〜${high}`}${numeric?` <small data-score="${key}">${min===max?min:`${min}〜${max}`}</small>`:''}</b></div>`;
    }).join('')}</div>`;
    return `<section class="paper offspring-preview"><span class="eyebrow">INHERITANCE FORECAST</span><h3>生まれる子の遺伝効果</h3><p class="muted">継承する因子とクロスの抽選から、現れる可能性のある範囲を5段階${numeric?'と数値':''}で表示します。誕生時の個体差や、その後の育成は別に加わります。</p>${table(statLabels)}${level>=1?`<h4>羽場適性の予想</h4>${table(R.Genetics.APTITUDES)}<h4>成長と加齢の予想</h4><p class="muted">高いほど、早く育ち、長く能力を保てます。</p>${table(R.Genetics.DEVELOPMENT)}`:''}</section>`;
  }
  function birdSchedule(b) {
    const editable=b.owner==='player'&&b.role==='racing'&&b.registered;
    if(!editable)return '';
    return `<section class="bird-schedule"><div class="section-title"><h3>これから2ヶ月の調教・出走予定</h3><span class="tag">今週から8週分</span></div><p class="muted">週ごとに変更すると、その予定を優先します。おまかせの予定は目安で、戦績・体調・所持ギルによって変わります。体調が悪いときは回復を優先します。</p><div class="schedule-list">${R.upcomingSchedule(state,b).map(row=>{
      const chosen=row.override.mode==='auto'?'auto':row.override.mode==='training'?`training:${row.override.menu}`:row.override.mode==='race'?`race:${row.override.eventId}`:'rest';
      const choices=[['auto','モーグリにおまかせ'],...Object.entries(R.TRAINING_MENUS).map(([key,menu])=>[`training:${key}`,`調教：${menu.label}`]),['rest','休養'],...R.raceOptions(state,b,row.week).map(e=>[`race:${e.id}`,`出走：${e.name} / ${e.track.name} / ${money(e.fee)} G`])];
      const description=row.mode==='race'?`${row.event.name} / ${row.event.distance}m`:row.mode==='rest'?'休養':R.TRAINING_MENUS[row.menu].label;
      return `<div class="schedule-row ${row.mode}" data-plan-week="${row.week}"><div><time>${R.when(row.week)}${row.week===state.week?' ・ 今週':''}</time><b>${esc(description)}</b><small>${row.manual?'指定した予定':'おまかせ'}${row.reason?` / ${esc(row.reason)}`:''}${row.event?` / ${esc(row.event.track.name)} / ${groundText(row.event)}`:''}</small></div><label><span class="sr-only">${esc(b.name)}の${R.when(row.week)}の予定</span><select data-schedule-id="${b.id}" data-week="${row.week}">${!choices.some(([key])=>key===chosen)?`<option value="${esc(chosen)}" selected disabled>指定レースは現在の条件では出走不可</option>`:''}${choices.map(([key,label])=>`<option value="${esc(key)}" ${key===chosen?'selected':''}>${esc(label)}</option>`).join('')}</select></label></div>`;
    }).join('')}</div></section>`;
  }
  function breedPage() {
    const mares=R.own(state).filter(b=>b.role==='mare'),allSires=R.sires(state);
    const sires=(sireTab==='public'?R.searchSires(state,{query:sireQuery,route:sireRoute,sort:sireSort}):allSires).filter(b=>sireGroup(b)===sireTab).filter(b=>{
      if(sireTab!=='root'||!rootTrait)return true;
      const profile=R.ROOTS.find(r=>r.lineage===b.lineage);
      return profile?.primary===rootTrait||profile?.secondary===rootTrait||profile?.strengths.includes(rootTrait);
    });
    if(!mares.some(b=>b.id===damId))damId=mares[0]?.id||'';
    if(!sires.some(b=>b.id===sireId))sireId=sires[0]?.id||'';
    sireChoices[sireTab]=sireId;
    const dam=R.bird(state,damId),sire=R.bird(state,sireId),reason=R.breedingReason(state,dam,sire);
    const empty={root:'この持ち味を持つ源流は見つかりませんでした。',public:sireQuery||sireRoute?'条件に一致する種牡羽が見つかりません。検索条件を変えてください。':'今は、他の牧場から利用できる種牡羽がいません。',founder:'始祖はまだいません。自家製種牡羽の産駒が3羽以上でGⅠ勝利、合計7勝以上を挙げると、年末にオファーが届きます。',home:'自家製の種牡羽はまだいません。育てた牡羽が繁殖入りすると、無料で配合できます。'};
    const tabs=`<div class="tabs sire-tabs" role="tablist" aria-label="種牡羽の区分">${SIRE_TABS.map(([key,label])=>button('sire-tab',`${label} <small>${allSires.filter(b=>sireGroup(b)===key).length}</small>`,`id="sire-tab-${key}" data-tab="${key}" role="tab" aria-selected="${sireTab===key}" aria-controls="sire-panel" tabindex="${sireTab===key?0:-1}"`,`tab ${sireTab===key?'active':''}`)).join('')}</div>`;
    const filter=sireTab==='root'?`<label class="sire-filter" for="root-trait">つなぎたい持ち味<select id="root-trait"><option value="">すべての持ち味</option>${Object.entries(traitLabels).map(([key,label])=>`<option value="${key}" ${rootTrait===key?'selected':''}>${label}</option>`).join('')}</select><span class="muted">${sires.length} / 32羽</span></label>`:sireTab==='public'?`<div class="sire-search"><label>名前・牧場・勝ったレース<input id="sire-query" value="${esc(sireQuery)}" placeholder="例：メテオ、ダービー">${button('search-sires','検索','','button outline small')}</label><label>GⅠ勝利路線<select id="sire-route">${[['','全路線'],['sprint','短距離'],['mile','マイル'],['middle','中距離'],['long','長距離'],['dirt','ダート']].map(([k,n])=>`<option value="${k}" ${sireRoute===k?'selected':''}>${n}</option>`).join('')}</select></label><label>優先して並べる<select id="sire-sort">${[['fee','料金が安い順'],['g1','GⅠ勝利数'],...Object.entries(traitLabels).filter(([k])=>!Object.hasOwn(R.Genetics.DEVELOPMENT,k))].map(([k,n])=>`<option value="${k}" ${sireSort===k?'selected':''}>${n}</option>`).join('')}</select></label><p class="muted">${sires.length}羽 / 毎年10羽が登録・5年間供用</p></div>`:'';
    const list=sires.map(b=>`<button class="sire-option ${b.id===sireId?'selected':''}" data-action="select-sire" data-id="${b.id}" aria-pressed="${b.id===sireId}"><span class="radio-mark"></span><span class="sire-info"><span class="tag">${kind(b)}</span><strong>${esc(b.name)}</strong><small>${esc(b.comment||R.observe(state,b))}</small><small>${colorText(b)}</small>${hints(b)}<small>${esc(R.farmName(b))} / ${b.races}戦${b.wins}勝 / GⅠ ${b.g1}勝</small></span><span class="sire-price">${R.breedFee(b)?money(R.breedFee(b))+' G':'無料'}</span></button>`).join('');
    const parent=(b,mother)=>`<section class="paper breeding-parent"><header class="breeding-parent-head">${birdArt(b)}<div><span class="eyebrow">${mother?'MOTHER':'FATHER'}</span><h2>${esc(b.name)}</h2>${mother?`<label for="dam-choice">繁殖牝羽<select id="dam-choice">${mares.map(m=>`<option value="${m.id}" ${m.id===damId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>`:button('open-sire-picker','種牡羽を変更','','button outline small')}</div></header>${geneticResearch(b,{compact:true})}${pedigreeView(b,{compact:true})}${gradedCareer(b)}${mother?breedingFamily(b):''}<details class="parent-notes"><summary>持ち味・競走情報</summary><p>${esc(R.observe(state,b))}</p><p>${colorText(b)}</p>${hints(b)}${career(b)}</details></section>`;
    return `${heading('THE NEXT GENERATION','次の世代へ、つなぐ。','配合期間：3月第1週〜4月第4週')}<div class="breeding-season ${R.breedingOpen(state)?'open':'closed'}" role="status">${R.breedingOpen(state)?'配合期間中です。4月第4週まで配合できます。':'今は配合期間外です。次の3月から配合できます。相手選びと予測は確認できます。'}</div>${!dam?`<div class="empty"><h2>まずは、お母さんを迎えましょう。</h2>${button('nav','繁殖牝羽セールへ','data-page="market"')}</div>`:`<section class="breeding-confirm ${R.breedingOpen(state)?'':'unavailable'}"><div><span class="eyebrow">YOUR PAIRING</span><h3>${esc(dam.name)} <span>×</span> ${esc(sire?.name||'種牡羽を選んでください')}</h3><p>${esc(reason)||`出産予定 ${R.when(state.week+R.GESTATION)}`}</p></div>${button('breed-dialog',`配合をお願いする${sire?` <span>${money(R.breedFee(sire))} G</span>`:''}`,reason?'disabled':'')}</section><details class="paper sire-picker" id="sire-picker"><summary>種牡羽を選ぶ <span>${esc(sire?.name||'未選択')}</span></summary>${tabs}<div id="sire-panel" role="tabpanel" aria-labelledby="sire-tab-${sireTab}">${filter}<div class="sire-list">${list||`<p class="sire-empty">${empty[sireTab]}</p>`}</div></div></details>${offspringPreview(sire,dam)}${crossHint(sire,dam)}<div class="breeding-layout">${parent(dam,true)}${sire?parent(sire,false):'<section class="paper"><p class="muted">種牡羽を選んでください。</p></section>'}</div>${bonusHint(sire,dam)}`}`;

  }
  function birdsPage() {
    const all=R.own(state),birds=all.filter(b=>birdFilter==='all'||b.role===birdFilter);
    return `${heading('OUR CHOCOBOS','一羽ずつ、違う物語。','詳しく知りたい子を選ぶと、シロマやモーグリが様子を教えてくれます。')}<div class="tabs">${[['all','みんな'],['young','幼羽'],['racing','競走羽'],['mare','繁殖牝羽'],['stud','種牡羽']].map(([k,n])=>button('filter',`${n} <small>${all.filter(b=>k==='all'||b.role===k).length}</small>`,`data-filter="${k}" aria-pressed="${birdFilter===k}"`,`tab ${birdFilter===k?'active':''}`)).join('')}</div>${birds.length?`<div class="bird-grid">${birds.map(b=>`<button class="bird-card selectable" data-action="detail" data-id="${b.id}"><div class="bird-illustration ${b.color}"><span class="lot">${role(b)}</span>${birdArt(b)}<span class="tag">${R.age(state,b)===null?'時を超える血統':R.age(state,b)+'歳'} ・ ${b.sex==='F'?'牝':'牡'}</span></div><div class="bird-card-body"><h2>${esc(b.name)}</h2><p>${b.pregnancy?'新しい命を待っています':b.role==='young'?'放牧地で、のびのび成長中':b.role==='racing'?`${b.races}戦 ${b.wins}勝 ・ ${b.health?'療養中':b.condition<75||b.strain>25?'休養中':'モーグリにおまかせ'}`:b.role==='stud'?kind(b)+'種牡羽':'次の世代へつなぐ一羽'}</p><div class="card-bottom"><span>${b.g1?'GⅠ '+b.g1+'勝':b.color==='golden'?'黄金の羽':'羽風牧場'}</span><span>会いにいく ↗</span></div></div></button>`).join('')}</div>`:`<div class="empty"><span class="empty-feather">♧</span><h2>${all.length?'この羽房は、まだ空いています。':'まだ、羽音のない牧場。'}</h2><p>最初の出会いを、シロマと一緒に。</p>${button('nav','今週の牧場へ','data-page="home"')}</div>`}`;
  }
  function facilitiesPage() {
    const cap=R.capacity(state);
    return `${heading('ROOM TO GROW','夢に合わせて、少しずつ。','必要なときに、必要な設備を。建設・拡張の効果はすぐに反映されます。')}<div class="capacity-strip"><span>幼羽・競走羽 <b>${R.racingCount(state)} / ${cap.racing}</b></span><span>繁殖牝羽 <b>${R.own(state).filter(b=>b.role==='mare').length} / ${cap.mare}</b></span><span>種牡羽 <b>${R.own(state).filter(b=>b.role==='stud').length} / ${cap.stud}</b></span></div><div class="facility-grid">${Object.entries(R.FACILITIES).map(([key,f])=>{const reason=R.facilityReason(state,key),level=state.facilities[key],locked=!!f.lock&&reason.includes('で建設')||reason.includes('すると建設');return `<article class="paper facility ${locked?'locked':''}"><div class="section-title"><span class="facility-symbol">${{stalls:'⌂',course:'◎',hill:'△',pool:'≋',spa:'♨',clinic:'✚',meadow:'♧',forest:'♤',shop:'▧',lab:'⚗',statue:'♜',museum:'♛'}[key]}</span><span class="tag">${level?(key==='lab'?'完成':'Lv. '+level):locked?'未解放':'未建設'}</span></div><h2>${f.name}</h2><p>${f.description}</p><div class="card-bottom"><span>${level>=f.max?'完成':locked?f.lock:money(R.facilityCost(state,key))+' G'}</span>${button('build-dialog',level?'拡張':'建設',`data-key="${key}" ${reason?'disabled':''}`,'button outline small')}</div>${reason&&level<f.max&&!locked?`<small class="muted">${reason}</small>`:''}</article>`;}).join('')}</div>`;
  }
  function notebook() {
    let content='';
    if(notebookTab==='calendar') {
      const plans=R.own(state).filter(b=>b.role==='racing').map(b=>({b,e:R.nextRace(state,b)}));
      content=`${note('得意な距離と羽場から、方針に合うレースを選ぶクポ。元気と脚の状態を見て、4週以上の間隔を空けるクポ。','moogle')}<section class="paper"><h2>これからの予定</h2>${plans.map(({b,e})=>`<div class="list-row"><span><b>${esc(b.name)}</b><small>${b.policy==='steady'?'着実に勝ちを積み上げる':'積極的に重賞へ挑む'}</small></span><span>${e?`${R.when(e.week)}<small>${esc(e.name)} / ${e.distance}m</small><small>${esc(e.track?.name||'')} / ${groundText(e)}</small>`:'休養・調教'}</span></div>`).join('')||'<p class="muted">デビューまでは、シロマと成長を見守りましょう。</p>'}<div class="list-row"><span><b>繁殖牝羽セール</b><small>毎年 2月〜3月</small></span>${button('nav',R.saleOpen(state)?'セールを見る →':'開催案内','data-page="market"','button quiet')}</div><div class="list-row"><span><b>競走羽の名前登録</b><small>2歳になる年の1月第1週</small></span><span class="muted">報告から登録できます</span></div><div class="list-row"><span><b>年度表彰・始祖入りの審査</b><small>12月第4週</small></span><span class="muted">シロマがお知らせします</span></div></section>`;
    } else if(notebookTab==='accounts') content=`<div class="finance-strip paper"><span>現在のギル<strong>${money(state.money)} G</strong></span><span>未払金<strong>${money(state.debt)} G</strong></span><span>ファン<strong>${money(state.birds.filter(b=>b.owner==='player').reduce((n,b)=>n+b.fans,0))} 人</strong></span></div><section class="paper"><h2>収支の記録</h2>${state.ledger.slice(-60).reverse().map(l=>`<div class="list-row"><span>${esc(l.note)}<small>${R.when(l.week)}</small></span><b class="${l.amount>0?'positive':''}">${l.amount>0?'+':''}${money(l.amount)} G</b></div>`).join('')||'<p class="muted">これからの歩みを、ここに記録します。</p>'}</section>`;
    else if(notebookTab==='records') content=`<section class="paper"><h2>牧場の思い出</h2>${Object.entries(state.milestones).filter(([k])=>!k.includes(':')).map(([k,w])=>`<div class="list-row"><b>${{purchase:'最初の仲間',breeding:'はじめての配合',birth:'はじめての誕生',win:'レース初勝利',g1:'GⅠ初勝利',derby:'ダービー初勝利'}[k]||esc(k)}</b><span>${R.when(w)}</span></div>`).join('')||'<p class="muted">一歩ずつ、私たちの記録を増やしていきましょう。</p>'}<h2 class="section-gap">年度表彰</h2><p class="muted">GⅠ勝利のみ加点。ダート60点、短距離70点、2歳80点、牝羽限定100点、その他120点、長距離140点、ダービー・ワールドカップ・バハムート180点。各部門の対象レースを集計します。</p>${state.awards.map(a=>`<div class="list-row"><span>${a.year}年 ${esc(a.title)}</span><b>${esc(a.farm||'羽風牧場')} / ${esc(a.name)}<small>${a.points??''}点</small></b></div>`).join('')||'<p class="muted">年末に、今年の活躍を振り返ります。</p>'}${state.founderOffers.length?'<h2 class="section-gap">始祖入りのオファー</h2>':''}${state.founderOffers.map(id=>`<div class="list-row"><b>${esc(R.bird(state,id).name)}</b>${button('promote','始祖入りを受ける',`data-id="${id}"`,'button outline')}</div>`).join('')}</section>`;
    else content=`<section class="paper"><h2>シロマの報告を読み返す</h2>${state.journal.slice().reverse().map(r=>`<details class="journal-entry"><summary><span>${esc(r.title)}</span><small>${R.when(r.week)}</small></summary><p>${esc(r.text)}</p>${r.notes?.map(n=>`<p>${esc(n)}</p>`).join('')||''}${r.results?.length?reportRaces(r):''}${RanchObservation.birthGenetics(state,r)}</details>`).join('')||'<p class="muted">まだ報告はありません。</p>'}</section>`;
    return `${heading('RANCH NOTEBOOK','知りたいことを、知りたいときに。')}<div class="tabs">${[['calendar','予定'],['accounts','収支'],['records','記録・表彰'],['letters','報告の便り']].map(([k,n])=>button('notebook-tab',n,`data-tab="${k}"`,`tab ${notebookTab===k?'active':''}`)).join('')}</div>${content}`;
  }
  function settings() {return `${heading('AT YOUR OWN PACE','牧場の設定。')}<section class="paper settings"><div class="settings-row"><div><h2>自動保存</h2><p>購入・配合・週送りなどの操作ごとに保存します。</p></div><span class="tag">${saveOK?'保存できています':'保存できていません'}</span></div></section>${saveSlots()}<section class="paper settings"><div class="settings-row"><div><h2>ファンのボーナス</h2><p>特別な記録を達成したときの、ファン増加量を調整します。</p></div><select id="difficulty" aria-label="ファンのボーナス">${[['easy','多め'],['normal','標準'],['hard','控えめ']].map(([k,n])=>`<option value="${k}" ${state.difficulty===k?'selected':''}>${n}</option>`).join('')}</select></div><div class="settings-row"><div><h2>牧場データのバックアップ</h2><p>新しい進行のセーブデータを書き出します。</p></div>${button('export','書き出す','','button outline')}</div><div class="settings-row"><div><h2>バックアップから再開</h2><p>新しい進行のセーブデータを読み込みます。</p></div>${button('import','読み込む','','button outline')}<input id="import-file" type="file" accept=".json,application/json" hidden></div><div class="settings-row reset-row"><div><h2>牧場を最初から始める</h2><p>3月第1週・2歳牝羽1羽から、シロマとの出会いをもう一度。<br>実行前に確認画面が開きます。</p></div>${button('reset-dialog','セーブをリセット','','button danger-outline')}</div></section>`;}
  function geneticResearch(b,options) {return RanchObservation.genetics(state,b,options);}
  function research(b) {return RanchObservation.status(state,b)+geneticResearch(b);}
  function detail(b) {
    return `<div class="detail-cover ${b.color}">${birdArt(b)}<div><span class="eyebrow">${role(b)} ・ ${b.sex==='F'?'牝':'牡'} ・ ${R.age(state,b)===null?kind(b):R.age(state,b)+'歳'}</span><h2 id="dialog-title">${esc(b.name)}</h2><p>${b.races?`${b.races}戦 ${b.wins}勝${b.g1?' / GⅠ '+b.g1+'勝':''}`:'これからはじまる、この子の物語。'}</p><p>${colorText(b)}</p></div></div>${note(R.observe(state,b),b.registered?'moogle':'shiroma')}${hints(b)}${b.role==='young'?`<label class="form-field">放牧地<select id="pasture-choice" data-id="${b.id}"><option value="meadow" ${b.pasture==='meadow'?'selected':''}>穏やかな平原 ・ 落ち着きと自制心を育てる</option><option value="forest" ${b.pasture==='forest'?'selected':''} ${!state.facilities.forest?'disabled':''}>過酷な森 ・ 意欲と刺激への慣れ${!state.facilities.forest?'（未整備）':''}</option></select></label>`:''}${b.role==='racing'?`<div class="wellbeing"><span>今の様子 <b>${b.health?'療養中':b.condition<75||b.strain>25?'ゆっくり休養':'元気に過ごしています'}</b></span><span>ファン <b>${money(b.fans)}人</b></span></div><label class="form-field">モーグリへの方針<select id="policy-choice" data-id="${b.id}">${policyOptions(b.policy)}</select></label>`:''}${research(b)}${birdSchedule(b)}${pedigreeView(b)}${breedingFamily(b)}${b.records.length?`<details class="pedigree"><summary>これまでのレース</summary>${b.records.slice().reverse().map(r=>`<div class="list-row race-record-row"><span>${esc(r.name)}<small>${R.when(r.week)}</small></span><b>${r.rank}着 / ${money(r.reward)} G</b>${button('result','結果・観戦',`data-id="${b.id}" data-week="${r.week}"`,'button outline')}</div>`).join('')}</details>`:''}${b.owner==='player'?`<div class="rename-row"><label for="bird-name">名前<input id="bird-name" value="${esc(b.name)}" minlength="2" maxlength="9" pattern="[ァ-ヺー]{2,9}" title="2〜9文字のカタカナ（長音も使用可）"></label>${button('rename','名前を保存',`data-id="${b.id}"`,'button outline')}</div>`:''}${b.role==='racing'?button('retire-dialog','競走生活を終え、繁殖へ',`data-id="${b.id}"`,'button quiet'):''}`;
  }
  function modalMarkup() {
    let body='',wide=false;
    if(modal.type==='reports'){wide=true;body=reportModal();}
    if(modal.type==='slot-save')body=`<h2 id="dialog-title">スロット${modal.slot}に上書きしますか？</h2><p>${modal.entry.invalid?'読み込めない保存データ':esc(saveSummary(modal.entry.state))}を、現在の牧場の記録に置き換えます。<br>このスロットの以前の記録は取り消せません。</p><div class="reset-preview">${esc(saveSummary(state))}</div><div class="modal-actions">${button('close','キャンセル','data-autofocus','button outline')}${button('slot-save-confirm','上書きセーブ')}</div>`;
    if(modal.type==='slot-load')body=`<h2 id="dialog-title">スロット${modal.slot}をロードしますか？</h2><p>現在の牧場と自動保存を、このスロットの記録に置き換えます。残したい進行は先に別のスロットへセーブしてください。</p><div class="reset-preview">${esc(saveSummary(modal.entry.state))}</div><div class="modal-actions">${button('close','キャンセル','data-autofocus','button outline')}${button('slot-load-confirm','ロードして再開')}</div>`;
    if(modal.type==='reset')body=`<span class="dialog-symbol">↺</span><h2 id="dialog-title">牧場を最初から始めますか？</h2><p>現在のチョコボ・ギル・施設・記録をリセットします。<br>この操作は取り消せません。</p><div class="reset-preview"><span>1年 3月 第1週</span><span>所有 1羽（2歳牝）</span><span>20,000 G</span></div><p class="muted">残したい記録があるときは、先に手動セーブか書き出しをしてください。手動セーブの5スロットは残ります。</p><div class="modal-actions">${button('close','キャンセル','data-autofocus','button outline')}${button('reset-confirm','リセットして始める','','button danger')}</div>`;
    if(modal.type==='buy') {const b=R.bird(state,modal.id);body=`<h2 id="dialog-title">${esc(b.name)}を迎えますか？</h2><div class="purchase-bird">${birdArt(b)}</div><p>繁殖牝羽として羽風牧場に迎えます。</p><div class="price-check"><span>購入料金</span><b>${money(b.price)} G</b><span>購入後のギル</span><b>${money(state.money-b.price)} G</b></div><div class="modal-actions">${button('close','戻る','data-autofocus','button outline')}${button('buy-confirm','この子を迎える',`data-id="${b.id}"`)}</div>`;}
    if(modal.type==='breed') {const d=R.bird(state,damId),s=R.bird(state,sireId);body=`<h2 id="dialog-title">この組み合わせで配合しますか？</h2><p class="pair-names">${esc(d.name)} × ${esc(s.name)}</p>${offspringPreview(s,d)}${crossHint(s,d)}<div class="price-check"><span>配合料金</span><b>${money(R.breedFee(s))} G</b><span>出産予定</span><b>${R.when(state.week+R.GESTATION)}</b></div><p class="muted">年に1回の配合です。出産用の羽房を1枠予約します。</p><div class="modal-actions">${button('close','戻る','data-autofocus','button outline')}${button('breed-confirm','配合をお願いする')}</div>`;}
    if(modal.type==='build'){const key=modal.key,f=R.FACILITIES[key];body=`<h2 id="dialog-title">${f.name}を${state.facilities[key]?'拡張':'建設'}しますか？</h2><p>${f.description}</p><div class="price-check"><span>費用</span><b>${money(R.facilityCost(state,key))} G</b><span>建設後の段階</span><b>Lv. ${state.facilities[key]+1}</b></div><div class="modal-actions">${button('close','戻る','data-autofocus','button outline')}${button('build-confirm','工事をお願いする',`data-key="${key}"`)}</div>`;}
    if(modal.type==='detail'){const b=R.bird(state,modal.id);if(!b)return '';wide=true;body=detail(b);}
    if(modal.type==='retire'){const b=R.bird(state,modal.id);body=`<h2 id="dialog-title">${esc(b.name)}を繁殖へ？</h2><p>競走生活を終え、${b.sex==='M'?'種牡羽':'繁殖牝羽'}になります。競走羽には戻れません。</p><div class="modal-actions">${button('close','戻る','data-autofocus','button outline')}${button('retire-confirm','繁殖入りする',`data-id="${b.id}"`)}</div>`;}
    if(modal.type==='result'){
      const b=R.bird(state,modal.id),r=b.records.find(r=>r.week===modal.week),x=r.interactions;
      const notes=x?[x.crowdedSeconds>1?'羽混みの中を走る場面がありました。':'',x.duelSeconds>1?'近くの相手と競り合いました。':'',x.savingSeconds>1?'先頭で差を確かめながら、余力を温存しました。':'',x.laneChanges>1?'周囲を見ながら進路を変えました。':'',x.blockedSeconds>1?'前の羽に進路を塞がれ、速度を抑える場面がありました。':''].filter(Boolean).join(''):'';
      body=`<span class="eyebrow">RACE RESULT</span><h2 id="dialog-title">${esc(r.name)}</h2><p>${R.when(r.week)} / ${r.distance}m / ${groundText(r)}</p><div class="result-summary"><strong>${r.rank}<small>着</small></strong><span>${esc(b.name)}<small>賞金・手当 ${money(r.reward)} G</small>${r.prize!==undefined?`<small>本賞金 ${money(r.prize)} G / 出走手当 ${money(r.allowance)} G</small><small>出走経費 ${money(r.fee)} G</small>`:''}</span></div>${notes?`<p class="soft-note">${notes}</p>`:''}<div class="result-actions">${replayButton(r,b.id)||'<p class="race-old-note">このレースには走行データがありません。レース観戦は走行記録のある出走から利用できます。</p>'}</div>${finishOrder(r,b.id)}`;
    }
    if(modal.type==='replay'){
      const b=R.bird(state,modal.id),r=b?.records.find(x=>x.week===modal.week);
      if(!r?.replay)return '';
      body=viewerMarkup(r,b.id);
    }
    if(modal.type==='import'){body=`<h2 id="dialog-title">この牧場のデータを読み込みますか？</h2><p>現在の牧場を、${R.when(modal.state.week)}・${money(modal.state.money)} Gの記録に置き換えます。</p><div class="modal-actions">${button('close','キャンセル','data-autofocus','button outline')}${button('import-confirm','読み込んで再開')}</div>`;}
    return `<div class="modal-backdrop"><section class="modal ${wide?'wide':''} ${modal.type==='replay'?'race-modal':modal.type==='reports'?'report-modal':''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><button class="modal-close" data-action="close" aria-label="閉じる">×</button>${modal.error?`<p class="notice" role="alert">${esc(modal.error)}</p>`:''}${body}</section></div>`;
  }
  function render() {
    const pickerOpen=$('#sire-picker')?.open;
    raceViewer?.dispose();raceViewer=null;const generation=++viewerGeneration;
    const unread=state.reports.length;
    $('#app').innerHTML=`<div class="app-shell" ${modal?'inert':''}><aside class="sidebar"><button class="brand" data-action="nav" data-page="home"><span class="brand-feather">❧</span><span>羽風牧場<small>WING & WIND</small></span></button><span class="nav-caption">RANCH LIFE</span><nav aria-label="メインメニュー">${['home','birds','breed','facilities','notebook'].map(id=>`<button data-action="nav" data-page="${id}" class="nav-item ${page===id?'active':''}" ${page===id?'aria-current="page"':''}><span>${ICONS[id]}</span>${LABELS[id]}${id==='home'&&unread?'<i class="unread-dot"></i>':''}</button>`).join('')}</nav><div class="sidebar-letter"><span>Dear Rancher,</span><p>ひとつの血統、<br>あなたと育てる物語。</p><small>with Shiroma</small></div><button class="nav-item settings-link ${page==='settings'?'active':''}" data-action="nav" data-page="settings"><span>⚙</span>設定</button><div class="save-status ${saveOK?'':'failed'}"><i></i>${saveOK?'自動保存しています':'保存できていません'}</div></aside><main><header class="topbar"><div class="date"><span class="season-mark">${['冬','春','夏','秋'][Math.floor((R.date(state.week).month%12)/3)]}</span><span>${R.when(state.week)}</span></div><div class="wallet"><span>所持ギル</span><strong>${money(state.money)}</strong><small>G</small></div></header><div class="content">${notice?`<div class="notice" role="status">${esc(notice)} ${button('dismiss','閉じる','','button quiet small')}</div>`:''}${unread?`<button class="unread-banner" data-action="reports">シロマから${unread}件の報告が届いています <span>読む →</span></button>`:''}${({home,market,birds:birdsPage,breed:breedPage,facilities:facilitiesPage,notebook,settings}[page]||home)()}<footer>HANEKAZE RANCH <span>小さな羽音から、物語はつづく。</span></footer></div></main></div>${modal?modalMarkup():''}`;
    document.body.classList.toggle('has-modal',!!modal);
    RanchPortraits.hydrate($('#app'));
    if(pickerOpen&&$('#sire-picker'))$('#sire-picker').open=true;
    if(modal?.type==='replay'){
      const b=R.bird(state,modal.id),r=b?.records.find(x=>x.week===modal.week),root=$('.race-viewer');
      const mode=modal.renderer||'2d',available=mode==='2d'?typeof window.CanvasRenderingContext2D!=='undefined':typeof window.WebGLRenderingContext!=='undefined';
      if(r?.replay&&root&&available)import(mode==='2d'?'/js/race-viewer-2d.js':'/js/race-viewer.js').then(module=>{
        if(generation===viewerGeneration)raceViewer=module.mount(root,{...r,birdId:b.id},tracks[r.trackId]||{},modal.playback||{});
      }).catch(error=>{if(generation===viewerGeneration){console.error(error);const status=$('.race-loading');if(status)status.textContent='観戦を読み込めませんでした。結果は下で確認できます。';}});
      else{const status=$('.race-loading');if(status)status.textContent='このブラウザでは選択した観戦方式を表示できません。別の表示方式を選んでください。結果は下で確認できます。';}
    }
  }
  function openModal(value) {if(modal&&['reports','detail','result'].includes(modal.type)&&['detail','result','replay'].includes(value.type))value.parent=modal;returnFocus=document.activeElement;modal=value;render();requestAnimationFrame(()=>($('[data-autofocus]')||$('.modal-close')||$('.modal'))?.focus());}
  function closeModal() {const action=returnFocus?.dataset?.action,id=returnFocus?.dataset?.id,slot=returnFocus?.dataset?.slot;if(modal?.type==='reports'){clearInformationalReports();save();}modal=modal?.parent||null;render();const target=[...document.querySelectorAll('[data-action]')].find(el=>el.dataset.action===action&&el.dataset.id===id&&el.dataset.slot===slot);target?.focus();}
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
    if(state.reports.length){save();openModal({type:'reports'});return;}
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
      state.reports=[...collected,...state.reports];busy=false;save();
      if(state.reports.length)openModal({type:'reports'});else render();
    }
  }
  document.addEventListener('click',event=>{
    if(event.target.classList?.contains('modal-backdrop')&&!busy){closeModal();return;}
    const target=event.target.closest('[data-action]');if(!target||target.disabled||busy)return;
    const {action,id,key}=target.dataset;
    try {
      if(action==='open-sire-picker') {const picker=$('#sire-picker');if(picker){picker.open=true;picker.scrollIntoView?.({behavior:'smooth',block:'start'});}return;}
      if(action==='nav'){page=target.dataset.page;modal=null;render();window.scrollTo({top:0});return;}
      if(action==='close'){closeModal();return;}
      if(action==='reports'){openModal({type:'reports'});return;}
      if(action==='slot-save'||action==='slot-load') {
        const slot=Number(target.dataset.slot);let entry;
        try{entry=readSlot(slot);}catch{throw Error('保存先を確認できません。ブラウザの保存設定を確認してください。');}
        if(action==='slot-save') {
          if(entry.empty)writeSlot(slot,entry.raw);
          else openModal({type:'slot-save',slot,entry});
        }else {
          if(!entry.state)throw Error(entry.empty?'このスロットにはセーブデータがありません。':'このスロットのデータは読み込めません。');
          openModal({type:'slot-load',slot,entry});
        }
        return;
      }
      if(action==='slot-save-confirm'){if(modal?.type==='slot-save')writeSlot(modal.slot,modal.entry.raw);return;}
      if(action==='slot-load-confirm'){if(modal?.type==='slot-load')loadSlot(modal.slot,modal.entry.raw);return;}
      if(action==='dismiss')notice='';
      if(action==='search-sires'){sireQuery=$('#sire-query').value;render();return;}
      if(action==='advance'||action==='advance-month'){advance(action==='advance'?1:4);return;}
      if(action==='ack')ack();
      if(action==='buy-dialog'){openModal({type:'buy',id});return;}
      if(action==='buy-confirm'){R.buy(state,id);page='home';modal=null;}
      if(action==='select-sire'){
        sireId=id;if($('#sire-picker'))$('#sire-picker').open=false;render();
        $('[data-action="open-sire-picker"]')?.focus({preventScroll:true});return;
      }
      if(action==='sire-tab'&&SIRE_TABS.some(([tab])=>tab===target.dataset.tab)){sireTab=target.dataset.tab;sireId=sireChoices[sireTab]||'';render();$(`#sire-tab-${sireTab}`)?.focus();return;}
      if(action==='breed-dialog'){const reason=R.breedingReason(state,R.bird(state,damId),R.bird(state,sireId));if(reason)throw Error(reason);openModal({type:'breed'});return;}
      if(action==='breed-confirm'){R.breed(state,damId,sireId);page='home';modal=null;}
      if(action==='build-dialog'){openModal({type:'build',key});return;}
      if(action==='build-confirm'){R.build(state,key);modal=null;notice=`${R.FACILITIES[key].name}がLv. ${state.facilities[key]}になりました。`;}
      if(action==='detail'){openModal({type:'detail',id});return;}
      if(action==='filter')birdFilter=target.dataset.filter;
      if(action==='notebook-tab')notebookTab=target.dataset.tab;
      if(action==='rename'){R.rename(state,id,$('#bird-name').value);notice='名前を保存しました。';}
      if(action==='retire-dialog'){openModal({type:'retire',id});return;}
      if(action==='retire-confirm'){R.retire(state,id);modal=null;page='home';}
      if(action==='promote'){R.promote(state,id);state.reports=state.reports.filter(r=>r.type!=='founder'||r.birdId!==id);page='home';}
      if(action==='result'){openModal({type:'result',id,week:Number(target.dataset.week)});return;}
      if(action==='watch-mode'&&modal?.type==='replay'){
        const mode=target.dataset.renderer;if(!['2d','3d'].includes(mode)||(mode===(modal.renderer||'2d')&&raceViewer?.ready))return;
        modal.renderer=mode;modal.playback={...modal.playback,...raceViewer?.snapshot()};
        render();$(`[data-action="watch-mode"][data-renderer="${mode}"]`)?.focus({preventScroll:true});return;
      }
      if(action==='watch-race'){
        const r=R.bird(state,id)?.records.find(x=>x.week===Number(target.dataset.week));
        if(!r?.replay)throw Error('この過去のレースには走行データがありません。走行記録のあるレースから観戦できます。');
        openModal({type:'replay',id,week:r.week});return;
      }
      if(action==='reset-dialog'){openModal({type:'reset'});return;}
      if(action==='reset-confirm'&&modal?.type==='reset'){state=R.initial();saveBlocked=false;modal=null;page='home';damId='';sireId='';sireTab='root';rootTrait='';sireQuery='';sireRoute='';sireSort='fee';Object.keys(sireChoices).forEach(key=>delete sireChoices[key]);notice='新しい牧場をはじめました。';birdFilter='all';notebookTab='calendar';}
      if(action==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`hanekaze-${state.week}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
      if(action==='import'){$('#import-file').click();return;}
      if(action==='import-confirm'&&modal?.type==='import'){state=R.upgradeState(modal.state);saveBlocked=false;modal=null;page='home';damId='';sireId='';sireTab='root';rootTrait='';sireQuery='';sireRoute='';sireSort='fee';Object.keys(sireChoices).forEach(key=>delete sireChoices[key]);notice='バックアップから再開しました。';}
      save();render();
      if(['buy-confirm','breed-confirm','retire-confirm','promote'].includes(action)&&state.reports.length)openModal({type:'reports'});
      if(['ack','buy-confirm','breed-confirm','reset-confirm','import-confirm','retire-confirm','promote'].includes(action))window.scrollTo({top:0});
    } catch(e){if(modal)modal.error=e.message;else notice=e.message;render();}
  });
  document.addEventListener('input',event=>{if(event.target.id==='sire-query')sireQuery=event.target.value;});
  document.addEventListener('change',async event=>{
    const el=event.target;
    try {
      if(el.dataset?.scheduleId){
        const value=el.value,plan=value==='auto'||value==='rest'?{mode:value}:value.startsWith('training:')?{mode:'training',menu:value.slice(9)}:{mode:'race',eventId:value.slice(5)};
        R.setSchedule(state,el.dataset.scheduleId,Number(el.dataset.week),plan);save();const scroll=$('.modal')?.scrollTop;render();if($('.modal'))$('.modal').scrollTop=scroll;$(`[data-schedule-id="${el.dataset.scheduleId}"][data-week="${el.dataset.week}"]`)?.focus({preventScroll:true});return;
      }
      if(el.id==='dam-choice')damId=el.value;
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
      save();render();
      if(el.id==='root-trait')$('#root-trait')?.focus();
    }catch(e){if(modal)modal.error=e.message;else notice=e.message;render();}
  });
  document.addEventListener('keydown',event=>{
    if(event.target.id==='sire-query'&&event.key==='Enter'&&!event.isComposing){event.preventDefault();sireQuery=event.target.value;render();$('#sire-query')?.focus();return;}
    const tab=event.target.closest?.('[data-action="sire-tab"]');
    if(!modal&&tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      const index=SIRE_TABS.findIndex(([key])=>key===sireTab);
      const next=event.key==='Home'?0:event.key==='End'?SIRE_TABS.length-1:(index+(event.key==='ArrowRight'?1:-1)+SIRE_TABS.length)%SIRE_TABS.length;
      sireTab=SIRE_TABS[next][0];sireId=sireChoices[sireTab]||'';render();$(`#sire-tab-${sireTab}`)?.focus();return;
    }
    if(!modal)return;
    if(event.key==='Escape'){event.preventDefault();closeModal();return;}
    if(event.key==='Tab') {
      const focusable=[...document.querySelectorAll('.modal button:not(:disabled), .modal input, .modal select, .modal summary')];
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  window.addEventListener('storage',event=>{
    if(event.key===R.SAVE_KEY){notice='別のタブで牧場が更新されました。再読み込みして続けてください。';saveBlocked=true;saveOK=false;busy=true;render();}
    else if(Array.from({length:SAVE_SLOTS},(_,i)=>slotKey(i+1)).includes(event.key)&&page==='settings')render();
  });
  window.addEventListener('pagehide',()=>{
    if(modal?.type==='replay')modal.playback={...modal.playback,...raceViewer?.snapshot()};
    viewerGeneration++;raceViewer?.dispose();raceViewer=null;
  });
  window.addEventListener('pageshow',event=>{if(event.persisted&&modal?.type==='replay')render();});
  save();render();
})();
