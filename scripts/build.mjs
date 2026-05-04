import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const publicDir = path.join(root, "public");
const styleSource = path.join(root, "src", "styles.css");
const contentDir = path.join(root, "content", "posts");
const watch = process.argv.includes("--watch");
const categories = [
  {
    name: "嬉笑怒骂",
    description: "批评国内外精神健康话语、机构实践与知识生产。"
  },
  {
    name: "旁门左道",
    description: "亲历者研究、疯狂研究相关文献与实践速递。"
  },
  {
    name: "疯言疯语",
    description: "随笔、感想、短札，以及一些未完成的想法。"
  }
];

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
  const categoryLine = lines.find((line) => line.startsWith("栏目："));
  const firstParagraph = lines.find((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("!") && !trimmed.includes("：");
  });

  return {
    title: titleLine?.replace(/^#\s+/, "").trim() || path.basename(filename, ".md"),
    author: authorLine?.replace("作者/公众号：", "").trim() || "亲历者Qinlizhe",
    date: dateLine?.replace("发布时间：", "").trim() || "",
    source: sourceLine?.replace("原文链接：", "").trim() || "",
    category: categoryLine?.replace("栏目：", "").trim() || "疯言疯语",
    description: firstParagraph?.replace(/\*\*/g, "").trim() || "qinlizhe research · mad studies in China",
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
      lines[index].startsWith("栏目：") ||
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
  const rootEntries = await fs.readdir(root, { withFileTypes: true });
  const rootFiles = rootEntries
    .filter((entry) => {
      const lower = entry.name.toLowerCase();
      return entry.isFile() && entry.name.endsWith(".md") && lower !== "readme.md";
    })
    .map((entry) => path.join(root, entry.name));

  let contentFiles = [];
  try {
    const contentEntries = await fs.readdir(contentDir, { withFileTypes: true });
    contentFiles = contentEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(contentDir, entry.name));
  } catch {
    contentFiles = [];
  }

  const files = [...rootFiles, ...contentFiles];

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
    <p>qinlizhe research · mad studies in China</p>
  </footer>
</body>
</html>`;
}

function renderIndex(posts) {
  const categorySections = categories
    .map((category) => {
      const categoryPosts = posts.filter((post) => post.category === category.name);
      const postCards = categoryPosts
        .map((post) => `<article class="post-list-item">
          <a href="/posts/${post.slug}.html">
            <span class="post-date">${escapeHtml(post.date)}</span>
            <h3>${escapeHtml(post.title)}</h3>
            <p>${escapeHtml(post.description)}</p>
          </a>
        </article>`)
        .join("\n");

      return `<section class="category-section" id="${slugify(category.name)}">
        <header class="category-header">
          <h2>${escapeHtml(category.name)}</h2>
          <p>${escapeHtml(category.description)}</p>
        </header>
        <div class="post-list">
          ${postCards || '<p class="empty-note">文章会放在这里。</p>'}
        </div>
      </section>`;
    })
    .join("\n");

  return layout({
    title: "亲历者 Qinlizhe",
    description: "qinlizhe research · mad studies in China",
    bodyClass: "home",
    content: `<main>
      <section class="intro">
        <p class="eyebrow">qinlizhe research · mad studies in China</p>
        <h1>亲历者自己的书写、见证与资料存放处。</h1>
        <p>亲历者的自留地。收纳精神健康、疯狂研究、亲历者知识与本土行动相关文本。</p>
      </section>
      <nav class="category-nav" aria-label="栏目导航">
        ${categories.map((category) => `<a href="#${slugify(category.name)}">${escapeHtml(category.name)}</a>`).join("")}
      </nav>
      ${categorySections}
    </main>`
  });
}

function renderPost(post) {
  const sourceLabel = post.source.includes("doi.org") ? "原文 DOI" : "公众号原文";
  const source = post.source
    ? `<p class="source"><a href="${escapeHtml(post.source)}" rel="noopener noreferrer">${sourceLabel}</a></p>`
    : "";

  return layout({
    title: `${post.title} · 亲历者 Qinlizhe`,
    description: post.description,
    bodyClass: "article-page",
    content: `<main class="article-shell">
      <article class="article">
        <header class="article-header">
          <p class="eyebrow">${escapeHtml(post.category)} · ${escapeHtml(post.author)}</p>
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
          <p>我们是一些心有委屈与不甘、却仍对精神健康事业抱有热情的亲历者。“亲历者”不仅意味着亲身经历，也意味着一手的见证。这里是一片自留地，用来保存笔记、评论与疯狂研究 Mad Studies 相关资源，为中文读者留下不被收编的边缘声音。</p>
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
