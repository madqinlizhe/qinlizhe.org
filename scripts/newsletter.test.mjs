import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bodyMatches, createClient, emailHtml, ensureEmail, newPostFiles, parsePost, slugify, syncNewsletter, verifyLive } from "./newsletter.mjs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function fakeButtondown(initial = []) {
  const emails = structuredClone(initial);
  const writes = [];
  const fetcher = async (input, options = {}) => {
    const url = new URL(input);
    if (url.host === "qinlizhe.org") {
      const filename = decodeURIComponent(path.basename(url.pathname, ".html"));
      return new Response(`<h1>${filename}</h1>`);
    }
    assert.equal(url.origin, "https://api.buttondown.com");
    if (url.pathname === "/v1/newsletters") return json({ results: [{ id: "newsletter-1", username: "qinlizheorg" }], next: null });
    assert.equal(options.headers["Buttondown-Context"], "newsletter-1");
    if (url.pathname === "/v1/emails" && options.method === "GET") return json({ results: emails, next: null });
    if (url.pathname === "/v1/emails" && options.method === "POST") {
      const body = JSON.parse(options.body);
      assert.equal(options.headers["X-Idempotency-Key"], body.slug);
      const email = { ...body, id: `email-${emails.length + 1}` };
      emails.push(email);
      writes.push(body);
      return json(email, 201);
    }
    const email = emails.find((item) => url.pathname === `/v1/emails/${item.id}`);
    if (email) return json(email);
    throw new Error(`Unexpected request: ${options.method} ${url}`);
  };
  return { emails, writes, fetcher };
}

async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "qinlizhe-newsletter-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Newsletter Test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  await fs.mkdir(path.join(cwd, "content/posts"), { recursive: true });
  await fs.mkdir(path.join(cwd, "content/newsletters"), { recursive: true });
  const writePost = (name, extra = "") => fs.writeFile(path.join(cwd, `content/posts/${name}.md`), `# ${name}\n\n栏目：疯言疯语\n摘要：文章摘要\n${extra}\n\n原文。\n`);
  await writePost("旧文章");
  git("add", "content/posts");
  git("commit", "-qm", "Baseline");
  const baselineCommit = git("rev-parse", "HEAD");
  await fs.writeFile(path.join(cwd, "content/newsletters/config.json"), JSON.stringify({
    site: "https://qinlizhe.org", username: "qinlizheorg", baselineCommit,
    welcomeFile: "content/newsletters/welcome.md", welcomeSlug: "welcome", waitForWelcomeSent: true, maxNewPostsPerRun: 5
  }));
  await fs.writeFile(path.join(cwd, "content/newsletters/welcome.md"), "# 第一封来信\n\n你好，欢迎来读。\n");
  return { cwd, git, baselineCommit, writePost };
}

test("metadata, opt-out, and canonical URL match the article format", () => {
  assert.equal(slugify("content/posts/DSM 新版，要来了？.md"), "dsm-新版-要来了");
  const post = parsePost("# 一个标题\n\n摘要：短摘要\n邮件通知：不发送\n\n正文。", "一个标题.md", "https://qinlizhe.org");
  assert.equal(post.description, "短摘要");
  assert.equal(post.notify, false);
  assert.equal(decodeURI(post.url), "https://qinlizhe.org/posts/一个标题.html");
  assert.throws(() => parsePost("# 标题\n邮件通知：错误", "标题.md", "https://qinlizhe.org"), /Invalid/);
});

test("stored HTML and encoded links verify without requiring byte-identical Markdown", () => {
  const source = "你好，\n\n第一封信。\n\n[文章](https://qinlizhe.org/posts/文章.html)";
  const html = '<p>你好，</p><p>第一封信。</p><a href="https://qinlizhe.org/posts/%E6%96%87%E7%AB%A0.html?utm_medium=email">文章</a>';
  assert.equal(bodyMatches(html, source), true);
  assert.equal(bodyMatches("你好，", source), false);
  assert.equal(bodyMatches("", source), false);
});

test("emails use real headings and links in an explicitly rich-text editor", () => {
  const html = emailHtml("你好，\n\n## 嬉笑怒骂\n\n- [文章](https://qinlizhe.org)\n\n谢谢。");
  assert.ok(html.startsWith("<!-- buttondown-editor-mode: fancy -->"));
  assert.ok(html.includes("<h2>嬉笑怒骂</h2>"));
  assert.ok(html.includes('<a href="https://qinlizhe.org"'));
  assert.ok(!html.includes("##"));
  assert.ok(!html.includes("[文章]"));
});

