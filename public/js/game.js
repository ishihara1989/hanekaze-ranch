/* 羽風牧場 — dependency-free playable breeding prototype */
(() => {
'use strict';
const KEY = 'hanekaze-ranch-v1';
const M = RanchModel;
const W = RanchWorld;
const V = WorldViews;
const TRAITS = M.KEYS;
const LABELS = M.LABELS;
const COLORS = {gold:'#efc255',blue:'#8bb4bd',rose:'#dba58d'};
const COURSES = M.COURSES;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const choose = a => a[Math.floor(Math.random()*a.length)];
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const active = () => W.owned(state);
const getBird = id => state.birds.find(b=>b.id===id);
const adult = b => b.status==='racing'&&W.age(b)>=2&&W.age(b)<10;
const alleles = n => n===2?['A','A']:n===1?['A','a']:['a','a'];
const count = g => g.filter(a=>a===a.toUpperCase()).length;
function baseStats(b){return M.baseStats(b);}
function stats(b){return M.stats(b);}
function coat(g){return g.includes('B')?'gold':g.includes('C')?'blue':'rose';}
function aptitude(b){return b.genes.distance.join('')==='SS'?'短距離':b.genes.distance.join('')==='LL'?'長距離':'万能';}
function makeBird(name,sex,gen,levels,distance,color){
  return M.initialize({id:uid(),name,sex,gen,age:2,genes:{distance:[...distance],color:[...color]},condition:100,parents:[],races:0,wins:0,trainedWeek:-1,released:false},levels);
}
function initial(){return W.initial([makeBird('コハク','M',1,[2,0,1],'SS','Bb'),makeBird('ミナモ','F',1,[0,2,2],'LL','CC'),makeBird('ハヤテ','M',1,[2,1,0],'SL','Bb'),makeBird('コムギ','F',1,[1,1,2],'SL','BC'),makeBird('アオバ','M',1,[1,2,1],'LL','Cb'),makeBird('モモカ','F',1,[1,1,1],'SS','bb')],{trainerId:'apprentice'});}
function validBird(b){return M.validBird(b);}
function validState(s){return W.validState(s);}
let state,loadWarning='',startupSave=true;
try {
  const raw=localStorage.getItem(KEY);
  state=raw?W.migrate(JSON.parse(raw)):initial();
  if(raw&&JSON.parse(raw).version!==3){
    try {
      localStorage.setItem(KEY+'-before-v3',raw);
      loadWarning='年間経営版へ移行しました。旧データを予備保存し、移行準備金6,000 Gを加えています。';
    } catch {
      loadWarning='年間経営版へ移行しましたが、旧データの予備保存に失敗しました。書き出しで保存してください。';
    }
  }
} catch {
  state=initial();startupSave=false;
  loadWarning='保存データを読み込めませんでした。元データを残して仮の牧場を開きました。';
}
let page='ranch',modal=null,sire='',dam='',entrant='',course='',calendarWeek=null,marketFilter='young',viewOwner='aurora',busyWeeks=false,stopWeeks=false,tactic='steady',race=null,lastResult=null,lastFrame=0,raceFrame=0,toastTimer,saveOK=true,weekWait=null,skipWatch=false;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));saveOK=true;}catch{saveOK=false;toast('自動保存が利用できません。「遊び方」からデータを書き出してください。');}}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3500);}
function birdSVG(b,flip=false){const col=COLORS[coat(b.genes.color)];return `<svg viewBox="0 0 130 120" aria-hidden="true"><g ${flip?'transform="translate(130 0) scale(-1 1)"':''}><path d="M46 88l-5 18m9-17 8 17m-24 0h16m2 0h15" stroke="#aa7440" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M39 72C15 73 15 50 12 44c12 1 22 8 30 19L28 38c17 1 26 14 28 25" fill="${col}"/><ellipse cx="64" cy="70" rx="32" ry="25" fill="${col}"/><path d="M56 57q-14 1-13 16t26 6q12-9-13-22" fill="#fff" opacity=".23"/><path d="M74 56q-5-19 7-28t25 7q7 19-8 32" fill="${col}"/><path d="M77 29 70 16q11-3 16 10L85 10q13 4 14 16" fill="${col}"/><path d="m102 42 19 9-19 6" fill="#c7853c"/><ellipse cx="99" cy="38" rx="3.2" ry="4.3" fill="#314238"/><circle cx="100" cy="36.5" r="1" fill="white"/><path d="m76 88 4 4" stroke="#fff" stroke-width="3" opacity=".4"/></g></svg>`;}
function landscape(){return `<svg class="hero-art" viewBox="0 0 650 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><circle cx="505" cy="58" r="29" fill="#f8edbb"/><path d="M0 180Q120 68 270 158T650 117V260H0" fill="#cfdabb"/><path d="M0 230Q180 112 360 191T650 151V260H0" fill="#b6c99e"/><path d="M220 260q170-100 430-43v43" fill="#9ab482"/><g stroke="#93a679" stroke-width="5" fill="none"><path d="M374 193v36m40-49v35m40-48v36m40-48v35m40-45v33m-174-5 191-57m-187 72 187-54"/></g><g fill="#819c70"><ellipse cx="572" cy="106" rx="25" ry="41"/><ellipse cx="600" cy="91" rx="21" ry="44"/></g><path d="M574 109v61m26-75v68" stroke="#798865" stroke-width="5"/><g transform="translate(238 114) scale(.93)">${birdSVG(state.birds[0]).replace('<svg viewBox="0 0 130 120" aria-hidden="true">','').replace('</svg>','')}</g><g transform="translate(423 182) scale(.48)">${birdSVG(state.birds[1]).replace('<svg viewBox="0 0 130 120" aria-hidden="true">','').replace('</svg>','')}</g><g fill="#e9e7b6"><circle cx="357" cy="240" r="3"/><circle cx="346" cy="231" r="2"/><circle cx="553" cy="223" r="3"/><circle cx="563" cy="214" r="2"/></g></svg>`;}
function meters(b){const current=stats(b),caps=M.potential(b);return ['speed','stamina','burst','temper'].map(k=>`<div class="meter-row"><span>${LABELS[k]}</span><div class="meter"><em style="width:${caps[k]}%"></em><i style="width:${current[k]}%"></i></div><b>${current[k]}<small>/${caps[k]}</small></b></div>`).join('');}
function statTable(b){
  const current=stats(b),caps=M.potential(b),base=baseStats(b);
  return `<p class="subtext">濃いバー＝現在値 / 薄いバー＝生涯の上限。調教で上限まで伸ばせます。リーダーと闘争心は高いほど有利とは限りません。</p>${Object.entries(M.GROUPS).map(([group,label])=>`<details class="stat-group" open><summary>${label} <small>${M.DEFINITIONS.filter(d=>d.group===group).length}能力</small></summary><div class="stat-table"><div class="stat-table-head"><span>能力 / 効果</span><span>現在 / 上限</span><span>遺伝＋個体差</span></div>${M.DEFINITIONS.filter(d=>d.group===group).map(d=>`<div class="stat-detail-row"><div><strong>${d.label}</strong><p>${d.description}</p></div><div class="stat-numbers"><b>${current[d.key]}</b><span> / ${caps[d.key]}</span><div class="meter"><em style="width:${caps[d.key]}%"></em><i style="width:${current[d.key]}%"></i></div></div><div class="stat-genes"><b>${base[d.key]} ${b.talent[d.key]>=0?'+':'−'} ${Math.abs(b.talent[d.key])}</b><small>${b.genes[d.key].join('')}</small></div></div>`).join('')}</div></details>`).join('')}`;
}
function trainingPanel(b){
  const current=stats(b),caps=M.potential(b),blocked=b.trainedWeek===state.week||b.strain>=70||b.age<48||!['young','racing'].includes(b.status);
  return `<div class="detail-section"><h3>育成メニュー <span class="subtext">週に1回 / 無料</span></h3><div class="training-grid">${M.MENUS.map(menu=>{const gain=M.trainingGain(b,menu.multiplier||1),cost=M.trainingCost(b,menu),full=menu.traits.every(k=>current[k]===caps[k]);return `<button class="training-option" data-action="train" data-id="${b.id}" data-menu="${menu.key}" ${blocked||full||b.condition<cost?'disabled':''}><b>${menu.name}<span>各 +${gain}</span></b><small>${menu.key==='balanced'?'全30能力を少しずつ':menu.traits.map(k=>LABELS[k]).join('・')}</small><small>調子 −${cost} ${full?' / 上限到達':''}</small></button>`;}).join('')}</div><div class="focused-training"><label class="field-label" for="train-target">1能力を集中的に伸ばす</label><select id="train-target">${TRAITS.filter(k=>current[k]<caps[k]).map(k=>`<option value="${k}">${LABELS[k]}　${current[k]} / ${caps[k]}</option>`).join('')}</select><button class="secondary small" data-action="train-focus" data-id="${b.id}" ${blocked||TRAITS.every(k=>current[k]===caps[k])?'disabled':''}>重点調教 +${M.trainingGain(b,1.5)}</button></div><p class="subtext">${b.trainedWeek===state.week?'今週の調教は完了しました。':b.strain>=70?'脚の負担が高いため、次の週へ進んで休養してください。':'上限を超える分は切り捨てます。調教は1歳から競走引退まで。'} 重点調教の消費は対象のメニューと同じです。</p></div>`;
}
function heading(en,title,description,action=''){return `<div class="page-heading"><div><div class="eyebrow">${en}</div><h1>${title}</h1><p class="subtext">${description}</p></div>${action}</div>`;}
function card(b){return `<article class="bird-card"><div class="bird-picture ${coat(b.genes.color)}"><span class="corner">GEN. ${b.gen} / ${W.age(b)}歳 ${W.roleName(b)}</span><span class="sex">${b.sex==='M'?'牡':'牝'}</span>${birdSVG(b)}</div><div class="bird-body"><div class="bird-name">${esc(b.name)}<small>${b.races}戦${b.wins}勝</small></div><div class="bird-meta">${aptitude(b)} / ${W.className(b)} / 調子${b.condition}%</div>${meters(b)}<div class="bird-footer"><span class="tag">${b.pregnancy?'受胎中':`収得賞金 ${b.rating} G`}</span><button class="link-button" data-action="detail" data-id="${b.id}">血統・育成 ↗</button></div></div></article>`;}
function ranch(){const birds=active();return heading('YOUR LITTLE RANCH','牧場のようす',`${V.when(state.week)}。育て、走らせ、次の世代を迎える。`,`<button class="primary" data-action="week">次の週へ →</button>`)+V.dashboard(state)+V.schedule(state)+`<section class="hero"><div class="hero-copy"><span class="tag">A LIFE WITH CHOCOBOS</span><h2>季節を越えて、<br>名羽の血をつなぐ。</h2><p>新羽戦から、チョコボダービーへ。<br>6つの競合牧場とともに、競羽界の歴史を刻もう。</p><button class="primary small" data-action="nav" data-page="calendar">今週の番組を見る ↗</button></div>${landscape()}</section><div class="stats-row"><div class="stat"><div class="stat-label">所有羽 / 羽房</div><div class="stat-value">${birds.length}<small>/ ${W.CAPACITY}羽房</small></div></div><div class="stat"><div class="stat-label">競走羽</div><div class="stat-value">${birds.filter(adult).length}<small>羽</small></div></div><div class="stat"><div class="stat-label">所有羽の重賞勝利</div><div class="stat-value">${birds.reduce((n,b)=>n+b.gradedWins,0)}<small>勝</small></div></div><div class="stat"><div class="stat-label">出産予定</div><div class="stat-value">${birds.filter(b=>b.pregnancy).length}<small>羽房を予約</small></div></div></div><div class="section-heading"><h2>所有チョコボ</h2><span>幼羽 → 競走羽 → 繁殖羽</span></div><div class="grid">${birds.map(card).join('')||'<p class="empty">羽市場からチョコボを購入できます。</p>'}</div>${V.news(state)}`;}
function parentOptions(sex){return (sex==='M'?state.birds:active()).filter(b=>b.sex===sex&&W.fertile(b));}
function ensureParents(){const ms=parentOptions('M'),fs=parentOptions('F');if(!ms.some(b=>b.id===sire))sire=ms[0]?.id||'';if(!fs.some(b=>b.id===dam))dam=fs[0]?.id||'';}
function options(bs,selected){return bs.map(b=>`<option value="${b.id}" ${selected===b.id?'selected':''}>${esc(b.name)} ・ ${W.age(b)}歳 / ${b.ownerId!=='player'?esc(W.owner(state,b.ownerId)?.farm):'所有羽'}</option>`).join('');}
function pregnancyPanel(){return active().filter(b=>b.pregnancy).map(b=>`<div class="hint"><b>${esc(b.name)}が受胎中</b> / 父 ${esc(getBird(b.pregnancy.sireId)?.name)} / ${V.when(b.pregnancy.dueWeek)}出産予定（あと${b.pregnancy.dueWeek-state.week}週）</div>`).join('');}
function parentPanel(sex,id){const b=getBird(id);return `<section class="panel"><div class="eyebrow">${sex==='M'?'SIRE / 父親':'DAM / 母親'}</div><label class="field-label" for="${sex==='M'?'sire':'dam'}">${sex==='M'?'父親':'母親'}を選ぶ</label><select id="${sex==='M'?'sire':'dam'}">${options(parentOptions(sex),id)}</select>${b?`<div class="parent-art">${birdSVG(b,sex==='F')}</div><div class="bird-name">${esc(b.name)}<span class="tag">${aptitude(b)}</span></div><p class="subtext">${W.roleName(b)} / ${b.races}戦${b.wins}勝 / 本賞金${b.earnings} G${sex==='M'?` / 種付け料 ${b.ownerId==='player'?0:W.studFee(b)} G`:b.pregnancy?' / 受胎中':''}</p>${meters(b)}<p class="subtext">${b.genes.speed.join('')} / ${b.genes.stamina.join('')} / ${b.genes.temper.join('')} <span style="float:right">主要能力の遺伝子</span></p>`:''}</section>`;}
function crosses(a,b){return a.flatMap(x=>b.map(y=>[x,y]));}
function related(a,b){const ancestors=x=>new Set([x.id,...x.parents,...x.parents.flatMap(id=>getBird(id)?.parents||[])]);const aa=ancestors(a),bb=ancestors(b);return [...aa].some(id=>bb.has(id));}
function breed(){
  ensureParents();const a=getBird(sire),b=getBird(dam),breedReason=W.breedingReason(state,a,b),breedCost=200+(a?.ownerId==='player'?0:a?W.studFee(a):0);
  return heading('BREEDING LAB','配合ラボ','30の才能を継承。所有種牡羽は管理費200 Gのみ、外部種牡羽は別途種付け料。')+pregnancyPanel()+`<div class="two-col">${parentPanel('M',sire)}${parentPanel('F',dam)}</div>${a&&b?`<section class="panel predict"><div class="section-heading"><h2>次の世代の能力上限</h2><span>遺伝 × 生まれつきの個体差</span></div><div class="inheritance-rule"><div><small>♂ 個体差</small><b>−3 〜 ＋7</b></div><div><small>♀ 個体差</small><b>−3 〜 ＋3</b></div><p>遺伝基礎値 ＋ 個体差 ＝ 能力上限<br>現在値を調教で上限まで育てます。</p></div>${Object.entries(M.GROUPS).map(([g,label])=>`<details class="stat-group" open><summary>${label}</summary><div class="table-wrap"><table class="prediction-table"><thead><tr><th>能力</th><th>遺伝基礎値</th><th>♂の上限範囲</th><th>♀の上限範囲</th><th>AA確率</th></tr></thead><tbody>${M.DEFINITIONS.filter(d=>d.group===g).map(d=>{const vals=crosses(a.genes[d.key],b.genes[d.key]).map(M.geneticBase),lo=Math.min(...vals),hi=Math.max(...vals);return `<tr><td title="${d.description}">${d.label}</td><td>${lo}–${hi}</td><td>${lo-3}–${hi+7}</td><td>${lo-3}–${hi+3}</td><td>${vals.filter(n=>n===84).length*25}%</td></tr>`;}).join('')}</tbody></table></div></details>`).join('')}<p class="subtext">${distancePrediction(a,b)}。羽色：${colorPrediction(a,b)}。<br>範囲は取り得る値の最小〜最大です。遺伝基礎値は40・62・84のいずれかなので、範囲内でも生まれない数値があります。個体差は誕生時に一度だけ決定し、調教結果や親の個体差は遺伝しません。</p>${related(a,b)?'<div class="hint">共通の祖先を持つ組み合わせです。この試作品には近親配合のボーナスやペナルティはありません。</div>':''}<div class="actions"><button class="primary" data-action="breed" ${breedReason?'disabled':''}>種付けする　${breedCost} G</button><span class="subtext">第${Math.max(a.gen,b.gen)+1}世代へ / 妊娠${W.GESTATION}週 / 性別各50%</span></div>${breedReason?`<p class="subtext">${breedReason}</p>`:''}</section>`:'<div class="hint">3〜30歳の種牡羽と、所有する繁殖牝羽が必要です。競走羽は詳細から競走引退させるか、羽市場で繁殖牝羽を購入してください。</div>'}`;
}
function distancePrediction(a,b){const results=crosses(a.genes.distance,b.genes.distance);return ['短距離','万能','長距離'].map((t,i)=>`${t} ${results.filter(g=>g.filter(x=>x==='S').length===[2,1,0][i]).length*25}%`).join(' / ');}
function colorPrediction(a,b){const results=crosses(a.genes.color,b.genes.color);return [['gold','金'],['blue','青'],['rose','桃']].map(([c,n])=>[n,results.filter(g=>coat(g)===c).length*25]).filter(x=>x[1]).map(([n,p])=>`${n} ${p}%`).join(' / ');}
function trackMarkup(c){
 const path=Array.from({length:121},(_,i)=>{const p=M.trackPosition(c.distance+i*c.track.lap/120,c);return `${i?'L':'M'}${p.x*8},${p.y*3.65}`;}).join(' ')+' Z',goal=M.trackPosition(c.distance,c),start=M.trackPosition(0,c);
 return `<div class="track" id="track"><svg class="track-svg" viewBox="0 0 800 365" preserveAspectRatio="none" aria-hidden="true"><rect width="800" height="365" fill="#e3e9d8"/><path d="${path}" fill="none" stroke="#fbf8e8" stroke-width="65"/><path d="${path}" fill="none" stroke="${c.going==='heavy'?'#a2ac91':c.surface==='dirt'?'#ceb28e':c.track.color}" stroke-width="55"/><path d="${path}" fill="none" stroke="#eff0d9" stroke-width="1.2" stroke-dasharray="7 7"/><path d="M${goal.x*8} ${goal.y*3.65-34}v68" stroke="#fff" stroke-width="8"/><path d="M${goal.x*8} ${goal.y*3.65-34}v68" stroke="#355340" stroke-width="7" stroke-dasharray="5 5"/><text x="${goal.x*8}" y="${goal.y*3.65+47}" text-anchor="middle" font-size="10" fill="#435d40">GOAL</text><circle cx="${start.x*8}" cy="${start.y*3.65}" r="5" fill="#b18f43"/></svg><div class="infield"><strong>${c.track.name}</strong><span>${c.track.straight}m STRAIGHT / ${c.track.lap}m CIRCUIT</span></div><div id="racers"></div></div>`;
}
function courseFacts(c){return `<span>${c.surface==='turf'?'芝':'ダート'}</span><span>${c.going==='heavy'?'重い羽場':'良い羽場'}</span><span>${c.hill?'坂あり':'平坦'}</span><span>${c.wind?'向かい風':'風なし'}</span><span>${c.heat?'暑い':'穏やか'}</span>`;}
function racePage(){
 const events=W.calendar(state.week),bs=active().filter(adult);
 if(!bs.some(b=>b.id===entrant))entrant=bs[0]?.id||'';
 if(!events.some(e=>e.id===course))course=(events.find(e=>getBird(entrant)&&!W.eligibility(state,getBird(entrant),e))||events[0]).id;
 const c=race?.event||events.find(e=>e.id===course),reason=W.canEnter(state,getBird(entrant),c),result=W.resultFor(state,c.id);
 return heading('RACE DAY','競走観戦','羽場、隊列、直線の攻防。時計は実距離と秒速から計算します。')+`${lastResult?`<div class="result-banner"><strong>${lastResult.rank}<small style="font-size:15px">着</small></strong><div><b>${esc(lastResult.name)} / ${esc(lastResult.course)}</b><p>時計 ${W.formatTime(lastResult.time)} / 賞金・出走手当 +${lastResult.reward} G</p><p class="subtext">${esc(lastResult.note)}</p></div>${weekWait&&!race?'<button class="primary" data-action="resume-week">週送りを続ける →</button>':''}</div>`:''}<div class="race-form"><div><label class="field-label" for="entrant">出走羽</label><select id="entrant" ${race?'disabled':''}>${options(bs,entrant)}</select></div><div><label class="field-label" for="course">今週の競走</label><select id="course" ${race?'disabled':''}>${events.map(e=>`<option value="${e.id}" ${e.id===course?'selected':''}>${e.name} / ${e.distance}m${W.resultFor(state,e.id)?'［確定］':''}</option>`).join('')}</select></div><div><label class="field-label" for="tactic">作戦</label><select id="tactic" ${race?'disabled':''}>${Object.entries(M.TACTICS).map(([k,n])=>`<option value="${k}" ${tactic===k?'selected':''}>${n}</option>`).join('')}</select></div><button class="primary" data-action="race" ${race||reason?'disabled':''}>${race?'競走進行中…':`出走する / ${c.fee} G`}</button></div><div class="course-facts">${V.grade(c.level)}<span>${c.track.name}</span>${courseFacts(c)}<span>${c.minAge}〜${c.maxAge}歳${c.sex?'・牝羽':''}</span></div>${reason&&!race?`<p class="subtext entry-warning">${reason}</p>`:''}<p class="subtext" style="margin-bottom:18px">1着 ${c.purse[0]} G / 全羽の出走手当 ${c.allowance} G / ${getBird(entrant)?`調子${getBird(entrant).condition}%・脚負担${getBird(entrant).strain}`:''}</p><div class="race-layout"><section class="panel track-panel"><div class="track-header"><b>${c.name}</b><span class="live" id="race-status">${race?'LIVE RACE':result?'RESULT':'PADDOCK'}</span></div>${trackMarkup(c)}<div class="race-comment" aria-live="polite"><small>LIVE COMMENTARY</small><span id="commentary">${race?esc(race.comment):'出走条件を確認して出羽登録を。競走相手も他の羽主が所有するチョコボです。'}</span></div><div class="race-tools"><span id="race-progress">${c.distance}m / 実時計で計測</span><button class="secondary small" data-action="speed" ${race?'':'disabled'}>再生 ×${race?.speed||4}</button><button class="secondary small" data-action="skip" ${race?'':'disabled'}>結果まで進む</button></div></section><aside class="panel"><div class="section-heading"><h2>出羽表・順位</h2><span>LIVE</span></div><div id="rankings">${race?'':result?result.rows.map(r=>`<div class="rank-row"><b>${r.rank}</b><div>${esc(r.name)}<small>${esc(W.owner(state,r.ownerId)?.name)} / ${W.formatTime(r.time)}</small></div></div>`).join(''):W.field(state,c,getBird(entrant)).map((b,i)=>`<div class="rank-row"><b>${i+1}</b><div>${esc(b.name)}<small>${esc(W.owner(state,b.ownerId)?.name)} / ${b.sex==='M'?'牡':'牝'}${W.age(b)}</small></div></div>`).join('')}</div></aside></div><div class="hint">周回路は2本の直線と2つの曲線で構成。距離に応じて発走位置が変わり、ゴールまで実距離を走ります。再生速度を変えても公式時計は変わりません。同一羽は週1走、競走引退は10歳です。</div>`;
}
function records(){return V.records(state);}
function help(){return heading('FIELD GUIDE','遊び方と設定','年間48週の競羽生活。')+`<section class="panel"><h2>育成・競走・繁殖の流れ</h2><ol class="help-list"><li>0〜1歳は幼羽。1歳から調教でき、2歳で新羽戦にデビューします。</li><li>収得賞金で1勝・2勝・3勝クラスからオープンへ昇級。年間番組に固定された重賞もあります。</li><li>好成績なら4〜6歳で繁殖入り。手動では自分で引退を決め、全羽10歳までに競走引退します。</li><li>3〜30歳の繁殖牝羽に種付け。${W.GESTATION}週後に出産し、血統が次の世代へつながります。</li><li>31歳になった羽は野生へ帰ります。血統と競走成績は保存されます。</li></ol><h2>牧場経営と他の羽主</h2><p class="subtext">毎週の飼料費・維持費を、賞金・出走手当・売買・種付け料でまかないます。他の6羽主も所有羽を調教・出走・繁殖・取引させます。売却したチョコボも同じ世界で活動を続けます。資金不足時は牧場経営画面から融資・返済を行えます。週送りの経費不足は未払金になり、まとめて進行はそこで停止します。</p><h2 style="margin-top:22px">調教師と時間の進行</h2><p class="subtext">基本は「次の週へ」を押すだけで進みます。自分で調教しなかった羽は牧場スタッフ（自動運営では調教師）が調教し、出走予定の週に競走します。出走がある週は、観戦するか結果だけにするかを選べます。自動運営では調教師が4週先までの出走予定を組み、手動モードでは番組表から12週先まで予約します。月が変わると、その月の収支と羽ごとの出走結果・調教内容・来月の出走予定をまとめて表示します。「4週」「1年」も1週ずつシミュレーションし、途中で停止できます。</p><h2 style="margin-top:22px">遺伝と30能力</h2><p class="subtext">各能力は親から1つずつ遺伝子を継承。aa=40 / Aa=62 / AA=84の基礎値に、♂−3〜＋7、♀−3〜＋3の個体差を足して固定上限を決めます。現在値を調教で上限まで育成でき、調教や個体差は次世代に遺伝しません。</p><div class="guide-traits">${M.DEFINITIONS.map(d=>`<p><b>${d.label}</b><span>${d.description}</span></p>`).join('')}</div></section><section class="panel" style="margin-top:20px"><h2>牧場データ</h2><p class="subtext">操作ごとに自動保存。競走中に閉じた場合は再開時に同じ登録羽・乱数で結果を確定します。</p><div class="settings-row"><div><b>データを書き出す</b><p class="subtext">牧場・他羽主・血統・番組結果をJSONへ</p></div><button class="secondary" data-action="export">書き出す</button></div><div class="settings-row"><div><b>データを読み込む</b><p class="subtext">現在の世界全体を置き換えます</p></div><button class="secondary" data-action="import">読み込む</button><input type="file" id="import-file" accept=".json,application/json" hidden></div><div class="settings-row"><b>最初から始める</b><button class="secondary danger" data-action="reset">リセット</button></div></section>`;}
function render(){const titles={ranch:'牧場',breed:'配合ラボ',race:'競走観戦',calendar:'番組表',market:'羽市場',staff:'調教師',accounts:'牧場経営',world:'羽主・牧場',records:'競走成績',help:'遊び方'};$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">❧</span><div><strong>羽風牧場</strong><small>WING & WIND</small></div></div><div class="nav-caption">RANCH NOTEBOOK</div><nav class="nav" aria-label="メインメニュー">${[['ranch','⌂','牧場'],['breed','⚭','配合ラボ'],['race','⚑','競走観戦'],['calendar','▦','番組表'],['market','⇄','羽市場'],['staff','♧','調教師'],['accounts','◉','牧場経営'],['world','⌘','羽主・牧場'],['records','▤','競走成績'],['help','?','遊び方']].map(([id,icon,title])=>`<button data-action="nav" data-page="${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}><span class="nav-icon">${icon}</span>${title}</button>`).join('')}</nav><div class="sidebar-bottom"><span class="save-dot"></span>${saveOK?'自動保存しています':'保存には書き出しを利用'}<br>ひとつの血統、無限の可能性。<br><span style="font-size:9px;letter-spacing:1px">PROTOTYPE / v0.3</span></div></aside><main class="main"><header class="topbar"><div class="crumb">羽風牧場 <b>/　${titles[page]}</b></div><div class="wallet"><span>☀ ${V.when(state.week)}</span><span><span class="coin">◉</span><strong>${state.money.toLocaleString()}</strong> G</span></div></header><div class="content">${({ranch,breed,race:racePage,records,help,calendar:()=>V.calendar(state,calendarWeek),market:()=>V.market(state,marketFilter),staff:()=>V.staff(state),accounts:()=>V.accounts(state),world:()=>V.world(state,viewOwner)}[page])()}<footer class="footer-note"><span>HANEKAZE RANCH — 血統をつなぐ、小さな牧場。</span><span>LOCAL SAVE ・ ${saveOK?'ON':'OFF'}</span></footer></div></main></div>${modal?modalMarkup():''}${busyWeeks&&!weekWait?`<div class="simulation-progress" role="status">${V.when(state.week)}まで進行中…<button class="secondary small" data-action="stop-weeks">ここで停止</button></div>`:''}${weekWait&&!race&&modal?.type!=='race-call'&&!(page==='race'&&lastResult)?`<div class="simulation-progress" role="status">今週の出走を確認中<button class="secondary small" data-action="resume-week">週送りに戻る</button></div>`:''}`;if(page==='race'&&race)paintRace();}

