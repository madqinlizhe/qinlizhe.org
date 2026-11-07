import test, { before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { escapeHtml, markdownToHtml, slugify } from "./markdown.mjs";
import { categories, renderIndex } from "./render.mjs";
import { loadEnglishManifest } from "./english.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
let posts;
let index;

before(async () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: root });
  posts = JSON.parse(await fs.readFile(path.join(dist, "assets/search.json"), "utf8"));
  index = await fs.readFile(path.join(dist, "index.html"), "utf8");
});

test("homepage renders real articles without JavaScript and retains the approved palette", async () => {
  assert.ok(index.includes("探索更多"));
  assert.ok(!index.includes("四条旁路"));
  assert.ok(index.includes(`<h1><a href="${posts[0].url}">${escapeHtml(posts[0].title)}</a></h1>`));
  assert.ok(index.indexOf(posts[0].url) < index.indexOf('id="recent-heading"'));
  const css = await fs.readFile(path.join(dist, "assets/styles.css"), "utf8");
  assert.ok(css.includes("--link:#8f234b"));
  assert.ok(css.includes("--marker:#d4e760"));
  assert.ok(css.includes("@media(max-width:700px)"));
});

test("existing article URLs and their full bodies are preserved", async () => {
  const files = (await fs.readdir(path.join(root, "content/posts"))).filter((file) => file.endsWith(".md"));
  assert.equal(posts.length, files.length);
  for (const file of files) {
    const markdown = await fs.readFile(path.join(root, "content/posts", file), "utf8");
    const lines = markdown.split(/\r?\n/);
    let start = lines[0]?.startsWith("# ") ? 1 : 0;
    while (start < lines.length && (!lines[start].trim() || /^(作者\/公众号|发布时间|原文链接|栏目|摘要|邮件通知)：/.test(lines[start]))) start += 1;
    const expected = markdownToHtml(lines.slice(start).join("\n").trimStart());
    const html = await fs.readFile(path.join(dist, "posts", `${slugify(file)}.html`), "utf8");
    const body = html.match(/<div id="article-content" class="article-body">([\s\S]*?)<\/div>/)?.[1].trim();
    assert.equal(body, expected, file);
    const title = lines.find((line) => line.startsWith("# "))?.slice(2).trim() || path.basename(file, ".md");
    assert.ok(html.includes(`<h1>${escapeHtml(title)}</h1>`), file);
  }
});

test("every generated local link, image and script has a real destination", async () => {
  const pages = ["index.html", "all.html", "about.html", ...categories.map((category) => `categories/${category.slug}.html`), ...posts.map((post) => decodeURIComponent(post.url.slice(1)))];
  for (const page of pages) {
    const html = await fs.readFile(path.join(dist, page), "utf8");
    for (const match of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
      const url = new URL(match[1], "https://qinlizhe.org");
      const relative = decodeURIComponent(url.pathname).replace(/^\//, "") || "index.html";
      await fs.access(path.join(dist, relative));
    }
  }
  for (const name of ["search", "moon", "sun", "arrow-right", "arrow-up-right", "arrow-left", "plus", "minus", "x", "mail"]) {
    await fs.access(path.join(dist, "icons", `${name}.svg`));
  }
});

test("category pages and complete archive include the right articles", async () => {
  const all = await fs.readFile(path.join(dist, "all.html"), "utf8");
  for (const post of posts) assert.ok(all.includes(`href="${post.url}"`), post.title);
  for (const category of categories) {
    const html = await fs.readFile(path.join(dist, "categories", `${category.slug}.html`), "utf8");
    assert.ok(html.includes(`data-nav="${category.slug}" aria-current="page"`));
    for (const post of posts.filter((post) => post.category === category.name)) assert.ok(html.includes(`href="${post.url}"`));
  }
});

test("subscription remains embedded, accessible, and connected to the same Buttondown list", () => {
  assert.ok(index.includes('action="https://buttondown.com/api/emails/embed-subscribe/qinlizheorg"'));
  assert.ok(index.includes('type="email" name="email" id="bd-email"'));
  assert.ok(index.includes('for="bd-email">邮箱地址</label>'));
  assert.ok(!index.includes("不定期手动发送"));
  assert.ok(index.includes('aria-label="搜索文章"'));
  assert.ok(index.includes('aria-labelledby="search-label"'));
});

test("canonical URLs and cache versions support direct article visits", async () => {
  const html = await fs.readFile(path.join(dist, decodeURIComponent(posts[0].url.slice(1))), "utf8");
  assert.ok(html.includes(`rel="canonical" href="https://qinlizhe.org${posts[0].url}"`));
  assert.ok(/styles\.css\?v=[a-f0-9]{12}/.test(html));
  assert.ok(/site\.js\?v=[a-f0-9]{12}/.test(html));
  assert.ok(html.includes('aria-label="放大字号"'));
  assert.ok(html.includes('aria-label="缩小字号"'));
});

test("an empty article collection still renders navigation and subscription", () => {
  const html = renderIndex([], "empty");
  assert.ok(html.includes("文章会放在这里"));
  assert.ok(html.includes("探索更多"));
  assert.ok(html.includes('id="bd-email"'));
});

test("Chinese language switches match translations and fall back honestly for untranslated posts", async () => {
  const manifest = await loadEnglishManifest();
  const translated = new Set();
  for (const entry of manifest.posts) {
    const slug = slugify(entry.source);
    translated.add(slug);
    const html = await fs.readFile(path.join(dist, "posts", `${slug}.html`), "utf8");
    const englishPath = `/en/posts/${entry.slug}.html`;
    assert.ok(html.includes(`href="${englishPath}" lang="en" hreflang="en">EN</a>`));
    assert.ok(html.includes(`hreflang="en" href="https://qinlizhe.org${englishPath}"`));
    await fs.access(path.join(dist, englishPath));
  }
  const untranslated = posts.find((post) => !translated.has(decodeURIComponent(post.url).split("/").at(-1).replace(/\.html$/, "")));
  assert.ok(untranslated);
  const html = await fs.readFile(path.join(dist, decodeURIComponent(untranslated.url)), "utf8");
  assert.ok(html.includes('href="/en/" lang="en" hreflang="en">EN</a>'));
  assert.ok(!html.includes('rel="alternate" hreflang="en"'));
  const about = await fs.readFile(path.join(dist, "about.html"), "utf8");
  assert.ok(about.includes('href="/en/about.html" lang="en"'));
});
