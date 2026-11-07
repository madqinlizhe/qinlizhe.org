import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { escapeHtml as e, markdownToHtml, slugify } from "./markdown.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadEnglishManifest() {
  return JSON.parse(await fs.readFile(path.join(root, "content/en/manifest.json"), "utf8"));
}

export async function buildEnglish({ out, preview = false }) {
  const sourceDir = path.join(root, "content/en");
  const manifest = await loadEnglishManifest();
  const categories = [
    { slug: "critique", name: "嬉笑怒骂", label: "Critique", description: "Mental-health discourse, institutional practice, and the politics of knowledge." },
    { slug: "reading", name: "狂人读报", label: "Reading", description: "Research, literature, and ideas in conversation." },
    { slug: "practice", name: "旁门左道", label: "Practice", description: "Projects, encounters, and work on the ground." },
    { slug: "notes", name: "疯言疯语", label: "Notes", description: "Essays, reflections, and ideas." }
  ];
  const icon = (name) => `<i class="icon ${name}" aria-hidden="true"></i>`;
  const posts = [];
  for (const entry of manifest.posts) {
    const original = await fs.readFile(path.join(root, "content/posts", entry.source), "utf8");
    const sourceHash = createHash("sha256").update(original).digest("hex");
    if (entry.sourceHash !== sourceHash) {
      if (preview) throw new Error(`Chinese source changed; review the translation before rebuilding: ${entry.source}`);
      console.warn(`English translation is based on an earlier Chinese revision: ${entry.source}`);
    }
    const markdown = await fs.readFile(path.join(sourceDir, "posts", `${entry.slug}.md`), "utf8");
    const title = markdown.match(/^# (.+)$/m)?.[1];
    if (!title) throw new Error(`Missing title: ${entry.slug}`);
    const date = original.match(/^发布时间：(.+)$/m)?.[1].trim();
    const sourceTitle = original.match(/^# (.+)$/m)?.[1];
    posts.push({ ...entry, title, date, sourceTitle, author: entry.author ?? "Qinlizhe", body: markdownToHtml(markdown.replace(/^# .+\r?\n/, "").trim()), text: markdown, sourceHash, chinese: `https://qinlizhe.org/posts/${encodeURIComponent(slugify(entry.source))}.html` });
  }
  posts.sort((a, b) => b.date.localeCompare(a.date));
  const extraCss = await fs.readFile(path.join(root, "src/english.css"), "utf8");
  const englishJs = await fs.readFile(path.join(root, "src/english.js"), "utf8");
  const version = createHash("sha256").update(await fs.readFile(path.join(root, "src/styles.css"))).update(extraCss).update(englishJs).digest("hex").slice(0, 12);

  function page(route, title, content, active = "", chinese) {
    chinese ||= "https://qinlizhe.org" + (route === "index.html" ? "/" : "/" + route);
    const canonical = "https://qinlizhe.org/en/" + (route === "index.html" ? "" : route);
    const description = posts.find((p) => route === `posts/${p.slug}.html`)?.description || "Writing and witnessing. Mad Studies, experiential knowledge, and action.";
    const rel = (target) => path.posix.relative(path.posix.dirname(route), target) || "index.html";
    const nav = categories.map((c) => `<a href="${rel(`categories/${c.slug}.html`)}"${active === c.slug ? ' aria-current="page"' : ""}><span>${c.name}</span><small lang="en">${c.label}</small></a>`).join("");
    const search = JSON.stringify(posts.map((p) => ({ title: p.title, description: p.description, category: categories.find((c) => c.slug === p.category).label, date: p.date, text: p.text, url: rel(`posts/${p.slug}.html`) }))).replaceAll("<", "\\u003c");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${preview ? '<meta name="robots" content="noindex,nofollow">' : ""}<meta name="description" content="${e(description)}"><link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="en" href="${canonical}"><link rel="alternate" hreflang="zh-CN" href="${chinese}"><title>${e(title)} · Qinlizhe</title><link rel="stylesheet" href="${rel("assets/styles.css")}?v=${version}"><script src="${rel("site.js")}?v=${version}" defer></script></head><body class="edition-en"><a class="skip" href="#main">Skip to content</a><header class="wrapper site-header"><div class="utility"><span>QINLIZHE RESEARCH · ENGLISH EDITION${preview ? " · REVIEW DRAFT" : ""}</span><div class="tools"><nav class="language-switch" aria-label="Language"><a href="${chinese}" lang="zh-CN" hreflang="zh-CN">中文</a><span aria-hidden="true">/</span><span lang="en" aria-current="page">EN</span></nav><button class="icon-button" data-action="search" aria-label="Search articles" data-tip="Search">${icon("search")}</button><button class="icon-button" data-action="theme" aria-label="Toggle dark mode" data-tip="Light / dark">${icon("moon")}</button></div></div><div class="masthead"><a class="wordmark" href="${rel("index.html")}"><span lang="zh-CN">亲历者<span class="wordmark-dot">.</span></span><small>Qinlizhe</small></a><div class="masthead-description"><strong>Writing and witnessing</strong><p>Mad Studies, experiential knowledge, and action.</p></div></div><nav class="navigation" aria-label="Main navigation"><a href="${rel("index.html")}"${active === "home" ? ' aria-current="page"' : ""}>Latest</a>${nav}<span class="nav-space"></span><a href="${rel("about.html")}" data-nav="about">About</a></nav></header>${content}<section class="newsletter wrapper"><div><h2>Stay in touch</h2><p>News and writing from Qinlizhe.</p></div><a class="subscribe-button" href="https://buttondown.com/qinlizheorg">Subscribe on Buttondown${icon("arrow-up-right")}</a></section><footer class="wrapper footer"><a href="${rel("index.html")}">亲历者 Qinlizhe</a><a href="${rel("about.html")}">About</a><span>An independent space.</span><a href="${rel("all.html")}">All writing${icon("arrow-up-right")}</a></footer><dialog class="search-dialog" id="search-dialog" aria-labelledby="search-label"><div class="dialog-top"><h2 id="search-label">Search articles</h2><button class="icon-button" data-action="close-search" aria-label="Close search">${icon("x")}</button></div><label class="search-input">${icon("search")}<input type="search" id="search-input" placeholder="Title, subject, phrase" aria-label="Search titles and text"></label><div id="search-results" aria-live="polite"></div></dialog><script type="application/json" id="search-data">${search}</script></body></html>`;
  }
  const dateLabel = (date) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  function story(post, prefix = "") {
    return `<article class="story"><a href="${prefix}posts/${post.slug}.html"><div class="story-meta"><span class="story-category">${categories.find((c) => c.slug === post.category).label}</span><time datetime="${post.date}">${dateLabel(post.date)}</time></div><h3>${e(post.title)}</h3><p>${e(post.description)}</p></a></article>`;
  }
  await fs.mkdir(path.join(out, "posts"), { recursive: true });
  await fs.mkdir(path.join(out, "categories"), { recursive: true });
  await fs.mkdir(path.join(out, "assets"), { recursive: true });
  await fs.cp(path.join(root, "public/icons"), path.join(out, "icons"), { recursive: true });
  await fs.cp(path.join(root, "public/images/zines-rethink-psychiatry"), path.join(out, "images/zines-rethink-psychiatry"), { recursive: true });
  const css = (await fs.readFile(path.join(root, "src/styles.css"), "utf8")).replaceAll("url('/icons/", "url('../icons/");
  await fs.writeFile(path.join(out, "assets/styles.css"), `${css}\n${extraCss}`);
  await fs.writeFile(path.join(out, "site.js"), englishJs);
  const feature = posts[0];
  const zine = posts.find((p) => p.kind === "english-original");
  const home = `<main class="wrapper" id="main"><section class="lead"><article class="lead-feature"><p class="eyebrow">New writing<time datetime="${feature.date}">${dateLabel(feature.date)}</time></p><h1><a href="posts/${feature.slug}.html">${e(feature.title)}</a></h1><p class="standfirst">${e(feature.description)}</p><a class="read-link" href="posts/${feature.slug}.html">Read the essay${icon("arrow-right")}</a></article><aside class="feature-sidebar"><p class="eyebrow">Practice</p><a class="image-link" href="posts/${zine.slug}.html"><img class="practice-image" src="images/zines-rethink-psychiatry/zine-3.jpg" alt="A zine poem about mental health and society"></a><h2><a href="posts/${zine.slug}.html">${e(zine.title)}</a></h2><p>${e(zine.description)}</p><a class="read-link" href="posts/${zine.slug}.html">Read the account${icon("arrow-up-right")}</a></aside></section><section><div class="section-heading"><h2>More writing</h2><a href="all.html">All ${posts.length} pieces${icon("arrow-right")}</a></div><div class="recent-grid">${posts.slice(1).map((p) => story(p)).join("")}</div></section><section class="browse-section"><div class="section-heading"><h2>Explore more</h2></div><div class="category-grid">${categories.map((c) => `<a class="category-link" href="categories/${c.slug}.html"><div class="category-title"><h3 lang="zh-CN">${c.name}</h3><span>${String(posts.filter((p) => p.category === c.slug).length).padStart(2, "0")}</span></div><small>${c.label}</small><p>${c.description}</p></a>`).join("")}</div></section></main>`;
  await fs.writeFile(path.join(out, "index.html"), page("index.html", "Writing and witnessing", home, "home"));
  await fs.writeFile(path.join(out, "about.html"), page("about.html", "About", `<main class="wrapper" id="main"><article class="about-content"><p class="eyebrow">亲历者 Qinlizhe</p><h1>About this space</h1><p>We are people carrying hurt and resentment who still care deeply about mental health. For us, qinlizhe (亲历者) means not only having experienced things ourselves, but also having witnessed them first-hand.</p><p>This is an independent space for notes, criticism, and resources connected with Mad Studies, preserving voices at the margins that refuse to be absorbed.</p><p>We retain Qinlizhe as our name. It is not a fixed translation of survivor, service user, or lived experience. Its meanings emerge through particular lives, relationships, and struggles, including disagreements among us.</p><p>These English essays enter conversation with people working in Mad Studies, survivor research, and collective action across languages. We write from Chinese-speaking settings and from encounters elsewhere, without claiming one voice for China or one path everyone must follow.</p></article></main>`, "about"));
  for (const category of [null, ...categories]) {
    const route = category ? `categories/${category.slug}.html` : "all.html";
    const selected = category ? posts.filter((p) => p.category === category.slug) : posts;
    const content = `<main class="wrapper" id="main"><header class="archive-header"><p class="eyebrow">${selected.length} pieces</p><h1>${category ? `${category.name} / ${category.label}` : "All writing"}</h1><p>${category?.description || "Essays, arguments, questions, and encounters."}</p></header><section class="archive-list">${selected.map((p) => story(p, category ? "../" : "")).join("") || '<p class="empty-note">No English selection in this section yet.</p>'}</section></main>`;
    await fs.writeFile(path.join(out, route), page(route, category?.label || "All writing", content, category?.slug));
  }
  for (const post of posts) {
    const c = categories.find((item) => item.slug === post.category);
    const content = `<main class="wrapper" id="main"><div class="reading-bar"><a class="back-link" href="../index.html">${icon("arrow-left")}Home</a><div class="reading-controls" aria-label="Text size"><button class="icon-button" data-action="smaller" aria-label="Smaller text" data-tip="Smaller text">${icon("minus")}</button><span id="reading-size">20px</span><button class="icon-button" data-action="larger" aria-label="Larger text" data-tip="Larger text">${icon("plus")}</button></div></div><article class="article"><header class="article-header"><p class="eyebrow">${c.label}<time datetime="${post.date}">${dateLabel(post.date)}</time></p><h1>${e(post.title)}</h1><p class="description">${e(post.description)}</p><div class="article-byline">${post.author ? `<span>${e(post.author)}</span>` : ""}<a class="source-link" href="${post.chinese}" >Read in Chinese${icon("arrow-up-right")}</a></div><p class="translation-note">${post.kind === "english-original" ? "Original English text" : "English translation prepared with AI assistance."}</p></header>${post.context ? `<aside class="context-note" aria-label="Editorial context">${e(post.context)}</aside>` : ""}<div class="article-body" id="article-content">${post.body}</div><div class="article-end"><a href="../categories/${c.slug}.html">More ${c.label.toLowerCase()}${icon("arrow-right")}</a><a href="../all.html">All writing${icon("arrow-up-right")}</a></div></article></main>`;
    await fs.writeFile(path.join(out, "posts", `${post.slug}.html`), page(`posts/${post.slug}.html`, post.title, content, post.category, post.chinese));
  }
  return posts;
}
