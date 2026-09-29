/* Renderer-independent state selection. Explicit flags come from race physics.
 * downhill must use a signed course gradient; current course.hill is not one.
 * UMD keeps this usable both in the existing game and Node tests.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChocoboAnimation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const CLIPS = Object.freeze(['Idle','Run_Cruise','Run_Corner','Run_Downhill','Run_StartDash','Run_LastSpurt']);
  function selectClip({waiting=false, finished=false, spurting=false, starting=false, corner=false, downhill=false} = {}) {
    if (waiting || finished) return 'Idle';
    if (spurting) return 'Run_LastSpurt';
    if (starting) return 'Run_StartDash';
    if (corner) return 'Run_Corner';
    if (downhill) return 'Run_Downhill';
    return 'Run_Cruise';
  }
  return { CLIPS, selectClip };
});
