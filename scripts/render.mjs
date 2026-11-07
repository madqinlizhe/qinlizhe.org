import { escapeHtml } from "./markdown.mjs";

export const categories = [
  { slug: "critique", name: "嬉笑怒骂", description: "批评国内外精神健康话语、机构实践与知识生产。" },
  { slug: "reading", name: "狂人读报", description: "文献、研究与思想速递。" },
  { slug: "practice", name: "旁门左道", description: "实践现场、具体项目与行动记录。" },
  { slug: "notes", name: "疯言疯语", description: "随笔、感想、点子" }
];

const icon = (name) => `<i class="icon ${name}" aria-hidden="true"></i>`;
export const postUrl = (post) => `/posts/${encodeURIComponent(post.slug)}.html`;
const dateLabel = (date) => escapeHtml(date.replaceAll("-", "."));

function newsletter() {
  return `<section class="newsletter wrapper" aria-label="订阅更新">
    <div><h2>订阅更新</h2><p>有些文章公众号不会发，只会在网站发。</p></div>
    <form action="https://buttondown.com/api/emails/embed-subscribe/qinlizheorg" method="post" target="_blank" class="subscribe-form embeddable-buttondown-form">
      <label class="sr-only" for="bd-email">邮箱地址</label>
      <div class="subscribe-controls"><input type="email" name="email" id="bd-email" placeholder="你的邮箱地址" autocomplete="email" required><button class="subscribe-button" type="submit">${icon("mail")}订阅更新${icon("arrow-up-right")}</button></div>
      <p class="subscribe-powered"><a href="https://buttondown.com/refer/qinlizheorg" target="_blank" rel="noopener noreferrer">Powered by Buttondown.</a></p>
    </form>
  </section>`;
}

function layout({ title, description, content, bodyClass = "", active = "", pathname = "/", englishPath = "/en/", translated = true }, version) {
  const nav = [{ slug: "home", name: "最新", url: "/" }, ...categories.map((category) => ({ ...category, url: `/categories/${category.slug}.html` }))];
  return `<!doctype html>
<html lang="zh-CN" data-assets="${version}">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="https://qinlizhe.org${pathname}">
  <link rel="alternate" hreflang="zh-CN" href="https://qinlizhe.org${pathname}">${translated ? `<link rel="alternate" hreflang="en" href="https://qinlizhe.org${englishPath}">` : ""}
  <script>try{const p=JSON.parse(localStorage.getItem('qinlizhe-reading-preferences')||'{}');if(p.dark)document.documentElement.classList.add('dark');if(p.size)document.documentElement.style.setProperty('--reading-size',Math.max(18,Math.min(26,Number(p.size)||20))+'px')}catch{}</script>
  <link rel="stylesheet" href="/assets/styles.css?v=${version}"><script src="/site.js?v=${version}" defer></script>
</head>
<body class="${bodyClass}">
  <a class="skip" href="#main">跳到正文</a>
  <header class="site-header wrapper">
    <div class="utility"><span>QINLIZHE RESEARCH · MAD STUDIES IN CHINA</span><div class="tools"><nav class="language-switch" aria-label="语言"><span lang="zh-CN" aria-current="page">中文</span><span aria-hidden="true">/</span><a href="${englishPath}" lang="en" hreflang="en">EN</a></nav><button class="icon-button" data-action="search" aria-label="搜索文章" data-tip="搜索文章">${icon("search")}</button><button class="icon-button" data-action="theme" aria-label="切换明暗" data-tip="切换明暗">${icon("moon")}</button></div></div>
    <div class="masthead"><a class="wordmark" href="/"><span>亲历者<span class="wordmark-dot">.</span></span><small>Qinlizhe</small></a><div class="masthead-description"><strong>亲历者的书写和见证</strong><p>精神健康、疯狂研究、亲历者知识与本土行动。</p></div></div>
    <nav class="navigation" aria-label="主要导航">${nav.map((item) => `<a href="${item.url}" data-nav="${item.slug}"${active === item.slug ? ' aria-current="page"' : ""}>${item.name}</a>`).join("")}<span class="nav-space"></span><a href="/about.html" data-nav="about"${active === "about" ? ' aria-current="page"' : ""}>关于</a><a class="nav-subscribe" href="#subscribe">邮件订阅${icon("arrow-up-right")}</a></nav>
  </header>
  ${content}
  <div id="subscribe">${newsletter()}</div>
  <footer class="wrapper footer"><a href="/">亲历者 Qinlizhe</a><span>亲历者的自留地。</span><a href="/all.html">全部文章${icon("arrow-up-right")}</a></footer>
  <dialog class="search-dialog" id="search-dialog" aria-labelledby="search-label"><div class="dialog-top"><h2 id="search-label">搜索文章</h2><button class="icon-button" data-action="close-search" aria-label="关闭搜索" data-tip="关闭">${icon("x")}</button></div><label class="search-input">${icon("search")}<input type="search" id="search-input" placeholder="标题、摘要、关键词" autocomplete="off" aria-label="搜索标题和正文"></label><div id="search-results" aria-live="polite"></div></dialog>
</body></html>`;
}

