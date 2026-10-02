# Sprite study 03: feathered thigh / lower-leg coupling

The built-in image_gen tool edited the thigh artwork and generated the semantic mask. The existing deterministic palette build produced all 10 body and 6 crest layers from this one revised source.

## Initial thigh edit

Use case: precise-object-edit
Asset type: transparent painted Chocobo EIGHT-frame running atlas, FOUR columns by TWO rows.
Edit target: the supplied yellow run atlas. Fix the mismatch between FEATHERED THIGHS and their own BARE LOWER LEGS. Each leg is a single connected anatomical chain from pelvis → feathered upper thigh → bare scaled leg → foot. The feathered thigh must rotate and travel with THAT SAME lower leg through all eight frames, not stay in the repeated static position.
Preserve the current FOOT POSITIONS, lower-leg orange/brown identity and stride timing, and preserve the upper body, wing, back, tail, head, eye, beak, forehead plume, drawing style, camera, scale and grid.
There are exactly TWO leg pairs:
A = NEAR/foreground leg. Its feathered thigh is bright GOLDEN YELLOW and drawn in front of the other thigh. Its bare lower leg is bright ORANGE. These are always attached to EACH OTHER.
B = FAR/background leg. Its feathered thigh is darker ochre GOLD, partly occluded by the near thigh/body. Its bare lower leg is darker BROWN-ORANGE. These are always attached to EACH OTHER.
Keep the hip attachment near the same underside of the pelvis/wing in every frame. Rotate the thigh about that fixed hip toward its own knee/feather-to-skin junction. Do not attach a near fluffy thigh to the far brown leg, or a far thigh to the near orange leg.
TOP ROW frames 1–4: the FAR dark leg is the contact/push-off leg. It is forward in 1, under body in 2, back and pushing in 3, folded back in 4. Its own DARK FEATHERED THIGH follows those poses. The NEAR orange leg recovers from behind and reaches forward by 4; its own BRIGHT FEATHERED THIGH progressively swings forward.
BOTTOM ROW frames 5–8: the NEAR orange leg is the contact/push-off leg. It is forward in 5, under body in 6, back and pushing in 7, folded back in 8. Its own BRIGHT FEATHERED THIGH follows those poses. The FAR brown leg recovers from behind and reaches forward by 8; its own DARK FEATHERED THIGH swings forward.
CRITICAL corrections:
FRAME 4 = top-right cell: orange NEAR leg is stretched FORWARD toward the RIGHT. Move/rotate the large visible bright fluffy thigh FORWARD toward its orange leg junction under the front belly, connecting from the pelvis in a coherent diagonal. The brown FAR leg is folded BACK toward LEFT and must connect to its smaller shaded fluffy thigh BEHIND. The foreground bright thigh must NOT remain hanging backward while its own orange bare leg goes forward.
FRAME 8 = bottom-right cell: orange NEAR leg is folded BACK toward LEFT. Move/rotate its visible bright fluffy thigh BACKWARD toward its orange leg junction under the rear of the pelvis. The brown FAR leg extends FORWARD toward RIGHT and connects to its shaded fluffy thigh extending forward, behind the foreground thigh. Do not place the bright foreground thigh forward on the brown far leg.
Also fix any similarly mismatched thigh attachments in the other six frames so the SAME near/far feather masses have consistent identity through the whole loop. The transition 3→4→5 must carry the near thigh forward; 7→8→1 must carry that near thigh back.
A fluffy thigh may partly overlap the other leg in projection, but there must be an obvious uninterrupted matching connection under the feathers. Preserve legs' existing silhouette as far as possible; only make minimal junction adjustments if needed.
Exactly two thighs, two bare legs and two feet per bird, no third legs, no detached feather balls, no crossed anatomical attachment, no fixed duplicate thighs pasted in all frames.
Same 1774x887 canvas and exact regular 4x2 cell positions, all birds facing right, all features inside their cells. Real transparent alpha, no ground or shadows, no checkerboard, no labels, no text.

## Targeted refinement retained as the source

The first result changed the thighs too little. This second edit explicitly moved and rotated the near/far feather masses and allowed minimal lower-leg root adjustments.

