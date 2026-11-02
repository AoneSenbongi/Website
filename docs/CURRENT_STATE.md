# 現在の状態

更新: 2026-11-02 JST

## 目的
Blogに加えて日記も管理画面から投稿できるようにする。日記にもいいね・コメント・通知を付け、本人コメントは認証に基づくバッジで識別する。説明文を減らして記事・日記・管理画面をデザインし直す。公開は内容確認後。

直近の依頼は、日記のコメント入力欄の折りたたみ、日付の重複と見出しドットの削除、写真の暗さの調整、およびBlogのデザイン評価。Blogの一覧や記事冒頭の大きな再設計はまだ行っていない。

## 作業場所
`E:/prog/worktrees/website-blog-interactions-20261022`、ブランチ `feature/blog-interactions-20261022`。基点5339553。主チェックアウトの未公開変更には触れない。

## 決定
仕様はBLOG_DYNAMIC.md。Workers + D1 + R2、管理者はAccess JWT検証、読者はCookie識別。コメント承認制、通知はメール確認制。今回の日記は日付ごとに同じ保存基盤で管理し、以前のローカルデータは自動移行しない。

## 現在
日記用migration 0002と、日記の投稿・公開・反応・本人バッジを実装済み。記事・日記・管理画面を落ち着いた色と文字組みに変更し、説明文を削減した。管理画面は記事／日記／コメントのタブ式。不要になった旧静的日記の3ファイルは削除し、Workerで配信する。

2026-10-22にセキュリティ・主要機能試験29件、今回の表示回帰試験3件、既存試験6件、合計38件が成功。Workerのdry-runビルド、ローカルD1のmigration 0002適用が成功。依存は追加していない（前回監査の報告0件）。

記事・日記共通のコメントフォームを閉じたdetailsへ移し、返信操作で自動展開する。匿名認証は初回展開時のみ読み込む。日記は日付を1回表示し、ほかの日記はアーカイブにまとめた。見出しのドットと説明文を除き、写真の暗幕を文字のある範囲だけに限定した。Edgeで初期折りたたみ、遅延読み込み、返信時のフォーカス、キャンセル、キーボード、入力保持、PC/390px/暗色を確認。コメント投稿・承認・返信・通知解除の回帰試験も成功。`.local/review/reading-result.json` と画像に記録。

Edgeで日記の下書き・公開・写真・音楽、いいね保持、認証済み本人の公開フォームからのコメントとバッジを確認。PC幅・390px・ダークモードで表示確認済み。記事とコメント・メール確認・通知解除の回帰試験も新UIで成功。外部Turnstileの読込が不安定だったため、回帰試験ではウィジェットだけをfixtureに置換した。サーバー側Siteverifyは公式テストsecretで実行。本番コードに認証省略はない。読み込み失敗時の再試行と本文保持もブラウザーで確認。詳細はSECURITY_VERIFICATION.md。

試作URLは `http://127.0.0.1:4196/__preview/`、日記は `/diary/`。`npm run dev` で再起動できる。確認用記事は従来の `/blog/local-review-1792631459677/`、日記の表示例は `/diary/2026-10-21/`。追加試験用の記事はローカルDBのバックアップ後に削除した。以前のローカル執筆データには触れていない。画像と試験結果は `.local/review/`。ローカルWorker検証用4197は終了済み。

本番のサービス設定・公開操作はしていない。ローカルの管理認証はローカル生成RSA鍵を使い、メールは確認用受信箱へ保存する。本番用Workerにはローカル認証の回避処理を入れていない。

## 残作業
ユーザーによる新しいデザインと日記の試作確認。本番Access/Turnstile/D1/R2/メール設定、Cloudflareのビルド設定との接続、本番検証は未実施。外部Turnstileの実ウィジェットと本番キーでの接続確認も残る。管理者メール、Accessアプリ、D1のID、Turnstile本番キー、メール配信元等は未確定。公開前にユーザーの確認が必要。

## 現在の依頼と今回の検証

本人がCodexへ毎回依頼せず、Blog・日記をワンクリックで公開できるようにする（2026-11-01の明示依頼）。管理画面の公開確認ダイアログを除き、「公開」1回で未保存内容を含めて保存・公開する。公開後の更新も同じ操作。初回の仕組みの本番反映は具体的な候補への確認が必要。日々の投稿は本人の管理画面操作で完結する。

Edgeの実ブラウザー試験でBlog・日記の下書き404、追加ダイアログなしの公開、未保存編集の反映、公開後更新、未認証読者の閲覧を確認。既存試験38件とWorker dry-runが成功。試験は4198、専用DB `.local/publish-check` を使用し、従来の下書きは変更していない。手順はPUBLISHING.md、試験は `npm run test:publish`。

Wranglerの権限更新とCloudflare MCP認証が完了。MCP whoamiで本人アカウントを確認。Cloudflare公式スキル19件を `.agents/skills` へ導入し、MCPをCodexの設定に登録済み。

