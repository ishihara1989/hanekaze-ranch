# シロマの立ち絵素材

内蔵 image_gen による画像生成で制作。全画像 1024 × 1536 px、RGBA PNG（背景透過）。
同じ基準画像を編集し、衣装・構図を揃えた表情差分です。

| ファイル | 表情 |
|---|---|
| shiroma-neutral.png | 通常（口閉じ） |
| shiroma-talk.png | 会話（口開き） |
| shiroma-happy.png | 喜び |
| shiroma-disappointed.png | 残念 |
| shiroma-sad.png | 悲しい |
| shiroma-motivated.png | やる気 |
| shiroma-overjoyed.png | 大喜び |
| shiroma-ambiguous-smile.png | 曖昧な笑顔（下がり眉） |

preview.html をブラウザで開くと、背景を切り替えながら8枚を確認できます。
会話用の口開閉は neutral と talk を同じ表示サイズで切り替えてください。
生成画像のため、差分間に微細な描画差がある場合があります。
顔・頭の範囲（元画像のピクセル座標）は `public/js/ranch-characters.js` に保存しています。
全8表情を目視確認し、共通の顔範囲（眉・頬・顎）と頭範囲（頭頂・髪の外周）を使用しています。
報告欄では頭範囲と余白を枠内に収め、丸いアイコンでは顔範囲を円内に収めます。
画像や構図を差し替える際は、その表情の画像寸法・顔範囲・頭範囲も更新してください。
v4の新UIでは、チュートリアル・週次月次年次報告・達成イベント・チョコボの所感に組み込んでいます。

使用したプロンプトは prompts.json と prompts-additions.json に保存しています。
