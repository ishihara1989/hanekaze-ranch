# Facility card backgrounds

31 illustrations for 12 ranch facilities, generated with the built-in `image_gen.imagegen` tool. Exact prompts are assembled from the common prompt, subject and level instruction in `prompts-v1.json`.

- Stalls: levels 1-4.
- Course, hill, pool, spa, clinic, meadow, forest, shop: levels 1-3.
- Lab, statue, museum: one completed illustration each.

The UI uses `/assets/facilities/{key}-lv{level}-v1.webp` for constructed facilities. Initial stalls and meadow use level 1 immediately. Unbuilt and locked facilities keep their existing paper cards. Legacy lab levels 2 and 3 use the completed level-1 artwork.

WebP assets have a maximum size of 960 x 640 at quality 86. Generated PNG copies are intermediate files; original PNGs remain in the Codex generated-images directory. No save-state or economy changes are required.