function story(post) {
  return `<article class="story"><a href="${postUrl(post)}"><div class="story-meta"><span class="story-category">${escapeHtml(post.category)}</span><time datetime="${escapeHtml(post.date)}">${dateLabel(post.date)}</time></div><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.description)}</p></a></article>`;
}

function categoryLinks(posts) {
  return categories.map((category) => `<a class="category-link" href="/categories/${category.slug}.html"><div class="category-title"><h3>${category.name}</h3><span>${String(posts.filter((post) => post.category === category.name).length).padStart(2, "0")}</span></div><p>${category.description}</p></a>`).join("");
}

export function renderIndex(posts, version) {
  const feature = posts[0];
  const practice = posts.find((post) => post.category === "旁门左道") || posts.find((post) => post !== feature);
  const image = practice?.body.includes('/images/zines-rethink-psychiatry/zine-3.jpg')
    ? ["", "/images/zines-rethink-psychiatry/zine-3.jpg"]
    : practice?.body.match(/<img src="([^"]+)"/);
  const featureQuote = feature?.body.match(/<p>(我为什么还留在这里[^<]+)<\/p>/)?.[1] || escapeHtml(feature?.description || "");
  return layout({
    title: "亲历者 Qinlizhe", description: "亲历者的书写和见证。精神健康、疯狂研究、亲历者知识与本土行动。", bodyClass: "home", active: "home",
    content: `<main id="main" class="wrapper" tabindex="-1">
      ${feature ? `<section class="lead" aria-label="新近书写"><article class="lead-feature"><p class="eyebrow">新近书写<span>／</span>${escapeHtml(feature.category)}<time datetime="${escapeHtml(feature.date)}">${dateLabel(feature.date)}</time></p><h1><a href="${postUrl(feature)}">${escapeHtml(feature.title)}</a></h1><p class="standfirst">${featureQuote}</p><a class="read-link" href="${postUrl(feature)}">读这篇文章${icon("arrow-right")}</a></article>${practice ? `<aside class="feature-sidebar"><p class="eyebrow">${escapeHtml(practice.category)}<span>／</span>实践与行动</p>${image ? `<a class="image-link" href="${postUrl(practice)}" aria-label="${escapeHtml(practice.title)}"><img class="practice-image" src="${escapeHtml(image[1])}" alt="小志作品" loading="eager"></a>` : ""}<h2><a href="${postUrl(practice)}">${escapeHtml(practice.title)}</a></h2><p>${escapeHtml(practice.description)}</p><a class="read-link" href="${postUrl(practice)}">走进实践现场${icon("arrow-up-right")}</a></aside>` : ""}</section>` : '<p class="empty-note">文章会放在这里。</p>'}
      <section aria-labelledby="recent-heading"><div class="section-heading"><h2 id="recent-heading">最近更新</h2><a href="/all.html">全部文章${icon("arrow-right")}</a></div><div class="recent-grid">${posts.slice(1, 7).map(story).join("")}</div></section>
      <section class="browse-section" aria-labelledby="browse-heading"><div class="section-heading"><h2 id="browse-heading">探索更多</h2></div><div class="category-grid">${categoryLinks(posts)}</div></section>
    </main>`
  }, version);
}

