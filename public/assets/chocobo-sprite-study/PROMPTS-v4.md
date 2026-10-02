# Sprite study 04: frame 4 thigh forward placement

The built-in image_gen tool edited the existing version 3 sheet and generated its semantic mask. All body and crest variants use the same revised source.

## Frame 4 correction

Edit the supplied existing 8-frame running sprite sheet with one precise local correction. Preserve the same painted Chocobo, right-facing slightly elevated side view, transparent background, image dimensions, 4-column by 2-row layout, and frame alignment. Preserve frames 1, 2, 3, 5, 6, 7, and 8 unchanged. Preserve frame 4 head, torso, wings, tail, feet, bare leg colors and poses unchanged.
ONLY in FRAME 4 (top row, rightmost cell): move the bright golden fluffy foreground THIGH FEATHER MASS farther FORWARD toward the right, matching the forward placement of the bright foreground thigh in FRAME 5 (bottom row, leftmost cell). The orange foreground leg already extends forward toward the right; its golden feathered upper thigh must visibly follow it. Shift the rounded fluffy thigh approximately 30 pixels to the right in the original sheet, with its lower front tuft meeting the upper end of the forward orange leg. The result must have a clear forward bulging thigh under the front/right edge of the belly, like frame 5. Remove/repaint the old central/backward thigh bulge so there is exactly one foreground thigh. Keep its golden feather color, fluff, volume, texture and natural hip attachment. Keep the shaded ochre far-side thigh attached to the darker far-side leg folded backward toward the left. No swapping legs, no extra limbs, no new colors, no labels, no border, no shadows on the transparent ground. This is a small local anatomical correction only, not a redesign.

## Registered semantic mask

Produce an exact registered semantic material mask of this supplied 8-frame Chocobo sprite sheet, with the SAME canvas dimensions, 4 columns by 2 rows, same poses, same contours and pixel positions. Preserve especially the corrected FORWARD golden foreground feathered thigh in frame 4 (top-right); do not move, redraw or invent any anatomy.
Replace the colors with flat categorical fills only:
PURE CYAN #00ffff: ALL ordinary feathered plumage, including head, cheek, neck, belly, back, wings, tail, and BOTH feathered upper thighs. The bright foreground fluffy thigh and darker brownish/ochre FAR feathered thigh are BOTH cyan. Far thigh feathers are plumage, NOT bare scaled skin. Follow their spiky feather-to-skin boundaries.
PURE MAGENTA #ff00ff: ONLY the swept-back forehead plume above the eye in each frame. Precisely match its three feather contour and attachment. Not tail or thigh.
PURE BLACK #000000: eye including outline, entire beak, BOTH bare scaled lower legs, toes and claws, including outlines, stopping exactly at the feather-to-skin border.
Outside the original bird silhouettes retain genuine transparent alpha. No original shading, no painted details, no outlines, no gradients, no scene, no text, no grid. This is a technical registered segmentation map, not a new drawing. All eight silhouettes must exactly match the source.

