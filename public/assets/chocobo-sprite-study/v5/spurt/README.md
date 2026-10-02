# ラストスパートの2D走行スプライト

首を前へ低く伸ばし、翼を滑空するように後ろへ広げ、目を細めた本気の表情で走る8コマ。通常走行と同じ脚順・448×448セル・4列×2行を使用する。

本体10色と独立した額羽6色で60通り。本体を描いてから、同じコマ・座標・倍率で額羽を重ねる。金色は専用の金属光沢原画のRGBを羽領域だけに使用し、透過・くちばし・目・裸の脚・足・額羽は黄色原画から維持する。

- `body-*.png`: 本体10色（額羽を含まない）。
- `crest-*.png`: 額羽6色（黄・赤・青・白・黒・虹）。
- `body-mask.png` / `crest-mask.png`: 羽色・額羽の領域。
- `manifest.json`: コマ仕様と素材一覧。親のマニフェストにも `motions.spurt` として登録する。
- `../../run-spurt-yellow-v1.png`: 低い首と広げた翼の原画。
- `../../regions-spurt-v1.png`: 原画に対応する領域マスク。
- `../../run-spurt-golden-metallic-v1.png`: 金属光沢の原画。
- `../../PROMPTS-spurt-v1.json`: 組み込み image_gen で使用した全プロンプト。CLIは使用していない。

再構築: `node tools/build_chocobo_sprites.cjs 5 spurt`。

切り出しでは各セルの主要な連結領域だけを使い、隣のコマからはみ出した小片や孤立した画素を除く。検査: `node tools/validate_chocobo_spurt.cjs`。検査結果は `output/imagegen/sprite-spurt-v1-validation.json` に保存する。

プレビュー: `/chocobo-sprite-preview.html?motion=spurt`。通常走行との同期比較、全羽色・額羽、透明背景、停止・コマ送りに対応する。

レースでは記録の「スパート」で切り替える。残り400m以内の競り合い・羽混み・進路変更も同じ全力姿勢にする。「粘り」「余力温存」や入線後・待機・表彰・停止時は通常姿勢を使う。巻き戻しは記録から再評価する。脚の周期と物理座標・走破時計は共通の記録に従う。