function archiveContent(posts, category) {
  const items = category ? posts.filter((post) => post.category === category.name) : posts;
  return `<main id="main" class="wrapper" tabindex="-1"><section class="archive-header"><p class="eyebrow">亲历者的书写和见证<span>／</span>${items.length} 篇</p><h1>${category ? category.name : "全部文章"}</h1><p>${category ? category.description : "笔记、评论、随笔与实践记录。"}</p></section><div class="archive-layout"><section class="archive-list" aria-label="文章列表">${items.map(story).join("") || '<p class="empty-note">文章会放在这里。</p>'}</section><aside class="archive-aside"><h2>按栏目阅读</h2>${categories.map((item) => `<a href="/categories/${item.slug}.html">${item.name}<span>${posts.filter((post) => post.category === item.name).length}</span></a>`).join("")}</aside></div></main>`;
}

export function renderCategoryPage(category, posts, version) {
  return layout({ title: `${category.name} · 亲历者 Qinlizhe`, description: category.description, bodyClass: "category-page", active: category.slug, pathname: `/categories/${category.slug}.html`, englishPath: `/en/categories/${category.slug}.html`, content: archiveContent(posts, category) }, version);
}

export function renderAll(posts, version) {
  return layout({ title: "全部文章 · 亲历者 Qinlizhe", description: "亲历者的全部文章、笔记、评论与实践记录。", bodyClass: "archive-page", pathname: "/all.html", englishPath: "/en/all.html", content: archiveContent(posts) }, version);
}

export function renderPost(post, version) {
  const category = categories.find((item) => item.name === post.category);
  return layout({
    title: `${post.title} · 亲历者 Qinlizhe`, description: post.description, bodyClass: "article-page", active: category?.slug, pathname: postUrl(post), englishPath: post.englishPath || "/en/", translated: Boolean(post.englishPath),
    content: `<main id="main" class="wrapper" tabindex="-1"><div class="reading-bar"><a class="back-link" href="/">${icon("arrow-left")}返回首页</a><div class="reading-controls" aria-label="正文字号"><button class="icon-button" data-action="smaller" aria-label="缩小字号" data-tip="缩小字号">${icon("minus")}</button><span id="reading-size">20px</span><button class="icon-button" data-action="larger" aria-label="放大字号" data-tip="放大字号">${icon("plus")}</button></div></div><article class="article"><header class="article-header"><p class="eyebrow">${escapeHtml(post.category)}<time datetime="${escapeHtml(post.date)}">${dateLabel(post.date)}</time></p><h1>${escapeHtml(post.title)}</h1><p class="description">${escapeHtml(post.description)}</p><div class="article-byline">${post.author ? `<span>${escapeHtml(post.author)}</span>` : ""}${post.source ? `<a href="${escapeHtml(post.source)}" target="_blank" rel="noopener noreferrer">${post.source.includes("doi.org") ? "原文 DOI" : "原文链接"}${icon("arrow-up-right")}</a>` : ""}</div></header><div id="article-content" class="article-body">
${post.body}
</div><div class="article-end"><a href="${category ? `/categories/${category.slug}.html` : "/all.html"}">更多${escapeHtml(post.category)}${icon("arrow-right")}</a><a href="/">${icon("arrow-left")}返回首页</a></div></article></main>`
  }, version);
}

export function renderAbout(version) {
  return layout({ title: "关于 · 亲历者 Qinlizhe", description: "关于 qinlizhe.org", bodyClass: "about-page", active: "about", pathname: "/about.html", englishPath: "/en/about.html", content: `<main id="main" class="wrapper" tabindex="-1"><article class="about-content"><p class="eyebrow">亲历者 Qinlizhe</p><h1>关于这个站点</h1><p>我们是一些心有委屈与不甘、却仍对精神健康事业抱有热情的亲历者。“亲历者”不仅意味着亲身经历，也意味着一手的见证。</p><p>这里是一片自留地，用来保存笔记、评论与疯狂研究 Mad Studies 相关资源，为中文读者留下不被收编的边缘声音。</p></article></main>` }, version);
}
