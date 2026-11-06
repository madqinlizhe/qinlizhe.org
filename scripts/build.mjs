import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownToHtml, slugify } from "./markdown.mjs";
import { createHash } from "node:crypto";
import { categories, postUrl, renderIndex, renderCategoryPage, renderPost, renderAbout, renderAll } from "./render.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const publicDir = path.join(root, "public");
const styleSource = path.join(root, "src", "styles.css");
const contentDir = path.join(root, "content", "posts");
const watch = process.argv.includes("--watch");
function extractMeta(markdown, filename) {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((line) => line.startsWith("# "));
  const authorLine = lines.find((line) => line.startsWith("作者/公众号："));
  const dateLine = lines.find((line) => line.startsWith("发布时间："));
  const sourceLine = lines.find((line) => line.startsWith("原文链接："));
  const categoryLine = lines.find((line) => line.startsWith("栏目："));
  const descriptionLine = lines.find((line) => line.startsWith("摘要："));
  const firstParagraph = lines.find((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("!") && !trimmed.includes("：");
  });

  return {
    title: titleLine?.replace(/^#\s+/, "").trim() || path.basename(filename, ".md"),
    author: authorLine?.replace("作者/公众号：", "").trim() || "",
    date: dateLine?.replace("发布时间：", "").trim() || "",
    source: sourceLine?.replace("原文链接：", "").trim() || "",
    category: categoryLine?.replace("栏目：", "").trim() || "疯言疯语",
    description: descriptionLine?.replace("摘要：", "").trim() || firstParagraph?.replace(/\*\*/g, "").trim() || "qinlizhe research · mad studies in China",
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
      lines[index].startsWith("摘要：") ||
      lines[index].startsWith("邮件通知：") ||
      lines[index].trim() === "")
  ) {
    index += 1;
  }

  return lines.slice(index).join("\n").trimStart();
}

async function ensureCleanDist() {
  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(path.join(dist, "posts"), { recursive: true });
  await fs.mkdir(path.join(dist, "categories"), { recursive: true });
  await fs.mkdir(path.join(dist, "assets"), { recursive: true });
}

async function copyPublic() {
  await fs.cp(publicDir, dist, { recursive: true, force: true });
  await fs.copyFile(styleSource, path.join(dist, "assets", "styles.css"));
}

async function collectPosts() {
  let contentFiles = [];
  try {
    const contentEntries = await fs.readdir(contentDir, { withFileTypes: true });
    contentFiles = contentEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(contentDir, entry.name));
  } catch {
    contentFiles = [];
  }

  const posts = [];
  for (const file of contentFiles) {
    const markdown = await fs.readFile(file, "utf8");
    const meta = extractMeta(markdown, file);
    const body = markdownToHtml(stripPostHeader(markdown));
    posts.push({ ...meta, body, text: stripPostHeader(markdown) });
  }

  return posts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

async function build() {
  await ensureCleanDist();
  await copyPublic();
  const posts = await collectPosts();
  const version = createHash("sha256")
    .update(await fs.readFile(styleSource))
    .update(await fs.readFile(path.join(publicDir, "site.js")))
    .digest("hex").slice(0, 12);

  await fs.writeFile(path.join(dist, "index.html"), renderIndex(posts, version));
  await fs.writeFile(path.join(dist, "about.html"), renderAbout(version));
  await fs.writeFile(path.join(dist, "all.html"), renderAll(posts, version));
  await fs.writeFile(path.join(dist, "assets", "search.json"), JSON.stringify(posts.map((post) => ({
    title: post.title, category: post.category, description: post.description, date: post.date,
    url: postUrl(post), text: post.text
  }))));
  for (const category of categories) {
    await fs.writeFile(path.join(dist, "categories", `${category.slug}.html`), renderCategoryPage(category, posts, version));
  }
  for (const post of posts) {
    await fs.writeFile(path.join(dist, "posts", `${post.slug}.html`), renderPost(post, version));
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
