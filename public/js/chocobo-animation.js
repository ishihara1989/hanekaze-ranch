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
  // Right-hand corners have their own clip in v3; v2 only ships the left-leaning Run_Corner.
  const RIGHT_CORNER = 'Run_Corner_R';
  function selectClip({waiting=false, finished=false, spurting=false, starting=false, corner=false, downhill=false, turn='left'} = {}) {
    if (waiting || finished) return 'Idle';
    if (spurting) return 'Run_LastSpurt';
    if (starting) return 'Run_StartDash';
    if (corner) return turn === 'right' ? RIGHT_CORNER : 'Run_Corner';
    if (downhill) return 'Run_Downhill';
    return 'Run_Cruise';
  }
  return { CLIPS, RIGHT_CORNER, selectClip };
});
