# PLiCyへの公開

確認日: 2026-10-05。現在の羽風牧場は `public/` の静的ファイルだけで動作するため、Node.jsサーバーをPLiCyへ配置する必要はありません。起動ページはすでに `public/index.html` にあります。

## 1. アップロード用ZIPを作成する

Python 3.10以上が必要です。追加のPythonパッケージや `npm install` は不要です。リポジトリのルートで実行します。

```powershell
python tools/package-plicy.py
```

または、Node.jsも入っている環境では次のコマンドを使えます。

```powershell
npm run package:plicy
```

出力先は **`dist/hanekaze-ranch-plicy.zip`** です。同じ名前のZIPは作成成功時に置き換えます。以前の公開版を残す場合は名前を指定してください。

```powershell
python tools/package-plicy.py --output dist/hanekaze-ranch-plicy-v0.4.0.zip
```

対象ファイルの確認だけなら次のコマンドを使います。ファイル不足も検出します。

```powershell
python tools/package-plicy.py --list
```

ZIPの構成は次の形です。`public/` やプロジェクト名のフォルダーで包まず、起動ページをZIP直下に置きます。

```text
hanekaze-ranch-plicy.zip
├── index.html
├── css/
├── js/
├── vendor/three/       # Three.jsとその依存、MITライセンス
└── assets/            # 牧場・人物・施設・2Dスプライト・3Dモデルなど
```

スクリプトは `index.html` が参照するCSS・JS、import mapとモジュールの依存、動的に切り替えるレース観戦モジュール、実行用素材を収録します。2D素材の各羽色・額羽色・歩行・スパート・表彰も含めます。

試作・プレビューページ、旧ゲームUI、バランスラボ、Blender制作ファイル、生成プロンプト、元画像・マスク、素材ZIP、テスト、セーブデータ、`node_modules/`、`server.cjs` は含めません。

ZIP内のHTML・JSでは、`/assets/`・`/js/`・`/vendor/` で始まる参照を用途に応じた相対パスへ変換します。WebGL観戦には撮影用の `preserveDrawingBuffer: true` を付けます。`public/` の原本は変更しません。新しい素材カテゴリを導入した場合は、共通処理 `tools/lib/static_site.py` の `ASSETS`・`ASSET_PATTERNS` も確認してください。

## 2. ZIPから動作を確認する

毎回、生成したZIPを展開して確認します。展開先は空のフォルダーか新しい名前を使い、古い素材が混ざらないようにします。

```powershell
Expand-Archive -LiteralPath dist/hanekaze-ranch-plicy.zip -DestinationPath tmp/plicy-preview
python -m http.server 4174 --bind 127.0.0.1 --directory tmp/plicy-preview
```

`http://127.0.0.1:4174/` を開きます。サーバーはCtrl+Cで終了できます。`index.html` のダブルクリックではなくHTTP経由で確認してください。観戦モジュールやJSON取得にはブラウザの制約があります。

- 新規開始、初期案内、週送り、配合、施設画面、人物・ポートレート・背景画像の表示。
- レース観戦の2D・3D切り替え、背景・羽色・歩行・スパート・表彰。
- オートセーブ、手動保存、再読み込み後の再開、JSON書き出し・読み込み。
- ブラウザ開発者ツールのConsoleにエラーがなく、Networkでゲーム素材の404が出ないこと。

ローカルの既存セーブはURLが異なるため共有されません。既存の牧場で確認したい場合は、元の環境で設定からJSONを書き出し、展開版で読み込んでください。

## 3. PLiCyで登録する

1. [PLiCy](https://plicy.net/)に会員登録・ログインします。
2. 右上の「ゲーム登録」から[アップロード画面](https://plicy.net/MypageUpload)を開きます。
3. HTML5ゲームのアップロード欄で作成したZIPを選び、アップロードします。暗号化・パスワード付きZIPは使いません。
4. 変換処理が完了するまで待ちます。公式FAQではデータ量に応じて5分〜1時間程度が目安です。
5. マイページに表示される設定ボタンから、タイトル・説明・ジャンル・公開範囲など、画面に出る項目を設定します。
6. テストプレイで起動・保存・観戦・画像表示を確認し、サムネイルを撮影します。
7. 設定と撮影後の公開状態を確認し、公開URLでも動作を確認します。公式FAQではこの流れで自動公開されるため、公開範囲を確認してから設定を完了してください。

この登録から公開までの流れとZIP条件は[PLiCy公式HTML5 FAQ](https://plicy.net/ToolFAQ/HTML5)を参照しています。実際の画面の項目名や条件が変わっている場合は、アップロード画面の案内を優先してください。

## このゲームで先に確認する点

**`index.html`だけではPLiCyへの適合は確定しません。** [公式HTML5 FAQ](https://plicy.net/ToolFAQ/HTML5)には、JSの同梱、起動ページを `index.html` にすることに加え、ゲーム画面をCanvasで出力することが記載されています。WebGLでは `preserveDrawingBuffer: true` が撮影に必要です。

羽風牧場のメインUIはHTML/CSSで、Canvasはレース観戦中に生成されます。そのため、現在のZIPでPLiCyの処理・プレイ画面・サムネイル撮影まで正常に使えるかは実機確認が必要です。レース観戦中に撮影するとCanvasは存在しますが、牧場UIや実況字幕などCanvas外の要素まで写るとは限りません。撮影や登録が通らない場合は[PLiCyのお問い合わせ](https://plicy.net/InfoConnection)でHTML主体のゲームの扱いを確認してください。このスクリプトは画面全体をCanvas化するものではありません。

ゲームが使うES modules・import map・JSON取得・WebP画像・GLBモデルと、IndexedDBによる保存についても、PLiCyの変換後の環境で確認してください。ローカルHTTPで動いても、アップロード後の動作を保証するものではありません。

## 更新するとき

修正版のZIPを同じコマンドで作成し、既存ゲームのマイページからアップデートします。登録画面に差分更新と全体更新がある場合、このスクリプトが作るものは全体版ZIPなので、削除したファイルも反映できる全体更新を選びます。

プレイヤー向けには、更新前に設定からセーブJSONを書き出す方法を案内しておくと、保存先が変わった場合にも移行できます。アップロードしたZIPは手元にも保管してください。
