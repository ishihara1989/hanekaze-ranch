# Sprite study 02: motion correction and reusable color layers

Built-in image_gen edited the running art and generated a semantic material mask. A deterministic build then made the 10 body layers and 6 crest layers from the same corrected source, using the existing game's palette.

## Correct the run cycle

Use case: precise-object-edit
Asset type: 2D painted Chocobo running animation atlas, exactly FOUR columns by TWO rows, EIGHT ordered frames.
Edit target: the supplied yellow Chocobo sprite atlas. Correct ONLY the running LEGS and feet and very slight pelvis bounce; preserve the beloved existing upper-body art, head, golden forehead plume, green eyes, yellow feather shapes, orange beak, wings, tail, camera, frame scale and fixed grid positions.
The existing sheet incorrectly repeats the same leading leg in both rows. Fix this to ONE complete alternating left/right run stride, with a clear opposite leg leading in frame 1 versus frame 5.
ANATOMICAL LEG IDENTITY MUST BE CONSISTENT: we see the LEFT flank. The LEFT leg is NEAR the camera, brighter ORANGE, drawn in FRONT when legs overlap. The RIGHT leg is FAR from the camera, darker BROWN-ORANGE, drawn BEHIND when legs overlap. Keep both identities through all 8 frames. Both legs attach beneath the two thighs correctly.
Motion in place toward RIGHT. Forward means foot to the RIGHT of the pelvis; backward means foot to its LEFT.
TOP ROW:
Frame 1: RIGHT/FAR DARK leg extended FORWARD to the RIGHT, making forward foot contact; LEFT/NEAR ORANGE leg stretched BACK behind the pelvis, just leaving ground.
Frame 2: RIGHT/FAR DARK foot is planted closer UNDER the pelvis as body passes over it; the LEFT/NEAR ORANGE knee folds to swing forward off ground.
Frame 3: RIGHT/FAR DARK leg planted BEHIND the pelvis, toe pushes off to the LEFT; LEFT/NEAR ORANGE knee/foot swing FORWARD on the RIGHT.
Frame 4: short aerial phase: RIGHT/FAR DARK leg folded behind after push-off; LEFT/NEAR ORANGE leg reaches forward to the RIGHT for next contact.
BOTTOM ROW, opposite stance leg, DO NOT repeat the top-row leg roles:
Frame 5: LEFT/NEAR BRIGHT ORANGE leg extended FORWARD to the RIGHT, making forward contact; RIGHT/FAR DARK leg stretched BACK toward LEFT, just leaving ground.
Frame 6: LEFT/NEAR ORANGE foot planted nearer UNDER the pelvis, taking weight; RIGHT/FAR DARK knee folds and swings forward in the air.
Frame 7: LEFT/NEAR ORANGE foot planted BEHIND the pelvis toward LEFT, toes pushing off; RIGHT/FAR DARK knee/foot lifted swinging FORWARD on the RIGHT.
Frame 8: aerial phase: LEFT/NEAR ORANGE leg folded behind after push-off; RIGHT/FAR DARK leg reaches forward RIGHT, ready to return smoothly to frame 1.
The leading planted foot moves monotonically backward relative to the body through frames 1→2→3 and 5→6→7. Each row must have CLEAR forward-contact / under-body weight / backward toe-off / flight phases. Both legs must be clearly distinguishable. No third leg, no fused feet, no leg swapping within a row.
Preserve the soft painted 2D illustration style and original orange scaled legs/claws. All birds face right. Same full atlas size and grid, transparent padding, exactly one whole bird per cell, no clipping.
True transparent alpha, no ground shadows, no checkerboard, no scenery, no lines, no labels or text.

## Semantic body / crest mask

Use case: precise-object-edit
Asset type: exact registered SEMANTIC REGION MASK for a 2D Chocobo sprite atlas, not new artwork.
Edit target: supplied 4-column 2-row corrected Chocobo run atlas.
Create ONE flat-color segmentation atlas on the EXACT SAME CANVAS and EXACT SAME pixel positions. Do not redraw the character or alter geometry. Preserve the precise silhouette, poses, size and cell positions.
Fill the existing areas using only these three categorical colors, no linework or shading:
1. PURE CYAN (#00ffff): ALL normal body PLUMAGE, torso, neck, cheeks, normal head feathers, wings, whole tail, and fluffy feathered upper thighs. Include the shadowed feathers and normal feather contour inside this region.
2. PURE MAGENTA (#ff00ff): ONLY the swept-back FOREHEAD PLUME / CREST feathers atop the head above the eye and beak, including ALL THREE feathers, their shading and outline area. Precisely follow the existing full forehead-plume outline. Never mark any tail feathers magenta.
3. PURE BLACK (#000000): the eye including green iris/white/pupil and outline, orange beak including all outline, all bare scaly orange/brown LEGS, toes, claws including their outlines. These parts must be excluded from recoloring.
Everything outside the existing sprites must be genuine TRANSPARENT alpha.
Do not add captions, numbers, grid lines, padding, a color key, outlines, smoothing blur, background, new poses, new feathers, missing areas or gradients. This is a technical categorical material mask for registering to the reference, NOT a new illustration. All eight cells at identical positions; exactly 4 columns x2 rows.