test("only committed new articles qualify; edits and renames retain identity", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(newPostFiles(f.cwd, f.baselineCommit), []);
  await f.writePost("草稿");
  assert.deepEqual(newPostFiles(f.cwd, f.baselineCommit), []);
  await f.writePost("新文章");
  f.git("add", "content/posts/新文章.md");
  f.git("commit", "-qm", "New post");
  const original = newPostFiles(f.cwd, f.baselineCommit);
  assert.equal(original.length, 1);
  await f.writePost("旧文章", "已修订");
  f.git("add", "content/posts/旧文章.md");
  f.git("commit", "-qm", "Edit old article");
  f.git("mv", "content/posts/新文章.md", "content/posts/新名字.md");
  f.git("mv", "content/posts/旧文章.md", "content/posts/旧文章新名字.md");
  f.git("commit", "-qm", "Rename posts");
  const renamed = newPostFiles(f.cwd, f.baselineCommit);
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].slug, original[0].slug);
});

test("first run creates exactly one welcome draft and never sends old or new posts", async (t) => {
  const f = await fixture(t);
  await f.writePost("新文章");
  f.git("add", "content/posts/新文章.md");
  f.git("commit", "-qm", "New post");
  const api = fakeButtondown();
  const options = { cwd: f.cwd, key: "test-key", fetcher: api.fetcher, log: () => {} };
  await syncNewsletter(options);
  await syncNewsletter(options);
  assert.equal(api.writes.length, 1);
  assert.equal(api.writes[0].status, "draft");
  assert.equal(api.writes[0].slug, "welcome");
  api.emails[0].body = "我在后台修改的内容。";
  await syncNewsletter(options);
  assert.equal(api.emails[0].body, "我在后台修改的内容。");
});

test("after welcome is sent, new live posts are queued once; opt-outs stay private", async (t) => {
  const f = await fixture(t);
  await f.writePost("新文章");
  await f.writePost("静默文章", "邮件通知：不发送");
  f.git("add", "content/posts");
  f.git("commit", "-qm", "New posts");
  const api = fakeButtondown([{ id: "welcome-id", slug: "welcome", status: "sent" }]);
  const options = { cwd: f.cwd, key: "test-key", fetcher: api.fetcher, log: () => {} };
  await syncNewsletter(options);
  await syncNewsletter(options);
  assert.equal(api.writes.length, 1);
  assert.equal(api.writes[0].status, "about_to_send");
  assert.equal(api.writes[0].subject, "亲历者更新｜新文章");
  await f.writePost("新文章", "改了错别字");
  f.git("add", "content/posts/新文章.md");
  f.git("commit", "-qm", "Fix typo");
  await syncNewsletter(options);
  assert.equal(api.writes.length, 1);
});

test("failed publication prevents all sends, even if another post is live", async (t) => {
  const f = await fixture(t);
  await f.writePost("新文章");
  f.git("add", "content/posts");
  f.git("commit", "-qm", "New article");
  const api = fakeButtondown([{ id: "welcome-id", slug: "welcome", status: "sent" }]);
  const fetcher = (url, options) => new URL(url).host === "qinlizhe.org" ? new Response("Not found", { status: 404 }) : api.fetcher(url, options);
  await assert.rejects(syncNewsletter({ cwd: f.cwd, key: "test-key", fetcher, log: () => {} }), /not live/);
  assert.equal(api.writes.length, 0);
});

test("pagination handles older sent emails and refuses credential-leaking next links", async () => {
  let calls = 0;
  const client = createClient("test-key", async () => {
    calls += 1;
    return calls === 1 ? json({ results: [{ id: "one" }], next: "https://api.buttondown.com/v1/emails?page=2" }) : json({ results: [{ id: "two" }], next: null });
  });
  assert.equal((await client.list("emails")).length, 2);
  const unsafe = createClient("test-key", async () => json({ results: [], next: "https://example.invalid/steal" }));
  await assert.rejects(unsafe.list("emails"), /outside the Buttondown API/);
  const incomplete = createClient("test-key", async () => json({ results: [{ id: "one" }], count: 2 }));
  await assert.rejects(incomplete.list("emails"), /before all emails/);
});

test("bulk import safety limit prevents sends", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 6; i += 1) await f.writePost(`文章${i}`);
  f.git("add", "content/posts");
  f.git("commit", "-qm", "Bulk import");
  const api = fakeButtondown([{ id: "welcome-id", slug: "welcome", status: "sent" }]);
  await assert.rejects(syncNewsletter({ cwd: f.cwd, key: "key", fetcher: api.fetcher, log: () => {} }), /bulk send/);
  assert.equal(api.writes.length, 0);
});

test("duplicates, absent keys, and wrong newsletter accounts fail safely", async () => {
  await assert.rejects(ensureEmail({}, [{ slug: "same" }, { slug: "same" }], { slug: "same" }), /Duplicate/);
  await assert.rejects(syncNewsletter({ key: "" }), /missing/);
  const wrong = createClient("key", async () => json({ results: [{ username: "other", id: "other" }], next: null }));
  await assert.rejects(wrong.selectNewsletter("qinlizheorg"), /cannot access/);
  await assert.rejects(verifyLive({ url: "https://qinlizhe.org/test", title: "标题" }, async () => new Response("<h1>别的标题</h1>")), /not live/);
});
