import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const publicDir = path.join(root, "public");
const styleSource = path.join(root, "src", "styles.css");
const watch = process.argv.includes("--watch");

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(value = "") {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let blockquote = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushBlockquote = () => {
    if (!blockquote.length) return;
    html.push(`<blockquote>${blockquote.map((line) => `<p>${inlineMarkdown(line)}</p>`).join("")}</blockquote>`);
    blockquote = [];
  };

  const flushList = () => {
    if (!list) return;
    html.push(`<${list.type}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };

  const flushAll = () => {
    flushParagraph();
    flushBlockquote();
    flushList();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushAll();
      html.push("<hr>");
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      blockquote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      flushBlockquote();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push(unordered?.[1] || ordered?.[1]);
      continue;
    }

    flushBlockquote();
    flushList();
    paragraph.push(trimmed);
  }

  flushAll();
  return html.join("\n");
}

function slugify(filename) {
  return path
    .basename(filename, ".md")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function extractMeta(markdown, filename) {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((line) => line.startsWith("# "));
  const authorLine = lines.find((line) => line.startsWith("作者/公众号："));
  const dateLine = lines.find((line) => line.startsWith("发布时间："));
  const sourceLine = lines.find((line) => line.startsWith("原文链接："));
  const firstParagraph = lines.find((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("!") && !trimmed.includes("：");
  });

  return {
    title: titleLine?.replace(/^#\s+/, "").trim() || path.basename(filename, ".md"),
    author: authorLine?.replace("作者/公众号：", "").trim() || "亲历者Qinlizhe",
    date: dateLine?.replace("发布时间：", "").trim() || "",
    source: sourceLine?.replace("原文链接：", "").trim() || "",
    description: firstParagraph?.replace(/\*\*/g, "").trim() || "Reading Notes / Mad Studies 中文资源",
    slug: slugify(filename)
  };
}

function stripPostHeader(markdown) {
  const lines = markdown.split(/\r?\n/);
  let index = 0;

  if (lines[index]?.startsWith("# ")) index += 1;
  while (
    index < lines.length &&
    (lines[index].startsWith("作者/公众号：") ||
      lines[index].startsWith("发布时间：") ||
      lines[index].startsWith("原文链接：") ||
      lines[index].trim() === "")
  ) {
    index += 1;
  }

  return lines.slice(index).join("\n").trimStart();
}

async function ensureCleanDist() {
  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(path.join(dist, "posts"), { recursive: true });
  await fs.mkdir(path.join(dist, "assets"), { recursive: true });
}

async function copyPublic() {
  await fs.cp(publicDir, dist, { recursive: true, force: true });
  await fs.copyFile(styleSource, path.join(dist, "assets", "styles.css"));
}

async function collectPosts() {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = entries
    .filter((entry) => {
      const lower = entry.name.toLowerCase();
      return entry.isFile() && entry.name.endsWith(".md") && lower !== "readme.md";
    })
    .map((entry) => path.join(root, entry.name));

  const posts = [];
  for (const file of files) {
    const markdown = await fs.readFile(file, "utf8");
    const meta = extractMeta(markdown, file);
    const body = markdownToHtml(stripPostHeader(markdown));
    posts.push({ ...meta, body });
  }

  return posts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function layout({ title, description, content, bodyClass = "" }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body class="${bodyClass}">
  <header class="site-header">
    <a class="site-name" href="/">亲历者 Qinlizhe</a>
    <nav aria-label="主要导航">
      <a href="/">文章</a>
      <a href="/about.html">关于</a>
    </nav>
  </header>
  ${content}
  <footer class="site-footer">
    <p>Qinlizhe Mad Studies Collective · Reading Notes / Mad Studies 中文资源</p>
  </footer>
</body>
</html>`;
}

function renderIndex(posts) {
  const postCards = posts
    .map((post) => `<article class="post-list-item">
      <a href="/posts/${post.slug}.html">
        <span class="post-date">${escapeHtml(post.date)}</span>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(post.description)}</p>
      </a>
    </article>`)
    .join("\n");

  return layout({
    title: "亲历者 Qinlizhe",
    description: "Reading Notes / Mad Studies 中文资源",
    bodyClass: "home",
    content: `<main>
      <section class="intro">
        <p class="eyebrow">Reading Notes / Mad Studies 中文资源</p>
        <h1>亲历者自己的书写、翻译与资料存放处。</h1>
        <p>这里是 qinlizhe.org 的自留地。以文章为主，收纳精神健康、疯狂研究、亲历者知识与本土行动相关的文本。</p>
      </section>
      <section class="post-list" aria-label="文章列表">
        ${postCards || "<p>文章会放在这里。</p>"}
      </section>
    </main>`
  });
}

function renderPost(post) {
  const source = post.source
    ? `<p class="source"><a href="${escapeHtml(post.source)}" rel="noopener noreferrer">公众号原文</a></p>`
    : "";

  return layout({
    title: `${post.title} · 亲历者 Qinlizhe`,
    description: post.description,
    bodyClass: "article-page",
    content: `<main class="article-shell">
      <article class="article">
        <header class="article-header">
          <p class="eyebrow">${escapeHtml(post.author)}</p>
          <h1>${escapeHtml(post.title)}</h1>
          <div class="article-meta">
            <time>${escapeHtml(post.date)}</time>
            ${source}
          </div>
        </header>
        <div class="article-body">
          ${post.body}
        </div>
      </article>
    </main>`
  });
}

function renderAbout() {
  return layout({
    title: "关于 · 亲历者 Qinlizhe",
    description: "关于 qinlizhe.org",
    content: `<main class="article-shell">
      <article class="article compact">
        <header class="article-header">
          <p class="eyebrow">About</p>
          <h1>关于这个站点</h1>
        </header>
        <div class="article-body">
          <p>这里是亲历者 Qinlizhe 的自留地，用来存放 Reading Notes、Mad Studies 中文资源、翻译、评论与公共讨论文本。</p>
          <p>网站尽量保持轻、静、可迁移。公众号不方便承载的长文本，可以在这里留下来。</p>
        </div>
      </article>
    </main>`
  });
}

async function build() {
  await ensureCleanDist();
  await copyPublic();
  const posts = await collectPosts();

  await fs.writeFile(path.join(dist, "index.html"), renderIndex(posts));
  await fs.writeFile(path.join(dist, "about.html"), renderAbout());
  for (const post of posts) {
    await fs.writeFile(path.join(dist, "posts", `${post.slug}.html`), renderPost(post));
  }

  console.log(`Built ${posts.length} post(s) into ${dist}`);
}

await build();

if (watch) {
  console.log("Watching for changes. Press Ctrl+C to stop.");
  const timer = setInterval(async () => {
    const paths = [root, path.join(root, "src"), path.join(root, "public")];
    const mtimes = await Promise.all(
      paths.map(async (target) => {
        try {
          return (await fs.stat(target)).mtimeMs;
        } catch {
          return 0;
        }
      })
    );
    const stamp = mtimes.join(":");
    if (stamp !== globalThis.__lastBuildStamp) {
      globalThis.__lastBuildStamp = stamp;
      try {
        await build();
      } catch (error) {
        console.error(error);
      }
    }
  }, 1500);
  timer.unref?.();
}
