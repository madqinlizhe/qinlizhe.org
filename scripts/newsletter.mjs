import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { markdownToHtml, slugify } from "./markdown.mjs";

export { slugify } from "./markdown.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiBase = "https://api.buttondown.com/v1/";
const sendingStatuses = new Set(["sent", "about_to_send", "in_flight", "scheduled", "throttled", "resending"]);

export function emailHtml(markdown) {
  return `<!-- buttondown-editor-mode: fancy -->${markdownToHtml(markdown)}`;
}

export function parsePost(markdown, filename, site) {
  const lines = markdown.split(/\r?\n/);
  const value = (key) => lines.find((line) => line.startsWith(`${key}：`))?.slice(key.length + 1).trim();
  const notification = value("邮件通知");
  if (notification && !["发送", "不发送"].includes(notification)) {
    throw new Error(`Invalid 邮件通知 value in ${filename}`);
  }
  const title = lines.find((line) => line.startsWith("# "))?.slice(2).trim();
  if (!title) throw new Error(`Missing article title in ${filename}`);
  const description = value("摘要") || lines.find((line) => {
    const text = line.trim();
    return text && !text.startsWith("#") && !text.startsWith("!") && !text.includes("：");
  })?.replace(/\*\*/g, "").trim() || "点击链接，阅读新文章。";
  return {
    title, description, notify: notification !== "不发送",
    url: `${site}/posts/${encodeURIComponent(slugify(filename))}.html`
  };
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

export function newPostFiles(cwd, baseline) {
  if (!/^[a-f0-9]{40}$/.test(baseline)) throw new Error("Invalid newsletter baseline commit");
  git(["merge-base", "--is-ancestor", baseline, "HEAD"], cwd);
  // Follow renames, but stop at a copy: a copied article is a new publication.
  const files = git(["ls-files", "-z", "content/posts"], cwd).split("\0").filter((file) => file.endsWith(".md"));
  const posts = [];
  for (const file of files) {
    if (/[\r\n\x1e]/.test(file)) throw new Error("Article filenames must not contain control characters");
    const history = git(["log", "--follow", "--format=%x1e%H", "--name-status", "-z", "HEAD", "--", file], cwd);
    let birth;
    for (const record of history.split("\x1e").filter(Boolean)) {
      const [commit, rawStatus, ...paths] = record.split("\0");
      const status = rawStatus?.trim();
      if (status === "A") birth = [commit.trim(), paths[0]];
      if (status?.startsWith("C")) birth = [commit.trim(), paths[1]];
      if (birth) break;
    }
    if (!birth?.[1] || !/^[a-f0-9]{40}$/.test(birth[0])) throw new Error(`Cannot establish article identity: ${file}`);
    try {
      git(["merge-base", "--is-ancestor", birth[0], baseline], cwd);
      continue;
    } catch (error) {
      if (error.status !== 1) throw error;
    }
    const identity = createHash("sha256").update(`${birth[0]}\0${birth[1]}`).digest("hex").slice(0, 32);
    posts.push({ file, slug: `qinlizhe-post-${identity}` });
  }
  return posts;
}

export function createClient(key, fetcher = fetch) {
  let context;
  async function request(route, { method = "GET", body, idempotencyKey } = {}) {
    const url = new URL(route, apiBase);
    if (url.origin !== new URL(apiBase).origin || !url.pathname.startsWith("/v1/")) {
      throw new Error("Refusing to send credentials outside the Buttondown API");
    }
    const response = await fetcher(url, {
      method, redirect: "error", signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Token ${key}`, "Content-Type": "application/json",
        ...(context ? { "Buttondown-Context": context } : {}),
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    // Do not log API bodies: newsletter responses can include credentials and private data.
    if (!response.ok) throw new Error(`Buttondown ${method} ${url.pathname}: HTTP ${response.status}`);
    return response.json();
  }
  async function list(route) {
    const items = [];
    let next = route;
    const seen = new Set();
    while (next) {
      if (seen.has(next)) throw new Error("Buttondown returned a pagination loop");
      seen.add(next);
      const data = await request(next);
      if (!Array.isArray(data.results)) throw new Error("Invalid Buttondown list response");
      items.push(...data.results);
      next = data.next || null;
      if (!next && Number.isInteger(data.count) && items.length < data.count) {
        throw new Error("Buttondown pagination ended before all emails were retrieved");
      }
    }
    return items;
  }
  return {
    request, list,
    async selectNewsletter(username) {
      const newsletters = await list("newsletters");
      const newsletter = newsletters.find((item) => item.username === username);
      if (!newsletter?.id) throw new Error(`API key cannot access newsletter ${username}`);
      context = newsletter.id;
    }
  };
}

export async function ensureEmail(client, existing, payload, sourceMarkdown = payload.body) {
  const matches = existing.filter((email) => email.slug === payload.slug);
  if (matches.length > 1) throw new Error(`Duplicate email identity: ${payload.slug}`);
  if (matches.length) return { email: matches[0], created: false };
  const created = await client.request("emails", {
    method: "POST", body: payload, idempotencyKey: payload.slug
  });
  if (!created.id) throw new Error("Buttondown did not return the email ID");
  const email = await client.request(`emails/${encodeURIComponent(created.id)}`);
  if (email.slug !== payload.slug || email.subject !== payload.subject || !bodyMatches(email.body, sourceMarkdown)) {
    throw new Error(`Buttondown email verification failed for ${email.id}; inspect draft before retrying`);
  }
  if (payload.status === "draft" && email.status !== "draft") throw new Error("Welcome email was not saved as a draft");
  if (payload.status === "about_to_send" && !sendingStatuses.has(email.status)) {
    throw new Error(`Notification is ${email.status}, not queued; review in Buttondown`);
  }
  existing.push(email);
  return { email, created: true };
}

export function bodyMatches(saved, source) {
  if (typeof saved !== "string" || !saved.trim()) return false;
  // Buttondown may render Markdown as HTML and encode/rewrite links on storage.
  const decoded = saved.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
    try { return decodeURIComponent(encoded); } catch { return encoded; }
  });
  const paragraphs = source.split(/\n\s*\n/).map((part) => part.trim())
    .filter((part) => part && !/^[#\-\[*]/.test(part));
  if (!paragraphs.length || !decoded.includes(paragraphs[0]) || !decoded.includes(paragraphs.at(-1))) return false;
  const links = [...source.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((match) => decodeURI(match[1]));
  return links.every((link) => decoded.includes(link));
}

export async function verifyLive(post, fetcher = fetch) {
  const response = await fetcher(post.url, { redirect: "error", signal: AbortSignal.timeout(30000), cache: "no-store" });
  const html = await response.text();
  const title = post.title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  if (!response.ok || !html.includes(`<h1>${title}</h1>`)) throw new Error(`Article is not live: ${post.url}`);
}

export async function syncNewsletter({ cwd = root, key = process.env.BUTTONDOWN_API_KEY, fetcher = fetch, log = console.log } = {}) {
  if (!key?.trim()) throw new Error("BUTTONDOWN_API_KEY is missing; no emails were created or sent");
  const config = JSON.parse(await fs.readFile(path.join(cwd, "content/newsletters/config.json"), "utf8"));
  if (config.site !== "https://qinlizhe.org" || config.username !== "qinlizheorg") throw new Error("Unexpected newsletter destination");
  const candidates = newPostFiles(cwd, config.baselineCommit);
  const welcomeText = await fs.readFile(path.join(cwd, config.welcomeFile), "utf8");
  const [heading, ...bodyLines] = welcomeText.trim().split("\n");
  if (!heading.startsWith("# ")) throw new Error("Welcome newsletter needs a subject heading");
  const client = createClient(key.trim(), fetcher);
  await client.selectNewsletter(config.username);
  const existing = await client.list("emails");
  const welcome = await ensureEmail(client, existing, {
    subject: heading.slice(2).trim(), body: emailHtml(bodyLines.join("\n").trim()),
    slug: config.welcomeSlug, status: "draft", archival_mode: "enabled",
    metadata: { qinlizhe_kind: "welcome" }
  }, bodyLines.join("\n").trim());
  log(`Welcome: ${welcome.email.id} (${welcome.email.status}); ${welcome.created ? "created draft" : "existing email preserved"}`);
  if (config.waitForWelcomeSent && welcome.email.status !== "sent") {
    log("Waiting for welcome email review and sending; no article notifications sent.");
    return;
  }
  const pending = [];
  for (const candidate of candidates) {
    if (existing.some((email) => email.slug === candidate.slug)) continue;
    const post = parsePost(await fs.readFile(path.join(cwd, candidate.file), "utf8"), candidate.file, config.site);
    if (post.notify) pending.push({ ...candidate, ...post });
  }
  if (pending.length > config.maxNewPostsPerRun) throw new Error("Too many new articles; refusing an unexpected bulk send");
  // Verify every destination before queuing any email in this batch.
  for (const post of pending) await verifyLive(post, fetcher);
  for (const post of pending) {
    const body = `网站有一篇新文章。\n\n## ${post.title}\n\n${post.description}\n\n[阅读全文](${post.url})\n\n亲历者 Qinlizhe\n\n[回到网站](${config.site})`;
    const result = await ensureEmail(client, existing, {
      subject: `亲历者更新｜${post.title}`,
      body: emailHtml(body),
      slug: post.slug, status: "about_to_send", canonical_url: post.url,
      archival_mode: "enabled", metadata: { qinlizhe_kind: "post", qinlizhe_file: post.file }
    }, body);
    log(`Article notification: ${result.email.id} (${result.email.status})`);
  }
  log(`New article notifications queued: ${pending.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncNewsletter().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
