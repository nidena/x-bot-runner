import axios from "axios";
import * as yaml from "js-yaml";

interface Post {
  id: string;
  text: string;
  scheduled_at: string;
  posted_at: string | null;
  tweet_id: string | null;
  media: string[];
  skip?: boolean;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const {
  SLACK_WEBHOOK_URL,
  CONTENT_REPO_PAT,
  CONTENT_REPO = "nidena/x-bot-store",
} = process.env;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

const ghHeaders = {
  Authorization: `token ${CONTENT_REPO_PAT}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function fetchYamlFile(path: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${CONTENT_REPO}/contents/${path}`;
  try {
    const { data } = await axios.get(url, { headers: ghHeaders });
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

function tomorrowInJst(): { year: number; month: number; dateStr: string } {
  const d = new Date(Date.now() + JST_OFFSET_MS + 24 * 60 * 60 * 1000);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, dateStr };
}

function jstDateOf(isoStr: string): string {
  return new Date(new Date(isoStr).getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function jstTimeOf(isoStr: string): string {
  const d = new Date(new Date(isoStr).getTime() + JST_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

async function notifySlack(message: string): Promise<void> {
  await axios.post(requireEnv("SLACK_WEBHOOK_URL"), { text: message });
}

async function main(): Promise<void> {
  requireEnv("CONTENT_REPO_PAT");
  requireEnv("SLACK_WEBHOOK_URL");

  const { year, month, dateStr } = tomorrowInJst();
  const path = `posts/${year}-${String(month).padStart(2, "0")}.yaml`;

  console.log(`Fetching ${path} from ${CONTENT_REPO}...`);
  const content = await fetchYamlFile(path);

  if (!content) {
    console.log("No posts file for tomorrow's month.");
    await notifySlack(`📅 明日（${dateStr} JST）の投稿予定はありません（YAMLファイルなし）。`);
    return;
  }

  const posts = (yaml.load(content) as Post[]) ?? [];
  const tomorrowPosts = posts
    .filter((p) => !p.skip && jstDateOf(p.scheduled_at) === dateStr)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  if (tomorrowPosts.length === 0) {
    console.log("No posts scheduled for tomorrow.");
    await notifySlack(`📅 明日（${dateStr} JST）の投稿予定はありません。`);
    return;
  }

  const entries = tomorrowPosts.map((p, i) => {
    const time = jstTimeOf(p.scheduled_at);
    return `${i + 1}. ${time}  [${p.id}]\n${p.text}`;
  });

  const header = `📅 明日（${dateStr} JST）の投稿予定 ${tomorrowPosts.length}件`;
  const body = entries.join("\n\n─────\n\n");

  await notifySlack(`${header}\n\n${body}`);
  console.log(`Notified Slack: ${tomorrowPosts.length} posts for ${dateStr}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
