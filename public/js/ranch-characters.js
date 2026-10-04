/* Source-pixel landmarks, checked against every expression. Keep these with the art. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RanchCharacters=api;
})(globalThis,function(){
  'use strict';
  // These eight variants share the same composition. Face includes eyebrows,
  // cheeks and chin; head includes the crown and the full outer hair silhouette.
  const shiroma={width:1024,height:1536,
    face:{x:290,y:395,width:480,height:385},
    head:{x:140,y:90,width:790,height:970}};
  const SHIROMA=Object.fromEntries(['neutral','talk','happy','motivated','sad','disappointed','overjoyed','ambiguous-smile']
    .map(expression=>[expression,{...shiroma,src:`assets/shiroma/shiroma-${expression}.png`}]));
  function framing(art,mode){
    if(mode==='face'){
      const r=art.face;
      // A square enclosing the face diagonal keeps cheeks inside a round avatar.
      const side=Math.hypot(r.width,r.height)*1.12;
      return {x:r.x+r.width/2-side/2,y:r.y+r.height/2-side/2,width:side,height:side};
    }
    if(mode==='head'){
      const r=art.head,padding=48;
      return {x:r.x-padding,y:r.y-padding,width:r.width+padding*2,height:r.height+padding*2};
    }
    return {x:0,y:0,width:art.width,height:art.height};
  }
  function markup(expression='talk',mode='scene'){
    const key=Object.hasOwn(SHIROMA,expression)?expression:'talk',art=SHIROMA[key],r=framing(art,mode);
    const style=`--art-width:${art.width};--art-height:${art.height};--focus-x:${r.x};--focus-y:${r.y};--focus-width:${r.width};--focus-height:${r.height}`;
    return `<span class="portrait shiroma character-portrait" data-expression="${key}" data-framing="${mode}" style="${style}"><img src="${art.src}" width="${art.width}" height="${art.height}" alt="シロマ"></span>`;
  }
  return {SHIROMA,framing,markup};
});
