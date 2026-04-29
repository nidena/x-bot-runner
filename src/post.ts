import "dotenv/config";
import axios from "axios";
import * as yaml from "js-yaml";
import OAuth from "oauth-1.0a";
import * as crypto from "crypto";

// ── 型定義 ──────────────────────────────────────────────────────────────────

interface Post {
  id: string;
  text: string;
  scheduled_at: string;
  posted_at: string | null;
  tweet_id: string | null;
  media: string[];
}

interface ContentFile {
  content: string;
  sha: string;
}

// ── 環境変数 ─────────────────────────────────────────────────────────────────

const {
  X_API_KEY,
  X_API_SECRET,
  X_ACCESS_TOKEN,
  X_ACCESS_TOKEN_SECRET,
  SLACK_WEBHOOK_URL,
  CONTENT_REPO_PAT,
  CONTENT_REPO = "nidena/x-bot-store",
} = process.env;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

// ── GitHub Content API ────────────────────────────────────────────────────────

const ghHeaders = {
  Authorization: `token ${CONTENT_REPO_PAT}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function fetchYamlFile(path: string): Promise<ContentFile> {
  const url = `https://api.github.com/repos/${CONTENT_REPO}/contents/${path}`;
  const { data } = await axios.get(url, { headers: ghHeaders });
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

async function updateYamlFile(
  path: string,
  content: string,
  sha: string,
  message: string
): Promise<void> {
  const url = `https://api.github.com/repos/${CONTENT_REPO}/contents/${path}`;
  await axios.put(
    url,
    {
      message,
      content: Buffer.from(content).toString("base64"),
      sha,
    },
    { headers: ghHeaders }
  );
}

// ── X API (OAuth 1.0a) ────────────────────────────────────────────────────────

function buildOAuth(): OAuth {
  return new OAuth({
    consumer: {
      key: requireEnv("X_API_KEY"),
      secret: requireEnv("X_API_SECRET"),
    },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return crypto.createHmac("sha1", key).update(base).digest("base64");
    },
  });
}

async function postTweet(text: string): Promise<string> {
  const url = "https://api.x.com/2/tweets";
  const oauth = buildOAuth();
  const token = {
    key: requireEnv("X_ACCESS_TOKEN"),
    secret: requireEnv("X_ACCESS_TOKEN_SECRET"),
  };
  const authHeader = oauth.toHeader(
    oauth.authorize({ url, method: "POST" }, token)
  );

  const { data } = await axios.post(
    url,
    { text },
    {
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
    }
  );
  return data.data.id as string;
}

// ── Slack通知 ─────────────────────────────────────────────────────────────────

async function notifySlack(message: string): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;
  await axios.post(SLACK_WEBHOOK_URL, { text: message });
}

// ── 月次YAMLのパス ────────────────────────────────────────────────────────────

function yamlPath(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `posts/${y}-${m}.yaml`;
}

// ── メイン ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  requireEnv("CONTENT_REPO_PAT");

  const now = new Date();
  const path = yamlPath(now);

  console.log(`Fetching ${path} from ${CONTENT_REPO}...`);
  let file: ContentFile;
  try {
    file = await fetchYamlFile(path);
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      console.log("No posts file for this month. Nothing to do.");
      return;
    }
    throw err;
  }

  const posts = (yaml.load(file.content) as Post[]) ?? [];

  // 未投稿かつ予定時刻を過ぎたものを選ぶ（IDの昇順で最初の1件）
  const target = posts
    .filter((p) => p.posted_at === null && new Date(p.scheduled_at) <= now)
    .sort((a, b) => a.id.localeCompare(b.id))[0];

  if (!target) {
    console.log("No scheduled posts ready to publish.");
    return;
  }

  console.log(`Posting [${target.id}]: ${target.text.slice(0, 40)}...`);
  const tweetId = await postTweet(target.text);
  const postedAt = new Date().toISOString();

  // YAMLを更新
  target.tweet_id = tweetId;
  target.posted_at = postedAt;
  const updatedYaml = yaml.dump(posts, { lineWidth: -1 });

  await updateYamlFile(
    path,
    updatedYaml,
    file.sha,
    `[skip ci] post: ${target.id}`
  );

  const slackMsg = `✅ Posted [${target.id}]\nhttps://x.com/i/web/status/${tweetId}\n${target.text.slice(0, 100)}`;
  await notifySlack(slackMsg);

  console.log(`Done. tweet_id=${tweetId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
