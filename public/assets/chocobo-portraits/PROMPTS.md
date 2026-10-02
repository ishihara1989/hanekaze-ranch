# 年齢別ポートレートの生成プロンプト

Built-in `image_gen` を使用。各原画の透過アルファを保持したままプロジェクトへコピー。
白〜灰の羽は描画時の本体色領域、成羽のマゼンタ羽は額羽領域として利用する。

## adult

Use case: stylized-concept
Asset type: transparent full-body character portrait for a Japanese Chocobo ranch game, adult age 2+.
Primary request: One adorable adult Chocobo (the familiar fantasy yellow riding bird anatomy), standing calmly in an idle pose. Three-quarter view, facing slightly to the right toward the viewer, viewed from slightly BELOW its eye level. A proud yet friendly bird, long strong bare legs, three-toed feet, fluffy round body, folded wings, feathered tail, long curved neck, large expressive dark eyes, broad orange beak, swept-back pointed head feathers. Refined hand-painted game character illustration with soft volumetric shading and clean readable silhouette, not pixel art.
Color palette: For runtime recoloring, ALL body/head/neck/wing/tail feathers are neutral WHITE with strictly neutral gray shadows (no beige/yellow/blue color cast). ONLY the small swept pointed FOREHEAD tuft above the beak is vivid saturated MAGENTA (#ec36cc), attached organically to the forehead; this is a separate inherited feather color zone. Beak and bare legs/feet remain saturated amber orange. Eyes near-black with white catchlights.
Composition/framing: one complete bird centered in a square canvas, occupies 80 percent of canvas height, entire head crest, tail and both feet visible with generous 8 percent transparent padding. Resting symmetrical stance, no stepping, no props.
Scene/backdrop: genuine transparent alpha background, no ground, no shadow, no scenery, no text, no watermark. No extra characters, no equipment. Keep magenta ONLY on the forehead tuft; other head feathers neutral white.


## yearling

Use case: stylized-concept
Asset type: transparent full-body yearling character portrait for a Japanese Chocobo ranch game.
Input images: adult reference image is a style and species reference ONLY, create a different age and camera angle.
Primary request: Age 1 year: a small juvenile Chocobo with the familiar cute Chocobo-series proportions: oversized round head, short curved neck, compact pear-shaped body, small folded wings, short fluffy feather tail, short bare legs, big kind eyes and small amber orange beak. Clearly a little bird, noticeably younger and smaller than the adult reference but more developed than a newborn chick. Three-quarter view facing slightly right, camera slightly ABOVE eye level looking gently down. Sparse soft swept head tufts the SAME NEUTRAL WHITE as its body, NO colored forehead difference.
Style/medium: match the reference's polished hand-painted game character illustration, soft volumetric feather shading, clean readable silhouette, not pixel art.
Color palette: ALL feathers neutral WHITE with neutral gray shadows for runtime recoloring, no colored casts. ONLY beak and bare legs/feet saturated amber orange. Eyes near black with white catchlights. NO magenta feathers.
Composition/framing: ONE complete bird centered, entire tuft, wings, tail and both feet visible, 10 percent transparent margin on every side; occupies 75 percent of square canvas. Calm standing idle pose with both feet planted, no stepping.
Scene/backdrop: genuinely transparent alpha background; no ground, no cast shadow, no props, text, watermark, eggshell or extra characters.

## chick

Use case: stylized-concept
Asset type: transparent full-body chick character portrait for a Japanese Chocobo ranch game.
Input images: adult reference image is a style and species reference ONLY, create a different age and camera angle.
Primary request: Age 0 years: a tiny newly hatched Chocobo chick, very babyish, round fluffy ball of down with a huge round head blending into a round little body, extremely short neck, tiny folded stubby wings, tiny tail and very short bare legs/feet. Wide curious eyes and short little amber orange beak. Clearly more infantile than a juvenile. Three-quarter view facing slightly right, camera ABOVE looking DOWN at the chick, top of head and back visible. A tiny soft head fluff tuft in the SAME NEUTRAL WHITE as the body, NO colored forehead difference.
Style/medium: match the reference's polished hand-painted game character illustration, soft volumetric feather shading, clean readable silhouette, not pixel art.
Color palette: ALL feathers neutral WHITE with neutral gray shadows for runtime recoloring, no colored casts. ONLY beak and bare legs/feet saturated amber orange. Eyes near black with white catchlights. NO magenta feathers.
Composition/framing: ONE complete bird centered, entire tuft, wings, tail and both feet visible, 10 percent transparent margin on every side; occupies 75 percent of square canvas. Calm standing idle pose with both feet planted, no stepping.
Scene/backdrop: genuinely transparent alpha background; no ground, no cast shadow, no props, text, watermark, eggshell or extra characters.

## yearlingRefinement

Use case: precise-object-edit
Edit target: yearling portrait.
Correct ONLY the age proportions and camera angle. This is a ONE YEAR OLD juvenile small Chocobo bird: make the neck MUCH shorter, almost no visible neck between head and chest; legs 40 percent shorter; round head larger relative to a compact short body. Cute classic Chocobo spin-off game bird proportions. Camera MUST move higher and look DOWN at a 25-degree angle so we clearly see the TOP of its head, back and top of the beak, NOT a view from below. Keep slightly right-facing three-quarter orientation, same hand-painted illustration style and calm pose.
Preserve neutral white/gray feathers, orange beak and bare feet, dark shiny eyes; genuine transparent alpha background and complete full-body framing with padding. NO colored forehead tuft. No scene, shadow, props, text.

## chickRefinement

Use case: precise-object-edit
Edit target: chick portrait.
Correct ONLY the newborn anatomy and camera angle. This is a NEWBORN CHICK, extremely babyish. Replace the large spiky adult head plume with THREE VERY SMALL SHORT SOFT DOWN TUFTS; round ball body, tiny nub wings and tiny feet. Camera MUST move much higher and look DOWN at a 40-degree angle so we clearly see the TOP of round head and the back, like a human looking down at a tiny baby bird. Eyes still visible on front face, face directed slightly up toward viewer. No adult neck. Keep right-facing three-quarter orientation, same hand-painted illustration style and calm standing pose.
Preserve neutral white/gray feathers, orange beak and bare feet, dark shiny eyes; genuine transparent alpha background and complete full-body framing with padding. NO colored forehead tuft. No scene, shadow, props, text.

