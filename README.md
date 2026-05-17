# x-bot-runner

GitHub Actions で動く X（Twitter）自動投稿 Bot。

## 概要

- 投稿コンテンツは Private リポジトリ [x-bot-store](https://github.com/nidena/x-bot-store) で管理
- 投稿スケジュールは YAML ファイル（`posts/YYYY-MM.yaml`）で定義
- 毎日前日 21:00 JST に翌日の投稿予定を Slack へ通知

## ワークフロー

### 自動投稿（`post.yml`）

| 項目 | 内容 |
|------|------|
| トリガー | cron（平日 08:10 / 12:30 / 20:20 JST、土日 14:43 / 22:23 JST）+ `workflow_dispatch` |
| スクリプト | `src/post.ts` |
| 処理 | 未投稿かつ予定時刻を過ぎた投稿を1件 X へ投稿し、YAML を更新 |
| 通知 | 投稿成功・エラー時に Slack へ通知 |

### 前日予定通知（`daily-report.yml`）

| 項目 | 内容 |
|------|------|
| トリガー | cron（毎日 21:00 JST）+ `workflow_dispatch` |
| スクリプト | `src/daily-report.ts` |
| 処理 | x-bot-store から翌日分の投稿を取得し、全文を Slack へ通知 |
| 目的 | 投稿内容の事前確認・修正の時間を確保 |

**Slack 通知フォーマット（翌日の予定が 3 件の場合）:**

```
📅 明日（2026-05-18 JST）の投稿予定 3件

1. 08:10  [20260518-001]
（投稿本文全文）

─────

2. 12:30  [20260518-002]
（投稿本文全文）

─────

3. 20:20  [20260518-003]
（投稿本文全文）
```

翌日の予定がない場合も「投稿予定はありません」と通知します。

## 投稿ファイルのスキーマ（`posts/YYYY-MM.yaml`）

```yaml
- id: 20260518-001          # 投稿ID（YYYYMMDD-XXX形式）
  text: "投稿本文"
  scheduled_at: "2026-05-18T08:10:00+09:00"  # JST ISO8601
  posted_at: null           # 投稿完了日時（null=未投稿）
  tweet_id: null            # X側のID（null=未投稿）
  media: []                 # メディアファイルパス（空=テキストのみ）
  skip: false               # true にすると投稿をスキップ
```

## 必要な GitHub Secrets

| Secret | 用途 |
|--------|------|
| `X_API_KEY` / `X_API_SECRET` | X API 認証 |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | X API 認証 |
| `X_BEARER_TOKEN` | X API 読み取り系 |
| `SLACK_WEBHOOK_URL` | Slack 通知 |
| `CONTENT_REPO_PAT` | x-bot-store へのアクセス |
| `ANTHROPIC_API_KEY` | Claude API（将来利用） |

## ローカル開発

```bash
npm install

# 投稿スクリプトを手動実行
npm run post

# 型チェック
npm run build
```

`.env` ファイルに必要な環境変数を設定してください（`.env.example` 参照）。

## 技術スタック

- Node.js 20 + TypeScript
- GitHub Actions
- X API v2（OAuth 1.0a）
- Slack Incoming Webhook
- GitHub Content API（x-bot-store アクセス）