2026-11-02 JSTにCloudflare APIで本番構成を確認。公開ドメインはPagesプロジェクト `website`（`website-575.pages.dev`）に接続。GitHub `AoneSenbongi/Website` のmainを自動デプロイし、現在のbuild_commandとdestination_dirは空。DNSのapex CNAMEもPagesを指す。別途Worker `website` は存在するが、Worker routesとcustom domainsは空。既存Pages連携を維持し、Pages advanced modeのentryとビルドを実装済み。wrangler.jsoncもPages用に変更し、previewには本番DB/R2を継承しない。承認後にPagesのbuild_commandを `npm run build`、destination_dirを `dist` に切り替えてmainへ反映する。

本人がR2とZero Trustの初回登録を完了。D1 `yamachika-blog`（3cf63f07-fbe4-4883-9f90-b28274909f21）、R2 `yamachika-blog-photos`、Turnstile `Website comments` を作成し、D1 migration 0001/0002を本番へ適用済み（新規空DB）。Access app c02fa3e7-d527-4f34-96f2-9924b7baab46で `/admin` と `/api/admin` 以下を保護。既存Cloudflare IdPを使い、本人のメールだけを許可する再利用可能ポリシーを関連付けた。Pages productionのSESSION_SECRET・MAIL_ENCRYPTION_KEY・TURNSTILE_SECRETを生成・登録済みで、値は出力していない。サイト本体のデプロイ・pushは未実施。

本番接続向けの検証は40試験成功、Pages bundleのビルド・構文確認成功。Wrangler Pages devのローカルD1/R2環境でHome/Blog/日記200、未認証管理API/管理画面401、非公開ファイル404を確認。実ブラウザーで記事と日記のワンクリック公開・更新・下書き非公開を再確認。npm audit fixでWranglerを4.156.1へ更新し、監査0件。レビュー画像は `.local/review/publish-*.png`。メール通知は送信元未設定のため初回公開では無効。Pagesの期限切れ記録削除はアクセス契機・インスタンスごと10分間隔に実装。旧ローカル下書きは自動移行していない。

2026-11-02 JST、ユーザーが公開候補07dc3baを「いいよ」と承認。Pages build_commandを `npm run build`、destination_dirを `dist` に変更しmainへpush。Pages組み込みWrangler 3.114.17がaccount_idを拒否したため、同項目だけ除いた修正760af63をpush。最終mainは760af635c7504fae4d75b38cc112829887c867b5。本番deployment 141c926e-516d-4d21-8d2a-7064e8f51d77は成功。

本番Blog/日記200と新しい空状態、セッションAPI200、admin.js200、管理画面と管理APIのAccessログインへの302、秘密ファイル・ソース・_worker.jsの404を確認。本番へ確認用記事は追加していない。管理画面 `https://yamachikaseiya.com/admin/` をユーザー向けに開く。本人の実ログイン後の管理画面・投稿操作と、本番キーでの読者Turnstile完了操作は未確認。日々の投稿は本人が管理画面で行う。旧ローカル下書き・写真は保持済み、自動移行なし。メール通知は無効。

## 現在の追加依頼（Markdown、本番反映済み）

本人が小見出し・太字を使いたいと明示しMarkdown対応を依頼。markdown-it 15.0.3を導入し、記事・日記の本文だけをHTML無効のMarkdownとして描画する。プレビューと公開表示で共通。改行を保持し、HTMLは文字表示、危険なリンクは拒否。コメントはプレーンテキスト。編集欄のplaceholderに基本記法を示し、リスト・コード・表のCSSを追加した。DB形式変更なし。

44試験とビルド、依存監査0件を確認。Edgeの実ブラウザーで下書き保存、プレビュー、ローカル公開、匿名読者表示の一致、スクリプトが実行されないこと、390pxでの横溢れなしを確認。レビュー画像 `.local/review/markdown-{desktop,mobile,dark}.png`。4201は試験専用DB使用。

2026-11-02 JSTに本人がMarkdown対応の本番反映を明示承認。候補26e9f85dab42a7b112ec047249e7acb5d88c0d42をmainへpush。本番deployment 1215651b-a107-4ba7-9386-d99a7115f154が成功。Home/Blog/日記/セッション200、新しいMarkdown用CSS配信、管理画面と管理APIのAccessログインへの302、_worker.jsの404を確認。結果は `.local/review/production-markdown-check.json`。本番への試験記事追加は行っていない。本人の本番ログイン後の投稿操作は引き続き未確認。

料金の相談もあり、公式料金説明を確認。R2は無料枠超過で従量課金、D1/Pages FunctionsのFree枠は上限で処理を拒否する。課金回避の対策は超過前に必要。過去記事の静的化でDB負荷を減らす案を説明するが、静的化・ローカルへの自動移動は未実装で今回の変更範囲に含めない。Billing APIは現在のOAuth接続では利用不可のため、契約プランの現状を断定しない。

本人の意図は、Heroと同じく写真をPC内のサイト用imagesフォルダーへ配置し、サイトと一緒に静的配信してURLを本文へ貼ること、と訂正を受けた。`![説明](/images/blog/photo.jpg)` 形式で参照可能。この方式なら対象写真はR2を使わない。PC単独での自宅サーバー配信や記事アーカイブへの移行依頼とは扱わない。画像の自動移動は未実装。

