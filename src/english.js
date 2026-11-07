(() => {
  const root = document.documentElement;
  const dialog = document.getElementById("search-dialog");
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  const posts = JSON.parse(document.getElementById("search-data").textContent);
  const escape = (text) => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  let size = 20;
  try {
    const preferences = JSON.parse(localStorage.getItem("qinlizhe-reading-preferences") || "{}");
    root.classList.toggle("dark", Boolean(preferences.dark));
    size = Math.max(18, Math.min(26, Number(preferences.size) || 20));
  } catch {}
  function sync() {
    root.style.setProperty("--reading-size", `${size}px`);
    const label = document.getElementById("reading-size");
    if (label) label.textContent = `${size}px`;
    const button = document.querySelector('[data-action="theme"]');
    const dark = root.classList.contains("dark");
    button.setAttribute("aria-pressed", String(dark));
    button.innerHTML = `<i class="icon ${dark ? "sun" : "moon"}" aria-hidden="true"></i>`;
    for (const b of document.querySelectorAll('[data-action="smaller"]')) b.disabled = size <= 18;
    for (const b of document.querySelectorAll('[data-action="larger"]')) b.disabled = size >= 26;
    try { localStorage.setItem("qinlizhe-reading-preferences", JSON.stringify({ dark, size })); } catch {}
  }
  function search() {
    const query = input.value.trim().toLocaleLowerCase();
    const matches = query ? posts.filter((p) => `${p.title} ${p.category} ${p.description} ${p.text}`.toLocaleLowerCase().includes(query)) : posts.slice(0, 5);
    results.innerHTML = matches.length ? matches.map((p) => `<article class="story"><a href="${escape(p.url)}"><div class="story-meta"><span class="story-category">${escape(p.category)}</span><time>${escape(p.date)}</time></div><h3>${escape(p.title)}</h3><p>${escape(p.description)}</p></a></article>`).join("") : '<p class="empty-results">No matching articles.</p>';
  }
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "search") { dialog.showModal(); search(); input.focus(); }
    if (action === "close-search") dialog.close();
    if (action === "theme") { root.classList.toggle("dark"); sync(); }
    if (action === "smaller" || action === "larger") { size = Math.max(18, Math.min(26, size + (action === "larger" ? 2 : -2))); sync(); }
  });
  input.addEventListener("input", search);
  dialog.addEventListener("click", (event) => {
    const r = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
  });
  const headings = [...document.querySelectorAll(".article-body h2,.article-body h3")];
  if (headings.length > 2) {
    const toc = document.createElement("details");
    toc.className = "toc";
    toc.innerHTML = "<summary>In this piece</summary>";
    headings.forEach((heading, index) => {
      heading.id = `section-${index}`;
      const link = document.createElement("a");
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent;
      toc.append(link);
    });
    document.querySelector(".article-header").after(toc);
  }
  sync();
})();
