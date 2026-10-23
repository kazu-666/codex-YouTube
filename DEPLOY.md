# スマホ用の確認URLを作る

Render の無料 Web Service で、ブラウザ画面と採点 API を一緒に動かします。
`render.yaml` に導入・起動・稼働確認の設定が入っています。

## 既存の確認サイトを更新する

現在の対象は、固定１問・12枚の写真・４枚×３組の「残された十二枚」です。確認URLは <https://fieldnotes-atlas-preview.onrender.com/?mode=connections&v=16>。最新版は黒・灰白色・鈍い赤のUIです。問題の内容や画像版は前回のままなので、APIの版番号だけではUI更新の配信を確認できません。HTMLの `theme-color` が `#0c0b0d`、配信されたconnectionsのCSSに `--file-action:#823234` が含まれることと、生成ビルドのファイルが一致することも確認します。

`main` へ反映すると、Render側の自動デプロイ設定が有効なら更新が始まります。GitHubへのpushの成功だけで、Renderへの反映を完了扱いにしないでください。`/api/connections/state` の `version` が `kojiki-photos-v1`、`imageRevision` が `ritual-atlas-v1`、`imageUrl` が `/connections/kojiki-ritual-photos.webp` であることを確認します。`displayMode` は `photos`、`tiles` は12件、`totalGroups` は3、`maxPoints` は300、トップの題名は「残された十二枚」。実際のWebP画像も取得して照合します。

旧 `kojiki-words-v1`／文字カード、`borrowed-body-v1`／16枚／400点、または画像版が旧のままなら、まだ新しい版は配信されていません。Renderのサービス `fieldnotes-atlas-preview` で、接続ブランチが `main` であることと、最新デプロイの対象コミット・進行・ログを確認してください。自動更新が始まらない場合は **Manual Deploy → Deploy latest commit** を使います。失敗した場合はログの原因を修正して再デプロイします。クエリの `v=16` は確認リンクの識別用で、旧サーバーを新コードへ切り替える操作ではありません。

このクラウドからはGitHubの反映と、公開サイトへのHTTP確認を実行できます。現在Renderを操作する接続やAPI認証はなく、Render管理画面の実際のデプロイ状態までは直接確認できません。

## 最初にサイトを作る場合

1. コードを GitHub の `kazu-666/codex-YouTube` の `main` に反映します。
2. https://render.com/deploy?repo=https://github.com/kazu-666/codex-YouTube を開き、Render に GitHub でログインして対象リポジトリの読み取りを許可します。非公開リポジトリはログイン後に Blueprint から選択してください。
3. プランが **Free** であることを確認して Blueprint をデプロイします。完了すると Render のサービス画面に `https://...onrender.com` のURLが表示されます。そのURLをスマホで開けます。

これは公開前の体験確認用です。『古事記』の神話の要約と生成写真を使い、オンライン参照先の本文照合は未完了と表示します。黒御鬘の写真は正確な復元ではなく創作イメージです。毎日の新問・課金・広告は未導入です。HTTPヘッダーで検索エンジンへの登録を抑制します（閲覧制限ではありません）。

無料サービスは停止後の最初のアクセスで起動を待つ場合があります。回答記録は無料インスタンスの一時ファイルなので、再起動や再デプロイで失われます。継続運営には永続 DB が必要です。

環境の PORT は Render が設定します。稼働確認は GET /healthz。機能確認はトップで12枚を４枚ずつ選んで照合し、写真の拡大・正解時の図解・再読み込み後の進行・３組の解説・結果画像を開けることを確かめます。

## このクラウドから自動公開する場合

Render の接続や API 認証が必要です。キーの値をチャットへ送らず、利用する環境の安全な認証設定を使います。設定ファイルだけではデプロイの実行やURLの発行は行われません。

日本10問版は `/?round=first` と `/?round=second` で巻を直接開けます。固定問題の体験版で、全問の最終照合は未完了です。旧問題の履歴と混ざらないよう内容バージョンを分けています。

旧地図版の現場資料のSVGはリポジトリに同梱されています。現在の写真版のWebPも同梱され、Renderで画像を新たに生成する必要はありません。16枚写真版・単語版とは進行を分けています。
