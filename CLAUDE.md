# x-bot-runner

## プロジェクト概要
GitHub Actionsを使ったX（Twitter）自動投稿・監視Bot。
LLM（Anthropic Claude）連携による高度な運用を目指す。

## リポジトリ構成
- 本リポジトリ（x-bot-runner）：実行コード・ワークフロー定義（Public）
- x-bot-store（Private）：投稿コンテンツ・メディア・状態管理

## 技術スタック
- Node.js + TypeScript
- GitHub Actions（定期実行）
- X API v2（投稿・DM・メンション取得）
- Slack Webhook（通知）
- Anthropic Claude API（LLM連携）

## x-bot-storeのディレクトリ構成
posts/YYYY-MM.yaml   # 月次投稿一覧
media/               # 画像・動画素材
state/               # カーソル・スナップショット等

## posts/YYYY-MM.yamlのスキーマ
- id: 投稿ID（YYYYMMDD-XXX形式）
- text: 投稿本文
- scheduled_at: 予定日時（JST、ISO8601）
- posted_at: 投稿完了日時（null=未投稿）
- tweet_id: X側のツイートID（null=未投稿）
- media: メディアファイルパスの配列（空配列=テキストのみ）

## 認証
- X API：OAuth 1.0a User Context（投稿）+ OAuth 2.0（読み取り系）
- x-bot-storeへのアクセス：Fine-grained PAT（CONTENT_REPO_PAT）

## GitHub Secrets一覧
- X_API_KEY / X_API_SECRET
- X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET
- X_BEARER_TOKEN
- SLACK_WEBHOOK_URL
- CONTENT_REPO_PAT
- ANTHROPIC_API_KEY

## 開発フェーズ
- Phase1: 基盤セットアップ ✅
- Phase2: MVP（テキスト投稿の自動化）← 現在
- Phase3: メディア投稿対応
- Phase4: 監視・メトリクス通知
- Phase5: LLM連携（Bot高度化）

## 注意事項
- APIホスト: https://api.x.com（api.twitter.comではない）
- DM保持期間: 過去30日のみ
- 高度なAnalytics APIはEnterprise限定。public_metricsで代替
- 状態ファイルのコミットには必ず[skip ci]を付与
- ワークフローのconcurrencyグループ: 投稿=state-write、監視=monitor

## 前提条件（人間が手作業済みであること）
- [ ] GitHub SecretsにX API関連キーを登録済み
- [ ] GitHub SecretsにSLACK_WEBHOOK_URLを登録済み
- [ ] GitHub SecretsにCONTENT_REPO_PATを登録済み
- [ ] GitHub SecretsにANTHROPIC_API_KEYを登録済み
- [ ] x-bot-storeリポジトリが作成済み・初期構成済み

## Claude Codeへのタスク（Phase2: MVP）
以下を順番に実装すること。

1. Node.js + TypeScript環境構築
   - package.json（依存: typescript, ts-node, yaml, twitter-api-v2）
   - tsconfig.json
   - .gitignore
   
2. x-bot-storeのチェックアウト処理
   - CONTENT_REPO_PATを使ってPrivateリポジトリをclone
   - src/lib/content-repo.ts として実装

3. 投稿スクリプト実装
   - posts/YYYY-MM.yamlを読み込み、未投稿かつ時刻到来分を抽出
   - POST https://api.x.com/2/tweets で投稿
   - 成功時にposted_at・tweet_idをYAMLに書き戻してcommit & push（[skip ci]付与）
   - エラー時はSlack通知
   - src/post.ts として実装

4. GitHub Actionsワークフロー定義
   - .github/workflows/post.yml
   - cron: 5分おき
   - concurrency: state-write
   - workflow_dispatchも有効化

5. エラーハンドリング共通処理
   - 401/403/429それぞれの対処
   - 429はx-rate-limit-resetヘッダを見てexponential backoff
   - src/lib/error-handler.ts として実装

## 実装上の注意
- APIホスト: https://api.x.com
- 状態コミット時は必ず[skip ci]をコミットメッセージに含める
- concurrencyグループ: 投稿=state-write、監視=monitor（干渉しないよう分離）
- TypeScriptのstrictモードを有効にすること
