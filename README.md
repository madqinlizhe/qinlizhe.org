# qinlizhe.org

亲历者 Qinlizhe 的静态文章站，用来存放 Reading Notes / Mad Studies 中文资源。

## 使用

```bash
npm run build
```

生成后的网站在 `dist/`。本地预览：

```bash
cd dist
python3 -m http.server 4173
```

## 添加文章

把 Markdown 文件放在 `inbox/`，然后运行：

```bash
npm run import
npm run build
```

脚本会把文章移到 `content/posts/`。文章第一行建议使用一级标题：

```markdown
# 文章标题

作者/公众号：亲历者Qinlizhe
发布时间：2026-05-01
原文链接：https://example.com
栏目：旁门左道
```

可用栏目：

```text
嬉笑怒骂
狂人读报
旁门左道
疯言疯语
```

重新运行 `npm run build` 即可生成新的文章页。
