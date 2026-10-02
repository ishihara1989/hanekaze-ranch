# Chocobo 2D sprite study 01

Generated with the built-in image_gen tool on 2026-10-02. The tool does not expose a model selector; no claim of using Imagen 2.5 is made.

## Base atlas

Use case: stylized-concept
Asset type: transparent 2D racing-game RUN animation sprite atlas, a polished hand-painted sprite, not a 3D render.
Primary request: A recognizable Chocobo running toward the RIGHT, seen from its left flank and slightly above, camera elevation about 22 degrees, mostly lateral with a little visible top of the back, head and beak. No rider, no tack.
Subject: one appealing athletic Chocobo, bright golden-yellow body plumage, large expressive green eye, substantial orange beak, long orange scaly legs with three clear front toes and a rear toe, fluffy thighs, layered tucked wings, a flowing feather tail. Give the forehead a distinct small backward-swept plume of three feathers attached above the beak; initially the crest is also yellow. The forehead plume is a distinct recolorable region separate from the remaining head feathers.
Style/medium: refined 2D painted JRPG race sprite, clean readable dark warm contour, broad tidy feather masses, restrained soft cel shading, crisp silhouette that remains readable at 96-160 pixels high, no pixel-art dithering, no photographic details, no 3D plastic surface.
Atlas composition: exactly EIGHT frames in an exact FOUR-column by TWO-row regular grid, ideal canvas 2048 x 1024 with square 512 x 512 cells. All eight cells have the same scale, fixed camera, center position and ground reference. Frames read left to right across the first row, then left to right across the second. Each full bird stays comfortably inside its own cell with transparent padding. No grid lines, frame borders, labels, text, shadows or background. Genuine transparent alpha.
Motion: eight distinct, evenly timed consecutive poses of ONE complete seamless in-place running stride. Near and far legs alternate naturally. Frames 1-4: near-foot forward contact, near-foot load with body lower, near-foot push-off and far-leg swing forward, airborne transition. Frames 5-8 mirror the leg phases, NOT the bird direction: far-foot forward contact, far-foot load, far-foot push-off and near-leg swing, airborne transition returning smoothly to frame 1. Both legs present in every frame, with far leg slightly darker. Small coherent body bounce, steady forward gaze, subtle tail and forehead-plume follow-through; folded wings. Feet must actually change position through the stride, never duplicate the same leg pose eight times.
Constraints: all birds face RIGHT. Exactly one bird in each cell, exactly eight birds total. Preserve identity, anatomy, apparent size, projection, head shape, beak and eye across frames. Separate readable feet, no additional legs, no cropping, no dust, no ground plane, no checkerboard baked into the image, no background color, no text, no watermark.

## Body-only blue variant

Edit target: original yellow atlas.

Use case: precise-object-edit
Asset type: transparent 2D racing-game eight-frame run sprite atlas, FOUR columns by TWO rows.
Input image 1 is the EDIT TARGET: the golden-yellow Chocobo run-cycle atlas just generated.
Primary request: recolor ONLY the body plumage from yellow to rich readable cobalt/sky BLUE across all eight frames: torso, neck, cheeks, normal head feathers, folded wings, tail and fluffy upper thighs. Use pale azure highlights and deeper navy-blue feather shadows, retaining the original 2D linework and soft cel shading.
Critical independent trait: KEEP the distinct THREE swept-back FOREHEAD CREST FEATHERS at the very top of the head GOLDEN YELLOW in every frame. Recolor the rest of the head BLUE, but this separate forehead crest remains yellow. The yellow crest's silhouette, length and position must be exactly the original.
Invariants: preserve every frame's precise running pose, legs, feet, wing silhouette, eye shape and green iris, orange beak, orange scaly legs, claws, body shape, proportions, scale, exact atlas grid/cell positions, camera angle and linework. Do not redraw or reinterpret the eight poses. No new motion, no change in anatomy, no accessories. Maintain the same image dimensions and exact FOUR-column TWO-row layout.
Background: preserve genuine transparent alpha; absolutely no colored background, no checkerboard, no shadow, no captions, no labels, no borders, no watermark.

## Crest-only rainbow variant

Edit target: original yellow atlas.

Use case: precise-object-edit
Asset type: transparent 2D racing-game eight-frame run sprite atlas, FOUR columns by TWO rows.
Input image 1 is the EDIT TARGET: the original YELLOW-body Chocobo run-cycle atlas.
Primary request: change ONLY the small swept-back FOREHEAD CREST PLUME above the beak to a clean vivid RAINBOW gradient in ALL EIGHT frames. Its three long feathers sweep backward from the forehead across the top of the head. Color these exact existing crest feathers with a smooth ordered red-orange-yellow-green-cyan-blue-violet gradient from their forehead roots to the trailing tips. Make the rainbow easy to see on the little crest even at game size, using a few broad saturated color bands and preserving feather shading.
This is an independent genetic forehead-feather color trait. All ordinary plumage on the cheeks, neck, torso, folded wings, tail and fluffy upper thighs must remain exactly the original golden YELLOW. The tail absolutely must NOT become rainbow, the main body and head must NOT become rainbow. Do not add ornaments, hairbands, horns or a new crest.
Invariants: keep the original precise crest outline, three-feather shape, length and position in every pose. Preserve every frame's precise running pose, legs, feet, wings, all linework, eye shape and green iris, orange beak, orange scaly legs, claws, body proportions and scale, exact cell positions and camera angle. Do not redraw the eight poses. Maintain the same image dimensions and exact FOUR-column TWO-row grid.
Background: preserve genuine transparent alpha. No background color, no checkerboard, no shadow, no captions, no labels, no borders, no watermark.

## Localized correction

The first rainbow edit leaked rainbow color onto frame 1's tail. The correction below was applied to that edit, and the corrected output is the retained rainbow asset.

Use case: precise-object-edit
Input image 1 is the EDIT TARGET, the yellow-body eight-frame 4x2 running Chocobo sprite atlas with rainbow FOREHEAD crests.
ONE localized correction only: In the FIRST FRAME (top-left cell), the TAIL on the FAR LEFT has accidentally acquired BLUE/GREEN/PURPLE color on two upper tail feather tips. Repaint ONLY those accidentally rainbow TAIL feather tips GOLDEN YELLOW, with matching golden highlights and brown/gold shading like all other tail feathers and like the yellow tails in the other seven cells.
Do not remove the intentional rainbow FOREHEAD plume at the TOP RIGHT of the bird in that same first frame. KEEP ALL EIGHT rainbow FOREHEAD crests completely unchanged. They are correct.
The forehead crest is beside the green eye and orange beak on the RIGHT. The tail is on the FAR LEFT, above the rear leg. The tail must be yellow.
Preserve every other pixel and every other frame: precise poses, anatomy, scale, location, linework, body yellow color, eyes, legs, alpha, exact atlas size and 4x2 arrangement. Do not redraw, change poses, add details or recolor anything else.
Keep actual transparent background; no text, grid, shadows or checkerboard.

