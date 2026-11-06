(() => {
  const root = document.documentElement;
  const dialog = document.getElementById("search-dialog");
  const searchInput = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  const preferenceKey = "qinlizhe-reading-preferences";
  const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  let readingSize = Number.parseInt(root.style.getPropertyValue("--reading-size"), 10) || 20;
  let searchIndex;

  function savePreferences() {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ dark: root.classList.contains("dark"), size: readingSize })); } catch {}
  }

  function syncControls() {
    const themeButton = document.querySelector('[data-action="theme"]');
    const dark = root.classList.contains("dark");
    themeButton.innerHTML = `<i class="icon ${dark ? "sun" : "moon"}" aria-hidden="true"></i>`;
    themeButton.setAttribute("aria-pressed", String(dark));
    const label = document.getElementById("reading-size");
    if (label) label.textContent = `${readingSize}px`;
    document.querySelectorAll('[data-action="smaller"]').forEach((button) => { button.disabled = readingSize <= 18; });
    document.querySelectorAll('[data-action="larger"]').forEach((button) => { button.disabled = readingSize >= 26; });
  }

  async function loadIndex() {
    if (!searchIndex) {
      searchIndex = fetch(`/assets/search.json?v=${encodeURIComponent(root.dataset.assets)}`)
        .then((response) => { if (!response.ok) throw new Error("Search index unavailable"); return response.json(); })
        .catch((error) => { searchIndex = undefined; throw error; });
    }
    return searchIndex;
  }

  async function search() {
    results.setAttribute("aria-busy", "true");
    try {
      const posts = await loadIndex();
      const query = searchInput.value.trim().toLocaleLowerCase();
      const matches = query ? posts.filter((post) => `${post.title} ${post.category} ${post.description} ${post.text}`.toLocaleLowerCase().includes(query)) : posts.slice(0, 5);
      results.innerHTML = matches.length ? matches.map((post) => `<article class="story"><a href="${escapeHtml(post.url)}"><div class="story-meta"><span class="story-category">${escapeHtml(post.category)}</span><time>${escapeHtml(post.date.replaceAll("-", "."))}</time></div><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.description)}</p></a></article>`).join("") : '<p class="empty-results">没有找到相关文章。</p>';
    } catch {
      results.innerHTML = '<p class="empty-results">暂时无法加载搜索。<a href="/all.html">浏览全部文章</a></p>';
    } finally {
      results.removeAttribute("aria-busy");
    }
  }

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "search") { dialog.showModal(); search(); searchInput.focus(); }
    if (action === "close-search") dialog.close();
    if (action === "theme") { root.classList.toggle("dark"); syncControls(); savePreferences(); }
    if (action === "smaller" || action === "larger") {
      readingSize = Math.max(18, Math.min(26, readingSize + (action === "larger" ? 2 : -2)));
      root.style.setProperty("--reading-size", `${readingSize}px`);
      syncControls(); savePreferences();
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  searchInput.addEventListener("input", search);

  const headings = [...document.querySelectorAll(".article-body h2,.article-body h3")];
  if (headings.length > 2) {
    const toc = document.createElement("details");
    toc.className = "toc";
    toc.innerHTML = "<summary>本文目录</summary>";
    headings.forEach((heading, index) => {
      heading.id = `section-${index}`;
      const link = document.createElement("a");
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent;
      toc.append(link);
    });
    document.querySelector(".article-header").after(toc);
  }
  syncControls();
})();
