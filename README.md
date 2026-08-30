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
| トリガー | cron（平日 08:10 / 12:40 / 21:10 JST、土日 14:40 / 22:10 JST）+ `workflow_dispatch` |
| スクリプト | `src/post.ts` |
| 処理 | 未投稿かつ予定時刻を過ぎた投稿のうち、直近（scheduled_at が最新）の1件を X へ投稿し、YAML を更新。それより古いバックログが残っていた場合は投稿内容と投稿時刻がズレてしまうため投稿せず自動的に `skip: true` にする（自己回復） |
| 通知 | 投稿成功時（自動skipがあれば内容も併記）・エラー時に Slack へ通知 |

### 投稿スケジュールとcronの対応関係（仕様）

投稿コンテンツ側（x-bot-store）が想定する投稿予定時刻と、`post.yml`のcronトリガー時刻は別々に管理されている。両者は次のルールで対応させること。

**ルール：各cronは、対応する投稿予定時刻より後（バッファ+10分目安）に発火するよう設定する。**

cronが投稿予定時刻より前に発火すると、その回では`scheduled_at <= now`の条件を満たさずスキップされ、次の巡目（＝数時間後）まで持ち越されてしまう。持ち越しが起きると後続の予定もすべて1件ずつ後ろにズレていき、投稿内容と実際の投稿時刻が噛み合わなくなる（例：「〜の夜」という本文が翌朝に投稿される）。

| 曜日 | 投稿予定時刻（x-bot-store側） | cronトリガー時刻（本リポジトリ側） | バッファ |
|---|---|---|---|
| 平日 | 08:00 JST | 08:10 JST | +10分 |
| 平日 | 12:30 JST | 12:40 JST | +10分 |
| 平日 | 21:00 JST | 21:10 JST | +10分 |
| 土日祝 | 14:30 JST | 14:40 JST | +10分 |
| 土日祝 | 22:00 JST | 22:10 JST | +10分 |

投稿予定時刻・投稿数の仕様自体（比率、曜日ごとの本数など）は x-bot-store の `CLAUDE.md` に定義されている。本リポジトリのcronを変更する際は、必ず上表と同期させること。

> ⚠️ **既知の制約**：上記のcronは曜日（平日／土日）でのみ発火判定しており、祝日を認識しない。祝日が平日にあたる場合、x-bot-store側は土日パターン（14:30/22:00の2投稿）でコンテンツを作成する運用ルールになっているが、cronは平日パターン（08:10/12:40/21:10 JST）のまま発火するため、ズレが発生する。詳細は x-bot-store の `CLAUDE.md` を参照。

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
