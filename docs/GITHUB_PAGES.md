# GitHub Pagesへの公開

`main` へのpush後、GitHub Actionsが検証・ビルド・公開を自動実行します。pushの受信直後に開始し、サイトへの反映はデプロイジョブの完了後です。標準の公開URLは **https://ishihara1989.github.io/hanekaze-ranch/** です。

## 初回だけ必要な設定

1. この変更をコミットし、GitHubの `main` ブランチへpushします。
2. [リポジトリのPages設定](https://github.com/ishihara1989/hanekaze-ranch/settings/pages)を開きます。
3. **Build and deployment → Source** を **GitHub Actions** にします。
4. [Actions](https://github.com/ishihara1989/hanekaze-ranch/actions)で **Deploy GitHub Pages** を開きます。初回pushが設定前に失敗した場合は **Re-run all jobs** で再実行するか、**Run workflow** から `main` を選んで実行します。
5. `build` と `deploy` の成功を確認し、デプロイ結果に表示されたURLを開きます。

公開元の設定とデプロイに必要な権限は[GitHub公式のカスタムワークフロー案内](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)に従っています。個人アクセストークンや独自のSecrets登録は不要です。リポジトリ側でActionsが無効な場合は、Settings → Actions → Generalで有効にしてください。

## 自動公開の流れ

設定は `.github/workflows/pages.yml` にあります。

1. `main` へのpush、または手動実行で起動します。
2. Python 3.12を用意し、静的公開用ツールのテストを実行します。
3. `python tools/build-pages.py` が `dist/pages/` にゲーム実行用ファイルを生成します。
4. 生成したファイルをPages用の成果物としてアップロードします。
5. `github-pages` 環境へデプロイします。ビルドや検証に失敗した場合はデプロイしません。

`main` 以外のブランチやPull Requestは公開の対象になりません。通常の更新ではコード・素材を修正して `main` へpushするだけです。複数のpushが続いた場合は進行中のデプロイを完了させ、待機中の実行は最新のものにまとめます。

## 公開用ファイルとパス

ゲームの起動ページは `dist/pages/index.html` です。JS・CSS・使用中の画像・2Dスプライトを含め、プレビューページ、旧UI、制作元データ、テスト、サーバーコード、セーブデータは配信しません。

GitHub Pagesのプロジェクトサイトは通常 `/hanekaze-ranch/` 配下になります。ビルド時に画像取得とモジュール読み込みのルート基準パスを相対パスへ変換するため、公開先のフォルダー名に依存せず読み込めます。元の `public/` は変更しません。

使用ファイルの収集とパス変換は `tools/lib/static_site.py` にまとめています。新しい素材カテゴリを追加した際は、同ファイルの `ASSETS`・`ASSET_PATTERNS` も確認してください。生成先を指定する場合は `--output dist/別のフォルダー` を使えます。生成先の古いファイルは毎回置き換えるため、公開用フォルダーには手作業のファイルを保存しないでください。

## ローカルで公開版を確認する

Python 3.10以上を使います。追加のパッケージは不要です。リポジトリのルートから実行してください。

```powershell
python tools/build-pages.py
python -m http.server 4174 --bind 127.0.0.1 --directory dist
```

**http://127.0.0.1:4174/pages/** を開きます。ルートではなくサブディレクトリで確認することで、画像・2D観戦のパスも確認できます。サーバーはCtrl+Cで終了します。npmが利用できる環境では `npm run build:pages` も使えます。

公開ツールのテストは次のコマンドで実行できます。

```powershell
python -m unittest discover -s tests -p '*_test.py'
```

初回公開後は新規開始、週送り、配合、画像表示、2D観戦、保存と再読み込みを確認します。ローカルとGitHub Pagesは保存先が異なります。手元の牧場を移したい場合は、設定でセーブJSONを書き出し、公開版で読み込んでください。

## 公開に失敗した場合

- `Configure Pages` で失敗する: PagesのSourceがGitHub Actionsになっているか確認し、ワークフローを再実行します。
- `deploy` が承認待ちになる: Settings → Environments → github-pagesに承認ルールがあるか確認します。承認ルールがなければ通常は自動で進みます。
- 素材不足でビルドが失敗する: Actionsのログに出たファイルがGitへ追加され、pushに含まれているか確認します。
- 更新が見えない: 対象pushの `deploy` が成功していることを確認し、ブラウザを再読み込みします。

独自ドメインを設定している場合は、デプロイ結果とPages設定に表示されるURLを使ってください。
