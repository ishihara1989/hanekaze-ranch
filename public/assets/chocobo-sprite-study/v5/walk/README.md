# パドック用の歩行スプライト

短い歩幅、低い足上げ、首を起こした穏やかな横向き歩行。448×448の8コマを4列×2行に配置し、1792×896の透過PNGとして保存。推奨6fps。

- 本体10色、額羽6色。走行と同じ60通りの合成に対応。
- 金色は白金色の反射と琥珀色・ブロンズ色の陰影で金属光沢を表現。
- 本体と額羽は同じコマ・座標・倍率で重ねる。アルファは重複しない。
- 裸の脚、足、目、くちばしは全羽色で共通。
- `body-mask.png` / `crest-mask.png` は独立した色領域。
- 親の `manifest.json` の `motions.walk` から全素材を参照できる。

原画・領域マスク・金色の質感を内蔵 `image_gen` で生成。最終版は左右の接地と振り出しを修正したv2原画を使う。プロンプトは2階層上の `PROMPTS-walk-v2.json` に保存（初稿は `PROMPTS-walk-v1.json`）。

再構築: `node tools/build_chocobo_sprites.cjs 5 walk`。
検査: `node tools/validate_chocobo_walk.cjs`。検査結果は `output/imagegen/sprite-walk-v1-validation.json`。
プレビュー: `/chocobo-sprite-preview.html?motion=walk`。
パドック: `/race-2d-preview.html`（出走羽の情報は独立した試走用牧場）。