## 現在の修正（未保存プレビュー、本番反映済み）

本人がプレビューボタンを押せないと報告。新規記事を保存するまでdisabledにし、保存後も保存済み内容だけを開く実装が原因と確認。保存前でも押せるようにし、認証・Origin・CSRF検証付きPOST `/api/admin/preview` で現在の入力だけをHTML化して新しいタブへ表示する。保存・公開状態を変更せず、編集フォームと未保存状態を保持する。公開用の必須入力は通常のフォーム検証で確認する。

API再現試験は修正前404で失敗することを確認後に修正。全45試験とビルドが成功。Edge実ブラウザーでBlog・日記とも保存前ボタン有効、未保存入力のMarkdown表示、入力変更後の再プレビュー、CSS読み込み、opener遮断、DB変更なしを確認（`tools/unsaved-preview-browser-check.mjs`、専用DB・4202）。写真調整と合わせて本人が「公開して」と承認し、本番反映済み。

## 写真サイズの追加調整（本番反映済み）

本人から「写真，サイズあわせるようにして」と依頼。本文幅・高さ38rem以内へ縦横比を維持して縮小し、全体を表示、小さい画像は拡大せず中央配置する方針で調整。記事本文と日記本文のMarkdown画像に適用し、日記背景は維持。元CSSは横幅100%・高さ上限・coverによる切り抜きで、縦長画像の表示枠の比率が原寸と異なることを再現確認。

Edgeの画像寸法試験で1280px/390pxそれぞれ、記事・日記本文の横長・縦長・正方形・小画像について、比率維持、幅・高さ制限、拡大なし、横溢れなしを確認（tools/photo-layout-check.mjs）。画像は `.local/review/photo-fit-{1280,390}.png`。

2026-11-02 JSTに本人が「公開して」と承認。プレビュー修正56c5c3aと写真調整861d68fをmainへpush。本番deployment a76a972c-27e8-4c31-95d9-67506fd14666が成功。最終mainは861d68f1c67fa09c3cedc0e35b05e12584aaa3b7。本番で新プレビューAPIを呼ぶadmin.jsと画像contain/autoのCSS配信、Home/Blog/日記200、管理画面と新プレビューAPIのAccessログインへの302、_worker.jsの404を確認。結果は `.local/review/production-preview-photo-check.json`。認証後の本人操作は未確認で、本番へ試験記事は作成していない。残作業は本人による管理画面の再読み込みと操作確認。

## 現在の依頼（共通配色・書体、公開承認待ち）

本人がBlogとContactの配色の違い、書体の違いを指摘し修正を依頼。Blog・日記・管理画面のjournal変数を共通style.cssのtext/surface/muted/border/accentへ接続し、明朝体・Georgiaの専用指定を除いて本文の共通書体を継承する。コードだけは等幅を維持。主ボタンも共通button-bg/button-textを使う。日記の写真なし背景も共通subtle/text、写真ありの文字保護は中立な黒と白。ContactはJA/ENとも、濃色固定背景・白固定文字・Twitter専用青を共通背景・文字・ボタン色に統一し、不要なmodifierクラスを除いた。

修正前にライトBlogの背景がHomeと異なることをブラウザー再現試験で確認。全45試験・ビルド成功。tools/theme-consistency-check.mjsでライト/ダークのBlog背景・文字・見出し/日付の書体、JA/EN Contact背景・文字・見出し・ボタン色を確認。実ページのPC・390px・ライト/ダークも確認し横溢れなし。画像は `.local/review/unified-{blog,contact}-{light,dark,mobile}.png`。本番は861d68fのままで未反映。次は画像と今回の公開候補を提示して承認を得る。

## 現在の追加依頼（X共有カード、公開承認待ち）

本人がBlog URL共有時のプレビューを要望し、対象はXと回答。現行の公開記事と共通OG画像はTwitterbot User-Agent付きHTTP取得で200。robots.txtは許可。基本OGPはすでにあるが、画像は共通、概要は生Markdown、X個別タグはcardだけだった。実際のXクローラーから取得できたことや、キャッシュが唯一の原因だとは断定しない。

公開記事のOG:typeをarticleとし、OGPとXのタイトル・概要・画像・画像alt、twitter:siteをサーバーHTMLへ出力。概要はMarkdownトークンからプレーンテキストを生成し160文字以内。画像は登録写真、本文の最初のサイト内images/media/research/files画像、共通OG画像の順。認証が必要なパス、外部画像、data URLを自動選択しない。既存メタタグと重複させず属性値をエスケープ。本文や保存データの変更なし。

全49試験とビルド成功。実テンプレートのタグ内容・重複なし・特殊文字、画像選択、公開記事のX用応答と下書き404を確認。本番未反映・実際のX表示は未検証。配色と書体の修正0ba6912も引き続き承認待ちであり、今回の共有対応と合わせて公開候補を提示する。承認後は配信確認を行う。X投稿は別途依頼がない限り行わない。
