# チョコボ・レースモデル（試作・第2版）

提供された参考画像のシルエット・配色を参考に、Blenderのメッシュから新規制作。
原作ゲームから抽出したモデルではありません。

第2版では、追加の参考画像をもとに頭幅を約1.5倍にし、首と脚を短く、
お腹・羽先・足先を丸くしました。目は頭の曲面に沿わせ、胸と翼の付け根の継ぎ目を整理しています。
6種類のモーションと羽色変更は維持。初版のモデルと生成スクリプトは `archive-v1/` に保存しています。

## 確認する

リポジトリのルートで `node server.cjs` を実行し、
[モデルスタジオ](http://127.0.0.1:4173/chocobo-preview.html) を開きます。
回転・ズーム、6つのアニメーション、6色の羽色、再生速度・停止に対応。
Three.jsは同梱しているので、起動後のネット接続は不要です。

## ファイル

- `chocobo-racer.blend`：編集用。14ボーンのリグ、ウェイト、6アクション、撮影用スタジオ。
- `chocobo-racer.glb`：ブラウザ・ゲームエンジン用。約1.4 MB。モデルとアニメーションのみ。
- `preview-cruise.png` / `preview-spread.png`：巡航 / 全力走のBlenderレンダリング。
- `preview-idle.png`：待機姿勢。`preview-front.png` / `preview-side.png` / `preview-back.png`：形状確認用の正面・側面・背面。
- `manifest.json`：頂点・三角形数、ボーン、マテリアル、クリップ情報。
- `../../../tools/build_chocobo.py`：再生成用スクリプト（実際の場所はリポジトリ直下の `tools/`）。

## モーション

| glTF / Blenderアクション名 | 用途 | 羽 | 1周期 |
|---|---|---|---|
| Idle | ゲート待機・停止 | 閉 | 2.00秒 |
| Run_Cruise | 巡航 | 閉 | 0.80秒 |
| Run_Corner | カーブ | 開 | 0.80秒 |
| Run_Downhill | 下り坂 | 開 | 0.733秒 |
| Run_StartDash | スタート加速 | 開 | 0.60秒 |
| Run_LastSpurt | ラストスパート | 開 | 0.60秒 |

すべてその場で走るループで、移動量は含みません。スタートダッシュは発進単発動作ではなく加速中の走行ループです。
切り替えには0.2秒程度のクロスフェードを使用します。脚・羽・頭・尾が動きます。
カーブは左旋回用の傾きが入っています。右旋回は `Body` ボーンの傾きを反転させるか、右用アクションを作成してください。
坂の角度・接地の地形追従・進行方向への回転はゲーム側でモデル全体に適用します。

## 座標・色・描画負荷

BlenderはZ上、-Y前。GLBはY上、+Z前。身長は約3.1単位なので、
ゲーム側のコース単位に合わせて全体を拡縮してください。
1スキン、14ボーン、35,205三角形、12マテリアル（GLBでは12プリミティブ）。
多数の羽を描画する場合はLODやマテリアル統合を検討してください。
テクスチャ不要で、`Plumage_Gold` / `Plumage_Light` / `Plumage_Shadow` の色だけを変えて羽色を変更できます。
目・くちばし・脚・爪は独立したマテリアルです。UVテクスチャ・表情リグ・衝突形状は含みません。

## レース側への接続

現時点では専用プレビューまで実装済みで、既存の2D観戦画面への3D組み込みは未実施です。
`public/js/chocobo-animation.js` の `ChocoboAnimation.selectClip(flags)` が状態からアクション名を返します。
優先順位は待機/終了 → スパート → スタート加速 → カーブ → 下り坂 → 巡航。
既存の `trackPosition(...).corner` はカーブ判定に利用できます。
下り坂には符号付きの勾配を新しく渡してください（現在の `course.hill` は勾配方向ではありません）。
複数個体はThree.jsの `SkeletonUtils.clone` 等でスケルトンごと複製し、個体ごとの `AnimationMixer` を作ります。
個別の羽色にする場合はマテリアルも複製してください。

## Blenderで編集・再生成

`.blend` を開き、`Chocobo_Rig` を選択。Dope Sheet → Action Editorで上記のアクションを選択します。
NLAトラックは保管用としてミュートしてあり、アクション単体でプレビューします。
各アクションのフレーム範囲は1〜(周期×30+1)です。既定は巡航用の1〜25。
撮影用 `STUDIO_preview_only` コレクションはGLBには含みません。

```powershell
& 'C:\Program Files\Blender Foundation\Blender 3.2\blender.exe' --background --python tools/build_chocobo.py
node --test tests/game.test.cjs tests/model.test.cjs tests/world.test.cjs tests/chocobo.test.cjs
```

再生成すると `.blend` / `.glb` / プレビュー / manifest を上書きします。
手作業で修正した `.blend` は別名で保存してください。