Use case: precise-object-edit
Edit target: the supplied yellow 4-column 2-row Chocobo run atlas.
The last edit still left the LARGE BRIGHT FEATHERED NEAR THIGH in almost the same hanging position. Make a CLEAR, visible correction to the actual fluffy thigh masses, not just small shadow changes.
Keep upper body, head, wings, tail, forehead crest, scale, grid and 2D style unchanged. Redraw the two COMPLETE leg assemblies below the hips where necessary: feathered thigh plus attached bare leg. Preserve the existing forward/backward foot phase, but you MAY move the bare-leg roots and knee joints to make genuine anatomical connections.
Near leg = BRIGHT ORANGE bare skin + BRIGHT YELLOW visible feathered thigh; one continuous foreground limb.
Far leg = DARK BROWN bare skin + DARK OCHRE feathered thigh; one continuous background limb.
For every cell, the hip remains fixed below the wing at approximately 43% of cell width and 55% of cell height. Rotate the elongated fluffy upper thigh from this hip TOWARD the correct naked leg root. The fluffy mass must visibly tilt and change position: it cannot remain a round stationary clump below the wing.
BOLD, REQUIRED poses, per-cell coordinates:
Frame 4 (TOP RIGHT): near orange foot is reaching forward on the right. Its LARGE BRIGHT FLUFFY THIGH must be extended/tilted FORWARD (RIGHT) from the fixed hip, with the bright mass centered near 54% width, 62% height, and the orange bare leg emerging directly from its forward/lower tip. This fluffy near thigh must visibly bulge from the FRONT half of the underside of the body, in front of the shaded far thigh. The far DARK OCHRE thigh is folded BACK on the LEFT, centered near 31% width, 62% height, and continues into the brown rear-folded leg. Remove the old big bright thigh hanging BACK on the left in this cell.
Frame 8 (BOTTOM RIGHT): near orange foot is recovering folded behind toward the left. Its LARGE BRIGHT FLUFFY THIGH must tilt BACKWARD (LEFT) from the fixed hip, with the bright mass centered near 31% width, 62% height, and orange skin emerging directly from its rear/lower tip. The far DARK OCHRE thigh extends FORWARD (RIGHT) underneath the belly, centered near 54% width, 64% height, continuing directly into the brown forward-reaching leg. Remove the old large bright thigh hanging forward over the brown leg in this cell.
Apply the same coherent chain to the other six cells:
1: near bright thigh tilted BACK, far shaded thigh FORWARD.
2: near bright thigh swinging through CENTER, far shaded thigh CENTER and loading.
3: near bright thigh swinging FORWARD, far shaded thigh BACK and pushing.
4: near bright thigh FORWARD, far shaded thigh BACK.
5: near bright thigh FORWARD and contacting, far shaded thigh BACK.
6: near bright thigh CENTER and loading, far shaded thigh swinging through CENTER.
7: near bright thigh BACK and pushing, far shaded thigh FORWARD.
8: near bright thigh BACK, far shaded thigh FORWARD.
The near bright thigh must stay in front when the two thighs overlap. Never make the bright thigh feed the brown leg or the dark thigh feed the orange leg. Exactly two complete legs each cell.
Use enough visible displacement to read the difference at game size: fore vs aft thigh centers should differ by roughly 15–20% of cell width. Do not subtly repaint the same stationary fluff.
Feet stay in their existing stride phases; no extra feet, no detached parts, no change of direction, all face right. Exact same canvas dimensions 1774x887 and same 4x2 positions. True transparent alpha, no shadows, scenery, grid, numbers or text.

## Semantic mask for the revised source

Use case: precise-object-edit
Asset type: exact registered material-region mask for the supplied transparent 4-column 2-row Chocobo run atlas.
Keep the same 1774x887 canvas, exact character geometry, two newly corrected moving thigh shapes, lower-leg poses, pixel positions and all frame placement. Do not reinterpret or simplify silhouettes.
Flat categorical fills only:
PURE CYAN #00ffff = all ordinary feathered plumage: head except forehead plume, cheek, neck, torso, wing, tail, and BOTH FEATHERED UPPER THIGHS. The large bright near fluffy thigh AND the smaller DARK OCHRE far feathered thigh are both CYAN, including their feathered outlines. Although the far thigh is brownish in the illustration, it is feathered plumage, not bare leg.
PURE MAGENTA #ff00ff = the entire swept-back three-feather FOREHEAD PLUME above the eye and beak only. Keep its precise shape and position per frame. Never the tail.
PURE BLACK #000000 = whole eye and eye outline, whole beak, both BARE SCALED LOWER LEGS (bright orange and dark brown), toes, claws, all their outlines. Follow the corrected spiky feather-to-skin border, not a rectangular cutoff. Keep feathers cyan down to the exact border where scaled skin starts.
Outside the original bird silhouette: genuine transparent alpha.
No original shading, no outlines, no gradients, no scenery, no backgrounds, no text, no labels, no grid, no extra objects. This is a technical registered segmentation mask, not a new drawing. Eight cells match their source exactly.

