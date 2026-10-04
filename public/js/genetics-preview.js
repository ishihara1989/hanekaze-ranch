/* Source-only preview: no saved game, purchases or weekly simulation. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports
    ?factory(require('./ranch-engine.js'),require('./ranch-observation.js'))
    :factory(root.Ranch,root.RanchObservation);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else api.mount(document);
})(globalThis,function(R,Observation){
  'use strict';
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STAGES=Object.freeze([
    {label:'研究所なし',description:'ステータスへの遺伝効果を合算した5段階評価。',lab:0,museum:0,statue:0},
    {label:'研究所',description:'羽場・コーナー・直線・成長・羽色の遺伝と、詳しい競走情報。',lab:1,museum:0,statue:0},
    {label:'研究所＋GⅠ制覇',description:'全遺伝の座位。有利系・不利系を1座位1文字の記号列で確認できます。',lab:1,museum:0,statue:0,g1:true},
    {label:'研究所＋記念館または銅像',description:'全遺伝の数値と座位。各座位は折りたたみを開いて確認できます。',lab:1,museum:1,statue:0},
    {label:'研究所＋記念館＋銅像',description:'全情報を公開。現在ステータスの表示も確認すると、数値と伸びしろが見えます。',lab:1,museum:1,statue:1},
  ]);
  function createState(){
    const state={week:9,rng:20261002,serial:1,birds:[],facilities:Object.fromEntries(Object.keys(R.FACILITIES).map(key=>[key,0]))};
    R.refreshRoots(state);
    return state;
  }
  function view(state,bird,stage,{compare=false,showStatus=false}={}){
    const stages=compare?STAGES.map((_,index)=>index):[stage];
    return `<div class="preview-grid ${compare?'comparison':''}">${stages.map(index=>{
      const selected=STAGES[index],context={...state,milestones:{g1:selected.g1?state.week:0},facilities:{...state.facilities,lab:selected.lab,museum:selected.museum,statue:selected.statue}};
      return `<article class="paper preview-stage" data-preview-stage="${index}"><header><span class="eyebrow">STAGE ${index+1} / ${STAGES.length}</span><h2>${selected.label}</h2><p>${selected.description}</p></header>${Observation.genetics(context,bird)}${showStatus?`<div class="preview-current"><h2>現在ステータスの見え方</h2>${Observation.status(context,bird)}</div>`:''}</article>`;
    }).join('')}</div>`;
  }
  function mount(doc){
    const state=createState(),roots=state.birds,choice=doc.getElementById('root-choice'),stageChoices=doc.getElementById('stage-choices');
    let index=0,stage=0;
    choice.innerHTML=roots.map((b,i)=>`<option value="${i}">${String(i+1).padStart(2,'0')}　${esc(b.name)}</option>`).join('');
    function render(){
      const b=roots[index],compare=doc.getElementById('compare-stages').checked,showStatus=doc.getElementById('show-status').checked;
      stageChoices.innerHTML=STAGES.map((s,i)=>`<button class="button ${stage===i?'primary':'outline'}" type="button" data-stage="${i}" aria-pressed="${stage===i}"><small>${i+1}</small>${s.label}</button>`).join('');
      doc.getElementById('root-summary').innerHTML=`<h2>${esc(b.name)}</h2><p>源流 ${index+1} / ${roots.length} ・ 羽色：${R.Genetics.COLORS[b.color]} ・ 額羽：${R.Genetics.CRESTS[b.crest]}</p>`;
      doc.getElementById('preview-display').innerHTML=view(state,b,stage,{compare,showStatus});
    }
    doc.addEventListener('change',event=>{
      if(event.target.id==='root-choice')index=Number(choice.value);
      else if(!['compare-stages','show-status'].includes(event.target.id))return;
      render();
    });
    doc.addEventListener('click',event=>{
      const target=event.target.closest('[data-stage], [data-step]');if(!target)return;
      if(target.dataset.stage!==undefined){stage=Number(target.dataset.stage);doc.getElementById('compare-stages').checked=false;}
      else {index=(index+Number(target.dataset.step)+roots.length)%roots.length;choice.value=String(index);}
      render();
    });
    render();
  }
  return Object.freeze({STAGES,createState,view,mount});
});
