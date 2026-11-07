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

## 邮件通知

网站部署成功后，GitHub Actions 会使用 `BUTTONDOWN_API_KEY` 连接 Buttondown 的 `qinlizheorg`。
密钥只放在 GitHub 的 Actions secrets 中，不放在文章、代码、前端或聊天记录里。
密钥需要邮件读写、发信，以及读取 newsletter 设置的权限。

- 第一期位于 `content/newsletters/001-初次见面.md`，首次运行只创建草稿，不群发。
- 在 Buttondown 审核并发送第一期后，之后发布的新文章自动发送标题、摘要和原文链接。
- `config.json` 中的基准提交及之前已有的文章不补发。旧文章改字、改标题或重命名不会重发。
- 第一期草稿在 Buttondown 中的手动修改会保留，后续运行不会覆盖。
- 邮件以富文本导入，直接修改标题、段落和链接即可，不需要编辑 Markdown 符号。
- 不希望通知的文章，在顶部元数据中加一行 `邮件通知：不发送`。该行不会显示在正文中。
- 每次最多通知 5 篇；超出时停止，避免意外群发。不要删除 Buttondown 中的通知记录，否则会失去长期去重凭据。
- 如果邮件步骤失败，在 Actions 中重跑失败步骤即可；不需要重新发布文章。

测试：`npm run test:newsletter`。自动邮件失败不会撤销已经成功上线的网站。

## 英文精选版

英文入口为 `/en/`。正式英文稿保存在 `content/en/posts/`，`content/en/manifest.json` 维护选篇、对应中文文件、栏目、摘要和必要的背景说明。英文版是精选集，不要求每篇中文文章同步翻译。

- 页顶的 `中文 / EN` 在手机和桌面均可用。已翻译文章直接切到对应译文；未翻译文章的 EN 入口进入英文首页。
- 英文首页、关于页、全部文章和栏目页与相应中文页面互相对应。保留各自独立的搜索内容。
- `node scripts/build.mjs` 一次构建两种语言；`node scripts/english-preview.mjs` 只更新本地英文预览。
- 中文原稿指纹改变时，正式构建提示英文可能落后，但不阻止中文更新；本地英文审阅预览会要求先对照修订。
- 英文文章的加入与修改不会触发现有中文新文章邮件通知。英文页链接原来的 Buttondown 列表，不另建名单。
- `drafts/english-edition` 下的私人审阅清单不提交、不发布。本机旧译稿路径链接到正式英文文件，不是第二份稿件。

检查：`node --test scripts/english.test.mjs scripts/site.test.mjs scripts/newsletter.test.mjs`。
