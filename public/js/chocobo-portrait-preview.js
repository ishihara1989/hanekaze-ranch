(() => {
  'use strict';
  const P=RanchPortraits,G=RanchGenetics,body=document.querySelector('#body-color'),crest=document.querySelector('#crest-color'),gallery=document.querySelector('#portraits');
  for(const [select,colors] of [[body,G.COLORS],[crest,G.CRESTS]])for(const [value,label] of Object.entries(colors)){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
  const card=(age,color,forehead,title,text='')=>`<article class="bird-card"><div class="bird-illustration ${color}">${P.markup({color,crest:forehead},age)}</div><div class="bird-card-body"><h3>${title}</h3>${text?`<p>${text}</p>`:''}</div></article>`;
  function render(){
    gallery.innerHTML=`<div class="age-grid">${[[0,'0歳 / ヒナ','正面やや左向き・丸い産毛と小さな足'],[1,'1歳 / 幼羽','正面やや左向き・小鳥の頭身'],[2,'2歳以上 / 成羽','正面やや左向き・額羽の差分']].map(([age,title,text])=>card(age,body.value,crest.value,title,text)).join('')}</div><h2>羽色の違い</h2><div class="swatch-grid">${Object.entries(G.COLORS).map(([key,label])=>card(2,key,crest.value,label)).join('')}</div><h2>成羽の額羽</h2><div class="swatch-grid">${Object.entries(G.CRESTS).map(([key,label])=>card(2,body.value,key,label)).join('')}</div>`;
    P.hydrate(gallery);
  }
  body.addEventListener('change',render);crest.addEventListener('change',render);
  document.querySelector('#motion').addEventListener('click',event=>{const paused=document.body.classList.toggle('paused');event.target.setAttribute('aria-pressed',String(paused));event.target.textContent=paused?'動きを再開':'動きを止める';});
  render();
})();
