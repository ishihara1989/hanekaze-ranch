(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BalancePresets = api;
})(globalThis, function () {
  'use strict';
  const DISTANCES = Object.freeze([1200, 1600, 2000, 2400, 2800, 3200, 3600]);
  // exampleDistance is presentation/verification metadata, never an input to the physics.
  const PRESETS = [
    {id:'ember', name:'ヒバナ', color:'#bc482c', exampleDistance:1200,
      description:'高い最高速と瞬間出力。長く踏み続けると脚が先に限界へ。',
      parameters:{criticalSpeed:16, maxSpeed:24, reserveCapacity:3500, anaerobicPower:80, maxForce:10.5, cardioTau:6, legEndurance:125}},
    {id:'zephyr', name:'ハヤテ', color:'#ac710e', exampleDistance:1600,
      description:'短距離の速さを残しつつ、脚の持続を伸ばした型。',
      parameters:{criticalSpeed:16.7, maxSpeed:23.4, reserveCapacity:3600, anaerobicPower:65, maxForce:10, cardioTau:7, legEndurance:165}},
    {id:'jade', name:'ワカバ', color:'#47823d', exampleDistance:2000,
      description:'速い巡航と早めのスパートを両立する中距離型。',
      parameters:{criticalSpeed:17.4, maxSpeed:22.8, reserveCapacity:3700, anaerobicPower:55, maxForce:9.5, cardioTau:8, legEndurance:175}},
    {id:'tide', name:'アオバ', color:'#16867b', exampleDistance:2400,
      description:'巡航・容量・脚の耐久を釣り合わせたクラシック型。',
      parameters:{criticalSpeed:18.1, maxSpeed:22.2, reserveCapacity:3800, anaerobicPower:45, maxForce:9, cardioTau:9, legEndurance:178}},
    {id:'iris', name:'スミレ', color:'#4a71bb', exampleDistance:2800,
      description:'瞬間的な速さを控え、長い巡航で差をつける型。',
      parameters:{criticalSpeed:18.8, maxSpeed:21.6, reserveCapacity:3900, anaerobicPower:36, maxForce:8.5, cardioTau:10, legEndurance:190}},
    {id:'dusk', name:'キキョウ', color:'#8360ae', exampleDistance:3200,
      description:'大きな予備容量と高い脚耐久で終盤まで粘る型。',
      parameters:{criticalSpeed:19.2, maxSpeed:21, reserveCapacity:4000, anaerobicPower:30, maxForce:8, cardioTau:11, legEndurance:200}},
    {id:'snow', name:'シラユキ', color:'#a9557e', exampleDistance:3600,
      description:'最高速と放出出力は低いが、巡航と脚の耐久に優れる長距離型。',
      parameters:{criticalSpeed:19.5, maxSpeed:20.4, reserveCapacity:4100, anaerobicPower:25, maxForce:7.5, cardioTau:12, legEndurance:280}},
  ].map(p => Object.freeze({...p, parameters:Object.freeze(p.parameters)}));
  const PACING_EXAMPLE = Object.freeze({
    name:'ユウナギ', distance:2400,
    description:'巡航負荷には強いが、無酸素エネルギーを使うと脚の疲労と走行コストが増す差し型。',
    parameters:Object.freeze({criticalSpeed:18, maxSpeed:24, reserveCapacity:1200,
      anaerobicPower:60, maxForce:10, cardioTau:8, legEndurance:500,
      fatigueCost:.5, anaerobicFatigue:.6}),
  });
  return {DISTANCES, PRESETS:Object.freeze(PRESETS), PACING_EXAMPLE};
});
