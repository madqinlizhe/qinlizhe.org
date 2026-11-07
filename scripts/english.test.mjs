import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnglish, loadEnglishManifest } from "./english.mjs";
import { markdownToHtml, slugify } from "./markdown.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let out;
let manifest;
before(async () => {
  out = await fs.mkdtemp(path.join(os.tmpdir(), "qinlizhe-en-test-"));
  manifest = await loadEnglishManifest();
  await buildEnglish({ out });
});
after(async () => { if (out) await fs.rm(out, { recursive: true, force: true }); });

test("all ten approved English pieces render in full with reciprocal language links", async () => {
  assert.equal(manifest.status, "published");
  assert.equal(manifest.posts.length, 10);
  assert.equal(new Set(manifest.posts.map((p) => p.slug)).size, 10);
  for (const p of manifest.posts) {
    const md = await fs.readFile(path.join(root, "content/en/posts", `${p.slug}.md`), "utf8");
    const html = await fs.readFile(path.join(out, "posts", `${p.slug}.html`), "utf8");
    assert.ok(html.includes(markdownToHtml(md.replace(/^# .+\r?\n/, "").trim())), p.slug);
    assert.ok(html.includes(`rel="canonical" href="https://qinlizhe.org/en/posts/${p.slug}.html"`));
    const chinese = `https://qinlizhe.org/posts/${encodeURIComponent(slugify(p.source))}.html`;
    assert.ok(html.includes(`href="${chinese}" lang="zh-CN" hreflang="zh-CN">中文</a>`));
    assert.ok(html.includes(`hreflang="zh-CN" href="${chinese}"`));
    assert.ok(!html.includes("REVIEW DRAFT"));
    assert.ok(!html.includes("pending author review"));
    assert.ok(!html.includes('name="robots"'));
    assert.equal(p.review, undefined);
  }
});

test("all English pages, images, versioned scripts and icon masks resolve", async () => {
  const pages = ["index.html", "about.html", "all.html", ...manifest.posts.map((p) => `posts/${p.slug}.html`), ...["critique", "reading", "practice", "notes"].map((c) => `categories/${c}.html`)];
  for (const file of pages) {
    const html = await fs.readFile(path.join(out, file), "utf8");
    for (const [, url] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      if (/^https?:/.test(url)) continue;
      const local = new URL(url, `https://test.invalid/${file}`);
      await fs.access(path.join(out, decodeURIComponent(local.pathname)));
    }
    const json = JSON.parse(html.match(/id="search-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(json.length, 10);
    for (const p of json) await fs.access(path.resolve(out, path.dirname(file), p.url));
  }
  const css = await fs.readFile(path.join(out, "assets/styles.css"), "utf8");
  for (const [, url] of css.matchAll(/url\('([^']+)'\)/g)) await fs.access(path.resolve(out, "assets", url));
  for (const file of ["about.html", "all.html", "categories/notes.html"]) {
    const html = await fs.readFile(path.join(out, file), "utf8");
    assert.ok(html.includes(`hreflang="zh-CN" href="https://qinlizhe.org/${file}"`));
  }
});

test("the discussion questions, existing English original and latest wording are preserved", async () => {
  const questions = await fs.readFile(path.join(root, "content/en/posts/questions-we-are-living-with.md"), "utf8");
  const originalQuestions = await fs.readFile(path.join(root, "content/posts/我们还没有答案的问题.md"), "utf8");
  assert.equal((questions.match(/^- /gm) || []).length, 77);
  assert.equal((questions.match(/^### /gm) || []).length, (originalQuestions.match(/^### /gm) || []).length);
  const existing = await fs.readFile(path.join(root, "content/posts/用zine重新思考精神医学：一次课堂实践.md"), "utf8");
  const zine = await fs.readFile(path.join(root, "content/en/posts/zines-and-psychiatry.md"), "utf8");
  assert.equal(zine.replace(/^# .+\n/, "").trim().replaceAll("../images/", "/images/"), existing.slice(existing.indexOf("\n\nIn an activity")).trim());
  const bench = await fs.readFile(path.join(out, "posts/the-mad-bench.html"), "utf8");
  assert.ok(bench.includes("坐冷板凳"));
  assert.ok(bench.includes("sit steadily on the mad bench"));
  assert.ok(!bench.includes("bench of madness"));
  const collaboration = await fs.readFile(path.join(out, "posts/collaboration-and-unequal-power.html"), "utf8");
  const collaborationBody = collaboration.match(/<div class="article-body" id="article-content">([\s\S]*?)<\/div>/)[1];
  assert.equal((collaborationBody.match(/Xinsheng Mind \(心声Mind\)/g) || []).length, 9);
  const reading = await fs.readFile(path.join(out, "posts/mad-studies-challenges-and-limits.html"), "utf8");
  assert.ok(reading.includes("not a verbatim quotation"));
});

test("production has no review artifacts and the preview remains explicitly non-indexable", async () => {
  await assert.rejects(fs.access(path.join(out, "review-manifest.json")));
  await assert.rejects(fs.access(path.join(out, "REVIEW.md")));
  const js = await fs.readFile(path.join(out, "site.js"), "utf8");
  assert.ok(!js.includes("fetch("));
  assert.ok(js.includes("qinlizhe-reading-preferences"));
  const home = await fs.readFile(path.join(out, "index.html"), "utf8");
  assert.ok(home.includes("All 10 pieces"));
  assert.ok(!home.includes("<form"));
  await buildEnglish({ out, preview: true });
  const preview = await fs.readFile(path.join(out, "index.html"), "utf8");
  assert.ok(preview.includes('name="robots" content="noindex,nofollow"'));
});
