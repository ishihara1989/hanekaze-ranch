/* Game-tuned footing index: higher means firmer/more rebound, following JRA's direction. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RanchGround=api;
})(globalThis,function(){
  'use strict';
  const TRACK_CUSHION={tenku:.75,oukyu:.6,mitsurin:.35,sunahama:.15,iseki:.5,haikou:.8};
  const GOING={good:'良',yielding:'稍重',heavy:'重',bad:'不良'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function conditions(event){
    const surface=event.surface==='dirt'?'dirt':'turf',going=Object.hasOwn(GOING,event.going)?event.going:'good';
    const wet={good:0,yielding:1,heavy:2,bad:3}[going];
    const base=TRACK_CUSHION[event.trackId??event.track?.id]??.5;
    // Wet turf becomes softer; moist dirt compacts, while very wet dirt loses grip.
    const cushion=clamp(base+(surface==='turf'?-.12:.08)*wet,0,1);
    const loss=surface==='turf'?.025+.008*wet:.035+(wet===3?.03:wet===0?.015:0);
    return {surface,going,cushion,baseEfficiency:1-loss,label:label(cushion)};
  }
  const label=cushion=>cushion<.4?'低クッション（柔らかめ）':cushion>.6?'高クッション（硬め）':'中クッション（標準）';
  function efficiency(genetics,event){
    const ground=conditions(event),mean=p=>(p[0]+p[1])/2;
    const surfaceFit=mean(genetics.aptitude[ground.surface]);
    const cushionFit=(1-ground.cushion)*mean(genetics.aptitude.lowCushion)+ground.cushion*mean(genetics.aptitude.highCushion);
    return {...ground,surfaceFit,cushionFit,traction:ground.baseEfficiency*(1-.08*(1-surfaceFit))*(1-.08*(1-cushionFit))};
  }
  return {TRACK_CUSHION,GOING,conditions,efficiency,label};
});
