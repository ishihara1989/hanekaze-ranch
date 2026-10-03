# 2D走行スプライト・試作05

金色の羽に金属光沢を追加。翼・尾の曲面に白金色の反射帯を描き、琥珀色・ブロンズ色の深い影で通常の黄色との差を強めた。

金色の質感は組み込み `image_gen` で編集し、試作04の羽領域へRGBだけを取り込んだ。アルファ、裸の脚、足、目、くちばし、額羽は試作04と同一。金色以外の本体9色・額羽6色・領域マスクも試作04と同一。

プレビュー: `http://127.0.0.1:4184/chocobo-sprite-preview.html`。黄色と金色を同じコマ・額羽で並べて再生できる。

## 素材

- `body-golden.png`: 金属光沢の金色の本体。
- `body-*.png`: 全10色の本体。額羽を含まない。
- `crest-*.png`: 独立した額羽6色の透過差分。
- `body-mask.png` / `crest-mask.png`: 試作04と同じ領域マスク。
- `manifest.json`: 全素材名、サイズ、コマ仕様と原画参照。
- 1階層上の `run-golden-metallic-v1.png`: 金色の質感を生成した原画。
- 1階層上の `PROMPTS-golden-metallic.md`: 使用した編集プロンプト。

1792×896、4列×2行、448×448の8コマ。本体と額羽を同じコマ・座標・倍率で描く。
再構築: `node tools/build_chocobo_sprites.cjs`（既定は版5）。以前の版は引数 `2` / `3` / `4` で再構築できる。
検査結果: `output/imagegen/sprite-v5-validation.json`。

追加モーション: [ラストスパート](spurt/README.md)。低い首・滑空するように広げた翼・本気の表情の8コマを、同じ本体10色・額羽6色で用意。親の `manifest.json` の `motions.spurt` から参照する。

追加モーション: [歩行](walk/README.md)。パドック用の短い歩幅・低い足上げの8コマを、同じ本体10色・額羽6色で用意。親の `manifest.json` の `motions.walk` から参照する。

追加モーション: [表彰](podium/README.md)。正面待機からくちばしを少し開き、左右に片羽を上げて声援へ応える。片側4コマ＋完全な左右反転の8コマで、本体10色・額羽6色に対応。`motions.podium` と `frameSequence` で待機・挨拶を長めに保持する。再構築は `node tools/build_chocobo_podium.cjs`。
