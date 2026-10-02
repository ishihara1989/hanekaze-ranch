// A detached ranch produces ordinary recorded races; this page never saves.
const R=globalThis.Ranch,Replay=globalThis.RaceReplay,root=document.querySelector('.race-viewer');
const tracks=globalThis.RanchWorld.TRACKS,state=R.initial(),baseEvent={week:state.week,distance:2400,level:'open',minAge:2,maxAge:9};
const birds=[R.own(state)[0],...R.worldRoster(state,{...baseEvent,trackId:'tenku',surface:'turf'})].slice(0,12);
const colors=['golden','blue','red','white','green','black','rose','purple','yellow','gray'];
birds.forEach((b,i)=>{b.color=colors[i%colors.length];b.crest=['yellow','blue','red','white','black','rainbow'][i%6];});
const records=new Map(),select=root.querySelector('[data-viewer-focus]'),courseSelect=root.querySelector('[data-preview-course]');
birds.forEach((r,i)=>{const option=document.createElement('option');option.value=r.id;option.textContent=`${i+1}番 ${r.name}`;option.selected=i===0;select.append(option);});
const query=new URLSearchParams(location.search),requested=query.get('track');
if(Object.hasOwn(tracks,requested))courseSelect.value=requested;
const pitchLabel=document.createElement('label');pitchLabel.className='preview-pitch';pitchLabel.append('描画ピッチ');
const pitchSelect=document.createElement('select');pitchSelect.dataset.viewerPitch='';pitchSelect.dataset.needsViewer='';pitchSelect.disabled=true;pitchSelect.setAttribute('aria-label','描画ピッチ');
for(const [value,text] of [[1,'1×（基準）'],[1.5,'1.5×（中間）'],[2,'2×（標準）']]){const option=document.createElement('option');option.value=value;option.textContent=text;option.selected=value===2;pitchSelect.append(option);}
pitchLabel.append(pitchSelect);root.querySelector('[data-viewer-focus]').closest('label').before(pitchLabel);
function recording(track){
  if(records.has(track.id))return records.get(track.id);
  const event={...baseEvent,trackId:track.id,name:`${track.name} 2D試走`,surface:track.surface,hill:track.hill},
    runs=R.simulateField(state,birds,event,true).sort((a,b)=>Number(b.finished)-Number(a.finished)||(a.finished?a.time-b.time:b.state.distance-a.state.distance)),own=runs.find(r=>r.player),
    record={...event,birdId:own.id,rank:runs.indexOf(own)+1,time:own.time,finished:own.finished,
      field:runs.map(({id,name,time,finished})=>({id,name,time,finished})),replay:Replay.capture(runs,event)};
  records.set(track.id,record);return record;
}
let viewer,renderer='2d',generation=0;
async function show(){
  const token=++generation,source=tracks[courseSelect.value],record=recording(source),
    options={...viewer?.snapshot(),time:Math.min(viewer?.time??(query.get('phase')==='race'?Replay.timeline(record).race+10:0),Replay.timeline(record).end),pitch:Number(pitchSelect.value)};
  viewer?.dispose();viewer=null;
  document.title=`${source.name} — 2Dレース試走`;
  document.querySelector('[data-preview-title]').textContent={tenku:'雲の上を、駆ける。',oukyu:'城下を、駆ける。',sunahama:'潮風の中を、駆ける。',haikou:'山あいを、駆ける。',mitsurin:'緑の深みを、駆ける。',iseki:'古の景色を、駆ける。'}[source.id];
  document.querySelector('[data-preview-description]').textContent=`${source.name} · ${source.surface==='dirt'?'ダート':'芝'} 2,400m · 外側からのレース観戦`;
  root.setAttribute('aria-label',`${source.name}の試走`);
  const status=root.querySelector('.race-loading');status.hidden=false;status.textContent='競走場とチョコボを準備しています…';
  root.querySelectorAll('[data-needs-viewer]').forEach(el=>el.disabled=true);
  root.querySelector('.race-sections').hidden=renderer!=='2d';pitchLabel.hidden=renderer!=='2d';
  root.querySelectorAll('[data-preview-renderer]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.previewRenderer===renderer)));
  const direction=root.querySelector('[data-preview-direction]'),standardRight=source.theme.includes('右回り'),
    right=direction.value==='auto'?standardRight:direction.value==='right',track={...source,theme:`${source.surface==='dirt'?'ダート':'芝'}・${right?'右回り':'左回り'}`};
  direction.querySelector('[value="auto"]').textContent=`標準：${standardRight?'右回り ←':'左回り →'}`;
  try{
    const module=await import(renderer==='2d'?'./race-viewer-2d.js':'./race-viewer.js');if(token!==generation)return;
    viewer=module.mount(root,record,track,options);
  }catch(error){if(token===generation){console.error(error);status.textContent='観戦を読み込めませんでした。ページを再読み込みしてください。';}}
}
root.querySelectorAll('[data-preview-renderer]').forEach(button=>button.addEventListener('click',()=>{renderer=button.dataset.previewRenderer;show();}));
root.querySelector('[data-preview-direction]').addEventListener('change',show);
courseSelect.addEventListener('change',()=>{root.querySelector('[data-preview-direction]').value='auto';show();});
window.addEventListener('pagehide',()=>{generation++;viewer?.dispose();});
show();
