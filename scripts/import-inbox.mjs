import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inboxDir = path.join(root, "inbox");
const postsDir = path.join(root, "content", "posts");

function cleanTitle(value) {
  return value.replace(/^\*+|\*+$/g, "").trim();
}

function filenameFromTitle(title) {
  return cleanTitle(title)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function ensureHeader(markdown, fallbackTitle) {
  const lines = markdown.split(/\r?\n/);
  const hasTitle = lines.some((line) => line.startsWith("# "));
  const title = cleanTitle(
    lines.find((line) => line.trim())?.replace(/^#+\s*/, "") || fallbackTitle
  );

  if (hasTitle) return markdown;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  return `# ${title}

作者/公众号：亲历者Qinlizhe
发布时间：${today}

${markdown.trimStart()}`;
}

await fs.mkdir(postsDir, { recursive: true });
const entries = await fs.readdir(inboxDir, { withFileTypes: true });
const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md"));

if (!files.length) {
  console.log("No Markdown files found in inbox.");
  process.exit(0);
}

for (const file of files) {
  const source = path.join(inboxDir, file.name);
  const markdown = await fs.readFile(source, "utf8");
  const firstLine = markdown.split(/\r?\n/).find((line) => line.trim()) || file.name;
  const title = filenameFromTitle(firstLine.replace(/^#+\s*/, "")) || path.basename(file.name, ".md");
  const target = path.join(postsDir, `${title}.md`);

  await fs.writeFile(target, ensureHeader(markdown, title));
  await fs.rm(source);
  console.log(`Imported ${file.name} -> content/posts/${title}.md`);
}