function ownershipPanel(b){return `<div class="detail-section"><h3>羽主・競走実績</h3><p class="subtext">羽主：${esc(W.owner(state,b.ownerId)?.name)} / 生産：${esc(W.owner(state,b.breederId)?.farm)}<br>${W.roleName(b)} / ${W.className(b)} / 本賞金${b.earnings} G / 収得賞金${b.rating} G / 重賞${b.gradedWins}勝${b.pregnancy?`<br>出産予定 ${V.when(b.pregnancy.dueWeek)}`:''}${state.entries.filter(x=>x.birdId===b.id).map(x=>`<br>出走予定 ${V.when(x.week)} ${esc(W.eventById(x.eventId).name)}`).join('')}</p></div>${b.ownerId==='player'&&b.status!=='wild'?`${trainingPanel(b)}<div class="detail-section"><label class="field-label" for="bird-name">羽名を変更</label><div class="name-row"><input id="bird-name" value="${esc(b.name)}" maxlength="20"><button class="secondary" data-action="rename" data-id="${b.id}">変更</button></div><div class="actions">${b.status==='racing'?`<button class="secondary" data-action="retire" data-id="${b.id}">競走引退して繁殖入り</button>`:''}<button class="secondary danger" data-action="sell" data-id="${b.id}">他の羽主へ売却 / ${W.price(state,b)} G</button></div></div>`:''}`;}
function modalMarkup(){if(modal.type==='race-call')return weekWait?`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="今週の出走">${V.raceCall(state,weekWait)}</section></div>`:'';
if(modal.type==='summary')return `<div class="modal-backdrop"><section class="modal wide" role="dialog" aria-modal="true" aria-label="月のまとめ">${V.summary(state,modal.month,modal.tab)}</section></div>`;
if(modal.type==='born'){const b=getBird(modal.id);return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="幼羽が生まれました"><div class="modal-head"><h2>新しい命が生まれました</h2><button class="secondary small" data-action="close">閉じる</button></div><div class="newborn">${birdSVG(b)}<div><div class="eyebrow">WELCOME TO THE RANCH</div><b>第${b.gen}世代 ・ ${b.sex==='M'?'牡羽 ♂':'牝羽 ♀'}</b><p>${aptitude(b)}向きの一羽。<br>2歳で新羽戦へ出走できます。</p></div></div><label for="bird-name" class="field-label">この子の名前</label><div class="name-row"><input id="bird-name" maxlength="14" value="${esc(b.name)}"><button class="primary" data-action="rename" data-id="${b.id}">決定</button></div><div style="margin-top:20px">${meters(b)}</div><p class="subtext">父：${esc(getBird(b.parents[0]).name)}　母：${esc(getBird(b.parents[1]).name)}</p></section></div>`;}
const b=getBird(modal.id);if(!b)return '';return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(b.name)}の詳細"><div class="modal-head"><h2>${esc(b.name)} <small style="font-size:16px">${b.sex==='M'?'♂':'♀'}</small></h2><button class="secondary small" data-action="close">閉じる</button></div><div class="detail-intro">${birdSVG(b)}<div><span class="tag">第${b.gen}世代 ・ ${aptitude(b)} ・ ${W.age(b)}歳 ${W.roleName(b)}</span>${meters(b)}<p class="subtext">調子 ${b.condition}% ・ ${b.races}戦 ${b.wins}勝</p></div></div><div class="detail-section"><h3>30能力の現在値と上限</h3><div class="bird-vitals"><span>${W.age(b)}歳 ${b.age%48}週</span><span>脚負担 ${b.strain} / 100</span><span>維持期の目安 ${(M.peakUntil(b)/48).toFixed(1)}歳まで</span><span>距離 ${b.genes.distance.join('')} / 羽色 ${b.genes.color.join('')}</span></div>${statTable(b)}</div><div class="detail-section"><h3>父と母、そのまた親</h3><div class="pedigree">${b.parents.length?b.parents.map((id,i)=>{const p=getBird(id);return `<div><small>${i===0?'父':'母'}</small>${esc(p?.name||'不明')}<small>${p?.parents.length?p.parents.map(id=>esc(getBird(id)?.name||'不明')).join(' × '):'はじまりの血統'}</small></div>`;}).join(''):'<p class="subtext">牧場のはじまりとなる血統です。</p>'}</div></div>${ownershipPanel(b)}</section></div>`;}
function breedChild(){try{W.breed(state,sire,dam);save();render();toast(`種付けが完了しました。出産予定は${W.GESTATION}週後です。`);}catch(e){toast(e.message);}}
function raceNote(b){return `${W.className(b)} / 収得賞金${b.rating} G。次走は羽場適性と休養のバランスを見て決めましょう。`;}
function startRace(){
 if(race)return;
 try{const pending=W.prepareRace(state,course,entrant,tactic);save();race={event:pending.event,pending,time:0,speed:4,tactic,comment:'ゲートが開きました！ 各羽、順に飛び出します！',phase:0,finished:[],runners:W.makeRunners(state,pending)};lastResult=null;page='race';render();lastFrame=performance.now();raceFrame=requestAnimationFrame(frame);}catch(e){toast(e.message);}
}
function raceStep(dt){
  if(!race)return;
  race.time+=dt;const c=race.event;
  M.stepRace(race.runners,c,race.time,dt,race.tactic);
  race.finished=race.runners.filter(r=>r.finishedAt!==null).sort((a,b)=>a.finishedAt-b.finishedAt);
  const sorted=[...race.runners].sort((a,b)=>b.distance-a.distance),leader=sorted[0],progress=leader.distance/c.distance,me=race.runners[0];
  const phase=progress>.8?3:progress>.5?2:progress>.22?1:0;
  if(phase>race.phase){
    race.phase=phase;
    race.comment=phase===1?`${leader.bird.name}が先頭へ！ ${me.mode==='羽混み'?'あなたの鳥は羽混みの中。進路を探します。':'巡航速度とペース配分が試されます。'}`:phase===2?`レースは後半へ。${me.energy<40?'余力が少なくなってきました。根性で粘れるか！':'まだ余力あり。瞬発力を発揮する準備です。'}`:`最後の勝負！ ${leader.bird.name}が前へ！ スパートの加速と持続力がカギ！`;
    if(page==='race'&&$('#commentary'))$('#commentary').textContent=race.comment;
  }
  if(race.finished.length===race.runners.length)finishRace();
}
function advance(dt){if(!race)return;race.accumulator=(race.accumulator||0)+dt;while(race&&race.accumulator>=.1){race.accumulator-=.1;raceStep(.1);}}
function frame(now){if(!race)return;const dt=Math.min((now-lastFrame)/1000,.08)*race.speed;lastFrame=now;advance(dt);if(race){if(page==='race')paintRace();raceFrame=requestAnimationFrame(frame);}}
function paintRace(){if(!race||!$('#racers'))return;const c=race.event;$('#racers').innerHTML=race.runners.map(r=>{const pos=M.trackPosition(Math.min(r.distance,c.distance),c),lane=(r.index-(race.runners.length-1)/2)*1.25,x=pos.x-pos.dy*lane*.45,y=pos.y+pos.dx*lane;return `<div class="racer ${r.index===0?'player':''}" style="left:${x}%;top:${y}%">${birdSVG(r.bird,pos.dx<0)}<span class="number">${r.index+1}</span></div>`;}).join('');const sorted=[...race.runners].sort((a,b)=>a.finishedAt!==null&&b.finishedAt!==null?a.finishedAt-b.finishedAt:a.finishedAt!==null?-1:b.finishedAt!==null?1:b.distance-a.distance);$('#rankings').innerHTML=sorted.map((r,i)=>`<div class="rank-row ${r.index===0?'mine':''}"><span class="rank-num">${i+1}</span><span class="rank-swatch" style="background:${COLORS[coat(r.bird.genes.color)]}"></span><div>${esc(r.bird.name)} ${r.bird.ownerId==='player'?'〈自分〉':''}<small>${esc(W.owner(state,r.bird.ownerId)?.name)}<br>${r.finishedAt!==null?'FINISH':`残り ${Math.max(0,Math.round(c.distance-r.distance))}m ・ ${r.mode} / 余力 ${Math.round(r.energy)}%`}</small></div></div>`).join('');$('#race-progress').textContent=`${c.distance}m / 時計 ${W.formatTime(race.time)} / 自羽 ${(race.runners[0].velocity*3.6).toFixed(1)}km/h / ×${race.speed}`;}

function finishRace(){
 cancelAnimationFrame(raceFrame);const r=race,result=W.finishRace(state,r.pending,r.runners),me=result.rows.find(x=>x.ownerId==='player'),b=getBird(me.id);
 lastResult={...me,course:result.name,note:raceNote(b)};race=null;save();render();
 if(page==='race'){$('#commentary').textContent=`${result.rows[0].name}が1着でゴール！ ${me.name}は${me.rank}着、時計${W.formatTime(me.time)}。`;$('#race-status').textContent='RACE FINISHED';}else toast(`${me.name}は${me.rank}着、${me.reward} Gを獲得。`);
}
// Resolves true to settle the rest of this week's races and advance, false to stay on this week.
function raceCall(due,batch){return new Promise(resolve=>{weekWait={resolve,batch,items:due.map(({entry,event,bird})=>({birdId:bird.id,eventId:event.id,tactic:entry.tactic}))};modal={type:'race-call'};render();});}
function endWait(go){const w=weekWait;if(!w)return;weekWait=null;modal=null;w.resolve(go);}
function weekResults(week){const rows=state.history.filter(h=>h.week===week);return rows.length?` 結果：${rows.map(h=>`${h.name} ${h.rank}着`).join('、')}。`:'';}
async function progressWeeks(count){
 if(busyWeeks||race)return;busyWeeks=true;stopWeeks=false;skipWatch=false;modal=null;render();
 let done=0,notice='',month=null,raced='';
 try{for(;done<count&&!stopWeeks;){
  const due=W.dueEntries(state);
  if(due.length&&!skipWatch){save();if(!await raceCall(due,count>1)){notice='週送りを中止しました。今週の出走予定は残っています。';break;}}
  const debtBefore=state.debt,week=state.week;W.nextWeek(state);done++;course='';calendarWeek=null;raced=weekResults(week);
  if(W.monthOf(state.week)!==W.monthOf(week))month=W.monthOf(week);
  save();render();
  if(state.debt>debtBefore){notice='経費不足が発生したため進行を停止しました。牧場経営画面で収支を確認してください。';break;}
  await new Promise(resolve=>setTimeout(resolve,0));
 }}
 catch(e){notice=e.message;}
 finally{busyWeeks=false;weekWait=null;modal=month===null?null:{type:'summary',month,tab:'all'};render();toast(notice||`${done}週進みました。${V.when(state.week)}です。${count===1?raced:''}`);}
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el||el.disabled)return;const a=el.dataset.action,b=getBird(el.dataset.id);if(a==='stop-weeks'){stopWeeks=true;return;}
if(weekWait&&!race&&['watch-entry','resume-week','results-only','skip-watching','cancel-week'].includes(a)){
  if(a==='watch-entry'){const it=weekWait.items[Number(el.dataset.index)];entrant=it.birdId;course=it.eventId;tactic=it.tactic;modal=null;page='race';startRace();window.scrollTo(0,0);return;}
  if(a==='resume-week'){if(W.dueEntries(state).length){modal={type:'race-call'};render();}else endWait(true);return;}
  if(a==='skip-watching')skipWatch=true;
  endWait(a!=='cancel-week');return;
}
if(busyWeeks&&!['nav','close','detail',...(weekWait?['speed','skip']:[])].includes(a)){toast(weekWait?'今週の出走を確認してから操作してください。':'進行中です。停止してから操作してください。');return;}if(a==='nav'){page=el.dataset.page;modal=null;render();window.scrollTo(0,0);return;}if(a==='close'){modal=null;render();return;}if(a==='summary-tab'){modal.tab=el.dataset.tab;render();return;}if(a==='summary-month'){modal.month=Number(el.dataset.month);render();return;}if(a==='detail'){modal={type:'detail',id:b.id};render();return;}if(race&&!['speed','skip'].includes(a)){toast('レースが終わってから操作できます。「結果まで進む」も使えます。');return;}

if(a==='week'){progressWeeks(1);return;}
if(a==='advance-weeks'){progressWeeks(Number(el.dataset.weeks));return;}
if(a==='calendar-week'){calendarWeek=Math.max(1,Number(el.dataset.week));render();return;}
if(a==='open-summary'){modal={type:'summary',month:W.monthOf(state.week)-1,tab:'all'};render();return;}
if(a==='reserve'){try{const entry=W.reserve(state,document.querySelector(`[data-reserve-for="${el.dataset.event}"]`).value,el.dataset.event);save();render();toast(`${getBird(entry.birdId).name}の出走を${V.when(entry.week)}に予約しました。`);}catch(e){toast(e.message);}return;}
if(a==='unreserve'){W.cancelEntry(state,el.dataset.id,Number(el.dataset.week));save();render();toast('出走予定を取り消しました。');return;}
if(a==='select-event'){course=el.dataset.event;const e=W.calendar(state.week).find(e=>e.id===course);entrant=active().find(b=>!W.eligibility(state,b,e))?.id||entrant;page='race';render();window.scrollTo(0,0);return;}
if(a==='owner'){viewOwner=el.dataset.id;render();return;}
if(['buy','sell','hire','loan','repay','retire','mode','plan'].includes(a)){
 try{
  if(a==='buy')W.buy(state,b.id);
  if(a==='sell'){if(!confirm(`${b.name}を${W.price(state,b)} Gで他の羽主へ売却しますか？ 血統と戦績は残ります。`))return;W.sell(state,b.id);modal=null;}
  if(a==='retire'){if(!confirm(`${b.name}を競走引退させますか？ 競走には戻れません。3歳から種牡羽・繁殖牝羽として使えます。`))return;W.retire(state,b);}
  if(a==='hire')W.hire(state,el.dataset.id);
  if(a==='loan')W.loan(state);
  if(a==='repay')W.repay(state);
  if(a==='mode')W.setMode(state,el.dataset.mode);
  if(a==='plan')b.plan[el.dataset.field]=!b.plan[el.dataset.field];
  save();render();toast('牧場データを更新しました。');
 }catch(e){toast(e.message);}return;
}

if(a==='breed')breedChild();
if(a==='rename'){const name=$('#bird-name').value.trim();if(!name){toast('名前を入力してください。');return;}b.name=name.slice(0,20);save();modal=null;page='ranch';render();toast(`羽名を${b.name}に変更しました。`);}
if(a==='train'||a==='train-focus'){
  if(!b||b.ownerId!=='player')return;
  const target=a==='train-focus'?$('#train-target').value:el.dataset.trait;
  const menu=el.dataset.menu||(target?M.MENUS.find(m=>m.traits.includes(target))?.key:null);
  const result=W.trainBird(state,b,menu,target,'player');
  if(!result){toast('今は調教できません。調子・脚の負担・能力上限を確認してください。');return;}
  save();render();toast(`${b.name}の${Object.entries(result.gains).filter(([,n])=>n>0).map(([k,n])=>`${LABELS[k]} +${n}`).join('、')}。`);
}

if(a==='race')startRace();if(a==='speed'&&race){race.speed=({1:2,2:4,4:8,8:1})[race.speed];el.textContent=`再生 ×${race.speed}`;}if(a==='skip'&&race){while(race)advance(.05);}
if(a==='export'){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`hanekaze-week${state.week}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('牧場データを書き出しました。');}
if(a==='import')$('#import-file').click();
if(a==='reset'&&confirm('牧場の仲間・血統・戦績をすべて消して、はじめから遊びますか？')){state=initial();lastResult=null;modal=null;save();page='ranch';render();toast('新しい牧場が始まりました。');}
});
document.addEventListener('change',async e=>{if(busyWeeks||race)return;if(e.target.dataset.plan){const b=getBird(e.target.dataset.id);if(b?.ownerId==='player'&&M.MENUS.some(m=>m.key===e.target.value)){b.plan.training=e.target.value;save();}return;}if(e.target.id==='market-filter'){marketFilter=e.target.value;render();return;}if(e.target.id==='sire'){sire=e.target.value;render();}if(e.target.id==='dam'){dam=e.target.value;render();}if(e.target.id==='entrant'){entrant=e.target.value;course='';render();}if(e.target.id==='tactic')tactic=e.target.value;if(e.target.id==='course'){course=e.target.value;render();}if(e.target.id==='import-file'){const file=e.target.files[0];if(!file)return;try{if(file.size>5_000_000)throw Error();const data=W.migrate(JSON.parse(await file.text()));if(!validState(data))throw Error();if(confirm('現在の牧場を、このデータで置き換えますか？')){state=data;if(state.pendingRace)W.simulate(state,state.pendingRace);lastResult=null;modal=null;save();page='ranch';render();toast('牧場データを読み込みました。');}}catch{toast('読み込めませんでした。羽風牧場の正しいJSONデータを選んでください。');}e.target.value='';}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal&&modal.type!=='race-call'){modal=null;render();}if(e.key==='Tab'&&modal){const elements=[...document.querySelectorAll('.modal button:not(:disabled),.modal input,.modal select,.modal summary')];if(!elements.length)return;const first=elements[0],last=elements.at(-1);if(e.shiftKey&&(document.activeElement===first||!$('.modal').contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!$('.modal').contains(document.activeElement))){e.preventDefault();first.focus();}}});
if(state.pendingRace){W.simulate(state,state.pendingRace);loadWarning='中断された競走の結果を確定しました。競走成績で確認できます。';}if(startupSave)save();render();if(loadWarning)toast(loadWarning);
})();
